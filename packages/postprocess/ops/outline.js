// ops/outline.js — spec §5. Contorno canon, ink #1b1e2b, idempotente.
import { cloneImage, setPixel, isOpaque, pixelHex, inBounds, padCanvas, connectedComponents } from '../image.js';
import { hexToRgb } from '../color.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALREADY_OUTLINED_RATIO = 0.8;

export function outline(img, config = {}) {
  const mode = config.mode ?? 'none';
  const color = (config.color ?? '#1b1e2b').toLowerCase();
  const connectivity = config.connectivity ?? 4;
  const expandCanvas = config.expandCanvas ?? mode === 'external';

  if (mode === 'none') {
    return { image: cloneImage(img), report: { applied: false, mode } };
  }

  let work = mode === 'external' && expandCanvas ? padCanvas(img, 1) : cloneImage(img);

  const comps = connectedComponents(work, 8);
  const main = comps[0];
  if (main) {
    let perimeter = 0, alreadyInk = 0;
    for (const [x, y] of main.pixels) {
      const isBorder = N4.some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return !inBounds(work, nx, ny) || !isOpaque(work, nx, ny);
      });
      if (isBorder) {
        perimeter++;
        if (pixelHex(work, x, y) === color) alreadyInk++;
      }
    }
    if (perimeter > 0 && alreadyInk / perimeter >= ALREADY_OUTLINED_RATIO) {
      return { image: cloneImage(img), report: { applied: false, mode, skipped: 'already_outlined' } };
    }
  }

  const neighbors = connectivity === 8 ? N8 : N4;
  const [cr, cg, cb] = hexToRgb(color);
  let added = 0;

  if (mode === 'external') {
    const src = cloneImage(work);
    for (let y = 0; y < work.height; y++) {
      for (let x = 0; x < work.width; x++) {
        if (isOpaque(src, x, y)) continue; // candidato = transparente
        const hasOpaqueNeighbor = neighbors.some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          return inBounds(src, nx, ny) && isOpaque(src, nx, ny);
        });
        if (hasOpaqueNeighbor) {
          setPixel(work, x, y, cr, cg, cb, 255);
          added++;
        }
      }
    }
  } else if (mode === 'internal') {
    const src = cloneImage(work);
    for (let y = 0; y < work.height; y++) {
      for (let x = 0; x < work.width; x++) {
        if (!isOpaque(src, x, y)) continue; // candidato = opaco de borde
        if (pixelHex(src, x, y) === color) continue; // idempotencia: ya es ink
        const hasTransparentNeighbor = neighbors.some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          return !inBounds(src, nx, ny) || !isOpaque(src, nx, ny);
        });
        if (hasTransparentNeighbor) {
          setPixel(work, x, y, cr, cg, cb, 255);
          added++;
        }
      }
    }
  }

  return { image: work, report: { applied: true, mode, connectivity, addedPixels: added } };
}
