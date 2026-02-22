# 👞 Napoli - Reparadora de Calzado

Sistema profesional de gestión de bodega para reparadora de calzado con base de datos SQLite, backups automáticos en Dropbox, sistema completo de pagos y abonos, tickets térmicos y tema oscuro.

![Version](https://img.shields.io/badge/version-2.0.3-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

---

## ✨ Características Principales

### 📦 Gestión de Inventario
- ✅ Registro completo de artículos y servicios de reparación
- ✅ Múltiples tipos de servicio (cambio suela, taco, costura, teñido, limpieza, etc.)
- ✅ Ubicación opcional por artículo (`numeroBodega`)
- ✅ Estados: "En Bodega" / "Entregado"
- ✅ Búsqueda avanzada por RUT, nombre y ubicación
- ✅ Filtros por estado
- ✅ Exportación a CSV
- ✅ Contador de días en bodega con alertas visuales

### 🖨️ Tickets Térmicos (58mm/80mm)
- ✅ **Soporte Impresoras Térmicas**: Configurable para 58mm y 80mm.
- ✅ **Perfiles de legibilidad 58mm**: `compacto`, `legible` (recomendado), `extra_grande`.
- ✅ **Diseño Profesional**: Formato tipo "receipt" optimizado para ahorro de papel.
- ✅ **Configurable**: Posibilidad de personalizar encabezado, pie y perfil tipográfico 58mm desde la app.

### 💰 Sistema de Pagos y Abonos
- ✅ Registro de valor total del servicio
- ✅ Abonos iniciales al ingresar artículo
- ✅ Abonos parciales con historial completo
- ✅ Cálculo automático de saldo pendiente
- ✅ Estados de pago: Sin pago / Abonado / Pagado
- ✅ Múltiples métodos de pago (Efectivo, Tarjetas, Transferencia)
- ✅ Historial detallado de cada abono
- ✅ Tickets con desglose de pagos

### 💾 Base de Datos Robusta
- ✅ SQLite - Base de datos profesional
- ✅ Sin riesgo de pérdida de datos
- ✅ Transacciones ACID
- ✅ Sistema de auditoría completo
- ✅ Validación de duplicados

### ☁️ Backups Automáticos
- ✅ Backup automático cada 24 horas
- ✅ Backup al cerrar la aplicación
- ✅ Formatos: .db (SQLite) y .json
- ✅ Integración con Dropbox (opcional)
- ✅ Sincronización automática en la nube
- ✅ Validación explícita de backups `.db` antes de restaurar
- ✅ Restauración guiada con rollback automático y smoke check post-restore

### 🌙 Tema Oscuro
- ✅ Toggle para cambiar entre tema claro y oscuro
- ✅ Preferencia guardada automáticamente

---

## 🚀 Instalación y Ejecución

Sigue las instrucciones específicas para tu sistema operativo para evitar problemas comunes de compilación.

### Requisitos del Sistema

| Requisito | Versión mínima | Versión recomendada |
|-----------|---------------|---------------------|
| Node.js   | **18.x LTS**  | 20.x o 22.x LTS     |
| npm       | 8.x           | incluido con Node    |
| Git       | cualquier     | —                   |

> **Nota:** Node.js 16 ya no es compatible. Usa Node.js 18 o superior.

#### Verificar instalación

```bash
node --version   # debe ser v18.x o superior
npm --version    # debe ser v8.x o superior
```

---

### Dependencias nativas por plataforma

La app incluye `better-sqlite3`, un módulo nativo que requiere compilación C++. Instala las herramientas correspondientes a tu sistema **antes** de ejecutar `npm install`.

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

### 🍎 Para Mac (macOS)

#### Instalación Paso a Paso
Abre tu terminal y ejecuta:

```bash
# 1. Clonar el repositorio
git clone https://github.com/svaeinki/Napoli.git
cd Napoli/zapateria-bodega

# 2. Instalar dependencias
npm install

# 3. Compilar módulos nativos (CRUCIAL para SQLite)
npm run rebuild

# 4. Iniciar la aplicación
npm start
```

---

### 🪟 Para Windows

#### Instalación Paso a Paso

```powershell
# 1. Clonar el repositorio
git clone https://github.com/svaeinki/Napoli.git
cd Napoli/zapateria-bodega

# 2. Instalar dependencias
npm install

# 3. Compilar módulos nativos
# Si este paso falla, verifica que Visual Studio Build Tools esté instalado.
npm run rebuild

# 4. Iniciar la aplicación
npm start
```

---

### Configuración Opcional — Dropbox

La integración con Dropbox es **completamente opcional** y se configura desde dentro de la aplicación:

1. Abre la app y ve al panel de configuración (icono de engranaje).
2. Ingresa tu token de acceso a Dropbox.
3. La app guarda el token **encriptado** en el directorio de datos del usuario.

No requiere variables de entorno ni archivos `.env`.

---

### Base de Datos

La base de datos SQLite se crea **automáticamente** al primer arranque de la aplicación.

**Ubicación del archivo:**
- **macOS:** `~/Library/Application Support/Napoli Reparadora/napoli.db`
- **Windows:** `%APPDATA%\Napoli Reparadora\napoli.db`

Para resetear la base de datos: cierra la app y elimina el archivo `.db`. Se recreará vacía en el próximo arranque.

---

## 📦 Generar Builds por Sistema Operativo

Esta sección explica cómo empaquetar instaladores de la app para cada SO usando `electron-builder`.

### Requisitos previos (build)

```bash
npm install
npm run rebuild
```

### Build para Windows (NSIS `.exe`)

```bash
npm run build-win
```

Salida esperada:
- Archivos de instalación en `dist/` (ejemplo: `.exe` de NSIS para `x64`).

### Build para macOS (`.dmg`)

```bash
npm run build-mac
```

Salida esperada:
- Imagen de disco `.dmg` en `dist/`.

### Build combinada (macOS + Windows)

```bash
npm run build
```

Este script ejecuta:
- `electron-builder --mac --win`

> Recomendación práctica: generar cada build en su SO nativo para evitar problemas de toolchain/firma y acelerar troubleshooting.

### Validación mínima antes de build de release

```bash
npm run release:check
```

Valida:
1. Sintaxis JS
2. Auditoría de dependencias runtime
3. Build de Windows sin publicar

### Nota sobre Linux

Actualmente `package.json` no define target de empaquetado Linux (`linux`) en la configuración de `electron-builder`, por eso no hay script `build-linux`.

---

### ✅ Checklist de Release (obligatorio)

Antes de publicar una versión, ejecuta:

```bash
npm run release:check
```

Este comando valida, en orden:
1. Sintaxis JS (`check:syntax`)
2. Seguridad de dependencias runtime (`check:audit`)
3. Build de Windows (`check:build-win`)

Si cualquiera falla, la release no debe publicarse.

---

## 🔄 Actualizar sin perder datos (recomendado)

> Estrategia actual: actualización **manual** con instalador NSIS nuevo encima de la instalación existente (sin auto-update integrado).

### Método recomendado
1. En la app actual, ve a **💾 Backups**.
2. Crea un **📦 Crear Backup DB**.
3. Usa **🧪 Validar Backup** sobre ese `.db`.
4. (Opcional recomendado) confirma que Dropbox esté conectado.
5. Cierra completamente la app.
6. Ejecuta el instalador `.exe` nuevo **encima de la instalación actual**.
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
- El formato oficial de recuperación completa es **backup `.db`**.
- **JSON / CSV / Excel** sirven para exportar datos, pero **no** reemplazan una restauración completa de la app.

---

## 🔧 Troubleshooting

### Error `better-sqlite3` al instalar o al arrancar
```
Error: The module '.../better_sqlite3.node' was compiled against a different Node.js version
```
**Solución:** Ejecuta `npm run rebuild` para recompilar el módulo nativo para la versión de Electron instalada.

### Advertencia de seguridad en macOS al abrir el instalador
macOS muestra una advertencia porque la app no está firmada con un certificado de Apple Developer Program. Para abrirla de todos modos:
1. Intenta abrir el .dmg normalmente — aparece el error.
2. Ve a **Ajustes del Sistema → Privacidad y Seguridad** y busca la opción para abrir la app igualmente.

### Windows SmartScreen bloquea el instalador .exe
SmartScreen advierte sobre apps sin firma de código. Haz clic en **"Más información" → "Ejecutar de todos modos"**. Este comportamiento es normal para distribución sin firma digital.

### Error `node-gyp` en Windows
```
gyp ERR! build error
```
**Solución:** Verifica que **Visual Studio Build Tools 2022** esté instalado correctamente con el workload "Desarrollo de escritorio con C++". Consulta la sección [Dependencias nativas por plataforma](#dependencias-nativas-por-plataforma) más arriba.

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
2. Completa los datos (RUT se valida automáticamente).
3. `Ubicación` es opcional.
4. Click en **"💾 Guardar e Imprimir Ticket"**.
5. ¡Listo! Se imprimirá el ticket con el perfil seleccionado.

---

## 🏗️ Estructura del Proyecto
```
zapateria-bodega/
├── src/
│   ├── html/                    # Templates HTML
│   │   ├── modal-config.html    # Config de impresión
│   │   ├── ticket.html          # Template base
│   │   └── ...
│   ├── css/
│   │   ├── styles.css           # Estilos UI
│   │   └── ticket.css           # Estilos de impresión térmicos
│   ├── js/
│   │   ├── tickets.js           # Lógica de tickets térmicos
│   │   ├── config.js            # Lógica de configuración
│   │   └── ...
│   ├── database.js              # Gestión de SQLite
│   ├── preload.js               # Puente seguro Electron
│   └── index.html               # Estructura principal
├── main.js                      # Proceso principal
└── package.json                 # Dependencias
```

---

## 📝 Changelog

### v2.0.3 (2026-02-22)
- 🔄 Flujo formalizado de actualización manual en Windows con instalador NSIS (in-place update).
- ✅ Guía de actualización reforzada: backup `.db`, cierre de app, instalación encima, verificación post-update y recuperación limpia.
- 🧾 Versionado y documentación alineados a `2.0.3`.

### v2.0.2 (2026-02-22)
- 🖨️ Perfiles tipográficos para tickets 58mm: `compacto`, `legible` y `extra_grande`.
- 📄 Tickets sin QR (flujo simplificado de impresión).
- 🧾 Versión y documentación alineadas a `2.0.2` con ubicación opcional en inventario.

### v2.0.1 (2026-02-22)
- 🔒 Migración de exportación Excel a `excel4node` para eliminar vulnerabilidades HIGH/CRITICAL en dependencias runtime.
- 🛡️ Fail-fast en IPC `db:*` y `pago:*` durante restauración de DB para evitar errores por concurrencia.
- ✅ Nuevo gate de release: `check:syntax`, `check:audit`, `check:build-win` y `release:check`.
- 🧾 Versionado y documentación alineados a `2.0.1`.

### v2.0.0 (2024-12-03)
- ✨ Sistema de tema claro/oscuro
- ✨ Validación de RUT chileno
- ✨ Sistema completo de pagos y abonos
- ✨ Migración a SQLite
- ✨ Backups en Dropbox

---

## 📄 Licencia

MIT License - Libre para usar y modificar

---

**Napoli - Reparadora de Calzado**
**Hecho con ❤️ en Chile 🇨🇱**
