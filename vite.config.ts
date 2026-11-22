import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'manifest.webmanifest'],
      manifest: {
        name: 'Where is my BUS — Live Transit & Route Tracker',
        short_name: 'Where is my BUS',
        description:
          'Real-time bus number tracking, live GPS stop timelines, saved favorite routes, offline UPI QR passes & proximity alarms.',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#18181B',
        theme_color: '#18181B',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Web Fonts (Google Fonts stylesheets & woff2 files)
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wimb-web-fonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Map Raster / Vector Tiles (14-day SWR cache, max 500 entries)
            urlPattern:
              /^https:\/\/(?:[a-c]\.)?tile\.openstreetmap\.org\/.*|^https:\/\/.*\.basemaps\.cartocdn\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'wimb-map-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 14, // 14 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Timetable, Stop Sequence & Transit Routing API Endpoints (24h NetworkFirst)
            urlPattern:
              /^https:\/\/(?:overpass-api\.de|router\.project-osrm\.org|nominatim\.openstreetmap\.org)\/.*|\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'wimb-transit-schedules',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
});
