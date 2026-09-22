import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { configEditorPlugin } from './scripts/org/configEditorPlugin.mjs';

export default defineConfig({
  plugins: [react(), configEditorPlugin()],
  server: {
    port: 5173,
    // Not open: true. That fires on every `vite` invocation, including the
    // ones a test or a script makes. The npm scripts that mean it pass
    // --open themselves.
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      // The editor page is dev-only in practice, but building it keeps it
      // under the same lint, type and bundle checks as the app.
      input: { main: 'index.html', config: 'config.html' },
    },
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
