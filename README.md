# Lexigraph

Lexigraph is a local-first, frontend-only knowledge workbench. It lets a reader select exact English WordNet senses, collect them into a reusable palette, connect senses through other senses, and map the semantic content of a Wikipedia article into editable concept graphs.

The application is built with React, TypeScript, Vite, and React Flow. It requires no application server and is ready for GitHub Pages.

## What it does

- Restricts search to the WordNet 3.1 vocabulary; there are no arbitrary semantic entries.
- Presents definitions, parts of speech, synonyms, and example sentences for disambiguation.
- assigns stable IDs to synsets (`wn:<pos>:<offset>`) and word occurrences (`wn:<pos>:<offset>:<word-index>`).
- Collects chosen senses in a palette with definition tooltips.
- Provides editable, draggable concept graphs. Edges are labelled with a separately selected WordNet sense.
- Loads English Wikipedia pages through the public MediaWiki API, including a curated set of reproducible scientific topics.
- Maps selected article words or phrases to WordNet senses and carries them into the graph palette.
- Automatically persists senses, graph topology, node positions, and article annotations in browser `localStorage`.
- Follows the operating-system light/dark preference on first visit and allows a manual override.

## Local development

Requirements: Node.js 22+ and npm 10+.

```bash
npm ci
npm run dev
```

Open <http://localhost:5173>. The first production build preprocesses the `wordnet-db` package into static JSON assets under `public/wordnet/`. Those generated assets are ignored by Git because CI and Docker rebuild them deterministically.

Useful commands:

```bash
npm run lint        # ESLint
npm test            # Vitest
npm run build       # WordNet preprocessing + type-check + Vite build
npm run preview     # preview the production build
```

## WordNet implementation

`scripts/build-wordnet.mjs` reads WordNet's `data.noun`, `data.verb`, `data.adj`, and `data.adv` files from `wordnet-db`. It emits:

- `search.json`, a compact alphabetical lemma index used by autocomplete;
- one semantic data chunk per initial letter, loaded only after a word is selected;
- `meta.json`, containing the WordNet version and build counts.

This keeps runtime entirely static while avoiding a single large parse on page load. The browser never needs Node APIs or a backend. WordNet data is used under its included WordNet license; see the `wordnet-db` package for the license text.

Wikipedia content is requested directly from `https://en.wikipedia.org/w/api.php` with CORS enabled. It is not proxied or persisted anywhere except the current browser's local storage.

## Docker Compose

Build and start the production Nginx image:

```bash
docker compose up --build -d
docker compose ps
```

Open <http://localhost:8080>. Stop it with `docker compose down`.

The image uses a Node build stage and a small Nginx runtime stage. WordNet assets receive long-lived immutable cache headers.

## GitHub Pages and CI

The workflow at `.github/workflows/ci.yml` runs on pull requests and pushes to `main`:

1. installs locked dependencies;
2. lints and tests the project;
3. preprocesses WordNet and builds the static site;
4. verifies the Docker image;
5. deploys the artifact to GitHub Pages on `main`.

In the GitHub repository, enable **Settings → Pages → Build and deployment → Source: GitHub Actions**. Vite computes the repository subpath from `GITHUB_REPOSITORY`, and hash-based routing makes deep links safe on Pages.

## Data and privacy

The storage key is `lexigraph-workspace-v1`. No analytics, account, cookie, or remote database is used. Work survives reloads, but is specific to the browser profile and will be lost if the site's storage is cleared. The Help page provides an explicit workspace reset.

## Project structure

```text
src/components/       shared navigation and sense UI
src/context/          workspace state and persistence
src/lib/              WordNet, Wikipedia, and storage adapters
src/pages/            home, palette, graph, article, and help views
scripts/              build-time WordNet conversion
.github/workflows/    CI, Docker verification, Pages deployment
```
