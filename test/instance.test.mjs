import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireInstance } from '../src/instance.mjs';

test('one data directory rejects a second collector and becomes available after release', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-flow-lock-'));
  const first = acquireInstance(dir);
  t.after(() => {
    first.release();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  assert.throws(() => acquireInstance(dir), /already has a collector/);
  first.release();
  const second = acquireInstance(dir);
  second.release();
  assert.equal(fs.existsSync(path.join(dir, 'collector.lock')), false);
});
test('only a verifiably dead owner is automatically reclaimed', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-flow-lock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'collector.lock');
  fs.writeFileSync(file, JSON.stringify({ pid: 12345, token: 'synthetic-stale' }));
  const lock = acquireInstance(dir, () => {
    const error = new Error('dead');
    error.code = 'ESRCH';
    throw error;
  });
  lock.release();
  fs.writeFileSync(file, 'incomplete');
  assert.throws(() => acquireInstance(dir), /unverifiable/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'incomplete');
});
test('permission errors cannot be mistaken for a dead process', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-flow-lock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const content = JSON.stringify({ pid: 12345, token: 'synthetic-owner' }),
    file = path.join(dir, 'collector.lock');
  fs.writeFileSync(file, content);
  assert.throws(
    () =>
      acquireInstance(dir, () => {
        const e = new Error('denied');
        e.code = 'EPERM';
        throw e;
      }),
    /already has a collector/,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), content);
});
