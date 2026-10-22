import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'ENROLL-AI',
        short_name: 'ENROLL-AI',
        description: 'Automated Student Photo Capture — Simple, Fast & Accurate',
        theme_color: '#102b28',
        background_color: '#f5f7f6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 20000000,
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,tflite,json}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          spreadsheets: ['xlsx'],
          archive: ['jszip'],
          vision: ['@mediapipe/tasks-vision'],
        },
      },
    },
  },
});
