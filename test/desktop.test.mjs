import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupBridge } from '../public/desktop.js';

function fixture() {
  let receive;
  const sent = [];
  return {
    sent,
    channel: {
      addEventListener: (_, handler) => {
        receive = handler;
      },
      postMessage: (value) => sent.push(value),
    },
    reply: (data) => receive({ data }),
  };
}
test('browser has no startup capability without a desktop channel', () => {
  assert.equal(createStartupBridge(undefined), null);
  assert.equal(createStartupBridge({ postMessage() {} }), null);
});
test('startup replies match request IDs and invalid state cannot change the preference', async () => {
  const f = fixture(),
    bridge = createStartupBridge(f.channel, 1000);
  const get = bridge.get(),
    set = bridge.set(true);
  f.reply({ type: 'netwatch:startup:result', id: f.sent[1].id, ok: true, enabled: true });
  assert.equal(await set, true);
  f.reply({ type: 'netwatch:startup:result', id: 'unknown', ok: true, enabled: false });
  f.reply({ type: 'netwatch:startup:result', id: f.sent[0].id, ok: true, enabled: 'false' });
  f.reply({ type: 'netwatch:startup:result', id: f.sent[0].id, ok: true, enabled: false });
  assert.equal(await get, false);
  await assert.rejects(bridge.set('true'), TypeError);
});
test('startup failures and unavailable hosts reject without leaving a pending toggle', async () => {
  const f = fixture(),
    bridge = createStartupBridge(f.channel, 10);
  const request = bridge.set(false);
  f.reply({ type: 'netwatch:startup:result', id: f.sent[0].id, ok: false });
  await assert.rejects(request, /startup_failed/);
  await assert.rejects(bridge.get(), /startup_timeout/);
});
