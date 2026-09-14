// Vercel serverless function: proxies "Run Code" requests to the CodeX
// execution API (free, no signup/key required). Lives at /api/cpp,
// /api/java, /api/javascript (same origin as the frontend, so no CORS
// setup or separate host is needed).
const CODEX_URL = 'https://api.codex.jaagrav.in';

// Frontend route segment -> CodeX's language code
const LANGUAGE_MAP = {
  cpp: 'cpp',
  java: 'java',
  javascript: 'js',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  const { language } = req.query;
  const codexLanguage = LANGUAGE_MAP[language];
  if (!codexLanguage) {
    return res.status(400).json({ status: 'error', message: `Unsupported language: ${language}` });
  }

  const { code } = req.body || {};
  if (typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ status: 'error', message: 'Missing "code" string in request body' });
  }

  try {
    const body = new URLSearchParams({
      code,
      language: codexLanguage,
      input: '',
    });

    const upstream = await fetch(CODEX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!upstream.ok) {
      throw new Error(`CodeX API error: ${upstream.status}`);
    }

    const result = await upstream.json();

    if (result.error) {
      return res.status(200).json({ status: 'error', message: result.error });
    }

    return res.status(200).json({
      status: 'success',
      stdout: result.output ?? '',
      stderr: '',
    });
  } catch (error) {
    return res.status(200).json({ status: 'error', message: error.message });
  }
}