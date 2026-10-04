import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'editor',
    // El modelo (src/model/document.ts) es logica pura sin DOM: entorno node
    // basta. Los componentes React/canvas (Viewport) no se testean por unidad
    // aqui — su verificacion es visual/manual (spec §7).
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
