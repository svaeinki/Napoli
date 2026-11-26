const fs = require('fs');
const path = require('path');

function rutasSidecarsSQLite(dbPath) {
    return [`${dbPath}-wal`, `${dbPath}-shm`];
}

function eliminarArchivoSiExiste(filePath) {
    if (!fs.existsSync(filePath)) {
        return false;
    }
    fs.unlinkSync(filePath);
    return true;
}

function limpiarSidecarsSQLite(dbPath) {
    const eliminados = [];
    for (const sidecarPath of rutasSidecarsSQLite(dbPath)) {
        if (eliminarArchivoSiExiste(sidecarPath)) {
            eliminados.push(sidecarPath);
        }
    }
    return eliminados;
}

function rutaTemporalRestore(dbPath) {
    return `${dbPath}.restore.tmp`;
}

function stageRestoreFile(sourcePath, dbPath) {
    const stagingPath = rutaTemporalRestore(dbPath);
    fs.copyFileSync(sourcePath, stagingPath);
    return stagingPath;
}

function replaceFileAtomically(stagingPath, targetPath) {
    const targetDir = path.dirname(targetPath);
    const backupPath = path.join(targetDir, `${path.basename(targetPath)}.restore.old`);

    let backupMovido = false;
    try {
        if (fs.existsSync(targetPath)) {
            if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath);
            }
            fs.renameSync(targetPath, backupPath);
            backupMovido = true;
        }

        fs.renameSync(stagingPath, targetPath);

        if (backupMovido && fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
        }
    } catch (error) {
        if (fs.existsSync(stagingPath)) {
            try {
                fs.unlinkSync(stagingPath);
            } catch (_) {
                // noop: conservar error original.
            }
        }

        if (backupMovido && !fs.existsSync(targetPath) && fs.existsSync(backupPath)) {
            try {
                fs.renameSync(backupPath, targetPath);
            } catch (_) {
                // noop: conservar error original.
            }
        }
        throw error;
    }
}

module.exports = {
    limpiarSidecarsSQLite,
    replaceFileAtomically,
    rutasSidecarsSQLite,
    rutaTemporalRestore,
    stageRestoreFile
};
