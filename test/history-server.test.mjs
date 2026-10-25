import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { createServer } from '../src/server.mjs';
test('calendar/report validate their periods; mini/update installation require desktop ownership', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netwatch-history-api-'));
  const store = new Store(dir), token = 'a'.repeat(64);
  const root = fileURLToPath(new URL('..', import.meta.url));
  const monitor = { state: 'connected', status: () => ({ state: 'connected', upRate: 1, downRate: 2 }) };
  const server = createServer({ root, dataDir: dir, desktopToken: token, demo: true }, store, monitor, () => {});
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => { server.close(r); server.closeAllConnections(); }); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}`, headers = { 'X-Codex-Flow': '1' };
  const get = (route, extra = {}) => fetch(url + route, { headers, ...extra });
  assert.equal((await get('/api/calendar?month=2026-02&scope=codex')).status, 200);
  assert.equal((await (await get('/api/calendar?month=2026-02')).json()).days.length, 28);
  for (const query of ['/api/calendar?month=2026-13', '/api/calendar?month=2026-02&scope=unknown',
    '/api/report?kind=day&date=2026-02-30', '/api/report?kind=day&date=2099-01-01', '/api/report?kind=month&date=2026-01-01'])
    assert.equal((await get(query)).status, 400, query);
  assert.equal((await get('/api/report?kind=week&date=2026-01-01&scope=all')).status, 200);
  assert.equal((await get('/api/mini')).status, 403);
  assert.equal((await get('/api/mini', { headers: { ...headers, 'X-Codex-Desktop-Token': token } })).status, 200);
  const update = await (await get('/api/update')).json();
  assert.equal(update.state, 'idle'); assert.equal(update.canInstall, false);
  assert.equal((await get('/api/update/install', { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await get('/api/update/install', { method: 'POST', body: '{"version":"9.0.0"}',
    headers: { ...headers, 'X-Codex-Desktop-Token': token } })).status, 409);
});
