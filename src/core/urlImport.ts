import { Readability } from '@mozilla/readability';

export interface UrlArticle {
  title: string;
  author: string;
  text: string;
}

export async function fetchArticleFromUrl(url: string): Promise<UrlArticle> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('Enter a URL.');

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error('That URL does not look valid.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only http and https URLs are supported.');
  }

  const response = await fetch(parsedUrl.href);
  if (!response.ok) {
    throw new Error('Could not fetch page (' + response.status + '). Try the extension.');
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const article = new Readability(doc).parse();
  const text = article?.textContent?.trim();

  if (!text || text.length < 40) {
    throw new Error('No article text on that page. Try the extension.');
  }

  return {
    title: article?.title?.trim() || parsedUrl.hostname,
    author: article?.byline?.trim() || parsedUrl.hostname,
    text,
  };
}
