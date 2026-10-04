import type { PixelForgeImage } from '@pixelforge/postprocess';
import sharp from 'sharp';

/**
 * Frontera sharp <-> pipeline de pixeles de @pixelforge/postprocess (spec §10:
 * "LocalPostProcessAdapter — sharp + quantizacion propia"). @pixelforge/postprocess
 * opera sobre RGBA crudo (PixelForgeImage); los providers (PixelLab, uploads del
 * editor) hablan en PNG. sharp es exactamente esa frontera: decodifica el PNG del
 * provider a RGBA para el pipeline, y re-codifica la salida a PNG para guardarla.
 * Ningun op de post-proceso vive aca — solo el codec.
 */
export async function pngToImage(png: Buffer): Promise<PixelForgeImage> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
  };
}

export async function imageToPng(image: PixelForgeImage): Promise<Buffer> {
  return sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
