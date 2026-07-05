// Vercel serverless function: proxies Overpass API requests server-side.
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body || {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing "query" string in request body' });
  }

  let lastError = null;

  for (const url of OVERPASS_MIRRORS) {
    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Dijkstra-Visualizer/1.0 (https://dijkstra-visualizer-delta.vercel.app)',
        },
        body: 'data=' + encodeURIComponent(query),
      });

      if (!upstream.ok) {
        lastError = `${url} responded ${upstream.status}`;
        continue;
      }

      const data = await upstream.json();
      return res.status(200).json(data);
    } catch (err) {
      lastError = `${url} failed: ${err.message}`;
    }
  }

  return res.status(502).json({
    error: `All Overpass mirrors failed. Last error: ${lastError}`,
  });
}
