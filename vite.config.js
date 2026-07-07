const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

const serverPort = Number(process.env.PORT || 3000);
const serverProtocol = process.env.STEPLY_INSECURE_HTTP === '1' ? 'http' : 'https';
const apiTarget = `${serverProtocol}://localhost:${serverPort}`;

module.exports = defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.CLIENT_PORT || 5173),
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: apiTarget,
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
