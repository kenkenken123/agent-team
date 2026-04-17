import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5502,
    strictPort: true,
  },
  build: {
    // 生产环境启用代码分割
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react';
            }
            if (id.includes('antd')) {
              return 'antd';
            }
            if (id.includes('zustand')) {
              return 'zustand';
            }
            if (id.includes('pixi')) {
              return 'pixi';
            }
            if (id.includes('xterm')) {
              return 'xterm';
            }
            return 'vendor';
          }
          // 游戏引擎分离
          if (id.includes('/src/office/')) {
            return 'office';
          }
        },
      },
    },
    // CSS 代码分割
    cssCodeSplit: true,
    // 开发环境保留 sourcemap，生产环境关闭
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  // 开发环境优化
  optimizeDeps: {
    include: ['react', 'react-dom', 'antd', 'zustand'],
  },
})
