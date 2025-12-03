# 🥾 Sistema de Bodega - Zapatería

Sistema profesional de gestión de bodega para zapaterías con base de datos SQLite, backups automáticos en Dropbox y sistema completo de pagos y abonos.

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

---

## ✨ Características Principales

### 📦 Gestión de Inventario
- ✅ Registro completo de artículos (zapatos, bolsos, carteras, etc.)
- ✅ Asignación automática de números de bodega
- ✅ Estados: "En Bodega" / "Entregado"
- ✅ Búsqueda avanzada por RUT, nombre, número de bodega
- ✅ Filtros por estado
- ✅ Exportación a CSV

### 💰 Sistema de Pagos y Abonos
- ✅ Registro de valor total del servicio
- ✅ Abonos parciales con historial completo
- ✅ Cálculo automático de saldo pendiente
- ✅ Estados de pago: Sin pago / Abonado / Pagado
- ✅ Múltiples métodos de pago (Efectivo, Tarjetas, Transferencia)
- ✅ Historial detallado de cada abono
- ✅ Tickets con desglose de pagos

### 🖨️ Impresión de Tickets
- ✅ Impresión automática al ingresar artículo
- ✅ Reimpresión en cualquier momento
- ✅ Información completa del cliente y artículo
- ✅ Desglose de pagos si aplica

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
   - RUT del cliente
   - Nombre completo
   - Teléfono (opcional)
   - Tipo de artículo
   - Descripción detallada
   - Número de bodega (único)
   - Valor del servicio (opcional)
   - Observaciones (opcional)
3. Click en **"💾 Guardar e Imprimir Ticket"**
4. El ticket se imprime automáticamente

### 2. Gestionar Pagos

1. Ve a **"📦 Inventario"**
2. Busca el artículo
3. Click en **"💰 Pagos"**
4. En el modal puedes:
   - Ver el estado actual de pagos
   - Actualizar el valor total
   - Registrar abonos parciales
   - Ver historial completo de abonos

### 3. Entregar Artículo

1. Ve a **"📦 Inventario"**
2. Busca el artículo
3. Click en **"✓ Entregar"**
4. Confirma la entrega

### 4. Buscar Artículos

1. Ve a **"🔍 Buscar"**
2. Ingresa cualquiera de:
   - RUT del cliente
   - Nombre del cliente
   - Número de bodega
   - Tipo de artículo
3. Los resultados aparecen en tiempo real

### 5. Configurar Dropbox (Opcional)

1. Ve a **"💾 Backups"**
2. Sigue las instrucciones para obtener un token
3. Pega el token y click en **"🔗 Conectar"**
4. Los backups se subirán automáticamente

---

## 🏗️ Estructura del Proyecto
```
zapateria-bodega/
├── src/
│   ├── css/
│   │   └── styles.css          # Estilos de la aplicación
│   ├── js/
│   │   └── renderer.js         # Lógica del frontend
│   ├── database.js             # Gestión de SQLite
│   ├── dropbox.js              # Integración con Dropbox
│   ├── preload.js              # Puente seguro Electron
│   └── index.html              # Interfaz de usuario
├── main.js                      # Proceso principal de Electron
├── package.json                 # Dependencias y scripts
└── README.md                    # Este archivo
```

---

## 💾 Ubicación de los Datos

### macOS
```
Base de datos:
~/Library/Application Support/zapateria-bodega/zapateria.db

Backups:
~/Library/Application Support/zapateria-bodega/backups/

Configuración:
~/Library/Application Support/zapateria-bodega/config.json
```

### Windows
```
Base de datos:
C:\Users\TuUsuario\AppData\Roaming\zapateria-bodega\zapateria.db

Backups:
C:\Users\TuUsuario\AppData\Roaming\zapateria-bodega\backups\

Configuración:
C:\Users\TuUsuario\AppData\Roaming\zapateria-bodega\config.json
```

### Linux
```
Base de datos:
~/.config/zapateria-bodega/zapateria.db

Backups:
~/.config/zapateria-bodega/backups/

Configuración:
~/.config/zapateria-bodega/config.json
```

---

## 📦 Crear Ejecutables

### Para macOS
```bash
npm run build-mac
```
Genera: `dist/Sistema de Bodega.dmg`

### Para Windows
```bash
npm run build-win
```
Genera: `dist/Sistema de Bodega Setup.exe`

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
- **HTML/CSS/JavaScript** - Frontend

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
- macOS: `~/Library/Application Support/zapateria-bodega/`
- Windows: `C:\Users\TuUsuario\AppData\Roaming\zapateria-bodega\`

### Dropbox no conecta

**Solución:**
1. Verifica tu conexión a internet
2. Regenera el token en Dropbox App Console
3. Asegúrate de haber activado los permisos correctos

---

## 📈 Roadmap / Mejoras Futuras

- [ ] Validación de RUT chileno
- [ ] Notificaciones de artículos con +30 días en bodega
- [ ] Exportación a Excel
- [ ] Códigos QR en tickets
- [ ] Dashboard con gráficos estadísticos
- [ ] Multi-usuario con roles y permisos
- [ ] Versión móvil (Android/iOS) con Capacitor
- [ ] Sincronización en tiempo real entre dispositivos
- [ ] Sistema de reportes avanzados
- [ ] Integración con impresoras térmicas

---

## 📝 Changelog

### v2.0.0 (2024-12-03)
- ✨ Sistema completo de pagos y abonos
- ✨ Migración de LocalStorage a SQLite
- ✨ Integración con Dropbox para backups
- ✨ Código reorganizado (CSS, JS, HTML separados)
- ✨ Sistema de auditoría completo
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

**¡Hecho con ❤️ en Chile 🇨🇱**