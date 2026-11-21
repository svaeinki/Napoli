// Ejecuta electron-builder y, al terminar (con éxito o no), vuelve a compilar los módulos nativos
// (better-sqlite3) para la arquitectura de ESTE equipo.
//
// Motivo: los instaladores apuntan a x64. En un Mac Apple Silicon (arm64), electron-builder deja
// better-sqlite3 compilado para x64 dentro de node_modules y después `yarn start` no puede abrir la base.
//
// Uso: node scripts/build-installer.js --mac [--publish never ...]
const { spawnSync } = require('child_process');
const path = require('path');

const cli = path.join(__dirname, '..', 'node_modules', 'electron-builder', 'cli.js');

function ejecutar(args) {
    const resultado = spawnSync(process.execPath, [cli, ...args], {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
    });
    if (resultado.error) {
        console.error(resultado.error);
        return 1;
    }
    return resultado.status === null ? 1 : resultado.status;
}

const estadoBuild = ejecutar(process.argv.slice(2));

console.log(`\nRecompilando módulos nativos para este equipo (${process.platform}-${process.arch})...`);
const estadoRebuild = ejecutar(['install-app-deps']);
if (estadoRebuild !== 0) {
    console.error('⚠️ No se pudieron recompilar los módulos nativos. Ejecute: yarn run rebuild');
}

process.exit(estadoBuild !== 0 ? estadoBuild : estadoRebuild);
