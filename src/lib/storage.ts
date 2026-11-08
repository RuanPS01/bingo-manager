import { DEFAULT_CARDS } from '../data/event';
import type { AppState, Card, Match, Settings } from '../types';

export const STORAGE_KEY = 'bingo-apae-2026:v1';

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  vibration: true,
  sortByProgress: false,
  keepAwake: true,
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

function isCard(v: unknown): v is Card {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.number === 'string' &&
    typeof v.owner === 'string' &&
    Array.isArray(v.prizeIds) &&
    isGrid(v.grid)
  );
}

function isMatch(v: unknown): v is Match {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.games) &&
    v.games.every((g) => isObject(g) && typeof g.key === 'string' && isGrid(g.grid)) &&
    Array.isArray(v.modeIds) &&
    Array.isArray(v.draws) &&
    v.draws.every((n) => Number.isInteger(n))
  );
}

/**
 * Converte um objeto qualquer (do localStorage ou de um arquivo de backup)
 * em um estado válido, descartando o que estiver corrompido.
 */
export function sanitizeState(raw: unknown): AppState | null {
  if (!isObject(raw)) return null;
  const base = initialState();
  const cards = Array.isArray(raw.cards) ? raw.cards.filter(isCard) : base.cards;
  const activeMatch = isMatch(raw.activeMatch) ? raw.activeMatch : null;
  const history = Array.isArray(raw.history) ? raw.history.filter(isMatch) : [];
  const settings = isObject(raw.settings) ? { ...DEFAULT_SETTINGS, ...raw.settings } : base.settings;
  return { version: 1, cards, activeMatch, history, settings: settings as Settings };
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
