// ops/alphaCleanup.js — spec §3. Binariza alpha + defringe de halos de generador.
import { cloneImage, getPixel, setPixel, inBounds, isOpaque } from '../image.js';
import { luminance } from '../color.js';

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function alphaCleanup(img, config = {}) {
  const cfg = { threshold: 128, defringe: true, defringeRadius: 1, ...config };
  const out = cloneImage(img);
  let binarized = 0;

  // 1. Binarizar. Transparentes se normalizan a rgba(0,0,0,0) (determinismo hash).
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const [r, g, b, a] = getPixel(out, x, y);
      if (a >= cfg.threshold) {
        if (a !== 255) binarized++;
        setPixel(out, x, y, r, g, b, 255);
      } else {
        if (a !== 0) binarized++;
        setPixel(out, x, y, 0, 0, 0, 0);
      }
    }
  }

  let defringed = 0;
  if (cfg.defringe) {
    // 2. Defringe: píxel opaco de BORDE cuya luminancia difiere >20% de su vecino
    // interior opaco más cercano en la misma rampa -> heurística de premultiplicado
    // contra fondo. Se reemplaza el RGB por el del vecino opaco interior más cercano.
    const src = cloneImage(out);
    const isBorder = (x, y) => {
      if (!isOpaque(src, x, y)) return false;
      return N8.some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return !inBounds(src, nx, ny) || !isOpaque(src, nx, ny);
      });
    };
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        if (!isBorder(x, y)) continue;
        // Preferir un vecino opaco que NO sea a su vez de borde (interior real):
        // en un halo de varios píxeles de espesor, el vecino de borde más cercano
        // sería otro píxel de halo (mismo tinte), no la referencia de color real.
        let interior = null;
        let fallback = null;
        for (const [dx, dy] of N8) {
          const nx = x + dx, ny = y + dy;
          if (!inBounds(src, nx, ny) || !isOpaque(src, nx, ny)) continue;
          if (!fallback) fallback = [nx, ny];
          if (!interior && !isBorder(nx, ny)) interior = [nx, ny];
        }
        const ref = interior || fallback;
        if (!ref) continue;
        const [r, g, b] = getPixel(src, x, y);
        const [ir, ig, ib] = getPixel(src, ref[0], ref[1]);
        const lumSelf = luminance(r, g, b);
        const lumIn = luminance(ir, ig, ib);
        const diff = lumIn === 0 ? Math.abs(lumSelf - lumIn) : Math.abs(lumSelf - lumIn) / lumIn;
        if (diff > 0.2) {
          setPixel(out, x, y, ir, ig, ib, 255);
          defringed++;
        }
      }
    }
  }

  return {
    image: out,
    report: { binarizedPixels: binarized, defringedPixels: defringed },
  };
}
