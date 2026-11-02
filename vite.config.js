import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ONNX Runtime must be bundled as a browser-resolvable dependency.
// Marking it as external leaves a bare "onnxruntime-web" import in the
// production JS, which Safari/Chrome cannot load as a valid URL.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['onnxruntime-web'],
  },
  build: {
    target: 'es2022',
  },
});
