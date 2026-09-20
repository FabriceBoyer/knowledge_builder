# Lexigraph

Lexigraph is a local-first, frontend-only knowledge workbench. It lets a reader select exact English WordNet senses, collect them into a reusable palette, connect senses through other senses, and map the semantic content of a Wikipedia article into editable concept graphs.

The application is built with React, TypeScript, Vite, and React Flow. It requires no application server and is ready for GitHub Pages.

## What it does

- Restricts search to the WordNet 3.1 vocabulary; there are no arbitrary semantic entries.
- Presents definitions, parts of speech, synonyms, and example sentences for disambiguation.
- assigns stable IDs to synsets (`wn:<pos>:<offset>`) and word occurrences (`wn:<pos>:<offset>:<word-index>`).
- Collects chosen senses in a palette with definition tooltips.
- Provides interchangeable canvas and text-column concept editors. Entities can be replaced or deleted with their incident relations; relationships can be relabelled, reconnected, or removed explicitly.
- Loads English Wikipedia pages through the public MediaWiki API, including a curated set of reproducible scientific topics.
- Maps selected article words or phrases to WordNet senses and carries them into the graph palette.
- Requires a verified PocketBase account (email/password or GitHub), immediately persists senses, graph topology, node positions, and article annotations in account-scoped IndexedDB, then synchronizes every device through Automerge changes and PocketBase realtime events.
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

The active local database is IndexedDB `lexigraph-cache`, object store `automerge-replicas`, keyed by the authenticated user ID. Each record contains the binary Automerge document and a durable queue of unsent binary changes. Local persistence happens before network delivery, so editing remains safe if PocketBase or the network is unavailable. The former `lexigraph-workspace-v1:<user-id>` snapshot and `lexigraph-crdt-v1:<user-id>` localStorage journal are read only as migration sources. The application synchronizes through `https://pocketbase.knowledge.ovh` (override with `VITE_POCKETBASE_URL`).

### Realtime and offline merge

Lexigraph uses `@automerge/automerge` as its CRDT. The workspace is normalized into independently mergeable entries for senses, graph metadata, nodes, relations, the active graph, article metadata, and annotations. Every local mutation produces a binary Automerge change, updates the IndexedDB replica immediately, and enters the durable upload queue before network access is attempted.

When online, immutable changes are appended to PocketBase and delivered to other signed-in instances with its SSE realtime API. On startup and reconnection, each client fetches the owner-scoped checkpoints and remaining changes before flushing queued changes, so events missed during an outage are recovered. Unique change IDs make uploads idempotent, while Automerge causal history merges concurrent edits without relying on arrival order. Existing snapshots and the former custom CRDT journal are imported once when no Automerge cloud state exists.

To keep replay bounded, a client creates a complete Automerge checkpoint after 100 cloud changes or roughly 512 KB of encoded change data. Only after PocketBase confirms that checkpoint does the client delete the exact change records it incorporated and older checkpoints it observed. Concurrent, newly-arrived changes are left untouched and merge into the checkpoint normally. Compaction is therefore safe to retry after interruption.

Authentication and email ownership verification are mandatory. Password registrations receive a verification link before they can sign in; the sign-in page can resend it and offers a complete password-reset flow. GitHub OAuth accounts are accepted only when GitHub supplies a verified email. PocketBase retains the session token while passwords are never stored in workspace data. Local snapshots are namespaced by authenticated user ID, preventing data leakage when multiple accounts share a browser. PocketBase record rules restrict every workspace operation to the authenticated owner, and the owner field has a unique index: users cannot list or read each other's data and each account has exactly one workspace. No administrator credential or application secret is shipped to the frontend.

### PocketBase collections

The reproducible migrations are in `pocketbase/pb_migrations/`. Apply them from the PocketBase host with:

```bash
./pocketbase migrate up
```

They create and configure:

- `lexigraph_users`, a dedicated auth collection allowing registration and password authentication while preventing public listing or viewing and refusing authentication until `verified = true`;
- `lexigraph_workspaces`, with an owner relation, JSON data, client timestamp, schema version, a unique owner index, and owner-only CRUD rules.
- `lexigraph_automerge_changes`, immutable owner-only binary Automerge changes with unique change IDs for realtime catch-up;
- `lexigraph_automerge_checkpoints`, owner-only full Automerge documents used to bound replay and safely compact incorporated changes.

`lexigraph_workspaces` and `lexigraph_sync_operations` remain available only to migrate work created by older releases.

Email verification and password-reset links return to `https://fabriceboyer.github.io/knowledge_builder/`. PocketBase SMTP must be enabled for password registration and recovery.

For GitHub login, create a GitHub OAuth App with:

- Homepage URL: `https://fabriceboyer.github.io/knowledge_builder/`
- Authorization callback URL: `https://pocketbase.knowledge.ovh/api/oauth2-redirect`

Expose its credentials to PocketBase as `LEXIGRAPH_GITHUB_CLIENT_ID` and `LEXIGRAPH_GITHUB_CLIENT_SECRET` before applying the migration. On an existing instance, the same provider can be enabled directly under **Collections → lexigraph_users → Options → OAuth2 → GitHub**. Secrets belong only on the PocketBase host or in PocketBase's encrypted configuration and must never be added to Vite variables or committed.

The cloud icon in the application header shows the current state: green means realtime synchronization is active, rotating means connecting or merging, and coral means the application is safely queueing changes locally until reconnection.

### Install as a mobile app

Lexigraph is a Progressive Web App. On a supported browser, open the deployed site once while online, then use the **Install Lexigraph** button in the header (or the browser’s “Add to Home Screen” menu on iOS). The service worker caches the app shell for fast startup and offline navigation; workspace data remains in IndexedDB and continues to synchronize through PocketBase when connectivity returns.

Run the disposable end-to-end check against the configured instance with:

```bash
node scripts/smoke-pocketbase.mjs
```

It verifies anonymous-write rejection, registration, authentication, owner-scoped workspace create/read/update, and finally removes the temporary account (the related workspace is cascade-deleted). `scripts/smoke-realtime-sync.mjs` separately verifies realtime Automerge change delivery plus checkpoint create/restore/delete with two authenticated clients.

## Project structure

```text
src/components/       shared navigation and sense UI
src/context/          workspace state and persistence
src/lib/              WordNet, Wikipedia, and storage adapters
src/pages/            home, palette, graph, article, and help views
scripts/              build-time WordNet conversion
.github/workflows/    CI, Docker verification, Pages deployment
```
