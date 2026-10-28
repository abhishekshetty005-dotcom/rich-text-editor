const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const DOCS_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'docs');
const ID_PATTERN = /^[0-9a-f-]{36}$/;

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const docPath = (id) => path.join(DOCS_DIR, `${id}.json`);

async function readDoc(id) {
  return JSON.parse(await fs.readFile(docPath(id), 'utf8'));
}

async function writeDoc(doc) {
  // Write to a temp file then rename so a crash never leaves a half-written doc.
  const tmp = `${docPath(doc.id)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(doc));
  await fs.rename(tmp, docPath(doc.id));
}

function validId(req, res, next) {
  if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  next();
}

function cleanInput(body = {}) {
  return {
    title: typeof body.title === 'string' ? body.title.slice(0, 200) : 'Untitled',
    content: typeof body.content === 'string' ? body.content : '',
  };
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/docs', async (req, res, next) => {
  try {
    const files = (await fs.readdir(DOCS_DIR)).filter((f) => f.endsWith('.json'));
    const docs = await Promise.all(files.map((f) => readDoc(f.slice(0, -5)).catch(() => null)));
    res.json(
      docs
        .filter(Boolean)
        .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );
  } catch (err) {
    next(err);
  }
});

app.get('/api/docs/:id', validId, async (req, res, next) => {
  try {
    res.json(await readDoc(req.params.id));
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
    next(err);
  }
});

app.post('/api/docs', async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    const doc = { id: crypto.randomUUID(), ...cleanInput(req.body), createdAt: now, updatedAt: now };
    await writeDoc(doc);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

app.put('/api/docs/:id', validId, async (req, res, next) => {
  try {
    const existing = await readDoc(req.params.id);
    const doc = { ...existing, ...cleanInput(req.body), updatedAt: new Date().toISOString() };
    await writeDoc(doc);
    res.json(doc);
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
    next(err);
  }
});

app.delete('/api/docs/:id', validId, async (req, res, next) => {
  try {
    await fs.unlink(docPath(req.params.id));
    res.status(204).end();
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

fs.mkdir(DOCS_DIR, { recursive: true }).then(() => {
  const server = app.listen(PORT, () => console.log(`Rich text editor running on http://localhost:${PORT}`));
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});
