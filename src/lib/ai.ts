import Anthropic from '@anthropic-ai/sdk';
import { FREE } from '../data/constants';

/**
 * Leitura de cartelas por foto com a API da Anthropic.
 *
 * O app não tem servidor: a chamada sai direto do navegador, com a chave que a
 * própria pessoa cadastrou neste aparelho. A chave fica numa entrada separada do
 * localStorage para nunca entrar no backup nem no estado sincronizado entre abas.
 */
export const AI_STORAGE_KEY = 'bingo-manager:ia';

export interface AiConfig {
  apiKey: string;
  model: string;
}

export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'Recomendado: lê com mais precisão' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', hint: 'Mais rápido e mais barato' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'O mais rápido e o mais barato' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', hint: 'O mais capaz, e o mais caro' },
] as const;

export const DEFAULT_AI_MODEL = AI_MODELS[0].id;

export function modelLabel(id: string): string {
  return AI_MODELS.find((m) => m.id === id)?.label ?? id;
}

export function loadAiConfig(): AiConfig | null {
  try {
    const raw = JSON.parse(localStorage.getItem(AI_STORAGE_KEY) ?? 'null') as Partial<AiConfig> | null;
    if (!raw || typeof raw.apiKey !== 'string' || !raw.apiKey.trim()) return null;
    const model = typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : DEFAULT_AI_MODEL;
    return { apiKey: raw.apiKey.trim(), model };
  } catch {
    return null;
  }
}

export function saveAiConfig(config: AiConfig): void {
  localStorage.setItem(AI_STORAGE_KEY, JSON.stringify({ apiKey: config.apiKey.trim(), model: config.model.trim() }));
}

export function clearAiConfig(): void {
  localStorage.removeItem(AI_STORAGE_KEY);
}

/** Mostra só o começo e o fim da chave, para a pessoa saber qual está salva. */
export function maskKey(key: string): string {
  return key.length <= 12 ? '****' : `${key.slice(0, 7)}...${key.slice(-4)}`;
}

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

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    numero: { type: 'string' },
    nome: { type: 'string' },
    jogos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          linhas: { type: 'array', items: { type: 'array', items: { type: 'integer' } } },
        },
        required: ['nome', 'linhas'],
        additionalProperties: false,
      },
    },
    avisos: { type: 'array', items: { type: 'string' } },
  },
  required: ['numero', 'nome', 'jogos', 'avisos'],
  additionalProperties: false,
} as const;

/** Modelos conhecidos aceitam o ajuste de esforço; num ID digitado à mão ele fica de fora para não dar erro. */
const KNOWN_MODELS: readonly string[] = AI_MODELS.map((m) => m.id);

/** Envia a foto e devolve os jogos lidos. Os números ainda passam pela validação do editor. */
export async function readCardPhoto(image: PreparedImage, config: AiConfig, signal?: AbortSignal): Promise<ScanResult> {
  // Sem servidor próprio, a chamada sai do navegador com a chave da própria pessoa.
  const client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create(
      {
        model: config.model,
        max_tokens: 16000,
        // Se o modelo recusar a foto por engano, o servidor tenta de novo em outro modelo.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        output_config: {
          format: { type: 'json_schema', schema: RESULT_SCHEMA },
          ...(KNOWN_MODELS.includes(config.model) ? { effort: 'medium' as const } : {}),
        },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
              { type: 'text', text: 'Transcreva a cartela desta foto.' },
            ],
          },
        ],
      },
      { signal, timeout: 3 * 60 * 1000 },
    );
  } catch (error) {
    throw describeError(error);
  }

  if (response.stop_reason === 'refusal') {
    throw new ScanError('A IA não quis ler essa foto. Tente outra foto, só da cartela.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ScanError('A resposta da IA veio incompleta. Tente uma foto com menos tabelas de cada vez.');
  }
  // Depois de um bloco "fallback" vem a resposta do modelo que assumiu; o que veio antes é descartado.
  let text = '';
  for (const block of response.content) {
    if (block.type === 'fallback') text = '';
    else if (block.type === 'text') text += block.text;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ScanError('Não entendi a resposta da IA. Tente de novo.');
  }
  return normalizeScan(raw);
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

function describeError(error: unknown): ScanError {
  if (error instanceof ScanError) return error;
  if (error instanceof Anthropic.APIUserAbortError) return new ScanError('Leitura cancelada.');
  if (error instanceof Anthropic.AuthenticationError) {
    return new ScanError('A chave da API não foi aceita. Confira a chave nas configurações da IA.', true);
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new ScanError('Esta chave não tem permissão para usar esse modelo.', true);
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ScanError('Modelo não encontrado. Escolha outro modelo nas configurações da IA.', true);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ScanError('Limite de uso da API atingido. Espere um pouco e tente de novo.');
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ScanError(`A API recusou o pedido: ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ScanError('Sem conexão com a API. Confira a internet e tente de novo.');
  }
  if (error instanceof Anthropic.APIError) {
    return new ScanError('A API da Anthropic está com problemas agora. Tente de novo em instantes.');
  }
  return new ScanError('Não foi possível ler a foto. Tente de novo.');
}
