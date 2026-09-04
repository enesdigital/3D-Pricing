import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA: çevrimdışı çalışma (tüm hesap tarayıcıda) + ana ekrana ekleme. Yeni sürüm "prompt" ile bildirilir (çalışma kesilmez).
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '3D Baskı Fiyat Hesaplama (FDM / SLA)',
        short_name: '3D Fiyat',
        description: 'STL/3MF/STEP yükleyin; FDM ve reçine yazıcılar için malzeme, süre, maliyet ve teklif. Tamamen tarayıcıda çalışır.',
        lang: 'tr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#09090b',
        theme_color: '#09090b',
        categories: ['business', 'productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Uygulama kabuğu + parçalar önbelleğe alınır; 7,6 MB occt WASM'ı ilk kullanımda çalışma zamanında saklanır
        // PDF yazı tipleri (DejaVu .ttf) de dahil: çevrimdışı teklif PDF'i üretilebilsin
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf}'],
        // occt WASM çalışma zamanında; html2canvas jsPDF'in kullanılmayan html() yolu
        globIgnores: ['**/occt-import-js*.wasm', '**/html2canvas-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: { cacheName: 'wasm-v1', expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 180 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Döviz kuru (Frankfurter/ECB): ağ öncelikli, çevrimdışı son değer
            urlPattern: ({ url }) => /frankfurter\.(app|dev)$/.test(url.hostname),
            handler: 'NetworkFirst',
            options: { cacheName: 'fx-v1', networkTimeoutSeconds: 5, expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // GitHub Pages gibi alt dizinde yayınlanacaksa VITE_BASE=/repo-adi/ ile build alın.
  base: process.env.VITE_BASE ?? '/',
  worker: { format: 'es' },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
})
