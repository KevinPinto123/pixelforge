import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // postprocess usa node:test deliberadamente; Vitest solo descubre los
    // workspaces que exponen una configuracion Vitest propia.
    projects: [
      'packages/contracts',
      'packages/core',
      'packages/providers',
      'apps/backend',
      'apps/mcp-server',
      'apps/editor',
      'tools',
    ],
  },
});
