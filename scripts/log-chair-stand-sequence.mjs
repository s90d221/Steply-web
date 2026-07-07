import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function usage() {
  console.log('Usage: npm run chair:log -- <pose-sequence.json> [--json]');
  console.log('Accepted JSON shapes: frame array, { "frames": [...] }, or { "landmarkSeries": { "frames": [...] } }.');
}

const inputPath = process.argv.find((arg) => arg.endsWith('.json'));
const printJson = process.argv.includes('--json');

if (!inputPath) {
  usage();
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), inputPath);
const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});

try {
  const {
    analyzeChairStandSeries,
    formatChairStandResultLog,
  } = await server.ssrLoadModule('/client/src/pose/chairStandAnalyzer.js');
  const result = analyzeChairStandSeries(payload);
  console.log(formatChairStandResultLog(result));
  if (printJson) {
    console.log(JSON.stringify(result.chairStandResult || result, null, 2));
  }
} finally {
  await server.close();
}
