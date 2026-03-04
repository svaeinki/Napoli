const { z } = require('zod');
const {
    syncPushRequestSchema,
    syncPushResponseSchema,
    syncPullResponseSchema
} = require('../../shared/sync-contract');
const {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
} = require('./security');

function ttlToMs(ttlRaw, fallbackMs) {
    const ttl = String(ttlRaw || '').trim();
    const match = ttl.match(/^(\d+)([smhd])$/i);
    if (!match) return fallbackMs;
    const amount = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multiplier = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    }[unit];

    return amount * multiplier;
}

function requireAuth(config) {
    return async function authPreHandler(request, reply) {
        const header = String(request.headers.authorization || '');
        if (!header.startsWith('Bearer ')) {
            reply.code(401);
            return { success: false, error: 'Token Bearer requerido' };
        }

        const token = header.slice('Bearer '.length).trim();
        try {
            const payload = verifyAccessToken(config, token);
            request.auth = {
                user_id: payload.sub,
                sucursal_id: payload.sucursal_id,
                username: payload.username
            };
        } catch (error) {
            reply.code(401);
            return { success: false, error: 'Token de acceso inválido o expirado' };
        }

        return undefined;
    };
}

function buildApp({ fastify, config, store }) {
    const app = fastify({ logger: true });

    const loginSchema = z.object({
        username: z.string().min(1),
        password: z.string().min(1)
    });

    const refreshSchema = z.object({
        refresh_token: z.string().min(10)
    });

    const articuloCreateSchema = z.object({
        id: z.string().uuid().optional(),
        rut: z.string().min(1),
        nombre_cliente: z.string().min(1),
        telefono: z.string().optional(),
        tipo_articulo: z.string().min(1),
        descripcion: z.string().min(1),
        numero_bodega: z.string().optional(),
        observaciones: z.string().optional(),
        estado: z.enum(['En Bodega', 'Entregado']).optional(),
        fecha_ingreso: z.string().optional(),
        fecha_entrega: z.string().optional().nullable(),
        valor_total: z.coerce.number().optional(),
        total_abonado: z.coerce.number().optional(),
        estado_pago: z.enum(['Sin pago', 'Abonado', 'Pagado']).optional(),
        deleted_at: z.string().datetime().optional().nullable(),
        version: z.coerce.number().int().positive().optional()
    });

    const articuloPatchSchema = articuloCreateSchema.partial().refine(
        (payload) => Object.keys(payload).length > 0,
        'Se requiere al menos un campo para actualizar'
    );

    const abonoCreateSchema = z.object({
        id: z.string().uuid().optional(),
        monto: z.coerce.number().positive(),
        metodo_pago: z.string().optional(),
        observaciones: z.string().optional(),
        fecha: z.string().datetime().optional()
    });

    const authMiddleware = requireAuth(config);

    app.get('/health', async () => ({ success: true, service: 'napoli-backend-api-experiment' }));

    app.post('/auth/login', async (request, reply) => {
        const parsed = loginSchema.safeParse(request.body);
        if (!parsed.success) {
            reply.code(400);
            return { success: false, error: parsed.error.flatten() };
        }

        const { username, password } = parsed.data;
        const user = await store.authenticateUser(username, password);
        if (!user) {
            reply.code(401);
            return { success: false, error: 'Credenciales inválidas' };
        }

        const accessPayload = {
            sub: user.id,
            username: user.username,
            sucursal_id: user.sucursal_id
        };

        const accessToken = signAccessToken(config, accessPayload);
        const refreshToken = signRefreshToken(config, {
            sub: user.id,
            username: user.username,
            sucursal_id: user.sucursal_id,
            type: 'refresh'
        });

        const refreshMs = ttlToMs(config.refreshTokenTtl, 30 * 24 * 60 * 60 * 1000);
        const refreshExpiry = new Date(Date.now() + refreshMs).toISOString();
        await store.createSession(user.id, refreshToken, refreshExpiry);

        return {
            success: true,
            data: {
                access_token: accessToken,
                refresh_token: refreshToken,
                token_type: 'Bearer',
                expires_in: config.accessTokenTtl,
                user: {
                    id: user.id,
                    username: user.username,
                    sucursal_id: user.sucursal_id
                }
            }
        };
    });

    app.post('/auth/refresh', async (request, reply) => {
        const parsed = refreshSchema.safeParse(request.body);
        if (!parsed.success) {
            reply.code(400);
            return { success: false, error: parsed.error.flatten() };
        }

        const { refresh_token: oldToken } = parsed.data;
        let decoded;
        try {
            decoded = verifyRefreshToken(config, oldToken);
        } catch (error) {
            reply.code(401);
            return { success: false, error: 'Refresh token inválido o expirado' };
        }

        const session = await store.getSessionByRefreshToken(oldToken);
        if (!session) {
            reply.code(401);
            return { success: false, error: 'Refresh token no activo' };
        }

        const newPayload = {
            sub: decoded.sub,
            username: decoded.username,
            sucursal_id: decoded.sucursal_id
        };

        const accessToken = signAccessToken(config, newPayload);
        const refreshToken = signRefreshToken(config, {
            ...newPayload,
            type: 'refresh'
        });

        const refreshMs = ttlToMs(config.refreshTokenTtl, 30 * 24 * 60 * 60 * 1000);
        const refreshExpiry = new Date(Date.now() + refreshMs).toISOString();
        const rotated = await store.rotateSession(oldToken, refreshToken, refreshExpiry);
        if (!rotated) {
            reply.code(401);
            return { success: false, error: 'No se pudo rotar el refresh token' };
        }

        return {
            success: true,
            data: {
                access_token: accessToken,
                refresh_token: refreshToken,
                token_type: 'Bearer',
                expires_in: config.accessTokenTtl
            }
        };
    });

    app.get('/sync/pull', { preHandler: authMiddleware }, async (request, reply) => {
        const since = String(request.query?.since || '0');
        const limit = Number.parseInt(String(request.query?.limit || '500'), 10);

        const pulled = await store.pullChanges(request.auth.sucursal_id, since, limit);
        const payload = {
            success: true,
            server_time: pulled.server_time,
            next_cursor: pulled.next_cursor,
            data: pulled.data
        };

        const validated = syncPullResponseSchema.safeParse(payload);
        if (!validated.success) {
            request.log.error(validated.error, 'Invalid sync pull payload');
            reply.code(500);
            return { success: false, error: 'Contrato sync/pull inválido en servidor' };
        }

        return payload;
    });

    app.post('/sync/push', { preHandler: authMiddleware }, async (request, reply) => {
        const parsed = syncPushRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            reply.code(400);
            return { success: false, error: parsed.error.flatten() };
        }

        const output = await store.applySyncOperations(
            request.auth.sucursal_id,
            parsed.data.device_id,
            parsed.data.ops
        );

        const validated = syncPushResponseSchema.safeParse(output);
        if (!validated.success) {
            request.log.error(validated.error, 'Invalid sync push payload');
            reply.code(500);
            return { success: false, error: 'Contrato sync/push inválido en servidor' };
        }

        return output;
    });

    app.post('/articulos', { preHandler: authMiddleware }, async (request, reply) => {
        const parsed = articuloCreateSchema.safeParse(request.body);
        if (!parsed.success) {
            reply.code(400);
            return { success: false, error: parsed.error.flatten() };
        }

        try {
            const articulo = await store.createArticulo(request.auth.sucursal_id, parsed.data);
            return { success: true, data: articulo };
        } catch (error) {
            reply.code(400);
            return { success: false, error: error.message };
        }
    });

    app.patch('/articulos/:id', { preHandler: authMiddleware }, async (request, reply) => {
        const parsed = articuloPatchSchema.safeParse(request.body);
        if (!parsed.success) {
            reply.code(400);
            return { success: false, error: parsed.error.flatten() };
        }

        const articulo = await store.updateArticulo(request.auth.sucursal_id, request.params.id, parsed.data);
        if (!articulo) {
            reply.code(404);
            return { success: false, error: 'Artículo no encontrado' };
        }

        return { success: true, data: articulo };
    });

    app.post('/articulos/:id/abonos', { preHandler: authMiddleware }, async (request, reply) => {
        const parsed = abonoCreateSchema.safeParse(request.body);
        if (!parsed.success) {
            reply.code(400);
            return { success: false, error: parsed.error.flatten() };
        }

        try {
            const output = await store.addAbono(request.auth.sucursal_id, request.params.id, parsed.data);
            return {
                success: true,
                data: output
            };
        } catch (error) {
            reply.code(400);
            return { success: false, error: error.message };
        }
    });

    return app;
}

module.exports = { buildApp };
