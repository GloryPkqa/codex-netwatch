import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.mjs';
import { MihomoSource } from '../src/mihomo.mjs';
import { ProcessObserver } from '../src/processes.mjs';
const config = loadConfig(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const observer = new ProcessObserver(config);
observer.start();
const report = { app: 'codex-flow', node: process.version, platform: process.platform };
try {
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const source = new MihomoSource(config),
    snapshot = await source.snapshot();
  const classified = snapshot.connections.map((c) => observer.classify(c.metadata));
  report.controller = {
    connected: true,
    transport: source.endpoint,
    connections: snapshot.connections.length,
  };
  report.processObserver = {
    state: observer.status,
    codexConnections: classified.filter((x) => x?.scope === 'codex').length,
    unrecognised: classified.filter((x) => !x).length,
  };
} catch {
  report.controller = {
    connected: false,
    hint: 'Check local controller, MIHOMO_SECRET, and proxy process.',
  };
  process.exitCode = 1;
} finally {
  observer.stop();
}
console.log(JSON.stringify(report, null, 2));
