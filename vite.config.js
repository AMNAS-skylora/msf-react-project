import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// onnxruntime-web and its subpath exports (e.g. onnxruntime-web/webgpu) are
// loaded lazily at runtime by @imgly/background-removal via dynamic import().
// Telling esbuild/Rollup to treat them as external leaves those dynamic
// imports intact so the browser resolves them from node_modules at runtime.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['onnxruntime-web', '@imgly/background-removal'],
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      external: ['onnxruntime-web', 'onnxruntime-web/webgpu'],
    },
  },
});
