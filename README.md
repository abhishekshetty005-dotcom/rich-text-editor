# Rich Text Editor

A simple, self-hosted rich text editor. Node.js + Express backend, vanilla JS frontend, documents stored as JSON files on a Docker volume.

## Features

- Bold, italic, underline, strikethrough, text color and highlight
- Headings, quotes, code blocks, bulleted/numbered lists, indentation, alignment
- Links, horizontal rules, clear formatting, undo/redo
- Multiple documents with autosave (and `Ctrl+S` to save immediately)
- Pasted and loaded HTML is sanitized to a safe subset of tags
- Word and character count
- Light, dark, and system-matched themes (remembered per browser)

## Run with Docker

```sh
docker compose up -d --build
```

Open http://localhost:3000. Documents persist in the `editor-data` volume across restarts.

Stop it with `docker compose down` (add `-v` to also delete all documents).

Without Compose:

```sh
docker build -t rich-text-editor .
docker run -d -p 3000:3000 -v editor-data:/data --name rich-text-editor rich-text-editor
```

## Run locally (no Docker)

```sh
npm install
npm start
```

Documents are stored in `./data/docs`.

## Configuration

| Variable   | Default                         | Description                 |
|------------|---------------------------------|-----------------------------|
| `PORT`     | `3000`                          | HTTP port                   |
| `DATA_DIR` | `/data` (Docker), `./data` (local) | Where documents are stored |

## API

| Method | Path             | Description                       |
|--------|------------------|-----------------------------------|
| GET    | `/api/docs`      | List documents (id, title, updatedAt) |
| GET    | `/api/docs/:id`  | Get a document                    |
| POST   | `/api/docs`      | Create `{ title, content }`       |
| PUT    | `/api/docs/:id`  | Update `{ title, content }`       |
| DELETE | `/api/docs/:id`  | Delete a document                 |
