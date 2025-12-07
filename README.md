# 👞 Napoli - Reparadora de Calzado

Sistema profesional de gestión de bodega para reparadora de calzado con base de datos SQLite, backups automáticos en Dropbox, sistema completo de pagos y abonos, y tema oscuro.

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
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
- ✅ **Búsqueda por Escáner QR/Código de Barras**
- ✅ Filtros por estado
- ✅ Exportación a CSV
- ✅ Contador de días en bodega con alertas visuales

### 💰 Sistema de Pagos y Abonos
- ✅ Registro de valor total del servicio
- ✅ Abonos iniciales al ingresar artículo
- ✅ Abonos parciales con historial completo
- ✅ Cálculo automático de saldo pendiente
- ✅ Estados de pago: Sin pago / Abonado / Pagado
- ✅ Múltiples métodos de pago (Efectivo, Tarjetas, Transferencia)
- ✅ Historial detallado de cada abono
- ✅ Tickets con desglose de pagos

### 🔐 Validación y Seguridad
- ✅ Validación de RUT chileno (dígito verificador)
- ✅ Formato automático de RUT (12.345.678-9)
- ✅ Formato automático de montos ($15.000)
- ✅ Validación de duplicados

### 🖨️ Impresión y QR
- ✅ Impresión automática al ingresar artículo
- ✅ Reimpresión en cualquier momento
- ✅ **Códigos QR** únicos por ticket
- ✅ **Vista Previa** de ticket en pantalla
- ✅ Información completa del cliente y artículo
- ✅ Desglose de pagos y saldo pendiente

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
- ✅ Retención de 30 días localmente

### 🌙 Tema Oscuro
- ✅ Toggle para cambiar entre tema claro y oscuro
- ✅ Preferencia guardada automáticamente
- ✅ Diseño adaptado para ambos temas
- ✅ Transiciones suaves

---

## 🚀 Instalación

### Requisitos Previos

- **Node.js** (versión 16 o superior)
- **npm** (incluido con Node.js)
- **Git** (para clonar el repositorio)

### Pasos de Instalación

#### 1. Clonar el repositorio
```bash
git clone https://github.com/svaeinki/Napoli.git
cd Napoli/zapateria-bodega
```

#### 2. Instalar dependencias
```bash
npm install
```

#### 3. Recompilar módulos nativos
```bash
# Instalar herramienta de rebuild
npm install electron-rebuild --save-dev

# Recompilar para tu sistema operativo
npx electron-rebuild
```

#### 4. Ejecutar la aplicación
```bash
npm start
```

---

## 🖥️ Uso en Diferentes Sistemas Operativos

### macOS
```bash
cd Napoli/zapateria-bodega
npm install
npx electron-rebuild
npm start
```

### Windows
```bash
cd Napoli\zapateria-bodega
npm install
npx electron-rebuild
npm start
```

**Nota:** En Windows puede ser necesario instalar herramientas de compilación:
```bash
# Ejecutar PowerShell como Administrador
npm install --global windows-build-tools
```

### Linux
```bash
cd Napoli/zapateria-bodega
npm install
npx electron-rebuild
npm start
```

---

## 🔄 Flujo de Trabajo entre Sistemas Operativos

Si trabajas desde múltiples computadoras:
```bash
# Al cambiar de sistema operativo
git pull origin main
npx electron-rebuild  # Recompilar para el nuevo sistema
npm start
```

**Importante:** `better-sqlite3` debe recompilarse cada vez que cambias de sistema operativo.

---

## 📚 Guía de Uso

### 1. Ingresar Nuevo Artículo

1. Click en **"➕ Ingresar Artículo"**
2. Completa el formulario:
   - RUT del cliente (se valida y formatea automáticamente)
   - Nombre completo
   - Teléfono (opcional)
   - Tipo de servicio (reparación zapatos, cambio suela, etc.)
   - Descripción detallada del artículo y reparación
   - Número de bodega (único)
   - Valor del servicio (opcional, se formatea automáticamente)
   - Abono inicial (opcional)
   - Método de pago
   - Observaciones (opcional)
3. Click en **"💾 Guardar e Imprimir Ticket"**
4. El ticket se imprime automáticamente con toda la información

### 2. Gestionar Pagos

1. Ve a **"📦 Inventario"**
2. Busca el artículo
3. Click en **"💰 Pagos"**
4. En el modal puedes:
   - Ver el estado actual de pagos
   - Actualizar el valor total
   - Registrar abonos parciales
   - Ver historial completo de abonos

### 3. Cambiar Tema

1. Click en el botón **🌙** (o **☀️**) en la esquina superior derecha
2. El tema cambia instantáneamente
3. Tu preferencia se guarda automáticamente

### 4. Entregar Artículo

1. Ve a **"📦 Inventario"**
2. Busca el artículo
3. Click en **"✓ Entregar"**
4. Confirma la entrega

### 5. Buscar Artículos

1. Ve a **"🔍 Buscar"**
2. Ingresa cualquiera de:
   - RUT del cliente
   - Nombre del cliente
   - Número de bodega
   - Tipo de servicio
3. **Escáner**: Simplemente escanea el código QR del ticket en cualquier pantalla y la app buscará automáticamente.
4. Los resultados aparecen en tiempo real

### 6. Configurar Dropbox (Opcional)

1. Ve a **"💾 Backups"**
2. Sigue las instrucciones para obtener un token
3. Pega el token y click en **"🔗 Conectar"**
4. Los backups se subirán automáticamente

---

## 🏗️ Estructura del Proyecto
```
zapateria-bodega/
├── src/
│   ├── html/                    # Templates HTML modulares
│   │   ├── tab-ingresar.html
│   │   ├── tab-inventario.html
│   │   ├── tab-buscar.html
│   │   ├── tab-backup.html
│   │   ├── modal-pagos.html
│   │   └── ticket.html
│   ├── css/
│   │   └── styles.css           # Estilos con tema claro/oscuro
│   ├── js/
│   │   ├── templateLoader.js    # Cargador de templates
│   │   ├── theme.js             # Sistema de temas
│   │   ├── utils.js             # Utilidades generales
│   │   ├── validacion.js        # Validación de RUT
│   │   ├── articulos.js         # CRUD de artículos
│   │   ├── inventario.js        # Gestión de inventario
│   │   ├── pagos.js             # Sistema de pagos
│   │   ├── busqueda.js          # Búsqueda de artículos
│   │   ├── backups.js           # Backups y Dropbox
│   │   └── main.js              # Inicialización
│   ├── database.js              # Gestión de SQLite
│   ├── dropbox.js               # Integración con Dropbox
│   ├── preload.js               # Puente seguro Electron
│   └── index.html               # Estructura principal
├── main.js                      # Proceso principal de Electron
├── package.json                 # Dependencias y scripts
└── README.md                    # Este archivo
```

---

## 💾 Ubicación de los Datos

### macOS
```
Base de datos:
~/Library/Application Support/napoli-reparadora/napoli.db

Backups:
~/Library/Application Support/napoli-reparadora/backups/

Configuración:
~/Library/Application Support/napoli-reparadora/config.json
```

### Windows
```
Base de datos:
C:\Users\TuUsuario\AppData\Roaming\napoli-reparadora\napoli.db

Backups:
C:\Users\TuUsuario\AppData\Roaming\napoli-reparadora\backups\

Configuración:
C:\Users\TuUsuario\AppData\Roaming\napoli-reparadora\config.json
```

### Linux
```
Base de datos:
~/.config/napoli-reparadora/napoli.db

Backups:
~/.config/napoli-reparadora/backups/

Configuración:
~/.config/napoli-reparadora/config.json
```

---

## 📦 Crear Ejecutables

### Para macOS
```bash
npm run build-mac
```
Genera: `dist/Napoli Reparadora.dmg`

### Para Windows
```bash
npm run build-win
```
Genera: `dist/Napoli Reparadora Setup.exe`

### Para ambos (desde macOS con Wine)
```bash
npm run build
```

---

## 🛠️ Tecnologías Utilizadas

- **Electron** - Framework para aplicaciones de escritorio
- **SQLite** (better-sqlite3) - Base de datos embebida
- **Dropbox SDK** - Sincronización en la nube
- **Node.js** - Runtime de JavaScript
- **HTML/CSS/JavaScript** - Frontend modular

---

## 🔧 Scripts Disponibles
```bash
npm start          # Ejecutar en modo desarrollo
npm run build      # Crear ejecutables para todos los sistemas
npm run build-mac  # Crear ejecutable para macOS
npm run build-win  # Crear ejecutable para Windows
```

---

## 🐛 Solución de Problemas

### Error: "better-sqlite3 was compiled against a different Node.js version"

**Solución:**
```bash
npx electron-rebuild
```

### Error al instalar dependencias en Windows

**Solución:**
```bash
# Ejecutar PowerShell como Administrador
npm install --global windows-build-tools
```

### La aplicación no guarda datos

**Solución:** Verifica que tienes permisos de escritura en:
- macOS: `~/Library/Application Support/napoli-reparadora/`
- Windows: `C:\Users\TuUsuario\AppData\Roaming\napoli-reparadora\`

### Dropbox no conecta

**Solución:**
1. Verifica tu conexión a internet
2. Regenera el token en Dropbox App Console
3. Asegúrate de haber activado los permisos correctos

---

## 📈 Roadmap / Mejoras Futuras

- [x] Códigos QR en tickets
- [x] Integración con lectores de código de barras
- [ ] Reportes en PDF
- [ ] Dashboard con gráficos estadísticos
- [ ] Notificaciones por email
- [ ] Multi-usuario con roles y permisos
- [ ] Versión móvil (Android/iOS) con Capacitor
- [ ] Sincronización en tiempo real entre dispositivos
- [ ] Sistema de clientes recurrentes
- [ ] Integración con impresoras térmicas
- [ ] Exportación a Excel

---

## 📝 Changelog

### v2.1.0 (2025-12-07)
- ✨ **Códigos QR** en todos los tickets
- ✨ **Búsqueda rápida por escáner** (lector de código de barras)
- ✨ **Vista Previa** de ticket en pantalla (ideal para no gastar papel)
- ✨ Mejora en búsqueda global

### v2.0.0 (2024-12-03)
- ✨ Sistema de tema claro/oscuro
- ✨ Validación de RUT chileno
- ✨ Formateo automático de montos
- ✨ Abonos iniciales al ingresar artículo
- ✨ Alertas visuales de artículos antiguos
- ✨ Contador de días en bodega
- ✨ Código modularizado (HTML, CSS, JS separados)
- ✨ Sistema completo de pagos y abonos
- ✨ Migración de LocalStorage a SQLite
- ✨ Integración con Dropbox para backups
- ✨ Backups automáticos cada 24 horas
- 🐛 Correcciones de estabilidad

### v1.0.0 (2024-11-30)
- 🎉 Versión inicial
- ✨ Gestión básica de inventario
- ✨ Impresión de tickets
- ✨ LocalStorage como base de datos

---

## 📄 Licencia

MIT License - Libre para usar y modificar

---

## 👨‍💻 Autor

**Diego Moreno**
- GitHub: [@svaeinki](https://github.com/svaeinki)
- Estudiante de Programación Full Stack en IACC

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

---

## 📧 Soporte

Si encuentras algún bug o tienes sugerencias, por favor abre un [Issue](https://github.com/svaeinki/Napoli/issues).

---

## ⭐ Agradecimientos

Gracias a todos los que han contribuido y probado esta aplicación.

---

**Napoli - Reparadora de Calzado**  
**Hecho con ❤️ en Chile 🇨🇱**