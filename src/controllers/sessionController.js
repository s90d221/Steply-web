const { getServerBaseUrl, getCandidateServerUrls } = require('../utils/network');
const { readBodyJson, sendJson } = require('../utils/http');
const sessionService = require('../services/sessionService');

async function createSession(req, res) {
  const serverUrl = getServerBaseUrl(req);
  const data = await sessionService.createSession(serverUrl, getCandidateServerUrls(req));
  sendJson(res, 200, data);
}

async function connectSession(req, res, sessionId) {
  const body = await readBodyJson(req);
  if (body.sessionId && body.sessionId !== sessionId) {
    return sendJson(res, 400, { error: 'sessionId does not match URL.' });
  }
  const profile = body.profile || body;
  const pairingToken = body.pairingToken || req.headers['x-steply-pairing-token'] || '';
  const result = sessionService.connectProfile(sessionId, profile, pairingToken);

  if (result.error) return sendJson(res, result.status, { error: result.error });
  return sendJson(res, 200, { ok: true, session: result.session });
}

async function cleanupSession(req, res, sessionId) {
  const body = await readBodyJson(req);
  if (body.sessionId && body.sessionId !== sessionId) {
    return sendJson(res, 400, { error: 'sessionId does not match URL.' });
  }
  const pairingToken = body.pairingToken || req.headers['x-steply-pairing-token'] || '';
  const reason = body.reason || 'mobile-cleanup-request';
  const result = sessionService.cleanupSession(sessionId, pairingToken, reason);

  if (result.error) return sendJson(res, result.status, { error: result.error });
  return sendJson(res, 200, { ok: true, session: result.session });
}

async function selectTest(req, res, sessionId) {
  const body = await readBodyJson(req);
  const selectedTest = body.selectedTest || body.testType;
  const result = sessionService.selectTest(sessionId, selectedTest);

  if (result.error) return sendJson(res, result.status, { error: result.error });
  return sendJson(res, 200, { ok: true, session: result.session });
}

function getSessionStatus(req, res, sessionId) {
  const session = sessionService.getSessionStatus(sessionId);
  if (!session) return sendJson(res, 404, { error: 'Session not found' });
  return sendJson(res, 200, { session });
}

module.exports = {
  createSession,
  connectSession,
  cleanupSession,
  selectTest,
  getSessionStatus,
};
