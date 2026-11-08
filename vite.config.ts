import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// O build gera um único index.html com JS e CSS embutidos.
// Assim o app funciona no GitHub Pages, em qualquer servidor estático
// ou até abrindo o arquivo direto no navegador, sem internet.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
});
