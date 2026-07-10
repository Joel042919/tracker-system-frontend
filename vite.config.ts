import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType:'autoUpdate',
      includeAssets:['torch.ico', 'torch.jpg', 'apple-touch-icon.png', 'robots.txt'],
      manifest:{
        name: 'BITracker',
        short_name: 'BITracker',
        description: 'Gestión personal gamificada',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/torch.ico',
            sizes: 'any',
            type: 'image/x-icon'
          },
          {
            src: '/torch.jpg',
            sizes: '512x512',
            type: 'image/jpeg'
          }
        ],
      },
      workbox:{
        globPatterns: ['**/*.{js,css,html,ico,jpg,png,svg,woff2}'],
        // No precachear la API, obviamente
        runtimeCaching: [], 
      }
    }),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
