/**
 * Modos (padrões) de vitória do bingo de 75 bolas em cartela 5x5.
 *
 * As células são numeradas de 0 a 24 em ordem de linha:
 *
 *    0  1  2  3  4
 *    5  6  7  8  9
 *   10 11 12 13 14   (12 é o espaço livre e sempre conta como marcado)
 *   15 16 17 18 19
 *   20 21 22 23 24
 *
 * Um modo é atingido quando QUALQUER um dos seus padrões tem pelo menos
 * `min` células marcadas (por padrão, todas as células do padrão).
 */
export interface BingoMode {
  id: string;
  name: string;
  /** Nome curto para a visão compacta. */
  short: string;
  group: ModeGroup;
  description: string;
  patterns: number[][];
  /** Quantidade mínima de células marcadas no padrão. Padrão: todas. */
  min?: number;
  /** Células destacadas na miniatura do modo. */
  preview: number[];
}

export type ModeGroup = 'Tradicionais' | 'Linhas' | 'Figuras';

export const MODE_GROUPS: ModeGroup[] = ['Tradicionais', 'Linhas', 'Figuras'];

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const uniq = (cells: number[]) => [...new Set(cells)].sort((a, b) => a - b);

export const ROWS = range(5).map((r) => range(5).map((c) => r * 5 + c));
export const COLS = range(5).map((c) => range(5).map((r) => r * 5 + c));
export const DIAG_MAIN = [0, 6, 12, 18, 24];
export const DIAG_ANTI = [4, 8, 12, 16, 20];
export const DIAGONALS = [DIAG_MAIN, DIAG_ANTI];
export const ALL_LINES = [...ROWS, ...COLS, ...DIAGONALS];
export const ALL_CELLS = range(25);

function pairs<T>(items: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
  }
  return out;
}

const shape = (...parts: number[][]) => uniq(parts.flat());

const FRAME = shape(ROWS[0], ROWS[4], COLS[0], COLS[4]);
const CENTER_SQUARE = [6, 7, 8, 11, 12, 13, 16, 17, 18];
const DIAMOND = [2, 6, 8, 10, 14, 16, 18, 22];
const PYRAMID = shape(ROWS[4], [16, 17, 18], [12]);
const STAMPS = [
  [0, 1, 5, 6],
  [3, 4, 8, 9],
  [15, 16, 20, 21],
  [18, 19, 23, 24],
];

export const MODES: BingoMode[] = [
  // Tradicionais
  {
    id: 'quadra',
    name: 'Quadra',
    short: 'Quadra',
    group: 'Tradicionais',
    description: '4 números marcados na mesma linha horizontal.',
    patterns: ROWS,
    min: 4,
    preview: [5, 6, 7, 8],
  },
  {
    id: 'quina',
    name: 'Quina',
    short: 'Quina',
    group: 'Tradicionais',
    description: 'Uma linha horizontal completa (5 números).',
    patterns: ROWS,
    preview: ROWS[1],
  },
  {
    id: 'cartela-cheia',
    name: 'Cartela cheia',
    short: 'Cheia',
    group: 'Tradicionais',
    description: 'Todos os números da cartela marcados.',
    patterns: [ALL_CELLS],
    preview: ALL_CELLS,
  },

  // Linhas
  {
    id: 'linha-vertical',
    name: 'Linha vertical',
    short: 'Vertical',
    group: 'Linhas',
    description: 'Uma coluna completa (B, I, N, G ou O).',
    patterns: COLS,
    preview: COLS[1],
  },
  {
    id: 'diagonal',
    name: 'Diagonal',
    short: 'Diagonal',
    group: 'Linhas',
    description: 'Uma das duas diagonais completa.',
    patterns: DIAGONALS,
    preview: DIAG_MAIN,
  },
  {
    id: 'linha-qualquer',
    name: 'Linha em qualquer direção',
    short: 'Linha',
    group: 'Linhas',
    description: 'Uma linha completa na horizontal, vertical ou diagonal.',
    patterns: ALL_LINES,
    preview: shape(ROWS[0], COLS[4], DIAG_ANTI),
  },
  {
    id: 'quadra-qualquer',
    name: 'Quadra em qualquer direção',
    short: 'Quadra+',
    group: 'Linhas',
    description: '4 números marcados na mesma linha horizontal, vertical ou diagonal.',
    patterns: ALL_LINES,
    min: 4,
    preview: [1, 6, 11, 16],
  },
  {
    id: 'duas-linhas',
    name: 'Duas linhas',
    short: '2 linhas',
    group: 'Linhas',
    description: 'Duas linhas completas em qualquer direção.',
    patterns: pairs(ALL_LINES).map(([a, b]) => shape(a, b)),
    preview: shape(ROWS[1], ROWS[3]),
  },
  {
    id: 'duas-quinas',
    name: 'Duas quinas',
    short: '2 quinas',
    group: 'Linhas',
    description: 'Duas linhas horizontais completas.',
    patterns: pairs(ROWS).map(([a, b]) => shape(a, b)),
    preview: shape(ROWS[0], ROWS[2]),
  },

  // Figuras
  {
    id: 'quatro-cantos',
    name: 'Quatro cantos',
    short: '4 cantos',
    group: 'Figuras',
    description: 'Os quatro números dos cantos da cartela.',
    patterns: [[0, 4, 20, 24]],
    preview: [0, 4, 20, 24],
  },
  {
    id: 'selo',
    name: 'Selo',
    short: 'Selo',
    group: 'Figuras',
    description: 'Um quadrado 2x2 em qualquer canto da cartela.',
    patterns: STAMPS,
    preview: STAMPS[1],
  },
  {
    id: 'cruz',
    name: 'Cruz',
    short: 'Cruz',
    group: 'Figuras',
    description: 'Linha do meio e coluna N completas (sinal de mais).',
    patterns: [shape(ROWS[2], COLS[2])],
    preview: shape(ROWS[2], COLS[2]),
  },
  {
    id: 'letra-x',
    name: 'Letra X',
    short: 'X',
    group: 'Figuras',
    description: 'As duas diagonais completas.',
    patterns: [shape(DIAG_MAIN, DIAG_ANTI)],
    preview: shape(DIAG_MAIN, DIAG_ANTI),
  },
  {
    id: 'letra-t',
    name: 'Letra T',
    short: 'T',
    group: 'Figuras',
    description: 'Primeira linha e coluna N completas.',
    patterns: [shape(ROWS[0], COLS[2])],
    preview: shape(ROWS[0], COLS[2]),
  },
  {
    id: 'letra-l',
    name: 'Letra L',
    short: 'L',
    group: 'Figuras',
    description: 'Coluna B e última linha completas.',
    patterns: [shape(COLS[0], ROWS[4])],
    preview: shape(COLS[0], ROWS[4]),
  },
  {
    id: 'letra-u',
    name: 'Letra U',
    short: 'U',
    group: 'Figuras',
    description: 'Colunas B e O e última linha completas.',
    patterns: [shape(COLS[0], COLS[4], ROWS[4])],
    preview: shape(COLS[0], COLS[4], ROWS[4]),
  },
  {
    id: 'letra-h',
    name: 'Letra H',
    short: 'H',
    group: 'Figuras',
    description: 'Colunas B e O e linha do meio completas.',
    patterns: [shape(COLS[0], COLS[4], ROWS[2])],
    preview: shape(COLS[0], COLS[4], ROWS[2]),
  },
  {
    id: 'letra-n',
    name: 'Letra N',
    short: 'N',
    group: 'Figuras',
    description: 'Colunas B e O e a diagonal que desce da esquerda para a direita.',
    patterns: [shape(COLS[0], COLS[4], DIAG_MAIN)],
    preview: shape(COLS[0], COLS[4], DIAG_MAIN),
  },
  {
    id: 'letra-z',
    name: 'Letra Z',
    short: 'Z',
    group: 'Figuras',
    description: 'Primeira linha, última linha e a diagonal que sobe da esquerda para a direita.',
    patterns: [shape(ROWS[0], ROWS[4], DIAG_ANTI)],
    preview: shape(ROWS[0], ROWS[4], DIAG_ANTI),
  },
  {
    id: 'moldura',
    name: 'Moldura',
    short: 'Moldura',
    group: 'Figuras',
    description: 'Todas as bordas da cartela (letra O).',
    patterns: [FRAME],
    preview: FRAME,
  },
  {
    id: 'quadrado-meio',
    name: 'Quadrado do meio',
    short: 'Miolo',
    group: 'Figuras',
    description: 'Os 9 números do quadrado central 3x3.',
    patterns: [CENTER_SQUARE],
    preview: CENTER_SQUARE,
  },
  {
    id: 'losango',
    name: 'Losango',
    short: 'Losango',
    group: 'Figuras',
    description: 'Contorno de um losango ao redor do centro.',
    patterns: [DIAMOND],
    preview: DIAMOND,
  },
  {
    id: 'piramide',
    name: 'Pirâmide',
    short: 'Pirâmide',
    group: 'Figuras',
    description: 'Última linha completa, três números acima e o centro.',
    patterns: [PYRAMID],
    preview: PYRAMID,
  },
];

export const DEFAULT_MODE_IDS = ['cartela-cheia'];

export function getMode(id: string): BingoMode | undefined {
  return MODES.find((m) => m.id === id);
}
