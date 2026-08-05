import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const fetchArticleUrl = pathToFileURL(resolve(projectRoot, 'lib/fetchArticle.mjs')).href;

function articleApiPlugin(): Plugin {
  return {
    name: 'article-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/fetch-article')) {
          next();
          return;
        }

        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed.' }));
          return;
        }

        const requestUrl = new URL(req.url, 'http://localhost');
        const target = requestUrl.searchParams.get('url') ?? '';

        try {
          const { fetchArticleFromUrl } = await import(fetchArticleUrl);
          const article = await fetchArticleFromUrl(target);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(article));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not fetch article.';
          res.statusCode = 422;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    articleApiPlugin(),
  ],
  server: {
    strictPort: true,
  },
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
