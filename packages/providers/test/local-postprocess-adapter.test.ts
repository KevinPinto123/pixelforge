import { createImage, setPixel } from '@pixelforge/postprocess';
import { describe, expect, it } from 'vitest';
import { LocalPostProcessAdapter } from '../src/local-postprocess-adapter.js';

describe('LocalPostProcessAdapter (wrapper de @pixelforge/postprocess)', () => {
  it('postProcess corre el pipeline y devuelve outputs listos', async () => {
    const adapter = new LocalPostProcessAdapter();
    const img = createImage(24, 24);
    for (let y = 2; y <= 20; y++) {
      for (let x = 4; x <= 16; x++) setPixel(img, x, y, 255, 120, 0, 255);
    }

    const result = await adapter.postProcess({
      source: { name: 'frame', image: img },
      ops: {
        alphaCleanup: {},
        quantize: {},
        despeckle: { mode: 'conservative' },
      },
    });

    expect(result.status).toBe('ready');
    expect(result.outputs?.[0]?.hash).toBeTruthy();
  });

  it('el resto del contrato PixelProviderAdapter esta stubeado como en spec', async () => {
    const adapter = new LocalPostProcessAdapter();
    expect(adapter.id).toBe('local');
    expect(adapter.capabilities).toEqual(['postprocess']);
    await expect(adapter.generateCharacter()).rejects.toThrow(/no soporta generateCharacter/);
    await expect(adapter.downloadResult()).rejects.toThrow(/resuelve postProcess/);
    expect(await adapter.healthcheck()).toEqual({ ok: true });
    expect(await adapter.getJobStatus()).toEqual({ status: 'succeeded' });
  });
});
