import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

/** Mantém a tela do celular ligada enquanto a partida estiver aberta. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    const wakeLock = (
      navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      }
    ).wakeLock;
    if (!enabled || !wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        const s = await wakeLock.request('screen');
        if (cancelled) void s.release();
        else sentinel = s;
      } catch {
        // pode falhar se a aba não estiver visível ou o navegador recusar
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled]);
}
