// image.js — Image = {width, height, data:Uint8ClampedArray RGBA}. Representación
// canónica interna del pipeline (spec §1: cada op es (ImageData, config) -> ImageData).
import { hexToRgb, rgbToHex } from './color.js';

export function createImage(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneImage(img) {
  return { width: img.width, height: img.height, data: Uint8ClampedArray.from(img.data) };
}

export function inBounds(img, x, y) {
  return x >= 0 && y >= 0 && x < img.width && y < img.height;
}

export function getPixel(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

export function setPixel(img, x, y, r, g, b, a) {
  const i = (y * img.width + x) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = a;
}

export function isOpaque(img, x, y) {
  return img.data[(y * img.width + x) * 4 + 3] > 0;
}

export function pixelHex(img, x, y) {
  const [r, g, b] = getPixel(img, x, y);
  return rgbToHex(r, g, b);
}

// --- Formato asset del repo: PixelForge grid {N, pixels:[hex|null]*N*N, palette} ---
// (vibecoder-latam/assets/characters/*.json). null = transparente, hex = opaco puro
// (el formato no tiene semitransparencia: no hay decode de halo real que limpiar aquí,
// alpha_cleanup igual corre para mantener el contrato del pipeline).
export function gridToImage(grid) {
  const n = grid.N;
  const img = createImage(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const hex = grid.pixels[y * n + x];
      if (hex == null) {
        setPixel(img, x, y, 0, 0, 0, 0);
      } else {
        const [r, g, b] = hexToRgb(hex);
        setPixel(img, x, y, r, g, b, 255);
      }
    }
  }
  return img;
}

export function imageToGrid(img) {
  const pixels = new Array(img.width * img.height);
  const paletteSet = new Set();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [r, g, b, a] = getPixel(img, x, y);
      if (a === 0) {
        pixels[y * img.width + x] = null;
      } else {
        const hex = rgbToHex(r, g, b);
        pixels[y * img.width + x] = hex;
        paletteSet.add(hex);
      }
    }
  }
  return { N: img.width, pixels, palette: [...paletteSet].sort() };
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Connected components (8-conn por defecto) sobre la máscara opaca. Devuelve
// [{id, pixels:[[x,y]...], area}], ordenado desc por área.
export function connectedComponents(img, connectivity = 8) {
  const neighbors = connectivity === 8 ? N8 : N4;
  const visited = new Uint8Array(img.width * img.height);
  const components = [];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const idx = y * img.width + x;
      if (visited[idx] || !isOpaque(img, x, y)) continue;
      const stack = [[x, y]];
      visited[idx] = 1;
      const pixels = [];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        pixels.push([cx, cy]);
        for (const [dx, dy] of neighbors) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inBounds(img, nx, ny)) continue;
          const nIdx = ny * img.width + nx;
          if (visited[nIdx] || !isOpaque(img, nx, ny)) continue;
          visited[nIdx] = 1;
          stack.push([nx, ny]);
        }
      }
      components.push({ pixels, area: pixels.length });
    }
  }
  components.sort((a, b) => b.area - a.area);
  return components;
}

export function boundingBox(img) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (isOpaque(img, x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX === Infinity) return null; // lienzo vacío
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function opaqueCount(img) {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) n++;
  return n;
}

// Crece el lienzo `amount` px por lado, relleno transparente. Usado por
// outline.external con expandCanvas (spec §5) antes de trazar.
export function padCanvas(img, amount) {
  const out = createImage(img.width + amount * 2, img.height + amount * 2);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [r, g, b, a] = getPixel(img, x, y);
      if (a > 0) setPixel(out, x + amount, y + amount, r, g, b, a);
    }
  }
  return out;
}

export function flipH(img) {
  const out = createImage(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [r, g, b, a] = getPixel(img, x, y);
      if (a > 0) setPixel(out, img.width - 1 - x, y, r, g, b, a);
    }
  }
  return out;
}

// Nearest-neighbor resize (nunca usado para asset final — prohibido resamplear
// pixel art §6 — solo como proxy de control en validate.sil.legible).
export function resizeNearest(img, newW, newH) {
  const out = createImage(newW, newH);
  for (let y = 0; y < newH; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y * img.height) / newH));
    for (let x = 0; x < newW; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x * img.width) / newW));
      const [r, g, b, a] = getPixel(img, sx, sy);
      setPixel(out, x, y, r, g, b, a);
    }
  }
  return out;
}

export function iou(imgA, imgB) {
  const w = Math.max(imgA.width, imgB.width);
  const h = Math.max(imgA.height, imgB.height);
  let inter = 0, union = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = x < imgA.width && y < imgA.height && isOpaque(imgA, x, y);
      const b = x < imgB.width && y < imgB.height && isOpaque(imgB, x, y);
      if (a || b) union++;
      if (a && b) inter++;
    }
  }
  return union === 0 ? 1 : inter / union;
}

// IoU alineada por baseline (fila opaca inferior) + centro X del bbox — compara
// forma, no posición absoluta (spec §7.4).
export function alignedIoU(imgA, imgB) {
  const bboxA = boundingBox(imgA);
  const bboxB = boundingBox(imgB);
  if (!bboxA || !bboxB) return bboxA === bboxB ? 1 : 0;
  const centerA = bboxA.minX + (bboxA.w - 1) / 2;
  const centerB = bboxB.minX + (bboxB.w - 1) / 2;
  const dx = Math.round(centerA - centerB);
  const dy = bboxA.maxY - bboxB.maxY;
  let inter = 0, union = 0;
  const seenA = new Set();
  for (const [x, y] of iteratePixels(imgA)) {
    if (!isOpaque(imgA, x, y)) continue;
    seenA.add(`${x},${y}`);
  }
  const seenBShifted = new Set();
  for (const [x, y] of iteratePixels(imgB)) {
    if (!isOpaque(imgB, x, y)) continue;
    seenBShifted.add(`${x + dx},${y + dy}`);
  }
  const all = new Set([...seenA, ...seenBShifted]);
  for (const key of all) {
    const inA = seenA.has(key);
    const inB = seenBShifted.has(key);
    if (inA || inB) union++;
    if (inA && inB) inter++;
  }
  return union === 0 ? 1 : inter / union;
}

function* iteratePixels(img) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) yield [x, y];
  }
}
