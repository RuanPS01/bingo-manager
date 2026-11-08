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

  async verPainel(visao: 'Ordem' | 'Painel') {
    const botao = this.page.locator('.draws-panel .segmented button', { hasText: visao });
    if ((await botao.getAttribute('aria-pressed')) !== 'true') await botao.click();
  }

  async tocarNoPainel(n: number) {
    await this.verPainel('Painel');
    await this.page.locator(`.ball-board button[data-ball="${n}"]`).click();
  }

  /** Responde à confirmação, que sempre abre por cima de qualquer outra janela. */
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
