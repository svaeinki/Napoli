const test = require('node:test');
const assert = require('node:assert/strict');
const fastify = require('fastify');
const { buildApp } = require('../src/app');
const { InMemoryStore } = require('../src/store/in-memory-store');

async function createApi() {
    const config = {
        accessTokenTtl: '15m',
        refreshTokenTtl: '30d',
        jwtAccessSecret: 'test-access-secret',
        jwtRefreshSecret: 'test-refresh-secret',
        demoUsername: 'admin',
        demoPassword: 'admin123',
        demoSucursalId: '00000000-0000-0000-0000-000000000001'
    };

    const store = new InMemoryStore(config);
    await store.init();
    const app = buildApp({ fastify, config, store });

    return { app };
}

async function login(app) {
    const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
            username: 'admin',
            password: 'admin123'
        }
    });
    return res.json().data.access_token;
}

test('sync/push: misma op_id no duplica operaciones', async (t) => {
    const { app } = await createApi();
    t.after(async () => {
        await app.close();
    });

    const token = await login(app);

    const opPayload = {
        device_id: 'desktop-caja-01',
        ops: [{
            op_id: 'op-demo-12345',
            entity: 'articulo',
            op: 'upsert',
            payload: {
                id: '11111111-1111-4111-8111-111111111111',
                rut: '9.999.999-9',
                nombre_cliente: 'Cliente Sync',
                tipo_articulo: 'Costura',
                descripcion: 'Zapato cafe',
                fecha_ingreso: '2026-03-04',
                valor_total: 15000
            }
        }]
    };

    const first = await app.inject({
        method: 'POST',
        url: '/sync/push',
        headers: { authorization: `Bearer ${token}` },
        payload: opPayload
    });

    assert.equal(first.statusCode, 200);
    const body1 = first.json();
    assert.equal(body1.accepted.length, 1);
    assert.equal(body1.rejected.length, 0);

    const second = await app.inject({
        method: 'POST',
        url: '/sync/push',
        headers: { authorization: `Bearer ${token}` },
        payload: opPayload
    });

    assert.equal(second.statusCode, 200);
    const body2 = second.json();
    assert.equal(body2.accepted.length, 1);
    assert.equal(body2.rejected.length, 0);
    assert.equal(body1.accepted[0].entity_id, body2.accepted[0].entity_id);

    const pull = await app.inject({
        method: 'GET',
        url: '/sync/pull?since=0',
        headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(pull.statusCode, 200);
    const pullBody = pull.json();
    assert.equal(pullBody.success, true);
    assert.equal(pullBody.data.articulos.length, 1);
});
