import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * Testes de ponta a ponta. Rodam sobre o build de produção (o mesmo arquivo
 * publicado no GitHub Pages), já com o service worker do PWA ativo.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  // Os testes de fluxo levam segundos: um navegador travado falha em 2 minutos, sem segurar o job
  // por 10. A simulação de 60 partidas, que é longa de verdade, aumenta o próprio prazo.
  timeout: 2 * 60 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // No CI, uma nova tentativa: o Chromium sem tela às vezes para de desenhar quadros no meio de
  // um teste (o clique fica esperando o elemento "parar de se mexer" para sempre), e isso não
  // pode barrar a publicação. Falha repetida continua reprovando, e o relatório marca o teste
  // como instável (flaky) para ele não passar despercebido.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    ...devices['Pixel 7'],
    trace: 'off',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
