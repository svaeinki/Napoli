# CLAUDE.md

Este archivo orienta a Claude Code (claude.ai/code) cuando trabaja con el código de este repositorio.

## Resumen del proyecto

Napoli es una **app de escritorio en Electron** para gestionar el inventario de una reparadora de calzado. Usa SQLite para persistir los datos, imprime tickets térmicos (58 mm/80 mm), tiene un sistema de pagos y abonos, y backups opcionales en Dropbox.

## Comandos

```bash
# Instalar y compilar módulos nativos (obligatorio después de yarn install)
yarn install && yarn run rebuild

# Ejecutar la app en desarrollo
yarn start

# Ejecutar todos los tests
yarn test

# Ejecutar un solo archivo de tests
node --test scripts/tests/database-migration.test.js

# Ejecutar los tests con el Node de Electron (incluye los que usan SQLite real)
yarn run test:electron

# Verificar sintaxis
yarn run check:syntax

# Validación previa a un release (sintaxis + auditoría + build de la plataforma actual)
yarn run release:check

# Generar instaladores (idealmente en el sistema operativo correspondiente)
yarn run build-mac     # .dmg
yarn run build-win     # .exe (NSIS)
yarn run build-linux   # .AppImage
```

**Nota:** `better-sqlite3` es un módulo nativo. Después de actualizar Electron o Node, ejecuta siempre `yarn run rebuild` para recompilarlo (usa `run` explícitamente: el comando propio de Yarn `yarn rebuild` es otra cosa y recompila contra Node, no contra Electron). Requiere Node >=20.

**Gestor de paquetes:** este proyecto usa **Yarn 4** mediante Corepack (fijado en el campo `packageManager` de `package.json`; ejecuta `corepack enable` una vez). `.yarnrc.yml` define `nodeLinker: node-modules`; Plug'n'Play es incompatible con electron-builder y con los módulos nativos, así que nunca lo quites. Yarn 4 desactiva por defecto los scripts de build de las dependencias; los paquetes nativos que los necesitan (`better-sqlite3`, `electron`, `electron-winstaller`) están permitidos en `dependenciesMeta` de `package.json`. `resolutions` fuerza `node-gyp ^11` e `image-size ^2` para eliminar hallazgos de auditoría de severidad alta (`tar`, `image-size`); como `image-size` v2 cambió su API, `excel4node` está parchado con `.yarn/patches/excel4node-*.patch`. Si actualizas `excel4node`, revisa si el parche sigue siendo necesario (`yarn patch excel4node`). No uses `npm` ni `pnpm`: un gestor distinto puede dejar `node_modules` con `better-sqlite3` compilado para otra ABI de Node/Electron, lo que provoca un error `NODE_MODULE_VERSION` al arrancar.

## Arquitectura

### Modelo de procesos (Electron)

```
main.js            Punto de entrada del proceso principal (corto): registra el ciclo de vida y los handlers IPC
src/main/          Proceso principal (Node): base de datos, archivos, configuración, backups, Dropbox
src/main/ipc/      Handlers ipcMain.handle agrupados por área
src/preload/       preload.js: puente contextBridge que expone window.electronAPI
src/renderer/      Interfaz: index.html, html/, js/, css/, assets/
```

- **`main.js`** — Solo llama a `registrarCicloDeVida()` (`src/main/ciclo-vida.js`) y a `registrarHandlersIpc()` (`src/main/ipc/index.js`). La lógica vive en `src/main/`. El proceso principal es el único con acceso a Node.js.
- **`src/preload/preload.js`** — Puente de contexto que expone `window.electronAPI` al renderer. Toda la comunicación renderer↔principal pasa por esta API.
- **`src/renderer/index.html`** + **`src/renderer/js/*.js`** — Proceso renderer. JavaScript sin frameworks ni bundler. Los scripts se cargan en orden con etiquetas `<script>`.

### Módulos del proceso principal (`src/main/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `ciclo-vida.js` | `app.whenReady` (diagnóstico, DBService con reintento del worker, Dropbox, ventana, backup cada 24 h), `window-all-closed`, `before-quit` (backup final y cierre de la base) |
| `ventana.js` | Crea el `BrowserWindow` (con el preload), carga `src/renderer/index.html` y aplica la lista permitida de URLs externas |
| `rutas.js` | Rutas de `userData`, `napoli.db`, `config.json`, `backups/` y la raíz de la app |
| `estado.js` | Estado compartido en tiempo de ejecución: `dbService`, `dropboxManager`, `mainWindow`, `diagnostics`, `restauracionEnCurso` |
| `utilidades.js` | `logDiag`, `medirOperacionDb`, `respuestaBloqueoRestoreEscritura`, `payloadErrorOperacion`, `withTimeout`, escritura JSON atómica, timestamps únicos |
| `configuracion.js` | `config.json`: carga con migraciones y recuperación ante archivo corrupto, guardado atómico, configuración de impresora, decisiones operativas, cifrado del token de Dropbox con `safeStorage` |
| `respaldos.js` | Crear backups (automático/manual) y subirlos a Dropbox, listar, limpiar antiguos, `backup-status.json`, rutas aprobadas por el diálogo |
| `restauracion.js` | Validar un `.db` y restaurarlo con snapshot previo, reemplazo atómico, smoke check y rollback |
| `exportaciones.js` | Exportar el inventario a JSON y Excel |
| `dropbox-sesion.js` | Conectar Dropbox al arrancar con las credenciales guardadas; subida de backups con timeout |
| `ipc/*.js` | Handlers IPC: `db.js`, `pagos.js`, `backups.js`, `dropbox.js`, `config.js`, `imprimir.js`, `diag.js`; `validacion.js` con los límites de largo de texto; `index.js` los registra en orden |

Los módulos comparten estado a través de `estado.js` (por ejemplo, `estado.dbService`), no con variables globales. Las dependencias van en un solo sentido; no hay requires circulares.

### Capa de base de datos

La capa de base de datos tiene un diseño de respaldo en dos niveles:

1. **`src/main/db-service.js`** (`DBService`) — Orquestador. Normalmente ejecuta las operaciones en un worker thread. Si el worker falla o no arranca, pasa a "modo legacy" (acceso directo en el mismo proceso mediante `DatabaseManager`). Una cadena de promesas `modeTransitionQueue` serializa los cambios de modo para evitar condiciones de carrera.
2. **`src/main/db-worker.js`** — Worker thread que contiene una instancia de `DatabaseManager` y se comunica mediante mensajes de `parentPort`.
3. **`src/main/database.js`** (`DatabaseManager`) — El envoltorio real de `better-sqlite3`. Crea el esquema, aplica migraciones (con `ALTER TABLE`) y ejecuta todas las consultas SQL. Todas las escrituras usan `db.transaction()`.

Convención de nombres de los canales IPC: `db:*`, `pago:*`, `backup:*`, `dropbox:*`, `config:*`, `diag:*`, `app:*` (y `imprimir`).

Durante una restauración de la base (`estado.restauracionEnCurso = true`), todos los handlers IPC que tocan la base deben devolver de inmediato un error de ocupado con `respuestaBloqueoRestoreEscritura()`; ver el patrón IPC más abajo.

### Patrón de los handlers IPC

Cada `ipcMain.handle` vive en el archivo de su área dentro de `src/main/ipc/`, dentro de la función `registrar()` que exporta ese archivo, y sigue exactamente esta estructura. Nunca uses `throw` en un handler IPC: devuelve siempre un objeto de respuesta.

```js
ipcMain.handle('db:ejemplo', async (_event, param) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!estado.dbService) return { success: false, error: 'Base de datos no inicializada' };
    try {
        return await medirOperacionDb('db:ejemplo', () => estado.dbService.ejemplo(param));
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});
```

- El primer parámetro siempre es `_event` (con guion bajo: lo exige la API de Electron, pero no se usa).
- Los handlers de solo lectura también usan `respuestaBloqueoRestoreEscritura()` para bloquearse durante una restauración, igual que los de escritura.
- Todos los errores se devuelven como `{ success: false, error: string, code?: string }`.
- Un canal nuevo necesita tres cosas: el handler en `src/main/ipc/<área>.js`, su método en `src/preload/preload.js` y la llamada desde `src/renderer/js/`.

### Patrón de la interfaz (renderer)

El contenido de las pestañas **no** está en `index.html`: lo carga al iniciar `src/renderer/js/templateLoader.js` desde los fragmentos `src/renderer/html/tab-*.html`. Todos los demás módulos JS esperan la promesa `window.templatesListos` antes de acceder al DOM.

El orden de carga de los scripts en `index.html` importa: `templateLoader.js` → `theme.js` → `utils.js` → `validacion.js` → `articulos.js` → `inventario.js` → `pagos.js` → `busqueda.js` → `backups.js` → `tickets.js` → `config.js` → `main.js` (el `main.js` del renderer, en `src/renderer/js/`, no el de la raíz).

### Patrón de listeners en modales

Todos los modales usan `AbortController` para limpiar sus listeners; nunca agregues ni quites listeners a mano:

```js
let miModalAbortController = null;

function abrirModal() {
    if (miModalAbortController) miModalAbortController.abort();
    miModalAbortController = new AbortController();
    const { signal } = miModalAbortController;

    modal.addEventListener('click', handler, { signal });
    document.addEventListener('keydown', escHandler, { signal });
    modal.style.display = 'block';
}

function cerrarModal() {
    if (miModalAbortController) {
        miModalAbortController.abort();
        miModalAbortController = null;
    }
    modal.style.display = 'none';
}
```

Este patrón se usa en: el modal de confirmación (`utils.js`), el de pagos (`pagos.js`) y el de configuración (`config.js`).

### Convenciones de seguridad

- **XSS:** todo valor que se interpole en `innerHTML` debe pasar por `escaparHtml()` (definida en `src/renderer/js/utils.js`). Sin excepciones. Los nombres de clase y los IDs que vienen de la base (como `articuloId`) solo son seguros cuando está garantizado que son enteros.
- **Inyección SQL:** todas las consultas usan sentencias preparadas con marcadores `?`. Nunca interpoles variables en un string SQL.
- **Navegación:** `src/main/navigation-security.js` define la lista permitida de URLs externas: solo `https://dropbox.com` y sus subdominios.
- **Consola del renderer:** solo `console.error` para errores reales capturados. Nada de `console.log` ni `console.warn` para mensajes informativos o de depuración.

### Acoplamiento entre módulos

`utils.js::showTab()` referencia directamente `_busquedaDebounceTimer` (una variable global definida en `busqueda.js`) para cancelar búsquedas pendientes al cambiar de pestaña. Es la única referencia global intencional entre módulos.

### Módulos clave

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/renderer/js/tickets.js` | Renderizado del ticket térmico (58 mm/80 mm, perfiles de fuente: `compacto`/`legible`/`extra_grande`) |
| `src/renderer/js/inventario.js` | Lista del inventario, manejo de estado, exportación CSV |
| `src/renderer/js/backups.js` | Creación, validación y restauración de backups; interfaz de Dropbox |
| `src/renderer/js/pagos.js` | Modal de pagos y abonos |
| `src/main/chile-date.js` | Fechas en formato y zona horaria de Chile (lo usan `database.js` y la exportación a Excel; el renderer tiene su propia versión en `utils.js`) |
| `src/main/navigation-security.js` | Lista permitida de URLs externas; solo se permite `dropbox.com` |
| `src/main/sqlite-restore-utils.js` | Reemplazo atómico del archivo y apoyo al snapshot previo a la restauración |
| `src/main/diagnostics.js` | Registro de eventos de diagnóstico de la app |

### Persistencia de datos

- **Base de datos:** `~/Library/Application Support/Napoli Reparadora/napoli.db` (macOS) / `%APPDATA%\Napoli Reparadora\napoli.db` (Windows)
- **Configuración:** `config.json` en el mismo directorio `userData`
- **Backups:** subdirectorio `backups/` dentro de `userData`
- El esquema se migra con `ALTER TABLE`: las columnas nuevas se agregan de forma idempotente, nunca destructiva.
- Para probar la app sin tocar los datos reales: `yarn start --user-data-dir=/ruta/temporal`.

### Tests

Los tests usan el runner **integrado de Node, `node:test`** (no Jest ni Mocha). Se ejecutan con `node --test scripts/tests/<archivo>.test.js`.

Con `yarn test`, los tests que necesitan SQLite real se omiten (porque `better-sqlite3` queda compilado para Electron); `yarn run test:electron` los ejecuta todos.

Muchos tests simulan `better-sqlite3` cargando `database.js` en un sandbox `vm.createContext` con una clase `FakeDatabase`; así no necesitan el binario real de SQLite.

`scripts/tests/helpers/main-process-harness.js` carga `main.js` y los módulos de `src/main/` dentro de un sandbox `vm`, con `electron`, `better-sqlite3`, `db-service`, `dropbox` y `diagnostics` simulados:

- Cada `cargarMainProcess()` tiene su propia caché de módulos, así que el estado (`estado.js`) no se comparte entre tests.
- Los mocks se identifican por la ruta resuelta del archivo, no por el texto del `require`.
- `navigation-security`, `backup-filename`, `sqlite-restore-utils` y `chile-date` se cargan con el `require` real de Node.
- Para llamar una función interna desde un test: `main.modulo('respaldos').crearBackupAutomatico()`.

Al probar `utils.js` en un sandbox VM, incluye `AbortController` en el objeto de contexto (lo usa el sistema de confirmación modal):

```js
const context = {
    AbortController,
    document: { ... },
    // ...
};
vm.createContext(context);
vm.runInContext(utilsScript, context);
```

### Flujo de release

Los releases se disparan al subir un tag `v*`. GitHub Actions genera los instaladores en runners nativos (`windows-latest`, `macos-15-intel`, `ubuntu-latest`) y publica en GitHub Releases solo los instaladores finales (`.exe`, `.dmg`, `.AppImage`), sin artefactos de actualización automática.

```bash
# Sube la versión en package.json y luego:
git add -A && git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin main && git push origin vX.Y.Z
```

`yarn run build-mac` genera un instalador x64. En un Mac Apple Silicon, mientras corre el build, `better-sqlite3` queda compilado para x64 y `yarn start` falla; espera a que termine (al final vuelve a compilarlo para arm64) o ejecuta `yarn run rebuild`.
