import { describe, expect, it } from 'vitest';
import { DEFAULT_CARDS } from '../data/event';
import { MODES, getMode } from '../data/modes';
import type { MatchGame } from '../types';
import { drawPositions, evaluateMatch, evaluateMode, formatBall, letterFor, parseBall, validateGrid } from './bingo';

const card = DEFAULT_CARDS.find((c) => c.number === '01065')!;
const game: MatchGame = {
  key: 'k1',
  cardId: card.id,
  cardNumber: card.number,
  owner: card.owner,
  prizeId: 'bicicleta',
  grid: card.grid,
};

const mode = (id: string) => getMode(id)!;
const evalWith = (id: string, draws: number[]) => evaluateMode(card.grid, mode(id), drawPositions(draws));

describe('cartelas padrão', () => {
  it('respeitam as faixas de cada coluna e não repetem números', () => {
    for (const c of DEFAULT_CARDS) {
      expect(c.grid).toHaveLength(25);
      expect(c.grid[12]).toBe(0);
      expect(validateGrid(c.grid).size).toBe(0);
    }
  });
});

describe('formatação', () => {
  it('identifica a letra de cada número', () => {
    expect(letterFor(1)).toBe('B');
    expect(letterFor(15)).toBe('B');
    expect(letterFor(16)).toBe('I');
    expect(letterFor(45)).toBe('N');
    expect(letterFor(46)).toBe('G');
    expect(letterFor(75)).toBe('O');
    expect(formatBall(7)).toBe('B-07');
  });

  it('interpreta o texto digitado', () => {
    expect(parseBall('7')).toBe(7);
    expect(parseBall('07')).toBe(7);
    expect(parseBall('b-12')).toBe(12);
    expect(parseBall('0')).toBeNull();
    expect(parseBall('76')).toBeNull();
    expect(parseBall('abc')).toBeNull();
  });
});

describe('modos', () => {
  it('todos os padrões usam células válidas', () => {
    for (const m of MODES) {
      expect(m.patterns.length).toBeGreaterThan(0);
      for (const p of m.patterns) {
        for (const cell of p) expect(cell >= 0 && cell < 25).toBe(true);
      }
    }
  });

  it('quina na linha do meio conta o espaço livre', () => {
    // linha do meio da 01065: 03 20 [livre] 50 68
    const r = evalWith('quina', [3, 20, 50]);
    expect(r.completedAt).toBeNull();
    expect(r.needed).toBe(1);
    expect(r.oneAway).toEqual([68]);
    const done = evalWith('quina', [3, 20, 50, 68]);
    expect(done.completedAt).toBe(4);
    expect(done.winningCells).toEqual([10, 11, 12, 13, 14]);
  });

  it('quadra exige 4 números na mesma linha horizontal', () => {
    expect(evalWith('quadra', [9, 25, 39]).completedAt).toBeNull();
    expect(evalWith('quadra', [9, 25, 39, 2, 52]).completedAt).toBe(5);
    // 3 + livre na linha do meio já forma quadra
    expect(evalWith('quadra', [3, 20, 50]).completedAt).toBe(3);
  });

  it('quadra em qualquer direção aceita colunas', () => {
    expect(evalWith('quadra-qualquer', [9, 2, 3, 8]).completedAt).toBe(4);
    expect(evalWith('quadra', [9, 2, 3, 8]).completedAt).toBeNull();
  });

  it('cartela cheia precisa dos 24 números', () => {
    const numbers = card.grid.filter((n) => n !== 0);
    const almost = evalWith('cartela-cheia', numbers.slice(0, 23));
    expect(almost.completedAt).toBeNull();
    expect(almost.needed).toBe(1);
    expect(almost.oneAway).toEqual([numbers[23]]);
    const full = evalWith('cartela-cheia', [70, ...numbers]);
    expect(full.completedAt).toBe(25);
  });

  it('quatro cantos e duas linhas', () => {
    expect(evalWith('quatro-cantos', [9, 69, 12, 74]).completedAt).toBe(4);
    // linha 1 completa + coluna B completa
    const draws = [9, 25, 39, 52, 69, 2, 3, 8, 12];
    expect(evalWith('linha-qualquer', draws).completedAt).toBe(5);
    expect(evalWith('duas-linhas', draws).completedAt).toBe(9);
  });

  it('registra a posição do sorteio em que o modo foi atingido', () => {
    const ev = evaluateMatch({
      games: [game],
      modeIds: ['quina', 'cartela-cheia'],
      draws: [1, 3, 20, 4, 50, 68, 5],
    });
    expect(ev.achievements).toHaveLength(1);
    expect(ev.achievements[0]).toMatchObject({ modeId: 'quina', completedAt: 6, ball: 68 });
    expect(ev.results[0].marked.size).toBe(4);
  });

  it('desfazer um número remove a conquista', () => {
    const ev = evaluateMatch({ games: [game], modeIds: ['quina'], draws: [3, 20, 50] });
    expect(ev.achievements).toHaveLength(0);
  });
});

describe('validação da grade', () => {
  it('aponta números fora da coluna e repetidos', () => {
    const grid = [...card.grid] as (number | null)[];
    grid[0] = 20; // fora da faixa B
    grid[6] = 25; // repete o 25 da célula 1
    grid[24] = null;
    const errors = validateGrid(grid);
    expect(errors.get(0)).toMatch(/coluna B/);
    expect(errors.get(6)).toBe('Número repetido');
    expect(errors.get(1)).toBe('Número repetido');
    expect(errors.get(24)).toBe('Preencha o número');
  });
});
