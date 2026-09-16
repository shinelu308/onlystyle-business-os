import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // 开发期把 /api 与 /uploads 转给 BOS（biz-os/backend，3100）
  // 生产环境由 nginx 同域反代，前端代码里始终用相对路径 /api/*
  server: {
    port: 3200,
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3100', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:3100', changeOrigin: true },
    },
  },
  // preview 也要配，否则验证「接口模式」时后端明明起着却连不上
  preview: {
    port: 3201,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3100', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:3100', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    // ⚠️ 构建产物放 static/，别用默认的 assets/ ——
    //    public/media 会原样拷到 dist 根，撞名会把素材和 chunk 混在一个目录里
    assetsDir: 'static',
    emptyOutDir: true,
  },
})
