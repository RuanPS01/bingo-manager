import { afterEach, describe, expect, it, vi } from 'vitest';
import { reducer } from '../state';
import type { AppState, Card } from '../types';
import { parseGridText, toMatchGame } from './cards';
import { LEGACY_STORAGE_KEY, STORAGE_KEY, initialState, loadState, saveState, sanitizeState } from './storage';

const grid = [6, 19, 41, 54, 69, 14, 21, 36, 46, 71, 13, 20, 0, 56, 62, 2, 29, 31, 60, 73, 8, 30, 44, 49, 72];

describe('sanitizeState', () => {
  it('migra o formato antigo, em que o nome se chamava owner', () => {
    const state = sanitizeState({
      cards: [{ id: 'c1', number: '01062', owner: 'Bruna', prizeIds: ['bicicleta'], grid }],
      activeMatch: {
        id: 'p1',
        name: 'Rodada',
        games: [
          { key: 'c1::bicicleta', cardId: 'c1', cardNumber: '01062', owner: 'Bruna', prizeId: 'bicicleta', grid },
        ],
        modeIds: ['quina'],
        draws: [6, 6, 99, 19],
      },
      history: [],
    });
    expect(state?.cards[0].name).toBe('Bruna');
    expect(state?.cards[0].games).toEqual([{ id: 'bicicleta', name: 'Bicicleta Aro 26', grid }]);
    expect(state?.activeMatch?.games[0]).toMatchObject({
      cardName: 'Bruna',
      gameId: 'bicicleta',
      gameName: 'Bicicleta Aro 26',
      gameIndex: 1,
    });
    // números repetidos ou fora de 1 a 75 são descartados
    expect(state?.activeMatch?.draws).toEqual([6, 19]);
  });

  it('descarta itens corrompidos e completa as preferências', () => {
    const state = sanitizeState({
      cards: [
        { id: 'x' },
        { id: 'vazia', number: '2', name: 'Sem jogos', prizeIds: [], grid },
        { id: 'c1', number: '1', name: 'Ana', games: [{ id: 'j1', prizeId: null, name: 'Binguinho', grid }] },
        { id: 'c2', number: '3', name: 'Sem nome no jogo', games: [{ id: 'j1', grid }] },
      ],
      activeMatch: { id: 'quebrado' },
      history: [null, 'texto'],
      settings: { sound: false },
    });
    expect(state?.cards).toHaveLength(2);
    // o campo prizeId da versão antiga não é mais guardado
    expect(state?.cards[0].games[0]).toEqual({ id: 'j1', name: 'Binguinho', grid });
    expect(state?.cards[1].games[0].name).toBe('Jogo 1');
    expect(state?.activeMatch).toBeNull();
    expect(state?.history).toEqual([]);
    expect(state?.settings.sound).toBe(false);
    expect(state?.settings.keepAwake).toBe(true);
  });

  it('recusa conteúdo que não é um objeto', () => {
    expect(sanitizeState('texto')).toBeNull();
    expect(sanitizeState(null)).toBeNull();
  });
});

const ana: Card = {
  id: 'cartela-1',
  number: '0001',
  name: 'Ana',
  games: [
    { id: 'jogo-1', name: 'Rodada 1', grid },
    { id: 'jogo-2', name: 'Rodada 2', grid: [...grid] },
  ],
};

describe('estado inicial', () => {
  it('começa sem cartelas cadastradas', () => {
    const state = initialState();
    expect(state.cards).toEqual([]);
    expect(state.drawer.draws).toEqual([]);
    expect(state.generator.gameNames).toHaveLength(6);
  });
});

describe('renomear e salvar cartela', () => {
  const setup = () => {
    let state = reducer(initialState(), { type: 'card/save', card: ana });
    const card = state.cards[0];
    const game = toMatchGame(card, card.games[0]);
    state = reducer(state, { type: 'match/start', name: 'A', games: [game], modeIds: ['quina'] });
    state = reducer(state, { type: 'match/finish' });
    state = reducer(state, { type: 'match/start', name: 'B', games: [game], modeIds: ['quina'] });
    return { state, card };
  };

  it('renomear atualiza a cartela e a partida em andamento, mas não o histórico', () => {
    const { state: inicial, card } = setup();
    const state = reducer(inicial, { type: 'card/rename', id: card.id, name: '  Ana (mãe) ' });
    expect(state.cards[0].name).toBe('Ana (mãe)');
    expect(state.activeMatch?.games[0].cardName).toBe('Ana (mãe)');
    expect(state.history[0].games[0].cardName).toBe('Ana');
  });

  it('corrigir números da cartela atualiza o jogo na partida em andamento', () => {
    const { state: inicial, card } = setup();
    const grid = [...card.games[0].grid];
    grid[0] = 1;
    const editada = {
      ...card,
      games: card.games.map((g) => (g.id === 'jogo-1' ? { ...g, name: 'Bicicleta', grid } : g)),
    };
    const state = reducer(inicial, { type: 'card/save', card: editada });
    expect(state.activeMatch?.games[0]).toMatchObject({ gameName: 'Bicicleta', gameIndex: 1 });
    expect(state.activeMatch?.games[0].grid[0]).toBe(1);
    expect(state.history[0].games[0].grid[0]).toBe(6);
  });

  it('inclui na partida em andamento os jogos de uma cartela nova, sem repetir', () => {
    const { state: inicial } = setup();
    const nova = {
      id: 'nova',
      number: '',
      name: 'Binguinho',
      games: [{ id: 'jogo-1', name: 'Binguinho', grid }],
    };
    let state = reducer(inicial, { type: 'card/save', card: nova });
    const jogos = nova.games.map((g) => toMatchGame(nova, g));
    state = reducer(state, { type: 'match/add-games', games: jogos });
    state = reducer(state, { type: 'match/add-games', games: jogos });
    expect(state.cards).toHaveLength(2);
    expect(state.activeMatch?.games.map((g) => g.key)).toEqual(['cartela-1::jogo-1', 'nova::jogo-1']);
    expect(state.activeMatch?.games[1]).toMatchObject({ gameName: 'Binguinho', gameIndex: 1 });
  });
});

describe('parseGridText', () => {
  it('aceita 24 números e coloca o espaço livre no meio', () => {
    const values = parseGridText('1 16 31 46 61, 2 17 32 47 62; 3 18 48 63 4 19 33 49 64 5 20 34 50 65');
    expect(values).toHaveLength(25);
    expect(values?.[12]).toBe(0);
    expect(values?.[13]).toBe(48);
  });

  it('aceita 25 números ignorando o do meio e recusa outras quantidades', () => {
    expect(parseGridText(Array.from({ length: 25 }, (_, i) => i + 1).join(' '))?.[12]).toBe(0);
    expect(parseGridText('1 2 3')).toBeNull();
  });
});

describe('persistência', () => {
  const memoria = () => {
    const dados = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, v),
      removeItem: (k: string) => void dados.delete(k),
    });
    return dados;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('migra os dados salvos pela versão anterior do app', () => {
    const dados = memoria();
    dados.set(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ cards: [{ id: 'c1', number: '01062', name: 'Bruna', prizeIds: ['bicicleta', 'tv'], grid }] }),
    );
    const state = loadState();
    expect(state.cards[0].games.map((g) => g.name)).toEqual(['Bicicleta Aro 26', 'Smart TV 43"']);
    // depois de salvar, a chave nova passa a valer e a antiga não é mais lida
    saveState({ ...state, cards: [] });
    expect(loadState().cards).toEqual([]);
    expect(dados.has(STORAGE_KEY)).toBe(true);
  });

  it('volta ao estado inicial quando o conteúdo salvo está corrompido', () => {
    memoria().set(STORAGE_KEY, '{quebrado');
    expect(loadState()).toEqual(initialState());
  });

  it('guarda o sorteador e o gerador, descartando valores fora do permitido', () => {
    const state = sanitizeState({
      drawer: { config: { maxBall: 90, animation: 'girar', autoSeconds: 1 }, draws: [90, 91, 5, 5] },
      generator: { kind: 'avulsos', quantity: 5000, color: 'azul', gameNames: ['Bingão'] },
    }) as AppState;
    expect(state.drawer.config).toMatchObject({ maxBall: 90, animation: 'globo', autoSeconds: 8 });
    expect(state.drawer.draws).toEqual([90, 5]);
    expect(state.generator).toMatchObject({ kind: 'avulsos', quantity: 10, color: '#1d4fa8' });
    expect(state.generator.gameNames.slice(0, 2)).toEqual(['Bingão', 'Rodada 2']);
  });
});

describe('sorteador', () => {
  const comPartida = (syncMatch: boolean) => {
    let state = reducer(initialState(), { type: 'card/save', card: ana });
    state = reducer(state, {
      type: 'match/start',
      name: 'A',
      games: [toMatchGame(ana, ana.games[0])],
      modeIds: ['quina'],
    });
    return reducer(state, { type: 'drawer/config', patch: { syncMatch } });
  };

  it('não aceita número repetido ou fora do globo', () => {
    let state = reducer(initialState(), { type: 'drawer/draw', ball: 10 });
    state = reducer(state, { type: 'drawer/draw', ball: 10 });
    state = reducer(state, { type: 'drawer/draw', ball: 76 });
    expect(state.drawer.draws).toEqual([10]);
  });

  it('marca na partida em andamento só com a opção ligada', () => {
    const desligado = reducer(comPartida(false), { type: 'drawer/draw', ball: 6 });
    expect(desligado.activeMatch?.draws).toEqual([]);
    let ligado = reducer(comPartida(true), { type: 'drawer/draw', ball: 6 });
    ligado = reducer(ligado, { type: 'drawer/draw', ball: 19 });
    expect(ligado.activeMatch?.draws).toEqual([6, 19]);
    ligado = reducer(ligado, { type: 'drawer/undo' });
    expect(ligado.drawer.draws).toEqual([6]);
    expect(ligado.activeMatch?.draws).toEqual([6]);
  });

  it('com mais de 75 bolas não marca na partida', () => {
    let state = comPartida(true);
    state = reducer(state, { type: 'drawer/config', patch: { maxBall: 90 } });
    state = reducer(state, { type: 'drawer/draw', ball: 6 });
    expect(state.activeMatch?.draws).toEqual([]);
  });

  it('diminuir o globo descarta as bolas que ficariam de fora', () => {
    let state = reducer(initialState(), { type: 'drawer/config', patch: { maxBall: 90 } });
    for (const ball of [80, 3, 88]) state = reducer(state, { type: 'drawer/draw', ball });
    state = reducer(state, { type: 'drawer/config', patch: { maxBall: 75 } });
    expect(state.drawer.draws).toEqual([3]);
    state = reducer(state, { type: 'drawer/reset' });
    expect(state.drawer.draws).toEqual([]);
  });
});
