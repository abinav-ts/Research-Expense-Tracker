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
        // REQ-OFF-03: appear in the share sheet for images, PDFs and text (Android Chrome, app installed).
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'files', accept: ['image/*', 'application/pdf'] }] },
        },
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // ~7 MB of recognition data is cached on demand in the background (REQ-OFF-05), not at install.
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], globIgnores: ['ocr/**'] },
    }),
    cloudflare(),
  ],
});
