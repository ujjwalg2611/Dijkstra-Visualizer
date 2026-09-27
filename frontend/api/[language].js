// Vercel serverless function: runs "Run Code" submissions server-side.
//
// Primary engine: Piston (https://github.com/engineer-man/piston), the same
// public code-execution API this project's own backend/server.js already
// uses. It's stable and used in production by lots of projects.
//
// Fallback engine: CodeX (api.codex.jaagrav.in) — a free hobby API that the
// project used to rely on exclusively. Its own README says "very early
// stages of development, consider not using in production", and in
// practice it frequently returns 503 (that's the "CodeX API error: 503"
// you were seeing). It's kept here only as a second attempt in case Piston
// is ever rate-limited or briefly unavailable.
const PISTON_URL = 'https://emkc.org/api/v2/piston/execute';
const CODEX_URL = 'https://api.codex.jaagrav.in';

// Frontend route segment -> language identifiers for each engine, plus the
// filename extension Piston should use (helps some compilers/interpreters
// pick the right mode).
const LANGUAGES = {
  cpp: { piston: 'c++', codex: 'cpp', filename: 'main.cpp' },
  java: { piston: 'java', codex: 'java', filename: 'Main.java' },
  javascript: { piston: 'javascript', codex: 'js', filename: 'main.js' },
};

async function runOnPiston(pistonLanguage, filename, code) {
  const response = await fetch(PISTON_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: pistonLanguage,
      version: '*',
      files: [{ name: filename, content: code }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Piston API error: ${response.status}`);
  }

  const result = await response.json();

  if (result.compile && result.compile.code !== 0) {
    return { status: 'error', message: result.compile.stderr || result.compile.output };
  }
  if (!result.run) {
    throw new Error('Piston API returned an unexpected response');
  }
  if (result.run.code !== 0) {
    return { status: 'error', message: result.run.stderr || result.run.output };
  }

  return { status: 'success', stdout: result.run.stdout, stderr: result.run.stderr || '' };
}

async function runOnCodex(codexLanguage, code) {
  const body = new URLSearchParams({ code, language: codexLanguage, input: '' });

  const response = await fetch(CODEX_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`CodeX API error: ${response.status}`);
  }

  const result = await response.json();

  if (result.error) {
    return { status: 'error', message: result.error };
  }

  return { status: 'success', stdout: result.output ?? '', stderr: '' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  const { language } = req.query;
  const langConfig = LANGUAGES[language];
  if (!langConfig) {
    return res.status(400).json({ status: 'error', message: `Unsupported language: ${language}` });
  }

  const { code } = req.body || {};
  if (typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ status: 'error', message: 'Missing "code" string in request body' });
  }

  let lastError = null;

  try {
    const result = await runOnPiston(langConfig.piston, langConfig.filename, code);
    return res.status(200).json(result);
  } catch (err) {
    lastError = err.message;
  }

  try {
    const result = await runOnCodex(langConfig.codex, code);
    return res.status(200).json(result);
  } catch (err) {
    lastError = `Piston failed (${lastError}); CodeX also failed (${err.message})`;
  }

  return res.status(200).json({
    status: 'error',
    message: `Code execution is temporarily unavailable. ${lastError}`,
  });
}