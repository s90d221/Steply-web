const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
const fs = require('fs');
const path = require('path');

const serverPort = Number(process.env.PORT || 3000);
const serverProtocol = process.env.STEPLY_INSECURE_HTTP === '1' ? 'http' : 'https';
const apiTarget = `${serverProtocol}://localhost:${serverPort}`;

function copyPublicWithoutDemoVideos() {
  let resolvedConfig;

  function copyDirectory(sourceDir, targetDir) {
    if (!fs.existsSync(sourceDir)) return;
    fs.mkdirSync(targetDir, { recursive: true });

    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      if (entry.name === 'demo-videos') continue;

      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        copyDirectory(sourcePath, targetPath);
      } else if (entry.isFile()) {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  return {
    name: 'copy-public-without-demo-videos',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config;
    },
    closeBundle() {
      const publicDir = path.resolve(resolvedConfig.root, 'public');
      const outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);
      copyDirectory(publicDir, outDir);
    },
  };
}

module.exports = defineConfig(({ command }) => ({
  root: 'client',
  publicDir: command === 'build' ? false : 'public',
  plugins: [react(), copyPublicWithoutDemoVideos()],
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
}));
