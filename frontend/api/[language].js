// Vercel serverless function: runs "Run Code" submissions server-side.
//
// Primary engine: Judge0 CE's free public community instance
// (https://ce.judge0.com). Unlike api.judge0.com (which has required a
// RapidAPI key since 2020) and the Piston public API (which stopped being
// key-free on Feb 15, 2026), ce.judge0.com does not require an API key.
// It is soft rate-limited per IP, so it can occasionally be slow/queued,
// but it's the most reliable free, no-auth option available right now.
//
// Fallback engine: CodeX (api.codex.jaagrav.in) — kept only as a second
// attempt in case Judge0 is ever briefly unavailable. Its own README
// says "very early stages of development, consider not using in
// production," so it should not be relied on alone.
const JUDGE0_URL = 'https://ce.judge0.com/submissions?base64_encoded=false&wait=true';
const CODEX_URL = 'https://api.codex.jaagrav.in';

// Frontend route segment -> language identifiers for each engine.
// Judge0 language IDs are fixed IDs from its /languages catalog.
const LANGUAGES = {
  cpp: { judge0Id: 54, codex: 'cpp' },       // C++ (GCC 9.2.0)
  java: { judge0Id: 62, codex: 'java' },     // Java (OpenJDK 13.0.1)
  javascript: { judge0Id: 63, codex: 'js' }, // JavaScript (Node.js 12.14.0)
};

async function runOnJudge0(languageId, code) {
  const response = await fetch(JUDGE0_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_code: code,
      language_id: languageId,
      stdin: '',
    }),
  });

  if (!response.ok) {
    throw new Error(`Judge0 API error: ${response.status}`);
  }

  const result = await response.json();

  // status.id: 3 = Accepted (ran successfully). 6 = Compilation Error.
  // Anything else (runtime error, TLE, MLE, etc.) also counts as a failure
  // to surface to the user.
  if (result.status && result.status.id === 6) {
    return { status: 'error', message: result.compile_output || 'Compilation error' };
  }
  if (result.status && result.status.id !== 3) {
    return {
      status: 'error',
      message: result.stderr || result.compile_output || result.status.description || 'Execution failed',
    };
  }

  return { status: 'success', stdout: result.stdout || '', stderr: result.stderr || '' };
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
    const result = await runOnJudge0(langConfig.judge0Id, code);
    return res.status(200).json(result);
  } catch (err) {
    lastError = err.message;
  }

  try {
    const result = await runOnCodex(langConfig.codex, code);
    return res.status(200).json(result);
  } catch (err) {
    lastError = `Judge0 failed (${lastError}); CodeX also failed (${err.message})`;
  }

  return res.status(200).json({
    status: 'error',
    message: `Code execution is temporarily unavailable. ${lastError}`,
  });
}