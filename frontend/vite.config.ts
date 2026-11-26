import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const apiTarget = process.env.HYDROGRID_API_URL || 'http://localhost:8081'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      manifest: {
        name: 'HydroGrid Disaster Response',
        short_name: 'HydroGrid',
        description: 'A simulated disaster response and offline reporting workspace.',
        theme_color: '#07111e',
        background_color: '#07111e',
        display: 'standalone',
        icons: [
          { src: '/icon-hydrogrid-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-hydrogrid-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,json,png,webp,woff2}'],
        navigateFallbackDenylist: [/^\/api\b/, /^\/ws\b/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { host: true, proxy: { '/api': apiTarget, '/ws': { target: apiTarget, ws: true } } },
  preview: { host: true, proxy: { '/api': apiTarget, '/ws': { target: apiTarget, ws: true } } },
})
