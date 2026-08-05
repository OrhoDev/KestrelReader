import { Readability } from '@mozilla/readability';

export interface UrlArticle {
  title: string;
  author: string;
  text: string;
}

export function extractArticleFromHtml(html: string, pageUrl: string): UrlArticle {
  const parsedUrl = new URL(pageUrl);
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const base = doc.createElement('base');
  base.href = parsedUrl.href;
  doc.head?.append(base);

  const article = new Readability(doc).parse();
  const text = article?.textContent?.trim();

  if (!text || text.length < 40) {
    throw new Error('No article text on that page. Try a direct article link.');
  }

  return {
    title: article?.title?.trim() || parsedUrl.hostname,
    author: article?.byline?.trim() || parsedUrl.hostname,
    text,
  };
}
