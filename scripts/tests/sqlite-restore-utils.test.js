const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    limpiarSidecarsSQLite,
    replaceFileAtomically,
    stageRestoreFile
} = require('../../src/sqlite-restore-utils');

test('restore utils reemplazan DB y limpian sidecars WAL/SHM', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napoli-restore-test-'));
    const dbActivaPath = path.join(tempDir, 'napoli.db');
    const dbBackupPath = path.join(tempDir, 'backup.db');

    try {
        fs.writeFileSync(dbActivaPath, 'ACTIVA');
        fs.writeFileSync(dbBackupPath, 'BACKUP');

        fs.writeFileSync(`${dbActivaPath}-wal`, 'stale wal');
        fs.writeFileSync(`${dbActivaPath}-shm`, 'stale shm');

        const sidecarsEliminados = limpiarSidecarsSQLite(dbActivaPath);
        assert.equal(sidecarsEliminados.length, 2);
        assert.equal(fs.existsSync(`${dbActivaPath}-wal`), false);
        assert.equal(fs.existsSync(`${dbActivaPath}-shm`), false);

        const stagedPath = stageRestoreFile(dbBackupPath, dbActivaPath);
        assert.equal(fs.existsSync(stagedPath), true);

        replaceFileAtomically(stagedPath, dbActivaPath);
        assert.equal(fs.existsSync(stagedPath), false);

        const contenidoFinal = fs.readFileSync(dbActivaPath, 'utf8');
        assert.equal(contenidoFinal, 'BACKUP');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
