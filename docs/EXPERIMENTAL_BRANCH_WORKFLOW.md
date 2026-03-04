# Flujo de ramas para migración experimental

Este documento define un flujo seguro para experimentar sin tocar `main`.

## Ramas

- Rama paraguas: `experiment/rn-migration`
- Subramas de trabajo:
  - `exp/backend-api`
  - `exp/electron-sync`
  - `exp/mobile-rn`
  - `exp/migrations`

## Reglas

1. `main` se mantiene para producción actual.
2. Toda experimentación ocurre en subramas y se integra vía PR a `experiment/rn-migration`.
3. No se hace merge a `main` hasta cerrar evaluación técnica.
4. Cada 3-7 días, sincronizar `experiment/rn-migration` con `origin/main`.

## Comandos sugeridos

```bash
# crear rama paraguas desde main actualizado
git checkout main
git pull origin main
git checkout -b experiment/rn-migration

# crear subrama de fase
git checkout -b exp/backend-api

# abrir PR de subrama -> paraguas
gh pr create --base experiment/rn-migration --head exp/backend-api --draft

# sincronizar paraguas con main
git checkout experiment/rn-migration
git fetch origin
git merge origin/main
```

## PR de visibilidad (largo plazo)

Mantener un Draft PR permanente:
- Base: `main`
- Compare: `experiment/rn-migration`

Objetivo: visibilidad del avance sin intención de merge productivo inmediato.
