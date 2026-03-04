# Experimental Migration Workspace

Este directorio agrupa piezas de la migración experimental definida para Napoli:

- `backend-api/`: backend Fastify con modo `memory` y `postgres`.
- `shared/`: contrato de sincronización compartido.
- `migrations/`: utilidades de importación SQLite -> backend.
- `mobile-rn/`: scaffold inicial de React Native (offline-first).

## Objetivo

Validar arquitectura `Electron + React Native + PostgreSQL + sync offline-first` sin afectar la app de producción actual en `main`.
