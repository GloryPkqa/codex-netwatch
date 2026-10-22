import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Store } from '../src/store.mjs';
import { ProcessObserver } from '../src/processes.mjs';
import { parseRange } from '../src/server.mjs';
import { requestSnapshot } from '../src/mihomo.mjs';
import { loadConfig } from '../src/config.mjs';

function temporary(t, beforeRemove = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-flow-release-'));
  t.after(() => {
    beforeRemove();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
function recorded(at) {
  return {
    at,
    duration: 1000,
    codexUp: 100,
    codexDown: 0,
    allUp: 100,
    allDown: 0,
    unknownUp: 0,
    unknownDown: 0,
    activeSessions: [],
    rows: [
      {
        key: 'connection',
        host: 'example.test',
        network: 'tcp',
        process: 'codex.exe',
        pid: 1,
        scope: 'codex',
        evidence: 'process',
        rule: 'Match',
        up: 100,
        down: 0,
      },
    ],
  };
}
test('custom historical end boundary excludes the following minute', () => {
  const range = parseRange(new URL('http://local/?from=60000&to=120000'), 1000000, 0);
  assert.equal(range.to, 119999);
});
test('replaying a committed sample does not double-add connection bytes', (t) => {
  let store;
  store = new Store(temporary(t, () => store?.close()));
  store.record(recorded(61000));
  store.record(recorded(61000));
  assert.equal(
    store.connections(60000, 119999, 'codex')[0].up,
    store.totals(60000, 119999).codex_up,
  );
});
test('historical connection activity does not point to a later observation', (t) => {
  let store;
  store = new Store(temporary(t, () => store?.close()));
  store.record(recorded(61000));
  store.record(recorded(181000));
  assert.equal(store.connections(60000, 119999, 'codex')[0].last_seen, 61000);
});
test('named Mihomo child processes can still be recognised through Windows ancestry', () => {
  const observer = new ProcessObserver({ processNames: ['codex.exe'], includeDescendants: true });
  observer.at = 10000;
  observer.processes = new Map([
    [1, { pid: 1, ppid: 0, name: 'codex.exe', born: 1 }],
    [2, { pid: 2, ppid: 1, name: 'node.exe', born: 2 }],
  ]);
  observer.sockets.set('tcp:5000', [{ ip: '127.0.0.1', port: 5000, pid: 2 }]);
  const result = observer.classify(
    { process: 'node.exe', network: 'tcp', sourceIP: '127.0.0.1', sourcePort: '5000' },
    11000,
  );
  assert.equal(result.scope, 'codex');
  assert.equal(result.evidence, 'descendant');
});
test('demo stays isolated when a custom data directory is supplied', (t) => {
  const dir = temporary(t),
    previous = process.argv;
  try {
    process.argv = [...previous, '--demo'];
    assert.equal(loadConfig(dir, { CODEX_FLOW_DATA_DIR: dir }).dataDir, path.join(dir, 'demo'));
  } finally {
    process.argv = previous;
  }
});
test('controller deadline cannot be bypassed by a continuously trickling response', async (t) => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    let count = 0;
    const timer = setInterval(() => {
      res.write(' ');
      if (++count === 15) {
        clearInterval(timer);
        res.end('{"uploadTotal":0,"downloadTotal":0,"connections":[]}');
      }
    }, 20);
    res.on('close', () => clearInterval(timer));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  await assert.rejects(
    requestSnapshot({ endpoint: `127.0.0.1:${server.address().port}`, secret: '' }, 80),
    /timeout/i,
  );
});
