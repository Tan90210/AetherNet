import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const proxyTarget = process.env.VITE_PROXY_TARGET || process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
        configure(proxy) {
          proxy.on('error', (err, req) => {
            const sanitizedUrl=String(req.url || '').replace(/token=[^&]+/i, 'token=<redacted>');
            const code=err?.code || 'PROXY_ERROR';
            console.error(`[vite-proxy] ${req.method || 'GET'} ${sanitizedUrl} -> ${proxyTarget} (${code})`);
          });
        },
      },
    },
  },
});
