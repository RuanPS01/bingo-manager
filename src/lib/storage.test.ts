import { describe, expect, it } from 'vitest';
import { reducer } from '../state';
import { parseGridText, toMatchGame } from './cards';
import { initialState, sanitizeState } from './storage';

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
    expect(state?.cards[0].games).toEqual([{ id: 'bicicleta', prizeId: 'bicicleta', name: 'Bicicleta Aro 26', grid }]);
    expect(state?.activeMatch?.games[0]).toMatchObject({
      cardName: 'Bruna',
      gameId: 'bicicleta',
      gameName: 'Bicicleta Aro 26',
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
      ],
      activeMatch: { id: 'quebrado' },
      history: [null, 'texto'],
      settings: { sound: false },
    });
    expect(state?.cards).toHaveLength(1);
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

describe('renomear e salvar cartela', () => {
  const setup = () => {
    let state = initialState();
    const card = state.cards[0];
    const game = toMatchGame(card, card.games[0]);
    state = reducer(state, { type: 'match/start', name: 'A', games: [game], modeIds: ['quina'] });
    state = reducer(state, { type: 'match/finish' });
    state = reducer(state, { type: 'match/start', name: 'B', games: [game], modeIds: ['quina'] });
    return { state, card };
  };

  it('renomear atualiza a cartela e a partida em andamento, mas não o histórico', () => {
    const { state: inicial, card } = setup();
    const state = reducer(inicial, { type: 'card/rename', id: card.id, name: '  Bruna (mãe) ' });
    expect(state.cards[0].name).toBe('Bruna (mãe)');
    expect(state.activeMatch?.games[0].cardName).toBe('Bruna (mãe)');
    expect(state.history[0].games[0].cardName).toBe('Bruna');
  });

  it('corrigir números da cartela atualiza o jogo na partida em andamento', () => {
    const { state: inicial, card } = setup();
    const grid = [...card.games[0].grid];
    grid[0] = 1;
    const editada = { ...card, games: card.games.map((g) => (g.id === 'bicicleta' ? { ...g, grid } : g)) };
    const state = reducer(inicial, { type: 'card/save', card: editada });
    expect(state.activeMatch?.games[0].grid[0]).toBe(1);
    expect(state.history[0].games[0].grid[0]).toBe(6);
  });

  it('inclui na partida em andamento os jogos de uma cartela nova, sem repetir', () => {
    const { state: inicial } = setup();
    const nova = {
      id: 'nova',
      number: '',
      name: 'Binguinho',
      games: [{ id: 'jogo-1', prizeId: null, name: 'Binguinho', grid }],
    };
    let state = reducer(inicial, { type: 'card/save', card: nova });
    const jogos = nova.games.map((g) => toMatchGame(nova, g));
    state = reducer(state, { type: 'match/add-games', games: jogos });
    state = reducer(state, { type: 'match/add-games', games: jogos });
    expect(state.cards).toHaveLength(4);
    expect(state.activeMatch?.games.map((g) => g.key)).toEqual(['cartela-01062::bicicleta', 'nova::jogo-1']);
    expect(state.activeMatch?.games[1]).toMatchObject({ gameName: 'Binguinho', prizeId: null });
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
