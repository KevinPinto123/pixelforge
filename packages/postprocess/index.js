// index.js — API pública de @office-engine/postprocess (SPEC-POSTPROCESS-PIXELART.md)
export { LocalPostProcessAdapter } from './adapter.js';
export { alphaCleanup } from './ops/alphaCleanup.js';
export { quantize } from './ops/quantize.js';
export { despeckle } from './ops/despeckle.js';
export { outline } from './ops/outline.js';
export { padCrop } from './ops/padCrop.js';
export { validate, DEFAULT_THRESHOLDS } from './ops/validate.js';
export * from './image.js';
export * from './color.js';
export * from './palette.js';
