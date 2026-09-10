import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Read env (VITE_API_BASE_URL) from the repo-root .env file.
  envDir: '..',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          gsap: ['gsap'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
})