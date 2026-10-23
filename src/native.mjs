import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export function nativeSnapshot(packet) {
  if (!packet || packet.type !== 'snapshot' || !Number.isSafeInteger(packet.sequence) ||
      !Number.isFinite(packet.at) || !Number.isFinite(packet.duration) || packet.duration <= 0 ||
      !Array.isArray(packet.rows) || packet.rows.length > 8192) throw new Error('Invalid native snapshot');
  const ids = new Set();
  const connections = packet.rows.map((r) => {
    if (!r || typeof r.id !== 'string' || r.id.length > 400 || !['tcp', 'udp'].includes(r.network) ||
        !net.isIP(r.sourceIP) || !net.isIP(r.destinationIP) ||
        !Number.isSafeInteger(r.processId) || r.processId <= 0 ||
        !Number.isSafeInteger(r.upload) || r.upload < 0 || !Number.isSafeInteger(r.download) || r.download < 0)
      throw new Error('Invalid native connection');
    if (ids.has(r.id)) throw new Error('Duplicate native connection');
    ids.add(r.id);
    return {
      id: `etw:${r.id}`, start: r.start, upload: r.upload, download: r.download, rule: 'Windows ETW',
      metadata: { native: true, processId: r.processId, processBorn: r.processBorn,
        process: String(r.process || '').slice(0, 260), network: r.network,
        sourceIP: r.sourceIP, sourcePort: r.sourcePort, destinationIP: r.destinationIP },
    };
  });
  return { incremental: true, duration: packet.duration, eventsLost: packet.eventsLost || 0,
    uploadTotal: connections.reduce((n, r) => n + r.upload, 0),
    downloadTotal: connections.reduce((n, r) => n + r.download, 0), connections };
}

export class NativeSource {
  constructor(config) {
    this.config = config;
    this.state = process.platform === 'win32' ? 'idle' : 'unsupported';
    this.issue = this.state === 'unsupported' ? 'unsupported' : null;
    this.sequence = 0;
    this.endpoint = 'Windows ETW';
    this.generation = 0;
  }
  async start(elevated = false) {
    if (this.state === 'ready') return;
    if (this.starting) return this.starting;
    if (process.platform !== 'win32') throw new Error('Native capture requires Windows');
    const executable = path.join(this.config.root, 'native', 'Codex-Netwatch-Capture.exe');
    if (!fs.existsSync(executable)) { this.state = 'missing'; this.issue = 'native_missing'; throw new Error('Build the native helper first'); }
    this.state = 'starting'; this.issue = null;
    this.starting = new Promise((resolve, reject) => {
      const name = `codex-netwatch-native-${randomBytes(16).toString('hex')}`;
      const token = randomBytes(32).toString('hex');
      const deadline = setTimeout(() => fail('native_timeout'), elevated ? 60000 : 10000);
      const fail = (issue) => {
        clearTimeout(deadline); this.state = 'error'; this.issue = issue;
        this.disposeTransport(); reject(new Error(issue));
      };
      this.cancelStart = () => fail('native_cancelled');
      this.server = net.createServer((socket) => {
        if (this.socket) { socket.destroy(); return; }
        this.socket = socket;
        this.lines = createInterface({ input: socket, crlfDelay: Infinity });
        this.lines.on('line', (line) => {
          if (line.length > 16 * 1024 * 1024) { socket.destroy(); return; }
          try {
            const packet = JSON.parse(line);
            if (this.state === 'starting') {
              if (packet.token !== token) { socket.destroy(); return; }
              if (packet.type === 'error') { fail(packet.issue === 'elevation_required' ? packet.issue : 'native_failed'); return; }
              if (packet.type !== 'ready' || !/^[a-f0-9]{32}$/.test(packet.generation)) { fail('native_protocol'); return; }
              clearTimeout(deadline); this.generation++; this.sequence = 0;
              this.state = 'ready'; this.issue = null; resolve();
            } else if (packet.type === 'snapshot' && this.pending) {
              if (packet.sequence <= this.sequence) throw new Error('Duplicate native snapshot');
              const snapshot = nativeSnapshot(packet);
              this.sequence = packet.sequence;
              this.pending.resolve(snapshot);
            }
          } catch { this.pending?.reject(new Error('native_protocol')); }
        });
        socket.on('error', () => { this.pending?.reject(new Error('native_disconnected')); });
        socket.on('close', () => {
          if (this.state === 'starting') fail('native_cancelled');
          else if (this.state === 'ready') { this.state = 'error'; this.issue = 'native_disconnected'; this.pending?.reject(new Error(this.issue)); }
        });
      });
      this.server.once('error', () => fail('native_pipe'));
      this.server.listen(`\\\\.\\pipe\\${name}`, () => {
        if (elevated) {
          // Fixed script + environment variables: no user-controlled PowerShell code.
          const script = "$ErrorActionPreference='Stop'; try { Start-Process -FilePath $env:NETWATCH_CAPTURE_EXE -ArgumentList @($env:NETWATCH_CAPTURE_PIPE,$env:NETWATCH_CAPTURE_PARENT,$env:NETWATCH_CAPTURE_TOKEN) -Verb RunAs -WindowStyle Hidden | Out-Null } catch { exit 1 }";
          this.launcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
            windowsHide: true, stdio: 'ignore', env: { ...process.env, NETWATCH_CAPTURE_EXE: executable,
              NETWATCH_CAPTURE_PIPE: name, NETWATCH_CAPTURE_PARENT: String(process.pid), NETWATCH_CAPTURE_TOKEN: token },
          });
          this.launcher.once('exit', (code) => { if (code && this.state === 'starting') fail('native_cancelled'); });
        } else this.launcher = spawn(executable, [name, String(process.pid), token], { windowsHide: true, stdio: 'ignore' });
        this.launcher.once('error', () => fail('native_failed'));
      });
    });
    try { await this.starting; } finally { this.starting = null; this.cancelStart = null; }
  }
  async snapshot() {
    if (this.state !== 'ready') throw new Error(this.issue || 'native_unavailable');
    if (this.pending) throw new Error('Concurrent native poll');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.pending?.reject(new Error('native_timeout')), 5000);
      const settle = (fn, value) => { clearTimeout(timer); this.pending = null; fn(value); };
      this.pending = { resolve: (x) => settle(resolve, x), reject: (x) => settle(reject, x) };
      this.socket.write('snapshot\n');
    });
  }
  disposeTransport() {
    this.pending?.reject(new Error('native_stopped'));
    this.lines?.close(); this.socket?.end('stop\n'); this.socket?.destroy(); this.server?.close();
    this.lines = this.socket = this.server = null;
  }
  stop() { this.cancelStart?.(); this.state = 'stopped'; this.disposeTransport(); }
}
