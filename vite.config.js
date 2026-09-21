import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.{js,jsx,mjs}'],
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    setupFiles: ['tests/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/visualizers/**', 'scripts/**'],
      reporter: ['text', 'html'],
    },
  },
});
