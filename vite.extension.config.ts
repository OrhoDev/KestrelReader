import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { copyFileSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  plugins: [
    svelte(),
    tailwindcss(),
    {
      name: 'copy-extension-manifest',
      closeBundle() {
        copyFileSync(
          resolve(__dirname, 'extension/manifest.json'),
          resolve(__dirname, 'dist-extension/manifest.json'),
        );
      },
    },
  ],
  build: {
    outDir: 'dist-extension',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'extension/background.ts'),
        extract: resolve(__dirname, 'extension/extractArticle.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'extract' ? 'extract.js' : '[name].js'),
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
