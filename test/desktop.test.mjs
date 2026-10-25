import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupBridge, createMiniBridge } from '../public/desktop.js';

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

test('mini-window is desktop-only and matches bounded actions and state replies', async () => {
  assert.equal(createMiniBridge(undefined), null);
  const f = fixture(), bridge = createMiniBridge(f.channel, 1000);
  const show = bridge.show('zh-CN');
  assert.deepEqual(f.sent[0], { type: 'netwatch:mini', id: 'mini-1', action: 'show', language: 'zh-CN' });
  f.reply({ type: 'netwatch:startup:result', id: 'mini-1', ok: true, enabled: true });
  f.reply({ type: 'netwatch:mini:result', id: 'mini-1', ok: true, state: { visible: 'true', pinned: true, collapsed: false } });
  f.reply({ type: 'netwatch:mini:result', id: 'mini-1', ok: true, state: { visible: true, pinned: true, collapsed: false, extra: 'ignored' } });
  assert.deepEqual(await show, { visible: true, pinned: true, collapsed: false });
  await assert.rejects(bridge.show('javascript:run'), TypeError);
  assert.equal(f.sent.length, 1);
  const hide = bridge.hide();
  f.reply({ type: 'netwatch:mini:result', id: f.sent[1].id, ok: true, state: { visible: false, pinned: true, collapsed: true } });
  assert.equal((await hide).visible, false);
});

test('mini-window reports host failure and expires unavailable requests', async () => {
  const f = fixture(), bridge = createMiniBridge(f.channel, 10);
  const get = bridge.get();
  f.reply({ type: 'netwatch:mini:result', id: f.sent[0].id, ok: false });
  await assert.rejects(get, /mini_failed/);
  await assert.rejects(bridge.show(), /mini_timeout/);
});
