const { sendJson } = require('../utils/http');
const historyRepository = require('../repositories/historyRepository');

function getAllHistory(req, res) {
  const history = historyRepository.readHistory();
  sendJson(res, 200, {
    ...history,
    source: {
      type: 'ephemeral_pc_session_cache',
      label: 'PC session cache',
      persistent: false,
    },
  });
}

function getHistoryByUser(req, res, userId) {
  sendJson(res, 200, {
    items: historyRepository.findHistoryByUserId(userId),
    source: {
      type: 'ephemeral_pc_session_cache',
      label: 'PC session cache',
      persistent: false,
    },
  });
}

module.exports = {
  getAllHistory,
  getHistoryByUser,
};
