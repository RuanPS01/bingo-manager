/** Uma grade 5x5 em ordem de linha. O valor 0 é o espaço livre central. */
export type Grid = number[];

export interface Prize {
  id: string;
  round: number;
  name: string;
  sponsor: string;
}

/** Cartela física. Cada prêmio listado em prizeIds é um jogo da cartela. */
export interface Card {
  id: string;
  number: string;
  /** Nome que identifica a cartela (ex.: o nome de quem comprou). Editável. */
  name: string;
  prizeIds: string[];
  grid: Grid;
}

/**
 * Jogo usado em uma partida. Guarda uma cópia dos dados da cartela para que
 * o histórico continue correto mesmo se a cartela for editada ou removida.
 */
export interface MatchGame {
  key: string;
  cardId: string;
  cardNumber: string;
  cardName: string;
  prizeId: string;
  grid: Grid;
}

export interface Match {
  id: string;
  name: string;
  createdAt: number;
  finishedAt: number | null;
  games: MatchGame[];
  modeIds: string[];
  /** Números sorteados, na ordem em que foram digitados. */
  draws: number[];
}

export interface Settings {
  sound: boolean;
  vibration: boolean;
  sortByProgress: boolean;
  keepAwake: boolean;
  hideInstallTip: boolean;
}

export interface AppState {
  version: 1;
  cards: Card[];
  activeMatch: Match | null;
  history: Match[];
  settings: Settings;
}
