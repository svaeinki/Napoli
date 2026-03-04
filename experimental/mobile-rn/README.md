# React Native Mobile Scaffold (Experimental)

Este modulo es un scaffold inicial para validar la fase movil del plan.

## Alcance actual

- Login contra backend experimental (`/auth/login`)
- Estructura de pantallas base:
  - Listado
  - Busqueda
  - Ingreso
- Base SQLite local para cola offline (`pending_ops`) y cursor de sync

## Pendiente en siguientes iteraciones

- Modelo local completo de articulos/abonos
- Motor de sync pull/push en background
- Pantalla detalle y registro de abonos
- Manejo de conflictos y estado de sincronizacion
