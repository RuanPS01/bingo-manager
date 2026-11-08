import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { BingoApp, STORAGE_KEY } from './app';
import { bola } from './oracle';

/** Inicia uma partida simples: um jogo de uma cartela, modo cartela cheia. */
async function iniciarPartida(page: Page, cartela: string, premio = 'Bicicleta Aro 26') {
  await page.locator('.start-card').getByRole('button', { name: 'Iniciar jogo' }).click();
  await page.locator(`.setup-card[data-card="${cartela}"] .chip-toggle`, { hasText: premio }).click();
  await page.locator('.action-bar').getByRole('button', { name: 'Iniciar jogo' }).click();
  await expect(page.getByRole('textbox', { name: 'Número sorteado' })).toBeVisible();
}

async function marcar(app: BingoApp, n: number) {
  await app.digitar(String(n), 'enter');
  await expect(app.feedback).toContainText(bola(n));
}

async function finalizar(app: BingoApp) {
  await app.page.getByRole('button', { name: 'Finalizar partida' }).click();
  await app.confirmar('Finalizar');
  await expect(app.page.locator('.hero')).toBeVisible();
}

test('cadastra, valida, renomeia, edita e exclui cartelas', async ({ page }) => {
  const app = new BingoApp(page);
  await app.abrirInicio();
  await expect(page.locator('.card-item')).toHaveCount(3);

  // validações do formulário
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(app.modal.getByRole('heading')).toHaveText('Adicionar cartela ou jogo');
  await app.modal.getByRole('button', { name: 'Só salvar' }).click();
  await expect(app.modal.getByText('Informe o nome ou o número da cartela')).toBeVisible();
  await app.modal.getByPlaceholder('Ex.: 01066').fill('01062');
  await expect(app.modal.getByText('Já existe uma cartela com esse número')).toBeVisible();
  await app.modal.getByPlaceholder('Ex.: 01066').fill('01070');
  await app.modal.getByPlaceholder('Ex.: Bruna').fill('Teste');

  // prettier-ignore
  const numeros = [
    1, 16, 31, 46, 61,
    2, 17, 32, 47, 62,
    3, 18, 48, 63,
    4, 19, 33, 49, 64,
    5, 20, 34, 50, 65,
  ];
  const celulas = app.modal.locator('.grid-editor input');
  await expect(celulas).toHaveCount(24);
  await celulas.first().click();
  for (const n of numeros) await page.keyboard.type(String(n).padStart(2, '0'));
  // fora da faixa da coluna B e um número repetido (03 já está na terceira linha)
  await celulas.nth(0).fill('20');
  await celulas.nth(5).fill('03');
  await app.modal.getByRole('button', { name: 'Só salvar' }).click();
  await expect(app.modal.locator('.field-error')).toContainText('Na coluna B use de 1 a 15');
  await expect(app.modal.locator('.field-error')).toContainText('Número repetido');
  await expect(app.modal.locator('.grid-editor input.has-error')).toHaveCount(3);
  await celulas.nth(0).fill('01');
  await celulas.nth(5).fill('02');
  await app.modal.getByRole('button', { name: 'Só salvar' }).click();
  await expect(app.modal).toHaveCount(0);

  const nova = page.locator('.card-item[data-card="01070"]');
  await expect(nova.locator('.card-name-text')).toHaveText('Teste');
  await expect(page.locator('.card-item')).toHaveCount(4);
  await expect(page.locator('.panel-head', { hasText: 'Cartelas disponíveis' })).toContainText('4 cartela(s)');

  // renomear no próprio cartão: Enter salva, Escape cancela, vazio mostra o número
  await nova.getByRole('button', { name: 'Renomear cartela 01070' }).click();
  await nova.getByRole('textbox', { name: 'Nome da cartela 01070' }).fill('Cartela da Ana');
  await nova.getByRole('textbox', { name: 'Nome da cartela 01070' }).press('Enter');
  await expect(nova.locator('.card-name-text')).toHaveText('Cartela da Ana');
  await nova.getByRole('button', { name: 'Renomear cartela 01070' }).click();
  await nova.getByRole('textbox', { name: 'Nome da cartela 01070' }).fill('Outro nome');
  await nova.getByRole('textbox', { name: 'Nome da cartela 01070' }).press('Escape');
  await expect(nova.locator('.card-name-text')).toHaveText('Cartela da Ana');
  await nova.getByRole('button', { name: 'Renomear cartela 01070' }).click();
  await nova.getByRole('textbox', { name: 'Nome da cartela 01070' }).fill('');
  await nova.getByRole('button', { name: 'Salvar' }).click();
  await expect(nova.locator('.card-name-text')).toHaveText('Cartela 01070');
  await expect(nova.locator('.card-name-text')).toHaveClass(/is-empty/);
  await nova.getByRole('button', { name: 'Renomear cartela 01070' }).click();
  await nova.getByRole('textbox', { name: 'Nome da cartela 01070' }).fill('Ana');
  await nova.getByRole('button', { name: 'Salvar' }).click();

  // partida com a cartela nova e correção de número com a partida em andamento
  await iniciarPartida(page, '01070', 'Moto 0 km');
  await marcar(app, 17);
  await expect(app.feedback).toHaveText('I-17 marcado em 1 jogo(s): Ana.');
  await app.irParaInicio();
  await nova.getByRole('button', { name: 'Editar números e jogos' }).click();
  await app.modal.locator('.grid-editor input').nth(6).fill('21');
  await app.modal.getByRole('button', { name: 'Só salvar' }).click();
  await expect(nova.locator('.bingo-cell').filter({ hasText: /^21$/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Continuar partida' }).click();
  await expect(page.locator('.game-card[data-game="' + (await idDaCartela(app, '01070')) + '::moto"]')).toHaveAttribute(
    'data-marked',
    '0',
  );
  await marcar(app, 21);
  await expect(app.feedback).toHaveText('I-21 marcado em 1 jogo(s): Ana.');

  // excluir a cartela não afeta a partida em andamento
  await app.irParaInicio();
  await nova.getByRole('button', { name: 'Editar números e jogos' }).click();
  await app.modal.getByRole('button', { name: 'Excluir', exact: true }).click();
  await app.confirmar('Excluir');
  await expect(page.locator('.card-item')).toHaveCount(3);
  await page.getByRole('button', { name: 'Continuar partida' }).click();
  await expect(page.locator('.card-group[data-card="01070"]')).toBeVisible();
  await finalizar(app);

  const salvo = await app.lerArmazenamento<{ cards: unknown[]; history: unknown[] }>();
  expect(salvo.cards).toHaveLength(3);
  expect(salvo.history).toHaveLength(1);
});

async function idDaCartela(app: BingoApp, numero: string): Promise<string> {
  const salvo = await app.lerArmazenamento<{ cards: { id: string; number: string }[] }>();
  return salvo.cards.find((c) => c.number === numero)!.id;
}

test('adiciona jogo avulso e cartela com números diferentes por jogo, e joga com eles', async ({ page }) => {
  const app = new BingoApp(page);
  await app.abrirInicio();

  // jogo avulso cadastrado pela tela inicial, com os números digitados de uma vez
  await page.locator('.add-tile').click();
  await app.modal.getByRole('button', { name: 'Jogo avulso', exact: true }).click();
  await app.modal.getByPlaceholder('Ex.: Binguinho da Ana').fill('Binguinho da Ana');
  const nomeJogo = app.modal.getByRole('textbox', { name: 'Nome do jogo avulso' });
  await expect(nomeJogo).toHaveValue('Jogo 1');
  const rapido = app.modal.getByRole('textbox', { name: 'Digitar todos os números de uma vez' });
  await rapido.fill('1 2 3');
  await rapido.press('Enter');
  await expect(app.modal.getByText('Encontrei 3 número(s). Digite os 24 números, linha por linha.')).toBeVisible();
  await rapido.fill('1 16 31 46 61 2 17 32 47 62 3 18 48 63 4 19 33 49 64 5 20 34 50 65');
  await app.modal.getByRole('button', { name: 'Preencher' }).click();
  const celulas = app.modal.locator('.grid-editor input');
  await expect(celulas.nth(0)).toHaveValue('1');
  await expect(celulas.nth(12)).toHaveValue('48');
  await nomeJogo.fill('');
  await app.modal.getByRole('button', { name: 'Salvar e jogar' }).click();
  await expect(app.modal.getByText('Dê um nome a cada jogo avulso')).toBeVisible();
  await nomeJogo.fill('Binguinho');
  await app.modal.getByRole('button', { name: 'Salvar e jogar' }).click();

  // já abre a nova partida com o jogo selecionado
  await expect(page).toHaveURL(/#\/nova-partida\/.+/);
  const cartao = page.locator('.setup-card', { hasText: 'Binguinho da Ana' });
  await expect(cartao.locator('.chip-toggle', { hasText: 'Binguinho' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.setup .chip-toggle[aria-pressed="true"]')).toHaveCount(1);
  await app.escolherModo('quina');
  await page.locator('.action-bar').getByRole('button', { name: 'Iniciar jogo' }).click();
  await expect(page.locator('.match-title strong')).toHaveText('Binguinho');
  await app.digitar('3', 'enter');
  await expect(app.feedback).toHaveText('B-03 marcado em 1 jogo(s): Binguinho da Ana.');
  for (const n of [18, 48]) await app.digitar(String(n), 'enter');
  await app.digitar('63', 'enter');
  await expect(app.feedback).toHaveText('O-63 completou 1 conquista(s)!');
  await expect(app.avisoBingo).toContainText('Quina: Binguinho da Ana, Binguinho');

  // cartela com 2 jogos de números diferentes, incluída no meio da partida
  await page.getByRole('button', { name: 'Adicionar cartela ou jogo' }).click();
  await app.modal.getByPlaceholder('Ex.: Bruna').fill('Duda');
  await app.modal.getByPlaceholder('Ex.: 01066').fill('01080');
  for (const premio of ['R$ 1.500,00', 'Smart TV 43"', 'Moto 0 km']) {
    await app.modal.locator('.chip-toggle', { hasText: premio }).click();
  }
  await expect(app.modal.locator('.chip-toggle[aria-pressed="true"]')).toHaveCount(2);
  await app.modal.getByLabel('Mesmos números em todos os jogos (como na cartela impressa)').uncheck();
  await app.modal.getByRole('tab', { name: /Bicicleta/ }).click();
  await app.modal
    .getByRole('textbox', { name: 'Digitar todos os números de uma vez' })
    .fill('3 18 31 46 61 4 19 32 47 62 5 20 48 64 6 21 33 49 65 7 22 34 50 66');
  await app.modal.getByRole('button', { name: 'Preencher' }).click();
  await app.modal.getByRole('tab', { name: /Smartphone/ }).click();
  await expect(app.modal.locator('.grid-editor input').first()).toHaveValue('');
  await app.modal.getByRole('button', { name: 'Salvar e incluir na partida' }).click();
  await expect(app.modal.getByRole('tab', { name: /Smartphone/ })).toHaveClass(/has-error/);
  await app.modal
    .getByRole('textbox', { name: 'Digitar todos os números de uma vez' })
    .fill('10 25 40 55 70 11 26 41 56 71 12 27 57 63 13 28 42 58 72 14 29 43 59 73');
  await app.modal.getByRole('button', { name: 'Preencher' }).click();
  await app.modal.getByRole('button', { name: 'Salvar e incluir na partida' }).click();
  await expect(app.modal).toHaveCount(0);
  await expect(app.feedback).toHaveText('Duda incluída na partida com 2 jogo(s).');

  const duda = page.locator('.card-group[data-card="01080"]');
  await expect(duda.locator('.game-card')).toHaveCount(2);
  const id = await idDaCartela(app, '01080');
  await expect(page.locator(`.game-card[data-game="${id}::bicicleta"]`)).toHaveAttribute('data-marked', '3');
  await expect(page.locator(`.game-card[data-game="${id}::smartphone"]`)).toHaveAttribute('data-marked', '1');

  // tudo continua lá depois de recarregar
  await page.reload();
  await expect(duda.locator('.game-card')).toHaveCount(2);
  await finalizar(app);

  const cartaoDuda = page.locator('.card-item[data-card="01080"]');
  await expect(cartaoDuda.locator('.prize-list li')).toHaveText(['1Bicicleta Aro 26', '2Smartphone']);
  await expect(cartaoDuda).toContainText('Números do 1º jogo');
  await expect(
    page.locator('.card-item', { hasText: 'Binguinho da Ana' }).locator('.prize-list li.is-custom'),
  ).toHaveText('Binguinho');

  // ao editar, os jogos aparecem com números separados
  await cartaoDuda.getByRole('button', { name: 'Editar números e jogos' }).click();
  await expect(app.modal.getByLabel('Mesmos números em todos os jogos (como na cartela impressa)')).not.toBeChecked();
  await app.modal.getByRole('tab', { name: /Smartphone/ }).click();
  await expect(app.modal.locator('.grid-editor input').first()).toHaveValue('10');
  await app.modal.getByRole('button', { name: 'Cancelar', exact: true }).click();

  const salvo = await app.lerArmazenamento<{
    cards: { name: string; games: { id: string; prizeId: string | null; name: string; grid: number[] }[] }[];
  }>();
  expect(salvo.cards).toHaveLength(5);
  const dudaSalva = salvo.cards.find((c) => c.name === 'Duda')!;
  expect(dudaSalva.games.map((g) => g.id)).toEqual(['bicicleta', 'smartphone']);
  expect(dudaSalva.games[0].grid).not.toEqual(dudaSalva.games[1].grid);
  const avulso = salvo.cards.find((c) => c.name === 'Binguinho da Ana')!;
  expect(avulso.games).toHaveLength(1);
  expect(avulso.games[0]).toMatchObject({ prizeId: null, name: 'Binguinho' });
});

test('a partida continua depois de fechar um padrão, sem precisar fechar o aviso', async ({ page }) => {
  const app = new BingoApp(page);
  await app.abrirInicio();
  await iniciarPartida(page, '01065');
  await page.getByRole('button', { name: 'Editar jogos e modos' }).click();
  await app.painel('Modos que valem').getByRole('button', { name: 'Limpar' }).click();
  await app.escolherModo('quina');
  await page.locator('.action-bar').getByRole('button', { name: 'Salvar alterações' }).click();

  // fecha a quina da linha do meio da 01065: 03 20 [livre] 50 68
  for (const n of [3, 20, 50]) await marcar(app, n);
  await expect(app.avisoBingo).toHaveCount(0);
  await app.digitar('68', 'enter');
  await expect(app.feedback).toHaveText('O-68 completou 1 conquista(s)!');
  await expect(app.avisoBingo).toContainText('BINGO!');
  await expect(app.avisoBingo).toContainText('Quina: Ruan, Bicicleta Aro 26');
  await expect(app.avisoBingo).toContainText('A partida continua');
  await expect(page.locator('.modal')).toHaveCount(0);

  // o campo continua ativo: o próximo número entra direto
  await expect(app.input).toBeFocused();
  await page.keyboard.type('9');
  await page.keyboard.press('Enter');
  await expect(app.feedback).toHaveText('B-09 marcado em 1 jogo(s): Ruan.');
  await expect(app.avisoBingo).toBeVisible();

  // todos os padrões fechados: a partida segue aberta, com atalho para incluir outros modos
  const fechados = page.locator('.panel-info', { hasText: 'Todos os padrões foram fechados' });
  await expect(fechados).toBeVisible();
  for (const n of [25, 40]) await marcar(app, n);
  await expect(app.avisoBingo).toHaveCount(0);
  await expect(page.locator('.draws-panel .ball-chip')).toHaveCount(7);

  await marcar(app, 41);
  await expect(page.locator('.game-card [data-mode="quina"]')).toHaveAttribute('data-done', '4');

  // incluir cartela cheia depois da quina e continuar até fechar
  await fechados.getByRole('button', { name: 'Incluir outros modos' }).click();
  await app.escolherModo('cartela-cheia');
  await page.locator('.action-bar').getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(fechados).toHaveCount(0);
  await expect(page.locator('.modes-line')).toContainText('Quina, Cartela cheia');
  for (const n of [39, 2, 30, 51, 72, 52, 69, 8, 27, 31, 59, 62, 12, 17, 38, 60]) await marcar(app, n);
  await expect(page.locator('.achievement-list li')).toHaveCount(1);
  await app.digitar('74', 'enter');
  await expect(app.feedback).toHaveText('O-74 completou 1 conquista(s)!');
  await expect(app.avisoBingo).toContainText('Cartela cheia: Ruan, Bicicleta Aro 26');
  await expect(page.locator('.achievement-list li')).toHaveCount(2);
  await expect(fechados).toBeVisible();

  // desfazer o número que fechou o padrão tira o aviso; marcar de novo mostra outra vez
  await page.getByRole('button', { name: 'Desfazer último número' }).click();
  await expect(app.avisoBingo).toHaveCount(0);
  await expect(page.locator('.achievement-list li')).toHaveCount(1);
  await expect(fechados).toHaveCount(0);
  await app.digitar('74', 'enter');
  await expect(app.avisoBingo).toContainText('Cartela cheia');
  await page.getByRole('button', { name: 'Fechar aviso de BINGO' }).click();
  await expect(app.avisoBingo).toHaveCount(0);
  await expect(app.input).toBeFocused();
  await expect(fechados).toBeVisible();

  // ainda dá para marcar números depois de tudo fechado e finalizar quando quiser
  await marcar(app, 1);
  await finalizar(app);
  await expect(page.locator('.history-item')).toHaveCount(1);
});

test('visão compacta mostra todos os jogos de uma vez, inclusive no celular', async ({ page }) => {
  const app = new BingoApp(page);
  await app.abrirInicio();
  await page.locator('.start-card').getByRole('button', { name: 'Iniciar jogo' }).click();
  await page.locator('.round-btn').first().click();
  await app.escolherModo('quina');
  await page.locator('.action-bar').getByRole('button', { name: 'Iniciar jogo' }).click();
  for (const n of [6, 19, 41]) await marcar(app, n);

  const alturaNormal = (await page.locator('.game-card').first().boundingBox())!.height;
  await expect(page.locator('.card-group')).toHaveCount(3);
  await app.visaoCompacta(true);
  await expect(page.locator('.card-group')).toHaveCount(0);
  await expect(page.locator('.games-grid-compact .game-card')).toHaveCount(3);
  await expect(page.locator('.modes-line')).toContainText('quanto falta para fechar o padrão');

  // com a lista logo abaixo do cabeçalho fixo, as 3 cartelas cabem inteiras na tela
  const cabem = async () =>
    page.evaluate(() => {
      const barra = document.querySelector('.match-bar')!.getBoundingClientRect().height;
      const lista = document.querySelector('.section-toolbar')!;
      window.scrollTo(0, lista.getBoundingClientRect().top + window.scrollY - barra - 4);
      const topo = document.querySelector('.match-bar')!.getBoundingClientRect().bottom;
      return [...document.querySelectorAll('.game-card')].every((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= topo - 1 && r.bottom <= window.innerHeight + 1;
      });
    });
  expect(await cabem()).toBe(true);
  const alturaCompacta = (await page.locator('.game-card').first().boundingBox())!.height;
  expect(alturaCompacta).toBeLessThan(alturaNormal / 2);
  expect(await app.numerosForaDosCartoes()).toEqual([]);

  // marcação e padrões continuam funcionando na visão compacta
  await marcar(app, 54);
  const bruna = page.locator('.game-card[data-game="cartela-01062::bicicleta"]');
  await expect(bruna).toHaveAttribute('data-marked', '4');
  await expect(bruna.locator('[data-mode="quina"]')).toHaveText('Quina1');
  await expect(bruna.locator('[data-mode="quina"]')).toHaveClass(/is-close/);
  await marcar(app, 69);
  await expect(app.avisoBingo).toContainText('Quina: Bruna, Bicicleta Aro 26');
  await expect(bruna.locator('[data-mode="quina"]')).toHaveClass(/is-done/);
  await expect(bruna.locator('[data-mode="quina"]')).toHaveAttribute('data-done', '5');

  // a escolha fica salva
  await page.reload();
  await expect(page.locator('.games-grid-compact .game-card')).toHaveCount(3);

  // com os 15 jogos (5 prêmios das 3 cartelas), todos cabem de uma vez num celular comum
  await page.getByRole('button', { name: 'Editar jogos e modos' }).click();
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.locator('.action-bar').getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('.games-grid-compact .game-card')).toHaveCount(15);
  expect(await cabem()).toBe(true);
  expect(await app.numerosForaDosCartoes()).toEqual([]);
  const colunas = await page.evaluate(
    () =>
      new Set([...document.querySelectorAll('.game-card')].map((el) => Math.round(el.getBoundingClientRect().left)))
        .size,
  );
  expect(colunas).toBe(5);

  // em tela bem pequena: sem rolagem lateral, e a rolagem vertical continua para ver o resto
  await page.setViewportSize({ width: 360, height: 640 });
  expect(await cabem()).toBe(false);
  expect(await app.numerosForaDosCartoes()).toEqual([]);
  const medidas = await page.evaluate(() => ({
    largura: document.documentElement.scrollWidth,
    tela: window.innerWidth,
    altura: document.documentElement.scrollHeight,
    alturaTela: window.innerHeight,
  }));
  expect(medidas.largura).toBe(medidas.tela);
  expect(medidas.altura).toBeGreaterThan(medidas.alturaTela);
  await page.locator('.game-card').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.game-card').last()).toBeInViewport();

  await app.visaoCompacta(false);
  await expect(page.locator('.card-group')).toHaveCount(3);
});

test('exporta e importa backup', async ({ page }) => {
  const app = new BingoApp(page);
  await app.abrirInicio();
  await iniciarPartida(page, '01065');
  for (const n of [3, 20, 50, 68, 11]) await marcar(app, n);
  await finalizar(app);
  await expect(page.locator('.history-item')).toHaveCount(1);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^bingo-apae-backup-.*\.json$/);
  const backup = readFileSync(await download.path(), 'utf8');
  const dados = JSON.parse(backup);
  expect(dados.cards).toHaveLength(3);
  expect(dados.history[0].draws).toEqual([3, 20, 50, 68, 11]);

  // apaga o histórico e restaura pelo backup
  await page.locator('.history-item').first().click();
  await page.getByRole('button', { name: 'Excluir do histórico' }).click();
  await app.confirmar('Excluir');
  await expect(page.locator('.history-item')).toHaveCount(0);

  const arquivo = page.locator('input[type="file"]');
  await arquivo.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await expect(app.modal.getByRole('heading')).toHaveText('Importar backup?');
  await app.confirmar('Importar');
  await expect(page.locator('.notice')).toContainText('Backup importado com sucesso.');
  await expect(page.locator('.history-item')).toHaveCount(1);

  await arquivo.setInputFiles({ name: 'ruim.json', mimeType: 'application/json', buffer: Buffer.from('não é json') });
  await expect(page.locator('.notice')).toContainText('Não foi possível ler esse arquivo de backup.');
  await expect(page.locator('.history-item')).toHaveCount(1);
});

test('migra dados salvos no formato antigo (campo owner)', async ({ page }) => {
  const antigo = {
    version: 1,
    cards: [
      {
        id: 'cartela-01062',
        number: '01062',
        owner: 'Bruna Antiga',
        prizeIds: ['bicicleta'],
        grid: [6, 19, 41, 54, 69, 14, 21, 36, 46, 71, 13, 20, 0, 56, 62, 2, 29, 31, 60, 73, 8, 30, 44, 49, 72],
      },
    ],
    activeMatch: {
      id: 'p1',
      name: 'Partida antiga',
      createdAt: 1,
      finishedAt: null,
      games: [
        {
          key: 'cartela-01062::bicicleta',
          cardId: 'cartela-01062',
          cardNumber: '01062',
          owner: 'Bruna Antiga',
          prizeId: 'bicicleta',
          grid: [6, 19, 41, 54, 69, 14, 21, 36, 46, 71, 13, 20, 0, 56, 62, 2, 29, 31, 60, 73, 8, 30, 44, 49, 72],
        },
      ],
      modeIds: ['quina'],
      draws: [6, 19, 41],
    },
    history: [],
    settings: { sound: false },
  };
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem('semeado')) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('semeado', '1');
      }
    },
    [STORAGE_KEY, JSON.stringify(antigo)],
  );
  const app = new BingoApp(page);
  await app.abrirInicio();
  await expect(page.locator('.card-item[data-card="01062"] .card-name-text')).toHaveText('Bruna Antiga');
  await page.getByRole('button', { name: 'Continuar partida' }).click();
  await expect(page.locator('.card-group[data-card="01062"] .card-name-text')).toHaveText('Bruna Antiga');
  await marcar(app, 54);
  await expect(app.feedback).toHaveText('G-54 marcado em 1 jogo(s): Bruna Antiga.');
  await marcar(app, 69);
  await expect(page.locator('.achievement-list li')).toHaveCount(1);
});

test('navegação: botão voltar do navegador e endereços inválidos', async ({ page }) => {
  const app = new BingoApp(page);
  await app.abrirInicio();
  await iniciarPartida(page, '01064');
  await marcar(app, 5);
  await page.goBack();
  await expect(page.locator('.active-card')).toBeVisible();

  await page.goto('./#/nova-partida');
  await expect(app.input).toBeVisible();
  await expect(page).toHaveURL(/#\/partida$/);

  await page.goto('./#/historico/nao-existe');
  await expect(page.locator('.hero')).toBeVisible();

  await page.getByRole('button', { name: 'Continuar partida' }).click();
  await finalizar(app);
  await page.goto('./#/partida');
  await expect(page.locator('.hero')).toBeVisible();
  await page.goto('./#/partida/editar');
  await expect(page.locator('.hero')).toBeVisible();
});

test('duas abas abertas ficam sincronizadas', async ({ page, context }) => {
  const app = new BingoApp(page);
  await app.abrirInicio();
  await iniciarPartida(page, '01062');
  await marcar(app, 6);

  const outra = await context.newPage();
  const app2 = new BingoApp(outra);
  await outra.goto('./#/partida');
  await expect(app2.feedback).toHaveText('1 de 75 números sorteados.');
  await marcar(app2, 19);
  await expect(page.locator('.draws-panel .ball-chip')).toHaveCount(2);
  await marcar(app, 41);
  await expect(outra.locator('.draws-panel .ball-chip')).toHaveCount(3);
});

test('PWA: manifesto, ícones, service worker, uso offline e instalação', async ({ page, context, request }) => {
  const manifesto = await (await request.get('./manifest.webmanifest')).json();
  expect(manifesto).toMatchObject({ display: 'standalone', start_url: './', scope: './', lang: 'pt-BR' });
  expect(manifesto.name).toBe('Bingo APAE 2026');
  const tamanhos = manifesto.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`);
  expect(tamanhos).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']));
  for (const icone of manifesto.icons) {
    const resposta = await request.get(`./${icone.src}`);
    expect(resposta.ok()).toBe(true);
    expect(resposta.headers()['content-type']).toContain('image/png');
  }
  expect((await request.get('./sw.js')).ok()).toBe(true);

  const app = new BingoApp(page);
  await app.abrirInicio();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', './manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  const ativo = await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active));
  expect(ativo).toBe(true);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  // sem internet: a página abre pelo cache e a partida funciona
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.hero')).toBeVisible();
  await iniciarPartida(page, '01065');
  await marcar(app, 9);
  await expect(app.feedback).toHaveText('B-09 marcado em 1 jogo(s): Ruan.');
  await context.setOffline(false);

  // convite de instalação (Chrome/Android)
  await app.irParaInicio();
  await page.evaluate(() => {
    const evento = new Event('beforeinstallprompt') as Event & Record<string, unknown>;
    evento.prompt = async () => {
      (window as unknown as { instalou: boolean }).instalou = true;
    };
    evento.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(evento);
  });
  const convite = page.locator('.install-card');
  await expect(convite).toContainText('Instale o app no celular');
  await convite.getByRole('button', { name: 'Instalar' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { instalou?: boolean }).instalou)).toBe(true);
  await expect(convite).toHaveCount(0);
});

test('PWA: dica de instalação no iPhone pode ser escondida', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  await page.goto('./');
  const dica = page.locator('.install-card');
  await expect(dica).toContainText('Adicionar à Tela de Início');
  await dica.getByRole('button', { name: 'Esconder dica de instalação' }).click();
  await expect(dica).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.hero')).toBeVisible();
  await expect(dica).toHaveCount(0);
  await context.close();
});

test('layout mobile: nada passa da largura da tela em 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const app = new BingoApp(page);
  // Se algum elemento for mais largo que a tela, o navegador do celular alarga a página
  // (innerWidth passa de 360) e partes dela ficam fora da área visível.
  const semRolagemLateral = async (tela: string) => {
    const larguras = await page.evaluate(() => ({
      pagina: window.innerWidth,
      conteudo: document.documentElement.scrollWidth,
      visivel: window.visualViewport?.width ?? window.innerWidth,
    }));
    expect(larguras, tela).toEqual({ pagina: 360, conteudo: 360, visivel: 360 });
    expect(await app.numerosForaDosCartoes(), tela).toEqual([]);
  };
  await app.abrirInicio();
  await semRolagemLateral('início');
  await page.locator('.start-card').getByRole('button', { name: 'Iniciar jogo' }).click();
  await page.locator('.round-btn').first().click();
  await app.abrirGrupoModos('Linhas');
  await app.abrirGrupoModos('Figuras');
  await semRolagemLateral('nova partida');
  await page.locator('.action-bar').getByRole('button', { name: 'Iniciar jogo' }).click();
  for (const n of [6, 5, 9, 41, 72]) await marcar(app, n);
  await semRolagemLateral('partida');
  await app.verPainel('Painel');
  await semRolagemLateral('painel 1 a 75');
  await app.visaoCompacta(true);
  await semRolagemLateral('visão compacta');
  await app.visaoCompacta(false);
  await finalizar(app);
  await page.locator('.history-item').first().click();
  await semRolagemLateral('histórico');
});

test('interface sem emojis, setas ou travessões', async ({ page }) => {
  const proibidos = /[–—←-⇿➔-➿⬅-⬇\u{1f300}-\u{1faff}\u{2600}-\u{26ff}]/u;
  const conferir = async (tela: string) => {
    const texto = await page.evaluate(() => document.body.innerText);
    expect(texto.match(proibidos), tela).toBeNull();
  };
  const app = new BingoApp(page);
  await app.abrirInicio();
  await conferir('início');
  await page.locator('.start-card').getByRole('button', { name: 'Iniciar jogo' }).click();
  for (const grupo of ['Linhas', 'Figuras']) await app.abrirGrupoModos(grupo);
  await page.locator('.round-btn').first().click();
  await app.escolherModo('quina');
  await conferir('nova partida');
  await page.locator('.action-bar').getByRole('button', { name: 'Iniciar jogo' }).click();
  for (const n of [3, 20, 50, 68]) await app.digitar(String(n), 'enter');
  await expect(app.avisoBingo).toBeVisible();
  await conferir('partida com aviso de BINGO');
  await app.verPainel('Painel');
  await conferir('painel');
});
