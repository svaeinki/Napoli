# Changelog

All notable changes to Napoli are documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Package manager migrated to Yarn 4 (via Corepack, `nodeLinker: node-modules`);
  CI now installs with `yarn install --immutable`.
- Spanish README is now the primary `README.md`; English moved to `README.en.md`.

### Security
- Bumped build-time `node-gyp` to v11 (patched `tar`) and forced `image-size` v2,
  clearing all high/critical findings from `check:audit`. `excel4node` is patched
  to use the `image-size` v2 API.

## [2.0.9] — 2026

### Changed
- Code review cleanup and refactoring across the database, backup, and IPC layers.
- Hardened release checks and tightened the dependency security workflow.

### Fixed
- Critical bug and security fixes rolled up prior to the production deployment.
- 58 mm thermal ticket: corrected top primer size and clipping compensation.

## [2.0.8] — 2026

### Changed
- Hardened database layer for production stability — added worker-thread failover,
  explicit transaction boundaries, and IPC short-circuiting during restore.

## [2.0.6] — 2026

### Changed
- CI: switched to a supported macOS runner for the release workflow.

## [2.0.5] — 2026

### Changed
- CI: release pipeline now publishes only installer artifacts (`.exe`, `.dmg`,
  `.AppImage`) — no auto-update channel.

## [2.0.4] — 2026

### Fixed
- Calibrated 58 mm thermal ticket width so narrow rolls print cleanly.

## [2.0.3] — 2025

### Added
- Ticket preview modal.
- Search by article ID (in addition to RUT, name, and location).
- Application icons for all platforms.
- `rebuild` script and OS-specific installation instructions in the README.
- Configurable ticket generation with QR code support.

### Changed
- UI palette revamped for light and dark themes; improved dark-mode logo contrast.
- Primary color scheme switched to red; added logo to the header.
- Flattened project structure — removed the `zapateria-bodega/` subdirectory.
- Upgraded `better-sqlite3` to v12; added `node-gyp` override.
- Explicitly configured x64 architecture for the Windows NSIS target.

### Security
- Hardening and stability fixes across the codebase (HTML escaping for tickets,
  prepared statements verified throughout).

## [2.0.0] — 2025

### Added
- Initial SQLite migration with transactional writes and robust backups.
- Dropbox integration for optional cloud backup sync.
- Payment and installment (abono) system with full history.
- Thermal ticket printing (58 mm / 80 mm) with configurable font profiles.
- Chilean RUT validation (modulo-11 verifier digit).
- Dark theme.

[Unreleased]: https://github.com/svaeinki/Napoli/compare/v2.0.9...HEAD
[2.0.9]: https://github.com/svaeinki/Napoli/releases/tag/v2.0.9
[2.0.8]: https://github.com/svaeinki/Napoli/commits/main
[2.0.6]: https://github.com/svaeinki/Napoli/releases/tag/v2.0.6
[2.0.5]: https://github.com/svaeinki/Napoli/commits/main
[2.0.4]: https://github.com/svaeinki/Napoli/releases/tag/v2.0.4
[2.0.3]: https://github.com/svaeinki/Napoli/releases/tag/v2.0.3
[2.0.0]: https://github.com/svaeinki/Napoli/commits/main
