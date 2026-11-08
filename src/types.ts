/** Uma grade 5x5 em ordem de linha. O valor 0 é o espaço livre central. */
export type Grid = number[];

export interface Prize {
  id: string;
  round: number;
  name: string;
  sponsor: string;
}

/**
 * Jogo (tabela BINGO) de uma cartela. Pode ser um prêmio do Show de Prêmios
 * ou um jogo avulso cadastrado pelo usuário (ex.: binguinho).
 */
export interface CardGame {
  /** Identificador do jogo na cartela. Nos prêmios do Show é o próprio id do prêmio. */
  id: string;
  /** Prêmio do Show de Prêmios, ou null para um jogo avulso. */
  prizeId: string | null;
  /** Nome exibido do jogo. */
  name: string;
  grid: Grid;
}

/** Cartela: um ou mais jogos, cada um com seus números. */
export interface Card {
  id: string;
  /** Número impresso na cartela (opcional em cartelas cadastradas à mão). */
  number: string;
  /** Nome que identifica a cartela (ex.: o nome de quem comprou). Editável. */
  name: string;
  games: CardGame[];
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
  gameId: string;
  prizeId: string | null;
  gameName: string;
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
  /** Jogos da partida em grade compacta, para ver todos de uma vez. */
  compactView: boolean;
  /** Colunas da visão compacta: 0 = automático; 2 a 8 = quantidade fixa. */
  compactColumns: number;
  /** Tema: automático (segue o sistema), claro ou escuro. */
  theme: 'auto' | 'light' | 'dark';
}

export interface AppState {
  version: 1;
  cards: Card[];
  activeMatch: Match | null;
  history: Match[];
  settings: Settings;
}
