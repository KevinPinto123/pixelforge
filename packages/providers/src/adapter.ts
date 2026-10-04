import type { ProviderId } from '@pixelforge/contracts';

export type ProviderCapability =
  | 'character'
  | 'animation'
  | 'tileset'
  | 'image2sprite'
  | 'postprocess';

export interface ProviderAcceptedJob {
  providerJobId: string;
  estimateS?: number;
}
export interface ProviderJobStatus {
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  progress?: number;
  error?: string;
}
export interface ProviderResult {
  images: Array<{ buffer: Uint8Array; meta: Record<string, unknown> }>;
  raw?: unknown;
}
export interface ProviderHealth {
  ok: boolean;
  latencyMs?: number;
  detail?: string;
}

// Inputs normalizados (el orchestrator normaliza prompt/estilo antes de llegar aqui;
// shape se completa en Fase 2 con el normalizador de prompt).
export interface NormalizedCharacterInput {
  prompt: string;
  size: 16 | 32 | 48 | 64;
  directions: 1 | 4 | 8;
  paletteColors?: string[];
}
export interface NormalizedAnimationInput {
  sourceImage: Uint8Array;
  action: string;
  directions: 1 | 4 | 8;
  fps: number;
}
export interface NormalizedTilesetInput {
  theme: string;
  tileSize: number;
  mode: 'topdown' | 'sidescroller' | 'isometric';
}

/**
 * Contrato unico de proveedor (spec §10). PixelLabApiAdapter (Fase 2),
 * FalAdapter (Fase 4), LocalPostProcessAdapter y FutureCustomModelAdapter
 * implementan esto; el orchestrator nunca conoce APIs concretas.
 */
export interface PixelProviderAdapter {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapability[];
  generateCharacter(input: NormalizedCharacterInput): Promise<ProviderAcceptedJob>;
  generateAnimation(input: NormalizedAnimationInput): Promise<ProviderAcceptedJob>;
  generateTileset(input: NormalizedTilesetInput): Promise<ProviderAcceptedJob>;
  getJobStatus(providerJobId: string): Promise<ProviderJobStatus>;
  downloadResult(providerJobId: string): Promise<ProviderResult>;
  cancel?(providerJobId: string): Promise<void>;
  healthcheck(): Promise<ProviderHealth>;
}
