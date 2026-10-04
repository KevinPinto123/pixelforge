import { gridToPng, LocalPostProcessAdapter } from '@pixelforge/providers';
import type { PostProcessOps } from '@pixelforge/postprocess';
import type { PixelGrid, RenderResult } from './types.js';

/**
 * pf-06-render (SPEC-PIXELFORGE-ORCHESTRATOR.md §3, etapa 6).
 *
 * Renderiza la grilla ganadora a PNG final REUSANDO piezas existentes sin
 * tocarlas:
 *  - gridToPng (@pixelforge/providers/grid-codec) — grilla -> PNG via sharp.
 *  - el mismo post-proceso que aplica el job-runner en su etapa `post_processing`
 *    (apps/backend/src/job-runner.ts runPostProcess): LocalPostProcessAdapter con
 *    ops { alphaCleanup, quantize, despeckle:conservative }. runPostProcess es una
 *    funcion privada del job-runner (no exportable); aca se reusa su MISMA logica
 *    a traves del adapter publico, sin modificar el job-runner.
 */
const POST_OPS: PostProcessOps = {
  alphaCleanup: {},
  quantize: {},
  despeckle: { mode: 'conservative' },
};

export interface RenderOptions {
  /** Aplicar el post-proceso del job-runner. Default true. */
  postProcess?: boolean;
  /** Nombre logico del frame de salida. Default 'render'. */
  name?: string;
}

export async function renderGrid(grid: PixelGrid, opts: RenderOptions = {}): Promise<RenderResult> {
  const raw = await gridToPng(grid); // reuso directo, sin tocar grid-codec
  if (opts.postProcess === false) {
    return { png: raw, postProcessed: false };
  }
  const adapter = new LocalPostProcessAdapter();
  const { pngOutputs } = await adapter.postProcessPng(
    [{ name: opts.name ?? 'render', png: raw }],
    POST_OPS,
  );
  const out = pngOutputs[0];
  return out
    ? { png: out.png, postProcessed: true, hash: out.hash }
    : { png: raw, postProcessed: false };
}
