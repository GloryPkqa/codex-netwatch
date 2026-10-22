import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { createServer, parseRange, csvCell } from '../src/server.mjs';
import { validateEndpoint } from '../src/mihomo.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('controllers are restricted to local HTTP or Windows named pipes', () => {
  assert.equal(validateEndpoint('127.0.0.1:9090').port, '9090');
  assert.equal(validateEndpoint('\\\\.\\pipe\\mihomo').socketPath, '\\\\.\\pipe\\mihomo');
  for (const url of [
    'http://example.org:9090',
    'http://127.0.0.1:9090/secrets',
    'http://user:pass@localhost:9090',
    'https://localhost:9090',
  ])
    assert.throws(() => validateEndpoint(url));
});
test('range validation aligns minute buckets and rejects invalid queries', () => {
  assert.equal(parseRange(new URL('http://x/?range=15m'), 1000000, 0).from, 60000);
  assert.throws(() => parseRange(new URL('http://x/?from=NaN'), 1000000, 0));
  assert.throws(() => parseRange(new URL('http://x/?from=10&to=5'), 1000000, 0));
});
test('CSV quoting neutralizes spreadsheet formulas and preserves commas', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('hello,world'), '"hello,world"');
});
test('local server enforces Host, Origin and custom client header; settings persist', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-flow-http-')),
    store = new Store(dir);
  const monitor = {
    state: 'connected',
    status: () => ({ state: 'connected' }),
    setThreshold: (v) => store.set('threshold', v),
  };
  const server = createServer({ root, port: 43128 }, store, monitor, () => {});
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise((r) => {
      server.close(r);
      server.closeAllConnections();
    });
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
  assert.equal((await fetch(`${url}/api/dashboard`)).status, 403);
  const h = { 'X-Codex-Flow': '1' };
  assert.equal((await fetch(`${url}/api/dashboard`, { headers: h })).status, 200);
  assert.equal(
    (
      await fetch(`${url}/api/settings`, {
        method: 'POST',
        headers: { ...h, Origin: 'https://example.org' },
        body: '{"alertMBPerMinute":5}',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${url}/api/settings`, {
        method: 'POST',
        headers: h,
        body: '{"alertMBPerMinute":5}',
      })
    ).status,
    200,
  );
  assert.equal(store.get('threshold', 0), 5);
  assert.equal(
    (
      await fetch(`${url}/api/settings`, {
        method: 'POST',
        headers: h,
        body: '{"alertMBPerMinute":-1}',
      })
    ).status,
    400,
  );
  const body = await (await fetch(`${url}/`)).text();
  assert.match(body, /Codex Netwatch/);
  assert.equal((await fetch(`${url}/missing`)).status, 404);
  const status = await new Promise((resolve, reject) => {
    http
      .get(`${url}/api/health`, { headers: { Host: 'attacker.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      })
      .on('error', reject);
  });
  assert.equal(status, 403);
  const malformed = await new Promise((resolve, reject) => {
    http
      .get(
        {
          hostname: '127.0.0.1',
          port: server.address().port,
          path: 'http://[',
          headers: { Host: `127.0.0.1:${server.address().port}` },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      )
      .on('error', reject);
  });
  assert.equal(malformed, 400);
  assert.equal(
    (await fetch(`${url}/api/settings`, { method: 'POST', headers: h, body: 'x'.repeat(5000) }))
      .status,
    413,
  );
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
});
