import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

function isPrivateIpv4(a, b, c, d) {
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return true;
    return isPrivateIpv4(parts[0], parts[1], parts[2], parts[3]);
  }

  return false;
}

function parseTargetUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Enter a URL.');

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('That URL does not look valid.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are supported.');
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error('That URL cannot be fetched.');
  }

  return parsed;
}

function extractArticle(html, pageUrl) {
  const { document } = parseHTML(html);
  const base = document.createElement('base');
  base.href = pageUrl.href;
  document.head?.append(base);

  const article = new Readability(document).parse();
  const text = article?.textContent?.trim();

  if (!text || text.length < 40) {
    throw new Error('No article text on that page. Try a direct article link.');
  }

  return {
    title: article?.title?.trim() || pageUrl.hostname,
    author: article?.byline?.trim() || pageUrl.hostname,
    text,
  };
}

export async function fetchArticleFromUrl(rawUrl) {
  const pageUrl = parseTargetUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(pageUrl.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'KestrelReader/1.0 (+https://kestrel-reader.vercel.app)',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The page took too long to respond.');
    }
    throw new Error('Could not reach that URL.');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Could not fetch page (${response.status}).`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new Error('That URL did not return an HTML page.');
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error('Page is too large to import.');
  }

  const html = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  return extractArticle(html, pageUrl);
}
