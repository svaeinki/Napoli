# Estado de implementación experimental

## Completado en esta iteración

- Rama de trabajo para fase backend (`exp/backend-api`) con base de migración.
- Backend API experimental con:
  - auth (`/auth/login`, `/auth/refresh`)
  - sync (`/sync/pull`, `/sync/push`)
  - dominio (`POST /articulos`, `PATCH /articulos/:id`, `POST /articulos/:id/abonos`)
- Contrato compartido de sync en `experimental/shared/sync-contract.js`.
- Adaptación inicial en Electron:
  - Cliente sync remoto (`src/sync-client.js`)
  - Repositorio de sync (`src/sync-repository.js`)
  - Nuevos IPC `sync:*`
  - Cola automática de cambios para acciones clave del desktop.
- Script importador SQLite -> backend.
- Scaffold inicial React Native.

## Pendiente para próximas fases

- Persistencia durable de cola offline en desktop (actualmente en memoria).
- Resolver conflictos de sync avanzados por campo y auditoría completa.
- Completar app móvil (detalle, abonos, motor de sync en background, UX offline).
- Pruebas de integración con PostgreSQL real en CI.
