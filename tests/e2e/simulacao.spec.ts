import { expect, test } from '@playwright/test';
import { BingoApp } from './app';
import {
  CARTELAS,
  MODOS,
  NOMES_MODOS,
  NUMEROS_CARTELAS,
  PREMIOS,
  bola,
  completouEm,
  faltaUm,
  letra,
  marcados,
  rng,
} from './oracle';

/**
 * Simulação de 20 partidas para cada cartela, usando o campo de número como
 * um usuário faria. A cada número sorteado o resultado do app é comparado com
 * o oráculo independente (tests/e2e/oracle.ts).
 *
 * Fluxos exercitados: escolha de jogos pela rodada, pela cartela inteira e jogo
 * a jogo; os 23 modos; digitação em vários formatos com Enter, com o botão
 * Marcar e pelo painel de 1 a 75; números inválidos e repetidos; desfazer;
 * remover número (cancelando e confirmando); recarregar a página; sair e
 * continuar; editar modos no meio da partida; renomear a cartela; ordenar por
 * proximidade; som e tela ligada; aviso de BINGO; finalizar pela partida e pelo
 * início; abrir o histórico; reabrir uma partida finalizada.
 */

const PARTIDAS_POR_CARTELA = Number(process.env.PARTIDAS ?? 20);
const MIN_SORTEIOS = 22;

interface Jogo {
  key: string;
  cartela: string;
  premio: string;
}

interface Conquista {
  game: string;
  mode: string;
  at: number;
  ball: number;
}

const ordenar = (lista: Conquista[]) =>
  [...lista].sort((a, b) => a.at - b.at || a.game.localeCompare(b.game) || a.mode.localeCompare(b.mode));

class Partida {
  sorteios: number[] = [];

  constructor(
    readonly titulo: string,
    readonly jogos: Jogo[],
    readonly modos: string[],
    readonly nomes: Record<string, string>,
  ) {}

  grade(j: Jogo) {
    return CARTELAS[j.cartela].grade;
  }

  conquistas(): Conquista[] {
    const out: Conquista[] = [];
    for (const j of this.jogos) {
      for (const m of this.modos) {
        const at = completouEm(this.grade(j), m, this.sorteios);
        if (at !== null) out.push({ game: j.key, mode: m, at, ball: this.sorteios[at - 1] });
      }
    }
    return out;
  }

  novasNoUltimo(): number {
    return this.conquistas().filter((c) => c.at === this.sorteios.length).length;
  }

  tudoCompleto(): boolean {
    return this.conquistas().length === this.jogos.length * this.modos.length;
  }

  alvos(): number[] {
    const set = new Set<number>();
    for (const j of this.jogos)
      for (const m of this.modos) faltaUm(this.grade(j), m, this.sorteios).forEach((n) => set.add(n));
    return [...set].sort((a, b) => a - b);
  }

  /** Mensagem que o app deve mostrar depois de marcar n (n já incluído em sorteios). */
  mensagem(n: number): string {
    const novas = this.novasNoUltimo();
    if (novas > 0) return `${bola(n)} completou ${novas} conquista(s)!`;
    const acertos = this.jogos.filter((j) => this.grade(j).includes(n));
    if (acertos.length > 0) {
      const nomes = [...new Set(acertos.map((j) => this.nomes[j.cartela] || `Cartela ${j.cartela}`))];
      return `${bola(n)} marcado em ${acertos.length} jogo(s): ${nomes.join(', ')}.`;
    }
    return `${bola(n)} registrado. Não está nas cartelas desta partida.`;
  }
}

function tituloSugerido(jogos: Jogo[]): string {
  const premios = [...new Set(jogos.map((j) => j.premio))].map((id) => PREMIOS.find((p) => p.id === id)!);
  if (premios.length === 1) return `${premios[0].rodada}ª rodada: ${premios[0].nome}`;
  return premios
    .sort((a, b) => a.rodada - b.rodada)
    .map((p) => p.nome)
    .join(' + ');
}

function formatar(n: number, k: number): string {
  const p2 = String(n).padStart(2, '0');
  return [String(n), p2, `${letra(n)}${n}`, `${letra(n).toLowerCase()}-${p2}`][k % 4];
}

function configurar(cartela: string, i: number) {
  const idx = NUMEROS_CARTELAS.indexOf(cartela);
  const r = rng(Number(cartela) * 1000 + i);
  let selecao: 'rodada' | 'cartela' | 'chips';
  let pares: { cartela: string; premio: string }[];
  let rodada: (typeof PREMIOS)[number] | undefined;

  if (i % 5 === 0) {
    selecao = 'rodada';
    rodada = PREMIOS[(i / 5 + idx) % PREMIOS.length];
    pares = NUMEROS_CARTELAS.map((c) => ({ cartela: c, premio: rodada!.id }));
  } else if (i % 5 === 1) {
    selecao = 'cartela';
    pares = PREMIOS.map((p) => ({ cartela, premio: p.id }));
  } else {
    selecao = 'chips';
    const premios = r.shuffle(PREMIOS.map((p) => p.id)).slice(0, 1 + r.int(3));
    pares = premios.map((premio) => ({ cartela, premio }));
    if (r.chance(0.35)) {
      const outra = r.shuffle(NUMEROS_CARTELAS.filter((c) => c !== cartela))[0];
      pares.push({ cartela: outra, premio: PREMIOS[r.int(PREMIOS.length)].id });
    }
  }

  const ordemPremio = (id: string) => PREMIOS.findIndex((p) => p.id === id);
  const jogos: Jogo[] = pares
    .sort(
      (a, b) =>
        NUMEROS_CARTELAS.indexOf(a.cartela) - NUMEROS_CARTELAS.indexOf(b.cartela) ||
        ordemPremio(a.premio) - ordemPremio(b.premio),
    )
    .map((p) => ({ ...p, key: `cartela-${p.cartela}::${p.premio}` }));

  // A rotação garante que os 23 modos apareçam nas 20 partidas de cada cartela.
  const modos = [
    ...new Set([
      MODOS[(2 * i + idx * 7) % MODOS.length],
      MODOS[(2 * i + 1 + idx * 7) % MODOS.length],
      ...(r.chance(0.3) ? [MODOS[r.int(MODOS.length)]] : []),
    ]),
  ];
  const titulo = i % 2 === 0 ? `Simulação ${cartela} nº ${i + 1}` : null;
  return { selecao, rodada, jogos, modos, titulo, ordem: r.shuffle(Array.from({ length: 75 }, (_, n) => n + 1)) };
}

for (const cartela of NUMEROS_CARTELAS) {
  test(`20 partidas com a cartela ${cartela}`, async ({ page }) => {
    const app = new BingoApp(page);
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') erros.push(`console: ${m.text()}`);
    });

    const nomes: Record<string, string> = Object.fromEntries(NUMEROS_CARTELAS.map((c) => [c, CARTELAS[c].nome]));
    const registros: number[][] = [];
    const resumo = { sorteios: 0, conquistas: 0, comemoracoes: 0, conferencias: 0, eventos: new Set<string>() };

    await app.abrirInicio();
    for (const c of NUMEROS_CARTELAS) {
      await expect(page.locator(`.card-item[data-card="${c}"] .card-name-text`)).toHaveText(nomes[c]);
    }

    for (let i = 0; i < PARTIDAS_POR_CARTELA; i++) {
      await test.step(`Partida ${i + 1}`, async () => {
        const cfg = configurar(cartela, i);
        const titulo = cfg.titulo ?? tituloSugerido(cfg.jogos);
        const p = new Partida(titulo, cfg.jogos, [...cfg.modos], nomes);
        const fila = [...cfg.ordem];
        let visao: 'Ordem' | 'Painel' = 'Ordem';
        // Posição do sorteio em que o aviso de BINGO apareceu (ele some depois de 3 números).
        let aviso: number | null = null;

        // ---------- Configuração ----------
        await page.locator('.start-card').getByRole('button', { name: 'Iniciar jogo' }).click();
        await expect(page.locator('.setup')).toBeVisible();
        if (cfg.selecao === 'rodada') {
          await page.locator('.round-btn', { hasText: `${cfg.rodada!.rodada}ª rodada` }).click();
          resumo.eventos.add('seleção pela rodada');
        } else if (cfg.selecao === 'cartela') {
          await page.locator(`.setup-card[data-card="${cartela}"] .setup-card-head`).click();
          resumo.eventos.add('seleção da cartela inteira');
        } else {
          for (const j of p.jogos) await app.chipJogo(j.cartela, j.premio).click();
          resumo.eventos.add('seleção jogo a jogo');
        }
        for (const j of p.jogos)
          await expect(app.chipJogo(j.cartela, j.premio)).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.setup .chip-toggle[aria-pressed="true"]')).toHaveCount(p.jogos.length);

        await app.painel('Modos que valem').getByRole('button', { name: 'Limpar' }).click();
        for (const m of p.modos) await app.escolherModo(m);
        await expect(page.locator('.mode-option[aria-pressed="true"]')).toHaveCount(p.modos.length);
        if (cfg.titulo) await page.getByRole('textbox', { name: 'Nome da partida' }).fill(cfg.titulo);

        const nCartelas = new Set(p.jogos.map((j) => j.cartela)).size;
        await expect(page.locator('.action-summary')).toContainText(
          `${p.jogos.length} jogo(s) em ${nCartelas} cartela(s), ${p.modos.length} modo(s)`,
        );
        await page.locator('.action-bar').getByRole('button', { name: 'Iniciar jogo' }).click();
        await expect(page.locator('.match-title strong')).toHaveText(titulo);
        await expect(app.feedback).toHaveText('Digite o primeiro número sorteado e toque em Marcar.');
        // algumas partidas inteiras são jogadas na visão compacta
        const compacta = i % 5 === 3;
        await app.visaoCompacta(compacta);
        await expect(page.locator('.games-grid-compact')).toHaveCount(compacta ? 1 : 0);
        if (compacta) resumo.eventos.add('visão compacta');

        // ---------- Funções da partida ----------
        const conferir = async () => {
          if (visao !== 'Ordem') {
            await app.verPainel('Ordem');
            visao = 'Ordem';
          }
          const tela = await app.lerTela();
          const esperadas = p.conquistas();
          expect(ordenar(tela.conquistas)).toEqual(ordenar(esperadas));
          expect(tela.jogos.map((j) => j.key).sort()).toEqual(p.jogos.map((j) => j.key).sort());
          for (const jt of tela.jogos) {
            const jogo = p.jogos.find((j) => j.key === jt.key)!;
            expect(jt.marked, `marcados em ${jt.key}`).toBe(marcados(p.grade(jogo), p.sorteios));
            expect(jt.modos.map((m) => m.mode)).toEqual(p.modos);
            for (const m of jt.modos) {
              expect(m.done, `${jt.key} ${m.mode}`).toBe(String(completouEm(p.grade(jogo), m.mode, p.sorteios) ?? ''));
            }
          }
          expect([...tela.alvos].sort((a, b) => a - b)).toEqual(p.alvos());
          expect(tela.fichas).toEqual([...p.sorteios].reverse());
          resumo.conferencias++;
        };

        const sortear = async (n: number, metodo: 'enter' | 'botao' | 'painel') => {
          p.sorteios.push(n);
          const esperado = p.mensagem(n);
          const novas = p.novasNoUltimo();
          if (metodo === 'painel') {
            await app.tocarNoPainel(n);
            visao = 'Painel';
          } else {
            await app.digitar(formatar(n, p.sorteios.length), metodo);
          }
          await expect(app.feedback).toHaveText(esperado);
          if (novas > 0) {
            // o aviso aparece sem bloquear: o campo continua ativo para o próximo número
            aviso = p.sorteios.length;
            await expect(app.avisoBingo.locator('li')).toHaveCount(novas);
            if (metodo !== 'painel') await expect(app.input).toBeFocused();
            resumo.comemoracoes++;
            if (p.sorteios.length % 4 === 0) {
              await page.getByRole('button', { name: 'Fechar aviso de BINGO' }).click();
              aviso = null;
              resumo.eventos.add('fechar aviso de BINGO');
            } else {
              resumo.eventos.add('seguir jogando com o aviso de BINGO aberto');
            }
          } else if (aviso !== null && p.sorteios.length >= aviso + 3) {
            aviso = null;
          }
          await expect(app.avisoBingo).toHaveCount(aviso === null ? 0 : 1);
          resumo.sorteios++;
        };

        // ---------- Sorteio ----------
        let primeiraConquista: number | null = null;
        // Cada ação especial acontece uma única vez por partida (remover e sortear de novo
        // faz a contagem voltar ao mesmo valor, e sem isso a ação se repetiria).
        const feitos = new Set<number>();
        const quando = (marca: number, condicao = true) => {
          if (!condicao || p.sorteios.length !== marca || feitos.has(marca)) return false;
          feitos.add(marca);
          return true;
        };
        while (fila.length > 0) {
          const k = p.sorteios.length + 1;
          const metodo = k % 7 === 3 ? 'painel' : k % 3 === 1 ? 'botao' : 'enter';
          await sortear(fila.shift()!, metodo);
          const total = p.sorteios.length;
          if (primeiraConquista === null && p.conquistas().length > 0) primeiraConquista = total;

          if (quando(3)) {
            const invalido = ['0', '76', 'abc', ''][i % 4];
            await app.digitar(invalido, 'enter');
            await expect(app.feedback).toHaveText(
              invalido === '' ? 'Digite o número sorteado.' : 'Digite um número de 1 a 75.',
            );
            resumo.eventos.add('número inválido');
          }
          if (quando(5, i % 8 === 0)) {
            await page.getByRole('button', { name: 'Som ativado' }).click();
            await page.getByRole('button', { name: 'Som desativado' }).click();
            await page.getByRole('button', { name: 'Tela sempre ligada: ativado' }).click();
            await page.getByRole('button', { name: 'Tela sempre ligada: desativado' }).click();
            resumo.eventos.add('som e tela ligada');
          }
          if (quando(6)) {
            const repetido = p.sorteios[1];
            await app.digitar(formatar(repetido, i), 'enter');
            await expect(app.feedback).toHaveText(
              `${bola(repetido)} já foi sorteado (${p.sorteios.indexOf(repetido) + 1}º número).`,
            );
            resumo.eventos.add('número repetido');
          }
          if (quando(8, i % 6 === 4)) {
            const novo = `${CARTELAS[cartela].nome} ${i + 1}`;
            const grupo = page.locator(`.card-group[data-card="${cartela}"]`);
            await grupo.getByRole('button', { name: `Renomear cartela ${cartela}` }).click();
            await grupo.getByRole('textbox', { name: `Nome da cartela ${cartela}` }).fill(novo);
            await grupo.getByRole('button', { name: 'Salvar' }).click();
            await expect(grupo.locator('.card-name-text')).toHaveText(novo);
            nomes[cartela] = novo;
            resumo.eventos.add('renomear cartela na partida');
          }
          if (quando(9)) {
            const ultimo = p.sorteios.pop()!;
            await page.getByRole('button', { name: 'Desfazer último número' }).click();
            await expect(app.feedback).toHaveText(`${bola(ultimo)} foi desfeito.`);
            aviso = null;
            await expect(app.avisoBingo).toHaveCount(0);
            await conferir();
            await sortear(ultimo, 'enter');
            resumo.eventos.add('desfazer');
          }
          if (quando(10, i % 4 === 1)) {
            await app.irParaInicio();
            await expect(page.locator('.active-card h2')).toHaveText(titulo);
            await expect(page.locator('.active-stats div').first().locator('strong')).toHaveText(
              String(p.sorteios.length),
            );
            await page.getByRole('button', { name: 'Continuar partida' }).click();
            await expect(app.input).toBeVisible();
            visao = 'Ordem';
            aviso = null;
            await conferir();
            resumo.eventos.add('sair e continuar');
          }
          if (quando(12, i % 5 === 2)) {
            const extra = ['quatro-cantos', 'moldura', 'letra-x', 'cruz'].find((m) => !p.modos.includes(m))!;
            await page.getByRole('button', { name: 'Editar jogos e modos' }).click();
            await expect(page.locator('.setup')).toBeVisible();
            await app.escolherModo(extra);
            await page.locator('.action-bar').getByRole('button', { name: 'Salvar alterações' }).click();
            p.modos.push(extra);
            await expect(page.locator('.modes-line')).toContainText(NOMES_MODOS[extra]);
            visao = 'Ordem';
            aviso = null;
            await conferir();
            resumo.eventos.add('editar modos na partida');
          }
          if (quando(15, i % 3 === 0)) {
            await page.reload();
            await expect(app.feedback).toHaveText(`${p.sorteios.length} de 75 números sorteados.`);
            visao = 'Ordem';
            aviso = null;
            await conferir();
            resumo.eventos.add('recarregar a página');
          }
          if (quando(18, i % 7 === 5)) {
            await page.getByRole('button', { name: 'Mais perto' }).click();
            await expect(page.getByRole('button', { name: 'Mais perto' })).toHaveAttribute('aria-pressed', 'true');
            await conferir();
            await page.getByRole('button', { name: 'Cartelas', exact: true }).click();
            resumo.eventos.add('ordenar por proximidade');
          }
          if (quando(20)) {
            const alvo = p.sorteios[4];
            if (visao !== 'Ordem') {
              await app.verPainel('Ordem');
              visao = 'Ordem';
            }
            const ficha = page.locator(`.draws-panel .ball-chip[data-ball="${alvo}"]`);
            if (i % 2 === 0) {
              await ficha.click();
              await expect(app.modal.getByRole('heading')).toHaveText(`Remover ${bola(alvo)}?`);
              await app.confirmar('Cancelar');
              await conferir();
              resumo.eventos.add('cancelar remoção');
            }
            await ficha.click();
            await app.confirmar('Remover');
            p.sorteios.splice(p.sorteios.indexOf(alvo), 1);
            await expect(app.feedback).toHaveText(`${bola(alvo)} removido dos sorteados.`);
            aviso = null;
            await expect(app.avisoBingo).toHaveCount(0);
            await conferir();
            fila.unshift(alvo);
            resumo.eventos.add('remover número');
          }
          if (total % 10 === 0) await conferir();

          const minimo = p.sorteios.length >= MIN_SORTEIOS;
          const paradaAntecipada =
            i % 4 === 3 && primeiraConquista !== null && p.sorteios.length >= primeiraConquista + 3;
          if (minimo && (p.tudoCompleto() || paradaAntecipada)) break;
        }
        await conferir();
        resumo.conquistas += p.conquistas().length;

        // ---------- Finalização ----------
        const finalizarPelaPartida = async () => {
          await page.getByRole('button', { name: 'Finalizar partida' }).click();
          await expect(app.modal.getByRole('heading')).toHaveText('Finalizar partida?');
          await app.confirmar('Finalizar');
          await expect(page.locator('.hero')).toBeVisible();
        };

        if (i % 3 === 1) {
          await app.irParaInicio();
          await page.locator('.active-card').getByRole('button', { name: 'Finalizar' }).click();
          await app.confirmar('Finalizar');
          resumo.eventos.add('finalizar pelo início');
        } else {
          await finalizarPelaPartida();
          resumo.eventos.add('finalizar pela partida');
        }
        await expect(page.locator('.active-card')).toHaveCount(0);
        await expect(page.locator('.history-item')).toHaveCount(i + 1);
        await expect(page.locator('.history-item').first()).toContainText(titulo);

        if (i % 3 === 2) {
          await page.locator('.history-item').first().click();
          await expect(page.locator('.readonly-bar')).toContainText(`${p.sorteios.length} números sorteados.`);
          await expect(app.input).toHaveCount(0);
          const tela = await app.lerTela();
          expect(ordenar(tela.conquistas)).toEqual(ordenar(p.conquistas()));
          resumo.eventos.add('ver partida no histórico');

          if (i % 6 === 2 && fila.length > 0) {
            await page.getByRole('button', { name: 'Reabrir partida' }).click();
            await expect(app.input).toBeVisible();
            visao = 'Ordem';
            aviso = null;
            await sortear(fila.shift()!, 'enter');
            await conferir();
            await finalizarPelaPartida();
            await expect(page.locator('.history-item')).toHaveCount(i + 1);
            resumo.eventos.add('reabrir partida');
          } else {
            await app.irParaInicio();
          }
        }

        // Nome atual de cada cartela também na tela inicial.
        for (const c of NUMEROS_CARTELAS) {
          await expect(page.locator(`.card-item[data-card="${c}"] .card-name-text`)).toHaveText(nomes[c]);
        }
        registros.unshift([...p.sorteios]);
        expect(erros, 'erros no navegador').toEqual([]);
      });
    }

    // ---------- Conferência final do que ficou salvo ----------
    const salvo = await app.lerArmazenamento<{ activeMatch: unknown; history: { draws: number[] }[] }>();
    expect(salvo.activeMatch).toBeNull();
    expect(salvo.history).toHaveLength(PARTIDAS_POR_CARTELA);
    expect(salvo.history.map((h) => h.draws)).toEqual(registros);

    const texto = [
      `cartela ${cartela}: ${PARTIDAS_POR_CARTELA} partidas`,
      `${resumo.sorteios} números marcados pelo campo`,
      `${resumo.conquistas} conquistas conferidas`,
      `${resumo.comemoracoes} avisos de BINGO`,
      `${resumo.conferencias} conferências completas da tela`,
      `fluxos: ${[...resumo.eventos].sort().join(', ')}`,
    ].join('; ');
    test.info().annotations.push({ type: 'resumo', description: texto });
    console.log(texto);
  });
}
