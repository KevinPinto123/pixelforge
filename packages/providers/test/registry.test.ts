import { describe, expect, it } from 'vitest';
import { ProviderRegistry, type PixelProviderAdapter } from '../src/index.js';

function fakeAdapter(id: 'pixellab-api' | 'local'): PixelProviderAdapter {
  return {
    id,
    capabilities: id === 'local' ? ['postprocess'] : ['character', 'animation', 'tileset'],
    generateCharacter: async () => ({ providerJobId: 'pj1' }),
    generateAnimation: async () => ({ providerJobId: 'pj2' }),
    generateTileset: async () => ({ providerJobId: 'pj3' }),
    getJobStatus: async () => ({ status: 'succeeded' as const }),
    downloadResult: async () => ({ images: [] }),
    healthcheck: async () => ({ ok: true }),
  };
}

describe('ProviderRegistry', () => {
  it('registra y resuelve por capability', () => {
    const reg = new ProviderRegistry();
    reg.register(fakeAdapter('pixellab-api'));
    reg.register(fakeAdapter('local'));
    expect(reg.byCapability('character').map((a) => a.id)).toEqual(['pixellab-api']);
    expect(reg.byCapability('postprocess').map((a) => a.id)).toEqual(['local']);
    expect(reg.list()).toHaveLength(2);
  });

  it('rechaza doble registro', () => {
    const reg = new ProviderRegistry();
    reg.register(fakeAdapter('local'));
    expect(() => reg.register(fakeAdapter('local'))).toThrow(/ya registrado/);
  });
});
