const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { cargarMainProcess } = require('./helpers/main-process-harness');

const TOKEN_CIFRADO = Buffer.from('enc:token-viejo').toString('base64');

function dropboxQueFalla(modo) {
    return function DropboxFalla() {
        this.estaConfigurado = () => true;
        this.subirBackupDB = async () => {
            if (modo === 'lanza') throw new Error('Timeout subiendo backup a Dropbox');
            return { success: false, error: 'expired_access_token' };
        };
    };
}

async function escenario(t, modo) {
    const main = cargarMainProcess({
        configInicial: { dropboxToken: TOKEN_CIFRADO },
        dropboxFactory: dropboxQueFalla(modo)
    });
    t.after(() => main.limpiar());
    await main.listo;

    const antiguo = path.join(main.backupsPath, 'napoli_backup_antiguo.db');
    fs.writeFileSync(antiguo, 'viejo');
    const hace40Dias = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    fs.utimesSync(antiguo, hace40Dias, hace40Dias);

    const resultado = await main.modulo('respaldos').crearBackupAutomatico();
    const estado = JSON.parse(fs.readFileSync(path.join(main.userData, 'backup-status.json'), 'utf8'));
    return { main, antiguo, resultado, estado };
}

for (const modo of ['devuelve error', 'lanza']) {
    test(`si Dropbox falla (${modo}), el backup automático igual limpia antiguos y registra estado`, async (t) => {
        const { antiguo, resultado, estado } = await escenario(t, modo);

        assert.equal(resultado.success, true);
        assert.match(resultado.warning, /falló subida a Dropbox/);
        assert.ok(fs.existsSync(resultado.path), 'el backup local debe existir');
        assert.equal(fs.existsSync(antiguo), false, 'los backups de más de 30 días deben eliminarse');
        assert.equal(estado.lastAutomaticBackup.path, resultado.path);
        assert.equal(estado.lastDropboxUpload.success, false);
    });
}
