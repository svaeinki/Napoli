CREATE TABLE IF NOT EXISTS sucursales (
    id UUID PRIMARY KEY,
    nombre TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    sucursal_id UUID NOT NULL REFERENCES sucursales(id),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    refresh_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS articulos (
    id UUID PRIMARY KEY,
    sucursal_id UUID NOT NULL REFERENCES sucursales(id),
    rut TEXT NOT NULL,
    nombre_cliente TEXT NOT NULL,
    telefono TEXT,
    tipo_articulo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    numero_bodega TEXT,
    observaciones TEXT,
    estado TEXT NOT NULL DEFAULT 'En Bodega',
    fecha_ingreso TEXT NOT NULL,
    fecha_entrega TEXT,
    valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_abonado NUMERIC(14,2) NOT NULL DEFAULT 0,
    saldo_pendiente NUMERIC(14,2) NOT NULL DEFAULT 0,
    estado_pago TEXT NOT NULL DEFAULT 'Sin pago',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_articulos_sucursal_updated ON articulos(sucursal_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS abonos (
    id UUID PRIMARY KEY,
    sucursal_id UUID NOT NULL REFERENCES sucursales(id),
    articulo_id UUID NOT NULL REFERENCES articulos(id),
    monto NUMERIC(14,2) NOT NULL,
    metodo_pago TEXT NOT NULL DEFAULT 'Efectivo',
    observaciones TEXT,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_abonos_sucursal_updated ON abonos(sucursal_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS sync_operations (
    id UUID PRIMARY KEY,
    sucursal_id UUID NOT NULL,
    device_id TEXT NOT NULL,
    op_id TEXT NOT NULL,
    response_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sucursal_id, device_id, op_id)
);

CREATE TABLE IF NOT EXISTS sync_changes (
    seq BIGSERIAL PRIMARY KEY,
    sucursal_id UUID NOT NULL,
    entity TEXT NOT NULL,
    entity_id UUID NOT NULL,
    record_json JSONB NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_changes_sucursal_seq ON sync_changes(sucursal_id, seq);
