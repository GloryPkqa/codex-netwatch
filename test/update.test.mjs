import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateRelease, parseChecksum, isNewer, downloadVerified, UpdateManager } from '../src/update.mjs';

const base = 'https://github.com/GloryPkqa/codex-netwatch/releases';
function release() {
  return { tag_name: 'v0.6.0', html_url: `${base}/tag/v0.6.0`, body: 'Release notes',
    assets: [{ name: 'codex-netwatch-windows-x64.zip', size: 10, digest: 'sha256:' + 'a'.repeat(64),
      browser_download_url: `${base}/download/v0.6.0/codex-netwatch-windows-x64.zip` },
    { name: 'SHA256SUMS.txt', size: 100, browser_download_url: `${base}/download/v0.6.0/SHA256SUMS.txt` }] };
}
test('updates require an exact stable official release, pinned asset URL and SHA-256', () => {
  assert.equal(validateRelease(release(), '0.5.0').available, true);
  assert.equal(validateRelease(release(), '0.6.0').available, false);
  assert.equal(isNewer('0.10.0', '0.9.9'), true);
  for (const change of [
    (x) => { x.prerelease = true; }, (x) => { x.draft = true; },
    (x) => { x.tag_name = 'v0.6.0-rc1'; },
    (x) => { x.html_url = 'https://example.com'; },
    (x) => { x.assets[0].browser_download_url += '?redirect=evil'; },
    (x) => { x.assets[0].digest = null; },
    (x) => { x.assets[0].size = 9999999999; },
    (x) => { x.assets[1].browser_download_url = 'file:///secrets'; },
  ]) { const data = release(); change(data); assert.throws(() => validateRelease(data)); }
  for (const v of ['1.2', '01.0.0', '99999.0.0', '1.0.0+test', '../1.0.0']) assert.throws(() => isNewer(v, '0.5.0'));
});
test('checksum manifests require exactly one matching portable filename', () => {
  const hash = 'a'.repeat(64);
  assert.equal(parseChecksum(`${hash}  codex-netwatch-windows-x64.zip\r\n`), hash);
  assert.throws(() => parseChecksum(`${hash} ../codex-netwatch-windows-x64.zip`));
  assert.throws(() => parseChecksum(`${hash}  codex-netwatch-windows-x64.zip\n`.repeat(2)));
});
test('download is size bounded and deletes corrupt archives before any installer can run', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netwatch-update-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bytes = Buffer.from('verified package');
  const data = { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), asset: 'https://example.test/package' };
  const request = async () => ({ body: [bytes.subarray(0, 5), bytes.subarray(5)] });
  const destination = path.join(dir, 'package.zip');
  await downloadVerified(data, destination, () => {}, request);
  assert.deepEqual(fs.readFileSync(destination), bytes);
  for (const bad of [{ ...data, size: 1 }, { ...data, size: 100 }, { ...data, sha256: 'b'.repeat(64) }]) {
    fs.rmSync(destination);
    await assert.rejects(downloadVerified(bad, destination, () => {}, request), /checksum_mismatch/);
    assert.equal(fs.existsSync(destination), false);
    fs.writeFileSync(destination, 'reset');
  }
});
test('demo/source installs cannot update; status reads never initiate a network request', () => {
  const manager = new UpdateManager({ root: os.tmpdir(), dataDir: os.tmpdir(), demo: true });
  assert.equal(manager.status().state, 'idle');
  assert.equal(manager.status().canInstall, false);
  assert.throws(() => manager.install('0.6.0'), /desktop_required/);
});
test('a previous failed attempt for the same version cannot poison a retry', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netwatch-update-retry-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const manager = new UpdateManager({ root: dir, dataDir: dir, demo: true });
  manager.release = { latestVersion: '0.6.0' }; manager.state = 'installing'; manager.jobId = 'new-attempt';
  const write = (job) => fs.writeFileSync(path.join(dir, 'update-result.json'), JSON.stringify({ job, version: '0.6.0', state: 'rolled_back' }));
  write('old-attempt'); assert.equal(manager.status().state, 'installing');
  write('new-attempt'); assert.equal(manager.status().state, 'failed');
  assert.equal(manager.status().error, 'install_failed');
});
