# 👞 Napoli - Reparadora de Calzado

Sistema profesional de gestión de bodega para reparadora de calzado con base de datos SQLite, backups automáticos en Dropbox, sistema completo de pagos y abonos, tickets térmicos con QR y tema oscuro.

![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

---

## ✨ Características Principales

### 📦 Gestión de Inventario
- ✅ Registro completo de artículos y servicios de reparación
- ✅ Múltiples tipos de servicio (cambio suela, taco, costura, teñido, limpieza, etc.)
- ✅ Asignación automática de números de bodega
- ✅ Estados: "En Bodega" / "Entregado"
- ✅ Búsqueda avanzada por RUT, nombre, número de bodega
- ✅ Filtros por estado
- ✅ Exportación a CSV
- ✅ Contador de días en bodega con alertas visuales

### 🖨️ Tickets Térmicos & QR (¡Nuevo!)
- ✅ **Soporte Impresoras Térmicas**: Configurable para 58mm y 80mm.
- ✅ **Códigos QR**: Cada ticket incluye un QR único para escaneo rápido.
- ✅ **Diseño Profesional**: Formato tipo "receipt" optimizado para ahorro de papel.
- ✅ **Configurable**: Posibilidad de personalizar encabezado y pie de página desde la app.

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

## 🔄 Actualizar sin perder datos (recomendado)

### Método recomendado
1. En la app actual, ve a **💾 Backups**.
2. Crea un **📦 Crear Backup DB**.
3. Usa **🧪 Validar Backup** sobre ese `.db`.
4. (Opcional recomendado) confirma que Dropbox esté conectado.
5. Instala la nueva versión **encima de la actual**.

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
3. Personaliza el texto del encabezado (ej: Dirección, redes sociales).
4. Dale a "Guardar".

### Ingresar Nuevo Artículo
1. Click en **"➕ Ingresar Artículo"**.
2. Completa los datos (RUT se valida automáticamente).
3. Click en **"💾 Guardar e Imprimir Ticket"**.
4. ¡Listo! Se imprimirá el ticket con QR.

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
│   │   ├── tickets.js           # Lógica de tickets y QR
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

### v2.1.0 (2024-12-06)
- ✨ **Tickets Térmicos**: Soporte nativo para impresión térmica (58mm/80mm).
- ✨ **Códigos QR**: Identificación rápida de pedidos mediante QR.
- ✨ **Panel de Configuración**: Interfaz para ajustar parámetros de impresión.
- 🔧 **Refactorización**: Modularización de la lógica de tickets (`tickets.js`).

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
