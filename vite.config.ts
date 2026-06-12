import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/taipei': {
        target: 'https://data.taipei',
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/api\/taipei/, '/api/frontstage/tpeod'),
      },
    },
  },
});
