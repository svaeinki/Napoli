const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { cargarMainProcess } = require('./helpers/main-process-harness');

async function prepararEscenario(t) {
    const main = cargarMainProcess();
    t.after(() => main.limpiar());
    await main.listo;
    fs.writeFileSync(main.dbPath, 'datos-originales');
    const backupPath = path.join(main.backupsPath, 'externo.db');
    fs.writeFileSync(backupPath, 'datos-backup');
    // El snapshot real copia la base activa.
    main.dbService.crearBackupImpl = async (ruta) => {
        fs.copyFileSync(main.dbPath, ruta);
        return { success: true, path: ruta };
    };
    return { main, backupPath };
}

function snapshotsPreRestore(main) {
    return fs.readdirSync(main.backupsPath).filter((nombre) => nombre.startsWith('napoli_pre_restore_'));
}

test('si falla el snapshot previo, la base activa queda intacta y no se usa el snapshot parcial', async (t) => {
    const { main, backupPath } = await prepararEscenario(t);
    main.dbService.crearBackupImpl = async (ruta) => {
        fs.writeFileSync(ruta, 'snapshot-a-medias');
        return { success: false, error: 'disco lleno' };
    };

    const resultado = await main.invocar('backup:restaurarDB', backupPath);

    assert.equal(resultado.success, false);
    assert.equal(resultado.rollbackUsed, false);
    assert.match(resultado.error, /snapshot previo/);
    assert.equal(fs.readFileSync(main.dbPath, 'utf8'), 'datos-originales');
    assert.deepEqual(snapshotsPreRestore(main), [], 'el snapshot parcial debe eliminarse');
    const operaciones = main.dbService.calls.map(([op]) => op);
    assert.equal(operaciones.includes('closeForRestore'), false);
    assert.equal(operaciones.includes('reopenAfterRestore'), false);
});

test('restauración exitosa reemplaza la base y deja snapshot previo', async (t) => {
    const { main, backupPath } = await prepararEscenario(t);

    const resultado = await main.invocar('backup:restaurarDB', backupPath);

    assert.equal(resultado.success, true);
    assert.equal(fs.readFileSync(main.dbPath, 'utf8'), 'datos-backup');
    const snapshots = snapshotsPreRestore(main);
    assert.equal(snapshots.length, 1);
    assert.equal(fs.readFileSync(path.join(main.backupsPath, snapshots[0]), 'utf8'), 'datos-originales');
});

test('si falla después de reemplazar la base, se hace rollback al snapshot', async (t) => {
    const { main, backupPath } = await prepararEscenario(t);
    let reaperturas = 0;
    main.dbService.reopenAfterRestore = async () => {
        reaperturas += 1;
        if (reaperturas === 1) throw new Error('no abre el backup');
    };

    const resultado = await main.invocar('backup:restaurarDB', backupPath);

    assert.equal(resultado.success, false);
    assert.equal(resultado.rollbackUsed, true);
    assert.equal(fs.readFileSync(main.dbPath, 'utf8'), 'datos-originales');
    assert.equal(reaperturas, 2);
});
