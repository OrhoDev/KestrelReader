import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('pdfjs-dist')) return 'vendor-pdf';
          if (id.includes('epubjs') || id.includes('@xmldom')) return 'vendor-epub';
          if (id.includes('tesseract.js') || id.includes('tesseract.js-core')) return 'vendor-ocr';
          if (id.includes('mammoth')) return 'vendor-docx';
          if (id.includes('@lingo-reader/mobi-parser') || id.includes('@lingo-reader/shared')) return 'vendor-mobi';
          if (id.includes('dexie')) return 'vendor-dexie';
          if (id.includes('@fontsource')) return 'vendor-fonts';
        },
      },
    },
  },
});
