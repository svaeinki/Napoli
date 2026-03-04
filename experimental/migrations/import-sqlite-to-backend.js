#!/usr/bin/env node
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const BetterSqlite = require('better-sqlite3');

function parseArgs(argv) {
    const args = {
        db: '',
        api: 'http://localhost:4500',
        username: 'admin',
        password: 'admin123',
        device: 'desktop-migrator-01',
        batchSize: 100,
        dryRun: false
    };

    for (let i = 2; i < argv.length; i += 1) {
        const current = argv[i];
        const next = argv[i + 1];
        if (current === '--db') args.db = String(next || '').trim();
        if (current === '--api') args.api = String(next || '').trim();
        if (current === '--username') args.username = String(next || '').trim();
        if (current === '--password') args.password = String(next || '').trim();
        if (current === '--device') args.device = String(next || '').trim();
        if (current === '--batch-size') args.batchSize = Number.parseInt(String(next || '100'), 10);
        if (current === '--dry-run') args.dryRun = true;
        if (['--db', '--api', '--username', '--password', '--device', '--batch-size'].includes(current)) {
            i += 1;
        }
    }

    if (!args.db) {
        throw new Error('Debes indicar --db /ruta/a/napoli.db');
    }

    return args;
}

function hashUuid(namespace, value) {
    const source = `${namespace}:${String(value)}`;
    const hex = createHash('sha1').update(source).digest('hex').slice(0, 32);
    const bytes = hex.split('');
    bytes[12] = '4';
    bytes[16] = '8';
    return `${bytes.slice(0, 8).join('')}-${bytes.slice(8, 12).join('')}-${bytes.slice(12, 16).join('')}-${bytes.slice(16, 20).join('')}-${bytes.slice(20, 32).join('')}`;
}

async function login(baseUrl, username, password) {
    const response = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Login fallido (${response.status}): ${text}`);
    }

    const body = await response.json();
    return body.data.access_token;
}

async function pushBatch(baseUrl, token, deviceId, ops) {
    const response = await fetch(`${baseUrl}/sync/push`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            device_id: deviceId,
            ops
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`sync/push fallo (${response.status}): ${text}`);
    }

    const body = await response.json();
    return body;
}

function loadSqliteData(dbPath) {
    const absolute = path.resolve(dbPath);
    const db = new BetterSqlite(absolute, { readonly: true, fileMustExist: true });
    const articulos = db.prepare('SELECT * FROM articulos ORDER BY id ASC').all();
    const abonos = db.prepare('SELECT * FROM abonos ORDER BY id ASC').all();
    db.close();
    return { articulos, abonos, absolute };
}

function mapArticulo(row) {
    return {
        id: hashUuid('articulo', row.id),
        rut: String(row.rut || '').trim(),
        nombre_cliente: String(row.nombreCliente || '').trim(),
        telefono: String(row.telefono || '').trim() || undefined,
        tipo_articulo: String(row.tipoArticulo || '').trim(),
        descripcion: String(row.descripcion || '').trim(),
        numero_bodega: String(row.numeroBodega || '').trim() || undefined,
        observaciones: String(row.observaciones || '').trim() || undefined,
        estado: String(row.estado || 'En Bodega').trim(),
        fecha_ingreso: String(row.fechaIngreso || '').trim(),
        fecha_entrega: row.fechaEntrega || null,
        valor_total: Number.parseFloat(String(row.valorTotal || 0)) || 0,
        total_abonado: Number.parseFloat(String(row.totalAbonado || 0)) || 0,
        estado_pago: String(row.estadoPago || 'Sin pago')
    };
}

function mapAbono(row) {
    return {
        id: hashUuid('abono', row.id),
        articulo_id: hashUuid('articulo', row.articuloId),
        monto: Number.parseFloat(String(row.monto || 0)) || 0,
        metodo_pago: String(row.metodoPago || 'Efectivo'),
        observaciones: String(row.observaciones || '').trim() || undefined,
        fecha: row.fecha ? new Date(row.fecha).toISOString() : new Date().toISOString()
    };
}

function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}

async function run() {
    const args = parseArgs(process.argv);
    const { articulos, abonos, absolute } = loadSqliteData(args.db);

    console.log(`SQLite origen: ${absolute}`);
    console.log(`Articulos: ${articulos.length}`);
    console.log(`Abonos: ${abonos.length}`);

    const ops = [];

    for (const articulo of articulos) {
        const payload = mapArticulo(articulo);
        ops.push({
            op_id: `mig-art-${articulo.id}-${randomUUID().slice(0, 8)}`,
            entity: 'articulo',
            op: 'upsert',
            payload,
            client_updated_at: new Date().toISOString()
        });
    }

    for (const abono of abonos) {
        const payload = mapAbono(abono);
        ops.push({
            op_id: `mig-abo-${abono.id}-${randomUUID().slice(0, 8)}`,
            entity: 'abono',
            op: 'append',
            payload,
            client_updated_at: new Date().toISOString()
        });
    }

    const batches = chunk(ops, Math.max(1, args.batchSize));
    console.log(`Lotes a enviar: ${batches.length} (batch-size=${args.batchSize})`);

    if (args.dryRun) {
        console.log('Dry run activo: no se envia informacion al backend');
        return;
    }

    const token = await login(args.api, args.username, args.password);

    let accepted = 0;
    let rejected = 0;

    for (let i = 0; i < batches.length; i += 1) {
        const response = await pushBatch(args.api, token, args.device, batches[i]);
        accepted += response.accepted.length;
        rejected += response.rejected.length;
        console.log(`Batch ${i + 1}/${batches.length} -> accepted=${response.accepted.length}, rejected=${response.rejected.length}`);
    }

    console.log('Migracion finalizada');
    console.log(`Total accepted: ${accepted}`);
    console.log(`Total rejected: ${rejected}`);

    if (rejected > 0) {
        process.exitCode = 2;
    }
}

run().catch((error) => {
    console.error('Error en importador:', error);
    process.exit(1);
});
