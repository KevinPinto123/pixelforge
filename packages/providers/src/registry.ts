import type { ProviderId } from '@pixelforge/contracts';
import type { PixelProviderAdapter, ProviderCapability } from './adapter.js';

/**
 * Registry + routing por capability (spec §10). El routing con prioridades
 * configurables y failover llega en Fase 2/4; Fase 0 fija el contrato.
 */
export class ProviderRegistry {
  private adapters = new Map<ProviderId, PixelProviderAdapter>();

  register(adapter: PixelProviderAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Provider ya registrado: ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: ProviderId): PixelProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  byCapability(capability: ProviderCapability): PixelProviderAdapter[] {
    return [...this.adapters.values()].filter((a) => a.capabilities.includes(capability));
  }

  list(): PixelProviderAdapter[] {
    return [...this.adapters.values()];
  }
}
