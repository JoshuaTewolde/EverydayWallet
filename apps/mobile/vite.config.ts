import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The APK loads the built app from disk, so API calls go to VITE_API_URL (absolute).
// In browser dev, /api is proxied to the local server.
export default defineConfig({
  plugins: [react()],
  envDir: '../../',
  define: { global: 'globalThis' },
  // Breez loads its WASM relative to its own module; pre-bundling breaks that in dev.
  optimizeDeps: { exclude: ['@breeztech/breez-sdk-spark'] },
  server: {
    port: 5174,
    host: true,
    proxy: { '/api': process.env.TAP_SERVER ?? 'http://localhost:8788' },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
