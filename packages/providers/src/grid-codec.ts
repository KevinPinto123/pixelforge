import type { PixelForgeImage } from '@pixelforge/postprocess';
import { imageToPng } from './png-codec.js';

/**
 * Grilla de pixel-art indexada a color, tal como la emite el modelo propio
 * (AnthropicGridAdapter, spec §21). Espejo conceptual de png-codec.ts: png-codec
 * es la frontera PNG <-> RGBA; grid-codec es la frontera GRID <-> RGBA. El color
 * real vive celda a celda en `pixels`; `palette` es la paleta declarada por el
 * modelo (informativa, para lineage/post-proceso).
 */
export interface PixelGrid {
  /** Lado de la grilla cuadrada NxN. */
  N: number;
  /**
   * N*N celdas en orden fila-por-fila (row-major, arriba-izquierda a
   * abajo-derecha). Cada celda es un hex '#RRGGBB' o null = pixel transparente.
   */
  pixels: Array<string | null>;
  /** Paleta declarada por el modelo (lista de hex). */
  palette: string[];
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.slice(0, 6);
  const v = Number.parseInt(full, 16);
  if (Number.isNaN(v)) return [0, 0, 0];
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/**
 * Rasteriza la grilla a RGBA crudo (PixelForgeImage), celda a celda:
 * null -> alpha 0 (transparente), hex -> color opaco. No hace ningun op de
 * post-proceso, igual que png-codec: solo el codec.
 */
export function gridToImage(grid: PixelGrid): PixelForgeImage {
  const { N, pixels } = grid;
  const data = new Uint8ClampedArray(N * N * 4);
  const count = N * N;
  for (let i = 0; i < count; i += 1) {
    const hex = pixels[i];
    if (hex == null) continue; // null/undefined -> alpha 0 (celda transparente)
    const [r, g, b] = hexToRgb(hex);
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return { width: N, height: N, data };
}

/** Codifica la grilla a PNG (Buffer) reusando imageToPng de sharp (png-codec). */
export async function gridToPng(grid: PixelGrid): Promise<Buffer> {
  return imageToPng(gridToImage(grid));
}
