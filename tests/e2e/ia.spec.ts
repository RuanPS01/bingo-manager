import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import { BingoApp, STORAGE_KEY } from './app';

/**
 * Leitura de cartela por foto. A API da Anthropic é simulada aqui: nenhum teste
 * chama a rede de verdade nem precisa de chave. O que o app envia (chave, modelo,
 * imagem) é conferido em cada pedido.
 */

const API = 'https://api.anthropic.com/v1/messages';
const IA_KEY = 'bingo-manager:ia';
const CHAVE = 'sk-ant-api03-chave-de-teste-123456';

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

interface Leitura {
  numero: string;
  nome: string;
  jogos: { nome: string; linhas: number[][] }[];
  avisos: string[];
}

function mensagem(leitura: Leitura | null, extra: Record<string, unknown> = {}) {
  return {
    id: 'msg_teste',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: leitura ? [{ type: 'text', text: JSON.stringify(leitura) }] : [],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1500, output_tokens: 300 },
    ...extra,
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** Responde aos pedidos à API com a função dada e guarda cada pedido recebido. */
async function simularApi(page: Page, responder: (route: Route, pedido: Request) => Promise<void> | void) {
  const pedidos: Request[] = [];
  await page.route(API, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    pedidos.push(route.request());
    await responder(route, route.request());
  });
  return pedidos;
}

const responderJson = (route: Route, status: number, corpo: unknown) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

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

function imagemDoPedido(pedido: Request) {
  const corpo = pedido.postDataJSON();
  const imagem = corpo.messages[0].content.find((b: { type: string }) => b.type === 'image');
  expect(imagem.source.media_type).toBe('image/jpeg');
  return Buffer.from(imagem.source.data, 'base64');
}

async function configurarIa(page: Page, modelo = 'claude-opus-5-5') {
  await page.addInitScript(
    ([key, value]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    [IA_KEY, JSON.stringify({ apiKey: CHAVE, model: modelo })],
  );
}

const caixaFoto = (page: Page) => page.locator('.photo-scan');

async function enviarFoto(page: Page, imagem: Buffer) {
  await caixaFoto(page)
    .locator('input[type="file"]')
    .setInputFiles({ name: 'cartela.png', mimeType: 'image/png', buffer: imagem });
}

test('lê a cartela pela foto com a chave e o modelo escolhidos, e a pessoa confere antes de salvar', async ({
  page,
}) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const linhasComErro = GRADE_2.map((l) => [...l]);
  linhasComErro[0][0] = 99; // a IA leu errado: fora de 1 a 75
  const pedidos = await simularApi(page, (route) =>
    responderJson(
      route,
      200,
      mensagem({
        numero: 'Nº 01062',
        nome: 'Bruna',
        jogos: [
          { nome: 'Bicicleta', linhas: GRADE_1 },
          { nome: 'Moto', linhas: linhasComErro },
        ],
        avisos: ['No jogo Moto, a casa da linha 1, coluna B, ficou borrada.'],
      }),
    ),
  );
  const app = new BingoApp(page);
  await app.abrirInicio();
  await expect(page.locator('.ai-status')).toContainText('Precisa de uma chave da API da Anthropic.');
  await page.locator('.add-tile').click();
  await expect(caixaFoto(page)).toContainText('Ler pela foto com IA');

  // sem configuração, a primeira foto pede a chave e o modelo
  await caixaFoto(page).getByRole('button', { name: 'Tirar ou escolher foto' }).click();
  const config = page.getByRole('dialog', { name: 'Leitura de cartelas por foto' });
  await expect(config).toContainText('Para ler a cartela pela foto, configure a chave da API e o modelo.');
  await expect(config.getByRole('radio', { name: /Claude Opus 5\.5/ })).toBeChecked();
  // Esc fecha só a janela de cima; o editor continua aberto
  await page.keyboard.press('Escape');
  await expect(config).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Adicionar cartela' })).toBeVisible();
  await caixaFoto(page).getByRole('button', { name: 'Tirar ou escolher foto' }).click();
  await config.getByRole('button', { name: 'Salvar' }).click();
  await expect(config.getByRole('alert')).toHaveText('Cole a chave da API da Anthropic.');
  await config.getByLabel('Chave da API').fill(CHAVE);
  await config.getByRole('radio', { name: /Claude Sonnet 5\.5/ }).check();

  // salvar já abre a escolha da foto
  const escolha = page.waitForEvent('filechooser');
  await config.getByRole('button', { name: 'Salvar' }).click();
  await (await escolha).setFiles({ name: 'cartela.png', mimeType: 'image/png', buffer: await foto(page, 1200, 900) });
  await expect(caixaFoto(page).getByRole('status')).toHaveText(
    'Li 2 jogo(s) da foto. Confira os números com a cartela antes de salvar.',
  );
  await expect(caixaFoto(page)).toContainText('Usando Claude Sonnet 5.5.');
  await expect(caixaFoto(page).getByRole('list', { name: 'Avisos da leitura' })).toContainText('ficou borrada');

  // o pedido: chave e modelo escolhidos, foto em JPEG, resposta em JSON e fallback ligado
  expect(pedidos).toHaveLength(1);
  const cabecalhos = await pedidos[0].allHeaders();
  expect(cabecalhos.authorization).toBe(`Bearer ${CHAVE}`);
  expect(cabecalhos['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(cabecalhos['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
  const corpo = pedidos[0].postDataJSON();
  expect(corpo).toMatchObject({ model: 'claude-sonnet-5-5', fallbacks: 'default' });
  expect(corpo.output_config.format.type).toBe('json_schema');
  expect(corpo.output_config.effort).toBe('medium');
  expect(corpo.thinking).toBeUndefined();
  expect(tamanhoJpeg(imagemDoPedido(pedidos[0]))).toEqual({ largura: 1200, altura: 900 });

  // o formulário vem preenchido, com os jogos separados e a casa duvidosa marcada
  const editor = page.getByRole('dialog', { name: 'Adicionar cartela' });
  await expect(editor.getByPlaceholder('Ex.: 0001')).toHaveValue('01062');
  await expect(editor.getByPlaceholder('Ex.: Ana')).toHaveValue('Bruna');
  await expect(editor.getByRole('textbox', { name: 'Nome do jogo 1' })).toHaveValue('Bicicleta');
  await expect(editor.getByRole('textbox', { name: 'Nome do jogo 2' })).toHaveValue('Moto');
  await expect(editor.getByLabel('Mesmos números em todos os jogos')).not.toBeChecked();
  const celulas = editor.locator('.grid-editor input');
  await expect(celulas.nth(0)).toHaveValue('6');
  await expect(celulas.nth(23)).toHaveValue('72'); // 24 campos: o centro é o espaço livre
  await editor.getByRole('tab', { name: /Moto/ }).click();
  await expect(celulas.nth(0)).toHaveValue('');
  await expect(celulas.nth(0)).toHaveClass(/has-error/);
  await expect(editor.getByRole('tab', { name: /Moto/ })).toHaveClass(/has-error/);

  // corrigido à mão, salva como qualquer cartela
  await celulas.nth(0).fill('05');
  await editor.getByRole('button', { name: 'Só salvar' }).click();
  await expect(editor).toHaveCount(0);
  const cartao = page.locator('.card-item[data-card="01062"]');
  await expect(cartao.locator('.card-name-text')).toHaveText('Bruna');
  await expect(cartao.locator('.prize-list li')).toHaveText(['1Bicicleta', '2Moto']);
  const salvo = await app.lerArmazenamento<{ cards: { games: { name: string; grid: number[] }[] }[] }>();
  expect(salvo.cards[0].games[0].grid).toEqual(GRADE_1.flat());
  expect(salvo.cards[0].games[1].grid).toEqual(GRADE_2.flat());

  // a chave fica separada: não entra nos dados do app nem no backup
  const dadosApp = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(dadosApp).not.toContain(CHAVE);
  expect(JSON.parse((await page.evaluate((key) => localStorage.getItem(key), IA_KEY))!)).toEqual({
    apiKey: CHAVE,
    model: 'claude-sonnet-5-5',
  });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar backup' }).click(),
  ]);
  expect(readFileSync(await download.path(), 'utf8')).not.toContain(CHAVE);
  await expect(page.locator('.ai-status')).toContainText('Configurada com Claude Sonnet 5.5.');
  expect(erros).toEqual([]);
});

test('erros da leitura: chave recusada, modelo inexistente, sem conexão, recusa, foto sem cartela e cancelar', async ({
  page,
}) => {
  await configurarIa(page);
  let responder: (route: Route) => Promise<void> = (route) => responderJson(route, 200, mensagem(null));
  const pedidos = await simularApi(page, (route) => responder(route));
  const app = new BingoApp(page);
  await app.abrirInicio();
  await page.locator('.add-tile').click();
  await expect(caixaFoto(page)).toContainText('Usando Claude Opus 5.5.');
  const imagem = await foto(page, 800, 600);
  const erro = caixaFoto(page).getByRole('alert');

  responder = (route) =>
    responderJson(route, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
  await enviarFoto(page, imagem);
  await expect(erro).toHaveText('A chave da API não foi aceita. Confira a chave nas configurações da IA.');
  await expect(caixaFoto(page).getByRole('button', { name: 'Configurar IA' })).toBeVisible();

  responder = (route) =>
    responderJson(route, 404, { type: 'error', error: { type: 'not_found_error', message: 'model: claude-x' } });
  await enviarFoto(page, imagem);
  await expect(erro).toHaveText('Modelo não encontrado. Escolha outro modelo nas configurações da IA.');

  responder = (route) => route.abort('internetdisconnected');
  await enviarFoto(page, imagem);
  await expect(erro).toHaveText('Sem conexão com a API. Confira a internet e tente de novo.', { timeout: 15000 });

  responder = (route) =>
    responderJson(
      route,
      200,
      mensagem(null, { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: '' } }),
    );
  await enviarFoto(page, imagem);
  await expect(erro).toHaveText('A IA não quis ler essa foto. Tente outra foto, só da cartela.');

  responder = (route) =>
    responderJson(route, 200, mensagem({ numero: '', nome: '', jogos: [], avisos: ['A foto mostra um gato.'] }));
  await enviarFoto(page, imagem);
  await expect(erro).toContainText('Não encontrei nenhuma tabela de bingo na foto.');
  await expect(caixaFoto(page).getByRole('list', { name: 'Avisos da leitura' })).toHaveText('A foto mostra um gato.');

  // cancelar no meio da leitura volta ao começo, sem mexer no formulário
  let liberar: () => void = () => undefined;
  responder = (route) =>
    new Promise<void>((resolve) => {
      liberar = () => {
        void route.abort().catch(() => undefined);
        resolve();
      };
    });
  await enviarFoto(page, imagem);
  await expect(caixaFoto(page).getByRole('status')).toContainText('Lendo a cartela...');
  await caixaFoto(page).getByRole('button', { name: 'Cancelar leitura' }).click();
  await expect(caixaFoto(page).getByRole('button', { name: /foto/ })).toBeVisible();
  await expect(erro).toHaveCount(0);
  liberar();
  await expect(page.getByRole('dialog', { name: 'Adicionar cartela' }).getByPlaceholder('Ex.: 0001')).toHaveValue('');
  expect(pedidos.length).toBeGreaterThanOrEqual(6);

  // telas da leitura legíveis no tema escuro
  await page.emulateMedia({ colorScheme: 'dark' });
  responder = (route) =>
    responderJson(
      route,
      200,
      mensagem({ numero: '7', nome: '', jogos: [{ nome: '', linhas: GRADE_1 }], avisos: ['Confira a linha 2.'] }),
    );
  await enviarFoto(page, imagem);
  await expect(caixaFoto(page).getByRole('status')).toContainText('Li 1 jogo(s)');
  await expect.poll(() => app.textosComBaixoContraste()).toEqual([]);
  await caixaFoto(page).getByRole('button', { name: 'Configurar IA' }).click();
  await expect.poll(() => app.textosComBaixoContraste()).toEqual([]);
});

test('configurar pela tela inicial: outro modelo, foto grande reduzida e remover a chave', async ({ page }) => {
  const pedidos = await simularApi(page, (route) =>
    responderJson(
      route,
      200,
      mensagem({
        numero: 'Nº 0042',
        nome: '',
        jogos: [
          { nome: 'Rodada 1', linhas: GRADE_1 },
          { nome: 'Rodada 2', linhas: GRADE_1 },
        ],
        avisos: [],
      }),
    ),
  );
  const app = new BingoApp(page);
  await app.abrirInicio();
  await page.locator('.ai-status').getByRole('button', { name: 'Configurar' }).click();
  const config = page.getByRole('dialog', { name: 'Leitura de cartelas por foto' });
  await config.getByLabel('Chave da API').fill(CHAVE);
  await config.getByRole('radio', { name: /Outro modelo/ }).check();
  await config.getByRole('button', { name: 'Salvar' }).click();
  await expect(config.getByRole('alert')).toHaveText('Digite o ID do modelo.');
  await config.getByRole('textbox', { name: 'ID do modelo' }).fill('claude-opus-4-8');
  await config.getByRole('button', { name: 'Salvar' }).click();
  await expect(config).toHaveCount(0);
  await expect(page.locator('.ai-status')).toContainText('Configurada com claude-opus-4-8.');

  // reabrir mostra a chave salva mascarada; salvar com o campo vazio mantém a chave
  await page.locator('.ai-status').getByRole('button', { name: 'Alterar' }).click();
  await expect(config.getByLabel('Chave da API')).toHaveAttribute('placeholder', 'Salva: sk-ant-...3456');
  await expect(config.getByRole('textbox', { name: 'ID do modelo' })).toHaveValue('claude-opus-4-8');
  await config.getByRole('button', { name: 'Salvar' }).click();

  // foto maior que o limite é reduzida antes do envio; modelo digitado vai sem ajuste de esforço
  await page.locator('.add-tile').click();
  await enviarFoto(page, await foto(page, 5000, 3000));
  await expect(caixaFoto(page).getByRole('status')).toContainText('Li 2 jogo(s)');
  const corpo = pedidos[0].postDataJSON();
  expect(corpo.model).toBe('claude-opus-4-8');
  expect(corpo.output_config.effort).toBeUndefined();
  expect((await pedidos[0].allHeaders()).authorization).toBe(`Bearer ${CHAVE}`);
  expect(tamanhoJpeg(imagemDoPedido(pedidos[0]))).toEqual({ largura: 2576, altura: 1546 });

  // jogos com os mesmos números ficam com a opção marcada
  const editor = page.getByRole('dialog', { name: 'Adicionar cartela' });
  await expect(editor.getByPlaceholder('Ex.: 0001')).toHaveValue('0042');
  await expect(editor.getByLabel('Mesmos números em todos os jogos')).toBeChecked();
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await page.locator('.ai-status').getByRole('button', { name: 'Alterar' }).click();
  await config.getByRole('button', { name: 'Remover chave' }).click();
  await expect(page.locator('.ai-status')).toContainText('Precisa de uma chave da API da Anthropic.');
  expect(await page.evaluate((key) => localStorage.getItem(key), IA_KEY)).toBeNull();
});
