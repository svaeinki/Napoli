const { z } = require('zod');

const entitySchema = z.enum(['articulo', 'abono']);
const operationTypeSchema = z.enum(['upsert', 'delete', 'append']);

const syncOperationSchema = z.object({
    op_id: z.string().min(8).max(128),
    entity: entitySchema,
    op: operationTypeSchema,
    payload: z.record(z.any()),
    client_updated_at: z.string().datetime().optional()
});

const syncPushRequestSchema = z.object({
    device_id: z.string().min(3).max(128),
    ops: z.array(syncOperationSchema).min(1).max(500)
});

const syncPushResponseSchema = z.object({
    success: z.boolean(),
    accepted: z.array(z.object({
        op_id: z.string(),
        entity: entitySchema,
        entity_id: z.string(),
        version: z.number().int().nonnegative(),
        updated_at: z.string().datetime()
    })),
    rejected: z.array(z.object({
        op_id: z.string(),
        error: z.string()
    })),
    server_time: z.string().datetime(),
    next_cursor: z.string()
});

const syncPullResponseSchema = z.object({
    success: z.boolean(),
    server_time: z.string().datetime(),
    next_cursor: z.string(),
    data: z.object({
        articulos: z.array(z.record(z.any())),
        abonos: z.array(z.record(z.any()))
    })
});

module.exports = {
    syncOperationSchema,
    syncPushRequestSchema,
    syncPushResponseSchema,
    syncPullResponseSchema
};
