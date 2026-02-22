# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Electron desktop application for **Napoli Reparadora de Calzado** — a Chilean shoe repair warehouse management system. The UI and variable names are in Spanish throughout.
Current release target documented in this repo: **2.0.2**.

## Commands

```bash
npm start           # Run the app in development (via scripts/start-electron.js)
npm run build       # Build for macOS and Windows
npm run build-mac   # Build macOS DMG only
npm run build-win   # Build Windows NSIS installer only
npm run rebuild     # Rebuild native modules (better-sqlite3) after Electron version changes
npm run check:syntax
npm run check:audit
npm run release:check
```

There is no automated UI/unit test suite configured. `postinstall` runs `electron-rebuild` automatically, and release validation is done via `release:check`.

## Architecture

**Electron with context isolation** — the app uses a strict security model:
- `main.js` (root): Electron main process — window creation, IPC handlers, DB init, auto-backup scheduling
- `src/preload.js`: Context bridge — the only communication channel between renderer and main process
- `src/database.js`: All SQLite operations via `DatabaseManager` class — never called from renderer directly
- `src/dropbox.js`: Dropbox SDK wrapper for optional cloud backup sync
- `src/index.html`: App shell with four tabs (Ingresar, Inventario, Buscar, Backup); tab content loaded dynamically from `src/html/`
- `src/js/`: Frontend modules, each responsible for one feature area

**Data flow:** Renderer JS → `window.electronAPI.*` (preload bridge) → IPC → main process → database.js → response back

**Frontend module system:** There is no bundler — all `src/js/*.js` files are loaded as plain `<script>` tags in `src/index.html` and share the global scope. Functions defined in one file (e.g., `mostrarNotificacion` in `utils.js`) are called directly from others. Load order in `index.html` matters:
1. `templateLoader.js` — must be first, sets up `window.templatesListos` promise
2. `theme.js`, `utils.js`, `validacion.js` — shared utilities
3. `articulos.js`, `inventario.js`, `pagos.js`, `busqueda.js`, `backups.js` — feature modules
4. `tickets.js`, `config.js` — printing and configuration
5. `main.js` — must be last, calls `actualizarInventario()` on load after `await window.templatesListos`

**Template loading:** `src/js/templateLoader.js` fetches HTML partials from `src/html/` and injects them into the DOM at startup. All frontend modules must `await window.templatesListos` before querying the DOM.

## Key Technical Details

**Database (SQLite / better-sqlite3):**
- DB file lives at `app.getPath('userData')/napoli.db`
- WAL journal mode, foreign keys enabled
- Prepared statements cached in `this.statements` on init for performance
- Main tables: `articulos` (repair tickets), `abonos` (payment installments), `auditoria` (action log)
- `numeroBodega` is optional; when empty it is normalized to `null` (uppercase when provided)
- Payment columns (`valorTotal`, `totalAbonado`, `saldoPendiente`, `estadoPago`) are added via migration if missing
- Abono registration uses `db.transaction()` to atomically insert the abono + update article totals

**IPC naming conventions:** handlers are namespaced by domain — `db:*`, `pago:*`, `backup:*`, `dropbox:*`, `config:*`, `util:*`, and `imprimir`

**Date format:** Chilean format `dd/mm/yyyy, hh:mm:ss` — parsed throughout the frontend by splitting on `,` then `/`. Currency uses `Intl.NumberFormat('es-CL')`.

**Configuration:** stored at `app.getPath('userData')/config.json` — includes printer settings (`width`, `header`, `footer`, `fontProfile58`). Printer config is sanitized via `sanitizarConfigImpresora()` in main.js (width/profile whitelist, 500-char limit on header/footer).

**Dropbox tokens** are encrypted with Electron's `safeStorage` before persisting to config

**Barcode scanner detection** in `src/js/main.js` uses keystroke timing (50ms threshold) to distinguish scanner input from manual typing

**Chilean RUT validation** is in `src/js/validacion.js` — used on all customer forms

**Tickets:** `src/js/tickets.js` exports a `Tickets` object (not plain functions like other modules) with `init()`, `generarHTML()`, and printing methods. For 58mm, typography profiles are supported: `compacto`, `legible`, `extra_grande`.

**Data exports:** CSV via plain JS, JSON for backups, Excel via `excel4node` with formatted headers/columns. All exports go to `app.getPath('userData')/backups/`.

**Backups:** automatic every 24h + on app close (`before-quit`). Old backups auto-cleaned after 30 days. Optional Dropbox upload after each backup.
