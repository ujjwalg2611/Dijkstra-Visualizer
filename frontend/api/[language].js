// Vercel serverless function: proxies "Run Code" requests to the Piston
// execution API. Lives at /api/cpp, /api/java, /api/javascript (same origin
// as the frontend, so no CORS setup or separate host is needed).
const PISTON_URL = 'https://emkc.org/api/v2/piston/execute';
const ALLOWED_LANGUAGES = new Set(['cpp', 'java', 'javascript']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  const { language } = req.query;
  if (!ALLOWED_LANGUAGES.has(language)) {
    return res.status(400).json({ status: 'error', message: `Unsupported language: ${language}` });
  }

  const { code } = req.body || {};
  if (typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ status: 'error', message: 'Missing "code" string in request body' });
  }

  try {
    const upstream = await fetch(PISTON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language,
        version: '*',
        files: [{ content: code }],
      }),
    });

    if (!upstream.ok) {
      throw new Error(`Piston API error: ${upstream.status}`);
    }

    const result = await upstream.json();

    if (result.compile && result.compile.code !== 0) {
      return res.status(200).json({ status: 'error', message: result.compile.stderr || result.compile.output });
    }
    if (result.run.code !== 0) {
      return res.status(200).json({ status: 'error', message: result.run.stderr || result.run.output });
    }

    return res.status(200).json({
      status: 'success',
      stdout: result.run.stdout,
      stderr: result.run.stderr,
    });
  } catch (error) {
    return res.status(200).json({ status: 'error', message: error.message });
  }
}