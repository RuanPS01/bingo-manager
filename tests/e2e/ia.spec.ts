import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { BingoApp, STORAGE_KEY } from './app';

/**
 * Leitura de cartela por foto com a fila de modelos (principal e reservas) dos
 * quatro provedores. Todos são simulados aqui: nenhum teste chama a rede de
 * verdade nem precisa de chave. O que o app envia a cada provedor (chave,
 * modelo, imagem, formato) é conferido nos pedidos.
 */

const IA_KEY = 'bingo-manager:ia';
const CHAVES = {
  claude: 'sk-ant-api03-chave-claude-123456',
  openai: 'sk-proj-chave-openai-654321',
  gemini: 'AIzaChaveGemini-abcdef',
};

// prettier-ignore
const GRADE_1 = [
  [6, 19, 41, 54, 69],
  [14, 21, 36, 46, 71],
  [13, 20, 0, 56, 62],
  [2, 29, 31, 60, 73],
  [8, 30, 44, 49, 72],
];
// prettier-ignore
const GRADE_2 = [
  [5, 24, 35, 52, 75],
  [6, 25, 38, 47, 72],
  [3, 28, 0, 60, 73],
  [8, 26, 43, 53, 66],
  [14, 27, 44, 57, 67],
];

const leitura = (jogos: { nome: string; linhas: number[][] }[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ numero: '0042', nome: '', jogos, avisos: [], ...extra });

type Provedor = 'claude' | 'openai' | 'gemini' | 'ollama';

interface Pedido {
  provedor: Provedor;
  url: string;
  cabecalhos: Record<string, string>;
  corpo: Record<string, unknown>;
}

/** Resposta de uma chamada: texto do modelo, erro HTTP, queda de conexão ou espera infinita. */
type Resposta =
  | { texto: string }
  | { status: number; corpo: unknown; cabecalhos?: Record<string, string> }
  | 'cair'
  | 'travar';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-expose-headers': 'retry-after',
};

function sucesso(provedor: Provedor, texto: string): unknown {
  if (provedor === 'claude') {
    return {
      id: 'msg_teste',
      type: 'message',
      role: 'assistant',
      model: 'claude',
      content: [{ type: 'text', text: texto }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    };
  }
  if (provedor === 'openai') {
    return {
      id: 'c',
      object: 'chat.completion',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: texto } }],
    };
  }
  if (provedor === 'gemini')
    return { candidates: [{ content: { role: 'model', parts: [{ text: texto }] }, finishReason: 'STOP' }] };
  return { model: 'gemma3', message: { role: 'assistant', content: texto }, done: true };
}

const LISTAS: Record<Provedor, unknown> = {
  claude: {
    data: [
      { type: 'model', id: 'claude-teste-9', display_name: 'Claude Teste 9', created_at: '2026-10-01T00:00:00Z' },
      { type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-08-01T00:00:00Z' },
    ],
    has_more: false,
    first_id: 'claude-teste-9',
    last_id: 'claude-opus-5-5',
  },
  openai: {
    data: [
      { id: 'gpt-antigo', created: 1 },
      { id: 'text-embedding-9', created: 9 },
      { id: 'gpt-9-teste', created: 5 },
      { id: 'dall-e-9', created: 8 },
    ],
  },
  gemini: {
    models: [
      { name: 'models/gemini-9-flash', displayName: 'Gemini 9 Flash', supportedGenerationMethods: ['generateContent'] },
      {
        name: 'models/gemini-9-flash-lite',
        displayName: 'Gemini 9 Flash Lite',
        supportedGenerationMethods: ['generateContent', 'countTokens'],
      },
      { name: 'models/gemini-embedding-9', displayName: 'Embedding 9', supportedGenerationMethods: ['embedContent'] },
    ],
  },
  ollama: { models: [{ name: 'gemma3:latest' }, { name: 'llava:13b' }] },
};

/** Os quatro provedores simulados. Cada um responde às chamadas pela função configurada. */
class Provedores {
  pedidos: Pedido[] = [];
  responder: Record<Provedor, (p: Pedido) => Resposta> = {
    claude: () => ({ texto: leitura([{ nome: 'Rodada 1', linhas: GRADE_1 }]) }),
    openai: () => ({ texto: leitura([{ nome: 'Rodada 1', linhas: GRADE_1 }]) }),
    gemini: () => ({ texto: leitura([{ nome: 'Rodada 1', linhas: GRADE_1 }]) }),
    ollama: () => ({ texto: leitura([{ nome: 'Rodada 1', linhas: GRADE_1 }]) }),
  };
  private travados: Route[] = [];

  chamadas(provedor?: Provedor) {
    return this.pedidos.filter((p) => !provedor || p.provedor === provedor);
  }

  liberar() {
    for (const r of this.travados) void r.abort().catch(() => undefined);
    this.travados = [];
  }

  async ligar(page: Page) {
    const rotas: [string, Provedor][] = [
      ['https://api.anthropic.com/v1/**', 'claude'],
      ['https://api.openai.com/v1/**', 'openai'],
      ['https://generativelanguage.googleapis.com/v1beta/**', 'gemini'],
      ['http://localhost:11434/api/**', 'ollama'],
    ];
    for (const [url, provedor] of rotas) {
      await page.route(url, (route) => this.atender(route, provedor));
    }
  }

  private async atender(route: Route, provedor: Provedor) {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const json = (status: number, corpo: unknown, extra: Record<string, string> = {}) =>
      route.fulfill({
        status,
        headers: { ...CORS, 'content-type': 'application/json', ...extra },
        body: JSON.stringify(corpo),
      });
    // listagem de modelos
    if (req.method() === 'GET') return json(200, LISTAS[provedor]);
    const pedido: Pedido = { provedor, url: req.url(), cabecalhos: await req.allHeaders(), corpo: req.postDataJSON() };
    this.pedidos.push(pedido);
    const r = this.responder[provedor](pedido);
    if (r === 'cair') return route.abort('internetdisconnected');
    if (r === 'travar') {
      this.travados.push(route);
      return;
    }
    if ('texto' in r) return json(200, sucesso(provedor, r.texto));
    return json(r.status, r.corpo, r.cabecalhos);
  }
}

/** Uma "foto" gerada no navegador, do tamanho pedido. */
async function foto(page: Page, largura: number, altura: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1d4fa8';
      ctx.font = `${Math.round(h / 8)}px sans-serif`;
      ctx.fillText('B I N G O', w / 10, h / 4);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    [largura, altura],
  );
  return Buffer.from(base64, 'base64');
}

/** Largura e altura de um JPEG, lidas do cabeçalho do arquivo. */
function tamanhoJpeg(jpeg: Buffer) {
  expect(jpeg.subarray(0, 2).toString('hex')).toBe('ffd8');
  for (let i = 2; i < jpeg.length; ) {
    const marcador = jpeg[i + 1];
    const tamanho = jpeg.readUInt16BE(i + 2);
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { largura: jpeg.readUInt16BE(i + 7), altura: jpeg.readUInt16BE(i + 5) };
    }
    i += 2 + tamanho;
  }
  throw new Error('JPEG sem tamanho');
}

async function configurarIa(page: Page, entries: Record<string, string>[]) {
  await page.addInitScript(
    ([key, value]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    [IA_KEY, JSON.stringify({ v: 2, entries })],
  );
}

const caixaFoto = (page: Page) => page.locator('.photo-scan');
const janelaIa = (page: Page) => page.getByRole('dialog', { name: 'Leitura de cartelas por foto' });
const cartao = (janela: Locator, n: number) => janela.locator('.ai-chain-item').nth(n - 1);

async function enviarFoto(page: Page, imagem: Buffer) {
  await caixaFoto(page)
    .locator('input[type="file"]')
    .setInputFiles({ name: 'cartela.png', mimeType: 'image/png', buffer: imagem });
}

test('configura a fila de modelos (quatro provedores, lista ao vivo, chave herdada) e lê a cartela', async ({
  page,
}) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const provedores = new Provedores();
  await provedores.ligar(page);
  const linhasComErro = GRADE_2.map((l) => [...l]);
  linhasComErro[0][0] = 99; // a IA leu errado: fora de 1 a 75
  provedores.responder.gemini = () => ({
    texto: `Aqui está:\n\`\`\`json\n${leitura(
      [
        { nome: 'Bicicleta', linhas: GRADE_1 },
        { nome: 'Moto', linhas: linhasComErro },
      ],
      { numero: 'Nº 01062', nome: 'Bruna', avisos: ['No jogo Moto, a casa da linha 1, coluna B, ficou borrada.'] },
    )}\n\`\`\``,
  });
  const app = new BingoApp(page);
  await app.abrirInicio();
  await expect(page.locator('.ai-status')).toContainText('Precisa de uma chave de API (Claude, OpenAI ou Gemini)');

  // sem configuração, a primeira foto abre a configuração
  await page.locator('.add-tile').click();
  await caixaFoto(page).getByRole('button', { name: 'Tirar ou escolher foto' }).click();
  const janela = janelaIa(page);
  await expect(janela).toContainText('configure o provedor, o modelo e a chave da API');
  await expect(janela.getByRole('heading', { name: 'Provedor e credenciais' })).toBeVisible();
  const m1 = cartao(janela, 1);
  await expect(m1).toContainText('Modelo principal');
  await expect(m1.getByLabel('Provedor do modelo 1')).toHaveValue('claude');
  await expect(m1.getByLabel('Provedor do modelo 1').locator('option')).toHaveText([
    'Claude (Anthropic)',
    'OpenAI',
    'Gemini (Google)',
    'Ollama (local)',
  ]);
  // sem chave, o catálogo do app; com a chave, a lista vem do provedor
  await expect(m1.locator('[data-live]')).toHaveText('Lista do catálogo do app. Com a chave, a lista vem do provedor.');
  await m1.getByLabel('Chave de API do modelo 1').fill(CHAVES.claude);
  await expect(m1.locator('[data-live]')).toHaveText('Lista consultada agora no provedor.');
  await expect(m1.getByLabel('Modelo 1', { exact: true }).locator('option', { hasText: 'Claude Teste 9' })).toHaveCount(
    1,
  );

  // trocar o provedor zera modelo e chave
  await m1.getByLabel('Provedor do modelo 1').selectOption('gemini');
  await expect(m1.getByLabel('Chave de API do modelo 1')).toHaveValue('');
  await m1.getByLabel('Chave de API do modelo 1').fill(CHAVES.gemini);
  await expect(m1.locator('[data-live]')).toHaveText('Lista consultada agora no provedor.');
  const opcoesGemini = m1.getByLabel('Modelo 1', { exact: true }).locator('option');
  await expect(opcoesGemini).toHaveText([
    'Nome customizado',
    /^Padrão do provedor/,
    'Gemini 9 Flash',
    'Gemini 9 Flash Lite',
  ]);
  await m1.getByLabel('Modelo 1', { exact: true }).selectOption('gemini-9-flash');

  // reserva do mesmo provedor herda a chave
  await janela.getByRole('button', { name: 'Adicionar modelo de reserva' }).click();
  const m2 = cartao(janela, 2);
  await expect(m2).toContainText('Modelo 2 (reserva)');
  await expect(m2.getByLabel('Provedor do modelo 2')).toHaveValue('gemini');
  await expect(m2.locator('.ai-inherited')).toContainText('Chave já preenchida no modelo 1');
  await expect(m2.locator('[data-live]')).toHaveText('Lista consultada agora no provedor.');
  await m2.getByLabel('Modelo 2', { exact: true }).selectOption('gemini-9-flash-lite');
  await m2.getByRole('button', { name: 'Usar outra chave' }).click();
  await expect(m2.getByLabel('Chave de API do modelo 2')).toBeVisible();
  await m2.getByRole('button', { name: 'Usar a chave do modelo 1' }).click();
  await expect(m2.locator('.ai-inherited')).toBeVisible();

  // OpenAI: só modelos de conversa, do mais novo para o mais antigo
  await janela.getByRole('button', { name: 'Adicionar modelo de reserva' }).click();
  const m3 = cartao(janela, 3);
  await m3.getByLabel('Provedor do modelo 3').selectOption('openai');
  await m3.getByLabel('Chave de API do modelo 3').fill(CHAVES.openai);
  await expect(m3.locator('[data-live]')).toHaveText('Lista consultada agora no provedor.');
  await expect(m3.getByLabel('Modelo 3', { exact: true }).locator('option')).toHaveText([
    'Nome customizado',
    /^Padrão do provedor/,
    'gpt-9-teste',
    'gpt-antigo',
  ]);
  await m3.getByLabel('Modelo 3', { exact: true }).selectOption('Nome customizado');
  await janela.getByRole('button', { name: 'Salvar' }).click();
  await expect(janela.getByRole('alert')).toHaveText('Digite o nome do modelo 3.');
  await m3.getByLabel('Nome do modelo 3').fill('gpt-meu-modelo');

  // Ollama: endereço em vez de chave, lista do servidor local
  await janela.getByRole('button', { name: 'Adicionar modelo de reserva' }).click();
  const m4 = cartao(janela, 4);
  await m4.getByLabel('Provedor do modelo 4').selectOption('ollama');
  await expect(m4.getByLabel('Endereço do Ollama do modelo 4')).toHaveAttribute(
    'placeholder',
    'http://localhost:11434',
  );
  await expect(m4.locator('[data-live]')).toHaveText('Lista consultada agora no provedor.');
  await m4.getByLabel('Modelo 4', { exact: true }).selectOption('gemma3:latest');

  // a quinta (sem nada) é removida; no máximo 6 modelos
  await janela.getByRole('button', { name: 'Adicionar modelo de reserva' }).click();
  await janela.getByRole('button', { name: 'Remover o modelo 5' }).click();
  await expect(janela.locator('.ai-chain-item')).toHaveCount(4);

  // testar mostra o resultado de cada modelo
  provedores.responder.ollama = () => ({ status: 404, corpo: { error: "model 'gemma3:latest' not found" } });
  provedores.responder.openai = () => ({ texto: 'ok' });
  provedores.responder.gemini = () => ({ texto: 'ok' });
  await janela.getByRole('button', { name: 'Testar modelos' }).click();
  await expect(m1.locator('.ai-test')).toHaveText('Funcionou.');
  await expect(m3.locator('.ai-test')).toHaveText('Funcionou.');
  await expect(m4.locator('.ai-test')).toHaveText("Falhou: model 'gemma3:latest' not found");
  provedores.pedidos = [];
  provedores.responder.gemini = () => ({
    texto: leitura(
      [
        { nome: 'Bicicleta', linhas: GRADE_1 },
        { nome: 'Moto', linhas: linhasComErro },
      ],
      { numero: 'Nº 01062', nome: 'Bruna', avisos: ['No jogo Moto, a casa da linha 1, coluna B, ficou borrada.'] },
    ),
  });

  // salvar já abre a escolha da foto, e a leitura vai pelo modelo principal
  const escolha = page.waitForEvent('filechooser');
  await janela.getByRole('button', { name: 'Salvar' }).click();
  await (await escolha).setFiles({ name: 'cartela.png', mimeType: 'image/png', buffer: await foto(page, 1200, 900) });
  await expect(caixaFoto(page).getByRole('status')).toHaveText(
    'Li 2 jogo(s) da foto. Confira os números com a cartela antes de salvar.',
  );
  await expect(caixaFoto(page)).toContainText('Usando gemini-9-flash e 3 reservas.');
  expect(provedores.chamadas().map((p) => p.provedor)).toEqual(['gemini']);
  const [pedido] = provedores.chamadas('gemini');
  expect(pedido.url).toContain('/models/gemini-9-flash:generateContent');
  expect(pedido.url).not.toContain(CHAVES.gemini);
  expect(pedido.cabecalhos['x-goog-api-key']).toBe(CHAVES.gemini);
  const corpo = pedido.corpo as {
    systemInstruction: { parts: { text: string }[] };
    contents: { role: string; parts: { inlineData?: { mimeType: string; data: string }; text?: string }[] }[];
    generationConfig: { maxOutputTokens: number };
  };
  expect(corpo.systemInstruction.parts[0].text).toContain('Responda APENAS com o objeto JSON');
  expect(corpo.contents[0].role).toBe('user');
  expect(corpo.contents[0].parts[0].inlineData!.mimeType).toBe('image/jpeg');
  expect(tamanhoJpeg(Buffer.from(corpo.contents[0].parts[0].inlineData!.data, 'base64'))).toEqual({
    largura: 1200,
    altura: 900,
  });
  expect(corpo.generationConfig.maxOutputTokens).toBeGreaterThan(0);

  // o formulário vem preenchido e marca a casa duvidosa
  const editor = page.getByRole('dialog', { name: 'Adicionar cartela' });
  await expect(editor.getByPlaceholder('Ex.: 0001')).toHaveValue('01062');
  await expect(editor.getByPlaceholder('Ex.: Ana')).toHaveValue('Bruna');
  await expect(editor.getByRole('textbox', { name: 'Nome do jogo 2' })).toHaveValue('Moto');
  await expect(caixaFoto(page).getByRole('list', { name: 'Avisos da leitura' })).toContainText('ficou borrada');
  await editor.getByRole('tab', { name: /Moto/ }).click();
  const celulas = editor.locator('.grid-editor input');
  await expect(celulas.nth(0)).toHaveValue('');
  await expect(celulas.nth(0)).toHaveClass(/has-error/);
  await celulas.nth(0).fill('05');

  // Esc fecha só a configuração aberta por cima do editor
  await caixaFoto(page).getByRole('button', { name: 'Configurar IA' }).click();
  await page.keyboard.press('Escape');
  await expect(janela).toHaveCount(0);
  await editor.getByRole('button', { name: 'Só salvar' }).click();
  await expect(page.locator('.card-item[data-card="01062"] .prize-list li')).toHaveText(['1Bicicleta', '2Moto']);

  // o que ficou salvo: reservas herdando a chave guardam a chave vazia; nada disso entra nos dados do app
  const salvo = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), IA_KEY))!);
  expect(salvo).toEqual({
    v: 2,
    entries: [
      { provider: 'gemini', model: 'gemini-9-flash', apiKey: CHAVES.gemini, baseUrl: '' },
      { provider: 'gemini', model: 'gemini-9-flash-lite', apiKey: '', baseUrl: '' },
      { provider: 'openai', model: 'gpt-meu-modelo', apiKey: CHAVES.openai, baseUrl: '' },
      { provider: 'ollama', model: 'gemma3:latest', apiKey: '', baseUrl: '' },
    ],
  });
  const dadosApp = (await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY))!;
  for (const chave of Object.values(CHAVES)) expect(dadosApp).not.toContain(chave);
  await expect(page.locator('.ai-status')).toContainText('Configurada com gemini-9-flash e 3 reservas.');
  expect(erros).toEqual([]);
});

test('a reserva assume quando o principal falha, e o principal sai da frente por alguns minutos', async ({ page }) => {
  const provedores = new Provedores();
  await provedores.ligar(page);
  await configurarIa(page, [
    { provider: 'claude', model: 'claude-opus-5-5', apiKey: CHAVES.claude, baseUrl: '' },
    { provider: 'gemini', model: 'gemini-9-flash', apiKey: CHAVES.gemini, baseUrl: '' },
    { provider: 'openai', model: 'gpt-9-teste', apiKey: CHAVES.openai, baseUrl: '' },
  ]);
  provedores.responder.claude = () => ({
    status: 429,
    corpo: { type: 'error', error: { type: 'rate_limit_error', message: 'Número de pedidos acima do limite.' } },
    cabecalhos: { 'retry-after': '120' },
  });
  provedores.responder.gemini = () => ({
    status: 400,
    corpo: {
      error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' },
    },
  });
  const app = new BingoApp(page);
  await app.abrirInicio();
  await page.locator('.add-tile').click();
  await enviarFoto(page, await foto(page, 5000, 3000));
  await expect(caixaFoto(page).getByRole('status')).toContainText('Li 1 jogo(s)');
  expect(provedores.chamadas().map((p) => p.provedor)).toEqual(['claude', 'gemini', 'openai']);

  // o que cada provedor recebeu: chave no cabeçalho certo e a foto reduzida para 2576 px
  const claude = provedores.chamadas('claude')[0];
  expect(claude.cabecalhos.authorization).toBe(`Bearer ${CHAVES.claude}`);
  expect(claude.cabecalhos['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(claude.cabecalhos['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
  expect(claude.corpo).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default' });
  const openai = provedores.chamadas('openai')[0];
  expect(openai.cabecalhos.authorization).toBe(`Bearer ${CHAVES.openai}`);
  const mensagens = openai.corpo.messages as { role: string; content: unknown }[];
  expect(mensagens[0].role).toBe('system');
  expect(openai.corpo.max_completion_tokens).toBeGreaterThan(0);
  expect(openai.corpo.max_tokens).toBeUndefined();
  const partes = mensagens[1].content as { type: string; image_url?: { url: string } }[];
  const url = partes.find((p) => p.type === 'image_url')!.image_url!.url;
  expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
  expect(tamanhoJpeg(Buffer.from(url.split(',')[1], 'base64'))).toEqual({ largura: 2576, altura: 1546 });

  // a próxima leitura já começa pelo modelo que funcionou
  provedores.pedidos = [];
  await expect(caixaFoto(page).getByRole('button', { name: 'Ler outra foto' })).toBeVisible();
  await enviarFoto(page, await foto(page, 800, 600));
  await expect(caixaFoto(page).getByRole('status')).toContainText('Li 1 jogo(s)');
  expect(provedores.chamadas().map((p) => p.provedor)).toEqual(['openai']);

  // a configuração mostra por que cada um saiu da frente, com a frase do provedor
  await caixaFoto(page).getByRole('button', { name: 'Configurar IA' }).click();
  const janela = janelaIa(page);
  await expect(cartao(janela, 1).locator('.ai-health')).toHaveText(
    'Fora da frente por alguns minutos (limite de uso ou ocupado): Número de pedidos acima do limite.',
  );
  await expect(cartao(janela, 2).locator('.ai-health')).toHaveText(
    'Fora da frente por alguns minutos (chave recusada): API key not valid. Please pass a valid API key.',
  );
  await expect(cartao(janela, 3).locator('.ai-health')).toHaveCount(0);
});

test('erros: JSON malformado é pedido de novo, todos falhando mostra o do principal, e cancelar', async ({ page }) => {
  const provedores = new Provedores();
  await provedores.ligar(page);
  await configurarIa(page, [
    { provider: 'ollama', model: 'gemma3', apiKey: '', baseUrl: '' },
    { provider: 'claude', model: 'claude-opus-5-5', apiKey: CHAVES.claude, baseUrl: '' },
  ]);
  let tentativas = 0;
  provedores.responder.ollama = () => {
    tentativas++;
    return { texto: tentativas === 1 ? 'Não achei o formato, desculpe.' : leitura([{ nome: '', linhas: GRADE_2 }]) };
  };
  const app = new BingoApp(page);
  await app.abrirInicio();
  await page.locator('.add-tile').click();
  await expect(caixaFoto(page)).toContainText('Usando gemma3 e 1 reserva.');
  const imagem = await foto(page, 800, 600);
  await enviarFoto(page, imagem);
  await expect(caixaFoto(page).getByRole('status')).toContainText('Li 1 jogo(s)');
  // a resposta fora do formato foi pedida de novo ao mesmo modelo; a reserva nem foi chamada
  expect(provedores.chamadas().map((p) => p.provedor)).toEqual(['ollama', 'ollama']);
  const ollama = provedores.chamadas('ollama')[0];
  expect(ollama.url).toBe('http://localhost:11434/api/chat');
  const msgs = ollama.corpo.messages as { role: string; images?: string[] }[];
  expect(msgs[0].role).toBe('system');
  expect(msgs[1].images).toHaveLength(1);
  expect(ollama.corpo.stream).toBe(false);

  // todos falhando: a mensagem é a do modelo principal, com a frase do provedor
  provedores.pedidos = [];
  provedores.responder.ollama = () => ({
    status: 404,
    corpo: { error: "model 'gemma3' not found, try pulling it first" },
  });
  provedores.responder.claude = () => ({
    status: 401,
    corpo: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
  });
  await enviarFoto(page, imagem);
  const erro = caixaFoto(page).getByRole('alert');
  await expect(erro).toHaveText(
    "Modelo não encontrado. Escolha outro nas configurações da IA. Modelo principal (gemma3): model 'gemma3' not found, try pulling it first",
  );
  expect(provedores.chamadas().map((p) => p.provedor)).toEqual(['ollama', 'claude']);

  // sem conexão em nenhum
  provedores.responder.ollama = () => 'cair';
  provedores.responder.claude = () => 'cair';
  await enviarFoto(page, imagem);
  await expect(erro).toContainText('A IA não conseguiu ler a foto.', { timeout: 15000 });

  // cancelar no meio não passa para a reserva
  provedores.pedidos = [];
  provedores.responder.claude = () => 'travar';
  provedores.responder.ollama = () => 'travar';
  await enviarFoto(page, imagem);
  await expect(caixaFoto(page).getByRole('status')).toContainText('Lendo a cartela...');
  await caixaFoto(page).getByRole('button', { name: 'Cancelar leitura' }).click();
  await expect(caixaFoto(page).getByRole('button', { name: /foto/ })).toBeVisible();
  await expect(erro).toHaveCount(0);
  provedores.liberar();
  expect(provedores.chamadas().length).toBe(1);
});

test('configuração da primeira versão é migrada, fica fora do backup e pode ser removida', async ({ page }) => {
  const provedores = new Provedores();
  await provedores.ligar(page);
  await page.addInitScript(
    ([key, value]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    [IA_KEY, JSON.stringify({ apiKey: CHAVES.claude, model: 'claude-sonnet-5-5' })],
  );
  const app = new BingoApp(page);
  await app.abrirInicio();
  await expect(page.locator('.ai-status')).toContainText('Configurada com Claude Sonnet 5.5.');
  await page.locator('.ai-status').getByRole('button', { name: 'Alterar' }).click();
  const janela = janelaIa(page);
  const m1 = cartao(janela, 1);
  await expect(m1.getByLabel('Provedor do modelo 1')).toHaveValue('claude');
  await expect(m1.getByLabel('Chave de API do modelo 1')).toHaveValue(CHAVES.claude);
  await expect(m1.getByLabel('Chave de API do modelo 1')).toHaveAttribute('type', 'password');
  await expect(m1.getByLabel('Modelo 1', { exact: true })).toHaveValue('claude-sonnet-5-5');

  // legível no tema escuro
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => app.textosComBaixoContraste()).toEqual([]);
  await page.emulateMedia({ colorScheme: 'light' });
  await janela.getByRole('button', { name: 'Cancelar' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar backup' }).click(),
  ]);
  expect(readFileSync(await download.path(), 'utf8')).not.toContain(CHAVES.claude);

  await page.locator('.ai-status').getByRole('button', { name: 'Alterar' }).click();
  await janela.getByRole('button', { name: 'Remover configuração' }).click();
  await expect(page.locator('.ai-status')).toContainText('Precisa de uma chave de API');
  expect(await page.evaluate((k) => localStorage.getItem(k), IA_KEY)).toBeNull();
});
