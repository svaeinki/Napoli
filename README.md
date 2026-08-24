# Napoli

A desktop inventory and payments system for a shoe repair shop. Built with Electron and a local SQLite database, with optional Dropbox backups and thermal receipt printing.

[![Status](https://img.shields.io/badge/status-in%20production-success.svg)](#project-status)
[![Electron](https://img.shields.io/badge/Electron-40-47848F.svg)](https://www.electronjs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57.svg)](https://github.com/WiseLibs/better-sqlite3)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#installation)

> **Available in Spanish:** see [`README.es.md`](./README.es.md).

---

## Screenshots

> _Screenshots are being prepared and will be added under `docs/screenshots/`. The app has an inventory tab, a search tab, a payments/installments modal, a backups panel with Dropbox controls, and a configurable thermal-ticket preview in both light and dark themes._

---

## The problem

Small repair shops in Chile typically track orders on paper notebooks or generic spreadsheets. That makes it easy to lose tickets, forget partial payments, miscalculate balances, or leave items in the back room for months without noticing. Off-the-shelf POS software is either too expensive, too complex, or built around a register-and-barcode model that doesn't fit a workflow where every item is a one-off repair with a handwritten description.

Napoli was built for one specific shop — a real shoe repair business in Chile — and is in daily use behind the counter. It runs offline, prints thermal receipts, tracks installment payments, and backs itself up to Dropbox so a lost laptop doesn't mean a lost ledger.

---

## Features

- **Inventory management** — Register items with customer name, Chilean RUT, service type (soles, heels, stitching, dye, cleaning, etc.), optional bin location, and a per-item bag number. Track status (`In storage` / `Delivered`).
- **Aging alerts** — Visual warnings when an item has been sitting in storage too long, so nothing gets forgotten.
- **Search** — By RUT, name, ID, or location, with debounced live filtering.
- **CSV export** — For accounting or hand-off to external tools.
- **Chilean RUT validation** — Verifier-digit check (modulo 11) on entry, with formatting helpers.
- **Installment payments (abonos)** — Record a total price, take partial payments, keep a full payment history per item, and compute outstanding balance automatically. Supports cash, card, and transfer.
- **Thermal ticket printing** — 58 mm and 80 mm receipt formats, with three font profiles for the 58 mm size (`compact`, `readable`, `extra-large`). Header and footer are user-configurable from inside the app.
- **Automatic local backups** — SQLite file copies are taken on a schedule and on app close, written to the user-data directory.
- **Optional Dropbox sync** — If the user pastes a Dropbox access token, the same backups are mirrored to the cloud. The token stays on the user's machine; no backend is involved.
- **Guarded restore flow** — Restoring from a backup validates the file first, takes a pre-restore snapshot, and runs a smoke check afterwards so a corrupt backup can't brick the database.
- **Dark mode** — Preference persisted per user.
- **Fully offline** — The app does not require internet to function; Dropbox is strictly opt-in.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Shell | Electron 40 |
| Language | JavaScript (no bundler, no framework) |
| Database | SQLite via `better-sqlite3` |
| Cloud backup | Dropbox SDK (optional, user-configured) |
| CSV / Excel export | `excel4node` |
| Tests | Node.js built-in `node:test` runner |
| Build | `electron-builder` (NSIS, DMG, AppImage) |
| CI | GitHub Actions matrix (Windows / macOS / Linux) |

~6,700 lines of application code across ~30 modules, plus 17 test files covering database migrations, backup atomicity, restore utilities, RUT validation, IPC error contracts, and UI helpers.

---

## Architecture

```
main.js                      Electron main process — IPC handlers, FS, Dropbox, config
src/preload.js               Context bridge — typed window.electronAPI surface
src/db-service.js            DB orchestrator with worker-thread / legacy failover
src/db-worker.js             Worker thread that owns the SQLite connection
src/database.js              better-sqlite3 wrapper, schema, migrations, queries
src/dropbox.js               Dropbox SDK wrapper (optional)
src/chile-date.js            Chilean locale date helpers
src/navigation-security.js   External-URL allowlist
src/sqlite-restore-utils.js  Atomic restore + pre-restore snapshot helpers
src/diagnostics.js           In-app diagnostic event logger
src/index.html               Renderer shell
src/html/tab-*.html          Tab content, loaded dynamically at startup
src/html/modal-*.html        Modal fragments
src/js/                      Renderer modules (inventory, search, payments, tickets, ...)
scripts/tests/               node:test suites
```

The renderer is deliberately split into small modules (`articulos.js`, `inventario.js`, `pagos.js`, `busqueda.js`, `backups.js`, `tickets.js`, `config.js`, `validacion.js`, `utils.js`, `theme.js`, `templateLoader.js`). HTML fragments are loaded at runtime by `templateLoader.js` so each tab and modal lives in its own file, and the rest of the code waits on a `templatesListos` promise before touching the DOM.

All renderer ↔ main communication goes through IPC channels exposed by `preload.js`. Every handler follows the same contract: it returns `{ success, data? }` or `{ success: false, error, code? }` — never throws — and is blocked immediately during a DB restore so in-flight UI actions can't corrupt the restore.

---

## Technical decisions

A few calls worth calling out, since this is a portfolio piece:

### `better-sqlite3` over an ORM
SQLite is already the right engine for a single-tenant desktop app, and `better-sqlite3` is synchronous, transactional, and zero-config. An ORM would have added weight for very little upside: the schema is small, every mutation runs inside an explicit `db.transaction()`, and prepared statements give me SQL injection safety without ceremony. Migrations are idempotent `ALTER TABLE` calls — no migration framework needed.

### Worker-thread DB layer with a legacy fallback
`DBService` runs the DB inside a worker thread so slow queries can't freeze the UI, but if the worker ever fails to start or crashes, it falls back transparently to in-process "legacy mode." A small `modeTransitionQueue` promise chain serializes the mode switches so the app can't end up with two DB instances at once. This costs some complexity, but it means a worker-thread bug on an end user's machine never leaves them with a broken app.

### Dropbox instead of a hosted cloud backend
The shop owner already pays for Dropbox. Shipping a SaaS backend for one shop would mean hosting, auth, uptime, and a monthly bill — for a feature that's already a solved problem. The Dropbox token is pasted in by the user, stored locally, and the app talks to Dropbox directly. No backend servers, no user accounts, no vendor lock-in on my side.

### Vanilla JS, no bundler
The app has maybe a dozen screens and one user. Pulling in React + Vite + TypeScript would mean a build step, source maps, a watch mode, and a dependency tree to maintain — for UI that doesn't need reactivity beyond `innerHTML` + delegated events. The codebase is split into small modules loaded in a deterministic order, and the boundaries are explicit and easy to reason about.

### Chilean RUT validation on the client
RUT is the Chilean national ID used as the customer key in this shop. The validator implements the standard modulo-11 verifier-digit check so typos are caught at entry rather than surfacing later as duplicate-customer bugs.

### Explicit IPC contracts
Every IPC handler returns a structured result object rather than throwing — `{ success: true, data }` or `{ success: false, error, code }`. The renderer treats IPC like a network boundary, which makes error paths uniform and testable (see `scripts/tests/ipc-read-error-contract.test.js`). During a DB restore, every handler short-circuits with a busy response via `respuestaBloqueoRestoreEscritura()` so no write can land mid-restore.

### Guarded restore flow
Restoring a backup is the single most dangerous user action in the app: a bad file can destroy the live database. So the restore path validates the file header first, takes a snapshot of the current DB before touching it, does an atomic file replace, and runs a post-restore smoke check. If anything fails, the snapshot is rolled back in. See `src/sqlite-restore-utils.js` and `scripts/tests/sqlite-restore-utils.test.js`.

---

## Installation

### Run from source

Requires Node.js ≥ 20.

```bash
git clone https://github.com/svaeinki/napoli.git
cd napoli
pnpm install
pnpm run rebuild   # recompiles better-sqlite3 against Electron's Node ABI
pnpm start
```

### Run the test suite

```bash
pnpm test
```

### Build installers

Installers should be built on their native OS for best results:

```bash
pnpm run build-mac     # produces a .dmg
pnpm run build-win     # produces an .exe (NSIS)
pnpm run build-linux   # produces an .AppImage
```

Pre-release validation (syntax check + dependency audit + current-platform build):

```bash
pnpm run release:check
```

### Release flow

Releases are driven by pushing a `v*` tag. A GitHub Actions matrix builds on Windows, macOS, and Linux runners and publishes the three installers to GitHub Releases — no auto-update channel, no extra artifacts.

---

## Project status

- **In production.** Currently version **2.0.9** and in daily use at a real shoe repair shop in Chile since **November 2025** (first commit: 2025-11-27).
- Actively maintained. The changelog lives in the git log for now — see [suggested next steps](#whats-next).
- Bug reports and real-world pain points from the shop owner drive the roadmap more than feature wishlists.

---

## Privacy and data handling

Napoli is built for a real business and takes the data seriously:

- **Everything stays on the user's machine.** The SQLite database, the config file, and all local backups live in the OS user-data directory (`~/Library/Application Support/Napoli Reparadora/` on macOS, `%APPDATA%\Napoli Reparadora\` on Windows). Nothing is tracked, committed, or shipped with the installer.
- **No telemetry.** The app does not phone home. It makes no network calls unless the user explicitly configures Dropbox.
- **Dropbox is strictly opt-in.** The Dropbox access token is entered by the user and persisted locally. The app talks to Dropbox directly — there is no server I control in between.
- **No customer data in this repository.** The code is generic: schemas, validators, and UI. No customer names, RUTs, transactions, or backup files are committed. A full pre-publish audit (`gitleaks` + `trufflehog --only-verified` + manual PII sweep over the whole git history) found no secrets or business data in any commit.
- **SQL injection, XSS, and navigation hardening.** All queries use prepared statements. Every value interpolated into `innerHTML` goes through an `escaparHtml()` helper. External URL navigation is restricted to an allowlist (`src/navigation-security.js`).

---

## What's next

Realistic near-term items on the list:

- `CHANGELOG.md` to replace the current "read the git log" answer.
- Linux build hardening (currently x64 AppImage only).
- An optional encrypted backup mode for users who want zero-trust on Dropbox.
- A small "shop dashboard" view: items-in-storage-by-age histogram, monthly revenue, top service types.

This is a working tool first and a portfolio piece second, so new features are driven by whether they help the person behind the counter.

---

## License

MIT — see [`LICENSE`](./LICENSE).

---

## Contact

**Diego Moreno** — [diegomorenovillarroel@gmail.com](mailto:diegomorenovillarroel@gmail.com) — [github.com/svaeinki](https://github.com/svaeinki)

If you're a hiring manager reviewing this as part of my portfolio, I'm happy to walk through any part of the code, the decision log, or the production deployment.
