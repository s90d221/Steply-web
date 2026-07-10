const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const files = [
  'server.js',
  'vite.config.js',
  'scripts/dev.js',
  'src/routes/apiRouter.js',
  'src/ws/dashboardSocket.js',
  'src/services/sessionService.js',
  'src/utils/devTls.js',
  'src/utils/network.js',
];

for (const file of files) {
  execFileSync('node', ['--check', file], { stdio: 'inherit' });
}

execFileSync('node', ['scripts/check-chair-stand-count.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-four-stage-balance-protocol.mjs'], { stdio: 'inherit' });

function walk(dir) {
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(p)) console.log(`checked frontend source: ${path.relative(process.cwd(), p)}`);
  }
}

walk(path.join(process.cwd(), 'client', 'src'));

async function checkMobileQrContract() {
  const sessionService = require('../src/services/sessionService');
  const analysisService = require('../src/services/analysisService');
  const historyRepository = require('../src/repositories/historyRepository');
  const { HISTORY_PATH } = require('../src/config/env');
  const tlsCertSha256 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const bundle = await sessionService.createSession(
    'https://127.0.0.1:3000',
    ['https://127.0.0.1:3000'],
    { tlsCertSha256 },
  );

  const payload = JSON.parse(bundle.qrPayload);
  assert.strictEqual(payload.type, 'steply-web-session');
  assert.strictEqual(payload.serverUrl.startsWith('https://'), true);
  assert.strictEqual(payload.tlsCertSha256, tlsCertSha256);
  assert.strictEqual(typeof payload.expiresAtEpochMs, 'number');
  assert.strictEqual(payload.pairingToken.length >= 16, true);
  assert.strictEqual(bundle.dashboardWsPath, `/ws?sessionId=${payload.sessionId}&role=dashboard`);
  assert.strictEqual(bundle.wsUrl.startsWith('wss://'), true);

  const profile = { id: 'check-profile', displayName: 'Check Profile' };
  const connected = sessionService.connectProfile(bundle.session.id, profile, payload.pairingToken);
  assert.strictEqual(Boolean(connected.error), false);
  const final = analysisService.saveFinalResult({
    sessionId: bundle.session.id,
    userId: profile.id,
    testType: 'chair_stand',
    primaryValue: 10,
  });
  assert.strictEqual(Boolean(final.error), false);
  assert.strictEqual(historyRepository.readHistory().items.length, 1);

  const replay = sessionService.connectProfile(bundle.session.id, profile, payload.pairingToken);
  assert.strictEqual(replay.status, 409);

  const cleanup = sessionService.cleanupSession(bundle.session.id, payload.pairingToken, 'check-cleanup');
  assert.strictEqual(Boolean(cleanup.error), false);
  assert.strictEqual(cleanup.session.profile, null);
  assert.strictEqual(cleanup.session.finalResult, null);
  assert.strictEqual(historyRepository.readHistory().items.length, 0);
  assert.strictEqual(fs.existsSync(HISTORY_PATH), false);
}

checkMobileQrContract()
  .then(() => {
    console.log('Mobile QR contract checks passed.');
    console.log('Basic Node syntax checks passed. Run npm run build after npm install to validate the React bundle.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
