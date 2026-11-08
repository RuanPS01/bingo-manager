import type { AppState, Card, Match, MatchGame, Settings } from './types';

export type Action =
  | { type: 'replace'; state: AppState }
  | { type: 'card/save'; card: Card }
  | { type: 'card/remove'; id: string }
  | { type: 'card/rename'; id: string; name: string }
  | { type: 'match/start'; name: string; games: MatchGame[]; modeIds: string[] }
  | { type: 'match/update'; name: string; games: MatchGame[]; modeIds: string[] }
  | { type: 'match/add-games'; games: MatchGame[] }
  | { type: 'match/draw'; ball: number }
  | { type: 'match/undo' }
  | { type: 'match/remove-ball'; ball: number }
  | { type: 'match/finish' }
  | { type: 'match/discard' }
  | { type: 'match/reopen'; id: string }
  | { type: 'history/remove'; id: string }
  | { type: 'settings'; patch: Partial<Settings> };

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function withMatch(state: AppState, update: (m: Match) => Match): AppState {
  if (!state.activeMatch || state.activeMatch.finishedAt) return state;
  return { ...state, activeMatch: update(state.activeMatch) };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'replace':
      return action.state;

    case 'card/save': {
      const exists = state.cards.some((c) => c.id === action.card.id);
      const cards = exists
        ? state.cards.map((c) => (c.id === action.card.id ? action.card : c))
        : [...state.cards, action.card];
      // A partida em andamento acompanha as correções da cartela (nome, número e números dos jogos).
      const activeMatch = state.activeMatch && {
        ...state.activeMatch,
        games: state.activeMatch.games.map((g) => {
          if (g.cardId !== action.card.id) return g;
          const game = action.card.games.find((cg) => cg.id === g.gameId);
          return {
            ...g,
            cardName: action.card.name,
            cardNumber: action.card.number,
            ...(game ? { gameName: game.name, prizeId: game.prizeId, grid: [...game.grid] } : {}),
          };
        }),
      };
      return { ...state, cards, activeMatch };
    }

    case 'card/rename': {
      const name = action.name.trim();
      const cards = state.cards.map((c) => (c.id === action.id ? { ...c, name } : c));
      // A partida em andamento acompanha o novo nome; o histórico guarda o nome da época.
      const activeMatch = state.activeMatch && {
        ...state.activeMatch,
        games: state.activeMatch.games.map((g) => (g.cardId === action.id ? { ...g, cardName: name } : g)),
      };
      return { ...state, cards, activeMatch };
    }

    case 'card/remove':
      return { ...state, cards: state.cards.filter((c) => c.id !== action.id) };

    case 'match/start':
      if (state.activeMatch) return state;
      return {
        ...state,
        activeMatch: {
          id: newId('partida'),
          name: action.name,
          createdAt: Date.now(),
          finishedAt: null,
          games: action.games,
          modeIds: action.modeIds,
          draws: [],
        },
      };

    case 'match/update':
      return withMatch(state, (m) => ({ ...m, name: action.name, games: action.games, modeIds: action.modeIds }));

    case 'match/add-games':
      return withMatch(state, (m) => {
        const keys = new Set(m.games.map((g) => g.key));
        return { ...m, games: [...m.games, ...action.games.filter((g) => !keys.has(g.key))] };
      });

    case 'match/draw':
      return withMatch(state, (m) => (m.draws.includes(action.ball) ? m : { ...m, draws: [...m.draws, action.ball] }));

    case 'match/undo':
      return withMatch(state, (m) => ({ ...m, draws: m.draws.slice(0, -1) }));

    case 'match/remove-ball':
      return withMatch(state, (m) => ({ ...m, draws: m.draws.filter((n) => n !== action.ball) }));

    case 'match/finish': {
      if (!state.activeMatch) return state;
      const finished = { ...state.activeMatch, finishedAt: Date.now() };
      return { ...state, activeMatch: null, history: [finished, ...state.history] };
    }

    case 'match/discard':
      return { ...state, activeMatch: null };

    case 'match/reopen': {
      if (state.activeMatch) return state;
      const match = state.history.find((m) => m.id === action.id);
      if (!match) return state;
      return {
        ...state,
        activeMatch: { ...match, finishedAt: null },
        history: state.history.filter((m) => m.id !== action.id),
      };
    }

    case 'history/remove':
      return { ...state, history: state.history.filter((m) => m.id !== action.id) };

    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
  }
}
