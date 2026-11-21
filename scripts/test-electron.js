// Ejecuta los tests con el runtime de Node que trae Electron.
// better-sqlite3 queda compilado para Electron (no para el Node del sistema), así que con `yarn test`
// los tests que usan SQLite real se omiten. Con este script sí se ejecutan.
//
// Uso: yarn run test:electron
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const electron = require('electron');

const testsDir = path.join(__dirname, 'tests');
const archivos = fs.readdirSync(testsDir)
    .filter((nombre) => nombre.endsWith('.test.js'))
    .sort()
    .map((nombre) => path.join(testsDir, nombre));

const resultado = spawnSync(electron, ['--test', ...archivos], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});

if (resultado.error) {
    console.error(resultado.error);
    process.exit(1);
}
process.exit(resultado.status === null ? 1 : resultado.status);
