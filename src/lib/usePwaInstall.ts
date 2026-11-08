import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// O evento pode chegar antes do React montar a tela, então é capturado aqui,
// assim que o módulo é carregado.
let captured: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    captured = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    captured = null;
    notify();
  });
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/** Estado da instalação do app (PWA) e ação para instalar. */
export function usePwaInstall() {
  const [, force] = useState(0);

  useEffect(() => {
    const update = () => force((n) => n + 1);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  const installed = isStandalone();
  // No iPhone/iPad todos os navegadores usam o WebKit, que não tem convite de instalação:
  // a instalação é feita pelo menu Compartilhar do Safari.
  const ios = isIos();

  const install = async () => {
    const event = captured;
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice;
    captured = null;
    notify();
    return choice.outcome === 'accepted';
  };

  return {
    installed,
    canInstall: !installed && !ios && captured !== null,
    showIosHint: !installed && ios,
    install,
  };
}
