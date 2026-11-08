import { expect, type Locator, type Page } from '@playwright/test';
import { GRUPO_MODO, NOMES_MODOS, PREMIOS } from './oracle';

export const STORAGE_KEY = 'bingo-apae-2026:v1';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface EstadoTela {
  conquistas: { game: string; mode: string; at: number; ball: number }[];
  jogos: { key: string; marked: number; modos: { mode: string; done: string }[] }[];
  alvos: number[];
  fichas: number[];
}

/** Ações de alto nível sobre o app, usadas pelos testes. */
export class BingoApp {
  constructor(readonly page: Page) {}

  get input(): Locator {
    return this.page.getByRole('textbox', { name: 'Número sorteado' });
  }

  get feedback(): Locator {
    return this.page.locator('.feedback');
  }

  /** Aviso de BINGO no topo da partida (não bloqueia a tela). */
  get avisoBingo(): Locator {
    return this.page.locator('.win-banner');
  }

  get modal(): Locator {
    return this.page.locator('.modal');
  }

  async abrirInicio() {
    await this.page.goto('./');
    await expect(this.page.locator('.hero')).toBeVisible();
  }

  async irParaInicio() {
    await this.page.getByRole('button', { name: 'Ir para o início' }).click();
    await expect(this.page.locator('.hero')).toBeVisible();
  }

  painel(titulo: string): Locator {
    return this.page.locator('.panel', { has: this.page.getByRole('heading', { name: titulo, exact: true }) });
  }

  async abrirGrupoModos(grupo: string) {
    const details = this.page.locator('details.mode-group', {
      has: this.page.locator('summary h3', { hasText: grupo }),
    });
    if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
  }

  opcaoModo(modo: string): Locator {
    return this.page
      .locator('.mode-option')
      .filter({ has: this.page.locator('strong', { hasText: new RegExp(`^${escapeRegex(NOMES_MODOS[modo])}$`) }) });
  }

  async escolherModo(modo: string) {
    await this.abrirGrupoModos(GRUPO_MODO[modo]);
    const opcao = this.opcaoModo(modo);
    if ((await opcao.getAttribute('aria-pressed')) !== 'true') await opcao.click();
    await expect(opcao).toHaveAttribute('aria-pressed', 'true');
  }

  chipJogo(cartela: string, premio: string): Locator {
    const nome = PREMIOS.find((p) => p.id === premio)!.nome;
    return this.page.locator(`.setup-card[data-card="${cartela}"] .chip-toggle`, { hasText: nome });
  }

  async digitar(texto: string, metodo: 'enter' | 'botao') {
    await this.input.fill(texto);
    if (metodo === 'enter') await this.input.press('Enter');
    else await this.page.getByRole('button', { name: 'Marcar', exact: true }).click();
  }

  /** Recolhe ou expande o card de números sorteados. */
  async numerosRecolhidos(recolhido: boolean) {
    const botao = this.page.locator('.draws-panel .panel-head button');
    if ((await botao.getAttribute('aria-expanded')) !== String(!recolhido)) await botao.click();
    await expect(botao).toHaveAttribute('aria-expanded', String(!recolhido));
  }

  async verPainel(visao: 'Ordem' | 'Painel') {
    // a escolha entre ordem e painel só aparece com o card expandido
    await this.numerosRecolhidos(false);
    const botao = this.page.locator('.draws-panel .segmented button', { hasText: visao });
    if ((await botao.getAttribute('aria-pressed')) !== 'true') await botao.click();
  }

  async tocarNoPainel(n: number) {
    await this.verPainel('Painel');
    await this.page.locator(`.ball-board button[data-ball="${n}"]`).click();
  }

  /** Responde à confirmação, que sempre abre por cima de qualquer outra janela. */
  /**
   * Lista números que saem do cartão ou ficam cortados na célula, em todas as
   * grades visíveis (partida, tela inicial e nova partida). Vazio quando está tudo certo.
   */
  async numerosForaDosCartoes(): Promise<string[]> {
    return this.page.evaluate(() => {
      const problemas: string[] = [];
      for (const card of document.querySelectorAll('.game-card, .card-item, .setup-card')) {
        const c = card.getBoundingClientRect();
        for (const cell of card.querySelectorAll<HTMLElement>('.bingo-cell')) {
          const r = cell.getBoundingClientRect();
          if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) {
            problemas.push(`fora do cartão: ${cell.textContent}`);
          }
          if (cell.scrollWidth > cell.clientWidth || cell.scrollHeight > cell.clientHeight) {
            problemas.push(`número cortado: ${cell.textContent}`);
          }
        }
      }
      return problemas;
    });
  }

  /**
   * Textos visíveis com contraste abaixo de 4,5 (WCAG AA) contra o fundo real
   * atrás deles. Textos sobre gradiente (cabeçalhos) não são medidos.
   */
  async textosComBaixoContraste(): Promise<string[]> {
    return this.page.evaluate(() => {
      type Cor = { r: number; g: number; b: number; a: number };
      const ler = (c: string): Cor | null => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1]
          .split(/[ ,/]+/)
          .filter(Boolean)
          .map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      const luz = ({ r, g, b }: Cor) => {
        const f = (v: number) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const misturar = (fg: Cor, bg: Cor): Cor => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      });
      const fundo = (el: Element): Cor | null => {
        const camadas: Cor[] = [];
        for (let e: Element | null = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
          const c = ler(cs.backgroundColor);
          if (c && c.a > 0) {
            camadas.push(c);
            if (c.a >= 1) break;
          }
        }
        let base: Cor = { r: 255, g: 255, b: 255, a: 1 };
        for (const c of camadas.reverse()) base = misturar(c, base);
        return base;
      };
      const problemas: string[] = [];
      const vistos = new Set<Element>();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const el = walker.currentNode.parentElement;
        const texto = walker.currentNode.textContent?.trim();
        if (!el || !texto || vistos.has(el) || el.classList.contains('sr-only')) continue;
        vistos.add(el);
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || Number(cs.opacity) < 0.6) continue;
        const bg = fundo(el);
        const fgBase = ler(cs.color);
        if (!bg || !fgBase) continue;
        const fg = misturar(fgBase, bg);
        const [a, b] = [luz(fg), luz(bg)];
        const razao = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (razao < 4.5) problemas.push(`${razao.toFixed(2)} "${texto.slice(0, 30)}" (${el.className || el.tagName})`);
      }
      return problemas;
    });
  }

  /** Liga ou desliga a visão compacta dos jogos da partida. */
  async visaoCompacta(ligada: boolean) {
    const botao = this.page.getByRole('button', { name: 'Visão compacta' });
    if ((await botao.getAttribute('aria-pressed')) !== String(ligada)) await botao.click();
    await expect(botao).toHaveAttribute('aria-pressed', String(ligada));
  }

  async confirmar(botao: string) {
    const antes = await this.modal.count();
    await this.modal.last().getByRole('button', { name: botao, exact: true }).click();
    await expect(this.modal).toHaveCount(botao === 'Cancelar' ? antes - 1 : 0);
  }

  async lerTela(): Promise<EstadoTela> {
    return this.page.evaluate(() => ({
      conquistas: [...document.querySelectorAll<HTMLElement>('.achievement-list li')].map((li) => ({
        game: li.dataset.game ?? '',
        mode: li.dataset.mode ?? '',
        at: Number(li.dataset.at),
        ball: Number(li.dataset.ball),
      })),
      jogos: [...document.querySelectorAll<HTMLElement>('.game-card')].map((el) => ({
        key: el.dataset.game ?? '',
        marked: Number(el.dataset.marked),
        modos: [...el.querySelectorAll<HTMLElement>('.mode-progress li')].map((li) => ({
          mode: li.dataset.mode ?? '',
          done: li.dataset.done ?? '',
        })),
      })),
      alvos: [...document.querySelectorAll<HTMLElement>('.panel-alert .ball-chip-target')].map((el) =>
        Number(el.dataset.ball),
      ),
      fichas: [...document.querySelectorAll<HTMLElement>('.draws-panel .ball-chip')].map((el) =>
        Number(el.dataset.ball),
      ),
    }));
  }

  async lerArmazenamento<T = unknown>(): Promise<T> {
    const text = await this.page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    return JSON.parse(text ?? 'null') as T;
  }
}
