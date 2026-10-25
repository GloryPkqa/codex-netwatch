import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { VERSION } from './version.mjs';

const REPO = 'https://github.com/GloryPkqa/codex-netwatch';
const API = 'https://api.github.com/repos/GloryPkqa/codex-netwatch/releases/latest';
const ZIP = 'codex-netwatch-windows-x64.zip';
const MAX_ARCHIVE = 512 * 1024 * 1024;
const fail = (code) => Object.assign(new Error(code), { code });
export function versionParts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/.test(value))
    throw fail('invalid_release');
  return value.split('.').map(Number);
}
export function isNewer(next, current) {
  const a = versionParts(next), b = versionParts(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
export function validateRelease(release, current = VERSION) {
  const version = String(release?.tag_name || '').replace(/^v/, '');
  versionParts(version);
  if (release.draft || release.prerelease || release.tag_name !== `v${version}` ||
      release.html_url !== `${REPO}/releases/tag/v${version}`) throw fail('invalid_release');
  const asset = release.assets?.find((a) => a.name === ZIP);
  const sums = release.assets?.find((a) => a.name === 'SHA256SUMS.txt');
  for (const item of [asset, sums]) {
    if (!item || item.browser_download_url !== `${REPO}/releases/download/v${version}/${item.name}` ||
        !Number.isSafeInteger(item.size) || item.size < 1 || item.size > (item === asset ? MAX_ARCHIVE : 65536))
      throw fail('invalid_release');
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(asset.digest || '')) throw fail('missing_checksum');
  return { currentVersion: current, latestVersion: version, available: isNewer(version, current),
    notes: String(release.body || '').slice(0, 20000), url: release.html_url,
    size: asset.size, asset: asset.browser_download_url, checksumUrl: sums.browser_download_url,
    sha256: asset.digest.slice(7).toLowerCase() };
}
export function parseChecksum(text) {
  const matches = String(text).split(/\r?\n/).map((s) => s.match(/^([a-f0-9]{64})\s+\*?codex-netwatch-windows-x64\.zip\s*$/i)).filter(Boolean);
  if (matches.length !== 1) throw fail('missing_checksum');
  return matches[0][1].toLowerCase();
}
async function response(url, timeout = 20000) {
  const result = await fetch(url, { headers: { 'User-Agent': 'Codex-Netwatch-Updater', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(timeout), redirect: 'follow' });
  if (!result.ok) throw fail(result.status === 403 || result.status === 429 ? 'rate_limited' : 'network_error');
  if (new URL(result.url).protocol !== 'https:') throw fail('invalid_release');
  return result;
}
async function boundedText(url, max = 262144) {
  const res = await response(url), chunks = []; let length = 0;
  for await (const chunk of res.body) {
    length += chunk.length;
    if (length > max) throw fail('invalid_release');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export async function downloadVerified(release, destination, onProgress = () => {}, request = response) {
  const res = await request(release.asset, 180000);
  const hash = createHash('sha256'); let size = 0;
  const file = fs.openSync(destination, 'wx');
  try {
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > release.size || size > MAX_ARCHIVE) throw fail('checksum_mismatch');
      hash.update(chunk); fs.writeSync(file, chunk); onProgress(Math.floor(size * 100 / release.size));
    }
    if (size !== release.size || hash.digest('hex') !== release.sha256) throw fail('checksum_mismatch');
  } catch (error) {
    fs.closeSync(file); fs.rmSync(destination, { force: true }); throw error;
  }
  fs.closeSync(file);
}

// Checking is explicitly user initiated. No telemetry or background network polling.
export class UpdateManager {
  constructor(config) {
    this.config = config;
    this.state = 'idle'; this.release = null; this.checkedAt = 0; this.progress = 0;
    this.canInstall = process.platform === 'win32' && !config.demo && !!config.desktopToken &&
      Number(process.env.CODEX_NETWATCH_HOST_PID) > 0 &&
      fs.existsSync(path.join(config.root, 'Codex-Netwatch.exe')) &&
      fs.existsSync(path.join(config.root, 'scripts', 'install-update.ps1'));
  }
  status() {
    let lastResult = null;
    try {
      const file = path.join(this.config.dataDir, 'update-result.json');
      if (fs.statSync(file).size < 16384) lastResult = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (this.state === 'installing' && lastResult?.job === this.jobId && lastResult?.version === this.release?.latestVersion &&
          ['failed', 'rolled_back', 'rollback_failed'].includes(lastResult.state)) {
        this.state = 'failed'; this.error = 'install_failed';
      }
    } catch { /* No previous update, or the worker is replacing its status file. */ }
    return { currentVersion: VERSION, latestVersion: this.release?.latestVersion || null,
      available: !!this.release?.available, notes: this.release?.notes || '',
      url: this.release?.url || `${REPO}/releases/latest`, size: this.release?.size || 0,
      canInstall: this.canInstall, state: this.state, error: this.error || null, progress: this.progress, lastResult };
  }
  async check() {
    if (['downloading', 'installing'].includes(this.state)) return this.status();
    if (this.checking) return this.checking;
    if (this.release && Date.now() - this.checkedAt < 300000) return this.status();
    this.checking = (async () => {
      this.state = 'checking'; this.error = null;
      try {
        this.release = validateRelease(JSON.parse(await boundedText(API)));
        this.checkedAt = Date.now(); this.state = this.release.available ? 'available' : 'current';
      } catch (error) { this.state = 'failed'; this.error = safeError(error); }
      finally { this.checking = null; }
      return this.status();
    })();
    return this.checking;
  }
  install(version) {
    if (!this.canInstall) throw fail('desktop_required');
    if (['downloading', 'installing', 'checking'].includes(this.state)) throw fail('update_busy');
    if (!this.release?.available || version !== this.release.latestVersion || Date.now() - this.checkedAt > 3600000)
      throw fail('check_required');
    this.state = 'downloading'; this.error = null; this.progress = 0;
    // Observe the entire background promise; failures remain visible without closing the app.
    this.job = this.prepare().catch((error) => { this.state = 'failed'; this.error = safeError(error); });
    return this.status();
  }
  async prepare() {
    const release = { ...this.release };
    if (parseChecksum(await boundedText(release.checksumUrl, 65536)) !== release.sha256) throw fail('checksum_mismatch');
    const jobs = path.join(this.config.dataDir, 'updates');
    fs.mkdirSync(jobs, { recursive: true });
    const job = fs.mkdtempSync(path.join(jobs, 'upgrade-'));
    this.jobId = path.basename(job);
    const archive = path.join(job, ZIP);
    await downloadVerified(release, archive, (value) => { this.progress = value; });
    const script = path.join(job, 'install-update.ps1');
    fs.copyFileSync(path.join(this.config.root, 'scripts', 'install-update.ps1'), script);
    const planFile = path.join(job, 'plan.json');
    fs.writeFileSync(planFile, JSON.stringify({ root: this.config.root, dataDir: this.config.dataDir,
      archive, sha256: release.sha256, version: release.latestVersion, currentVersion: VERSION,
      port: this.config.port, hostPid: Number(process.env.CODEX_NETWATCH_HOST_PID),
      collectorPid: process.pid, instance: this.config.desktopToken }));
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Plan', planFile],
      { detached: true, windowsHide: true, stdio: 'ignore', cwd: job });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    this.state = 'installing'; this.worker = child;
    child.once('exit', () => {
      // On the successful path this collector has already shut down. A worker
      // exiting while it is still running must not leave an endless spinner.
      if (this.worker === child) { this.state = 'failed'; this.error = 'install_failed'; }
    });
    child.unref();
  }
}
function safeError(error) {
  return ['invalid_release', 'missing_checksum', 'checksum_mismatch', 'rate_limited', 'desktop_required',
    'update_busy', 'check_required'].includes(error.code) ? error.code : 'network_error';
}
