import { FREE } from '../../data/constants';
import type { AiSettings } from './models';
import {
  ContentError,
  classify,
  entryName,
  isProviderError,
  parseJsonObject,
  providerMessage,
  runCompletion,
  withDeadline,
  withRetries,
} from './providers';

/**
 * Leitura de cartelas por foto. A chamada passa pela fila de modelos configurada
 * (principal e reservas, de qualquer um dos provedores) e o resultado ainda passa
 * pela validação do editor: nada é salvo sem a pessoa conferir.
 */

// ---------------------------------------------------------------- imagem

/**
 * Maior lado aceito em alta resolução pelos modelos atuais. Fotos maiores são
 * reduzidas aqui mesmo, o que também deixa o envio mais rápido no celular.
 */
export const MAX_IMAGE_SIDE = 2576;
/** A API recusa imagens acima de 5 MB; a margem cobre o aumento do base64. */
const MAX_IMAGE_BYTES = 3.6 * 1024 * 1024;

export interface PreparedImage {
  data: string;
  mediaType: 'image/jpeg';
  width: number;
  height: number;
}

/** Abre a foto (já na orientação certa), reduz se precisar e converte para JPEG em base64. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new ScanError('Não consegui abrir essa imagem. Tente uma foto em JPG ou PNG.');
    }
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ScanError('Este navegador não conseguiu preparar a foto.');
    // fundo branco: PNG com transparência viraria preto no JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    let blob: Blob | null = null;
    for (const quality of [0.9, 0.8, 0.65, 0.5]) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_IMAGE_BYTES) break;
    }
    if (!blob) throw new ScanError('Este navegador não conseguiu preparar a foto.');
    return { data: await toBase64(blob), mediaType: 'image/jpeg', width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------- leitura

export interface ScannedGame {
  name: string;
  /** 25 números em ordem de linha, 0 no espaço livre; null onde não deu para ler um número válido. */
  grid: (number | null)[];
}

export interface ScanResult {
  number: string;
  name: string;
  games: ScannedGame[];
  warnings: string[];
}

/** Erro já com a mensagem para mostrar na tela. `settings` indica que o problema é a chave ou o modelo. */
export class ScanError extends Error {
  constructor(
    message: string,
    readonly settings = false,
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

const SYSTEM_PROMPT = `Você transcreve fotos de cartelas de bingo de 75 bolas para um app que acompanha o sorteio. A pessoa vai conferir o resultado antes de salvar, mas cada número errado faz ela perder um prêmio, então leia com cuidado.

Como é uma cartela:
- Cada jogo é uma tabela de 5 colunas por 5 linhas, normalmente com o cabeçalho B I N G O.
- Faixas de cada coluna: B de 1 a 15, I de 16 a 30, N de 31 a 45, G de 46 a 60, O de 61 a 75. Use isso para conferir dígitos difíceis de ler.
- A casa do centro costuma ser o espaço livre (LIVRE, FREE, estrela, logotipo ou vazia). Nesse caso escreva 0 nela. Se houver um número impresso no centro, use o número.
- Uma mesma cartela pode ter vários jogos (por exemplo, um para cada rodada ou prêmio). Transcreva todas as tabelas que aparecem na foto, na ordem de leitura (da esquerda para a direita, de cima para baixo).

O que devolver:
- numero: o número de identificação impresso na cartela (por exemplo "Nº 01062" vira "01062"), mantendo os zeros à esquerda. Deixe vazio se não houver.
- nome: o nome de quem comprou, se estiver escrito no campo de nome. Deixe vazio se não houver.
- jogos: uma entrada por tabela, com o nome ou título impresso junto dela (prêmio, rodada, cor da tabela; vazio se não houver) e as 5 linhas de 5 números, de cima para baixo, da esquerda para a direita.
- avisos: frases curtas em português do Brasil sobre números que ficaram duvidosos (diga o jogo, a linha e a coluna) ou partes da cartela que não aparecem na foto. Lista vazia se tudo estiver legível.

Ignore marcações feitas à mão por cima dos números (círculos, riscos, carimbos) e leia o número impresso. Não invente tabelas que não estão na foto. Se a foto não for de uma cartela de bingo, devolva a lista de jogos vazia e explique em avisos.`;

/** Prazo da leitura inteira, com a fila de reservas e as repetições. */
export const SCAN_DEADLINE_MS = 3 * 60_000;
const MAX_TOKENS = 8000;

// O formato vai no fim do prompt, como texto: funciona igual nos quatro provedores,
// sem depender do modo JSON de cada um.
const FORMAT = `Responda APENAS com o objeto JSON, sem texto antes ou depois, neste formato:
{"numero": "01062", "nome": "", "jogos": [{"nome": "Bicicleta", "linhas": [[6, 19, 41, 54, 69], [14, 21, 36, 46, 71], [13, 20, 0, 56, 62], [2, 29, 31, 60, 73], [8, 30, 44, 49, 72]]}], "avisos": []}`;

/** Envia a foto pela fila de modelos e devolve os jogos lidos. */
export async function readCardPhoto(
  image: PreparedImage,
  settings: AiSettings,
  signal?: AbortSignal,
): Promise<ScanResult> {
  try {
    const raw = await withDeadline(
      withRetries(
        async () => {
          const text = await runCompletion({
            settings,
            system: `${SYSTEM_PROMPT}\n\n${FORMAT}`,
            messages: [
              {
                role: 'user',
                content: 'Transcreva a cartela desta foto.',
                images: [{ mediaType: image.mediaType, data: image.data }],
              },
            ],
            maxTokens: MAX_TOKENS,
            signal,
          });
          return parseJsonObject(text);
        },
        3,
        signal,
      ),
      SCAN_DEADLINE_MS,
    );
    return normalizeScan(raw);
  } catch (error) {
    throw describeError(error, signal);
  }
}

/** Converte a resposta da IA no formato do app, descartando tabelas que não têm 5 linhas de 5 números. */
export function normalizeScan(raw: unknown): ScanResult {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const warnings = Array.isArray(obj.avisos) ? obj.avisos.map(str).filter(Boolean) : [];
  const games: ScannedGame[] = [];
  const list = Array.isArray(obj.jogos) ? obj.jogos : [];
  list.forEach((g, index) => {
    const game = (typeof g === 'object' && g !== null ? g : {}) as Record<string, unknown>;
    const rows = Array.isArray(game.linhas) ? game.linhas : [];
    if (rows.length !== 5 || rows.some((r) => !Array.isArray(r) || r.length !== 5)) {
      warnings.push(`A tabela ${index + 1} não veio com 5 linhas de 5 números e ficou de fora.`);
      return;
    }
    const grid = (rows as unknown[][]).flat().map((v, cell) => {
      if (cell === 12 && v === FREE) return FREE;
      return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 75 ? (v as number) : null;
    });
    games.push({ name: str(game.nome), grid });
  });
  return { number: str(obj.numero).replace(/^n[º°o.]*\s*/i, ''), name: str(obj.nome), games, warnings };
}

function describeError(error: unknown, signal?: AbortSignal): ScanError {
  if (error instanceof ScanError) return error;
  if (signal?.aborted) return new ScanError('Leitura cancelada.');
  if (error instanceof ContentError) return new ScanError('Não entendi a resposta da IA. Tente de novo.');
  if (isProviderError(error)) {
    // todos os modelos falharam: o erro é o do primeiro, que diz o que houve com o principal
    const who = error.entry ? `${entryName(error.entry)}: ` : '';
    const detail = providerMessage(error);
    if (error.timeout) return new ScanError('A IA demorou demais para responder. Tente de novo.');
    switch (classify(error)) {
      case 'credential':
        return new ScanError(`A chave da API não foi aceita. ${who}${detail}`, true);
      case 'missing-model':
        return new ScanError(`Modelo não encontrado. Escolha outro nas configurações da IA. ${who}${detail}`, true);
      case 'limit':
        return new ScanError(`Limite de uso atingido em todos os modelos. Espere um pouco. ${who}${detail}`);
      default:
        return new ScanError(`A IA não conseguiu ler a foto. ${who}${detail}`);
    }
  }
  return new ScanError('Não foi possível ler a foto. Tente de novo.');
}
