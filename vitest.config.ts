import { defineConfig } from 'vitest/config';

// Testes unitários ficam em src/. Os testes de ponta a ponta (tests/e2e) rodam com o Playwright.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
