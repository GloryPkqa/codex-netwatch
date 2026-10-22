import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { Store } from './store.mjs';
import { Monitor } from './monitor.mjs';
import { createServer } from './server.mjs';
import { acquireInstance } from './instance.mjs';
import { detectSystemLocale } from './locale.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let config;
try {
  config = loadConfig(root);
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exit(1);
}
let instance, store;
try {
  instance = acquireInstance(config.dataDir);
  store = new Store(config.dataDir);
} catch (error) {
  instance?.release();
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
}
process.once('exit', () => instance.release());
const monitor = new Monitor(config, store);
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  monitor.stop();
  server.close(() => {
    store.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 3000).unref();
}
config.systemLocale = detectSystemLocale();
const server = createServer(config, store, monitor, shutdown);
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${config.port} is already in use. Open http://127.0.0.1:${config.port} or change CODEX_FLOW_PORT.`
      : `Server error: ${error.code}`,
  );
  monitor.stop();
  store.close();
  process.exit(1);
});
server.listen(config.port, '127.0.0.1', () => {
  console.log(`Codex Netwatch ${config.demo ? '[DEMO]' : ''} http://127.0.0.1:${config.port}`);
  console.log('Only local observation. Press Ctrl+C or use the dashboard to stop.');
  monitor.start();
});
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
