import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, test, type Download, type Page } from '@playwright/test';
import { BingoApp, cadastrarCartelas } from './app';
import { bola } from './oracle';

/**
 * Telas novas: começo sem cartelas, sorteador (com modo telão) e gerador de
 * cartelas em PDF. Os arquivos baixados são abertos e conferidos aqui mesmo.
 */

// ---------------------------------------------------------------- sorteador

const sorteador = (page: Page) => page.getByTestId('sorteador');
const botaoSortear = (page: Page) => sorteador(page).getByRole('button', { name: 'Sortear', exact: true });
const contagem = (page: Page) => sorteador(page).locator('.drawer-count');

async function abrirSorteador(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /^Sorteador/ }).click();
  await expect(page).toHaveURL(/#\/sorteador$/);
  await expect(sorteador(page)).toBeVisible();
}

/** Abre o painel de configurações (se ainda estiver fechado) e devolve o painel. */
async function configuracoes(page: Page) {
  const botao = page.getByRole('button', { name: 'Configurações do sorteio' });
  if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click();
  return page.locator('section.drawer-settings');
}

async function semAnimacao(page: Page) {
  const painel = await configuracoes(page);
  await painel.getByRole('group', { name: 'Animação' }).getByRole('button', { name: 'Sem animação' }).click();
}

/** Bolas marcadas no painel, em ordem numérica. */
const marcadasNoPainel = (page: Page) =>
  page
    .locator('.drawer-board .drawer-cell.is-drawn')
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.ball)));

/** Sorteia uma bola e devolve o número que apareceu. */
async function sortear(page: Page, como: 'botao' | 'espaco' | 'enter' = 'botao'): Promise<number> {
  const antes = (await marcadasNoPainel(page)).length;
  if (como === 'botao') await botaoSortear(page).click();
  else await page.keyboard.press(como === 'espaco' ? 'Space' : 'Enter');
  await expect.poll(async () => (await marcadasNoPainel(page)).length).toBe(antes + 1);
  const bolaAtual = sorteador(page).locator('.drawer-ball');
  await expect(bolaAtual).toHaveAttribute('data-state', 'shown');
  return Number(await bolaAtual.getAttribute('data-ball'));
}

test('começa sem cartelas e cadastra a primeira pela tela de nova partida', async ({ page }) => {
  const app = new BingoApp(page);
  await app.abrirInicio();
  await expect(page.locator('.hero h1')).toHaveText('Bingo Manager');
  await expect(page).toHaveTitle('Bingo Manager');
  await expect(page.locator('.card-item')).toHaveCount(0);
  await expect(page.getByText('Nenhuma cartela cadastrada.', { exact: false })).toBeVisible();
  await expect(page.locator('.panel-head', { hasText: 'Minhas cartelas' })).toContainText('0 cartela(s)');
  await expect(page.locator('.start-card')).toContainText('Cadastre suas cartelas');

  await page.locator('.start-card').getByRole('button', { name: 'Iniciar jogo' }).click();
  await expect(page.getByText('Nenhuma cartela cadastrada ainda.', { exact: false })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Atalho por jogo' })).toHaveCount(0);
  await page.locator('.setup').getByRole('button', { name: 'Adicionar cartela', exact: true }).click();
  await app.modal.getByPlaceholder('Ex.: Ana').fill('Ana');
  await app.modal.getByRole('textbox', { name: 'Nome do jogo 1' }).fill('Rodada 1');
  await app.modal
    .getByRole('textbox', { name: 'Digitar todos os números de uma vez' })
    .fill('1 16 31 46 61 2 17 32 47 62 3 18 48 63 4 19 33 49 64 5 20 34 50 65');
  await app.modal.getByRole('button', { name: 'Preencher' }).click();
  await app.modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(app.modal).toHaveCount(0);

  // o atalho por jogo aparece com o nome do jogo cadastrado
  const atalho = page.getByRole('group', { name: 'Atalho por jogo' }).locator('.round-btn');
  await expect(atalho).toHaveCount(1);
  await expect(atalho).toContainText('1 cartela(s)');
  await expect(atalho).toContainText('Rodada 1');
  await atalho.click();
  await expect(page.locator('.setup .chip-toggle[aria-pressed="true"]')).toHaveCount(1);
  await app.escolherModo('quina');
  await page.locator('.action-bar').getByRole('button', { name: 'Iniciar jogo' }).click();
  await expect(page.locator('.match-title strong')).toHaveText('Rodada 1');
  await app.digitar('3', 'enter');
  await expect(app.feedback).toHaveText(`${bola(3)} marcado em 1 jogo(s): Ana.`);
});

test('sorteador: sorteia sem repetir, desfaz, reinicia e guarda o sorteio', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await abrirSorteador(page);
  await expect(contagem(page)).toHaveText('75 bolas no globo.');
  await expect(sorteador(page).locator('.drawer-ball')).toHaveAttribute('data-state', 'idle');
  await expect(sorteador(page).locator('.drawer-cell')).toHaveCount(75);

  // com a animação do globo os números rodam antes de parar na bola sorteada
  const painel = await configuracoes(page);
  await painel.getByRole('group', { name: 'Duração da animação' }).getByRole('button', { name: 'Rápida' }).click();
  await botaoSortear(page).click();
  await expect(sorteador(page).locator('.drawer-ball')).toHaveAttribute('data-state', 'rolling');
  await expect(sorteador(page).getByRole('button', { name: 'Sorteando...' })).toBeDisabled();
  await expect(sorteador(page).locator('.drawer-ball')).toHaveAttribute('data-state', 'shown');
  const primeira = Number(await sorteador(page).locator('.drawer-ball').getAttribute('data-ball'));
  await expect(sorteador(page).locator('.drawer-ball-letter')).toHaveText(bola(primeira).slice(0, 1));
  await expect(sorteador(page).locator('.drawer-ball-number')).toHaveText(String(primeira));

  // sem animação, pelo botão e pelo teclado (Espaço e Enter)
  await semAnimacao(page);
  await configuracoes(page).then((p) => p.getByRole('heading', { name: 'Configurações' }).click());
  const bolas = [primeira];
  for (let i = 0; i < 11; i++) bolas.push(await sortear(page, (['botao', 'espaco', 'enter'] as const)[i % 3]));
  expect(new Set(bolas).size).toBe(12);
  for (const n of bolas) expect(n >= 1 && n <= 75).toBe(true);
  expect(await marcadasNoPainel(page)).toEqual([...bolas].sort((a, b) => a - b));
  await expect(contagem(page)).toHaveText('Bola 12 de 75. Restam 63.');
  await expect(sorteador(page).locator('.drawer-cell.is-last')).toHaveAttribute('data-ball', String(bolas[11]));
  // últimas bolas: as 8 anteriores à atual, da mais nova para a mais antiga
  const recentes = await sorteador(page)
    .locator('.drawer-mini-ball')
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.ball)));
  expect(recentes).toEqual(bolas.slice(3, 11).reverse());

  // a quantidade de bolas não muda no meio do sorteio
  const globo = (await configuracoes(page)).getByRole('group', { name: 'Bolas no globo' });
  await expect(globo.getByRole('button', { name: '90' })).toBeDisabled();

  // desfazer devolve a última bola ao globo
  await sorteador(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(contagem(page)).toHaveText('Bola 11 de 75. Restam 64.');
  await expect(sorteador(page).locator(`.drawer-cell[data-ball="${bolas[11]}"]`)).not.toHaveClass(/is-drawn/);
  await expect(sorteador(page).locator('.drawer-ball')).toHaveAttribute('data-ball', String(bolas[10]));

  // o sorteio continua depois de recarregar e aparece na tela inicial
  await page.reload();
  await expect(contagem(page)).toHaveText('Bola 11 de 75. Restam 64.');
  await sorteador(page).getByRole('button', { name: 'Início' }).click();
  await expect(page.getByRole('button', { name: /^Sorteador/ })).toContainText('11 sorteadas');
  await page.getByRole('button', { name: /^Sorteador/ }).click();

  // reiniciar pede confirmação
  await sorteador(page).getByRole('button', { name: 'Reiniciar' }).click();
  const app = new BingoApp(page);
  await expect(app.modal.getByRole('heading')).toHaveText('Reiniciar o sorteio?');
  await app.confirmar('Cancelar');
  await expect(contagem(page)).toHaveText('Bola 11 de 75. Restam 64.');
  await sorteador(page).getByRole('button', { name: 'Reiniciar' }).click();
  await app.confirmar('Reiniciar');
  await expect(contagem(page)).toHaveText('75 bolas no globo.');
  expect(await marcadasNoPainel(page)).toEqual([]);
  expect(erros).toEqual([]);
});

test('sorteador: globo com outra quantidade de bolas até acabar', async ({ page }) => {
  await abrirSorteador(page);
  await semAnimacao(page);
  const painel = await configuracoes(page);
  const globo = painel.getByRole('group', { name: 'Bolas no globo' });

  await globo.getByRole('button', { name: '90' }).click();
  await expect(sorteador(page).locator('.drawer-cell')).toHaveCount(90);
  // a letra só existe no bingo de 75 bolas
  await expect(painel.getByLabel('Mostrar a letra (B, I, N, G, O) junto do número')).toHaveCount(0);
  await expect(painel.getByLabel(/Marcar também na partida em andamento/)).toBeDisabled();

  // o campo aceita apagar e digitar outro número
  await globo.getByRole('button', { name: 'Outro' }).click();
  const maior = painel.getByRole('spinbutton');
  await maior.fill('');
  await maior.pressSequentially('12');
  await expect(sorteador(page).locator('.drawer-cell')).toHaveCount(12);
  await expect(contagem(page)).toHaveText('12 bolas no globo.');
  await maior.fill('5');
  await maior.blur();
  await expect(maior).toHaveValue('12');

  const bolas: number[] = [];
  for (let i = 0; i < 12; i++) bolas.push(await sortear(page));
  expect([...bolas].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  await expect(sorteador(page).locator('.drawer-ball-letter')).toHaveCount(0);
  await expect(contagem(page)).toHaveText('Todas as 12 bolas foram sorteadas.');
  await expect(botaoSortear(page)).toBeDisabled();
  await page.keyboard.press('Space');
  expect(await marcadasNoPainel(page)).toHaveLength(12);
});

test('sorteador: modo automático com pausa', async ({ page }) => {
  // relógio controlado pelo teste: o intervalo do automático é conferido sem esperar de verdade
  await page.clock.install({ time: new Date('2026-03-01T10:00:00') });
  await abrirSorteador(page);
  await page.clock.pauseAt(new Date('2026-03-01T10:10:00'));
  await semAnimacao(page);
  const painel = await configuracoes(page);
  await painel.getByLabel('Sortear automaticamente').check();
  const intervalo = painel.getByRole('spinbutton');
  await intervalo.fill('');
  await intervalo.pressSequentially('4');
  await expect(intervalo).toHaveValue('4');
  await painel.getByRole('heading', { name: 'Configurações' }).click();

  await botaoSortear(page).click();
  await expect(contagem(page)).toHaveText('Bola 1 de 75. Restam 74.');
  await expect(sorteador(page).locator('.drawer-auto')).toHaveAttribute('aria-label', 'Próxima bola em 4 segundos');
  await page.clock.runFor(3900);
  await expect(contagem(page)).toHaveText('Bola 1 de 75. Restam 74.');
  await page.clock.runFor(200);
  await expect(contagem(page)).toHaveText('Bola 2 de 75. Restam 73.');
  await page.clock.runFor(4100);
  await expect(contagem(page)).toHaveText('Bola 3 de 75. Restam 72.');

  // pausado, nada sai
  await sorteador(page).getByRole('button', { name: 'Pausar automático' }).click();
  await expect(sorteador(page).locator('.drawer-auto')).toHaveCount(0);
  await page.clock.runFor(20000);
  await expect(contagem(page)).toHaveText('Bola 3 de 75. Restam 72.');
  await sorteador(page).getByRole('button', { name: 'Continuar automático' }).click();
  await page.clock.runFor(4100);
  await expect(contagem(page)).toHaveText('Bola 4 de 75. Restam 71.');
  expect(new Set(await marcadasNoPainel(page)).size).toBe(4);
});

test('sorteador: modo telão em tela cheia e atalhos de teclado', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await abrirSorteador(page);
  await semAnimacao(page);
  for (let i = 0; i < 5; i++) await sortear(page);

  const telaCheia = () => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid') ?? null);
  await page.getByRole('button', { name: 'Modo telão (tela cheia)' }).click();
  await expect(sorteador(page)).toHaveClass(/is-projecting/);
  await expect.poll(telaCheia).toBe('sorteador');
  await expect(page.locator('.topbar')).toHaveCount(0);

  // tudo cabe na tela, sem rolagem, e o sorteio continua pelo teclado
  const cabe = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="sorteador"]')!;
      return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    });
  expect(await cabe()).toBe(true);
  await page.keyboard.press('Space');
  await expect(contagem(page)).toHaveText('Bola 6 de 75. Restam 69.');
  const bola = sorteador(page).locator('.drawer-ball');
  const tamanho = (await bola.boundingBox())!;
  expect(tamanho.height).toBeGreaterThan(250);

  await sorteador(page).getByRole('button', { name: 'Sair do telão' }).click();
  await expect(sorteador(page)).not.toHaveClass(/is-projecting/);
  await expect.poll(telaCheia).toBeNull();

  // F liga e desliga; Escape também sai
  await page.keyboard.press('f');
  await expect(sorteador(page)).toHaveClass(/is-projecting/);
  await page.keyboard.press('f');
  await expect(sorteador(page)).not.toHaveClass(/is-projecting/);
  await page.keyboard.press('f');
  await expect(sorteador(page)).toHaveClass(/is-projecting/);
  await page.keyboard.press('Escape');
  await expect(sorteador(page)).not.toHaveClass(/is-projecting/);

  // com o foco numa opção das configurações as teclas não sorteiam nem abrem o telão
  const painel = await configuracoes(page);
  const som = painel.getByLabel('Efeitos sonoros');
  await expect(som).toBeChecked();
  await som.press('f');
  await som.press('Space');
  await expect(som).not.toBeChecked();
  await expect(sorteador(page)).not.toHaveClass(/is-projecting/);
  await expect(contagem(page)).toHaveText('Bola 6 de 75. Restam 69.');
});

test('sorteador marca na partida em andamento quando a opção está ligada', async ({ page }) => {
  await cadastrarCartelas(page);
  const app = new BingoApp(page);
  await app.abrirInicio();
  await page.locator('.start-card').getByRole('button', { name: 'Iniciar jogo' }).click();
  await page.locator('.setup-card[data-card="01065"] .chip-toggle', { hasText: 'Bicicleta Aro 26' }).click();
  await page.locator('.action-bar').getByRole('button', { name: 'Iniciar jogo' }).click();
  await app.digitar('3', 'enter');
  await app.irParaInicio();

  await page.getByRole('button', { name: /^Sorteador/ }).click();
  await semAnimacao(page);
  const painel = await configuracoes(page);
  // desligada: o sorteio não mexe na partida
  const sem = await sortear(page);
  await painel.getByLabel(/Marcar também na partida em andamento/).check();
  await expect(sorteador(page).locator('.drawer-hint')).toContainText('Marcando também na partida "Bicicleta Aro 26".');
  const com: number[] = [];
  for (let i = 0; i < 4; i++) com.push(await sortear(page));
  await sorteador(page).getByRole('button', { name: 'Desfazer' }).click();

  await sorteador(page).getByRole('button', { name: 'Início' }).click();
  await page.getByRole('button', { name: 'Continuar partida' }).click();
  const fichas = await page
    .locator('.draws-panel .ball-chip')
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.ball)));
  // o 3 digitado à mão pode sair também no sorteador: não conta duas vezes
  let esperadas = [3, ...com.slice(0, 3).filter((n) => n !== 3)];
  // desfazer no sorteador tira a bola da partida
  if (com[3] === 3) esperadas = esperadas.filter((n) => n !== 3);
  expect(fichas).toEqual([...esperadas].reverse());
  if (sem !== 3) expect(fichas).not.toContain(sem);
});

// ---------------------------------------------------------------- gerador

const gerador = (page: Page) => page.locator('.generator-page');

async function abrirGerador(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /^Gerador de cartelas/ }).click();
  await expect(page).toHaveURL(/#\/gerador$/);
  await expect(gerador(page).getByRole('heading', { name: 'Prévia' })).toBeVisible();
}

async function campoNumero(page: Page, rotulo: string, valor: number) {
  const campo = gerador(page).getByLabel(rotulo, { exact: true });
  await campo.fill('');
  await campo.pressSequentially(String(valor));
  await expect(campo).toHaveValue(String(valor));
}

async function baixar(page: Page, botao: string): Promise<{ nome: string; conteudo: Buffer }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    gerador(page).getByRole('button', { name: botao }).click(),
  ]);
  return { nome: (download as Download).suggestedFilename(), conteudo: readFileSync(await download.path()) };
}

/** Lê o PDF do jsPDF: quantidade de páginas, título e todos os textos escritos nas páginas. */
function lerPdf(pdf: Buffer) {
  const bruto = pdf.toString('latin1');
  const paginas = (bruto.match(/\/Type \/Page\b(?!s)/g) ?? []).length;
  const titulo = bruto.match(/\/Title \((.*?)\)/)?.[1] ?? '';
  const textos: string[] = [];
  for (let pos = bruto.indexOf('stream\n'); pos >= 0; ) {
    const fim = bruto.indexOf('endstream', pos);
    const dados = pdf.subarray(pos + 7, fim);
    let conteudo = dados.toString('latin1');
    try {
      conteudo = inflateSync(dados).toString('latin1');
    } catch {
      // stream sem compressão
    }
    for (const t of conteudo.matchAll(/\((.*?)\) Tj/g)) textos.push(t[1]);
    pos = bruto.indexOf('stream\n', fim + 9);
  }
  return { paginas, titulo, textos };
}

function lerCsv(csv: Buffer) {
  const texto = csv.toString('utf8');
  expect(texto.charCodeAt(0)).toBe(0xfeff);
  const [cabecalho, ...linhas] = texto.slice(1).split('\r\n');
  return { cabecalho: cabecalho.split(';'), linhas: linhas.map((l) => l.split(';')) };
}

/** Confere uma linha do CSV: colunas B1..O5 dentro das faixas e sem números repetidos. */
function conferirLinha(linha: string[], centroLivre: boolean) {
  const numeros = linha.slice(2);
  expect(numeros).toHaveLength(25);
  numeros.forEach((v, i) => {
    const coluna = Math.floor(i / 5);
    if (centroLivre && i === 12) {
      expect(v).toBe('LIVRE');
      return;
    }
    const n = Number(v);
    expect(n >= coluna * 15 + 1 && n <= coluna * 15 + 15, `${v} na coluna ${'BINGO'[coluna]}`).toBe(true);
  });
  expect(new Set(numeros).size).toBe(25);
}

test('gerador: cartelas com vários jogos em PDF, lista de conferência e minhas cartelas', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await abrirGerador(page);
  const resumo = gerador(page).locator('.generator-preview .panel-head .muted');
  await expect(resumo).toHaveText('10 cartela(s) em 5 página(s)');

  await gerador(page).getByLabel('Título', { exact: true }).fill('Bingo da Escola');
  await gerador(page).getByLabel('Subtítulo (opcional)').fill('Sábado às 20h');
  await gerador(page).getByLabel('Rodapé (opcional)').fill('Boa sorte!');
  await gerador(page).getByRole('group', { name: 'Jogos por cartela' }).getByRole('button', { name: '3' }).click();
  await gerador(page).getByRole('textbox', { name: 'Nome do jogo 2' }).fill('Liquidificador');
  await campoNumero(page, 'Quantidade de cartelas', 3);
  await campoNumero(page, 'Numeração a partir de', 7);
  await gerador(page).getByRole('group', { name: 'Cor' }).getByRole('button', { name: 'Verde' }).click();
  await expect(resumo).toHaveText('3 cartela(s) em 2 página(s)');

  // a prévia mostra a primeira página com os textos e os números da cartela
  const previa = gerador(page).locator('svg.print-preview');
  await expect(previa).toHaveCount(1);
  await expect(previa).toContainText('Bingo da Escola');
  await expect(previa).toContainText('Sábado às 20h');
  await expect(previa).toContainText('Nº 0007');
  await expect(previa).toContainText('Nº 0008');
  await expect(previa).not.toContainText('Nº 0009');
  await expect(previa).toContainText('Liquidificador');
  await expect(previa).toContainText('Boa sorte!');

  // PDF: páginas, título e textos
  const pdf = await baixar(page, 'Baixar PDF');
  expect(pdf.nome).toBe('bingo-da-escola-cartelas.pdf');
  expect(pdf.conteudo.subarray(0, 5).toString()).toBe('%PDF-');
  const lido = lerPdf(pdf.conteudo);
  expect(lido.paginas).toBe(2);
  expect(lido.titulo).toBe('Bingo da Escola');
  for (const t of ['Bingo da Escola', 'Sábado às 20h', 'Nº 0007', 'Nº 0008', 'Nº 0009', 'Liquidificador', 'Rodada 3']) {
    expect(lido.textos, t).toContain(t);
  }
  await expect(gerador(page).locator('.notice')).toHaveText('PDF gerado com 3 cartela(s) em 2 página(s).');

  // CSV: uma linha por jogo, com os mesmos números do PDF
  const csv = await baixar(page, 'Lista de conferência (CSV)');
  expect(csv.nome).toBe('bingo-da-escola-conferencia.csv');
  const { cabecalho, linhas } = lerCsv(csv.conteudo);
  expect(cabecalho.slice(0, 4)).toEqual(['cartela', 'jogo', 'B1', 'B2']);
  expect(cabecalho).toHaveLength(27);
  expect(linhas.map((l) => `${l[0]} ${l[1]}`)).toEqual([
    '0007 Rodada 1',
    '0007 Liquidificador',
    '0007 Rodada 3',
    '0008 Rodada 1',
    '0008 Liquidificador',
    '0008 Rodada 3',
    '0009 Rodada 1',
    '0009 Liquidificador',
    '0009 Rodada 3',
  ]);
  for (const l of linhas) conferirLinha(l, true);
  expect(new Set(linhas.map((l) => l.slice(2).join(','))).size).toBe(9);
  const numerosPdf = new Set(lido.textos.filter((t) => /^\d\d$/.test(t)).map(Number));
  for (const l of linhas) for (const v of l.slice(2)) if (v !== 'LIVRE') expect(numerosPdf.has(Number(v))).toBe(true);

  // mudar só o título não troca os números; "Outros números" troca
  await gerador(page).getByLabel('Título', { exact: true }).fill('Bingo da Escola Estadual');
  const mesmo = lerCsv((await baixar(page, 'Lista de conferência (CSV)')).conteudo);
  expect(mesmo.linhas).toEqual(linhas);
  await gerador(page).getByRole('button', { name: 'Outros números' }).click();
  const outro = lerCsv((await baixar(page, 'Lista de conferência (CSV)')).conteudo);
  expect(outro.linhas.map((l) => l.slice(2).join(','))).not.toEqual(linhas.map((l) => l.slice(2).join(',')));

  // adicionar às minhas cartelas, sem duplicar quando repetido
  await gerador(page).getByRole('button', { name: 'Adicionar às minhas cartelas' }).click();
  await expect(gerador(page).locator('.notice')).toHaveText('3 cartela(s) adicionada(s) em Minhas cartelas.');
  await gerador(page).getByRole('button', { name: 'Adicionar às minhas cartelas' }).click();
  await expect(gerador(page).locator('.notice')).toHaveText('0 adicionada(s). 3 já existiam com o mesmo número.');

  // a configuração fica salva
  await page.reload();
  await expect(gerador(page).getByLabel('Título', { exact: true })).toHaveValue('Bingo da Escola Estadual');
  await expect(resumo).toHaveText('3 cartela(s) em 2 página(s)');

  await gerador(page).getByRole('button', { name: 'Início' }).click();
  await expect(page.locator('.card-item')).toHaveCount(3);
  const cartela = page.locator('.card-item[data-card="0007"]');
  await expect(cartela.locator('.card-name-text')).toHaveText('Cartela 0007');
  await expect(cartela.locator('.prize-list li')).toHaveText(['1Rodada 1', '2Liquidificador', '3Rodada 3']);
  const app = new BingoApp(page);
  const salvo = await app.lerArmazenamento<{ cards: { number: string; games: { grid: number[] }[] }[] }>();
  const primeira = salvo.cards.find((c) => c.number === '0007')!;
  const esperado = outro.linhas[0].slice(2).map((v) => (v === 'LIVRE' ? 0 : Number(v)));
  // o CSV é lido por coluna; a grade salva é por linha
  const porColuna = [0, 1, 2, 3, 4].flatMap((c) => [0, 1, 2, 3, 4].map((r) => primeira.games[0].grid[r * 5 + c]));
  expect(porColuna).toEqual(esperado);
  expect(erros).toEqual([]);
});

test('gerador: jogos avulsos, vários por folha, e aviso de números pequenos', async ({ page }) => {
  await abrirGerador(page);
  const resumo = gerador(page).locator('.generator-preview .panel-head .muted');
  await gerador(page).getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Jogos avulsos' }).click();
  await expect(gerador(page).getByRole('group', { name: 'Por página' }).getByRole('button')).toHaveText([
    '1',
    '2',
    '4',
    '6',
    '8',
    '12',
  ]);
  await campoNumero(page, 'Quantidade de jogos avulsos', 16);
  await gerador(page).getByRole('group', { name: 'Por página' }).getByRole('button', { name: '8' }).click();
  await gerador(page).getByLabel('Nome do jogo (opcional)').fill('Rodada extra');
  await gerador(page).getByLabel('Espaço livre no centro').uncheck();
  await gerador(page).getByLabel('Números de cada coluna em ordem crescente').check();
  await expect(resumo).toHaveText('16 jogo(s) avulso(s) em 2 página(s)');
  await expect(gerador(page).getByRole('alert')).toHaveCount(0);

  const lido = lerPdf((await baixar(page, 'Baixar PDF')).conteudo);
  expect(lido.paginas).toBe(2);
  expect(lido.textos.filter((t) => t === 'Rodada extra')).toHaveLength(16);
  expect(lido.textos).not.toContain('LIVRE');

  const { linhas } = lerCsv((await baixar(page, 'Lista de conferência (CSV)')).conteudo);
  expect(linhas).toHaveLength(16);
  for (const l of linhas) {
    conferirLinha(l, false);
    for (let c = 0; c < 5; c++) {
      const coluna = l.slice(2 + c * 5, 7 + c * 5).map(Number);
      expect(coluna).toEqual([...coluna].sort((a, b) => a - b));
    }
  }

  // muitas tabelas por folha deixam os números pequenos demais: o app avisa
  await gerador(page)
    .getByRole('group', { name: 'Tipo' })
    .getByRole('button', { name: 'Cartelas com vários jogos' })
    .click();
  await gerador(page).getByRole('group', { name: 'Jogos por cartela' }).getByRole('button', { name: '5' }).click();
  await gerador(page).getByRole('group', { name: 'Por página' }).getByRole('button', { name: '4' }).click();
  await expect(gerador(page).getByRole('alert')).toContainText('Os números ficaram pequenos para imprimir');
  await gerador(page).getByRole('group', { name: 'Por página' }).getByRole('button', { name: '2' }).click();
  await expect(gerador(page).getByRole('alert')).toHaveCount(0);
});

test('telas novas no celular e no tema escuro: sem rolagem lateral e com bom contraste', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 360, height: 740 });
  const app = new BingoApp(page);
  const conferir = async (tela: string) => {
    const larguras = await page.evaluate(() => ({
      pagina: window.innerWidth,
      conteudo: document.documentElement.scrollWidth,
    }));
    expect(larguras, tela).toEqual({ pagina: 360, conteudo: 360 });
    await expect.poll(() => app.textosComBaixoContraste(), { message: tela }).toEqual([]);
  };

  await abrirSorteador(page);
  await semAnimacao(page);
  for (let i = 0; i < 10; i++) await sortear(page);
  await conferir('sorteador com configurações');
  await page.getByRole('button', { name: 'Modo telão (tela cheia)' }).click();
  await expect(sorteador(page)).toHaveClass(/is-projecting/);
  await conferir('telão no celular');
  await page.keyboard.press('Escape');

  await abrirGerador(page);
  await conferir('gerador');
  await gerador(page).getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Jogos avulsos' }).click();
  await conferir('gerador de avulsos');
  await page.emulateMedia({ colorScheme: 'light' });
  await conferir('gerador no tema claro');
});
