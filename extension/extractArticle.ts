import { Readability } from '@mozilla/readability';

export interface ExtractedArticle {
  title: string;
  author: string;
  text: string;
}

declare global {
  interface Window {
    __kestrelExtractArticle?: () => ExtractedArticle;
  }
}

window.__kestrelExtractArticle = function extractArticleText(): ExtractedArticle {
  const fallbackTitle = document.title?.trim() || 'Web article';
  try {
    const clone = document.cloneNode(true) as Document;
    const parsed = new Readability(clone).parse();
    const text = parsed?.textContent?.trim();
    if (parsed && text && text.length > 40) {
      return {
        title: parsed.title?.trim() || fallbackTitle,
        author: parsed.byline?.trim() || document.location.hostname,
        text,
      };
    }
  } catch {
    // fall through
  }

  const article = document.querySelector('article');
  const text = (article?.innerText ?? document.body?.innerText ?? '').trim();
  return {
    title: fallbackTitle,
    author: document.location.hostname,
    text,
  };
};

export {};
