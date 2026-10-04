import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { LocalPostProcessAdapter } from '../src/local-postprocess-adapter.js';
import { imageToPng, pngToImage } from '../src/png-codec.js';

async function makeTestPng(): Promise<Buffer> {
  return sharp({
    create: { width: 16, height: 16, channels: 4, background: { r: 255, g: 120, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describe('png-codec', () => {
  it('pngToImage -> imageToPng conserva dimensiones y color', async () => {
    const png = await makeTestPng();
    const image = await pngToImage(png);
    expect(image.width).toBe(16);
    expect(image.height).toBe(16);
    expect([image.data[0], image.data[1], image.data[2], image.data[3]]).toEqual([255, 120, 0, 255]);

    const roundTripped = await imageToPng(image);
    const decoded = await pngToImage(roundTripped);
    expect(decoded.width).toBe(16);
    expect([decoded.data[0], decoded.data[1], decoded.data[2], decoded.data[3]]).toEqual([255, 120, 0, 255]);
  });
});

describe('LocalPostProcessAdapter.postProcessPng', () => {
  it('corre el pipeline sobre PNG real (sharp de un lado, ops de Technical Artist del otro)', async () => {
    const png = await makeTestPng();
    const adapter = new LocalPostProcessAdapter();

    const { result, pngOutputs } = await adapter.postProcessPng([{ name: 'frame', png }], {
      alphaCleanup: {},
      quantize: {},
      despeckle: { mode: 'conservative' },
    });

    expect(result.status).toBe('ready');
    expect(pngOutputs).toHaveLength(1);
    expect(pngOutputs[0]!.png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(pngOutputs[0]!.hash).toBeTruthy();
  });
});
