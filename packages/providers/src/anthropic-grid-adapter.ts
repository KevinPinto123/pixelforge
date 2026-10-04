import type { ProviderId } from '@pixelforge/contracts';
import { newId } from '@pixelforge/core';
import type {
  NormalizedAnimationInput,
  NormalizedCharacterInput,
  NormalizedTilesetInput,
  PixelProviderAdapter,
  ProviderAcceptedJob,
  ProviderCapability,
  ProviderHealth,
  ProviderJobStatus,
  ProviderResult,
} from './adapter.js';
import { gridToPng } from './grid-codec.js';
import type { PixelGrid } from './grid-codec.js';

/**
 * Modelo por defecto del proveedor propio. Opus 4.8 es el modelo por defecto de
 * la plataforma; la generacion de la grilla es extraccion estructurada via
 * tool-use forzado, no necesita thinking (se omite el parametro). Override por
 * request (opts.model) o entorno (PF_ANTHROPIC_MODEL).
 */
const DEFAULT_MODEL = 'claude-opus-4-8';
/** Techo de salida: una grilla NxN grande (64x64) son ~4096 celdas de hex. */
const DEFAULT_MAX_TOKENS = 16_000;

const GRID_TOOL_NAME = 'emit_grid';

/**
 * Definicion de la tool forzada. El input_schema ES el contrato de la grilla
 * (spec §21): { N:size, pixels:[hex|null length N*N], palette:[hex] }.
 */
const GRID_TOOL = {
  name: GRID_TOOL_NAME,
  description:
    'Emite el sprite de personaje como una grilla de pixel-art indexada a color. ' +
    'pixels tiene exactamente N*N celdas en orden fila-por-fila; cada celda es un ' +
    'hex "#RRGGBB" o null (pixel transparente).',
  input_schema: {
    type: 'object',
    properties: {
      N: { type: 'integer', description: 'Lado de la grilla cuadrada NxN.' },
      palette: {
        type: 'array',
        items: { type: 'string' },
        description: 'Paleta usada (lista de colores hex "#RRGGBB").',
      },
      pixels: {
        type: 'array',
        items: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        description: 'N*N celdas row-major; hex "#RRGGBB" o null (transparente).',
      },
    },
    required: ['N', 'pixels', 'palette'],
    additionalProperties: false,
  },
} as const;

// Subconjunto estructural de @anthropic-ai/sdk que consume el adapter. Permite
// inyectar un mock en los tests sin acoplar al tipo concreto del SDK.
interface AnthropicContentBlock {
  type: string;
  [k: string]: unknown;
}
interface AnthropicToolUseBlock extends AnthropicContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}
interface AnthropicMessage {
  content: AnthropicContentBlock[];
  stop_reason?: string | null;
}
export interface AnthropicClientLike {
  messages: { create(body: unknown): Promise<AnthropicMessage> };
}

export interface AnthropicGridAdapterOptions {
  /** API key de Anthropic (default: env ANTHROPIC_API_KEY). Ignorada si se pasa `client`. */
  apiKey?: string;
  /** Modelo de Messages API (default: DEFAULT_MODEL / env PF_ANTHROPIC_MODEL). */
  model?: string;
  /** Techo de tokens de salida (default DEFAULT_MAX_TOKENS). */
  maxTokens?: number;
  /** Cliente inyectado (tests / reuso). Si falta, se instancia @anthropic-ai/sdk perezosamente. */
  client?: AnthropicClientLike;
}

export function buildGridPrompt(input: NormalizedCharacterInput): string {
  const paletteRule = input.paletteColors?.length
    ? `Usa preferentemente esta paleta (hex): ${input.paletteColors.join(', ')}.`
    : 'Elige una paleta corta y coherente de pixel-art (<=16 colores).';
  const total = input.size * input.size;
  return [
    'Eres un artista de pixel-art profesional. Disena un sprite de personaje como grilla indexada.',
    `Personaje: ${input.prompt}`,
    `La grilla es cuadrada de ${input.size}x${input.size} (N=${input.size}).`,
    paletteRule,
    'Reglas de estilo: silueta legible, outline oscuro, luz canonica arriba-izquierda, fondo 100% transparente.',
    `Llama a la herramienta "${GRID_TOOL_NAME}" con: N=${input.size}, palette (lista de hex) y`,
    `pixels: exactamente N*N = ${total} celdas en orden fila-por-fila (arriba-izquierda a abajo-derecha).`,
    'Cada celda de pixels es un color hex "#RRGGBB" o null para pixel transparente (fondo).',
  ].join('\n');
}

/**
 * Extrae y valida la grilla del bloque tool_use de la respuesta. Tolera N ausente
 * (cae a expectedN) y celdas no-string (-> null), y exige length == N*N.
 */
export function extractGrid(message: AnthropicMessage, expectedN: number): PixelGrid {
  const block = message.content.find(
    (b): b is AnthropicToolUseBlock => b.type === 'tool_use' && b.name === GRID_TOOL_NAME,
  );
  if (!block) {
    throw new Error('anthropic-grid: la respuesta no contiene un bloque tool_use emit_grid');
  }
  const raw = block.input as Partial<PixelGrid> | null | undefined;
  const N = typeof raw?.N === 'number' ? raw.N : expectedN;
  if (!Array.isArray(raw?.pixels)) throw new Error('anthropic-grid: grid sin "pixels"');
  if (!Array.isArray(raw?.palette)) throw new Error('anthropic-grid: grid sin "palette"');
  if (raw.pixels.length !== N * N) {
    throw new Error(`anthropic-grid: esperaba ${N * N} pixeles, llego ${raw.pixels.length}`);
  }
  const pixels = raw.pixels.map((p) => (typeof p === 'string' ? p : null));
  const palette = raw.palette.filter((c): c is string => typeof c === 'string');
  return { N, pixels, palette };
}

/**
 * AnthropicGridAdapter (spec §21) — proveedor propio (`id: 'own'`). Genera un
 * sprite de personaje llamando a la Messages API de Anthropic con tool-use
 * FORZADO a un JSON schema = grilla { N, pixels[hex|null], palette }, y rasteriza
 * esa grilla a PNG local con sharp (grid-codec, espejo de png-codec).
 *
 * Proveedor SINCRONO: la generacion resuelve dentro de generateCharacter, asi que
 * providerJobId es sintetico (nanoid via @pixelforge/core) e indexa un Map
 * in-memory; getJobStatus devuelve siempre {status:'succeeded'} para ids del map y
 * downloadResult codifica la grilla a PNG. No toca runPostProcess ni el job-runner.
 */
export class AnthropicGridAdapter implements PixelProviderAdapter {
  readonly id: ProviderId = 'own';
  readonly capabilities: ProviderCapability[] = ['character'];

  private readonly apiKey?: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private client?: AnthropicClientLike;
  private readonly jobs = new Map<string, PixelGrid>();

  constructor(opts: AnthropicGridAdapterOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.model = opts.model ?? process.env.PF_ANTHROPIC_MODEL ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.client = opts.client;
  }

  async generateCharacter(input: NormalizedCharacterInput): Promise<ProviderAcceptedJob> {
    const client = await this.getClient();
    const message = await client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      tools: [GRID_TOOL],
      tool_choice: { type: 'tool', name: GRID_TOOL_NAME },
      messages: [{ role: 'user', content: buildGridPrompt(input) }],
    });
    const grid = extractGrid(message, input.size);
    const providerJobId = newId();
    this.jobs.set(providerJobId, grid);
    return { providerJobId, estimateS: 0 };
  }

  async generateAnimation(_input: NormalizedAnimationInput): Promise<ProviderAcceptedJob> {
    throw new Error('anthropic-grid: generateAnimation no implementado (capability character solamente)');
  }

  async generateTileset(_input: NormalizedTilesetInput): Promise<ProviderAcceptedJob> {
    throw new Error('anthropic-grid: generateTileset no implementado (capability character solamente)');
  }

  async getJobStatus(providerJobId: string): Promise<ProviderJobStatus> {
    // Proveedor sincrono: si el id esta en el map, el resultado ya existe.
    if (this.jobs.has(providerJobId)) return { status: 'succeeded', progress: 1 };
    return { status: 'failed', error: 'anthropic-grid: job desconocido' };
  }

  async downloadResult(providerJobId: string): Promise<ProviderResult> {
    const grid = this.jobs.get(providerJobId);
    if (!grid) throw new Error(`anthropic-grid: job ${providerJobId} sin resultado descargable`);
    const buffer = new Uint8Array(await gridToPng(grid));
    return {
      images: [
        {
          buffer,
          meta: { size: grid.N, provider: this.id, palette: grid.palette },
        },
      ],
      raw: { N: grid.N, palette: grid.palette },
    };
  }

  async cancel(providerJobId: string): Promise<void> {
    this.jobs.delete(providerJobId);
  }

  async healthcheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.getClient();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, detail: (err as Error).message };
    }
  }

  private async getClient(): Promise<AnthropicClientLike> {
    if (this.client) return this.client;
    // Import perezoso con specifier no-literal: evita resolver el modulo en build
    // (el SDK es dependencia de runtime; los tests inyectan un mock via opts.client).
    const spec: string = '@anthropic-ai/sdk';
    const mod = (await import(spec)) as {
      default: new (opts: { apiKey?: string }) => AnthropicClientLike;
    };
    const Anthropic = mod.default;
    this.client = new Anthropic({ apiKey: this.apiKey });
    return this.client;
  }
}
