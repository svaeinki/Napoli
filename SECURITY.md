# Security Policy

## Supported versions

Napoli is distributed as a desktop application. Only the latest released version
receives security fixes. Users are encouraged to run the most recent installer
available on the [Releases](https://github.com/svaeinki/Napoli/releases) page.

| Version | Supported |
| ------- | :-------: |
| 2.0.x   | Yes       |
| < 2.0   | No        |

## Reporting a vulnerability

If you believe you have found a security vulnerability in Napoli, **please do
not open a public GitHub issue.** Instead, report it privately:

- **Email:** diegomorenovillarroel@gmail.com
- **Subject line:** `[Napoli security] <short description>`

Please include:

- A description of the issue and its potential impact.
- Steps to reproduce, or a proof-of-concept if available.
- The version and operating system where the issue was observed.

You should expect an initial acknowledgement within 72 hours. Once the issue is
confirmed, a fix will be prepared, released, and credited to the reporter
(unless you prefer to remain anonymous).

## Scope

In scope:

- The application code in this repository.
- The release artifacts published to GitHub Releases (`.exe`, `.dmg`, `.AppImage`).
- The IPC surface exposed to the renderer via `src/preload.js`.
- The backup, restore, and Dropbox integration code.

Out of scope:

- The live production data of the shop that uses this app — that data is
  owned by its operator and is not part of this repository.
- Vulnerabilities in third-party dependencies that are already tracked upstream
  (`pnpm audit` is run on every release; please report upstream first when
  possible).
- Social engineering, physical access, or attacks requiring the attacker to
  already have admin access to the machine running the app.

## Hardening notes

A few things worth knowing when reviewing the code:

- All SQL queries use prepared statements with `?` placeholders — no string
  interpolation into SQL.
- Every value interpolated into `innerHTML` passes through `escaparHtml()`
  in `src/js/utils.js`.
- External URL navigation is restricted by an allowlist in
  `src/navigation-security.js`; only HTTPS Dropbox domains are permitted.
- IPC handlers never `throw` — they return `{ success, data? | error, code? }`
  so the renderer treats the boundary like a network call.
- Dropbox credentials (if configured) are stored only in the user's local
  `config.json` inside the OS user-data directory. There is no backend.
