import { FREE } from '../data/constants';
import type { GeneratorConfig } from '../types';
import { columnRange } from './bingo';
import { randomIndex } from './drawer';

export interface GeneratedGame {
  name: string;
  /** 25 números em ordem de linha; 0 no centro quando há espaço livre. */
  grid: number[];
}

export interface GeneratedCard {
  /** Número impresso, com zeros à esquerda (ex.: "0007"). */
  number: string;
  games: GeneratedGame[];
}

type Rand = (max: number) => number;

/** Embaralha uma cópia da lista (Fisher-Yates), com sorteio sem viés. */
function shuffle<T>(items: T[], rand: Rand): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Uma tabela BINGO 5x5: cada coluna com números da sua faixa (B 1 a 15, I 16 a 30...). */
export function generateGrid(opts: { freeCenter: boolean; sortColumns: boolean }, rand: Rand = randomIndex): number[] {
  const grid = new Array<number>(25).fill(FREE);
  for (let c = 0; c < 5; c++) {
    const [lo, hi] = columnRange(c);
    const pool = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const needed = c === 2 && opts.freeCenter ? 4 : 5;
    let picked = shuffle(pool, rand).slice(0, needed);
    if (opts.sortColumns) picked = picked.sort((a, b) => a - b);
    const rows = c === 2 && opts.freeCenter ? [0, 1, 3, 4] : [0, 1, 2, 3, 4];
    rows.forEach((r, i) => {
      grid[r * 5 + c] = picked[i];
    });
  }
  return grid;
}

/** Número da cartela com zeros à esquerda, para todas terem o mesmo tamanho (ao menos 4 dígitos). */
export function cardNumber(n: number, last: number): string {
  return String(n).padStart(Math.max(4, String(last).length), '0');
}

/**
 * Gera o lote de cartelas (ou de jogos avulsos). Nenhuma tabela se repete no lote,
 * exceto as cópias de propósito quando a cartela usa os mesmos números em todos os jogos.
 */
export function generateCards(config: GeneratorConfig, rand: Rand = randomIndex): GeneratedCard[] {
  const seen = new Set<string>();
  const opts = { freeCenter: config.freeCenter, sortColumns: config.sortColumns };
  const uniqueGrid = () => {
    for (;;) {
      const grid = generateGrid(opts, rand);
      const key = grid.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        return grid;
      }
    }
  };
  const gamesPerCard = config.kind === 'avulsos' ? 1 : config.gamesPerCard;
  const last = config.startNumber + config.quantity - 1;
  return Array.from({ length: config.quantity }, (_, i) => {
    const shared = config.sameNumbers ? uniqueGrid() : null;
    const games = Array.from({ length: gamesPerCard }, (_, g) => ({
      name: (config.gameNames[g] ?? `Jogo ${g + 1}`).trim(),
      grid: shared ? [...shared] : uniqueGrid(),
    }));
    return { number: cardNumber(config.startNumber + i, last), games };
  });
}

/** Lista para conferência (CSV separado por ponto e vírgula, abre direto no Excel em português). */
export function cardsToCsv(cards: GeneratedCard[]): string {
  const header = [
    'cartela',
    'jogo',
    ...['B', 'I', 'N', 'G', 'O'].flatMap((l) => [1, 2, 3, 4, 5].map((r) => `${l}${r}`)),
  ];
  const lines = cards.flatMap((card) =>
    card.games.map((game) => {
      // colunas B1..B5, I1..I5...: lê a grade por coluna, como a cartela é conferida
      const byColumn = [0, 1, 2, 3, 4].flatMap((c) =>
        [0, 1, 2, 3, 4].map((r) => (game.grid[r * 5 + c] === FREE ? 'LIVRE' : String(game.grid[r * 5 + c]))),
      );
      return [card.number, game.name.replace(/;/g, ','), ...byColumn].join(';');
    }),
  );
  return [header.join(';'), ...lines].join('\r\n');
}
