import { expect, test, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test';
import { BingoApp, cadastrarCartelas } from './app';
import { bola } from './oracle';

/**
 * Transmissão do sorteio: o sorteador e o participante rodam em navegadores
 * separados (cada um com seus dados) e conversam por um servidor MQTT simulado
 * aqui no teste, escrito à parte do cliente do app a partir da especificação
 * MQTT 3.1.1. Nenhum teste usa os servidores públicos de verdade.
 */

const HOSTS = /^wss:\/\/broker\.(emqx\.io:8084|hivemq\.com:8884)\/mqtt$/;

interface Cliente {
  ws: WebSocketRoute;
  host: string;
  topicos: Set<string>;
  buffer: Buffer;
}

function tamanho(n: number): number[] {
  const out: number[] = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}

function publish(topico: string, conteudo: string, retido: boolean): Buffer {
  const t = Buffer.from(topico);
  const corpo = Buffer.concat([Buffer.from([t.length >> 8, t.length & 0xff]), t, Buffer.from(conteudo)]);
  return Buffer.concat([Buffer.from([0x30 | (retido ? 1 : 0), ...tamanho(corpo.length)]), corpo]);
}

/** Dois servidores independentes (um por endereço), com mensagens retidas e repasse por tópico. */
class ServidorFalso {
  clientes = new Set<Cliente>();
  retidas = new Map<string, string>();
  fora = new Set<string>();
  /** CONNECTs recebidos, para conferir o que o app manda. */
  conexoes: { protocolo: string; nivel: number; flags: number; id: string }[] = [];

  async ligar(context: BrowserContext) {
    await context.routeWebSocket(HOSTS, (ws) => {
      const host = new URL(ws.url()).hostname;
      if (this.fora.has(host)) {
        void ws.close({ code: 1011, reason: 'fora do ar' });
        return;
      }
      const cliente: Cliente = { ws, host, topicos: new Set(), buffer: Buffer.alloc(0) };
      this.clientes.add(cliente);
      ws.onMessage((m) => this.receber(cliente, typeof m === 'string' ? Buffer.from(m) : m));
      ws.onClose(() => this.clientes.delete(cliente));
    });
  }

  derrubar(host: string) {
    this.fora.add(host);
    for (const c of this.clientes) if (c.host === host) void c.ws.close({ code: 1011 });
  }

  /** Publica como se fosse outra pessoa usando o mesmo código. */
  injetar(topico: string, conteudo: string) {
    for (const host of ['broker.emqx.io', 'broker.hivemq.com']) this.entregar(host, topico, conteudo, true);
  }

  ultimaRetida(topico: string): string | undefined {
    return this.retidas.get(`broker.emqx.io ${topico}`) ?? this.retidas.get(`broker.hivemq.com ${topico}`);
  }

  private entregar(host: string, topico: string, conteudo: string, reter: boolean) {
    if (reter) this.retidas.set(`${host} ${topico}`, conteudo);
    for (const c of this.clientes) {
      if (c.host === host && c.topicos.has(topico)) c.ws.send(publish(topico, conteudo, false));
    }
  }

  private receber(c: Cliente, dados: Buffer) {
    c.buffer = Buffer.concat([c.buffer, dados]);
    for (;;) {
      if (c.buffer.length < 2) return;
      let n = 0;
      let mult = 1;
      let i = 1;
      let byte: number;
      do {
        byte = c.buffer[i++];
        n += (byte & 0x7f) * mult;
        mult *= 128;
      } while (byte & 0x80 && i < c.buffer.length);
      if (c.buffer.length < i + n) return;
      const tipo = c.buffer[0] >> 4;
      const flags = c.buffer[0] & 0x0f;
      const corpo = c.buffer.subarray(i, i + n);
      c.buffer = c.buffer.subarray(i + n);
      this.pacote(c, tipo, flags, corpo);
    }
  }

  private pacote(c: Cliente, tipo: number, flags: number, corpo: Buffer) {
    const texto = (inicio: number) => {
      const len = corpo.readUInt16BE(inicio);
      return { valor: corpo.subarray(inicio + 2, inicio + 2 + len).toString('utf8'), fim: inicio + 2 + len };
    };
    if (tipo === 1) {
      const protocolo = texto(0);
      const nivel = corpo[protocolo.fim];
      const conexaoFlags = corpo[protocolo.fim + 1];
      const id = texto(protocolo.fim + 4).valor;
      this.conexoes.push({ protocolo: protocolo.valor, nivel, flags: conexaoFlags, id });
      c.ws.send(Buffer.from([0x20, 2, 0, protocolo.valor === 'MQTT' && nivel === 4 ? 0 : 1]));
    } else if (tipo === 8) {
      const id = corpo.readUInt16BE(0);
      const topico = texto(2).valor;
      c.topicos.add(topico);
      c.ws.send(Buffer.from([0x90, 3, id >> 8, id & 0xff, 0]));
      const retida = this.retidas.get(`${c.host} ${topico}`);
      if (retida) c.ws.send(publish(topico, retida, true));
    } else if (tipo === 3) {
      const { valor: topico, fim } = texto(0);
      this.entregar(c.host, topico, corpo.subarray(fim).toString('utf8'), (flags & 1) === 1);
    } else if (tipo === 12) {
      c.ws.send(Buffer.from([0xd0, 0]));
    } else if (tipo === 14) {
      void c.ws.close();
    }
  }
}

// ---------------------------------------------------------------- ações

const sorteador = (page: Page) => page.getByTestId('sorteador');
const painelTransmissao = (page: Page) => page.getByRole('region', { name: 'Transmissão para os participantes' });

async function abrirSorteadorTransmitindo(page: Page) {
  await page.goto('./#/sorteador');
  await page.getByRole('button', { name: 'Configurações do sorteio' }).click();
  const config = page.locator('section.drawer-settings');
  await config.getByRole('group', { name: 'Animação' }).getByRole('button', { name: 'Sem animação' }).click();
  await config.getByLabel(/Transmitir os números para os celulares/).check();
  const codigo = painelTransmissao(page).locator('.broadcast-code');
  await expect(codigo).toHaveAttribute('data-code', /^[0-9A-Z]{8}$/);
  return (await codigo.getAttribute('data-code'))!;
}

async function sortear(page: Page): Promise<number> {
  const antes = await sorteador(page).locator('.drawer-cell.is-drawn').count();
  await sorteador(page).getByRole('button', { name: 'Sortear', exact: true }).click();
  await expect(sorteador(page).locator('.drawer-cell.is-drawn')).toHaveCount(antes + 1);
  return Number(await sorteador(page).locator('.drawer-ball').getAttribute('data-ball'));
}

async function iniciarPartida(page: Page) {
  await page.locator('.start-card').getByRole('button', { name: 'Iniciar jogo' }).click();
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.locator('.action-bar').getByRole('button', { name: 'Iniciar jogo' }).click();
  await expect(page.getByRole('textbox', { name: 'Número sorteado' })).toBeVisible();
}

const fichas = (page: Page) =>
  page
    .locator('.draws-panel .ball-chip')
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.ball)).reverse());

const faixa = (page: Page) => page.locator('.remote-bar');

async function finalizar(app: BingoApp) {
  await app.page.getByRole('button', { name: 'Finalizar partida' }).click();
  await app.confirmar('Finalizar');
}

async function novoContexto(browser: import('@playwright/test').Browser, baseURL: string | undefined) {
  return browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
}

test('o sorteador transmite e o participante recebe na partida: desfazer, novo sorteio e fim da transmissão', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const servidor = new ServidorFalso();
  const ctxSorteador = await novoContexto(browser, baseURL);
  await servidor.ligar(ctxSorteador);
  await servidor.ligar(context);
  const pSorteador = await ctxSorteador.newPage();
  const erros: string[] = [];
  for (const p of [page, pSorteador]) p.on('pageerror', (e) => erros.push(e.message));

  // sorteador: liga a transmissão e mostra código, QR code e link
  const codigo = await abrirSorteadorTransmitindo(pSorteador);
  const painel = painelTransmissao(pSorteador);
  await expect(painel.getByRole('status')).toHaveText('Transmitindo');
  await expect(painel.locator('.broadcast-code')).toHaveText(`${codigo.slice(0, 4)}-${codigo.slice(4)}`);
  await expect(painel.locator('svg.qr-code')).toHaveAttribute('data-qr-text', new RegExp(`#/receber/${codigo}$`));
  // conexões dentro do padrão: MQTT 3.1.1, sessão limpa e identificador curto
  for (const c of servidor.conexoes) {
    expect(c).toMatchObject({ protocolo: 'MQTT', nivel: 4, flags: 0x02 });
    expect(c.id.length).toBeLessThanOrEqual(23);
  }
  const sorteadas = [await sortear(pSorteador), await sortear(pSorteador), await sortear(pSorteador)];

  // participante: entra na partida e digita o código (de qualquer jeito)
  await cadastrarCartelas(page);
  const app = new BingoApp(page);
  await app.abrirInicio();
  await iniciarPartida(page);
  await page.getByRole('button', { name: 'Receber números do sorteador' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Receber números do sorteador' });
  await dialogo.getByLabel('Código do sorteador').fill('1234');
  await dialogo.getByRole('button', { name: 'Receber' }).click();
  await expect(dialogo.getByRole('alert')).toContainText('O código tem 8 letras e números');
  await dialogo.getByLabel('Código do sorteador').fill(` ${codigo.slice(0, 4).toLowerCase()}-${codigo.slice(4)} `);
  await dialogo.getByRole('button', { name: 'Receber' }).click();
  await expect(faixa(page)).toContainText(`Sorteador ${codigo.slice(0, 4)}-${codigo.slice(4)}`);
  await expect(faixa(page)).toContainText('Os números chegam sozinhos nesta partida.');
  await expect.poll(() => fichas(page)).toEqual(sorteadas);
  await expect(app.feedback).toHaveText('Recebidos 3 números do sorteador.');

  // cada nova bola chega sozinha, com a mesma mensagem de quando é digitada
  const quarta = await sortear(pSorteador);
  await expect.poll(() => fichas(page)).toEqual([...sorteadas, quarta]);
  await expect(app.feedback).toContainText(bola(quarta));

  // um número digitado à mão convive com os recebidos
  const manual = [1, 2, 3, 4, 5, 6].find((n) => ![...sorteadas, quarta].includes(n))!;
  await app.digitar(String(manual), 'enter');

  // desfazer no sorteador tira a bola da partida, mas não a digitada à mão
  await sorteador(pSorteador).getByRole('button', { name: 'Desfazer' }).click();
  await expect.poll(() => fichas(page)).toEqual([...sorteadas, manual]);
  await expect(app.feedback).toHaveText(`${bola(quarta)} foi desfeito pelo sorteador.`);

  // recarregar a página continua recebendo
  await page.reload();
  await expect(faixa(page)).toContainText('Os números chegam sozinhos nesta partida.');
  const quinta = await sortear(pSorteador);
  await expect.poll(() => fichas(page)).toEqual([...sorteadas, manual, quinta]);

  // o sorteador reinicia: a partida que já estava aberta não muda
  await sorteador(pSorteador).getByRole('button', { name: 'Reiniciar' }).click();
  await pSorteador.locator('.modal').last().getByRole('button', { name: 'Reiniciar', exact: true }).click();
  await expect(faixa(page)).toContainText('O sorteador começou um novo sorteio.');
  await expect.poll(() => fichas(page)).toEqual([...sorteadas, manual, quinta]);

  // nova partida recebe o novo sorteio
  await finalizar(app);
  await iniciarPartida(page);
  await expect(faixa(page)).toContainText('Os números chegam sozinhos nesta partida.');
  const novas = [await sortear(pSorteador), await sortear(pSorteador)];
  await expect.poll(() => fichas(page)).toEqual(novas);

  // outra partida no mesmo sorteio espera, a não ser que a pessoa peça o sorteio atual
  await finalizar(app);
  await iniciarPartida(page);
  await expect(faixa(page)).toContainText('vai receber os números quando o sorteador começar um novo sorteio');
  expect(await fichas(page)).toEqual([]);
  await faixa(page).getByRole('button', { name: 'Usar o sorteio atual' }).click();
  await expect.poll(() => fichas(page)).toEqual(novas);
  await expect(faixa(page)).toContainText('Os números chegam sozinhos nesta partida.');

  // fim da transmissão
  await pSorteador
    .locator('section.drawer-settings')
    .getByLabel(/Transmitir os números/)
    .uncheck();
  await expect(painelTransmissao(pSorteador)).toHaveCount(0);
  await expect(faixa(page)).toContainText('O sorteador encerrou a transmissão.');

  // parar de receber
  await page.getByRole('button', { name: 'Receber números do sorteador' }).click();
  await dialogo.getByRole('button', { name: 'Parar de receber' }).click();
  await expect(faixa(page)).toHaveCount(0);
  expect(erros).toEqual([]);
  await ctxSorteador.close();
});

test('link do QR code, servidor fora do ar, mensagens falsas ignoradas e telão com o código', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const servidor = new ServidorFalso();
  servidor.fora.add('broker.hivemq.com');
  const ctxSorteador = await novoContexto(browser, baseURL);
  await servidor.ligar(ctxSorteador);
  await servidor.ligar(context);
  const pSorteador = await ctxSorteador.newPage();

  const codigo = await abrirSorteadorTransmitindo(pSorteador);
  await expect(painelTransmissao(pSorteador).getByRole('status')).toHaveText('Transmitindo por 1 de 2 servidores');
  const sorteadas = [await sortear(pSorteador), await sortear(pSorteador)];

  // o código continua o mesmo depois de recarregar, e a transmissão volta sozinha
  await pSorteador.reload();
  await expect(painelTransmissao(pSorteador).locator('.broadcast-code')).toHaveAttribute('data-code', codigo);

  // o link do QR code leva para a nova partida já com a recepção ligada
  await cadastrarCartelas(page);
  await page.goto(`./#/receber/${codigo.toLowerCase()}`);
  await expect(page).toHaveURL(/#\/nova-partida$/);
  await expect(page.locator('.setup-notice')).toContainText(
    `Os números do sorteador ${codigo.slice(0, 4)}-${codigo.slice(4)} entram na partida`,
  );
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.locator('.action-bar').getByRole('button', { name: 'Iniciar jogo' }).click();
  await expect.poll(() => fichas(page)).toEqual(sorteadas);

  // alguém publica no mesmo código: mensagem alterada e mensagem de outra chave são ignoradas
  const topico = `bingo-manager/v1/${codigo}`;
  const valida = JSON.parse(servidor.ultimaRetida(topico)!);
  const corpo = JSON.parse(valida.body);
  const alterada = { ...valida, body: JSON.stringify({ ...corpo, seq: corpo.seq + 1000, draws: [...corpo.draws, 7] }) };
  servidor.injetar(topico, JSON.stringify(alterada));
  servidor.injetar(topico, JSON.stringify({ pk: 'AAAA', body: alterada.body, sig: valida.sig }));
  servidor.injetar(topico, 'qualquer coisa');
  const terceira = await sortear(pSorteador);
  // só a bola de verdade entra: o 7 da mensagem alterada fica de fora
  await expect.poll(() => fichas(page)).toEqual([...sorteadas, terceira]);

  // telão: QR code e código num canto, junto com a bola
  await pSorteador.getByRole('button', { name: 'Modo telão (tela cheia)' }).click();
  const canto = pSorteador.getByRole('region', { name: 'Receber os números no celular' });
  await expect(canto).toBeVisible();
  await expect(canto).toContainText(`${codigo.slice(0, 4)}-${codigo.slice(4)}`);
  const [bolaBox, cantoBox] = [
    await sorteador(pSorteador).locator('.drawer-ball').boundingBox(),
    await canto.boundingBox(),
  ];
  const sobrepoe =
    bolaBox!.x < cantoBox!.x + cantoBox!.width &&
    cantoBox!.x < bolaBox!.x + bolaBox!.width &&
    bolaBox!.y < cantoBox!.y + cantoBox!.height &&
    cantoBox!.y < bolaBox!.y + bolaBox!.height;
  expect(sobrepoe).toBe(false);
  await ctxSorteador.close();
});

test('telas da transmissão legíveis no tema escuro e sem rolagem lateral no celular', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const servidor = new ServidorFalso();
  const ctxSorteador = await browser.newContext({
    baseURL,
    viewport: { width: 360, height: 740 },
    colorScheme: 'dark',
  });
  await servidor.ligar(ctxSorteador);
  await servidor.ligar(context);
  const pSorteador = await ctxSorteador.newPage();
  const sorteadorApp = new BingoApp(pSorteador);
  const codigo = await abrirSorteadorTransmitindo(pSorteador);
  await sortear(pSorteador);
  await expect.poll(() => sorteadorApp.textosComBaixoContraste()).toEqual([]);
  expect(await pSorteador.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 360, height: 740 });
  await cadastrarCartelas(page);
  const app = new BingoApp(page);
  await page.goto(`./#/receber/${codigo}`);
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.locator('.action-bar').getByRole('button', { name: 'Iniciar jogo' }).click();
  await expect(faixa(page)).toContainText('Os números chegam sozinhos');
  await expect.poll(() => app.textosComBaixoContraste()).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  await page.getByRole('button', { name: 'Receber números do sorteador' }).click();
  await expect.poll(() => app.textosComBaixoContraste()).toEqual([]);
  await ctxSorteador.close();
});
