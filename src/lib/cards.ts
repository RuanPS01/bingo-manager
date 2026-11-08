import type { Card, CardGame, MatchGame } from '../types';

export const gameKey = (cardId: string, gameId: string) => `${cardId}::${gameId}`;

/** Cópia de um jogo da cartela para usar em uma partida. */
export function toMatchGame(card: Card, game: CardGame): MatchGame {
  return {
    key: gameKey(card.id, game.id),
    cardId: card.id,
    cardNumber: card.number,
    cardName: card.name,
    gameId: game.id,
    prizeId: game.prizeId,
    gameName: game.name,
    grid: [...game.grid],
  };
}

/** Texto que identifica a cartela: o nome dado pelo usuário ou o número. */
export function cardLabel(name: string, number: string): string {
  return name.trim() || (number.trim() ? `Cartela ${number.trim()}` : 'Cartela sem nome');
}

/** Todos os jogos da cartela têm os mesmos números? */
export function hasSameNumbers(card: Pick<Card, 'games'>): boolean {
  const first = card.games[0]?.grid.join(',');
  return card.games.every((g) => g.grid.join(',') === first);
}

/**
 * Lê os números digitados ou colados de uma vez, linha por linha.
 * Aceita 24 números (sem o espaço livre) ou 25 (o do meio é ignorado).
 */
export function parseGridText(text: string): (number | null)[] | null {
  const numbers = (text.match(/\d+/g) ?? []).map(Number);
  if (numbers.length === 24) return [...numbers.slice(0, 12), 0, ...numbers.slice(12)];
  if (numbers.length === 25) return numbers.map((n, i) => (i === 12 ? 0 : n));
  return null;
}
