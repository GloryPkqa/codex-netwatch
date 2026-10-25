import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_BUDGET, createBudgetCalendar, budgetPeriod } from './budgets.mjs';
import { calendarSummary, reportSummary } from './reports.mjs';

export class Store {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(path.join(dir, 'monitor.sqlite'));
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 4) {
      this.db.close();
      throw new Error('Database was created by a newer Codex Netwatch version');
    }
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=3000;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS samples (
        at INTEGER PRIMARY KEY, duration INTEGER NOT NULL,
        codex_up INTEGER NOT NULL, codex_down INTEGER NOT NULL,
        all_up INTEGER NOT NULL, all_down INTEGER NOT NULL,
        unknown_up INTEGER NOT NULL, unknown_down INTEGER NOT NULL,
        candidates TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY, host TEXT NOT NULL, network TEXT NOT NULL,
        process TEXT NOT NULL, pid INTEGER, scope TEXT NOT NULL, evidence TEXT NOT NULL,
        first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, rule TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS buckets (
        minute INTEGER NOT NULL, connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        scope TEXT NOT NULL, up INTEGER NOT NULL, down INTEGER NOT NULL, last_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(minute, connection_id, scope)
      );
      CREATE INDEX IF NOT EXISTS buckets_time ON buckets(minute);
      CREATE INDEX IF NOT EXISTS connections_last ON connections(last_seen);
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, model TEXT NOT NULL,
        activity INTEGER NOT NULL, total_tokens INTEGER, input_tokens INTEGER,
        cached_tokens INTEGER, output_tokens INTEGER, observed_tokens INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, message TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collection_gaps (
        id INTEGER PRIMARY KEY, reason TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS gaps_time ON collection_gaps(started_at);
      CREATE TABLE IF NOT EXISTS anomalies (
        id INTEGER PRIMARY KEY, kind TEXT NOT NULL, started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL, detail TEXT NOT NULL, UNIQUE(kind,ended_at)
      );
      CREATE INDEX IF NOT EXISTS anomalies_time ON anomalies(ended_at);
    `);
    const bucketColumns = this.db
      .prepare('PRAGMA table_info(buckets)')
      .all()
      .map((x) => x.name);
    if (!bucketColumns.includes('last_at')) {
      this.db.exec(`BEGIN;
        ALTER TABLE buckets ADD COLUMN last_at INTEGER NOT NULL DEFAULT 0;
        UPDATE buckets SET last_at=MIN(minute+59999, (SELECT last_seen FROM connections WHERE id=connection_id));
        PRAGMA user_version=3;
        COMMIT;`);
    }
    this.insertSample = this.db.prepare('INSERT OR IGNORE INTO samples VALUES (?,?,?,?,?,?,?,?,?)');
    this.insertConnection = this.db.prepare(
      `INSERT INTO connections VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET host=excluded.host, process=excluded.process,pid=excluded.pid,scope=excluded.scope,evidence=excluded.evidence,last_seen=excluded.last_seen,rule=excluded.rule`,
    );
    this.insertBucket = this.db.prepare(
      `INSERT INTO buckets (minute,connection_id,scope,up,down,last_at) VALUES (?,?,?,?,?,?) ON CONFLICT(minute,connection_id,scope) DO UPDATE SET up=up+excluded.up, down=down+excluded.down,last_at=MAX(last_at,excluded.last_at)`,
    );
    this.calendar = createBudgetCalendar(this.get('budgetTimeZone', undefined));
    this.db.exec(`CREATE TABLE IF NOT EXISTS daily_usage (
      day TEXT PRIMARY KEY, codex_up INTEGER NOT NULL, codex_down INTEGER NOT NULL,
      all_up INTEGER NOT NULL, all_down INTEGER NOT NULL, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_notifications (key TEXT PRIMARY KEY, at INTEGER NOT NULL);`);
    this.insertDaily = this.db.prepare(`INSERT INTO daily_usage VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(day) DO UPDATE SET codex_up=codex_up+excluded.codex_up, codex_down=codex_down+excluded.codex_down,
      all_up=all_up+excluded.all_up, all_down=all_down+excluded.all_down,
      first_at=MIN(first_at,excluded.first_at),last_at=MAX(last_at,excluded.last_at)`);
    if (!this.get('budgetLedgerReady', false)) {
      this.db.exec('BEGIN');
      try {
        const days = new Map();
        for (const row of this.db.prepare('SELECT at,codex_up,codex_down,all_up,all_down FROM samples ORDER BY at').iterate()) {
          const day = this.calendar.day(row.at);
          const total = days.get(day) || { day, codex_up: 0, codex_down: 0, all_up: 0, all_down: 0, first_at: row.at, last_at: row.at };
          for (const key of ['codex_up', 'codex_down', 'all_up', 'all_down']) total[key] += row[key];
          total.last_at = row.at;
          days.set(day, total);
        }
        for (const row of days.values()) this.insertDaily.run(row.day, row.codex_up, row.codex_down, row.all_up, row.all_down, row.first_at, row.last_at);
        this.set('budgetTimeZone', this.calendar.timeZone);
        this.set('budgetLedgerReady', true);
        this.db.exec('PRAGMA user_version=4; COMMIT');
      } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
    } else this.db.exec('PRAGMA user_version=4');
  }
  record(sample) {
    this.db.exec('BEGIN');
    try {
      const inserted = this.insertSample.run(
        sample.at,
        sample.duration,
        sample.codexUp,
        sample.codexDown,
        sample.allUp,
        sample.allDown,
        sample.unknownUp,
        sample.unknownDown,
        JSON.stringify(sample.activeSessions),
      );
      if (!inserted.changes) {
        this.db.exec('COMMIT');
        return false;
      }
      this.insertDaily.run(this.calendar.day(sample.at), sample.codexUp, sample.codexDown, sample.allUp, sample.allDown, sample.at, sample.at);
      for (const row of sample.rows) {
        this.insertConnection.run(
          row.key,
          row.host,
          row.network,
          row.process || '',
          row.pid,
          row.scope,
          row.evidence,
          sample.at,
          sample.at,
          row.rule,
        );
        if (row.up || row.down)
          this.insertBucket.run(
            Math.floor(sample.at / 60000) * 60000,
            row.key,
            row.scope,
            row.up,
            row.down,
            sample.at,
          );
      }
      this.db.exec('COMMIT');
      return true;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  saveSession(s, observed = 0) {
    this.db
      .prepare(
        `INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,model=excluded.model,activity=excluded.activity,total_tokens=excluded.total_tokens,input_tokens=excluded.input_tokens,cached_tokens=excluded.cached_tokens,output_tokens=excluded.output_tokens,observed_tokens=observed_tokens+excluded.observed_tokens`,
      )
      .run(
        s.id,
        s.title,
        s.model || '',
        s.activity || 0,
        s.total ?? null,
        s.input ?? null,
        s.cached ?? null,
        s.output ?? null,
        observed,
      );
  }
  sessions() {
    return this.db.prepare('SELECT * FROM sessions ORDER BY activity DESC LIMIT 200').all();
  }
  totals(from, to) {
    return this.db
      .prepare(
        `SELECT COALESCE(SUM(codex_up),0) AS codex_up, COALESCE(SUM(codex_down),0) AS codex_down, COALESCE(SUM(all_up),0) AS all_up, COALESCE(SUM(all_down),0) AS all_down, COALESCE(SUM(unknown_up),0) AS unknown_up, COALESCE(SUM(unknown_down),0) AS unknown_down, COUNT(*) AS samples FROM samples WHERE at>=? AND at<=?`,
      )
      .get(from, to);
  }
  trend(from, to) {
    const width = Math.max(1000, Math.ceil((to - from) / 180 / 1000) * 1000);
    return this.db
      .prepare(
        `SELECT CAST(at / ? AS INTEGER)*? AS at, SUM(codex_up) AS up, SUM(codex_down) AS down, SUM(all_up+all_down) AS all_bytes, SUM(duration) AS duration FROM samples WHERE at>=? AND at<=? GROUP BY 1 ORDER BY 1`,
      )
      .all(width, width, from, to);
  }
  connections(from, to, scope = 'all', limit = 100) {
    return this.db
      .prepare(
        `SELECT c.id,c.host,c.network,CASE WHEN b.scope='unknown' THEN '' ELSE c.process END AS process,CASE WHEN b.scope='unknown' THEN NULL ELSE c.pid END AS pid,b.scope,CASE WHEN b.scope='unknown' THEN 'none' ELSE c.evidence END AS evidence,MAX(b.last_at) AS last_seen,SUM(b.up) AS up,SUM(b.down) AS down FROM buckets b JOIN connections c ON c.id=b.connection_id WHERE b.minute>=? AND b.minute<=? AND (?='all' OR b.scope=?) GROUP BY c.id,b.scope ORDER BY SUM(b.up+b.down) DESC LIMIT ?`,
      )
      .all(from, to, scope, scope, limit);
  }
  domains(from, to, scope = 'codex') {
    return this.db
      .prepare(
        `SELECT c.host,SUM(b.up) AS up,SUM(b.down) AS down,COUNT(DISTINCT c.id) AS connections FROM buckets b JOIN connections c ON c.id=b.connection_id WHERE b.minute>=? AND b.minute<=? AND (?='all' OR b.scope=?) GROUP BY c.host ORDER BY SUM(b.up+b.down) DESC LIMIT 8`,
      )
      .all(from, to, scope, scope);
  }
  correlation(id, from, to) {
    return this.db
      .prepare(
        `SELECT COUNT(*) AS samples, MIN(at) AS first_at, MAX(at) AS last_at FROM samples WHERE at>=? AND at<=? AND EXISTS (SELECT 1 FROM json_each(candidates) WHERE value=?)`,
      )
      .get(from, to, id);
  }
  alert(at, message) {
    this.db.prepare('INSERT INTO alerts(at,message) VALUES (?,?)').run(at, message);
  }
  alerts() {
    return this.db.prepare('SELECT * FROM alerts ORDER BY at DESC,id DESC LIMIT 20').all();
  }
  set(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key, JSON.stringify(value));
  }
  get(key, fallback) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  }
  firstAt() {
    return this.db.prepare('SELECT MIN(at) AS at FROM samples').get().at;
  }
  budgetSummary(now = Date.now(), settings = this.get('budget', DEFAULT_BUDGET), includePeaks = true) {
    const day = this.calendar.day(now), month = day.slice(0, 7);
    const rows = this.db.prepare('SELECT * FROM daily_usage WHERE day>=? AND day<=? ORDER BY day').all(`${month}-01`, day);
    const prefix = settings.scope === 'all' ? 'all' : 'codex';
    const peaks = includePeaks ? this.db.prepare(`SELECT CAST(at/3600000 AS INTEGER)*3600000 AS at,
      SUM(${prefix}_up+${prefix}_down) AS bytes FROM samples WHERE at>=? AND at<=?
      GROUP BY 1 HAVING bytes>0 ORDER BY bytes DESC,at DESC LIMIT 3`).all(now - 86400000, now) : [];
    return { settings, timeZone: this.calendar.timeZone,
      firstObservedAt: this.db.prepare('SELECT MIN(first_at) AS at FROM daily_usage').get().at,
      day: budgetPeriod('day', day, rows.filter((r) => r.day === day), settings),
      month: budgetPeriod('month', month, rows, settings), peaks };
  }
  calendarSummary(month, scope = 'codex', now = Date.now()) {
    return calendarSummary(this, month, scope, now);
  }
  reportSummary(options, now = Date.now()) {
    return reportSummary(this, options, now);
  }
  checkBudgets(now = Date.now(), settings = this.get('budget', DEFAULT_BUDGET)) {
    if (!settings.dailyGB && !settings.monthlyGB) return;
    const summary = this.budgetSummary(now, settings, false);
    this.db.exec('BEGIN');
    try {
      for (const period of [summary.day, summary.month]) {
        if (!period.enabled) continue;
        // A jump straight past 100% produces the exceeded alert only, not two
        // simultaneous notifications. Persist both thresholds as acknowledged.
        const reached = [settings.warnPercent, 100].filter((pct) => period.usedBytes >= period.limitBytes * pct / 100);
        let fresh = false;
        for (const pct of reached) {
          const key = JSON.stringify([period.kind, period.key, settings.scope, period.limitBytes, pct]);
          fresh = this.db.prepare('INSERT OR IGNORE INTO budget_notifications VALUES (?,?)').run(key, now).changes > 0 || fresh;
        }
        if (fresh) this.alert(now, JSON.stringify({ type: 'budget', kind: period.kind, key: period.key,
          scope: settings.scope, usedGB: (period.usedBytes / 1e9).toFixed(2), limitGB: period.limitBytes / 1e9,
          percent: Math.floor(period.ratio * 100), exceeded: period.state === 'exceeded' }));
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  lastAt() {
    return this.db.prepare('SELECT MAX(at) AS at FROM samples').get().at;
  }
  openGap(reason, from) {
    if (
      ![
        'initial_baseline',
        'collector_restart',
        'source_unavailable',
        'collector_error',
        'source_changed',
        'sampling_delay',
        'observer_unavailable',
        'clock_changed',
      ].includes(reason) ||
      !Number.isSafeInteger(from) ||
      from < 0
    )
      throw new Error('Invalid collection gap');
    return Number(
      this.db
        .prepare('INSERT INTO collection_gaps(reason,started_at) VALUES (?,?)')
        .run(reason, from).lastInsertRowid,
    );
  }
  closeGap(id, to) {
    if (!Number.isSafeInteger(to) || to < 0) throw new Error('Invalid gap end');
    this.db
      .prepare(
        'UPDATE collection_gaps SET ended_at=MAX(started_at,?) WHERE id=? AND ended_at IS NULL',
      )
      .run(to, id);
  }
  closeOpenGaps(to) {
    this.db
      .prepare('UPDATE collection_gaps SET ended_at=MAX(started_at,?) WHERE ended_at IS NULL')
      .run(to);
  }
  anomaly(event) {
    this.db
      .prepare('INSERT OR IGNORE INTO anomalies(kind,started_at,ended_at,detail) VALUES (?,?,?,?)')
      .run(event.kind, event.from, event.to, JSON.stringify(event));
  }
  insights(from, to) {
    const coverage = this.db
      .prepare(
        `SELECT COUNT(*) AS sampleCount,MIN(at) AS firstSampleAt,MAX(at) AS lastSampleAt,
        COALESCE(SUM(MIN(duration,MAX(0,at-?))),0) AS observedDurationMs,
        COALESCE(SUM(codex_up),0) AS codexUp,COALESCE(SUM(codex_down),0) AS codexDown,
        COALESCE(SUM(all_up+all_down),0) AS reportedProxyBytes
        FROM samples WHERE at>=? AND at<=?`,
      )
      .get(from, from, to);
    const measured = this.db
      .prepare(
        `SELECT COALESCE(SUM(up+down),0) AS totalConnectionBytes,
        COALESCE(SUM(CASE WHEN scope='unknown' THEN up+down ELSE 0 END),0) AS unknownBytes
        FROM buckets WHERE minute>=? AND minute<=?`,
      )
      .get(from, to);
    const gaps = this.db
      .prepare(
        `SELECT id,reason,started_at AS 'from',ended_at AS 'to' FROM collection_gaps
        WHERE started_at<=? AND (ended_at IS NULL OR ended_at>=?) ORDER BY started_at DESC,id DESC LIMIT 100`,
      )
      .all(to, from);
    const counts = this.db
      .prepare(
        `SELECT COUNT(*) AS gapCount,COALESCE(SUM(ended_at IS NULL),0) AS openGapCount
        FROM collection_gaps WHERE started_at<=? AND (ended_at IS NULL OR ended_at>=?)`,
      )
      .get(to, from);
    const anomalies = this.db
      .prepare(
        `SELECT id,detail FROM anomalies WHERE started_at<=? AND ended_at>=?
        ORDER BY ended_at DESC,id DESC LIMIT 100`,
      )
      .all(to, from)
      .map((row) => ({ ...JSON.parse(row.detail), id: row.id }));
    const processQuery = this.db.prepare(
      `SELECT CASE WHEN b.scope='unknown' THEN '' ELSE c.process END AS process,b.scope,
        COUNT(DISTINCT CASE WHEN b.scope='unknown' THEN NULL ELSE c.pid END) AS pidCount,
        SUM(b.up) AS up,SUM(b.down) AS down,COUNT(DISTINCT c.id) AS connections,MAX(b.last_at) AS last_seen
        FROM buckets b JOIN connections c ON c.id=b.connection_id WHERE b.minute>=? AND b.minute<=?
        AND (?='all' OR b.scope=?)
        GROUP BY 1,b.scope ORDER BY SUM(b.up+b.down) DESC,process,b.scope LIMIT ?`,
    );
    const processRows = (scope, limit) =>
      processQuery.all(from, to, scope, scope, limit).map((row) => ({
        ...row,
        process: row.process.replaceAll('\\', '/').split('/').at(-1),
      }));
    const processes = processRows('all', 20);
    const codexProcesses = processRows('codex', 8);
    return {
      anomalies,
      gaps,
      processes,
      codexProcesses,
      coverage: {
        ...coverage,
        ...measured,
        ...counts,
        attributedBytes: measured.totalConnectionBytes - measured.unknownBytes,
        unknownShare: measured.totalConnectionBytes
          ? measured.unknownBytes / measured.totalConnectionBytes
          : null,
        measurement: 'mihomo_snapshot_deltas',
      },
    };
  }
  prune(days, now = Date.now()) {
    const cutoff = now - days * 86400000;
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM samples WHERE at<?').run(cutoff);
      this.db.prepare('DELETE FROM buckets WHERE minute<?').run(Math.floor(cutoff / 60000) * 60000);
      this.db
        .prepare(
          'DELETE FROM connections WHERE last_seen<? AND id NOT IN (SELECT connection_id FROM buckets)',
        )
        .run(cutoff);
      this.db.prepare('DELETE FROM alerts WHERE at<?').run(cutoff);
      this.db.prepare('DELETE FROM anomalies WHERE ended_at<?').run(cutoff);
      this.db.prepare('DELETE FROM collection_gaps WHERE ended_at<?').run(cutoff);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.db.exec('PRAGMA optimize; PRAGMA wal_checkpoint(PASSIVE)');
  }
  close() {
    this.db.close();
  }
}
