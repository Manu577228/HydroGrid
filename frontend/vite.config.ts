import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const apiTarget = process.env.HYDROGRID_API_URL || 'http://localhost:8080'

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
        theme_color: '#10251e',
        background_color: '#f4f6f3',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\b/, /^\/ws\b/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { host: true, proxy: { '/api': apiTarget, '/ws': { target: apiTarget, ws: true } } },
  preview: { host: true, proxy: { '/api': apiTarget, '/ws': { target: apiTarget, ws: true } } },
})
