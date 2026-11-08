import type { Card, CardGame, Grid, Prize } from '../types';

/** Informações do evento, conforme a cartela e o regulamento. */
export const EVENT = {
  title: 'Show de Prêmios 2026',
  organizer: 'APAE Santa Rita do Sapucaí',
  date: '08 de novembro de 2026',
  time: 'Domingo, a partir das 15h',
  place: 'Ginásio da APAE de Santa Rita do Sapucaí',
  cardPrice: 25,
};

/**
 * Prêmios impressos na cartela. Cada prêmio corresponde a um jogo
 * (uma tabela BINGO) da cartela e é sorteado em uma rodada.
 */
export const PRIZES: Prize[] = [
  { id: 'bicicleta', round: 1, name: 'Bicicleta Aro 26', sponsor: 'Lojas Vera Cruz' },
  { id: 'smartphone', round: 2, name: 'Smartphone', sponsor: 'Combo Auto Posto' },
  { id: 'dinheiro', round: 3, name: 'R$ 1.500,00', sponsor: 'Sicredi' },
  { id: 'tv', round: 4, name: 'Smart TV 43"', sponsor: 'Trivale Tecnologia' },
  { id: 'moto', round: 5, name: 'Moto 0 km', sponsor: 'JFL Alarmes, Grupo Construminas e Danilo Automóveis' },
];

export const PRIZE_IDS = PRIZES.map((p) => p.id);

export function getPrize(id: string): Prize {
  return PRIZES.find((p) => p.id === id) ?? { id, round: 0, name: id, sponsor: '' };
}

/** Rodada do prêmio (0 para jogos avulsos). */
export function roundOf(prizeId: string | null): number {
  return PRIZES.find((p) => p.id === prizeId)?.round ?? 0;
}

/** Jogo de um prêmio do Show de Prêmios. */
export function prizeGame(prizeId: string, grid: Grid): CardGame {
  return { id: prizeId, prizeId, name: getPrize(prizeId).name, grid: [...grid] };
}

/** Os 5 jogos da cartela do Show, todos com os mesmos números (como na cartela impressa). */
export function showGames(grid: Grid): CardGame[] {
  return PRIZE_IDS.map((id) => prizeGame(id, grid));
}

/** 0 representa o espaço livre central da cartela. */
export const FREE = 0;

/**
 * Cartelas físicas (fotos enviadas). Nas cartelas deste evento os 5 jogos
 * de uma mesma cartela têm exatamente os mesmos números.
 * Os números estão em ordem de linha (de cima para baixo, da esquerda para a direita).
 */
export const DEFAULT_CARDS: Card[] = [
  {
    id: 'cartela-01062',
    number: '01062',
    name: 'Bruna',
    // prettier-ignore
    games: showGames([
      6, 19, 41, 54, 69,
      14, 21, 36, 46, 71,
      13, 20, FREE, 56, 62,
      2, 29, 31, 60, 73,
      8, 30, 44, 49, 72,
    ]),
  },
  {
    id: 'cartela-01064',
    number: '01064',
    name: 'Kátia',
    // prettier-ignore
    games: showGames([
      5, 24, 35, 52, 75,
      6, 25, 38, 47, 72,
      3, 28, FREE, 60, 73,
      8, 26, 43, 53, 66,
      14, 27, 44, 57, 67,
    ]),
  },
  {
    id: 'cartela-01065',
    number: '01065',
    name: 'Ruan',
    // prettier-ignore
    games: showGames([
      9, 25, 39, 52, 69,
      2, 30, 41, 51, 72,
      3, 20, FREE, 50, 68,
      8, 27, 31, 59, 62,
      12, 17, 38, 60, 74,
    ]),
  },
];
