import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATOR_CONFIG } from '../data/constants';
import type { GeneratorConfig } from '../types';
import { validateGrid } from './bingo';
import { cardNumber, cardsToCsv, generateCards, generateGrid } from './cardgen';
import { renderPdf } from './pdf';
import { MIN_CELL_MM, cellSizeMm, layoutPages, perPageOptions } from './printLayout';

const config = (patch: Partial<GeneratorConfig> = {}): GeneratorConfig => ({ ...DEFAULT_GENERATOR_CONFIG, ...patch });

/** Texto de todas as páginas de um PDF sem compressão (operadores Tj). */
function pdfTexts(buffer: ArrayBuffer): string[] {
  const raw = Buffer.from(buffer).toString('latin1');
  return [...raw.matchAll(/\((.*?)\) Tj/g)].map((m) => m[1]);
}

describe('generateGrid', () => {
  it('respeita as faixas das colunas, sem repetir números, com espaço livre', () => {
    for (let i = 0; i < 200; i++) {
      const grid = generateGrid({ freeCenter: true, sortColumns: false });
      expect(grid[12]).toBe(0);
      expect(validateGrid(grid).size).toBe(0);
    }
  });

  it('sem espaço livre, o centro também recebe um número da coluna N', () => {
    const grid = generateGrid({ freeCenter: false, sortColumns: false });
    expect(grid[12]).toBeGreaterThanOrEqual(31);
    expect(grid[12]).toBeLessThanOrEqual(45);
    expect(new Set(grid).size).toBe(25);
  });

  it('ordena cada coluna quando pedido', () => {
    const grid = generateGrid({ freeCenter: true, sortColumns: true });
    for (let c = 0; c < 5; c++) {
      const column = [0, 1, 2, 3, 4].map((r) => grid[r * 5 + c]).filter((n) => n !== 0);
      expect(column).toEqual([...column].sort((a, b) => a - b));
    }
  });
});

describe('generateCards', () => {
  it('numera com zeros à esquerda e não repete tabelas no lote', () => {
    const cards = generateCards(config({ quantity: 300, gamesPerCard: 3, startNumber: 7 }));
    expect(cards).toHaveLength(300);
    expect(cards[0].number).toBe('0007');
    expect(cards[299].number).toBe('0306');
    const keys = cards.flatMap((c) => c.games.map((g) => g.grid.join(',')));
    expect(new Set(keys).size).toBe(900);
    expect(cards[0].games.map((g) => g.name)).toEqual(['Rodada 1', 'Rodada 2', 'Rodada 3']);
  });

  it('com mesmos números, todos os jogos da cartela são iguais e as cartelas diferentes entre si', () => {
    const cards = generateCards(config({ quantity: 50, gamesPerCard: 5, sameNumbers: true }));
    for (const card of cards) for (const g of card.games) expect(g.grid).toEqual(card.games[0].grid);
    expect(new Set(cards.map((c) => c.games[0].grid.join(','))).size).toBe(50);
  });

  it('jogos avulsos têm um jogo cada', () => {
    const cards = generateCards(config({ kind: 'avulsos', quantity: 12, gamesPerCard: 4 }));
    expect(cards.every((c) => c.games.length === 1)).toBe(true);
  });

  it('cardNumber acompanha a quantidade de dígitos do último número', () => {
    expect(cardNumber(5, 20)).toBe('0005');
    expect(cardNumber(5, 12345)).toBe('00005');
  });

  it('lista de conferência em CSV, uma linha por jogo, lida por coluna', () => {
    const cards = generateCards(config({ quantity: 2, gamesPerCard: 2 }));
    const lines = cardsToCsv(cards).split('\r\n');
    expect(lines).toHaveLength(5);
    expect(lines[0].split(';').slice(0, 4)).toEqual(['cartela', 'jogo', 'B1', 'B2']);
    const first = lines[1].split(';');
    expect(first[0]).toBe('0001');
    expect(first[2]).toBe(String(cards[0].games[0].grid[0]));
    expect(first[2 + 12]).toBe('LIVRE');
  });
});

describe('layout e PDF', () => {
  it('distribui as cartelas nas páginas conforme a quantidade por página', () => {
    expect(layoutPages(config({ quantity: 10, perPage: 4 }), generateCards(config({ quantity: 10 })))).toHaveLength(3);
    expect(perPageOptions('cartelas')).toEqual([1, 2, 4]);
    expect(perPageOptions('avulsos')).toContain(12);
  });

  it('todo o desenho fica dentro da página', () => {
    for (const kind of ['cartelas', 'avulsos'] as const) {
      for (const perPage of perPageOptions(kind)) {
        const c = config({
          kind,
          perPage,
          quantity: perPage,
          gamesPerCard: 6,
          footer: 'Rodapé',
          subtitle: 'Sábado, 20h',
        });
        const [page] = layoutPages(c, generateCards(c));
        for (const op of page.ops) {
          const xs = op.t === 'line' ? [op.x1, op.x2] : op.t === 'rect' ? [op.x, op.x + op.w] : [op.x];
          const ys = op.t === 'line' ? [op.y1, op.y2] : op.t === 'rect' ? [op.y, op.y + op.h] : [op.y];
          for (const x of xs) expect(x >= 0 && x <= page.w).toBe(true);
          for (const y of ys) expect(y >= 0 && y <= page.h).toBe(true);
        }
      }
    }
  });

  it('avisa quando as células ficam pequenas demais', () => {
    expect(cellSizeMm(config({ gamesPerCard: 1, perPage: 1 }))).toBeGreaterThan(20);
    expect(cellSizeMm(config({ gamesPerCard: 6, perPage: 4 }))).toBeLessThan(MIN_CELL_MM + 4);
  });

  it('gera o PDF com uma página por grupo e os números de cada cartela', async () => {
    const c = config({ quantity: 3, perPage: 2, gamesPerCard: 2, title: 'Bingo da Escola', subtitle: 'Sábado às 20h' });
    const cards = generateCards(c);
    const buffer = await renderPdf(layoutPages(c, cards), { title: c.title }, { compress: false });
    const raw = Buffer.from(buffer).toString('latin1');
    expect(raw.startsWith('%PDF-')).toBe(true);
    expect(raw.match(/\/Type \/Page\b/g)).toHaveLength(2);
    const texts = pdfTexts(buffer);
    expect(texts).toContain('Bingo da Escola');
    // o PDF guarda os acentos em WinAnsi: lido como latin1, o texto volta igual
    expect(texts).toContain('Sábado às 20h');
    expect(texts.filter((t) => t.startsWith('Nº '))).toEqual(['Nº 0001', 'Nº 0002', 'Nº 0003']);
    for (const n of cards[0].games[0].grid.filter((v) => v !== 0)) expect(texts).toContain(String(n).padStart(2, '0'));
  });

  it('o PDF comprimido também abre (streams com Flate)', async () => {
    const c = config({ quantity: 1 });
    const buffer = await renderPdf(layoutPages(c, generateCards(c)), { title: 'x' });
    const raw = Buffer.from(buffer);
    const text = raw.toString('latin1');
    expect(text).toContain('/FlateDecode');
    const start = text.indexOf('stream\n') + 7;
    const end = text.indexOf('endstream', start);
    expect(inflateSync(raw.subarray(start, end)).toString('latin1')).toContain('Tj');
  });
});
