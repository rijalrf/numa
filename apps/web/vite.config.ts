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
    allowedHosts: ['numa.mrijal.my.id', 'numa.opendv.xyz'],
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem}',
        '**/.git/**',
        '**/prisma/seed.ts',
        '**/prisma/.env',
        '**/.docker/**',
        '**/node_modules/.cache/**',
      ],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_API_URL || 'http://localhost:6655',
        changeOrigin: true,
      },
    },
  },
});
