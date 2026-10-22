import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { DatabaseSync } from 'node:sqlite';
import { latestUsage, readTail, sessionTitles } from '../src/sessions.mjs';
import { yamlScalar } from '../src/config.mjs';

test('an older app refuses to overwrite a newer database schema version', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-flow-version-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const db = new DatabaseSync(path.join(dir, 'monitor.sqlite'));
  db.exec('PRAGMA user_version=3');
  db.close();
  assert.throws(() => new Store(dir), /newer Codex Netwatch version/);
  const check = new DatabaseSync(path.join(dir, 'monitor.sqlite'));
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 3);
  check.close();
});
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-flow-test-'));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { store, dir };
}
function sample(at, scope = 'codex') {
  return {
    at,
    duration: 1000,
    codexUp: scope === 'codex' ? 100 : 0,
    codexDown: 0,
    allUp: 100,
    allDown: 0,
    unknownUp: 0,
    unknownDown: 0,
    activeSessions: ['a', 'b'],
    rows: [
      {
        key: 'one',
        host: 'example.test',
        network: 'tcp',
        process: 'codex.exe',
        pid: 1,
        scope,
        evidence: 'process',
        rule: 'Match',
        up: 100,
        down: 0,
      },
    ],
  };
}
test('minute buckets, scoped totals, and activity evidence persist separately', (t) => {
  const { store } = setup(t);
  store.record(sample(60000));
  store.record(sample(61000));
  store.record(sample(62000, 'other'));
  assert.equal(store.totals(60000, 62000).codex_up, 200);
  assert.equal(store.connections(60000, 62000, 'codex')[0].up, 200);
  assert.equal(store.connections(60000, 62000, 'other')[0].up, 100);
  assert.equal(store.correlation('a', 60000, 62000).samples, 3);
  assert.equal(store.correlation('nonexistent', 60000, 62000).samples, 0);
});
test('retention removes old samples and dependent minute buckets', (t) => {
  const { store } = setup(t);
  store.record(sample(60000));
  store.record({ ...sample(3 * 86400000), rows: [] });
  store.prune(1, 3 * 86400000);
  assert.equal(store.totals(0, 3 * 86400000).samples, 1);
  assert.equal(store.connections(0, 3 * 86400000).length, 0);
});
test('missing token usage is null; observed usage increments once', (t) => {
  const { store } = setup(t);
  store.saveSession({ id: 's', title: 'test', activity: 1 });
  assert.equal(store.sessions()[0].total_tokens, null);
  store.saveSession({ id: 's', title: 'test', activity: 2, total: 100 }, 0);
  store.saveSession({ id: 's', title: 'test', activity: 3, total: 120 }, 20);
  assert.equal(store.sessions()[0].observed_tokens, 20);
});
test('latest token_count ignores null info and partially written records', () => {
  const valid = JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 80,
          cached_input_tokens: 50,
          output_tokens: 20,
          total_tokens: 100,
        },
      },
    },
  });
  const result = latestUsage(
    valid +
      '\n' +
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: null } }) +
      '\n{"type":',
  );
  assert.equal(result.total, 100);
  assert.equal(result.cached, 50);
  assert.equal(result.output, 20);
});
test('tail reader skips oversized partial lines and reads trailing usage', (t) => {
  const { dir } = setup(t);
  const file = path.join(dir, 'tail.jsonl');
  fs.writeFileSync(file, 'x'.repeat(200) + '\nlast-complete-line\n');
  assert.equal(readTail(file, 60), 'last-complete-line\n');
});
test('top-level YAML scalar parsing handles Windows pipes and quoted secrets', () => {
  assert.equal(yamlScalar('secret: "a#b"\n', 'secret'), 'a#b');
  assert.equal(yamlScalar("secret: 'a''b'\n", 'secret'), "a'b");
  assert.equal(
    yamlScalar('external-controller-pipe: \\\\.\\pipe\\mihomo\n', 'external-controller-pipe'),
    '\\\\.\\pipe\\mihomo',
  );
  assert.equal(yamlScalar('  secret: nested\n', 'secret'), '');
});

test('renamed session titles take precedence without parsing partial index lines', () => {
  assert.equal(
    sessionTitles('{"id":"s","thread_name":"old"}\n{"id":"s","thread_name":"new"}\n{"id":').get(
      's',
    ),
    'new',
  );
});

test('later process discovery does not relabel historical unknown bytes as measured ownership', (t) => {
  const { store } = setup(t);
  store.record(sample(60000, 'unknown'));
  store.record(sample(61000));
  const unknown = store.connections(60000, 62000, 'unknown')[0];
  assert.equal(unknown.up, 100);
  assert.equal(unknown.process, '');
  assert.equal(unknown.evidence, 'none');
  assert.equal(store.connections(60000, 62000, 'codex')[0].up, 100);
});

test('version 1 databases migrate without changing recorded bytes or samples', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-flow-migrate-'));
  let store = new Store(dir);
  t.after(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  store.record(sample(61000));
  store.record(sample(181000));
  store.close();
  const legacy = new DatabaseSync(path.join(dir, 'monitor.sqlite'));
  legacy.exec('ALTER TABLE buckets DROP COLUMN last_at; PRAGMA user_version=1');
  legacy.close();
  store = new Store(dir);
  assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(store.totals(0, 200000).codex_up, 200);
  assert.equal(store.connections(0, 200000, 'codex')[0].up, 200);
  assert.ok(store.connections(60000, 119999, 'codex')[0].last_seen <= 119999);
});
