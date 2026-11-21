# Problemas detectados — revisión general (2026-11-21)

Estado: `[ ]` pendiente · `[x]` arreglado · `[~]` arreglado en parte (ver nota)

Se arreglan en orden de menor a mayor prioridad (del 12 al 1).

**Resumen:** 12/12 arreglados. Pendiente fuera del código: probar la conexión a Dropbox (#2) con una cuenta real.
Tests: `yarn test` → 50 pasan / 16 omitidos (SQLite) · `yarn run test:electron` → 66/66 pasan.

## Prioridad alta

- [x] **1. `better-sqlite3` compilado para Intel en Mac Apple Silicon.**
  `build.mac` solo apunta a `x64`; tras `yarn run build-mac` el módulo nativo queda en x86_64 dentro de `node_modules`
  y `yarn start` no puede abrir la base (9 tests se omiten por lo mismo).
  → Recompilado (`yarn run rebuild`): ahora es arm64. Para que no vuelva a pasar, `build`, `build-mac`, `build-win`
    y `build-linux` usan `scripts/build-installer.js`, que tras electron-builder recompila los módulos nativos para
    la arquitectura del equipo (los argumentos extra como `--publish never` se siguen pasando).
    Nuevo `yarn run test:electron`: corre los tests con el runtime de Electron, así los de SQLite real ya no se omiten.
    `yarn test` (Node del sistema) los sigue omitiendo, como antes.
    Verificado: `test:electron` → 66/66 pasan, 0 omitidos. Smoke test de la app real con datos aislados: arranca en
    modo worker, carga todas las pestañas con el CSP sin errores, inserta, rechaza abono extra, hora de abono correcta.

- [x] **2. Token de Dropbox expira a las ~4 horas.**
  `tab-backup.html` pide el "Generated access token" de la App Console, que desde 2021 es de corta duración.
  No hay refresh token, así que los backups en la nube dejan de funcionar en silencio.
  → Nuevo flujo OAuth 2 con PKCE (sin client secret ni servidor): la usuaria pega el **App key** de su app de
    Dropbox, la app abre la autorización en el navegador, se pega el código y se guarda un **refresh token**
    cifrado (`config.dropboxAuth`). El SDK renueva el acceso solo. IPC nuevos `dropbox:iniciarAutorizacion` /
    `dropbox:completarAutorizacion` (se quitó `dropbox:configurar`); UI e instrucciones actualizadas en
    `tab-backup.html` / `backups.js`; README actualizado. Un token antiguo guardado sigue cargándose hasta que
    expire, y entonces la UI pide reconectar. Errores 401 ahora dicen "Vuelva a conectar Dropbox".
    Tests: `scripts/tests/dropbox-oauth.test.js` (PKCE, canje del código, renovación automática, IPC).
    ⚠️ Pendiente: probar una vez con una cuenta real de Dropbox (los tests simulan la red).

- [x] **3. Si falla Dropbox, el backup automático no limpia ni registra estado.**
  `main.js` `crearBackupInterno`: retorna antes de `limpiarBackupsAntiguos()` y de registrar `lastAutomaticBackup`.
  → Una vez creado el backup local se limpia y registra siempre; Dropbox solo agrega un aviso. También se corrigió
    que un timeout de subida (excepción) convertía en error un backup local exitoso. Se registra
    `lastDropboxUpload` (éxito/error) en `backup-status.json`.
    Test nuevo: `scripts/tests/backup-automatico-dropbox.test.js`.

- [x] **4. Hora de los abonos desplazada 3–4 horas.**
  `abonos.fecha` usa `CURRENT_TIMESTAMP` (UTC sin "Z") y el renderer lo interpreta como hora local.
  → `obtenerAbonosArticulo` entrega `fecha` como ISO UTC (`strftime(...'Z')`, con fallback al valor original).
    No se cambió el parser global para no alterar cómo se leen datos antiguos. Orden estable (`fecha, id`).
    Verificado: un abono de las 15:00 UTC se muestra a las 12:00 hora Chile. Test en `pagos-reglas.test.js`.

- [x] **5. Errores de lectura se muestran como inventario vacío.**
  `inventario.js` convierte `{ success: false }` en `[]` sin avisar; búsqueda muestra "undefined resultados";
  el modal de pagos falla con `abonos.forEach is not a function`.
  → Nuevos helpers en `utils.js` (`exigirLecturaIpc`, `exigirListaIpc`) que convierten `{ success: false, error }`
    en excepción con el mensaje real. Aplicados a todas las lecturas del renderer (inventario, exportar CSV,
    búsqueda, modal de pagos, entregar/devolver/eliminar, ver/reimprimir ticket). El inventario conserva los datos
    anteriores y muestra el error. Test nuevo en `inventario-refresh.test.js`.

## Prioridad media

- [x] **6. Se pueden registrar abonos sobre artículos ya pagados.**
  `pagos.js` omite la validación si el saldo es 0 y `database.js` `registrarAbono` no limita el monto.
  → `registrarAbono` (dentro de la transacción) rechaza: abonos mayores al saldo, abonos sobre artículos pagados
    y abonos sobre artículos sin valor definido. `actualizarValorTotal` rechaza un valor menor a lo ya abonado.
    `pagos.js` valida también el caso saldo = 0. Tests: `scripts/tests/pagos-reglas.test.js` (usa SQLite real,
    se ejecutan tras arreglar el #1).

- [x] **7. Artículos con valor 0 quedan como "Pagado".**
  `database.js` marca `Pagado` cuando el saldo es 0 aunque no haya abonos; el frontend asume "Sin pago".
  → **Criterio elegido:** sin abonos el estado es siempre "Sin pago" (valor 0 = precio aún no definido); con abonos,
    "Pagado" si cubren el total y "Abonado" si no. Una sola regla (`calcularEstadoPago`) para insertar, abonar y
    cambiar valor. Migración idempotente `corregirEstadoPagoSinAbonos` corrige los artículos ya guardados como
    "Pagado" sin abonos. Si se prefiere otro criterio, se cambia solo en esa regla.

- [x] **8. `config.json` corrupto se sobrescribe con valores por defecto.**
  Se pierden el token de Dropbox y la calibración de impresora. Además la escritura no es atómica.
  → Si `config.json` no se puede parsear se guarda una copia `config.corrupt-<fecha>.json` antes de usar los valores
    por defecto (si no se puede copiar, no se sobrescribe). Si falla la lectura (permisos) no se toca el archivo.
    `config.json` y `backup-status.json` se escriben a un temporal + `rename` (atómico).
    Test nuevo: `scripts/tests/config-persistencia.test.js`.

- [x] **9. El rollback de una restauración puede usar un snapshot incompleto.**
  Si falla la creación del snapshot, el `catch` reemplaza la base activa con ese archivo parcial aunque
  la base nunca se tocó.
  → `restaurarBackupDB` registra en qué paso falló (`dbCerrada`, `dbReemplazada`): solo hace rollback si la base
    activa llegó a reemplazarse, y solo reabre si se cerró. Un snapshot fallido se elimina.
    Test nuevo: `scripts/tests/restore-rollback.test.js` (+ harness `scripts/tests/helpers/main-process-harness.js`
    que carga `main.js` con electron simulado).

## Prioridad baja

- [x] **10. Fechas antiguas en el día de cambio de horario se interpretan mal.**
  `08-09-2024` (hora inexistente en Chile) cae al parser nativo y queda como 9 de agosto.
  → `construirFechaChileSegura` prueba los offsets alrededor de la fecha: una hora inexistente se adelanta
    (00:00 → 01:00) en vez de descartarse. Si el texto tiene formato dd-mm-aaaa ya no se delega al parser nativo
    (que lo leía como mm-dd); fechas imposibles como 31-02 devuelven `null`. Corregido en `src/chile-date.js`
    y `src/js/utils.js`. 3 tests nuevos en `chile-date.test.js`.

- [x] **11. Timeout de arranque del worker DB no cierra el arranque.**
  `db-service.js` `startWorker`: el timeout no usa `settle()`; un `ready` tardío puede marcar como activo un worker terminado.
  → El timeout ahora pasa por `settle()` (ignora mensajes posteriores) y es configurable (`workerStartupTimeoutMs`).
    Test nuevo: `scripts/tests/db-service-startup-timeout.test.js` (falla con el código anterior, pasa con el nuevo).

- [x] **12. Detalles menores.**
  - [x] a. Sin Content-Security-Policy en `index.html`.
    → Agregado CSP (`default-src 'self'`, bloquea red remota, `object`, `base`, `frame`). Requiere `'unsafe-inline'`
      en scripts por los `onclick=` del HTML. Verificado en Electron: templates `file://` y `onclick` siguen funcionando.
  - [x] b. "Total Abonado" sin `$` en el modal de pagos. → `pagos.js`.
  - [x] c. CSV sin BOM: Excel en Windows muestra mal los acentos. → `inventario.js` antepone `﻿`.
  - [x] d. `build.files: **/*` incluye `scripts/` (tests) dentro del instalador. → excluidos `scripts/**` y `PROBLEMAS.md`.
