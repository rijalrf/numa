import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 3455,
    strictPort: true,
    host: true,
    // Izinkan akses lewat domain tunnel Cloudflare / reverse proxy (selain localhost).
    allowedHosts: ['pakeai.mrijal.my.id', 'pakeai.opendv.xyz'],
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_API_URL || 'http://localhost:6655',
        changeOrigin: true,
      },
    },
  },
});
