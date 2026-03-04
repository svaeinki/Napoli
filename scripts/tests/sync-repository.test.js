const test = require('node:test');
const assert = require('node:assert/strict');

const SyncRepository = require('../../src/sync-repository');

function createFakeSyncClient() {
    let configured = false;

    return {
        getStatus() {
            return {
                configured,
                authenticated: configured,
                baseUrl: configured ? 'http://localhost:4500' : null,
                username: configured ? 'admin' : null,
                deviceId: 'desktop-test-01',
                configuredAt: configured ? new Date().toISOString() : null
            };
        },
        async configureAndLogin() {
            configured = true;
            return this.getStatus();
        },
        async push(ops) {
            return {
                success: true,
                accepted: ops.map((op) => ({
                    op_id: op.op_id,
                    entity: op.entity,
                    entity_id: `entity-${op.op_id}`,
                    version: 1,
                    updated_at: new Date().toISOString()
                })),
                rejected: [],
                server_time: new Date().toISOString(),
                next_cursor: '12'
            };
        },
        async pull() {
            return {
                success: true,
                server_time: new Date().toISOString(),
                next_cursor: '13',
                data: {
                    articulos: [],
                    abonos: []
                }
            };
        }
    };
}

test('sync-repository encola, push y limpia pendientes aceptados', async () => {
    const repo = new SyncRepository({ syncClient: createFakeSyncClient() });

    await repo.configureRemote({
        baseUrl: 'http://localhost:4500',
        username: 'admin',
        password: 'admin123'
    });

    repo.queueOperation({ entity: 'articulo', op: 'upsert', payload: { id: 'abc' } });
    repo.queueOperation({ entity: 'abono', op: 'append', payload: { id: 'def' } });

    const push = await repo.pushPending();
    assert.equal(push.accepted.length, 2);
    assert.equal(push.rejected.length, 0);
    assert.equal(push.pending, 0);

    const pull = await repo.pull();
    assert.equal(pull.success, true);

    const status = repo.getStatus();
    assert.equal(status.pendingOps, 0);
    assert.equal(status.lastCursor, '13');
});
