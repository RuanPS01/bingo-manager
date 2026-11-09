import { FREE } from '../data/constants';
import { getMode, type BingoMode } from '../data/modes';
import type { Grid, Match, MatchGame } from '../types';

export const MIN_BALL = 1;
export const MAX_BALL = 75;
export const LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;

/** Faixa de números de cada coluna: B 1-15, I 16-30, N 31-45, G 46-60, O 61-75. */
export function columnRange(col: number): [number, number] {
  return [col * 15 + 1, col * 15 + 15];
}

export function letterFor(n: number): string {
  return LETTERS[Math.min(4, Math.max(0, Math.floor((n - 1) / 15)))];
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Ex.: 7 vira "B-07". */
export function formatBall(n: number): string {
  return `${letterFor(n)}-${pad2(n)}`;
}

export function isValidBall(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_BALL && n <= MAX_BALL;
}

/**
 * Interpreta o texto digitado: aceita "7", "07", "B7", "b-07" etc.
 * Retorna null se não houver um número válido.
 */
export function parseBall(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return isValidBall(n) ? n : null;
}

/** Mapa número sorteado para a posição (1 = primeiro número sorteado). */
export function drawPositions(draws: number[]): Map<number, number> {
  const pos = new Map<number, number>();
  draws.forEach((n, i) => {
    if (!pos.has(n)) pos.set(n, i + 1);
  });
  return pos;
}

export interface ModeProgress {
  modeId: string;
  /** Posição do sorteio em que o modo foi atingido, ou null. */
  completedAt: number | null;
  /** Células do primeiro padrão completado. */
  winningCells: number[] | null;
  /** Quantos números faltam no padrão mais próximo (0 se completo). */
  needed: number;
  /** Marcados e total exigido no padrão mais próximo. */
  bestMarked: number;
  bestTotal: number;
  /** Células do padrão mais próximo de ser completado. */
  bestCells: number[];
  /** Números que completariam o modo se fossem sorteados agora. */
  oneAway: number[];
}

const cellPosition = (grid: Grid, cell: number, pos: Map<number, number>) =>
  grid[cell] === FREE ? 0 : (pos.get(grid[cell]) ?? Infinity);

export function evaluateMode(grid: Grid, mode: BingoMode, pos: Map<number, number>): ModeProgress {
  let completedAt = Infinity;
  let winningCells: number[] | null = null;
  let needed = Infinity;
  let bestMarked = 0;
  let bestTotal = 0;
  let bestCells: number[] = [];
  const oneAway = new Set<number>();

  for (const pattern of mode.patterns) {
    const min = Math.min(mode.min ?? pattern.length, pattern.length);
    const positions = pattern.map((cell) => cellPosition(grid, cell, pos));
    const sorted = [...positions].sort((a, b) => a - b);
    const doneAt = sorted[min - 1];
    const marked = positions.filter((p) => p !== Infinity).length;
    const missing = Math.max(0, min - marked);

    if (doneAt < completedAt) {
      completedAt = doneAt;
      winningCells = pattern;
    }
    if (missing < needed || (missing === needed && marked / min > bestMarked / (bestTotal || 1))) {
      needed = missing;
      bestMarked = Math.min(marked, min);
      bestTotal = min;
      bestCells = pattern;
    }
    if (missing === 1) {
      pattern.forEach((cell, i) => {
        if (positions[i] === Infinity) oneAway.add(grid[cell]);
      });
    }
  }

  const completed = completedAt !== Infinity;
  return {
    modeId: mode.id,
    completedAt: completed ? completedAt : null,
    winningCells: completed ? winningCells : null,
    needed: completed ? 0 : needed,
    bestMarked,
    bestTotal,
    bestCells,
    oneAway: completed ? [] : [...oneAway].sort((a, b) => a - b),
  };
}

export interface GameResult {
  game: MatchGame;
  modes: ModeProgress[];
  /** Números da grade que já foram sorteados. */
  marked: Set<number>;
  /** Menor quantidade de números que falta entre os modos ainda não atingidos. */
  closest: number;
}

export interface Achievement {
  gameKey: string;
  game: MatchGame;
  modeId: string;
  completedAt: number;
  ball: number;
  cells: number[];
}

export interface MatchEvaluation {
  results: GameResult[];
  achievements: Achievement[];
}

export function evaluateMatch(match: Pick<Match, 'games' | 'modeIds' | 'draws'>): MatchEvaluation {
  const pos = drawPositions(match.draws);
  const modes = match.modeIds.map(getMode).filter((m): m is BingoMode => Boolean(m));
  const achievements: Achievement[] = [];

  const results = match.games.map((game) => {
    const progress = modes.map((mode) => evaluateMode(game.grid, mode, pos));
    const marked = new Set(game.grid.filter((n) => n !== FREE && pos.has(n)));
    progress.forEach((p) => {
      if (p.completedAt !== null && p.winningCells) {
        achievements.push({
          gameKey: game.key,
          game,
          modeId: p.modeId,
          completedAt: p.completedAt,
          ball: match.draws[p.completedAt - 1],
          cells: p.winningCells,
        });
      }
    });
    const pending = progress.filter((p) => p.completedAt === null);
    const closest = pending.length ? Math.min(...pending.map((p) => p.needed)) : Infinity;
    return { game, modes: progress, marked, closest };
  });

  achievements.sort((a, b) => a.completedAt - b.completedAt);
  return { results, achievements };
}

/** Jogos da partida que contêm o número informado. */
export function gamesWithNumber(games: MatchGame[], n: number): MatchGame[] {
  return games.filter((g) => g.grid.includes(n));
}

/**
 * Valida uma grade digitada: 24 números, cada um na faixa da sua coluna,
 * sem repetição, e o centro livre. Retorna a lista de erros por célula.
 */
export function validateGrid(grid: (number | null)[]): Map<number, string> {
  const errors = new Map<number, string>();
  const seen = new Map<number, number>();
  grid.forEach((value, cell) => {
    if (cell === 12) return;
    if (value === null || Number.isNaN(value)) {
      errors.set(cell, 'Preencha o número');
      return;
    }
    const [lo, hi] = columnRange(cell % 5);
    if (value < lo || value > hi) {
      errors.set(cell, `Na coluna ${LETTERS[cell % 5]} use de ${lo} a ${hi}`);
      return;
    }
    if (seen.has(value)) {
      errors.set(cell, 'Número repetido');
      errors.set(seen.get(value)!, 'Número repetido');
    } else {
      seen.set(value, cell);
    }
  });
  return errors;
}
