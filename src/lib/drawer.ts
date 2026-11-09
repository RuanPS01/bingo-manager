import type { DrawerConfig } from '../types';
import { LETTERS } from './bingo';

/** Bolas que ainda estão no globo. */
export function remainingBalls(maxBall: number, draws: number[]): number[] {
  const drawn = new Set(draws);
  return Array.from({ length: maxBall }, (_, i) => i + 1).filter((n) => !drawn.has(n));
}

/**
 * Inteiro aleatório em [0, max). Usa crypto.getRandomValues com rejeição dos
 * valores do fim do intervalo: o resto da divisão puro favoreceria os números
 * baixos, e num sorteio todas as bolas precisam ter a mesma chance.
 */
export function randomIndex(max: number): number {
  if (max <= 0) throw new Error('Nenhuma bola para sortear');
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) return Math.floor(Math.random() * max);
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do cryptoObj.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

/** Sorteia uma das bolas restantes, ou null se o globo estiver vazio. */
export function pickBall(maxBall: number, draws: number[], rand: (max: number) => number = randomIndex): number | null {
  const remaining = remainingBalls(maxBall, draws);
  return remaining.length ? remaining[rand(remaining.length)] : null;
}

/** Letras B I N G O só fazem sentido no bingo de 75 bolas. */
export function usesLetters(config: Pick<DrawerConfig, 'maxBall' | 'showLetters'>): boolean {
  return config.showLetters && config.maxBall === 75;
}

export function drawerLetter(n: number, config: Pick<DrawerConfig, 'maxBall' | 'showLetters'>): string | null {
  return usesLetters(config) ? LETTERS[Math.floor((n - 1) / 15)] : null;
}

/** Como cada letra é falada em português, para a voz não soletrar "bi" ou "gi". */
const SPOKEN_LETTERS: Record<string, string> = { B: 'bê', I: 'i', N: 'ene', G: 'gê', O: 'ó' };

/** Texto falado ao anunciar a bola (ex.: "bê, 7"). */
export function spokenBall(n: number, config: Pick<DrawerConfig, 'maxBall' | 'showLetters'>): string {
  const letter = drawerLetter(n, config);
  return letter ? `${SPOKEN_LETTERS[letter]}, ${n}` : String(n);
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/** Anuncia o número por voz, em português, se o navegador tiver síntese de fala. */
export function speak(textToSay: string): void {
  if (!canSpeak()) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSay);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.9;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt'));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } catch {
    // sem voz disponível: o número continua na tela
  }
}

/** Opções de duração da animação, em milissegundos. */
export const ANIMATION_SPEEDS = [
  { label: 'Rápida', ms: 900 },
  { label: 'Normal', ms: 1800 },
  { label: 'Lenta', ms: 3000 },
] as const;
