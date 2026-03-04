const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

function numberMoney(value) {
    const parsed = Number.parseFloat(String(value ?? 0));
    if (!Number.isFinite(parsed)) return 0;
    return Math.round(parsed * 100) / 100;
}

function resolveEstadoPago(valorTotal, totalAbonado) {
    if (valorTotal <= 0 || totalAbonado <= 0) return 'Sin pago';
    if (totalAbonado >= valorTotal) return 'Pagado';
    return 'Abonado';
}

class PostgresStore {
    constructor(config) {
        this.config = config;
        this.pool = new Pool({ connectionString: config.databaseUrl });
    }

    nowIso() {
        return new Date().toISOString();
    }

    async init() {
        const sqlPath = path.join(__dirname, '../../sql/001_init.sql');
        const schemaSql = fs.readFileSync(sqlPath, 'utf8');
        await this.pool.query(schemaSql);

        await this.pool.query(
            `INSERT INTO sucursales (id, nombre)
             VALUES ($1, $2)
             ON CONFLICT (id) DO NOTHING`,
            [this.config.demoSucursalId, 'Sucursal Demo']
        );

        const passwordHash = bcrypt.hashSync(this.config.demoPassword, 10);
        await this.pool.query(
            `INSERT INTO users (id, sucursal_id, username, password_hash, is_active)
             VALUES ($1, $2, $3, $4, TRUE)
             ON CONFLICT (username)
             DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
            [randomUUID(), this.config.demoSucursalId, this.config.demoUsername, passwordHash]
        );
    }

    async close() {
        await this.pool.end();
    }

    rowToArticulo(row) {
        return {
            ...row,
            valor_total: numberMoney(row.valor_total),
            total_abonado: numberMoney(row.total_abonado),
            saldo_pendiente: numberMoney(row.saldo_pendiente)
        };
    }

    async pushChange(clientOrPool, sucursalId, entity, entityId, recordJson) {
        await clientOrPool.query(
            `INSERT INTO sync_changes (sucursal_id, entity, entity_id, record_json)
             VALUES ($1, $2, $3, $4::jsonb)`,
            [sucursalId, entity, entityId, JSON.stringify(recordJson)]
        );
    }

    async authenticateUser(username, password) {
        const result = await this.pool.query(
            `SELECT id, sucursal_id, username, password_hash, is_active
             FROM users
             WHERE username = $1
             LIMIT 1`,
            [username]
        );

        const user = result.rows[0];
        if (!user || !user.is_active) return null;
        const ok = bcrypt.compareSync(password, user.password_hash);
        if (!ok) return null;
        return {
            id: user.id,
            sucursal_id: user.sucursal_id,
            username: user.username,
            is_active: user.is_active
        };
    }

    async createSession(userId, refreshToken, expiresAtIso) {
        const sessionId = randomUUID();
        await this.pool.query(
            `INSERT INTO auth_sessions (id, user_id, refresh_token, expires_at)
             VALUES ($1, $2, $3, $4)`,
            [sessionId, userId, refreshToken, expiresAtIso]
        );
        return { id: sessionId };
    }

    async getSessionByRefreshToken(token) {
        const result = await this.pool.query(
            `SELECT id, user_id, refresh_token, expires_at, revoked_at
             FROM auth_sessions
             WHERE refresh_token = $1
             LIMIT 1`,
            [token]
        );

        const session = result.rows[0];
        if (!session || session.revoked_at) return null;
        if (new Date(session.expires_at).getTime() <= Date.now()) return null;
        return session;
    }

    async rotateSession(oldToken, newToken, expiresAtIso) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const current = await client.query(
                `SELECT id, user_id, revoked_at
                 FROM auth_sessions
                 WHERE refresh_token = $1
                 FOR UPDATE`,
                [oldToken]
            );

            const session = current.rows[0];
            if (!session || session.revoked_at) {
                await client.query('ROLLBACK');
                return null;
            }

            await client.query(
                `UPDATE auth_sessions
                 SET revoked_at = NOW()
                 WHERE id = $1`,
                [session.id]
            );

            const newId = randomUUID();
            await client.query(
                `INSERT INTO auth_sessions (id, user_id, refresh_token, expires_at)
                 VALUES ($1, $2, $3, $4)`,
                [newId, session.user_id, newToken, expiresAtIso]
            );

            await client.query('COMMIT');
            return {
                id: newId,
                user_id: session.user_id,
                refresh_token: newToken,
                expires_at: expiresAtIso,
                revoked_at: null
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    validateArticuloFields(data) {
        if (!String(data.rut || '').trim()) throw new Error('rut es obligatorio');
        if (!String(data.nombre_cliente || '').trim()) throw new Error('nombre_cliente es obligatorio');
        if (!String(data.tipo_articulo || '').trim()) throw new Error('tipo_articulo es obligatorio');
        if (!String(data.descripcion || '').trim()) throw new Error('descripcion es obligatorio');
    }

    async createArticulo(sucursalId, data = {}) {
        this.validateArticuloFields(data);

        const now = this.nowIso();
        const articuloId = String(data.id || randomUUID());
        const valorTotal = numberMoney(data.valor_total ?? 0);
        const totalAbonado = numberMoney(data.total_abonado ?? 0);
        const saldoPendiente = numberMoney(Math.max(valorTotal - totalAbonado, 0));

        const result = await this.pool.query(
            `INSERT INTO articulos (
                id, sucursal_id, rut, nombre_cliente, telefono, tipo_articulo, descripcion,
                numero_bodega, observaciones, estado, fecha_ingreso, fecha_entrega,
                valor_total, total_abonado, saldo_pendiente, estado_pago,
                created_at, updated_at, deleted_at, version
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12,
                $13, $14, $15, $16,
                $17, $17, $18, $19
            )
            RETURNING *`,
            [
                articuloId,
                sucursalId,
                String(data.rut).trim(),
                String(data.nombre_cliente).trim(),
                String(data.telefono || '').trim() || null,
                String(data.tipo_articulo).trim(),
                String(data.descripcion).trim(),
                String(data.numero_bodega || '').trim() || null,
                String(data.observaciones || '').trim() || null,
                String(data.estado || 'En Bodega').trim(),
                String(data.fecha_ingreso || now.slice(0, 10)).trim(),
                data.fecha_entrega || null,
                valorTotal,
                totalAbonado,
                saldoPendiente,
                String(data.estado_pago || resolveEstadoPago(valorTotal, totalAbonado)),
                now,
                data.deleted_at || null,
                Number.parseInt(String(data.version || 1), 10)
            ]
        );

        const articulo = this.rowToArticulo(result.rows[0]);
        await this.pushChange(this.pool, sucursalId, 'articulo', articulo.id, articulo);
        return articulo;
    }

    async updateArticulo(sucursalId, articuloId, patch = {}) {
        const existingResult = await this.pool.query(
            `SELECT * FROM articulos WHERE id = $1 AND sucursal_id = $2 LIMIT 1`,
            [articuloId, sucursalId]
        );
        const existing = existingResult.rows[0];
        if (!existing) return null;

        const merged = {
            ...existing,
            ...patch,
            id: articuloId,
            sucursal_id: sucursalId
        };

        this.validateArticuloFields(merged);

        const now = this.nowIso();
        const valorTotal = numberMoney(merged.valor_total);
        const totalAbonado = numberMoney(merged.total_abonado);
        const saldoPendiente = numberMoney(Math.max(valorTotal - totalAbonado, 0));
        const nextVersion = Number.parseInt(String(existing.version || 0), 10) + 1;

        const updatedResult = await this.pool.query(
            `UPDATE articulos
             SET rut = $3,
                 nombre_cliente = $4,
                 telefono = $5,
                 tipo_articulo = $6,
                 descripcion = $7,
                 numero_bodega = $8,
                 observaciones = $9,
                 estado = $10,
                 fecha_ingreso = $11,
                 fecha_entrega = $12,
                 valor_total = $13,
                 total_abonado = $14,
                 saldo_pendiente = $15,
                 estado_pago = $16,
                 updated_at = $17,
                 deleted_at = $18,
                 version = $19
             WHERE id = $1
               AND sucursal_id = $2
             RETURNING *`,
            [
                articuloId,
                sucursalId,
                String(merged.rut).trim(),
                String(merged.nombre_cliente).trim(),
                String(merged.telefono || '').trim() || null,
                String(merged.tipo_articulo).trim(),
                String(merged.descripcion).trim(),
                String(merged.numero_bodega || '').trim() || null,
                String(merged.observaciones || '').trim() || null,
                String(merged.estado || 'En Bodega').trim(),
                String(merged.fecha_ingreso || now.slice(0, 10)).trim(),
                merged.fecha_entrega || null,
                valorTotal,
                totalAbonado,
                saldoPendiente,
                String(merged.estado_pago || resolveEstadoPago(valorTotal, totalAbonado)),
                now,
                merged.deleted_at || null,
                nextVersion
            ]
        );

        const articulo = this.rowToArticulo(updatedResult.rows[0]);
        await this.pushChange(this.pool, sucursalId, 'articulo', articulo.id, articulo);
        return articulo;
    }

    async deleteArticulo(sucursalId, articuloId) {
        return this.updateArticulo(sucursalId, articuloId, {
            deleted_at: this.nowIso()
        });
    }

    async addAbono(sucursalId, articuloId, abonoInput = {}) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const articuloResult = await client.query(
                `SELECT * FROM articulos
                 WHERE id = $1 AND sucursal_id = $2
                 FOR UPDATE`,
                [articuloId, sucursalId]
            );
            const articulo = articuloResult.rows[0];
            if (!articulo || articulo.deleted_at) {
                throw new Error('Articulo no encontrado para registrar abono');
            }

            const monto = numberMoney(abonoInput.monto);
            if (monto <= 0) {
                throw new Error('El monto del abono debe ser mayor a cero');
            }

            const now = this.nowIso();
            const abonoId = String(abonoInput.id || randomUUID());

            const abonoResult = await client.query(
                `INSERT INTO abonos (
                    id, sucursal_id, articulo_id, monto, metodo_pago, observaciones,
                    fecha, created_at, updated_at, deleted_at, version
                ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8, $8, NULL, 1
                )
                RETURNING *`,
                [
                    abonoId,
                    sucursalId,
                    articuloId,
                    monto,
                    String(abonoInput.metodo_pago || 'Efectivo').trim(),
                    String(abonoInput.observaciones || '').trim() || null,
                    abonoInput.fecha || now,
                    now
                ]
            );

            const totalAbonado = numberMoney(numberMoney(articulo.total_abonado) + monto);
            const valorTotal = numberMoney(articulo.valor_total);
            const saldoPendiente = numberMoney(Math.max(valorTotal - totalAbonado, 0));
            const estadoPago = resolveEstadoPago(valorTotal, totalAbonado);

            const articuloUpdatedResult = await client.query(
                `UPDATE articulos
                 SET total_abonado = $3,
                     saldo_pendiente = $4,
                     estado_pago = $5,
                     updated_at = $6,
                     version = version + 1
                 WHERE id = $1
                   AND sucursal_id = $2
                 RETURNING *`,
                [articuloId, sucursalId, totalAbonado, saldoPendiente, estadoPago, now]
            );

            const abono = abonoResult.rows[0];
            const articuloUpdated = this.rowToArticulo(articuloUpdatedResult.rows[0]);

            await this.pushChange(client, sucursalId, 'abono', abono.id, abono);
            await this.pushChange(client, sucursalId, 'articulo', articuloUpdated.id, articuloUpdated);

            await client.query('COMMIT');
            return {
                abono,
                articulo: articuloUpdated
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async pullChanges(sucursalId, sinceRaw, limit = 500) {
        const since = Number.parseInt(String(sinceRaw || 0), 10);
        const boundedLimit = Math.max(1, Math.min(limit, 1000));

        const result = await this.pool.query(
            `SELECT seq, entity, entity_id::text AS entity_id, record_json
             FROM sync_changes
             WHERE sucursal_id = $1
               AND seq > $2
             ORDER BY seq ASC
             LIMIT $3`,
            [sucursalId, Number.isFinite(since) ? since : 0, boundedLimit]
        );

        const articulosById = new Map();
        const abonosById = new Map();
        let lastSeq = Number.isFinite(since) ? since : 0;

        for (const row of result.rows) {
            lastSeq = row.seq;
            if (row.entity === 'articulo') {
                articulosById.set(row.entity_id, row.record_json);
            } else if (row.entity === 'abono') {
                abonosById.set(row.entity_id, row.record_json);
            }
        }

        return {
            server_time: this.nowIso(),
            next_cursor: String(lastSeq),
            data: {
                articulos: [...articulosById.values()],
                abonos: [...abonosById.values()]
            }
        };
    }

    async recordSyncOpResult(sucursalId, deviceId, opId, accepted, payload) {
        try {
            await this.pool.query(
                `INSERT INTO sync_operations (id, sucursal_id, device_id, op_id, response_json)
                 VALUES ($1, $2, $3, $4, $5::jsonb)`,
                [randomUUID(), sucursalId, deviceId, opId, JSON.stringify({ accepted, payload })]
            );
        } catch (error) {
            if (error && error.code === '23505') {
                return;
            }
            throw error;
        }
    }

    async readSyncOpResult(sucursalId, deviceId, opId) {
        const existing = await this.pool.query(
            `SELECT response_json
             FROM sync_operations
             WHERE sucursal_id = $1
               AND device_id = $2
               AND op_id = $3
             LIMIT 1`,
            [sucursalId, deviceId, opId]
        );

        if (!existing.rows[0]) return null;
        return existing.rows[0].response_json;
    }

    async applySyncOperations(sucursalId, deviceId, ops) {
        const accepted = [];
        const rejected = [];

        for (const op of ops) {
            const prior = await this.readSyncOpResult(sucursalId, deviceId, op.op_id);
            if (prior) {
                if (prior.accepted) {
                    accepted.push(prior.payload);
                } else {
                    rejected.push(prior.payload);
                }
                continue;
            }

            try {
                let result;
                if (op.entity === 'articulo' && op.op === 'upsert') {
                    const id = String(op.payload.id || '').trim() || null;
                    const articulo = id
                        ? (await this.updateArticulo(sucursalId, id, op.payload)) || (await this.createArticulo(sucursalId, op.payload))
                        : await this.createArticulo(sucursalId, op.payload);

                    result = {
                        op_id: op.op_id,
                        entity: 'articulo',
                        entity_id: articulo.id,
                        version: articulo.version,
                        updated_at: articulo.updated_at
                    };
                } else if (op.entity === 'articulo' && op.op === 'delete') {
                    const id = String(op.payload.id || '').trim();
                    if (!id) throw new Error('payload.id es requerido para delete de articulo');
                    const deleted = await this.deleteArticulo(sucursalId, id);
                    if (!deleted) throw new Error('Articulo no encontrado para delete');
                    result = {
                        op_id: op.op_id,
                        entity: 'articulo',
                        entity_id: deleted.id,
                        version: deleted.version,
                        updated_at: deleted.updated_at
                    };
                } else if (op.entity === 'abono' && (op.op === 'append' || op.op === 'upsert')) {
                    const articuloId = String(op.payload.articulo_id || '').trim();
                    if (!articuloId) throw new Error('payload.articulo_id es requerido para abono');
                    const output = await this.addAbono(sucursalId, articuloId, op.payload);
                    result = {
                        op_id: op.op_id,
                        entity: 'abono',
                        entity_id: output.abono.id,
                        version: output.abono.version,
                        updated_at: output.abono.updated_at
                    };
                } else {
                    throw new Error(`Operacion no soportada: ${op.entity}:${op.op}`);
                }

                accepted.push(result);
                await this.recordSyncOpResult(sucursalId, deviceId, op.op_id, true, result);
            } catch (error) {
                const rejectedEntry = {
                    op_id: op.op_id,
                    error: error.message || 'Error aplicando operación de sync'
                };
                rejected.push(rejectedEntry);
                await this.recordSyncOpResult(sucursalId, deviceId, op.op_id, false, rejectedEntry);
            }
        }

        const cursorResult = await this.pool.query(
            `SELECT COALESCE(MAX(seq), 0) AS seq
             FROM sync_changes
             WHERE sucursal_id = $1`,
            [sucursalId]
        );

        return {
            success: true,
            accepted,
            rejected,
            server_time: this.nowIso(),
            next_cursor: String(cursorResult.rows[0].seq)
        };
    }
}

module.exports = { PostgresStore };
