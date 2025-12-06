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

### 🌙 Tema Oscuro
- ✅ Toggle para cambiar entre tema claro y oscuro
- ✅ Preferencia guardada automáticamente

---

## 🚀 Instalación y Ejecución

Sigue las instrucciones específicas para tu sistema operativo para evitar problemas comunes de compilación.

### Requisitos Previos Generales
- **Node.js**: Versión 16 o superior.
- **Git**: Para clonar el repositorio.

---

###  Para Mac (macOS)

#### 1. Requisitos Previos
Asegúrate de tener instaladas las herramientas de línea de comandos de Xcode:
```bash
xcode-select --install
```

#### 2. Instalación Paso a Paso
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

#### 1. Requisitos Previos
- **PowerShell** (Recomendado) o CMD.
- **Herramientas de compilación de Windows**: Si tienes errores al instalar, es posible que necesites instalar las herramientas de compilación de Visual Studio. Puedes instalarlas ejecutando este comando en PowerShell como **Administrador**:
  ```powershell
  npm install --global --production windows-build-tools
  ```
  *(Nota: Esto puede tardar varios minutos)*

#### 2. Instalación Paso a Paso

```powershell
# 1. Clonar el repositorio
git clone https://github.com/svaeinki/Napoli.git
cd Napoli/zapateria-bodega

# 2. Instalar dependencias
npm install

# 3. Compilar módulos nativos
# Si este paso falla, asegúrate de tener los requisitos previos arriba mencionados.
npm run rebuild

# 4. Iniciar la aplicación
npm start
```

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
