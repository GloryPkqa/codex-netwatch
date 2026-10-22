import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Monitor } from '../src/monitor.mjs';
import { requestSnapshot } from '../src/mihomo.mjs';

test('controller rediscovery starts a baseline even without a failed polling tick', async (t) => {
  const captured = [];
  const store = {
    get: (_, fallback) => fallback,
    record: (s) => captured.push(s),
    prune: () => {},
    alert: () => {},
  };
  const monitor = new Monitor(
    { intervalMs: 1000, retentionDays: 30, alertMBPerMinute: 100, demo: false },
    store,
  );
  t.after(() => monitor.stop());
  monitor.lastSessionRefresh = Date.now();
  monitor.observer.classify = () => ({
    scope: 'codex',
    process: 'codex.exe',
    evidence: 'process',
    pid: 1,
  });
  let up = 1000;
  monitor.source = {
    generation: 1,
    snapshot: async () => ({
      uploadTotal: up,
      downloadTotal: 0,
      connections: [
        { id: 'one', start: new Date(0).toISOString(), upload: up, download: 0, metadata: {} },
      ],
    }),
  };
  await monitor.tick();
  clearTimeout(monitor.timer);
  up = 1100;
  await monitor.tick();
  clearTimeout(monitor.timer);
  assert.equal(captured[1].codexUp, 100);
  monitor.source.generation++;
  up = 9000000;
  await monitor.tick();
  clearTimeout(monitor.timer);
  assert.equal(captured[2].codexUp, 0);
  assert.equal(captured[2].allUp, 0);
});

test('controller adapter sends read-only GET and accepts authenticated local snapshots', async (t) => {
  let request;
  const server = http.createServer((req, res) => {
    request = { method: req.method, path: req.url, auth: req.headers.authorization };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ uploadTotal: 10, downloadTotal: 20, connections: [] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const data = await requestSnapshot({
    endpoint: `http://127.0.0.1:${server.address().port}`,
    secret: 'synthetic-test-secret',
  });
  assert.equal(data.uploadTotal, 10);
  assert.deepEqual(request, {
    method: 'GET',
    path: '/connections',
    auth: 'Bearer synthetic-test-secret',
  });
});
