#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ensureBackend } from './backend-supervisor.js';
import { PixelForgeRestClient } from './rest-client.js';
import { registerTools } from './tools.js';

const BASE_URL = process.env.PF_BACKEND_URL ?? `http://127.0.0.1:${process.env.PF_PORT ?? 7710}/v1`.replace(/\/v1$/, '');

async function main(): Promise<void> {
  const token = await ensureBackend(BASE_URL);
  const client = new PixelForgeRestClient(BASE_URL, token);

  const server = new McpServer({ name: 'pixelforge', version: '0.1.0' });
  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error('[pixelforge-mcp]', err);
  process.exit(1);
});
