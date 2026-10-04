import { compositeFrame, type SpriteDoc } from './document.js';

export interface DecodedImage {
  width: number;
  height: number;
  pixels: (string | null)[];
}

/** Decodifica un PNG (data URL) a hex-o-null, umbral alpha 50% (pixel-art puro, sin alpha parcial). */
export async function decodePngDataUrl(dataUrl: string): Promise<DecodedImage> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('No pude decodificar el PNG'));
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels: (string | null)[] = new Array(canvas.width * canvas.height).fill(null);
  for (let i = 0; i < pixels.length; i += 1) {
    const o = i * 4;
    if ((data[o + 3] ?? 0) > 127) {
      pixels[i] =
        '#' +
        [data[o], data[o + 1], data[o + 2]].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('');
    }
  }
  return { width: canvas.width, height: canvas.height, pixels };
}

/** Canvas del tamano del doc con un frame compuesto (para thumbnails y spritesheet). */
export function frameToCanvas(doc: SpriteDoc, frameIndex: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.putImageData(new ImageData(compositeFrame(doc, frameIndex), doc.width, doc.height), 0, 0);
  return canvas;
}

/**
 * Spritesheet horizontal (frames en fila, nearest, escala entera 1-8x —
 * amendment §16 eje 2: la escala de export es propiedad del bundle, no del zoom
 * de vista). Devuelve base64 sin el prefijo data:.
 */
export function spritesheetPngBase64(doc: SpriteDoc, scale: number, from = 0, to?: number): string {
  const last = to ?? doc.frames.length - 1;
  const count = last - from + 1;
  const sheet = document.createElement('canvas');
  sheet.width = doc.width * scale * count;
  sheet.height = doc.height * scale;
  const ctx = sheet.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < count; i += 1) {
    ctx.drawImage(
      frameToCanvas(doc, from + i),
      i * doc.width * scale,
      0,
      doc.width * scale,
      doc.height * scale,
    );
  }
  return sheet.toDataURL('image/png').split(',')[1] ?? '';
}
