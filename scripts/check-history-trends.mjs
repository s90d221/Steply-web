import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});

try {
  const { buildDemoHistoryItems } = await server.ssrLoadModule('/client/src/data/demoHistory.js');
  const {
    HistoryChallengeTypes,
    buildChallengeTrendSeries,
    latestMetric,
    trendDelta,
  } = await server.ssrLoadModule('/client/src/utils/historyTrends.js');

  const items = buildDemoHistoryItems();
  const chair = buildChallengeTrendSeries(items, HistoryChallengeTypes.ChairStand);
  const balance = buildChallengeTrendSeries(items, HistoryChallengeTypes.FourStageBalance);

  assert.equal(chair.length, 5);
  assert.equal(balance.length, 5);
  assert.ok(latestMetric(chair, 'repetitions') > chair[0].repetitions);
  assert.ok(trendDelta(chair, 'repetitions') > 0);
  assert.ok(trendDelta(balance, 'holdSeconds') > 0);
  assert.ok(trendDelta(balance, 'swayIndex', { lowerIsBetter: true }) > 0);

  console.log(`chair trend sessions=${chair.length}, latest=${latestMetric(chair, 'repetitions')} reps`);
  console.log(`balance trend sessions=${balance.length}, latest=${latestMetric(balance, 'holdSeconds')}s`);
} finally {
  await server.close();
}
