import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api/taskade': {
        target: 'https://www.taskade.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/taskade/, '/api/v1'),
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
})
