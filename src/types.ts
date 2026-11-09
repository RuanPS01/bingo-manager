/** Uma grade 5x5 em ordem de linha. O valor 0 é o espaço livre central. */
export type Grid = number[];

/** Jogo (tabela BINGO) de uma cartela, com nome livre (ex.: "Rodada 1", "Prêmio principal"). */
export interface CardGame {
  /** Identificador do jogo dentro da cartela. */
  id: string;
  /** Nome exibido do jogo. */
  name: string;
  grid: Grid;
}

/** Cartela: um ou mais jogos, cada um com seus números. */
export interface Card {
  id: string;
  /** Número impresso na cartela (opcional). */
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
  gameName: string;
  /** Posição do jogo na cartela (1, 2, 3...); 0 quando desconhecida. */
  gameIndex: number;
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
  /** Card de números sorteados recolhido em uma linha. */
  drawsCollapsed: boolean;
  /** Colunas da visão compacta: 0 = automático; 2 a 8 = quantidade fixa. */
  compactColumns: number;
  /** Tema: automático (segue o sistema), claro ou escuro. */
  theme: 'auto' | 'light' | 'dark';
}

/** Configurações do sorteador. */
export interface DrawerConfig {
  /** Maior número do globo (75 no bingo B I N G O; 90 ou outro valor de 10 a 99). */
  maxBall: number;
  /** Mostrar a letra (B, I, N, G, O) junto do número; só vale com 75 bolas. */
  showLetters: boolean;
  /** Animação do sorteio. */
  animation: 'globo' | 'simples' | 'nenhuma';
  /** Duração da animação, em milissegundos. */
  animationMs: number;
  /** Sorteio automático a cada intervalo. */
  auto: boolean;
  /** Intervalo do sorteio automático, em segundos. */
  autoSeconds: number;
  /** Anunciar o número por voz. */
  voice: boolean;
  /** Efeitos sonoros. */
  sound: boolean;
  /** Marcar também cada número na partida em andamento. */
  syncMatch: boolean;
  /** Transmitir as bolas para os celulares dos participantes. */
  broadcast: boolean;
}

export interface DrawerState {
  config: DrawerConfig;
  /** Números sorteados, na ordem do sorteio. */
  draws: number[];
  /** Muda a cada "Reiniciar", para quem recebe a transmissão separar um sorteio do outro. */
  round: number;
}

/** Configurações do gerador de cartelas em PDF. */
export interface GeneratorConfig {
  /** Cartelas com vários jogos (como as de evento) ou jogos avulsos (uma tabela cada). */
  kind: 'cartelas' | 'avulsos';
  title: string;
  subtitle: string;
  footer: string;
  /** Quantidade de cartelas (ou de jogos avulsos). */
  quantity: number;
  /** Jogos em cada cartela (só para "cartelas"). */
  gamesPerCard: number;
  /** Nome de cada jogo da cartela (ex.: prêmio de cada rodada). */
  gameNames: string[];
  /** Todos os jogos de uma cartela com os mesmos números. */
  sameNumbers: boolean;
  /** Número da primeira cartela. */
  startNumber: number;
  /** Cartelas (ou jogos avulsos) por página. */
  perPage: number;
  paper: 'a4' | 'letter';
  /** Espaço livre no centro da tabela. */
  freeCenter: boolean;
  /** Números de cada coluna em ordem crescente. */
  sortColumns: boolean;
  /** Linhas para nome e telefone de quem comprou. */
  identification: boolean;
  /** Cor principal (hexadecimal). */
  color: string;
}

export interface AppState {
  version: 1;
  cards: Card[];
  activeMatch: Match | null;
  history: Match[];
  settings: Settings;
  drawer: DrawerState;
  generator: GeneratorConfig;
}
