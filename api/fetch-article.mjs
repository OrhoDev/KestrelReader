import { fetchArticleFromUrl } from '../lib/fetchArticle.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const url = typeof req.query?.url === 'string' ? req.query.url : '';
  if (!url) {
    res.status(400).json({ error: 'Missing url parameter.' });
    return;
  }

  try {
    const article = await fetchArticleFromUrl(url);
    res.status(200).json(article);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not fetch article.';
    res.status(422).json({ error: message });
  }
}
