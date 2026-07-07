const http = require('http');
const https = require('https');
const { PORT } = require('./src/config/env');
const { getLocalIps, getPreferredLocalIp } = require('./src/utils/network');
const { ensureTlsCertificate } = require('./src/utils/devTls');
const { ensureDataFiles } = require('./src/repositories/historyRepository');
const { requestHandler } = require('./src/routes/apiRouter');
const { attachDashboardWebSocket } = require('./src/ws/dashboardSocket');

function shouldUseHttps() {
  return process.env.STEPLY_INSECURE_HTTP !== '1';
}

function startServer() {
  ensureDataFiles();

  const secure = shouldUseHttps();
  let tls = null;
  if (secure) {
    tls = ensureTlsCertificate([getPreferredLocalIp()].filter(Boolean));
    process.env.STEPLY_SERVER_PROTOCOL = 'https';
    process.env.STEPLY_TLS_CERT_SHA256 = tls.certSha256;
  } else {
    process.env.STEPLY_SERVER_PROTOCOL = 'http';
    delete process.env.STEPLY_TLS_CERT_SHA256;
  }

  const server = secure
    ? https.createServer({ key: tls.key, cert: tls.cert }, requestHandler)
    : http.createServer(requestHandler);
  attachDashboardWebSocket(server);

  server.listen(PORT, '0.0.0.0', () => {
    const protocol = secure ? 'https' : 'http';
    console.log(`\nSteply-Web dashboard running on ${protocol}://localhost:${PORT}`);
    for (const ip of getLocalIps()) {
      console.log(`Dashboard: ${protocol}://${ip}:${PORT}/`);
    }
    if (tls?.certSha256) {
      console.log(`TLS certificate SHA-256: ${tls.certSha256}`);
    }
    console.log('\nUse the IP address above from the mobile app on the same Wi-Fi network.\n');
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer,
};
