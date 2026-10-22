import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setupState, setupCopy } from '../public/setup.js';
import { messages, translate } from '../public/i18n.js';
import { MihomoSource } from '../src/mihomo.mjs';

test('setup guidance distinguishes missing traffic from failed collection and never uses other-app bytes as success', () => {
  const connected = {
    state: 'connected',
    observer: 'ready',
    codexConnections: 0,
    unknownConnections: 0,
  };
  assert.equal(setupState(null), 'starting');
  assert.equal(setupState(connected, {}, true), 'offline');
  assert.equal(setupState({ ...connected, demo: true }), 'demo');
  assert.equal(setupState(connected, { codex_up: 0, codex_down: 0, all_up: 100000 }), 'idle');
  assert.equal(setupState({ ...connected, codexConnections: 1 }), 'baseline');
  assert.equal(setupState({ ...connected, observer: 'error' }), 'observer');
  assert.equal(
    setupState({ ...connected, observer: 'error' }, { codex_up: 50, codex_down: 5 }),
    'observer',
  );
  assert.equal(setupState({ ...connected, unknownConnections: 1 }), 'unidentified');
  assert.equal(setupState(connected, { codex_up: 5, codex_down: 0 }), 'ready');
  for (const issue of ['authorization', 'incompatible', 'unreachable', 'collection']) {
    assert.equal(
      setupState(
        { state: 'disconnected', controllerIssue: issue },
        { codex_up: 200, codex_down: 50 },
      ),
      issue,
    );
  }
  for (const copy of Object.values(setupCopy).flat()) {
    assert.ok(Object.hasOwn(messages, copy), `Missing setup translation: ${copy}`);
    assert.notEqual(translate(copy, 'en'), copy);
  }
});

test('real controller responses classify authorization, wrong ports and recovery without returning raw errors', async (t) => {
  let response = { status: 401, body: 'secret-value-must-not-leak' };
  const server = http.createServer((req, res) => {
    res.writeHead(response.status);
    res.end(response.body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const source = new MihomoSource({ controller: `127.0.0.1:${server.address().port}`, secret: '' });
  for (const status of [401, 403]) {
    response.status = status;
    await assert.rejects(source.snapshot(), (error) => !error.message.includes('secret-value'));
    assert.equal(source.issue, 'authorization');
  }
  for (const wrong of [
    { status: 404, body: 'wrong port' },
    { status: 200, body: '<html>proxy UI</html>' },
    { status: 200, body: '{}' },
  ]) {
    response = wrong;
    await assert.rejects(source.snapshot());
    assert.equal(source.issue, 'incompatible');
  }
  response = {
    status: 200,
    body: JSON.stringify({ connections: [], uploadTotal: 0, downloadTotal: 0 }),
  };
  assert.deepEqual((await source.snapshot()).connections, []);
  assert.equal(source.issue, null);
  response = { status: 401, body: '' };
  await assert.rejects(source.snapshot());
  assert.equal(source.issue, 'authorization');
});
