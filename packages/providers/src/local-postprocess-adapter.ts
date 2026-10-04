import type { ProviderId } from '@pixelforge/contracts';
import { LocalPostProcessAdapter as RawLocalPostProcessAdapter, gridToImage } from '@pixelforge/postprocess';
import type { PostProcessInput, PostProcessOps, PostProcessResult } from '@pixelforge/postprocess';
import type {
  PixelProviderAdapter,
  ProviderAcceptedJob,
  ProviderCapability,
  ProviderHealth,
  ProviderJobStatus,
  ProviderResult,
} from './adapter.js';
import { imageToPng, pngToImage } from './png-codec.js';

/**
 * Wrapper tipado sobre @pixelforge/postprocess (Technical Artist,
 * SPEC-POSTPROCESS-PIXELART.md). El pipeline real (alpha_cleanup -> quantize ->
 * despeckle -> outline -> pad_crop -> validate) vive en ese paquete, sin deps
 * (no usa sharp pese a la mencion en spec §10 — ver nota en el commit que lo
 * integro). Este adapter solo lo expone con el contrato PixelProviderAdapter
 * del orchestrator y agrega `postProcess()`, que cae fuera del contrato
 * generico generate-x/download porque post-proceso no es un job de generacion:
 * el job runner (apps/backend) lo invoca directo en la etapa `post_processing`
 * del pipeline (spec §9).
 */
export class LocalPostProcessAdapter implements PixelProviderAdapter {
  readonly id: ProviderId = 'local';
  readonly capabilities: ProviderCapability[] = ['postprocess'];

  private readonly raw = new RawLocalPostProcessAdapter();

  async generateCharacter(): Promise<ProviderAcceptedJob> {
    throw new Error('LocalPostProcessAdapter no soporta generateCharacter');
  }

  async generateAnimation(): Promise<ProviderAcceptedJob> {
    throw new Error('LocalPostProcessAdapter no soporta generateAnimation');
  }

  async generateTileset(): Promise<ProviderAcceptedJob> {
    throw new Error('LocalPostProcessAdapter no soporta generateTileset');
  }

  async getJobStatus(): Promise<ProviderJobStatus> {
    return { status: 'succeeded' };
  }

  async downloadResult(): Promise<ProviderResult> {
    throw new Error('LocalPostProcessAdapter resuelve postProcess() inline, no hay download diferido');
  }

  async healthcheck(): Promise<ProviderHealth> {
    return { ok: true };
  }

  /** Corre el pipeline fijo de post-proceso sobre 1+ imagenes (orden fijo, spec §1). */
  async postProcess(input: PostProcessInput): Promise<PostProcessResult> {
    return this.raw.postProcess(input);
  }

  /**
   * Igual que postProcess(), pero habla PNG en ambos extremos (sharp = la
   * frontera, ver png-codec.ts) — es lo que el job runner llama con la
   * descarga cruda de un provider (PixelLab entrega PNG, no PixelForgeImage).
   */
  async postProcessPng(
    pngs: Array<{ name: string; png: Buffer; role?: string }>,
    ops?: PostProcessOps,
  ): Promise<{ result: PostProcessResult; pngOutputs: Array<{ name: string; png: Buffer; hash: string }> }> {
    const source = await Promise.all(
      pngs.map(async (p) => ({
        name: p.name,
        ...(p.role !== undefined ? { role: p.role } : {}),
        image: await pngToImage(p.png),
      })),
    );
    const result = await this.raw.postProcess({
      source: source.length === 1 ? source[0]! : source,
      ...(ops !== undefined ? { ops } : {}),
    });
    const pngOutputs = await Promise.all(
      (result.outputs ?? []).map(async (out) => ({
        name: out.name,
        hash: out.hash,
        png: await imageToPng(gridToImage(out.grid as { N: number; pixels: (string | null)[] })),
      })),
    );
    return { result, pngOutputs };
  }
}
