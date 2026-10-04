// ops/padCrop.js — spec §6. Normaliza a lienzo canon: crop al bbox opaco, pad a
// targetSize, centra en X, ancla piso. NUNCA reescala (prohibido resamplear pixel art).
import { createImage, getPixel, setPixel, boundingBox } from '../image.js';

export function padCrop(img, config) {
  const { targetSize, baselineOffset = 0 } = config;
  const bbox = boundingBox(img);

  if (!bbox) {
    return { image: createImage(targetSize.w, targetSize.h), report: { empty: true, targetSize } };
  }

  if (bbox.w > targetSize.w || bbox.h > targetSize.h) {
    return {
      failed: true,
      error: 'sprite_exceeds_canvas',
      suggestion: `bbox opaco ${bbox.w}x${bbox.h} excede el lienzo target ${targetSize.w}x${targetSize.h}; regenerar con el size correcto (no reescalar).`,
    };
  }

  const out = createImage(targetSize.w, targetSize.h);
  const offsetX = Math.floor((targetSize.w - bbox.w) / 2);
  const bottomRow = targetSize.h - 1 - baselineOffset;
  const offsetY = bottomRow - (bbox.h - 1);

  for (let y = 0; y < bbox.h; y++) {
    for (let x = 0; x < bbox.w; x++) {
      const [r, g, b, a] = getPixel(img, bbox.minX + x, bbox.minY + y);
      if (a > 0) setPixel(out, offsetX + x, offsetY + y, r, g, b, a);
    }
  }

  return { image: out, report: { bbox, offsetX, offsetY, targetSize, baselineOffset } };
}
