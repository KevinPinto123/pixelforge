import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { PixelForgeRestClient } from '../src/rest-client.js';
import { registerTools } from '../src/tools.js';

type Handler = (input: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;

function fakeServer() {
  const handlers = new Map<string, Handler>();
  const configs = new Map<string, { inputSchema: unknown }>();
  const server = {
    registerTool: (name: string, config: { inputSchema: unknown }, handler: Handler) => {
      handlers.set(name, handler);
      configs.set(name, config);
    },
  };
  return { server: server as unknown as McpServer, handlers, configs };
}

describe('mcp tools', () => {
  it('registra ping, create_project y open_project', () => {
    const { server, handlers } = fakeServer();
    const client = {} as PixelForgeRestClient;
    registerTools(server, client);
    expect([...handlers.keys()]).toEqual(['ping', 'create_project', 'open_project']);
  });

  it('ping llama healthz y lo devuelve como texto', async () => {
    const { server, handlers } = fakeServer();
    const client = { healthz: vi.fn().mockResolvedValue({ ok: true, version: '0.1.0', providers: [] }) };
    registerTools(server, client as unknown as PixelForgeRestClient);
    const result = await handlers.get('ping')!({});
    expect(client.healthz).toHaveBeenCalled();
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ pong: true });
  });

  it('create_project delega al REST client y responde projectId compacto', async () => {
    const { server, handlers } = fakeServer();
    const client = {
      createProject: vi.fn().mockResolvedValue({
        id: 'proj-1',
        name: 'npc-pack',
        engineTargets: ['godot'],
      }),
    };
    registerTools(server, client as unknown as PixelForgeRestClient);
    const result = await handlers.get('create_project')!({ name: 'npc-pack' });
    expect(client.createProject).toHaveBeenCalledWith({ name: 'npc-pack' });
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      projectId: 'proj-1',
      name: 'npc-pack',
      engineTargets: ['godot'],
    });
  });

  it('open_project pide el projectId y devuelve el project completo', async () => {
    const { server, handlers } = fakeServer();
    const client = { getProject: vi.fn().mockResolvedValue({ id: 'proj-1', name: 'npc-pack' }) };
    registerTools(server, client as unknown as PixelForgeRestClient);
    const result = await handlers.get('open_project')!({ projectId: 'proj-1' });
    expect(client.getProject).toHaveBeenCalledWith('proj-1');
    expect(JSON.parse(result.content[0]!.text).id).toBe('proj-1');
  });
});
