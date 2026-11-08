import { useEffect, useLayoutEffect, useState } from 'react';

export type ThemeChoice = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const query = () => window.matchMedia?.('(prefers-color-scheme: dark)');

/** Tema do sistema (celular ou computador). */
function systemTheme(): Theme {
  return query()?.matches ? 'dark' : 'light';
}

/**
 * Aplica o tema escolhido no elemento <html> (atributo data-theme) e
 * acompanha o tema do sistema quando a escolha é automática.
 */
export function useTheme(choice: ThemeChoice): Theme {
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme = choice === 'auto' ? system : choice;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return theme;
}
