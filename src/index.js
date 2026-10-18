const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const pool = new Pool();
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/notes', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, title, body, created_at FROM notes ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: 'failed to save note' });
  }
});

app.delete('/api/notes/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM notes WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to delete note' });
  }
});

const port = process.env.PORT || 3000;

pool
  .query(`CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)
  .then(() => {
    app.listen(port, () => console.log(`notes-api listening on ${port}`));
  })
  .catch((err) => {
    console.error('could not connect to database', err);
    process.exit(1);
  });
