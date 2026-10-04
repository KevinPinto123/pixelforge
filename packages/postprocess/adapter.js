// adapter.js — LocalPostProcessAdapter (spec §8). Extiende SPEC-PIXELFORGE-PLATFORM
// §10, provider 'local', capability 'postprocess'. Jobs locales resuelven inline
// (submit -> running -> ready en el mismo proceso, sin awaiting_provider).
//
// Nota de integración: packages/providers/src (monorepo pixelforge/) define
// PixelProviderAdapter con generateCharacter/generateAnimation/generateTileset +
// getJobStatus/downloadResult (contrato async multi-provider). Esta clase replica
// esa forma para wiring directo: solo implementa postProcess() (su capability real)
// y stubea el resto.
import { createHash } from 'node:crypto';
import { alphaCleanup } from './ops/alphaCleanup.js';
import { quantize } from './ops/quantize.js';
import { despeckle } from './ops/despeckle.js';
import { outline } from './ops/outline.js';
import { padCrop } from './ops/padCrop.js';
import { validate } from './ops/validate.js';
import { imageToGrid } from './image.js';

function hashImage(img) {
  return createHash('sha256').update(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)).digest('hex');
}

export class LocalPostProcessAdapter {
  id = 'local';
  capabilities = ['postprocess'];

  async generateCharacter() { throw new Error('LocalPostProcessAdapter no soporta generateCharacter'); }
  async generateAnimation() { throw new Error('LocalPostProcessAdapter no soporta generateAnimation'); }
  async generateTileset() { throw new Error('LocalPostProcessAdapter no soporta generateTileset'); }
  async healthcheck() { return { ok: true }; }
  async getJobStatus() { return { status: 'succeeded' }; } // resuelve inline, nunca queda pendiente
  async downloadResult() { throw new Error('LocalPostProcessAdapter resuelve postProcess() inline, no hay download diferido'); }

  /**
   * Corre el pipeline fijo sobre 1 imagen o un set (para validate). No hay
   * reordenamiento por config: el orden es 1.alpha_cleanup 2.quantize 3.despeckle
   * 4.outline 5.pad_crop 6.validate (spec §1) — cambiarlo reintroduce halos/speckles.
   */
  async postProcess(input) {
    const images = Array.isArray(input.source) ? input.source : [input.source];
    const ops = input.ops || {};
    const steps = [];
    const processedImages = [];
    let needsReview = false;

    for (const ref of images) {
      let img = ref.image;
      const frameSteps = [];

      if (ops.alphaCleanup !== false) {
        const r = alphaCleanup(img, ops.alphaCleanup === true ? {} : ops.alphaCleanup || {});
        img = r.image;
        frameSteps.push({ op: 'alpha_cleanup', report: r.report });
      }

      if (ops.quantize !== false) {
        const r = quantize(img, ops.quantize === true ? {} : ops.quantize || {});
        img = r.image;
        if (r.needsReview) needsReview = true;
        frameSteps.push({ op: 'quantize', report: r.report, needsReview: r.needsReview });
      }

      const despeckleCfg = ops.despeckle === undefined
        ? { mode: input.sourceIsHandAuthored ? 'off' : 'conservative' }
        : ops.despeckle;
      if (despeckleCfg !== false) {
        const r = despeckle(img, despeckleCfg === true ? {} : despeckleCfg);
        img = r.image;
        frameSteps.push({ op: 'despeckle', report: r.report });
      }

      if (ops.outline) {
        const r = outline(img, ops.outline);
        img = r.image;
        frameSteps.push({ op: 'outline', report: r.report });
      }

      if (ops.padCrop) {
        const r = padCrop(img, ops.padCrop);
        if (r.failed) {
          return {
            status: 'failed',
            error: r.error,
            suggestion: r.suggestion,
            steps: [...steps, { frame: ref.name, steps: frameSteps }],
          };
        }
        img = r.image;
        frameSteps.push({ op: 'pad_crop', report: r.report });
      }

      steps.push({ frame: ref.name, steps: frameSteps });
      processedImages.push({ name: ref.name, role: ref.role, image: img });
    }

    let consistencyReport = null;
    if (ops.validate) {
      consistencyReport = validate({
        ...ops.validate,
        frames: ops.validate.frames || processedImages,
      });
      if (consistencyReport.verdict === 'fail') {
        return { status: 'failed', consistencyReport, steps };
      }
      if (consistencyReport.verdict === 'warn') needsReview = true;
    }

    const outputs = processedImages.map((p) => ({
      name: p.name,
      grid: imageToGrid(p.image),
      hash: hashImage(p.image),
    }));

    return {
      status: 'ready',
      needsReview,
      steps,
      consistencyReport,
      outputs,
    };
  }
}

export default LocalPostProcessAdapter;
