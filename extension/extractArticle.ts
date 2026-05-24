import { Readability } from '@mozilla/readability';

declare global {
  interface Window {
    __kestrelExtractArticle?: () => string;
  }
}

window.__kestrelExtractArticle = function extractArticleText(): string {
  try {
    const clone = document.cloneNode(true) as Document;
    const parsed = new Readability(clone).parse();
    const text = parsed?.textContent?.trim();
    if (text && text.length > 0) return text;
  } catch {}

  const article = document.querySelector('article');
  return (article?.innerText ?? document.body?.innerText ?? '').trim();
};

export {};
