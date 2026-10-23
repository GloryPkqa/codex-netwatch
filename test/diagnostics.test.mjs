import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { createDiagnostics } from '../src/diagnostics.mjs';
import { createServer } from '../src/server.mjs';
import { VERSION } from '../src/version.mjs';

test('diagnostic export allowlist excludes identities, paths, credentials and raw errors', () => {
  const privateValue = 'PRIVATE_CANARY_never_export_9237';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), privateValue));
  const store = new Store(dir);
  try {
    const sample = {
      at: 1000,
      duration: 1000,
      codexUp: 17,
      codexDown: 3,
      allUp: 20,
      allDown: 5,
      unknownUp: 2,
      unknownDown: 0,
      activeSessions: [privateValue],
      rows: [
        {
          key: privateValue,
          host: privateValue,
          network: 'tcp',
          process: privateValue,
          pid: 999888777,
          scope: 'codex',
          evidence: 'process',
          rule: privateValue,
          up: 17,
          down: 3,
        },
      ],
    };
    store.record(sample);
    store.saveSession({
      id: privateValue,
      title: privateValue,
      model: privateValue,
      activity: 1000,
    });
    store.alert(1000, privateValue);
    const report = createDiagnostics(
      {
        dataDir: dir,
        secret: privateValue,
        desktopToken: privateValue,
        codexHome: privateValue,
        controller: privateValue,
        demo: false,
        intervalMs: 1000,
        retentionDays: 30,
      },
      store,
      {
        status: () => ({
          state: 'connected',
          observer: 'ready',
          sessionReader: 'ready',
          endpoint: privateValue,
          error: privateValue,
          connections: 1,
          codexConnections: 1,
          unknownConnections: 0,
          processes: 3,
          retentionDays: 7,
          diagnostics: {
            lastError: privateValue,
            lastPollMs: 4,
            memory: { rss: 256, secret: privateValue },
            failures: 0,
            unknown: privateValue,
          },
        }),
      },
      2000,
    );
    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes(privateValue));
    assert.ok(!serialized.includes(dir));
    assert.ok(!serialized.includes('999888777'));
    assert.equal(report.app.version, VERSION);
    assert.equal(report.collector.retentionDays, 7);
    assert.equal(report.storage.integrity, 'ok');
    assert.equal(report.last24Hours.observedCodexBytes, 20);
    assert.equal(report.collector.resources.rssBytes, 256);
    assert.equal(report.collector.resources.maxPollDurationMs, null);
    assert.equal(report.collector.resources.pollDurationMs, 4);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('diagnostic download stays local and desktop stop requires its ownership marker', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netwatch-diagnostic-api-'));
  const store = new Store(dir);
  const marker = 'ab'.repeat(32);
  let stopped;
  const shutdown = new Promise((resolve) => {
    stopped = resolve;
  });
  const monitor = {
    state: 'connected',
    status: () => ({ state: 'connected', observer: 'ready', sessionReader: 'ready' }),
  };
  const config = {
    root: fileURLToPath(new URL('..', import.meta.url)),
    dataDir: dir,
    port: 0,
    desktopToken: marker,
    intervalMs: 1000,
    retentionDays: 30,
  };
  const server = createServer(config, store, monitor, stopped);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`,
    headers = { 'X-Codex-Flow': '1' };
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.desktopInstance, marker);
  assert.equal((await fetch(base + '/api/diagnostics')).status, 403);
  assert.equal(
    (
      await fetch(base + '/api/diagnostics', {
        headers: { ...headers, Origin: 'https://example.com' },
      })
    ).status,
    403,
  );
  const download = await fetch(base + '/api/diagnostics', { headers });
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.equal(download.status, 200);
  assert.ok(!JSON.stringify(await download.json()).includes(marker));
  assert.equal(
    (await fetch(base + '/api/stop', { method: 'POST', headers, body: '{}' })).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + '/api/stop', {
        method: 'POST',
        headers: { ...headers, 'X-Codex-Desktop-Token': 'wrong' },
        body: '{}',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + '/api/stop', {
        method: 'POST',
        headers: { ...headers, 'X-Codex-Desktop-Token': marker },
        body: '{}',
      })
    ).status,
    200,
  );
  await shutdown;
});
