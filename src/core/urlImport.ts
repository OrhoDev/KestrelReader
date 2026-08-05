export interface UrlArticle {
  title: string;
  author: string;
  text: string;
}

function parseTargetUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Enter a URL.');

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only http and https URLs are supported.');
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Only http')) throw error;
    throw new Error('That URL does not look valid.');
  }
}

function isExtensionContext(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'chrome-extension:';
}

async function fetchViaApi(url: string): Promise<UrlArticle> {
  const response = await fetch(`/api/fetch-article?url=${encodeURIComponent(url)}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : 'Could not fetch article.';
    throw new Error(message);
  }

  if (
    typeof payload.title !== 'string' ||
    typeof payload.author !== 'string' ||
    typeof payload.text !== 'string'
  ) {
    throw new Error('Could not fetch article.');
  }

  return payload;
}

export async function fetchArticleFromUrl(url: string): Promise<UrlArticle> {
  parseTargetUrl(url);

  if (isExtensionContext()) {
    throw new Error('Open the page in your browser, then use the Kestrel extension on that tab.');
  }

  return fetchViaApi(url);
}
