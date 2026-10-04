import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImage, setPixel } from '../image.js';
import { LocalPostProcessAdapter } from '../adapter.js';
import { hexToRgb } from '../color.js';

// spec §9 test 7: doble corrida byte-identica (hash del blob). Sin RNG, sin
// timestamps: mismos bytes de entrada + misma config => mismos bytes de salida.
test('LocalPostProcessAdapter.postProcess is deterministic across two runs', async () => {
  const adapter = new LocalPostProcessAdapter();
  const buildInput = () => {
    const img = createImage(24, 24);
    for (let y = 2; y <= 20; y++) for (let x = 4; x <= 16; x++) setPixel(img, x, y, ...hexToRgb('#ff7800'), 255);
    return {
      source: { name: 'frame', image: img },
      ops: {
        alphaCleanup: {},
        quantize: {},
        despeckle: { mode: 'conservative' },
        outline: { mode: 'external' },
        padCrop: { targetSize: { w: 24, h: 24 } },
      },
    };
  };

  const r1 = await adapter.postProcess(buildInput());
  const r2 = await adapter.postProcess(buildInput());

  assert.equal(r1.status, 'ready');
  assert.equal(r1.outputs[0].hash, r2.outputs[0].hash);
  assert.deepEqual(r1.outputs[0].grid, r2.outputs[0].grid);
});
