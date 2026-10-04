import { describe, expect, it, vi } from 'vitest';
import {
  AnthropicGridAdapter,
  buildGridPrompt,
  extractGrid,
  type AnthropicClientLike,
} from '../src/anthropic-grid-adapter.js';
import { gridToImage, gridToPng, type PixelGrid } from '../src/grid-codec.js';
import { pngToImage } from '../src/png-codec.js';

// Grilla 2x2: (0,0) rojo, (0,1) transparente, (1,0) transparente, (1,1) verde.
const GRID_2X2: PixelGrid = {
  N: 2,
  palette: ['#ff0000', '#00ff00'],
  pixels: ['#ff0000', null, null, '#00ff00'],
};

// Espeja el envelope del SDK: Message con un bloque tool_use cuyo input es la grilla.
function toolUseMessage(grid: unknown) {
  return {
    content: [{ type: 'tool_use', id: 'toolu_grid', name: 'emit_grid', input: grid }],
    stop_reason: 'tool_use',
  };
}

function mockClient(grid: unknown): { client: AnthropicClientLike; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue(toolUseMessage(grid));
  return { client: { messages: { create } }, create };
}

describe('AnthropicGridAdapter', () => {
  it('expone el contrato del proveedor propio', () => {
    const adapter = new AnthropicGridAdapter({ apiKey: 'k', client: mockClient(GRID_2X2).client });
    expect(adapter.id).toBe('own');
    expect(adapter.capabilities).toEqual(['character']);
  });

  it('generateCharacter fuerza tool-use a emit_grid y devuelve providerJobId con estimateS 0', async () => {
    const { client, create } = mockClient(GRID_2X2);
    const adapter = new AnthropicGridAdapter({ apiKey: 'k', client });

    const accepted = await adapter.generateCharacter({
      prompt: 'campesino peruano con chullo',
      size: 2,
      directions: 1,
    });

    expect(accepted.estimateS).toBe(0);
    expect(typeof accepted.providerJobId).toBe('string');
    expect(accepted.providerJobId.length).toBeGreaterThan(0);

    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'emit_grid' });
    expect(body.model).toBe('claude-opus-4-8');
    const tools = body.tools as Array<{ name: string }>;
    expect(tools[0]!.name).toBe('emit_grid');
  });

  it('getJobStatus devuelve succeeded para ids del map y failed para desconocidos', async () => {
    const adapter = new AnthropicGridAdapter({ apiKey: 'k', client: mockClient(GRID_2X2).client });
    const { providerJobId } = await adapter.generateCharacter({ prompt: 'npc', size: 2, directions: 1 });

    expect(await adapter.getJobStatus(providerJobId)).toEqual({ status: 'succeeded', progress: 1 });
    expect((await adapter.getJobStatus('no-existe')).status).toBe('failed');
  });

  it('downloadResult codifica la grilla a PNG (null -> transparente, hex -> color)', async () => {
    const adapter = new AnthropicGridAdapter({ apiKey: 'k', client: mockClient(GRID_2X2).client });
    const { providerJobId } = await adapter.generateCharacter({ prompt: 'npc', size: 2, directions: 1 });

    const result = await adapter.downloadResult(providerJobId);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.meta).toMatchObject({ size: 2, provider: 'own' });

    const img = await pngToImage(Buffer.from(result.images[0]!.buffer));
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    // (0,0) = rojo opaco
    expect([img.data[0], img.data[1], img.data[2], img.data[3]]).toEqual([255, 0, 0, 255]);
    // (0,1) y (1,0) = transparentes (alpha 0)
    expect(img.data[7]).toBe(0);
    expect(img.data[11]).toBe(0);
    // (1,1) = verde opaco
    const o = 3 * 4;
    expect([img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]]).toEqual([0, 255, 0, 255]);
  });

  it('downloadResult rechaza ids sin resultado', async () => {
    const adapter = new AnthropicGridAdapter({ apiKey: 'k', client: mockClient(GRID_2X2).client });
    await expect(adapter.downloadResult('no-existe')).rejects.toThrow(/sin resultado descargable/);
  });

  it('cancel olvida el job (getJobStatus pasa a failed)', async () => {
    const adapter = new AnthropicGridAdapter({ apiKey: 'k', client: mockClient(GRID_2X2).client });
    const { providerJobId } = await adapter.generateCharacter({ prompt: 'npc', size: 2, directions: 1 });
    await adapter.cancel(providerJobId);
    expect((await adapter.getJobStatus(providerJobId)).status).toBe('failed');
  });

  it('generateAnimation y generateTileset lanzan (solo capability character)', async () => {
    const adapter = new AnthropicGridAdapter({ apiKey: 'k', client: mockClient(GRID_2X2).client });
    await expect(
      adapter.generateAnimation({ sourceImage: new Uint8Array(), action: 'walk', directions: 1, fps: 8 }),
    ).rejects.toThrow(/no implementado/);
    await expect(
      adapter.generateTileset({ theme: 'bosque', tileSize: 16, mode: 'topdown' }),
    ).rejects.toThrow(/no implementado/);
  });

  it('healthcheck ok=true con cliente inyectado', async () => {
    const adapter = new AnthropicGridAdapter({ apiKey: 'k', client: mockClient(GRID_2X2).client });
    expect((await adapter.healthcheck()).ok).toBe(true);
  });
});

describe('extractGrid', () => {
  it('extrae y valida la grilla del bloque tool_use', () => {
    const grid = extractGrid(toolUseMessage(GRID_2X2), 2);
    expect(grid.N).toBe(2);
    expect(grid.pixels).toHaveLength(4);
    expect(grid.palette).toEqual(['#ff0000', '#00ff00']);
  });

  it('normaliza celdas no-string a null', () => {
    const grid = extractGrid(
      toolUseMessage({ N: 2, palette: ['#fff'], pixels: ['#fff', 3, undefined, null] }),
      2,
    );
    expect(grid.pixels).toEqual(['#fff', null, null, null]);
  });

  it('falla sin bloque tool_use', () => {
    expect(() => extractGrid({ content: [{ type: 'text', text: 'hola' }] }, 2)).toThrow(/tool_use/);
  });

  it('falla si pixels no mide N*N', () => {
    expect(() =>
      extractGrid(toolUseMessage({ N: 2, palette: [], pixels: ['#fff'] }), 2),
    ).toThrow(/esperaba 4 pixeles/);
  });
});

describe('grid-codec', () => {
  it('gridToImage: null -> alpha 0, hex -> RGBA opaco', () => {
    const img = gridToImage(GRID_2X2);
    expect(img.width).toBe(2);
    expect(img.data[3]).toBe(255); // (0,0) opaco
    expect(img.data[7]).toBe(0); // (0,1) transparente
    expect([img.data[12], img.data[13], img.data[14]]).toEqual([0, 255, 0]); // (1,1) verde
  });

  it('gridToPng produce un PNG valido (firma) decodificable a las mismas dimensiones', async () => {
    const png = await gridToPng(GRID_2X2);
    expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]); // firma PNG
    const img = await pngToImage(png);
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
  });
});

describe('buildGridPrompt', () => {
  it('incluye tamano, N*N y la paleta', () => {
    const prompt = buildGridPrompt({
      prompt: 'guerrero andino',
      size: 32,
      directions: 1,
      paletteColors: ['#7c5cff'],
    });
    expect(prompt).toContain('32x32');
    expect(prompt).toContain('1024'); // N*N
    expect(prompt).toContain('#7c5cff');
    expect(prompt).toContain('guerrero andino');
  });
});
