# Napoli - Proyectos

Repositorio de proyectos y aplicaciones desarrolladas.

## 📂 Proyectos incluidos

### 🥾 Zapatería Bodega

Sistema de gestión de inventario para zapatería con impresión de tickets.

**Ubicación:** `/zapateria-bodega`

**Características:**
- Ingreso de artículos (zapatos, bolsos, carteras, etc.)
- Impresión automática de tickets
- Control de inventario en tiempo real
- Búsqueda por RUT, nombre, ubicación
- Exportación a CSV
- Gestión de entregas

**Tecnologías:** Electron, HTML/CSS/JavaScript

---

## 🚀 Instalación del proyecto Zapatería Bodega

### Requisitos previos
- Node.js (versión 18 o superior)
- npm

### Pasos de instalación

1. **Clonar el repositorio:**
```bash
git clone https://github.com/svaeinki/Napoli.git
cd Napoli/zapateria-bodega
```

2. **Instalar dependencias:**
```bash
npm install
```

3. **Ejecutar en modo desarrollo:**
```bash
npm start
```

---

## 📦 Crear ejecutable

### Para Mac:
```bash
cd zapateria-bodega
npm run build-mac
```

El archivo `.dmg` se creará en la carpeta `dist/`

### Para Windows:
```bash
cd zapateria-bodega
npm run build-win
```

El instalador `.exe` se creará en la carpeta `dist/`

**Nota:** Para compilar ejecutables de Windows desde Mac, necesitas tener Wine instalado.

---

## 📱 Uso de la aplicación

### Ingresar artículos
1. Ir a la pestaña **"Ingresar Artículo"**
2. Llenar el formulario con los datos del cliente y artículo
3. Click en **"Guardar e Imprimir Ticket"**
4. El ticket se imprimirá automáticamente

### Ver inventario
1. Ir a la pestaña **"Inventario"**
2. Ver estadísticas en tiempo real
3. Filtrar por estado (En Bodega / Entregados)
4. Marcar artículos como entregados con el botón verde ✓
5. Reimprimir tickets con el botón azul 🖨
6. Exportar datos a CSV

### Buscar artículos
1. Ir a la pestaña **"Buscar"**
2. Escribir RUT, nombre, número de bodega o cualquier término
3. Los resultados se filtran en tiempo real

---

## 🗂️ Estructura del proyecto
```
napoli/
├── README.md
├── .gitignore
└── zapateria-bodega/
    ├── main.js              # Archivo principal de Electron
    ├── package.json         # Configuración y dependencias
    └── src/
        └── index.html       # Interfaz de la aplicación
```

---

## 🛠️ Tecnologías utilizadas

- **Electron** - Framework para crear aplicaciones de escritorio
- **HTML/CSS/JavaScript** - Frontend
- **LocalStorage** - Almacenamiento de datos local

---

## 📝 Notas importantes

- Los datos se guardan localmente en el navegador (LocalStorage)
- No requiere conexión a internet para funcionar
- Los tickets se imprimen usando el sistema de impresión del navegador
- Compatible con Windows, Mac y Linux

---

## 👨‍💻 Desarrollo

Para contribuir o hacer mejoras:

1. Fork el repositorio
2. Crea una rama para tu feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit tus cambios: `git commit -m 'Agregar nueva funcionalidad'`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

---

## 🐛 Reportar problemas

Si encuentras algún bug o tienes sugerencias, por favor abre un [Issue](https://github.com/svaeinki/Napoli/issues).

---

## 📄 Licencia

MIT License - Libre para usar y modificar.

---

## 📧 Contacto

Para consultas o soporte, contactar al desarrollador.