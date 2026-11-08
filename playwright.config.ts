import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * Testes de ponta a ponta. Rodam sobre o build de produção (o mesmo arquivo
 * publicado no GitHub Pages), já com o service worker do PWA ativo.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 10 * 60 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
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
