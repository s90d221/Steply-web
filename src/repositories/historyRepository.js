const fs = require('fs');
const { HISTORY_PATH } = require('../config/env');

let transientHistoryItems = [];

// The phone app is the only persistent personal-history store. The PC keeps
// final results in process memory only while a session is active.
function ensureDataFiles() {
  if (fs.existsSync(HISTORY_PATH)) {
    fs.unlinkSync(HISTORY_PATH);
  }
}

function readHistory() {
  ensureDataFiles();
  return { items: transientHistoryItems.slice() };
}

function addHistoryItem(item) {
  transientHistoryItems.unshift(item);
  return item;
}

function removeHistoryBySessionId(sessionId) {
  transientHistoryItems = transientHistoryItems.filter((item) => item.sessionId !== sessionId);
}

function findHistoryByUserId(userId) {
  const history = readHistory();
  return history.items.filter((item) => item.userId === userId || item.profile?.id === userId);
}

module.exports = {
  ensureDataFiles,
  readHistory,
  addHistoryItem,
  removeHistoryBySessionId,
  findHistoryByUserId,
};
