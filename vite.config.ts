import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// `--mode desktop` builds the copy that ships inside the desktop app: no service worker (the app
// is already on your computer), and its own output folder so it never mixes with the web build.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      disable: mode === 'desktop',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Scribble',
        short_name: 'Scribble',
        description: 'A paper-feel writing desk for novels and stories.',
        theme_color: '#fdf6e3',
        background_color: '#fdf6e3',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Fonts ship many alphabets; precache only Latin so the offline app stays small.
        globPatterns: ['**/*.{js,css,html,svg,png}', '**/*-latin-*.woff2'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: { host: true },
  // The editor (ProseMirror) is most of the bundle; the service worker caches it after the first visit.
  build: { chunkSizeWarningLimit: 900, outDir: mode === 'desktop' ? 'dist-desktop' : 'dist' },
}))
