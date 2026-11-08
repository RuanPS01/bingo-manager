import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './lib/usePwaInstall';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker: permite instalar o app e usá-lo sem internet.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
