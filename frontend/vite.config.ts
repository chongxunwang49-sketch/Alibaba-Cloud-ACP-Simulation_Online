import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // 生产由 Nginx 反代 /api → 127.0.0.1:3004；本地开发用 Vite 同构代理。
      // 不做 rewrite，保留 /api 前缀，与后端 Express 挂载路径一致。
      '/api': { target: 'http://127.0.0.1:3004', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['vue', 'vue-router'] },
      },
    },
  },
})
