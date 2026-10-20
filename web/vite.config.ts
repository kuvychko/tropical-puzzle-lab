import { defineConfig } from 'vitest/config';

// Served from https://<user>.github.io/tropical-puzzle-lab/ on GitHub Pages; dev and preview use the same base.
export default defineConfig({
  base: '/tropical-puzzle-lab/',
  build: { chunkSizeWarningLimit: 800 },
  test: { environment: 'node' },
});
