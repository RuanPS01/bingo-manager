let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, duration: number, volume = 0.18) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const t0 = ac.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** Som curto quando o número está em alguma cartela. */
export function playMark() {
  tone(880, 0, 0.12, 0.08);
}

/** Fanfarra quando um modo é completado. */
export function playWin() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.35));
  tone(1047, 0.6, 0.6);
}

/** Desbloqueia o áudio no primeiro toque (exigência dos navegadores móveis). */
export function unlockAudio() {
  audio();
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // vibração não suportada
  }
}

/** Batida curta repetida durante a animação, como a bola girando no globo. */
export function playTick() {
  tone(260 + Math.random() * 120, 0, 0.05, 0.05);
}

/** Som da bola revelada no sorteador. */
export function playReveal() {
  tone(784, 0, 0.18, 0.14);
  tone(1175, 0.12, 0.4, 0.14);
}
