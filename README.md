# Learn Copilot CLI

A static slot-machine-style picker for Copilot CLI teaching prompts and video intros.

The ingestion step reads the published Copilot CLI cheatsheet as the primary structured source, merges in official GitHub Docs command coverage, and writes a static JSON payload directly to `public/data/topics.json`. If the cheatsheet is unavailable, ingestion falls back to the official docs. The browser app reads that JSON at runtime, so it deploys cleanly to GitHub Pages or any static host.

The generated app copy does not copy cheatsheet prose directly. The cheatsheet provides command structure, examples, and categories. Official docs provide canonical reference text and fallback coverage.

## Quick start

```bash
npm install
npm run ingest
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

## Force a landing item for recording

The public UI stays clean, but presenter mode is still there:

1. Press the backtick key: `` ` ``
2. Enter a command, slug, id, or partial syntax such as `/mcp show`
3. Click **Store Command**
4. Click **Spin**

The reel still looks random, then lands on the stored item.

URL forcing also works:

```text
http://localhost:5173/?force=/mcp%20show
```

## Scripts

- `npm run ingest`: reads the cheatsheet + official docs and writes `public/data/topics.json`.
- `npm run dev`: starts the app.
- `npm test`: runs TypeScript UI/picker/reel tests.
- `npm run test:py`: runs ingestion tests.
- `npm run build`: type-checks and builds production assets.
- `npm run preview`: serves the production build locally.

## Data output

- Frontend payload: `public/data/topics.json`

The payload includes `generatedAt`, `sourceUrl`, `sourceUrls`, `topicCount`, `types`, and `topics`. Each topic includes provenance fields such as `source_kind`, `sources`, and `official_purpose`.

## Details panel

Before the first spin, the reel shows `Press Spin` and no details card. After the reel settles, the selected item shows:

- item type
- title
- syntax when it adds information beyond the title
- short synopsis
- compact explanation
- up to two examples

Flash without payload is just a slot machine wearing a conference badge. We avoided that tragedy.
