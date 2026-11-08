import { DEFAULT_CARDS, getPrize, prizeGame } from '../data/event';
import type { AppState, Card, CardGame, Match, MatchGame, Settings } from '../types';

export const STORAGE_KEY = 'bingo-apae-2026:v1';

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  vibration: true,
  sortByProgress: false,
  keepAwake: true,
  hideInstallTip: false,
  compactView: false,
};

export function initialState(): AppState {
  return {
    version: 1,
    cards: DEFAULT_CARDS.map((c) => ({ ...c, games: c.games.map((g) => ({ ...g, grid: [...g.grid] })) })),
    activeMatch: null,
    history: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const isGrid = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === 25 && v.every((n) => Number.isInteger(n));

const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

const notNull = <T>(v: T | null): v is T => v !== null;

function normalizeCardGame(v: unknown): CardGame | null {
  if (!isObject(v) || typeof v.id !== 'string' || !isGrid(v.grid)) return null;
  const prizeId = typeof v.prizeId === 'string' ? v.prizeId : null;
  return {
    id: v.id,
    prizeId,
    name: text(v.name) || (prizeId ? getPrize(prizeId).name : 'Jogo'),
    grid: v.grid,
  };
}

/**
 * Valida uma cartela. Aceita os formatos antigos: nome em "owner" e um único
 * "grid" com a lista "prizeIds" (todos os jogos com os mesmos números).
 */
function normalizeCard(v: unknown): Card | null {
  if (!isObject(v) || typeof v.id !== 'string') return null;
  let games: CardGame[] = [];
  if (Array.isArray(v.games)) {
    games = v.games.map(normalizeCardGame).filter(notNull);
  } else if (Array.isArray(v.prizeIds) && isGrid(v.grid)) {
    const grid = v.grid;
    games = v.prizeIds.filter((p): p is string => typeof p === 'string').map((p) => prizeGame(p, grid));
  }
  if (games.length === 0) return null;
  return { id: v.id, number: text(v.number), name: text(v.name, text(v.owner)), games };
}

function normalizeGame(v: unknown): MatchGame | null {
  if (!isObject(v) || typeof v.key !== 'string' || typeof v.cardId !== 'string' || !isGrid(v.grid)) return null;
  const prizeId = typeof v.prizeId === 'string' ? v.prizeId : null;
  return {
    key: v.key,
    cardId: v.cardId,
    cardNumber: text(v.cardNumber),
    cardName: text(v.cardName, text(v.owner)),
    gameId: text(v.gameId) || v.key.split('::')[1] || prizeId || v.key,
    prizeId,
    gameName: text(v.gameName) || (prizeId ? getPrize(prizeId).name : 'Jogo'),
    grid: v.grid,
  };
}

function normalizeMatch(v: unknown): Match | null {
  if (!isObject(v) || typeof v.id !== 'string' || !Array.isArray(v.games) || !Array.isArray(v.draws)) return null;
  const games = v.games.map(normalizeGame);
  if (games.some((g) => g === null)) return null;
  const draws = v.draws.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 75);
  return {
    id: v.id,
    name: text(v.name, 'Partida'),
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : Date.now(),
    finishedAt: typeof v.finishedAt === 'number' ? v.finishedAt : null,
    games: games as MatchGame[],
    modeIds: Array.isArray(v.modeIds) ? v.modeIds.filter((m): m is string => typeof m === 'string') : [],
    draws: [...new Set(draws)],
  };
}

/**
 * Converte um objeto qualquer (do localStorage ou de um arquivo de backup)
 * em um estado válido, descartando o que estiver corrompido.
 */
export function sanitizeState(raw: unknown): AppState | null {
  if (!isObject(raw)) return null;
  const base = initialState();
  const cards = Array.isArray(raw.cards) ? raw.cards.map(normalizeCard).filter(notNull) : base.cards;
  const activeMatch = normalizeMatch(raw.activeMatch);
  const history = Array.isArray(raw.history) ? raw.history.map(normalizeMatch).filter(notNull) : [];
  const settings = isObject(raw.settings) ? { ...DEFAULT_SETTINGS, ...raw.settings } : base.settings;
  return {
    version: 1,
    cards,
    activeMatch: activeMatch ? { ...activeMatch, finishedAt: null } : null,
    history,
    settings: settings as Settings,
  };
}

export function loadState(): AppState {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return initialState();
    return sanitizeState(JSON.parse(text)) ?? initialState();
  } catch {
    return initialState();
  }
}

export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportState(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `bingo-apae-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readBackupFile(file: File): Promise<AppState> {
  const text = await file.text();
  const state = sanitizeState(JSON.parse(text));
  if (!state) throw new Error('Arquivo de backup inválido');
  return state;
}
