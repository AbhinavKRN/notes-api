const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const client = require('prom-client');
const { span } = require('./trace');

const pool = new Pool();
const app = express();

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra }));

client.collectDefaultMetrics();
const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'HTTP requests',
  labelNames: ['method', 'route', 'status'],
});
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2],
});

let shuttingDown = false;

const quiet = new Set(['/healthz', '/readyz', '/metrics']);

app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  const trace = span();
  res.on('finish', () => {
    const route = req.route ? req.route.path : 'other';
    end({ method: req.method, route });
    httpRequests.inc({ method: req.method, route, status: res.statusCode });
    if (quiet.has(route)) return;
    trace.end(`${req.method} ${route}`, res.statusCode);
    log(res.statusCode >= 500 ? 'error' : 'info', 'request', {
      method: req.method, path: req.originalUrl, status: res.statusCode, traceId: trace.traceId,
    });
  });
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

app.get('/readyz', async (req, res) => {
  if (shuttingDown) return res.status(503).json({ status: 'shutting down' });
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'database unavailable' });
  }
});

app.get('/version', (req, res) => res.json({ commit: process.env.GIT_SHA || 'dev' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/api/notes', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, title, body, created_at FROM notes ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    log('error', 'failed to load notes', { error: err.message });
    res.status(500).json({ error: 'failed to load notes' });
  }
});

app.post('/api/notes', async (req, res) => {
  const { title, body } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO notes (title, body) VALUES ($1, $2) RETURNING id, title, body, created_at',
      [title, body || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    log('error', 'failed to save note', { error: err.message });
    res.status(500).json({ error: 'failed to save note' });
  }
});

app.delete('/api/notes/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM notes WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  } catch (err) {
    log('error', 'failed to delete note', { error: err.message });
    res.status(500).json({ error: 'failed to delete note' });
  }
});

const port = process.env.PORT || 3000;

async function initDb(attempts = 30) {
  for (let i = 1; ; i++) {
    try {
      return await pool.query(`CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    } catch (err) {
      if (i >= attempts) throw err;
      log('warn', 'database not ready, retrying', { attempt: i, error: err.message });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

if (require.main === module) {
  initDb()
    .then(() => {
      const server = app.listen(port, () => log('info', 'notes-api listening', { port, commit: process.env.GIT_SHA }));
      process.on('SIGTERM', () => {
        shuttingDown = true;
        log('info', 'SIGTERM received, draining');
        setTimeout(() => server.close(() => pool.end().then(() => process.exit(0))), 5000);
      });
    })
    .catch((err) => {
      log('error', 'could not connect to database', { error: err.message });
      process.exit(1);
    });
}

module.exports = app;
