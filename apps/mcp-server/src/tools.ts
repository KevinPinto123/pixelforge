import { CreateProjectInputSchema } from '@pixelforge/contracts';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PixelForgeRestClient } from './rest-client.js';

const OpenProjectInputShape = { projectId: z.string().min(1) };

/** Tools MCP de Fase 0 (spec §13 tarea 5): ping, create_project, open_project. Thin client: cero logica de dominio, solo REST + respuesta compacta. */
export function registerTools(server: McpServer, client: PixelForgeRestClient): void {
  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description: 'Verifica que el MCP server y el backend pixelforge responden.',
      inputSchema: {},
    },
    async () => {
      const health = await client.healthz();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ pong: true, backend: health }),
          },
        ],
      };
    },
  );

  server.registerTool(
    'create_project',
    {
      title: 'Create project',
      description: 'Crea un proyecto PixelForge nuevo (name, canvasSize, engineTargets).',
      inputSchema: CreateProjectInputSchema.shape,
    },
    async (input) => {
      const project = await client.createProject(input);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              projectId: project.id,
              name: project.name,
              engineTargets: project.engineTargets,
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    'open_project',
    {
      title: 'Open project',
      description: 'Abre un proyecto PixelForge existente por projectId y devuelve un resumen.',
      inputSchema: OpenProjectInputShape,
    },
    async ({ projectId }) => {
      const project = await client.getProject(projectId);
      return {
        content: [{ type: 'text', text: JSON.stringify(project) }],
      };
    },
  );
}
