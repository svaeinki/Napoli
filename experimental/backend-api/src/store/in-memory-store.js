const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');

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

class InMemoryStore {
    constructor(config) {
        this.config = config;
        this.users = [];
        this.sessions = new Map();
        this.articulos = new Map();
        this.abonos = new Map();
        this.syncOps = new Map();
        this.syncChanges = [];
        this.seq = 0;
    }

    nowIso() {
        return new Date().toISOString();
    }

    nextSeq() {
        this.seq += 1;
        return this.seq;
    }

    async init() {
        const passwordHash = bcrypt.hashSync(this.config.demoPassword, 10);
        this.users = [{
            id: randomUUID(),
            sucursal_id: this.config.demoSucursalId,
            username: this.config.demoUsername,
            password_hash: passwordHash,
            is_active: true
        }];
    }

    pushChange(sucursalId, entity, entityId, record) {
        this.syncChanges.push({
            seq: this.nextSeq(),
            sucursal_id: sucursalId,
            entity,
            entity_id: entityId,
            record_json: { ...record },
            changed_at: this.nowIso()
        });
    }

    async authenticateUser(username, password) {
        const user = this.users.find((item) => item.username === username && item.is_active);
        if (!user) return null;
        const ok = bcrypt.compareSync(password, user.password_hash);
        if (!ok) return null;
        return { ...user };
    }

    async createSession(userId, refreshToken, expiresAtIso) {
        const sessionId = randomUUID();
        this.sessions.set(refreshToken, {
            id: sessionId,
            user_id: userId,
            refresh_token: refreshToken,
            expires_at: expiresAtIso,
            revoked_at: null
        });
        return { id: sessionId };
    }

    async rotateSession(oldToken, newToken, expiresAtIso) {
        const session = this.sessions.get(oldToken);
        if (!session || session.revoked_at) return null;
        session.revoked_at = this.nowIso();
        this.sessions.set(oldToken, session);
        const newSession = {
            id: randomUUID(),
            user_id: session.user_id,
            refresh_token: newToken,
            expires_at: expiresAtIso,
            revoked_at: null
        };
        this.sessions.set(newToken, newSession);
        return { ...newSession };
    }

    async getSessionByRefreshToken(token) {
        const session = this.sessions.get(token);
        if (!session || session.revoked_at) return null;
        if (new Date(session.expires_at).getTime() <= Date.now()) return null;
        return { ...session };
    }

    normalizeArticulo(sucursalId, data, existing = null) {
        const now = this.nowIso();
        const valorTotal = numberMoney(data.valor_total ?? existing?.valor_total ?? 0);
        const totalAbonado = numberMoney(data.total_abonado ?? existing?.total_abonado ?? 0);
        const saldoPendiente = numberMoney(Math.max(valorTotal - totalAbonado, 0));

        const record = {
            id: data.id || existing?.id || randomUUID(),
            sucursal_id: sucursalId,
            rut: String(data.rut ?? existing?.rut ?? '').trim(),
            nombre_cliente: String(data.nombre_cliente ?? existing?.nombre_cliente ?? '').trim(),
            telefono: String(data.telefono ?? existing?.telefono ?? '').trim() || null,
            tipo_articulo: String(data.tipo_articulo ?? existing?.tipo_articulo ?? '').trim(),
            descripcion: String(data.descripcion ?? existing?.descripcion ?? '').trim(),
            numero_bodega: String(data.numero_bodega ?? existing?.numero_bodega ?? '').trim() || null,
            observaciones: String(data.observaciones ?? existing?.observaciones ?? '').trim() || null,
            estado: String(data.estado ?? existing?.estado ?? 'En Bodega'),
            fecha_ingreso: String(data.fecha_ingreso ?? existing?.fecha_ingreso ?? now.slice(0, 10)),
            fecha_entrega: data.fecha_entrega ?? existing?.fecha_entrega ?? null,
            valor_total: valorTotal,
            total_abonado: totalAbonado,
            saldo_pendiente: saldoPendiente,
            estado_pago: String(data.estado_pago ?? existing?.estado_pago ?? resolveEstadoPago(valorTotal, totalAbonado)),
            created_at: existing?.created_at ?? now,
            updated_at: now,
            deleted_at: data.deleted_at ?? existing?.deleted_at ?? null,
            version: Number.parseInt(String(data.version ?? ((existing?.version || 0) + 1)), 10)
        };

        if (!record.rut || !record.nombre_cliente || !record.tipo_articulo || !record.descripcion) {
            throw new Error('Articulo incompleto: rut, nombre_cliente, tipo_articulo y descripcion son obligatorios');
        }

        return record;
    }

    async createArticulo(sucursalId, data) {
        const record = this.normalizeArticulo(sucursalId, data);
        this.articulos.set(record.id, record);
        this.pushChange(sucursalId, 'articulo', record.id, record);
        return { ...record };
    }

    async updateArticulo(sucursalId, articuloId, patch) {
        const existing = this.articulos.get(articuloId);
        if (!existing || existing.sucursal_id !== sucursalId) {
            return null;
        }
        const record = this.normalizeArticulo(sucursalId, { ...existing, ...patch, id: articuloId }, existing);
        this.articulos.set(record.id, record);
        this.pushChange(sucursalId, 'articulo', record.id, record);
        return { ...record };
    }

    async deleteArticulo(sucursalId, articuloId) {
        const existing = this.articulos.get(articuloId);
        if (!existing || existing.sucursal_id !== sucursalId) return null;
        const now = this.nowIso();
        const deleted = {
            ...existing,
            deleted_at: now,
            updated_at: now,
            version: existing.version + 1
        };
        this.articulos.set(articuloId, deleted);
        this.pushChange(sucursalId, 'articulo', articuloId, deleted);
        return { ...deleted };
    }

    async addAbono(sucursalId, articuloId, abonoInput = {}) {
        const articulo = this.articulos.get(articuloId);
        if (!articulo || articulo.sucursal_id !== sucursalId || articulo.deleted_at) {
            throw new Error('Articulo no encontrado para registrar abono');
        }

        const now = this.nowIso();
        const monto = numberMoney(abonoInput.monto);
        if (monto <= 0) {
            throw new Error('El monto del abono debe ser mayor a cero');
        }

        const abono = {
            id: abonoInput.id || randomUUID(),
            sucursal_id: sucursalId,
            articulo_id: articuloId,
            monto,
            metodo_pago: String(abonoInput.metodo_pago || 'Efectivo'),
            observaciones: String(abonoInput.observaciones || '').trim() || null,
            fecha: abonoInput.fecha || now,
            created_at: now,
            updated_at: now,
            deleted_at: null,
            version: 1
        };

        this.abonos.set(abono.id, abono);

        const totalAbonado = numberMoney(articulo.total_abonado + monto);
        const valorTotal = numberMoney(articulo.valor_total);
        const saldoPendiente = numberMoney(Math.max(valorTotal - totalAbonado, 0));

        const updatedArticulo = {
            ...articulo,
            total_abonado: totalAbonado,
            saldo_pendiente: saldoPendiente,
            estado_pago: resolveEstadoPago(valorTotal, totalAbonado),
            updated_at: now,
            version: articulo.version + 1
        };

        this.articulos.set(articuloId, updatedArticulo);
        this.pushChange(sucursalId, 'abono', abono.id, abono);
        this.pushChange(sucursalId, 'articulo', articuloId, updatedArticulo);

        return { abono: { ...abono }, articulo: { ...updatedArticulo } };
    }

    async pullChanges(sucursalId, sinceRaw, limit = 500) {
        const since = Number.parseInt(String(sinceRaw || 0), 10);
        const boundedLimit = Math.max(1, Math.min(limit, 1000));

        const filtered = this.syncChanges
            .filter((row) => row.sucursal_id === sucursalId && row.seq > (Number.isFinite(since) ? since : 0))
            .slice(0, boundedLimit);

        const articulosById = new Map();
        const abonosById = new Map();
        for (const row of filtered) {
            if (row.entity === 'articulo') articulosById.set(row.entity_id, row.record_json);
            if (row.entity === 'abono') abonosById.set(row.entity_id, row.record_json);
        }

        const nextCursor = filtered.length > 0
            ? String(filtered[filtered.length - 1].seq)
            : String(Number.isFinite(since) ? since : 0);

        return {
            server_time: this.nowIso(),
            next_cursor: nextCursor,
            data: {
                articulos: [...articulosById.values()],
                abonos: [...abonosById.values()]
            }
        };
    }

    async applySyncOperations(sucursalId, deviceId, ops) {
        const accepted = [];
        const rejected = [];

        for (const op of ops) {
            const key = `${sucursalId}:${deviceId}:${op.op_id}`;
            if (this.syncOps.has(key)) {
                const prior = this.syncOps.get(key);
                if (prior.accepted) {
                    accepted.push(prior.payload);
                } else {
                    rejected.push(prior.payload);
                }
                continue;
            }

            try {
                let result = null;
                if (op.entity === 'articulo' && op.op === 'upsert') {
                    const id = typeof op.payload.id === 'string' ? op.payload.id : null;
                    const existing = id ? this.articulos.get(id) : null;
                    const articulo = existing
                        ? await this.updateArticulo(sucursalId, id, op.payload)
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
                    const articulo = await this.deleteArticulo(sucursalId, id);
                    if (!articulo) throw new Error('Articulo no encontrado para delete');
                    result = {
                        op_id: op.op_id,
                        entity: 'articulo',
                        entity_id: articulo.id,
                        version: articulo.version,
                        updated_at: articulo.updated_at
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

                const acceptedEntry = result;
                accepted.push(acceptedEntry);
                this.syncOps.set(key, { accepted: true, payload: acceptedEntry });
            } catch (error) {
                const rejectedEntry = {
                    op_id: op.op_id,
                    error: error.message || 'Error aplicando operación de sync'
                };
                rejected.push(rejectedEntry);
                this.syncOps.set(key, { accepted: false, payload: rejectedEntry });
            }
        }

        return {
            success: true,
            accepted,
            rejected,
            server_time: this.nowIso(),
            next_cursor: String(this.seq)
        };
    }
}

module.exports = { InMemoryStore };
