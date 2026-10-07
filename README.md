> **Copia personal.** Este repositorio es una copia de
> [GeorgeTech20/pixelforge](https://github.com/GeorgeTech20/pixelforge),
> creada por Jorge Nureña y distribuida bajo licencia MIT.
> El historial de commits y el archivo [`LICENSE`](LICENSE) originales se conservan sin cambios.
> Todo el crédito del trabajo original es de su autor.

# PixelForge

Editor de pixel art mínimo, por capas y frames, hecho con React + Canvas 2D
(Vite) y empaquetable como app de escritorio con Electron. Licencia MIT.

Estado: **alpha, en desarrollo**. Sin releases publicadas. Se usa internamente
para producir sprites de juego; puede cambiar sin aviso.

## Qué hace hoy (verificado en `apps/editor`)

- **Herramientas:** lápiz, borrador, relleno (4-conexo), línea, rectángulo
  (contorno), cuentagotas (también con Alt), espejo horizontal y vertical,
  pincel de 1 a 4 px. Color 1º/2º (clic izquierdo/derecho).
- **Capas:** nueva, duplicar, borrar, subir/bajar, visibilidad, bloqueo,
  «solo», opacidad y nombre.
- **Timeline:** frames (nuevo, duplicar, borrar), duración por frame en ms,
  tags de animación, play en bucle y papel cebolla (±1 frame).
- **Vista:** zoom entero (100 %–3200 %) sin suavizado, grilla, pan con
  Espacio, ajustar (F), modo lienzo, tema claro/oscuro.
- **Paleta:** paleta del documento editable + biblioteca PALETTE-MASTER (32
  colores) de solo lectura.
- **Archivo:** formato `.pfx.json` (capas + frames + cels + paleta),
  deshacer/rehacer, autoguardado local cada 30 s con recuperación de sesión.
- **Exportar:** spritesheet PNG + JSON (escala 1/2/4/8, vecino más cercano),
  JSON por frame para el pipeline de atlas del proyecto, y `.pfx`.

Abrir/guardar con diálogo, exportar a carpeta y la galería necesitan la shell
de Electron; en el navegador el editor dibuja, anima y autoguarda, pero no
tiene diálogos de archivo. El panel «Crear con IA» depende del backend
opcional (`apps/backend`) y de proveedores configurados; no forma parte del
editor mínimo.

## Cómo correrlo

Requisitos: Node ≥ 22.13 y pnpm ≥ 9.

```bash
pnpm install

# editor en el navegador (http://localhost:5174)
cd apps/editor
pnpm exec vite --port 5174

# app de escritorio (Electron)
pnpm --filter @pixelforge/editor build
pnpm --filter @pixelforge/editor start

# backend opcional (puerto 7710)
pnpm --filter @pixelforge/backend dev
```

Pruebas del modelo del editor: `pnpm --filter @pixelforge/editor test`.

## Estructura

- `apps/editor` — el editor (React + Canvas 2D, shell Electron).
- `apps/backend` — servicio local opcional de trabajos de generación.
- `apps/mcp-server` — servidor MCP que habla con el backend.
- `packages/*` — contratos, núcleo, proveedores y posproceso compartidos.

## Licencia

[MIT](LICENSE) © 2026 Jorge Nureña
