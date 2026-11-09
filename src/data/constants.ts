import type { DrawerConfig, GeneratorConfig } from '../types';

export const APP_NAME = 'Bingo Manager';

/** 0 representa o espaço livre central da cartela. */
export const FREE = 0;

export const DEFAULT_DRAWER_CONFIG: DrawerConfig = {
  maxBall: 75,
  showLetters: true,
  animation: 'globo',
  animationMs: 1800,
  auto: false,
  autoSeconds: 8,
  voice: false,
  sound: true,
  syncMatch: false,
};

export const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  kind: 'cartelas',
  title: 'Bingo',
  subtitle: '',
  footer: '',
  quantity: 10,
  gamesPerCard: 1,
  gameNames: ['Rodada 1', 'Rodada 2', 'Rodada 3', 'Rodada 4', 'Rodada 5', 'Rodada 6'],
  sameNumbers: false,
  startNumber: 1,
  perPage: 2,
  paper: 'a4',
  freeCenter: true,
  sortColumns: false,
  identification: true,
  color: '#1d4fa8',
};
