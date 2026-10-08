import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 构建产物由 business 服务在 /admin 下静态托管
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
