# Política de seguridad

## Versiones soportadas

Napoli se distribuye como una aplicación de escritorio. Solo la última versión
publicada recibe correcciones de seguridad. Se recomienda usar el instalador más
reciente disponible en la página de [Releases](https://github.com/svaeinki/Napoli/releases).

| Versión | Soportada |
| ------- | :-------: |
| 2.0.x   | Sí        |
| < 2.0   | No        |

## Reportar una vulnerabilidad

Si crees haber encontrado una vulnerabilidad de seguridad en Napoli, **por favor no
abras un issue público en GitHub.** Repórtala de forma privada:

- **Correo:** diegomorenovillarroel@gmail.com
- **Asunto:** `[Napoli seguridad] <descripción breve>`

Incluye:

- Una descripción del problema y su posible impacto.
- Los pasos para reproducirlo, o una prueba de concepto si la tienes.
- La versión y el sistema operativo donde lo observaste.

Puedes esperar una primera respuesta dentro de 72 horas. Una vez confirmado el
problema, se preparará y publicará una corrección, y se dará crédito a quien lo
reportó (salvo que prefieras mantenerte anónimo).

## Alcance

Dentro del alcance:

- El código de la aplicación en este repositorio.
- Los instaladores publicados en GitHub Releases (`.exe`, `.dmg`, `.AppImage`).
- La superficie IPC expuesta al renderer mediante `src/preload/preload.js` (los
  handlers están en `src/main/ipc/`).
- El código de backups, restauración e integración con Dropbox.

Fuera del alcance:

- Los datos reales de producción del local que usa esta app: pertenecen a quien la
  opera y no forman parte de este repositorio.
- Vulnerabilidades de dependencias de terceros que ya están reportadas en su proyecto
  de origen (`yarn npm audit` se ejecuta en cada release; cuando sea posible, repórtalas
  primero allí).
- Ingeniería social, acceso físico o ataques que requieran que el atacante ya tenga
  acceso de administrador al equipo donde corre la app.

## Notas de endurecimiento

Algunos puntos útiles al revisar el código:

- Todas las consultas SQL usan sentencias preparadas con marcadores `?`; nunca se
  interpolan strings en el SQL.
- Todo valor interpolado en `innerHTML` pasa por `escaparHtml()`, en
  `src/renderer/js/utils.js`.
- La navegación a URLs externas está restringida por una lista permitida en
  `src/main/navigation-security.js`; solo se permiten dominios HTTPS de Dropbox.
- Los handlers IPC nunca lanzan excepciones (`throw`): devuelven
  `{ success, data? | error, code? }`, así que el renderer trata ese límite como una
  llamada de red.
- Las credenciales de Dropbox (si se configuran) se guardan solo en el `config.json`
  local, dentro del directorio de datos de usuario del sistema operativo. No hay
  backend.
