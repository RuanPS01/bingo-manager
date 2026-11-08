import { describe, expect, it } from 'vitest';
import { reducer } from '../state';
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
    expect(state?.activeMatch?.games[0].cardName).toBe('Bruna');
    // números repetidos ou fora de 1 a 75 são descartados
    expect(state?.activeMatch?.draws).toEqual([6, 19]);
  });

  it('descarta itens corrompidos e completa as preferências', () => {
    const state = sanitizeState({
      cards: [{ id: 'x' }, { id: 'c1', number: '1', name: 'Ana', prizeIds: [], grid }],
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

describe('renomear cartela', () => {
  it('atualiza a cartela e a partida em andamento, mas não o histórico', () => {
    let state = initialState();
    const card = state.cards[0];
    const game = {
      key: `${card.id}::bicicleta`,
      cardId: card.id,
      cardNumber: card.number,
      cardName: card.name,
      prizeId: 'bicicleta',
      grid: card.grid,
    };
    state = reducer(state, { type: 'match/start', name: 'A', games: [game], modeIds: ['quina'] });
    state = reducer(state, { type: 'match/finish' });
    state = reducer(state, { type: 'match/start', name: 'B', games: [game], modeIds: ['quina'] });
    state = reducer(state, { type: 'card/rename', id: card.id, name: '  Bruna (mãe) ' });

    expect(state.cards[0].name).toBe('Bruna (mãe)');
    expect(state.activeMatch?.games[0].cardName).toBe('Bruna (mãe)');
    expect(state.history[0].games[0].cardName).toBe('Bruna');
  });
});
