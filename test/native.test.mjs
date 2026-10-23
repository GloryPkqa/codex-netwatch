import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import dgram from 'node:dgram';
import { spawn, spawnSync } from 'node:child_process';
import { NativeSource, nativeSnapshot } from '../src/native.mjs';
import { Accounting } from '../src/accounting.mjs';
import { ProcessObserver } from '../src/processes.mjs';
import { TrafficSource } from '../src/sources.mjs';

const packet = (sequence = 1) => ({ type: 'snapshot', sequence, at: 10000, duration: 1000, eventsLost: 0,
  rows: [{ id: 'unique-lifetime', start: new Date(9000).toISOString(), network: 'tcp', sourceIP: '192.0.2.1',
    destinationIP: '203.0.113.1', sourcePort: 50000, destinationPort: 443, processId: 77, processBorn: 500,
    process: 'codex.exe', upload: 1200, download: 2400 }] });

test('native deltas retain short-lived connections and do not repeat cumulative history', () => {
  const accounting = new Accounting();
  const classify = () => ({ scope: 'codex', process: 'codex.exe', evidence: 'etw', pid: 77 });
  const one = accounting.consume(nativeSnapshot(packet()), 10000, classify);
  assert.equal(one.codexUp, 1200); assert.equal(one.codexDown, 2400); assert.equal(one.allUp, 1200);
  assert.equal(one.duration, 1000);
  const two = accounting.consume(nativeSnapshot({ ...packet(2), rows: [] }), 11000, classify);
  assert.equal(two.codexUp, 0); assert.equal(two.allDown, 0);
  const three = accounting.consume(nativeSnapshot(packet(3)), 12000, classify);
  assert.equal(three.codexUp, 1200); assert.equal(three.codexDown, 2400);
});

test('native adapter rejects malformed counters, destinations and duplicate identity input', () => {
  for (const value of [-1, NaN, Infinity, 1.5]) {
    const p = packet(); p.rows[0].upload = value; assert.throws(() => nativeSnapshot(p));
  }
  const p = packet(); p.rows[0].destinationIP = 'chatgpt.com'; assert.throws(() => nativeSnapshot(p));
  assert.throws(() => nativeSnapshot({ ...packet(), duration: 0 }));
  assert.throws(() => nativeSnapshot({ ...packet(), rows: [...packet().rows, ...packet().rows] }));
});

test('native process evidence validates creation times before using ancestor snapshots', () => {
  const observer = new ProcessObserver({ processNames: ['codex.exe'], includeDescendants: true, excludePids: [88] });
  observer.at = 10000;
  observer.processes = new Map([[1, { pid: 1, name: 'codex.exe', born: 100 }],
    [77, { pid: 77, name: 'node.exe', ppid: 1, born: 500 }],
    [88, { pid: 88, name: 'node.exe', ppid: 1, born: 600 }]]);
  const m = nativeSnapshot(packet()).connections[0].metadata;
  assert.equal(observer.classify({ ...m, process: 'node.exe' }, 10500).scope, 'codex');
  assert.equal(observer.classify({ ...m, process: 'node.exe', processBorn: 700 }, 10500).scope, 'other');
  assert.equal(observer.classify({ ...m, processId: 88, processBorn: 600 }, 10500).scope, 'other');
  assert.equal(observer.classify({ ...m, process: '' }, 20000).scope, 'unknown');
});

test('automatic capture selects one source and never doubles proxy plus native bytes', async () => {
  const source = new TrafficSource({ captureMode: 'auto' });
  source.attempted = true;
  let nativeCalls = 0, proxyCalls = 0;
  source.native = { state: 'ready', generation: 1, snapshot: async () => { nativeCalls++; return nativeSnapshot(packet()); }, stop() {} };
  source.proxy = { generation: 1, snapshot: async () => { proxyCalls++; return { uploadTotal: 999 }; } };
  assert.equal((await source.snapshot()).uploadTotal, 1200);
  assert.equal(nativeCalls, 1); assert.equal(proxyCalls, 0);
  const generation = source.generation;
  await source.setMode('mihomo');
  assert.equal((await source.snapshot()).uploadTotal, 999);
  assert.equal(source.generation, generation + 1); assert.equal(proxyCalls, 1);
  await source.setMode('native');
  const cutover = await source.snapshot();
  assert.equal(cutover.uploadTotal, 0); assert.equal(cutover.cutoverBaseline, true);
  assert.deepEqual(cutover.connections, []);
  assert.equal((await source.snapshot()).uploadTotal, 1200);
});
test('automatic fallback never opens UAC, and explicit native mode never silently uses proxy counters', async () => {
  const source = new TrafficSource({ captureMode: 'auto' });
  let calls = 0;
  source.native = { state: 'error', issue: 'elevation_required', start: async (...args) => { assert.deepEqual(args, []); throw new Error('elevation_required'); }, stop() {} };
  source.proxy = { generation: 1, snapshot: async () => { calls++; return { uploadTotal: 50 }; } };
  assert.equal((await source.snapshot()).uploadTotal, 50);
  await source.setMode('native');
  await assert.rejects(source.snapshot(), /elevation_required/);
  assert.equal(calls, 1);
});

// GitHub Windows hosted runners are elevated. This is a real ETW test with a
// separate, short-lived Codex-named process doing direct TCP (no proxy involved).
const elevated = process.platform === 'win32' && spawnSync('powershell.exe', ['-NoProfile', '-Command',
  '[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'],
  { encoding: 'utf8', windowsHide: true }).stdout?.trim() === 'True';
test('Windows ETW captures direct upload and download and stops its private session', { skip: !elevated && !process.env.NETWATCH_REQUIRE_NATIVE_TEST, timeout: 45000 }, async (t) => {
  assert.ok(elevated, 'The Windows CI integration test must run with administrator privileges');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netwatch-native-'));
  const exe = path.join(dir, 'codex.exe');
  fs.copyFileSync(process.execPath, exe);
  const source = new NativeSource({ root: path.resolve(import.meta.dirname, '..') });
  let child;
  const server = http.createServer((req, res) => { req.resume(); req.on('end', () => res.end(Buffer.alloc(2 * 1024 * 1024, 3))); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (child && child.exitCode === null) await new Promise((resolve) => { child.once('exit', resolve); child.kill(); });
    source.stop(); await new Promise((resolve) => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true });
  });
  await source.start();
  const port = server.address().port;
  child = spawn(exe, ['-e', `const http=require('http'); const r=http.request({host:'127.0.0.1',port:${port},method:'POST',agent:false},s=>{s.resume();s.on('end',()=>setTimeout(()=>{},4000));});r.end(Buffer.alloc(1024*1024,7));`], { windowsHide: true, stdio: 'ignore' });
  const pid = child.pid;
  let up = 0, down = 0;
  for (let i = 0; i < 16; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const snapshot = await source.snapshot();
    for (const row of snapshot.connections.filter((c) => c.metadata.processId === pid)) { up += row.upload; down += row.download; }
    if (up >= 1024 * 1024 && down >= 2 * 1024 * 1024) break;
  }
  assert.ok(up >= 1024 * 1024, `Direct upload not captured: ${up}`);
  assert.ok(down >= 2 * 1024 * 1024, `Direct download not captured: ${down}`);
  assert.ok(up < 4 * 1024 * 1024 && down < 6 * 1024 * 1024, 'Unexpected duplicate counts');
  const sessionName = `CodexNetwatch-${source.sessionId}`;
  source.stop(); assert.equal(source.state, 'stopped');
  let stopped = false;
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (spawnSync('logman.exe', ['query', sessionName, '-ets'], { windowsHide: true, stdio: 'ignore' }).status !== 0) { stopped = true; break; }
  }
  assert.ok(stopped, 'The private ETW session must stop with the helper');
});

test('Windows ETW captures a direct UDP exchange', { skip: !elevated && !process.env.NETWATCH_REQUIRE_NATIVE_TEST, timeout: 30000 }, async (t) => {
  assert.ok(elevated, 'Windows CI native testing requires administrator privileges');
  const source = new NativeSource({ root: path.resolve(import.meta.dirname, '..') });
  const server = dgram.createSocket('udp4');
  let child;
  server.on('message', (_, peer) => server.send(Buffer.alloc(2048), peer.port, peer.address));
  await new Promise((resolve) => server.bind(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (child && child.exitCode === null) await new Promise((resolve) => { child.once('exit', resolve); child.kill(); });
    source.stop(); server.close();
  });
  await source.start();
  child = spawn(process.execPath, ['-e', `const s=require('dgram').createSocket('udp4');s.on('message',()=>setTimeout(()=>s.close(),4000));s.send(Buffer.alloc(1024),${server.address().port},'127.0.0.1');`], { windowsHide: true, stdio: 'ignore' });
  let up = 0, down = 0;
  for (let i = 0; i < 12; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    for (const row of (await source.snapshot()).connections.filter((c) => c.metadata.processId === child.pid && c.metadata.network === 'udp')) { up += row.upload; down += row.download; }
    if (up >= 1024 && down >= 2048) break;
  }
  assert.ok(up >= 1024, `UDP upload not captured: ${up}`);
  assert.ok(down >= 2048, `UDP download not captured: ${down}`);
});
