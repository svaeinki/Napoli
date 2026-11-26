# Registro de cambios

Todos los cambios relevantes de Napoli se documentan en este archivo.

El formato se basa a grandes rasgos en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y el proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Agregado
- Se incluye la fuente variable **Archivo** (`src/renderer/assets/fonts/`, SIL OFL 1.1),
  cargada localmente con `@font-face`, así que la CSP no cambia y funciona sin conexión.

### Cambiado
- **Reorganización del código por proceso** (sin cambios de comportamiento):
  - El código quedó separado en `src/main/` (proceso principal), `src/preload/` y
    `src/renderer/` (interfaz).
  - `main.js` (~1.850 líneas) se dividió en módulos por tema dentro de `src/main/`:
    ciclo de vida, ventana, rutas, estado compartido, utilidades, configuración,
    respaldos, restauración, exportaciones y sesión de Dropbox.
  - Los handlers IPC quedaron en `src/main/ipc/`, uno por área.
  - `main.js` quedó como un punto de entrada corto.
  - El harness de tests ahora carga cada módulo del proceso principal dentro del
    sandbox `vm`, con una caché propia por test.
- **Rediseño visual de toda la interfaz** (solo estilos y marcado: sin cambios de
  comportamiento, textos, IDs, handlers `onclick`, JS, backend ni datos):
  - Nuevos tokens de diseño en `styles.css` para los temas claro y oscuro: fondo piedra
    neutro, superficies blancas, texto tinta, y el burdeos de Napoli reservado para la
    acción principal y la pestaña activa.
  - Tipografía: Archivo condensada para títulos de página, pestañas y cifras; ancho
    normal para formularios y tablas; números tabulares para montos, RUT y fechas.
  - Motivo de "pespunte": el logo va sobre una etiqueta pespunteada, la pestaña activa
    tiene una tira de cuero con costura, y líneas de puntada separan secciones y
    encabezados de modales.
  - Barra de encabezado compacta (logo recortado, configuración y tema como botones de
    ícono) y pestañas alineadas a la izquierda con subrayado.
  - Botones: principal burdeos relleno, secundario/info con contorno, y
    éxito/advertencia/peligro tintados que se vuelven sólidos al pasar el cursor; se
    mantienen los estados de carga y deshabilitado.
  - Formularios: campos de 40 px con anillo de foco visible, flecha de select
    personalizada, estados más claros de RUT válido/inválido y de error en línea.
  - Tablas de inventario y búsqueda: encabezado claro fijo, insignias de estado tipo
    píldora con punto, franja lateral de color en filas de alerta, columnas de RUT y
    fecha sin salto de línea, y columna **Acciones** fija a la derecha cuando la tabla
    se desplaza horizontalmente. La insignia "En Bodega" ahora es azul (antes era ámbar,
    igual que "Abonado").
  - Estadísticas del inventario en un solo panel dividido; pestaña Backups en dos
    columnas (una sola en ventanas angostas).
  - Modales (pagos, confirmación, configuración, vista previa del ticket) con estilo
    nuevo; el `<style>` en línea del modal de configuración pasó a `styles.css`.
  - Los estilos en línea de los templates pasaron a clases (solo quedan los cambios de
    `display` controlados por JS).
  - Respeta `prefers-reduced-motion`.
- La impresión del ticket térmico y su vista previa no se tocaron a propósito: las
  nuevas reglas de títulos y texto se limitan a la interfaz, así que el resultado de
  `ticket.css` no cambia.
- El gestor de paquetes migró a Yarn 4 (mediante Corepack, `nodeLinker: node-modules`);
  la CI ahora instala con `yarn install --immutable`.
- El README en español ahora es el principal (`README.md`); el inglés pasó a `README.en.md`.

### Seguridad
- Se subió `node-gyp` (usado al compilar) a v11 (con `tar` parchado) y se forzó
  `image-size` v2, eliminando todos los hallazgos altos y críticos de `check:audit`.
  `excel4node` está parchado para usar la API de `image-size` v2.

## [2.0.9] — 2026

### Cambiado
- Limpieza y refactorización de las capas de base de datos, backups e IPC tras una
  revisión de código.
- Controles de release más estrictos y flujo de seguridad de dependencias reforzado.

### Corregido
- Correcciones críticas de errores y de seguridad reunidas antes del despliegue en
  producción.
- Ticket térmico de 58 mm: se corrigió el tamaño del margen superior inicial y la
  compensación del recorte.

## [2.0.8] — 2026

### Cambiado
- Capa de base de datos reforzada para estabilidad en producción: respaldo del worker
  thread, límites de transacción explícitos y corte inmediato de los IPC durante una
  restauración.

## [2.0.6] — 2026

### Cambiado
- CI: se cambió a un runner de macOS soportado para el flujo de release.

## [2.0.5] — 2026

### Cambiado
- CI: el pipeline de release ahora publica solo los instaladores (`.exe`, `.dmg`,
  `.AppImage`), sin canal de actualización automática.

## [2.0.4] — 2026

### Corregido
- Se calibró el ancho del ticket térmico de 58 mm para que los rollos angostos se
  impriman bien.

## [2.0.3] — 2025

### Agregado
- Modal de vista previa del ticket.
- Búsqueda por ID de artículo (además de RUT, nombre y ubicación).
- Íconos de la aplicación para todas las plataformas.
- Script `rebuild` e instrucciones de instalación por sistema operativo en el README.
- Generación configurable de tickets con soporte de código QR.

### Cambiado
- Paleta de la interfaz renovada para los temas claro y oscuro; mejor contraste del
  logo en modo oscuro.
- Color principal cambiado a rojo; se agregó el logo al encabezado.
- Estructura del proyecto aplanada: se eliminó el subdirectorio `zapateria-bodega/`.
- `better-sqlite3` actualizado a v12; se agregó un override de `node-gyp`.
- Arquitectura x64 configurada explícitamente para el instalador NSIS de Windows.

### Seguridad
- Correcciones de robustez y estabilidad en todo el código (escape de HTML en los
  tickets, sentencias preparadas verificadas en todas partes).

## [2.0.0] — 2025

### Agregado
- Migración inicial a SQLite con escrituras transaccionales y backups robustos.
- Integración con Dropbox para sincronizar backups en la nube (opcional).
- Sistema de pagos y abonos con historial completo.
- Impresión de tickets térmicos (58 mm / 80 mm) con perfiles de fuente configurables.
- Validación de RUT chileno (dígito verificador módulo 11).
- Tema oscuro.

[Sin publicar]: https://github.com/svaeinki/Napoli/compare/v2.0.9...HEAD
[2.0.9]: https://github.com/svaeinki/Napoli/releases/tag/v2.0.9
[2.0.8]: https://github.com/svaeinki/Napoli/commits/main
[2.0.6]: https://github.com/svaeinki/Napoli/releases/tag/v2.0.6
[2.0.5]: https://github.com/svaeinki/Napoli/commits/main
[2.0.4]: https://github.com/svaeinki/Napoli/releases/tag/v2.0.4
[2.0.3]: https://github.com/svaeinki/Napoli/releases/tag/v2.0.3
[2.0.0]: https://github.com/svaeinki/Napoli/commits/main
