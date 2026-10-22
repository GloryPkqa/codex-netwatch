import test from 'node:test';
import assert from 'node:assert/strict';
import { Accounting, counterDelta } from '../src/accounting.mjs';
const classify = () => ({ scope: 'codex', evidence: 'process', process: 'codex.exe', pid: 42 });
const snapshot = (up, down, id = 'one', start = new Date(0).toISOString()) => ({
  uploadTotal: up,
  downloadTotal: down,
  connections: [{ id, start, upload: up, download: down, metadata: { host: 'example.test' } }],
});

test('first attach baselines an existing large transfer rather than importing historical bytes', () => {
  const a = new Accounting();
  const s = a.consume(snapshot(9e9, 2e9), 10000, classify);
  assert.equal(s.codexUp, 0);
  assert.equal(s.allUp, 0);
  assert.equal(s.baseline, true);
  const next = a.consume(snapshot(9e9 + 1024, 2e9 + 512), 11000, classify);
  assert.equal(next.codexUp, 1024);
  assert.equal(next.codexDown, 512);
  assert.equal(next.allUp, 1024);
});
test('repeated cumulative counters never get summed again', () => {
  const a = new Accounting();
  a.consume(snapshot(100, 200), 10000, classify);
  assert.equal(a.consume(snapshot(100, 200), 11000, classify).codexUp, 0);
});
test('new connections beginning within an observed interval count their initial transfer', () => {
  const a = new Accounting();
  a.consume(snapshot(0, 0), 10000, classify);
  assert.equal(
    a.consume(snapshot(400, 500, 'new', new Date(10500).toISOString()), 11000, classify).codexUp,
    400,
  );
});
test('late discovery of old connections does not count pre-monitor bytes', () => {
  const a = new Accounting();
  a.consume(snapshot(0, 0), 10000, classify);
  assert.equal(a.consume(snapshot(400, 500, 'old'), 11000, classify).codexUp, 0);
});
test('counter resets produce a nonnegative post-reset delta', () => {
  assert.equal(counterDelta(50, 500), 50);
  assert.equal(counterDelta(-1, 500), 0);
});
test('reconnection baselines again and does not fabricate traffic for an offline gap', () => {
  const a = new Accounting();
  a.consume(snapshot(100, 200), 10000, classify);
  a.resetBaseline();
  const s = a.consume(snapshot(5000, 8000), 100000, classify);
  assert.equal(s.codexUp, 0);
  assert.equal(s.allDown, 0);
});
test('hostname cannot turn an unrecognised process into Codex', () => {
  const a = new Accounting();
  a.consume(snapshot(0, 0), 10000, () => null);
  const s = a.consume(snapshot(100, 200), 11000, () => null);
  assert.equal(s.codexUp, 0);
  assert.equal(s.unknownUp, 100);
});
test('overlapping session activity is kept as evidence and never splits bytes', () => {
  const a = new Accounting();
  a.consume(snapshot(0, 0), 10000, classify);
  const s = a.consume(snapshot(100, 200), 11000, classify, ['session-a', 'session-b']);
  assert.deepEqual(s.activeSessions, ['session-a', 'session-b']);
  assert.equal(s.codexUp, 100);
  assert.equal(s.rows[0].sessionId, undefined);
});
test('short disappearance retains a previously established attribution', () => {
  const a = new Accounting();
  a.consume(snapshot(0, 0), 10000, classify);
  a.consume({ uploadTotal: 0, downloadTotal: 0, connections: [] }, 11000, () => null);
  const s = a.consume(snapshot(100, 200), 12000, () => null);
  assert.equal(s.codexUp, 100);
});

test('a reused local port cannot rewrite an established connection owner', () => {
  const a = new Accounting();
  a.consume(snapshot(0, 0), 10000, classify);
  const s = a.consume(snapshot(100, 200), 11000, () => ({
    scope: 'other',
    evidence: 'process',
    process: 'browser.exe',
    pid: 99,
  }));
  assert.equal(s.codexUp, 100);
  assert.equal(s.rows[0].pid, 42);
});

test('invalid counters do not replace a valid baseline and cause the next sample to be counted twice', () => {
  const a = new Accounting();
  a.consume(snapshot(100, 200), 10000, classify);
  const invalid = snapshot(0, 0);
  invalid.connections[0].upload = -1;
  a.consume(invalid, 11000, classify);
  assert.equal(a.consume(snapshot(150, 220), 12000, classify).codexUp, 50);
});
