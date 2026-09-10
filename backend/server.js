const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

app.use(bodyParser.json());
app.use(cors());

const PISTON_URL = 'https://emkc.org/api/v2/piston/execute';

async function runOnPiston(language, code) {
  const response = await fetch(PISTON_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language,
      version: '*',
      files: [{ content: code }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Piston API error: ${response.status}`);
  }

  return response.json();
}

app.post('/api/cpp', async (req, res) => {
  const code = req.body.code;
  try {
    const result = await runOnPiston('cpp', code);

    if (result.compile && result.compile.code !== 0) {
      return res.json({ status: 'error', message: result.compile.stderr || result.compile.output });
    }
    if (result.run.code !== 0) {
      return res.json({ status: 'error', message: result.run.stderr || result.run.output });
    }

    res.json({ status: 'success', stdout: result.run.stdout, stderr: result.run.stderr });
  } catch (error) {
    res.json({ status: 'error', message: error.message });
  }
});

app.post('/api/java', async (req, res) => {
  const code = req.body.code;
  try {
    const result = await runOnPiston('java', code);

    if (result.compile && result.compile.code !== 0) {
      return res.json({ status: 'error', message: result.compile.stderr || result.compile.output });
    }
    if (result.run.code !== 0) {
      return res.json({ status: 'error', message: result.run.stderr || result.run.output });
    }

    res.json({ status: 'success', stdout: result.run.stdout, stderr: result.run.stderr });
  } catch (error) {
    res.json({ status: 'error', message: error.message });
  }
});

app.post('/api/javascript', async (req, res) => {
  const code = req.body.code;
  try {
    const result = await runOnPiston('javascript', code);

    if (result.run.code !== 0) {
      return res.json({ status: 'error', message: result.run.stderr || result.run.output });
    }

    res.json({ status: 'success', stdout: result.run.stdout, stderr: result.run.stderr });
  } catch (error) {
    res.json({ status: 'error', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});