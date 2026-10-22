import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProcess, ProcessObserver } from '../src/processes.mjs';
const config = { processNames: ['codex.exe'], includeDescendants: true };
test('children are classified through explicit parent ancestry', () => {
  const ps = new Map([
    [1, { pid: 1, name: 'codex.exe', ppid: 0, born: 10 }],
    [2, { pid: 2, name: 'node.exe', ppid: 1, born: 20 }],
  ]);
  assert.equal(classifyProcess(2, ps, config).evidence, 'descendant');
  assert.equal(classifyProcess(2, ps, { ...config, includeDescendants: false }).scope, 'other');
});
test('PID reuse and parent cycles cannot create false ancestry or infinite loops', () => {
  const ps = new Map([
    [1, { pid: 1, name: 'codex.exe', ppid: 0, born: 30 }],
    [2, { pid: 2, name: 'node.exe', ppid: 1, born: 20 }],
  ]);
  assert.equal(classifyProcess(2, ps, config).scope, 'other');
  ps.set(2, { pid: 2, name: 'node.exe', ppid: 3 });
  ps.set(3, { pid: 3, name: 'cmd.exe', ppid: 2 });
  assert.equal(classifyProcess(2, ps, config).scope, 'other');
});
test('socket match requires local address and unambiguous ownership', () => {
  const o = new ProcessObserver(config);
  o.at = 10000;
  o.processes = new Map([[1, { pid: 1, name: 'codex.exe', ppid: 0 }]]);
  o.sockets.set('tcp:5000', [{ ip: '127.0.0.1', port: 5000, pid: 1 }]);
  const m = { network: 'tcp', sourceIP: '127.0.0.1', sourcePort: '5000' };
  assert.equal(o.classify(m, 11000).scope, 'codex');
  assert.equal(o.classify({ ...m, sourceIP: '192.0.2.1' }, 11000), null);
  o.sockets.get('tcp:5000').push({ ip: '127.0.0.1', port: 5000, pid: 2 });
  assert.equal(o.classify(m, 11000), null);
});
test('stale process snapshots cannot identify new connections', () => {
  const o = new ProcessObserver(config);
  o.at = 1000;
  assert.equal(o.classify({ sourcePort: 5, network: 'tcp' }, 8000), null);
});

test('a snapshot from before a backwards clock adjustment cannot identify new connections', () => {
  const observer = new ProcessObserver(config);
  observer.at = 20000;
  observer.processes.set(1, { pid: 1, name: 'codex.exe', ppid: 0 });
  observer.sockets.set('tcp:5000', [{ ip: '127.0.0.1', port: 5000, pid: 1 }]);
  const metadata = { network: 'tcp', sourceIP: '127.0.0.1', sourcePort: 5000 };
  assert.equal(observer.classify(metadata, 10000), null);
  assert.equal(observer.classify({ ...metadata, process: 'chrome.exe' }, 10000).scope, 'other');
  observer.at = 10000;
  assert.equal(observer.classify(metadata, 10001).scope, 'codex');
});
test('a browser talking to ChatGPT remains a browser', () => {
  const o = new ProcessObserver(config);
  assert.equal(o.classify({ process: 'chrome.exe', host: 'chatgpt.com' }).scope, 'other');
});
