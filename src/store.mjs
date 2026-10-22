import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class Store {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(path.join(dir, 'monitor.sqlite'));
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 2) {
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
    `);
    const bucketColumns = this.db
      .prepare('PRAGMA table_info(buckets)')
      .all()
      .map((x) => x.name);
    if (!bucketColumns.includes('last_at')) {
      this.db.exec(`BEGIN;
        ALTER TABLE buckets ADD COLUMN last_at INTEGER NOT NULL DEFAULT 0;
        UPDATE buckets SET last_at=MIN(minute+59999, (SELECT last_seen FROM connections WHERE id=connection_id));
        PRAGMA user_version=2;
        COMMIT;`);
    } else this.db.exec('PRAGMA user_version=2');
    this.insertSample = this.db.prepare('INSERT OR IGNORE INTO samples VALUES (?,?,?,?,?,?,?,?,?)');
    this.insertConnection = this.db.prepare(
      `INSERT INTO connections VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET host=excluded.host, process=excluded.process,pid=excluded.pid,scope=excluded.scope,evidence=excluded.evidence,last_seen=excluded.last_seen,rule=excluded.rule`,
    );
    this.insertBucket = this.db.prepare(
      `INSERT INTO buckets (minute,connection_id,scope,up,down,last_at) VALUES (?,?,?,?,?,?) ON CONFLICT(minute,connection_id,scope) DO UPDATE SET up=up+excluded.up, down=down+excluded.down,last_at=MAX(last_at,excluded.last_at)`,
    );
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
    return this.db.prepare('SELECT * FROM alerts ORDER BY at DESC LIMIT 20').all();
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
