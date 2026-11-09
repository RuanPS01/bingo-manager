import { DEFAULT_DRAWER_CONFIG, DEFAULT_GENERATOR_CONFIG } from '../data/constants';
import type {
  AppState,
  Card,
  CardGame,
  DrawerConfig,
  DrawerState,
  GeneratorConfig,
  Match,
  MatchGame,
  Settings,
} from '../types';
import { downloadBlob } from './download';

export const STORAGE_KEY = 'bingo-manager:v1';

/**
 * Chave usada pela primeira versão do app (feita para um evento específico).
 * Os dados salvos nela são migrados uma única vez, para ninguém perder cartelas e histórico.
 */
export const LEGACY_STORAGE_KEY = 'bingo-apae-2026:v1';

/** Nomes e ordem dos jogos da versão antiga, usados só para migrar dados salvos nela. */
const LEGACY_GAMES: Record<string, { name: string; index: number }> = {
  bicicleta: { name: 'Bicicleta Aro 26', index: 1 },
  smartphone: { name: 'Smartphone', index: 2 },
  dinheiro: { name: 'R$ 1.500,00', index: 3 },
  tv: { name: 'Smart TV 43"', index: 4 },
  moto: { name: 'Moto 0 km', index: 5 },
};

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  vibration: true,
  sortByProgress: false,
  keepAwake: true,
  hideInstallTip: false,
  compactView: false,
  drawsCollapsed: false,
  compactColumns: 0,
  theme: 'auto',
};

export function initialState(): AppState {
  return {
    version: 1,
    cards: [],
    activeMatch: null,
    history: [],
    settings: { ...DEFAULT_SETTINGS },
    drawer: { config: { ...DEFAULT_DRAWER_CONFIG }, draws: [], round: 1 },
    generator: { ...DEFAULT_GENERATOR_CONFIG, gameNames: [...DEFAULT_GENERATOR_CONFIG.gameNames] },
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const isGrid = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === 25 && v.every((n) => Number.isInteger(n));

const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

const notNull = <T>(v: T | null): v is T => v !== null;

const intIn = (v: unknown, min: number, max: number, fallback: number): number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : fallback;

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

function legacyName(prizeId: unknown): string {
  return typeof prizeId === 'string' ? (LEGACY_GAMES[prizeId]?.name ?? prizeId) : '';
}

function normalizeCardGame(v: unknown, index: number): CardGame | null {
  if (!isObject(v) || typeof v.id !== 'string' || !isGrid(v.grid)) return null;
  return { id: v.id, name: text(v.name) || legacyName(v.prizeId) || `Jogo ${index + 1}`, grid: v.grid };
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
    games = v.prizeIds
      .filter((p): p is string => typeof p === 'string')
      .map((p) => ({ id: p, name: legacyName(p), grid: [...grid] }));
  }
  if (games.length === 0) return null;
  return { id: v.id, number: text(v.number), name: text(v.name, text(v.owner)), games };
}

function normalizeGame(v: unknown): MatchGame | null {
  if (!isObject(v) || typeof v.key !== 'string' || typeof v.cardId !== 'string' || !isGrid(v.grid)) return null;
  const legacy = typeof v.prizeId === 'string' ? LEGACY_GAMES[v.prizeId] : undefined;
  return {
    key: v.key,
    cardId: v.cardId,
    cardNumber: text(v.cardNumber),
    cardName: text(v.cardName, text(v.owner)),
    gameId: text(v.gameId) || v.key.split('::')[1] || v.key,
    gameName: text(v.gameName) || legacyName(v.prizeId) || 'Jogo',
    gameIndex: intIn(v.gameIndex, 0, 99, legacy?.index ?? 0),
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

function normalizeDrawerConfig(v: unknown): DrawerConfig {
  const d = DEFAULT_DRAWER_CONFIG;
  const c = isObject(v) ? v : {};
  return {
    maxBall: intIn(c.maxBall, 10, 99, d.maxBall),
    showLetters: bool(c.showLetters, d.showLetters),
    animation: oneOf(c.animation, ['globo', 'simples', 'nenhuma'] as const, d.animation),
    animationMs: intIn(c.animationMs, 300, 6000, d.animationMs),
    auto: bool(c.auto, d.auto),
    autoSeconds: intIn(c.autoSeconds, 3, 120, d.autoSeconds),
    voice: bool(c.voice, d.voice),
    sound: bool(c.sound, d.sound),
    syncMatch: bool(c.syncMatch, d.syncMatch),
    broadcast: bool(c.broadcast, d.broadcast),
  };
}

function normalizeDrawer(v: unknown): DrawerState {
  const raw = isObject(v) ? v : {};
  const config = normalizeDrawerConfig(raw.config);
  const draws = Array.isArray(raw.draws)
    ? raw.draws.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= config.maxBall)
    : [];
  return { config, draws: [...new Set(draws)], round: intIn(raw.round, 1, Number.MAX_SAFE_INTEGER, 1) };
}

function normalizeGenerator(v: unknown): GeneratorConfig {
  const d = DEFAULT_GENERATOR_CONFIG;
  const c = isObject(v) ? v : {};
  const names = Array.isArray(c.gameNames) ? c.gameNames.filter((n): n is string => typeof n === 'string') : [];
  return {
    kind: oneOf(c.kind, ['cartelas', 'avulsos'] as const, d.kind),
    title: text(c.title, d.title),
    subtitle: text(c.subtitle, d.subtitle),
    footer: text(c.footer, d.footer),
    quantity: intIn(c.quantity, 1, 1000, d.quantity),
    gamesPerCard: intIn(c.gamesPerCard, 1, 6, d.gamesPerCard),
    gameNames: d.gameNames.map((fallback, i) => names[i] ?? fallback),
    sameNumbers: bool(c.sameNumbers, d.sameNumbers),
    startNumber: intIn(c.startNumber, 0, 999999, d.startNumber),
    perPage: intIn(c.perPage, 1, 12, d.perPage),
    paper: oneOf(c.paper, ['a4', 'letter'] as const, d.paper),
    freeCenter: bool(c.freeCenter, d.freeCenter),
    sortColumns: bool(c.sortColumns, d.sortColumns),
    identification: bool(c.identification, d.identification),
    color: typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : d.color,
  };
}

/**
 * Converte um objeto qualquer (do localStorage ou de um arquivo de backup)
 * em um estado válido, descartando o que estiver corrompido.
 */
export function sanitizeState(raw: unknown): AppState | null {
  if (!isObject(raw)) return null;
  const cards = Array.isArray(raw.cards) ? raw.cards.map(normalizeCard).filter(notNull) : [];
  const activeMatch = normalizeMatch(raw.activeMatch);
  const history = Array.isArray(raw.history) ? raw.history.map(normalizeMatch).filter(notNull) : [];
  const settings = isObject(raw.settings) ? { ...DEFAULT_SETTINGS, ...raw.settings } : { ...DEFAULT_SETTINGS };
  if (!['auto', 'light', 'dark'].includes(String(settings.theme))) settings.theme = 'auto';
  const cols = Number(settings.compactColumns);
  if (!Number.isInteger(cols) || (cols !== 0 && (cols < 2 || cols > 8))) settings.compactColumns = 0;
  return {
    version: 1,
    cards,
    activeMatch: activeMatch ? { ...activeMatch, finishedAt: null } : null,
    history,
    settings: settings as Settings,
    drawer: normalizeDrawer(raw.drawer),
    generator: normalizeGenerator(raw.generator),
  };
}

export function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) return initialState();
    return sanitizeState(JSON.parse(saved)) ?? initialState();
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
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  downloadBlob(
    new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
    `bingo-manager-backup-${stamp}.json`,
  );
}

export async function readBackupFile(file: File): Promise<AppState> {
  const content = await file.text();
  const state = sanitizeState(JSON.parse(content));
  if (!state) throw new Error('Arquivo de backup inválido');
  return state;
}
