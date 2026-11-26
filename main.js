// Punto de entrada del proceso principal de Electron (package.json → "main").
// La lógica vive en src/main/: ciclo-vida.js arranca y cierra la app, e ipc/ registra
// los handlers que usa la interfaz (src/renderer/) a través de src/preload/preload.js.
const { registrarCicloDeVida } = require('./src/main/ciclo-vida');
const { registrarHandlersIpc } = require('./src/main/ipc');
const { DB_PATH, BACKUPS_PATH } = require('./src/main/rutas');

registrarCicloDeVida();
registrarHandlersIpc();

console.log('✅ Napoli - Reparadora de Calzado iniciada');
console.log('📂 Base de datos:', DB_PATH);
console.log('💾 Backups:', BACKUPS_PATH);
