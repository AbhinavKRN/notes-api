# notes-api

A small notes app. Express backend, Postgres for storage, plain HTML/JS frontend.

## Running

You need Node 20+ and a Postgres instance.

```
npm install
PGHOST=localhost PGUSER=postgres PGPASSWORD=... PGDATABASE=notes npm start
```

Open http://localhost:3000.

## API

- `GET /api/notes`
- `POST /api/notes` with `{ "title": "...", "body": "..." }`
- `DELETE /api/notes/:id`
