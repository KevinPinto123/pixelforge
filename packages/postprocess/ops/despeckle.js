// ops/despeckle.js — spec §4. Corre DESPUES de quantize, sobre índices de paleta
// (comparación exacta). Mata ruido de generador sin comerse detalle intencional.
import { cloneImage, getPixel, setPixel, isOpaque, pixelHex, inBounds, connectedComponents } from '../image.js';

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function despeckle(img, config = {}) {
  const cfg = { mode: 'conservative', minIslandAlpha: 2, colorSpeckle: true, ...config };
  if (cfg.mode === 'off') {
    return { image: cloneImage(img), report: { removedIslands: 0, removedPixels: 0, recoloredPixels: 0, coords: { removed: [], recolored: [] } } };
  }

  const out = cloneImage(img);
  const minIslandAlpha = cfg.mode === 'aggressive' ? 4 : cfg.minIslandAlpha;
  const requiredMatches = cfg.mode === 'aggressive' ? 7 : 8; // "aggressive relaja a 7/8"

  // 1. Islas alpha: componentes conexos opacos con área <= minIslandAlpha, sin tocar
  // el componente principal (mayor área, nunca se toca).
  const components = connectedComponents(out, 8);
  const removedCoords = [];
  for (let i = 1; i < components.length; i++) {
    const comp = components[i];
    if (comp.area <= minIslandAlpha) {
      for (const [x, y] of comp.pixels) {
        setPixel(out, x, y, 0, 0, 0, 0);
        removedCoords.push([x, y]);
      }
    }
  }

  const recoloredCoords = [];
  if (cfg.colorSpeckle) {
    // Frecuencia global (sobre imagen ya sin islas) — protege ojos/highlights que
    // existen pocas veces (<=2) pero cuyos vecinos NO son uniformes.
    const freq = new Map();
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        if (!isOpaque(out, x, y)) continue;
        const hex = pixelHex(out, x, y);
        freq.set(hex, (freq.get(hex) || 0) + 1);
      }
    }

    const src = cloneImage(out);
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        if (!isOpaque(src, x, y)) continue;
        const ownHex = pixelHex(src, x, y);
        if ((freq.get(ownHex) || 0) > 2) continue;

        const neighborCounts = new Map();
        let opaqueNeighbors = 0;
        for (const [dx, dy] of N8) {
          const nx = x + dx, ny = y + dy;
          if (!inBounds(src, nx, ny) || !isOpaque(src, nx, ny)) continue;
          opaqueNeighbors++;
          const nHex = pixelHex(src, nx, ny);
          neighborCounts.set(nHex, (neighborCounts.get(nHex) || 0) + 1);
        }
        if (opaqueNeighbors < requiredMatches) continue;

        let bestHex = null, bestCount = 0;
        for (const [hex, count] of neighborCounts) {
          if (count > bestCount) { bestCount = count; bestHex = hex; }
        }
        if (bestHex && bestHex !== ownHex && bestCount >= requiredMatches) {
          const targetPixel = firstPixelWithHex(src, x, y, bestHex);
          setPixel(out, x, y, targetPixel[0], targetPixel[1], targetPixel[2], 255);
          recoloredCoords.push([x, y]);
        }
      }
    }
  }

  return {
    image: out,
    report: {
      removedIslands: components.slice(1).filter((c) => c.area <= minIslandAlpha).length,
      removedPixels: removedCoords.length,
      recoloredPixels: recoloredCoords.length,
      coords: { removed: removedCoords, recolored: recoloredCoords },
    },
  };
}

function firstPixelWithHex(img, cx, cy, hex) {
  for (const [dx, dy] of N8) {
    const nx = cx + dx, ny = cy + dy;
    if (!inBounds(img, nx, ny) || !isOpaque(img, nx, ny)) continue;
    if (pixelHex(img, nx, ny) === hex) return getPixel(img, nx, ny);
  }
  return [0, 0, 0, 255];
}
