# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Electron desktop application for **Napoli Reparadora de Calzado** — a Chilean shoe repair warehouse management system. The UI and variable names are in Spanish throughout.

## Commands

```bash
npm start           # Run the app in development
npm run build       # Build for macOS and Windows
npm run build-mac   # Build macOS DMG only
npm run build-win   # Build Windows NSIS installer only
npm run rebuild     # Rebuild native modules (better-sqlite3) after Electron version changes
```

There are no test or lint commands configured.

## Architecture

**Electron with context isolation** — the app uses a strict security model:
- `main.js` (root): Electron main process — window creation, 59 IPC handlers, DB init, auto-backup scheduling
- `src/preload.js`: Context bridge — the only communication channel between renderer and main process
- `src/database.js`: All SQLite operations — never called from renderer directly
- `src/dropbox.js`: Dropbox SDK wrapper for optional cloud backup sync
- `src/index.html`: App shell with four tabs; tab content is loaded dynamically from `src/html/`
- `src/js/`: Frontend modules, each responsible for one feature area

**Data flow:** Renderer JS → `window.electronAPI.*` (preload bridge) → IPC → main process → database.js → response back

**Template loading:** `src/js/templateLoader.js` fetches HTML partials from `src/html/` and injects them into the DOM at startup. Frontend modules must wait for this to complete before querying the DOM.

## Key Technical Details

**Database (SQLite / better-sqlite3):**
- DB file lives at `app.getPath('userData')/napoli.db`
- WAL journal mode, foreign keys enabled
- Main tables: `articulos` (repair tickets), `abonos` (payment installments), `auditoria` (action log)
- `numeroBodega` is the unique warehouse slot number auto-assigned on insert

**IPC naming conventions:** handlers are namespaced by domain — `db:*`, `pago:*`, `backup:*`, `dropbox:*`, `config:*`, `util:*`

**Configuration:** stored at `app.getPath('userData')/config.json` — includes printer settings (58mm/80mm width, header/footer text)

**Dropbox tokens** are encrypted with Electron's `safeStorage` before persisting to config

**Barcode/QR scanner detection** in `src/js/main.js` uses keystroke timing (50ms threshold) to distinguish scanner input from manual typing

**Chilean RUT validation** is in `src/js/validacion.js` — used on all customer forms

**Thermal receipt printing** targets `src/html/ticket.html` rendered in a hidden `<webview>` or print window; `src/css/ticket.css` is optimized for 58mm paper

**Data exports:** CSV via plain JS, JSON for backups, Excel via ExcelJS with color-coded rows and auto-filters
