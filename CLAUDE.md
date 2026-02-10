# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Napoli Reparadora is an Electron desktop application for managing a shoe repair shop's warehouse. Built with vanilla JavaScript (no TypeScript), SQLite via better-sqlite3, and optional Dropbox cloud backup. All UI text, variable names, and comments are in **Spanish**.

## Commands

All commands run from `zapateria-bodega/`:

```bash
npm start          # Run app in development mode
npm run rebuild    # Rebuild native modules (better-sqlite3) for current OS/Electron
npm run build      # Build installers for macOS + Windows
npm run build-mac  # Build macOS DMG only
npm run build-win  # Build Windows NSIS (x64) only
```

There are no test, lint, or type-check commands configured.

## Architecture

**Electron main/renderer process split with context isolation:**

- `main.js` (root) — Electron main process: window creation, IPC handlers, app lifecycle, auto-backup scheduling
- `src/preload.js` — Security bridge exposing `electronAPI` via contextBridge (no nodeIntegration in renderer)
- `src/database.js` — `DatabaseManager` class: all SQLite operations (CRUD, search, payments, auditing)
- `src/dropbox.js` — `DropboxManager` class: cloud backup sync with Dropbox API
- `src/js/` — Frontend modules (vanilla JS, one file per feature)
- `src/html/` — HTML templates dynamically loaded into `index.html` containers via `templateLoader.js`
- `src/css/` — Stylesheets with CSS custom properties for theming

**IPC channel naming convention:** `namespace:action` (e.g., `db:insertar`, `pago:registrarAbono`, `backup:crear`)

## Key Patterns

- **No frameworks** — DOM manipulation is direct vanilla JS; each feature module exports functions called from `src/js/main.js`
- **Database** — SQLite with WAL mode, foreign keys enabled, prepared statements for all queries. Tables: `articulos`, `abonos` (payments), `auditoria` (audit log). Indexed on `rut`, `estado`, `numeroBodega`, `fechaIngreso`
- **Theming** — Dark/light toggle via `.dark-theme` class on `<body>`, persisted in localStorage
- **Scanner detection** — Keyboard input timing analysis in `src/js/main.js` distinguishes barcode scanner from manual typing
- **Chilean RUT validation** — Full checksum validation with formatting (XX.XXX.XXX-X) in `src/js/validacion.js`
- **Currency formatting** — Chilean peso format ($XX.XXX) via `src/js/utils.js`

## Native Module Note

`better-sqlite3` is a native Node module that must match the Electron version and OS architecture. Run `npm run rebuild` after switching platforms or updating Electron.

## Data Storage

Database path is OS-dependent via Electron's `app.getPath('userData')`:
- Windows: `%APPDATA%/napoli-reparadora/napoli.db`
- macOS: `~/Library/Application Support/napoli-reparadora/napoli.db`
- Linux: `~/.config/napoli-reparadora/napoli.db`
