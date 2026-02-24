# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Napoli is an **Electron desktop app** for managing a shoe repair shop's inventory. It uses SQLite for persistence, supports thermal ticket printing (58mm/80mm), a payment/installment system, and optional Dropbox cloud backups.

## Commands

```bash
# Install and compile native modules (required after npm install)
npm install && npm run rebuild

# Run the app in development
npm start

# Run all tests
npm test

# Run a single test file
node --test scripts/tests/database-migration.test.js

# Syntax check
npm run check:syntax

# Pre-release validation (syntax + audit + Windows build)
npm run release:check

# Build installers (run on native OS for best results)
npm run build-mac     # .dmg
npm run build-win     # .exe (NSIS)
npm run build-linux   # .AppImage
```

**Note:** `better-sqlite3` is a native module. After updating Electron or Node versions, always run `npm run rebuild` to recompile it.

## Architecture

### Process Model (Electron)
- **`main.js`** — Main process. Handles all IPC handlers, file system, config, backup orchestration, and Dropbox. This is the only process with Node.js access.
- **`src/preload.js`** — Context bridge exposing `window.electronAPI` to the renderer. All renderer↔main communication goes through this typed API.
- **`src/index.html`** + **`src/js/*.js`** — Renderer process. Vanilla JS, no bundler. Scripts are loaded in order via `<script>` tags.

### Database Layer
The DB layer has a two-tier failover design:

1. **`src/db-service.js`** (`DBService`) — Orchestrator. Normally runs DB operations in a worker thread. If the worker crashes or fails to start, it falls back to "legacy mode" (direct in-process access via `DatabaseManager`).
2. **`src/db-worker.js`** — Worker thread that owns a `DatabaseManager` instance and communicates via `parentPort` messages.
3. **`src/database.js`** (`DatabaseManager`) — The actual `better-sqlite3` wrapper. Handles schema creation, migrations (via `ALTER TABLE`), and all SQL queries.

IPC channel naming convention: `db:*`, `pago:*`, `backup:*`, `dropbox:*`, `config:*`, `diag:*`, `app:*`

During a DB restore (`restauracionEnCurso = true`), all `db:*` and `pago:*` IPC calls return a busy error immediately.

### Renderer UI Pattern
Tab content is **not** in `index.html` — it's loaded dynamically at startup by `src/js/templateLoader.js` from `src/html/tab-*.html` fragments. All other JS modules wait on `window.templatesListos` (a Promise) before accessing the DOM.

Script load order in `index.html` is meaningful: `templateLoader.js` → `theme.js` → `utils.js` → `validacion.js` → `articulos.js` → `inventario.js` → `pagos.js` → `busqueda.js` → `backups.js` → `tickets.js` → `config.js` → `main.js`.

### Key Modules
| File | Responsibility |
|------|---------------|
| `src/js/tickets.js` | Thermal ticket rendering (58mm/80mm, font profiles: `compacto`/`legible`/`extra_grande`) |
| `src/js/inventario.js` | Inventory list, state management, CSV export |
| `src/js/backups.js` | Backup creation, validation, restore flow |
| `src/js/pagos.js` | Payment and installment (abono) modal |
| `src/chile-date.js` | Chilean locale date formatting (used throughout) |
| `src/navigation-security.js` | Allowlists external URLs; only `dropbox.com` is permitted |
| `src/sqlite-restore-utils.js` | Atomic file replace and pre-restore snapshot helpers |
| `src/diagnostics.js` | In-app diagnostic event logger |

### Data Persistence
- **Database:** `~/Library/Application Support/Napoli Reparadora/napoli.db` (macOS) / `%APPDATA%\Napoli Reparadora\napoli.db` (Windows)
- **Config:** `config.json` in same `userData` directory
- **Backups:** `backups/` subdirectory in `userData`
- DB schema uses `ALTER TABLE` migrations — new columns are added idempotently, never destructively.

### Testing
Tests use the **Node.js built-in `node:test`** runner (no Jest/Mocha). Many tests mock `better-sqlite3` by loading `database.js` in a `vm.createContext` sandbox with a `FakeDatabase` class — this avoids needing a real SQLite binary in tests.

### Release Flow
Releases are triggered by pushing a `v*` tag. GitHub Actions builds on native runners (`windows-latest`, `macos-15-intel`, `ubuntu-latest`) and publishes only final installers (`.exe`, `.dmg`, `.AppImage`) to GitHub Releases — no auto-update artifacts.
