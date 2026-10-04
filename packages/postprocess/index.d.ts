// index.d.ts — tipos ambientales minimos para consumir @pixelforge/postprocess
// (paquete JS puro, sin build step) desde TS strict en @pixelforge/providers.
// Solo cubre la superficie realmente consumida; el resto queda en `unknown`
// a proposito en vez de adivinar shapes internos no auditados.

export interface PixelForgeImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export declare function createImage(width: number, height: number): PixelForgeImage;
export declare function setPixel(
  img: PixelForgeImage,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void;
export declare function gridToImage(grid: { N: number; pixels: (string | null)[] }): PixelForgeImage;
export declare function imageToGrid(img: PixelForgeImage): {
  N: number;
  pixels: (string | null)[];
  palette: string[];
};

export interface PostProcessFrameRef {
  name: string;
  role?: string;
  image: PixelForgeImage;
}

export interface PostProcessOps {
  alphaCleanup?: boolean | Record<string, unknown>;
  quantize?: boolean | Record<string, unknown>;
  despeckle?: boolean | Record<string, unknown>;
  outline?: Record<string, unknown>;
  padCrop?: Record<string, unknown>;
  validate?: (Record<string, unknown> & { frames?: PostProcessFrameRef[] }) | undefined;
}

export interface PostProcessInput {
  source: PostProcessFrameRef | PostProcessFrameRef[];
  ops?: PostProcessOps;
  sourceIsHandAuthored?: boolean;
}

export interface PostProcessOutputImage {
  name: string;
  grid: unknown;
  hash: string;
}

export interface PostProcessResult {
  status: 'ready' | 'failed';
  needsReview?: boolean;
  steps?: unknown;
  consistencyReport?: unknown;
  outputs?: PostProcessOutputImage[];
  error?: string;
  suggestion?: string;
}

export declare class LocalPostProcessAdapter {
  id: 'local';
  capabilities: ['postprocess'];
  generateCharacter(): Promise<never>;
  generateAnimation(): Promise<never>;
  generateTileset(): Promise<never>;
  healthcheck(): Promise<{ ok: true }>;
  getJobStatus(): Promise<{ status: 'succeeded' }>;
  downloadResult(): Promise<never>;
  postProcess(input: PostProcessInput): Promise<PostProcessResult>;
}
