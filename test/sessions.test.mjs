import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SessionReader } from '../src/sessions.mjs';
import { Store } from '../src/store.mjs';

function fixture(t, legacy = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'netwatch-sessions-'));
  const home = path.join(root, 'codex');
  fs.mkdirSync(home);
  const db = new DatabaseSync(path.join(home, 'state_5.sqlite'));
  db.exec(`CREATE TABLE threads (
    id TEXT PRIMARY KEY, title TEXT, rollout_path TEXT, updated_at INTEGER
    ${legacy ? '' : ', name TEXT, model TEXT, source TEXT, agent_path TEXT, agent_nickname TEXT'}
  )`);
  const store = new Store(path.join(root, 'monitor'));
  const reader = new SessionReader({ codexHome: home }, store);
  t.after(() => {
    db.close();
    store.close();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^netwatch-sessions-/);
    fs.rmSync(root, { recursive: true, force: true });
  });
  let stamp = Date.now() - 10000;
  function usage(id, total) {
    const file = path.join(home, `${id}.jsonl`);
    fs.appendFileSync(file, JSON.stringify({
      type: 'event_msg',
      payload: { type: 'token_count', info: { total_token_usage: {
        total_tokens: total, input_tokens: total - 10,
        cached_input_tokens: 20, output_tokens: 10,
      } } },
    }) + '\n');
    stamp += 100;
    fs.utimesSync(file, stamp / 1000, stamp / 1000);
    return file;
  }
  function add(id, options = {}) {
    const row = { title: id, updated_at: 1, name: null, model: 'gpt-test', source: 'vscode',
      agent_path: null, agent_nickname: null, ...options };
    const file = usage(id, row.total ?? 100);
    if (legacy) {
      db.prepare('INSERT INTO threads VALUES (?,?,?,?)').run(id, row.title, file, row.updated_at);
    } else {
      db.prepare('INSERT INTO threads VALUES (?,?,?,?,?,?,?,?,?)').run(id, row.title, file,
        row.updated_at, row.name, row.model, row.source, row.agent_path, row.agent_nickname);
    }
    return file;
  }
  return { db, store, reader, home, add, usage };
}

test('background reviews do not consume the 200 visible thread slots or erase old records', (t) => {
  const { db, store, reader, add } = fixture(t);
  add('user', { name: 'My project', updated_at: 1 });
  for (let i = 0; i < 205; i++) {
    add(`review-${i}`, { title: 'Guardian review', model: 'codex-auto-review', updated_at: 10 + i,
      source: JSON.stringify({ subagent: { other: 'guardian' } }) });
  }
  add('source-only-review', { model: '', updated_at: 999,
    source: JSON.stringify({ subagent: { other: 'guardian' } }) });
  store.saveSession({ id: 'review-0', title: 'Guardian review', model: 'codex-auto-review', activity: 99999, total: 500 });
  store.saveSession({ id: 'source-only-review', title: 'Guardian review', model: '', activity: 99998, total: 400 });
  store.saveSession({ id: 'old-model-review', title: 'Guardian review', model: 'codex-auto-review', activity: 99997, total: 300 });
  reader.refresh();
  assert.equal(reader.status, 'ready');
  assert.deepEqual(store.sessions().map((row) => row.id), ['user']);
  assert.ok(db.prepare('SELECT id FROM threads WHERE id=?').get('review-0'));
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id LIKE ?').get('%review%').n, 3);
  assert.equal(store.db.prepare('SELECT total_tokens FROM sessions WHERE id=?').get('review-0').total_tokens, 500);
});

test('desktop names override old title indexes and refresh after renaming', (t) => {
  const { db, store, reader, home, add } = fixture(t);
  add('named', { title: 'Original prompt', name: 'Current desktop name' });
  add('indexed', { title: 'Original prompt' });
  fs.writeFileSync(path.join(home, 'session_index.jsonl'),
    '{"id":"named","thread_name":"Stale name"}\n{"id":"indexed","thread_name":"Legacy name"}\n');
  reader.refresh();
  const names = () => new Map(store.sessions().map((row) => [row.id, row.title]));
  assert.equal(names().get('named'), 'Current desktop name');
  assert.equal(names().get('indexed'), 'Legacy name');
  db.prepare('UPDATE threads SET name=? WHERE id=?').run('Renamed desktop name', 'named');
  reader.refresh();
  assert.equal(names().get('named'), 'Renamed desktop name');
});

test('subagents retain separate usage with a parent name and task label', (t) => {
  const { db, store, reader, add } = fixture(t);
  add('parent', { title: 'Raw prompt', name: 'Travel project', total: 1000 });
  add('child', { title: '', total: 500, source: JSON.stringify({ subagent: { thread_spawn: {
    parent_thread_id: 'parent', depth: 1, agent_path: '/root/admin_design_v6', agent_nickname: 'Sartre',
  } } }) });
  reader.refresh();
  const child = store.sessions().find((row) => row.id === 'child');
  assert.equal(reader.status, 'ready');
  assert.match(child.title, /Travel project/);
  assert.match(child.title, /子任务/);
  assert.match(child.title, /admin_design_v6/);
  assert.equal(child.total_tokens, 500);
  assert.equal(store.sessions().find((row) => row.id === 'parent').total_tokens, 1000);
  db.prepare('UPDATE threads SET name=? WHERE id=?').run('Renamed parent', 'parent');
  reader.refresh();
  assert.match(store.sessions().find((row) => row.id === 'child').title, /Renamed parent/);
});

test('token observation starts at a baseline and counts each later increase once', (t) => {
  const { store, reader, add, usage } = fixture(t);
  add('user', { total: 100 });
  reader.refresh();
  assert.equal(store.sessions()[0].observed_tokens, 0);
  usage('user', 120);
  reader.refresh();
  assert.equal(store.sessions()[0].total_tokens, 120);
  assert.equal(store.sessions()[0].observed_tokens, 20);
  reader.refresh();
  assert.equal(store.sessions()[0].observed_tokens, 20);
});

test('Windows namespaced rollout paths inside the Codex home remain readable',
  { skip: process.platform !== 'win32' }, (t) => {
    const { db, store, reader, add, usage } = fixture(t);
    const file = add('namespaced', { total: 100 });
    db.prepare('UPDATE threads SET rollout_path=? WHERE id=?')
      .run(path.toNamespacedPath(file), 'namespaced');
    reader.refresh();
    assert.equal(reader.status, 'ready');
    assert.equal(store.sessions()[0].total_tokens, 100);
    assert.equal(store.sessions()[0].observed_tokens, 0);
    usage('namespaced', 120);
    reader.refresh();
    assert.equal(store.sessions()[0].total_tokens, 120);
    assert.equal(store.sessions()[0].observed_tokens, 20);
  });

test('rollout paths outside the configured Codex home do not expose token usage', (t) => {
  const { db, store, reader, home, add } = fixture(t);
  const file = add('outside', { total: 900 });
  const external = path.join(path.dirname(home), 'external.jsonl');
  fs.copyFileSync(file, external);
  db.prepare('UPDATE threads SET rollout_path=? WHERE id=?').run(external, 'outside');
  reader.refresh();
  assert.equal(reader.status, 'ready');
  assert.equal(store.sessions()[0].total_tokens, null);
  assert.equal(store.sessions()[0].observed_tokens, 0);
});

test('legacy state schemas and title indexes remain readable', (t) => {
  const { store, reader, home, add } = fixture(t, true);
  add('legacy', { title: 'Old DB title', total: 100 });
  fs.writeFileSync(path.join(home, 'session_index.jsonl'), '{"id":"legacy","thread_name":"Indexed name"}\n');
  reader.refresh();
  assert.equal(reader.status, 'ready');
  assert.equal(store.sessions()[0].title, 'Indexed name');
  assert.equal(store.sessions()[0].total_tokens, 100);
});
