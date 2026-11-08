import { DEFAULT_CARDS } from '../data/event';
import type { AppState, Card, Match, MatchGame, Settings } from '../types';

export const STORAGE_KEY = 'bingo-apae-2026:v1';

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  vibration: true,
  sortByProgress: false,
  keepAwake: true,
  hideInstallTip: false,
};

export function initialState(): AppState {
  return {
    version: 1,
    cards: DEFAULT_CARDS.map((c) => ({ ...c, grid: [...c.grid], prizeIds: [...c.prizeIds] })),
    activeMatch: null,
    history: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const isGrid = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === 25 && v.every((n) => Number.isInteger(n));

const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** Valida uma cartela. Aceita o formato antigo, em que o nome se chamava "owner". */
function normalizeCard(v: unknown): Card | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.number !== 'string') return null;
  if (!Array.isArray(v.prizeIds) || !isGrid(v.grid)) return null;
  return {
    id: v.id,
    number: v.number,
    name: text(v.name, text(v.owner)),
    prizeIds: v.prizeIds.filter((p): p is string => typeof p === 'string'),
    grid: v.grid,
  };
}

function normalizeGame(v: unknown): MatchGame | null {
  if (!isObject(v) || typeof v.key !== 'string' || typeof v.cardId !== 'string' || !isGrid(v.grid)) return null;
  return {
    key: v.key,
    cardId: v.cardId,
    cardNumber: text(v.cardNumber),
    cardName: text(v.cardName, text(v.owner)),
    prizeId: text(v.prizeId),
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

const notNull = <T>(v: T | null): v is T => v !== null;

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
