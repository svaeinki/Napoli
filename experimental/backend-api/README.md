# Backend API Experimental

Fastify + PostgreSQL para validar el paso de SQLite local a arquitectura multiusuario con sincronización offline-first.

## Endpoints implementados

- `POST /auth/login`
- `POST /auth/refresh`
- `GET /sync/pull?since=<cursor>&limit=<n>`
- `POST /sync/push`
- `POST /articulos`
- `PATCH /articulos/:id`
- `POST /articulos/:id/abonos`

## Modo de ejecución

- `STORE_MODE=memory`: sin dependencias externas, ideal para desarrollo y tests.
- `STORE_MODE=postgres`: persistencia PostgreSQL real.

## Uso local

```bash
cd experimental/backend-api
cp .env.example .env
npm install
npm test
npm run start
```

## PostgreSQL

1. Crear base: `napoli_experiment`
2. Configurar `DATABASE_URL`
3. Ejecutar seed:

```bash
STORE_MODE=postgres npm run seed
```

`seed` crea esquema y usuario demo según variables `DEMO_*`.
