import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// O build gera um único index.html com JS e CSS embutidos.
// Assim o app funciona no GitHub Pages, em qualquer servidor estático
// ou até abrindo o arquivo direto no navegador, sem internet.
const vazio = fileURLToPath(new URL('./src/lib/vazio.ts', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: { html2canvas: vazio, dompurify: vazio, canvg: vazio },
  },
});
