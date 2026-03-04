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

    return { app, config };
}

async function doLogin(app) {
    const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
            username: 'admin',
            password: 'admin123'
        }
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.success, true);
    return body.data.access_token;
}

test('backend memory: crear articulo y registrar abono', async (t) => {
    const { app } = await createApi();
    t.after(async () => {
        await app.close();
    });

    const token = await doLogin(app);

    const createArticulo = await app.inject({
        method: 'POST',
        url: '/articulos',
        headers: {
            authorization: `Bearer ${token}`
        },
        payload: {
            rut: '11.111.111-1',
            nombre_cliente: 'Cliente Demo',
            tipo_articulo: 'Cambio de suela',
            descripcion: 'Bota de cuero',
            valor_total: 22000,
            fecha_ingreso: '2026-03-04'
        }
    });

    assert.equal(createArticulo.statusCode, 200);
    const articuloBody = createArticulo.json();
    assert.equal(articuloBody.success, true);
    const articuloId = articuloBody.data.id;

    const addAbono = await app.inject({
        method: 'POST',
        url: `/articulos/${articuloId}/abonos`,
        headers: {
            authorization: `Bearer ${token}`
        },
        payload: {
            monto: 10000,
            metodo_pago: 'Transferencia'
        }
    });

    assert.equal(addAbono.statusCode, 200);
    const abonoBody = addAbono.json();
    assert.equal(abonoBody.success, true);
    assert.equal(abonoBody.data.articulo.total_abonado, 10000);
    assert.equal(abonoBody.data.articulo.saldo_pendiente, 12000);
    assert.equal(abonoBody.data.articulo.estado_pago, 'Abonado');
});
