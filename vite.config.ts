import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { brandHtml, brandTokens } from './build/brand.ts';

const tokens = brandTokens();

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    brandHtml(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/client/sw',
      filename: 'sw.ts',
      injectRegister: false, // registered from src/client/app/pwa.ts
      manifest: {
        name: 'ExpRes',
        short_name: 'ExpRes',
        description: 'Privacy-first, offline-capable grant expense tracking for researchers.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: tokens['ex-ink'],
        background_color: tokens['ex-ground'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
    cloudflare(),
  ],
});
