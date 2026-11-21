# 👞 Napoli - Reparadora de Calzado

Sistema de escritorio para gestionar el inventario y los pagos de una reparadora de calzado. Construido con Electron y una base de datos SQLite local, con backups opcionales en Dropbox, sistema de pagos y abonos, tickets térmicos y tema oscuro.

[![Estado](https://img.shields.io/badge/estado-en%20producción-success.svg)](#-estado-del-proyecto)
[![Versión](https://img.shields.io/badge/versión-2.0.9-blue.svg)](./CHANGELOG.md)
[![Electron](https://img.shields.io/badge/Electron-40-47848F.svg)](https://www.electronjs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57.svg)](https://github.com/WiseLibs/better-sqlite3)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933.svg)](https://nodejs.org/)
[![Licencia](https://img.shields.io/badge/licencia-MIT-green.svg)](#-licencia)
[![Plataforma](https://img.shields.io/badge/plataforma-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#-instalación-y-ejecución)

> **English version:** see [`README.en.md`](./README.en.md).

---

## 🎯 El problema

Las reparadoras pequeñas en Chile suelen llevar los pedidos en cuadernos o planillas genéricas. Así es fácil perder tickets, olvidar abonos, calcular mal los saldos o dejar artículos meses en bodega sin darse cuenta. Los sistemas POS comerciales son caros, complejos o están pensados para ventas con código de barras, no para un flujo donde cada artículo es una reparación única con descripción a mano.

Napoli se construyó para una reparadora real en Chile y se usa a diario en el mostrador. Funciona sin internet, imprime tickets térmicos, controla los abonos y se respalda en Dropbox, para que perder el computador no signifique perder el registro.

---

## ✨ Características Principales

### 📦 Gestión de Inventario
- ✅ Registro de artículos con cliente, RUT, tipo de servicio (cambio de suela, taco, costura, teñido, limpieza, etc.) y valor
- ✅ Ubicación opcional por artículo (`numeroBodega`)
- ✅ Estados: "En Bodega" / "Entregado"
- ✅ Búsqueda por RUT, nombre, ID, ubicación y tipo de artículo, con filtrado en vivo
- ✅ Filtros por estado
- ✅ Contador de días en bodega con alerta visual a partir de 30 días
- ✅ Validación de RUT chileno (dígito verificador módulo 11)

### 🖨️ Tickets Térmicos (58mm/80mm)
- ✅ Configurable para impresoras de 58mm y 80mm
- ✅ Perfiles de legibilidad 58mm: `compacto`, `legible` (recomendado), `extra_grande`
- ✅ Ancho útil 58mm calibrable (44 a 54 mm, por defecto 48 mm)
- ✅ Vista previa del ticket antes de imprimir
- ✅ Encabezado y pie de página personalizables desde la app

### 💰 Sistema de Pagos y Abonos
- ✅ Registro de valor total del servicio
- ✅ Abono inicial al ingresar el artículo y abonos parciales posteriores
- ✅ Cálculo automático de saldo pendiente
- ✅ Estados de pago: Sin pago / Abonado / Pagado
- ✅ Métodos de pago: Efectivo, Tarjetas, Transferencia
- ✅ Historial detallado de cada abono y tickets con desglose de pagos

### 💾 Base de Datos
- ✅ SQLite local mediante `better-sqlite3`
- ✅ Todas las escrituras dentro de transacciones
- ✅ Registro de auditoría de acciones por artículo
- ✅ Capa de base de datos en un *worker thread*, con respaldo automático en modo directo si el worker falla

### ☁️ Backups y Exportación
- ✅ Backup automático cada 24 horas y al cerrar la aplicación
- ✅ Formatos de backup: `.db` (SQLite) y `.json`
- ✅ Limpieza automática de backups locales con más de 30 días
- ✅ Sincronización opcional con Dropbox
- ✅ Validación explícita de backups `.db` antes de restaurar
- ✅ Restauración guiada con snapshot previo, rollback automático y verificación post-restore
- ✅ Exportación de datos a CSV, Excel (`.xlsx`) y JSON

### 🌙 Tema Oscuro
- ✅ Alternancia entre tema claro y oscuro
- ✅ Preferencia guardada automáticamente

### 📴 100% Offline
- ✅ La app no necesita internet para funcionar; Dropbox es estrictamente opcional

---

## 🧰 Stack Tecnológico

| Capa | Elección |
| --- | --- |
| Aplicación | Electron 40 |
| Lenguaje | JavaScript (sin bundler ni framework) |
| Base de datos | SQLite vía `better-sqlite3` |
| Backup en la nube | SDK de Dropbox (opcional, configurado por la usuaria) |
| Exportación CSV / Excel | `excel4node` |
| Tests | Runner nativo de Node.js (`node:test`) |
| Gestor de paquetes | Yarn 4 (vía Corepack) |
| Build | `electron-builder` (NSIS, DMG, AppImage) |
| CI | GitHub Actions en matriz (Windows / macOS / Linux) |

---

## 🚀 Instalación y Ejecución

Sigue las instrucciones de tu sistema operativo para evitar problemas comunes de compilación.

### Requisitos del Sistema

| Requisito | Versión mínima | Versión recomendada |
|-----------|---------------|---------------------|
| Node.js   | **20.x**      | 22.x LTS            |
| Yarn      | 4.x           | 4.18.x — se activa con `corepack enable` (en Node ≥25: `npm i -g corepack` primero) |
| Git       | cualquier     | —                   |

> **Nota:** el proyecto usa **Yarn 4**, fijado en el campo `packageManager` de `package.json`. No uses `npm` ni `pnpm`: otro gestor puede dejar `better-sqlite3` compilado para la versión equivocada de Node/Electron.

#### Verificar instalación

```bash
node --version   # debe ser v20.x o superior
corepack enable  # activa Yarn (una sola vez)
yarn --version   # dentro del repo debe mostrar 4.18.x
```

---

### Dependencias nativas por plataforma

La app incluye `better-sqlite3`, un módulo nativo que puede requerir compilación C++. Instala las herramientas de tu sistema **antes** de ejecutar `yarn install`.

#### macOS
```bash
xcode-select --install
```

#### Windows
Instala **Visual Studio Build Tools 2022** desde Microsoft:
1. Descarga desde: https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. En el instalador, selecciona el workload **"Desarrollo de escritorio con C++"**
3. Reinicia PowerShell o CMD después de instalar

> El comando `npm install --global windows-build-tools` está **deprecado** desde 2019 y no debe usarse.

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get install python3 make g++ libsqlite3-dev
```

#### Linux (Fedora/RHEL)
```bash
sudo dnf install python3 gcc-c++ make sqlite-devel
```

#### Linux (Arch)
```bash
sudo pacman -S base-devel sqlite
```

---

### Instalación Paso a Paso (macOS, Linux y Windows)

Los comandos son los mismos en Terminal (macOS/Linux) y en PowerShell (Windows):

```bash
# 1. Clonar el repositorio
git clone https://github.com/svaeinki/Napoli.git
cd Napoli

# 2. Activar Yarn (solo la primera vez)
corepack enable

# 3. Instalar dependencias
yarn install

# 4. Compilar módulos nativos para Electron (CRUCIAL para SQLite)
yarn run rebuild

# 5. Iniciar la aplicación
yarn start
```

> En Windows, si el paso 4 falla, verifica que Visual Studio Build Tools esté instalado.

### Ejecutar los tests

```bash
yarn test
```

---

### Configuración Opcional — Dropbox

La integración con Dropbox es **completamente opcional** y se configura desde dentro de la aplicación:

1. Abre la app y ve a la pestaña **Backups**.
2. Crea una app en la [Dropbox App Console](https://www.dropbox.com/developers/apps) (Scoped access, Full Dropbox, permisos `files.content.write` y `files.content.read`) y pega su **App key**.
3. Pulsa **Abrir autorización**: Dropbox se abre en el navegador, autoriza y pega el código que te muestra.
4. La app guarda un *refresh token* **cifrado** en el directorio de datos del usuario y renueva el acceso sola (OAuth 2 con PKCE, sin *client secret*).

Los tokens que entrega la App Console ("Generated access token") expiran a las ~4 horas; por eso ya no se usan. Si una instalación antigua tiene uno guardado, sigue funcionando hasta que expire y la app pide reconectar.

Comportamiento de seguridad:
- Si `safeStorage` está disponible, el token se guarda cifrado.
- Si `safeStorage` no está disponible en ese sistema, la app muestra una advertencia explícita y guarda el token sin cifrar en ese equipo.
- En ese caso, se registra una decisión operativa en `config.json` bajo `operationalDecisions` para trazabilidad.

No requiere variables de entorno ni archivos `.env`.

---

### Datos de la Aplicación

La base de datos SQLite se crea **automáticamente** en el primer arranque. Todo se guarda en el directorio de datos del usuario:

| Sistema | Directorio |
|---------|-----------|
| macOS   | `~/Library/Application Support/Napoli Reparadora/` |
| Windows | `%APPDATA%\Napoli Reparadora\` |
| Linux   | `~/.config/Napoli Reparadora/` |

Dentro de ese directorio:
- `napoli.db` — base de datos
- `config.json` — configuración (impresora, Dropbox, etc.)
- `backups/` — backups locales

Para resetear la base de datos: cierra la app y elimina `napoli.db`. Se recreará vacía en el próximo arranque.

---

## 📦 Generar Builds por Sistema Operativo

Esta sección explica cómo empaquetar instaladores para cada SO usando `electron-builder`.

### Requisitos previos (build)

```bash
yarn install
yarn run rebuild
```

### Build para Windows (NSIS `.exe`)

```bash
yarn run build-win
```

Salida esperada: instalador `.exe` de NSIS para `x64` en `dist/`.

### Build para macOS (`.dmg`)

```bash
yarn run build-mac
```

Salida esperada: imagen de disco `.dmg` en `dist/`.

### Build para Linux (`.AppImage`)

```bash
yarn run build-linux
```

Salida esperada: instalador `.AppImage` en `dist/`.

### Build combinada (Windows + macOS + Linux)

```bash
yarn run build
```

Este script ejecuta `electron-builder --win --mac --linux`.

> Recomendación práctica: generar cada build en su SO nativo para evitar problemas de toolchain/firma y facilitar el troubleshooting.

---

### ✅ Checklist de Release (obligatorio)

Antes de publicar una versión, ejecuta:

```bash
yarn run release:check
```

Este comando valida, en orden:
1. Sintaxis JS (`check:syntax`)
2. Seguridad de dependencias de producción (`check:audit`)
3. Build del SO actual sin publicar (`check:build-current`)

Si cualquiera falla, la release no debe publicarse.

Criterio de seguridad para producción:
- El objetivo oficial es `yarn npm audit --recursive --environment production` sin vulnerabilidades de severidad alta o crítica.
- `yarn install` puede mostrar advertencias de dependencias de desarrollo; eso no bloquea la release mientras `check:audit` esté en verde.

### 🚀 Release automático por tag (GitHub Releases)

La publicación oficial se dispara al hacer push de un tag con formato `v*` (por ejemplo `v2.0.9`):

```bash
# 1. Sube la versión en package.json y haz commit
git add -A && git commit -m "release: vX.Y.Z"

# 2. Crea el tag y publícalo
git tag vX.Y.Z
git push origin main && git push origin vX.Y.Z
```

Qué hace el workflow:
1. Ejecuta un **quality gate** previo (`yarn test`, `check:syntax`, `check:audit`).
2. Build en matriz por SO nativo: Windows, macOS y Linux.
3. Genera instaladores `x64` por plataforma.
4. Publica/actualiza el GitHub Release del tag.
5. Adjunta **solo instaladores finales**:
   - `.exe` (Windows)
   - `.dmg` (macOS)
   - `.AppImage` (Linux)

Política de release:
- En GitHub Releases se publican exclusivamente instaladores finales.
- No se publican archivos de auto-update (`.yml`, `.blockmap`, `.zip`, checksums u otros auxiliares).

Política operativa actual (uso interno, 1 usuaria):
- Se permite distribución sin firma de código en esta etapa.
- Debe asumirse la advertencia de Gatekeeper/SmartScreen como comportamiento esperado.
- Si la distribución se amplía a público general, la firma/notarización pasa a ser requisito obligatorio.

---

## 🔄 Actualizar sin perder datos (recomendado)

> Estrategia actual: actualización **manual** con el instalador nuevo encima de la instalación existente (sin auto-update integrado).

### Método recomendado
1. En la app actual, ve a **💾 Backups**.
2. Crea un **📦 Crear Backup DB**.
3. Usa **🧪 Validar Backup** sobre ese `.db`.
4. (Opcional recomendado) confirma que Dropbox esté conectado.
5. Cierra completamente la app.
6. Ejecuta el instalador nuevo **encima de la instalación actual**.
7. Abre la app actualizada y verifica:
   - Que la versión cambió.
   - Que los datos siguen intactos.
8. Si algo falla, usa el flujo de recuperación en instalación limpia descrito abajo.

### Recuperación en instalación limpia
1. Instala la app nueva.
2. Abre **💾 Backups**.
3. Usa **📂 Seleccionar Backup** y elige un `.db`.
4. Ejecuta **🧪 Validar Backup**.
5. Ejecuta **♻️ Restaurar Backup**.

> La restauración crea un snapshot previo (`napoli_pre_restore_*.db`) y aplica rollback automático si algo falla.

### Importante
- El formato oficial de recuperación completa es el **backup `.db`**.
- **JSON / CSV / Excel** sirven para exportar datos, pero **no** reemplazan una restauración completa de la app.

---

## 🔧 Troubleshooting

### Error `better-sqlite3` al instalar o al arrancar
```
Error: The module '.../better_sqlite3.node' was compiled against a different Node.js version
```
**Solución:** ejecuta `yarn run rebuild` para recompilar el módulo nativo para la versión de Electron instalada.

> Usa `yarn run rebuild` (con `run`). El comando integrado `yarn rebuild` es otra cosa: recompila contra Node, no contra Electron, y no soluciona este error.

### `This project is configured to use yarn`
Aparece si intentas usar `pnpm` u otra versión de Yarn: `package.json` fija Yarn 4.18.1. Ejecuta `corepack enable` y usa `yarn`. Si por error corriste `npm install`, borra `node_modules/` y `package-lock.json` y vuelve a ejecutar `yarn install`.

### Advertencia de seguridad en macOS al abrir el instalador
macOS muestra una advertencia porque la app no está firmada con un certificado de Apple Developer Program. Para abrirla de todos modos:
1. Intenta abrir el `.dmg` normalmente — aparece el error.
2. Ve a **Ajustes del Sistema → Privacidad y Seguridad** y busca la opción para abrir la app igualmente.

### Windows SmartScreen bloquea el instalador `.exe`
SmartScreen advierte sobre apps sin firma de código. Haz clic en **"Más información" → "Ejecutar de todos modos"**. Este comportamiento es normal para distribución sin firma digital.

### Error `node-gyp` en Windows
```
gyp ERR! build error
```
**Solución:** verifica que **Visual Studio Build Tools 2022** esté instalado correctamente con el workload "Desarrollo de escritorio con C++". Consulta la sección [Dependencias nativas por plataforma](#dependencias-nativas-por-plataforma).

---

## 📚 Guía de Uso Rápida

### Configurar Impresora ⚙️
1. Click en el icono de engranaje (arriba a la derecha).
2. Selecciona el ancho de tu papel (58mm estándar o 80mm ancho).
3. Si usas 58mm, elige el tamaño de letra: Compacto / Legible / Extra grande.
4. Personaliza el texto del encabezado y pie de página.
5. Dale a "Guardar".

### Ingresar Nuevo Artículo
1. Click en **"➕ Ingresar Artículo"**.
2. Completa los datos (el RUT se valida automáticamente).
3. `Ubicación` es opcional.
4. Click en **"💾 Guardar e Imprimir Ticket"**.
5. ¡Listo! Se imprimirá el ticket con el perfil seleccionado.

---

## 🏗️ Arquitectura y Estructura del Proyecto

```
Napoli/
├── main.js                      # Proceso principal: handlers IPC, archivos, config, backups, Dropbox
├── src/
│   ├── preload.js               # Puente seguro: expone window.electronAPI al renderer
│   ├── db-service.js            # Orquestador de DB: worker thread con respaldo en modo directo
│   ├── db-worker.js             # Worker thread dueño de la conexión SQLite
│   ├── database.js              # Wrapper de better-sqlite3: esquema, migraciones y consultas
│   ├── dropbox.js               # Integración con Dropbox (opcional)
│   ├── chile-date.js            # Fechas en formato chileno
│   ├── navigation-security.js   # Lista permitida de URLs externas (solo dropbox.com)
│   ├── sqlite-restore-utils.js  # Restauración atómica y snapshot previo
│   ├── backup-filename.js       # Nombres únicos para archivos de backup
│   ├── diagnostics.js           # Registro de eventos de diagnóstico
│   ├── index.html               # Estructura principal del renderer
│   ├── html/
│   │   ├── tab-*.html           # Contenido de cada pestaña (se carga al iniciar)
│   │   ├── modal-*.html         # Modales (configuración, pagos, ticket, confirmación)
│   │   └── ticket.html          # Template base del ticket
│   ├── js/                      # Módulos del renderer (inventario, búsqueda, pagos, tickets, ...)
│   ├── css/
│   │   ├── styles.css           # Estilos de la interfaz
│   │   └── ticket.css           # Estilos de impresión térmica
│   └── assets/                  # Logo
├── scripts/
│   ├── tests/                   # Suites de node:test
│   ├── check-syntax.js          # Verificación de sintaxis
│   ├── check-build-current.js   # Build del SO actual sin publicar
│   └── start-electron.js        # Arranque en desarrollo
├── build/                       # Iconos de la app
├── .github/workflows/           # Workflow de release por tag
└── package.json
```

Toda la comunicación entre el renderer y el proceso principal pasa por canales IPC expuestos en `preload.js`. Cada handler devuelve `{ success, data? }` o `{ success: false, error, code? }` (nunca lanza excepciones) y se bloquea de inmediato durante una restauración de la base de datos, para que ninguna acción de la interfaz pueda corromperla.

---

## 🧠 Decisiones Técnicas

- **`better-sqlite3` en lugar de un ORM.** Para una app de escritorio de un solo negocio, SQLite es el motor adecuado. `better-sqlite3` es síncrono, transaccional y no requiere configuración. Las migraciones son `ALTER TABLE` idempotentes y todas las consultas usan sentencias preparadas.
- **Base de datos en un *worker thread* con respaldo.** `DBService` ejecuta la base de datos en un worker para que las consultas lentas no congelen la interfaz. Si el worker no arranca o falla, cambia de forma transparente a acceso directo en el proceso principal.
- **Dropbox en vez de un backend propio.** La dueña del local ya usa Dropbox. Un backend propio implicaría hosting, autenticación y costos mensuales para algo que ya está resuelto. La app habla directamente con Dropbox, sin servidores intermedios.
- **JavaScript sin bundler.** Son una docena de pantallas y una usuaria. Módulos pequeños cargados en orden fijo bastan, sin pasos de build ni dependencias extra.
- **Restauración protegida.** Restaurar un backup es la acción más riesgosa: primero se valida el archivo, luego se toma un snapshot de la base actual, se reemplaza de forma atómica y se verifica el resultado. Si algo falla, se vuelve al snapshot.

---

## 🔒 Privacidad y Manejo de Datos

- **Todo queda en el equipo de la usuaria.** La base de datos, la configuración y los backups locales viven en el directorio de datos del sistema operativo. Nada se envía ni se incluye en el instalador.
- **Sin telemetría.** La app no hace llamadas de red salvo que se configure Dropbox.
- **Dropbox es opcional.** La usuaria autoriza su propia app de Dropbox y el *refresh token* se guarda localmente.
- **Sin datos de clientes en este repositorio.** El código es genérico: esquemas, validadores e interfaz.
- **Protección contra inyección SQL, XSS y navegación.** Todas las consultas usan sentencias preparadas, todo valor insertado en `innerHTML` pasa por `escaparHtml()` y la navegación externa está restringida a una lista permitida (`src/navigation-security.js`).

Para reportar vulnerabilidades, consulta [`SECURITY.md`](./SECURITY.md).

---

## 📈 Estado del Proyecto

- **En producción.** Versión actual **2.0.9**, en uso diario en una reparadora de calzado en Chile desde **noviembre de 2025**.
- En mantenimiento activo. Las mejoras se guían por las necesidades reales del mostrador.

---

## 📝 Changelog

El historial oficial de versiones está en [`CHANGELOG.md`](./CHANGELOG.md). Resumen en español:

### Sin publicar
- 📦 Gestor de paquetes migrado a **Yarn 4** (vía Corepack, con `nodeLinker: node-modules`).
- 🛡️ Dependencias de build actualizadas (`node-gyp` 11, `image-size` 2) para dejar `check:audit` sin vulnerabilidades altas o críticas.
- 📘 README en español como documento principal; versión en inglés en `README.en.md`.

### v2.0.9
- 🧹 Limpieza y refactorización en las capas de base de datos, backups e IPC.
- 🛡️ Validaciones de release y flujo de seguridad de dependencias reforzados.
- 🖨️ Ticket 58mm: corrección del margen superior y de la compensación de recorte.

### v2.0.8 (2026-02-28)
- ✅ Workflow de release endurecido con quality gate previo (`test`, `check:syntax`, `check:audit`) antes de compilar instaladores.
- 🧪 Nuevo check portable local: `check:build-current`, y `release:check` actualizado para no depender de cross-build de Windows desde macOS/Linux.
- 🔧 Limpieza de tooling de rebuild: `postinstall`/`rebuild` migrados a `electron-builder install-app-deps` y remoción de `electron-rebuild` legacy.
- 🛡️ Criterio de seguridad formalizado para producción: gate por `npm audit --omit=dev` (runtime).
- 🔐 Política explícita para Dropbox sin cifrado local: advertencia visible + registro de decisión operativa en `config.json`.
- 📘 Documentación de política de firma actualizada para escenario interno de una usuaria.

### v2.0.6 (2026-02-23)
- 🛠️ Corrección del runner macOS en CI para releases: de `macos-13` a `macos-15-intel` (`x64`).
- ✅ Se mantiene el objetivo de publicar solo instaladores finales por SO en GitHub Releases.

### v2.0.5 (2026-02-23)
- 🚀 Nuevo workflow de GitHub Actions para releases por tag `v*` con build en matriz Windows/macOS/Linux.
- 📦 Soporte oficial de instalador Linux (`.AppImage`) en `x64`.
- 🧼 Publicación de GitHub Release restringida a instaladores finales (`.exe`, `.dmg`, `.AppImage`) excluyendo artefactos auxiliares.
- 🧾 Scripts de build actualizados: `build` ahora compila `win + mac + linux` y se agrega `build-linux`.

### v2.0.4 (2026-02-22)
- 🖨️ Corrección robusta de recorte en tickets 58mm con márgenes de impresión forzados a `none`.
- 📏 Nuevo ajuste calibrable de ancho útil 58mm (`44` a `54` mm, default `48` mm).
- 🔁 API de impresión mejorada: `window.electronAPI.imprimir(opciones?)` retorna estado `{ success, error }`.
- 🧾 Mejoras de wrapping en contenido largo para evitar cortes visuales en detalle/pie de ticket.

### v2.0.3 (2026-02-22)
- 🔄 Flujo formalizado de actualización manual en Windows con instalador NSIS (in-place update).
- ✅ Guía de actualización reforzada: backup `.db`, cierre de app, instalación encima, verificación post-update y recuperación limpia.

### v2.0.2 (2026-02-22)
- 🖨️ Perfiles tipográficos para tickets 58mm: `compacto`, `legible` y `extra_grande`.
- 📄 Tickets sin QR (flujo simplificado de impresión).
- 📍 Ubicación opcional en inventario.

### v2.0.1 (2026-02-22)
- 🔒 Migración de exportación Excel a `excel4node` para eliminar vulnerabilidades HIGH/CRITICAL en dependencias runtime.
- 🛡️ Fail-fast en IPC `db:*` y `pago:*` durante restauración de DB para evitar errores por concurrencia.
- ✅ Nuevo gate de release: `check:syntax`, `check:audit`, `check:build-win` y `release:check`.

### v2.0.0
- ✨ Sistema de tema claro/oscuro
- ✨ Validación de RUT chileno
- ✨ Sistema completo de pagos y abonos
- ✨ Migración a SQLite
- ✨ Backups en Dropbox

---

## 📄 Licencia

MIT — ver [`LICENSE`](./LICENSE).

---

## 📬 Contacto

**Diego Moreno** — [github.com/svaeinki](https://github.com/svaeinki)

---

**Napoli - Reparadora de Calzado**
**Hecho con ❤️ en Chile 🇨🇱**
