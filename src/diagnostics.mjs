import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VERSION } from './version.mjs';

const numeric = (value) => (Number.isFinite(value) && value >= 0 ? value : null);
const state = (value) =>
  [
    'starting',
    'connected',
    'disconnected',
    'ready',
    'error',
    'stopped',
    'unsupported',
    'unavailable',
    'demo',
  ].includes(value)
    ? value
    : 'unknown';

// Build a fresh allowlisted object. Never serialize configuration, database rows,
// raw errors, connection metadata, environment variables or log contents.
export function createDiagnostics(config, store, monitor, now = Date.now()) {
  const status = monitor.status();
  const totals = store.totals(Math.max(0, now - 86400000), now);
  let schema = null,
    integrity = 'unavailable';
  try {
    schema = numeric(store.db.prepare('PRAGMA user_version').get().user_version);
    integrity =
      store.db.prepare('PRAGMA quick_check(1)').get().quick_check === 'ok' ? 'ok' : 'failed';
  } catch {
    /* Report availability rather than exposing database errors. */
  }
  let databaseBytes = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      databaseBytes += fs.statSync(path.join(config.dataDir, 'monitor.sqlite' + suffix)).size;
    } catch {
      /* Optional file. */
    }
  }
  const d = status.diagnostics || {};
  const resources = {
    rssBytes: numeric(d.memory?.rss),
    heapUsedBytes: numeric(d.memory?.heapUsed),
    externalBytes: numeric(d.memory?.external),
    pollDurationMs: numeric(d.lastPollMs),
    maxPollDurationMs: numeric(d.maxPollMs),
    polls: numeric(d.polls),
    errors: numeric(d.failures),
    reconnects: numeric(d.reconnects),
    uptimeMs: numeric(d.uptimeMs),
  };
  return {
    format: 'codex-netwatch-redacted-diagnostics',
    formatVersion: 1,
    generatedAt: new Date(now).toISOString(),
    app: { version: VERSION, demo: !!config.demo },
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      osRelease: os.release(),
    },
    collector: {
      state: state(status.state),
      observer: state(status.observer),
      sessionReader: state(status.sessionReader),
      transport: config.demo
        ? 'synthetic'
        : status.capture?.active === 'native'
          ? 'windows_etw'
        : status.endpoint?.includes('命名管道')
          ? 'named_pipe'
          : status.endpoint
            ? 'local_http'
            : 'unavailable',
      intervalMs: numeric(config.intervalMs),
      retentionDays: numeric(status.retentionDays ?? config.retentionDays),
      connections: numeric(status.connections),
      identifiedCodexConnections: numeric(status.codexConnections),
      unidentifiedConnections: numeric(status.unknownConnections),
      processCount: numeric(status.processes),
      captureMode: ['auto','native','mihomo'].includes(status.capture?.mode) ? status.capture.mode : null,
      nativeState: state(status.capture?.nativeState),
      nativeEventsLost: numeric(status.capture?.eventsLost),
      resources,
    },
    storage: { schema, integrity, bytes: numeric(databaseBytes) },
    last24Hours: {
      samples: numeric(totals.samples),
      observedCodexBytes: numeric(totals.codex_up + totals.codex_down),
      reportedProxyBytes: numeric(totals.all_up + totals.all_down),
      unidentifiedBytes: numeric(totals.unknown_up + totals.unknown_down),
    },
    privacy: {
      includes: [
        'software versions',
        'collector state',
        'resource counters',
        'database size and integrity',
        'aggregate byte counters',
      ],
      excludes: [
        'credentials',
        'configuration',
        'paths',
        'hostnames',
        'IP addresses',
        'process names and PIDs',
        'session titles and IDs',
        'chat and tool contents',
        'logs',
      ],
      note: 'Review before sharing. Aggregate usage and runtime information remain in this report.',
    },
  };
}
