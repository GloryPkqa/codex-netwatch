import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function readTail(file, size = 2 * 1024 * 1024) {
  const fd = fs.openSync(file, 'r');
  try {
    const length = fs.fstatSync(fd).size;
    const start = Math.max(0, length - size);
    const buffer = Buffer.alloc(Math.min(length, size));
    fs.readSync(fd, buffer, 0, buffer.length, start);
    const text = buffer.toString('utf8');
    // A multi-megabyte image/tool line must not be parsed or retained.
    return start ? text.slice(text.indexOf('\n') + 1) : text;
  } finally {
    fs.closeSync(fd);
  }
}

export function latestUsage(text) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"token_count"') || !lines[i].includes('"total_token_usage"')) continue;
    try {
      const row = JSON.parse(lines[i]);
      const usage =
        row.type === 'event_msg' && row.payload?.type === 'token_count'
          ? row.payload.info?.total_token_usage
          : null;
      if (usage && Number.isFinite(usage.total_tokens))
        return {
          total: usage.total_tokens,
          input: usage.input_tokens,
          cached: usage.cached_input_tokens,
          output: usage.output_tokens,
        };
    } catch {
      /* Ignore partial writes and unsupported log lines. */
    }
  }
  return null;
}

export function sessionTitles(text) {
  const titles = new Map();
  for (const line of text.split('\n')) {
    try {
      const row = JSON.parse(line);
      if (typeof row.id === 'string' && typeof row.thread_name === 'string')
        titles.set(row.id, row.thread_name);
    } catch {
      /* Incomplete index writes are expected. */
    }
  }
  return titles;
}

function threadSource(value) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

function isGuardian(row) {
  return row.model === 'codex-auto-review' || threadSource(row.source)?.subagent?.other === 'guardian';
}

function threadTitle(row, titles, threads) {
  const title = (thread) => thread.name || titles.get(thread.id) || thread.title || thread.id;
  const source = threadSource(row.source);
  const spawn = source?.subagent?.thread_spawn || source?.thread_spawn;
  const parentId = row.parent_thread_id || spawn?.parent_thread_id;
  if (!parentId) return title(row);
  const parent = threads.get(parentId);
  const parentTitle = parent ? title(parent) : titles.get(parentId) || parentId;
  const agentPath = row.agent_path || spawn?.agent_path;
  const agentName =
    (typeof agentPath === 'string' && agentPath.split(/[\\/]/).filter(Boolean).at(-1)) ||
    row.agent_nickname ||
    spawn?.agent_nickname ||
    row.id;
  return `${parentTitle} · 子任务 ${agentName}`;
}

export class SessionReader {
  constructor(config, store) {
    this.config = config;
    this.store = store;
    this.cache = new Map();
    this.status = 'starting';
    this.active = [];
  }
  refresh(now = Date.now()) {
    let db;
    try {
      const home = this.config.codexHome;
      let titles = new Map();
      try {
        titles = sessionTitles(readTail(path.join(home, 'session_index.jsonl'), 1024 * 1024));
      } catch {
        /* Optional local title index. */
      }
      const files = fs
        .readdirSync(home)
        .filter((x) => /^state_\d+\.sqlite$/.test(x))
        .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]));
      if (!files.length) throw new Error('No Codex state database');
      db = new DatabaseSync(path.join(home, files[0]), { readOnly: true });
      db.exec('PRAGMA busy_timeout=1000; PRAGMA query_only=ON');
      const fields = new Set(
        db
          .prepare('PRAGMA table_info(threads)')
          .all()
          .map((x) => x.name),
      );
      for (const key of ['id', 'title', 'rollout_path', 'updated_at'])
        if (!fields.has(key)) throw new Error('Unsupported threads schema');
      const optionalFields = ['name', 'model', 'source', 'parent_thread_id', 'agent_path', 'agent_nickname']
        .map((key) => fields.has(key) ? key : `'' AS ${key}`)
        .join(',');
      // Read metadata for all threads so internal reviews cannot consume the
      // rollout-read limit, and parent titles remain available for older tasks.
      const threads = db
        .prepare(
          `SELECT id,title,rollout_path,updated_at,${optionalFields} FROM threads ORDER BY updated_at DESC`,
        )
        .all();
      const byId = new Map(threads.map((row) => [row.id, row]));
      this.store.excludeSessions?.(threads.filter(isGuardian).map((row) => row.id));
      const sessions = threads.filter((row) => !isGuardian(row)).slice(0, 200);
      this.active = [];
      for (const row of sessions) {
        const title = String(threadTitle(row, titles, byId)).slice(0, 200);
        const old = this.cache.get(row.id);
        let usage = old?.usage || null,
          activity = row.updated_at * 1000;
        let fingerprint = '';
        try {
          // Only open rollouts inside the configured Codex home. Never follow a DB
          // path to an unrelated file or a symlink escaping that directory.
          const real = fs.realpathSync(row.rollout_path);
          // Windows can return either C:\\... or \\\\?\\C:\\... for the same
          // location. Compare matching namespace forms after resolving symlinks.
          const rel = path.relative(
            path.toNamespacedPath(fs.realpathSync(home)),
            path.toNamespacedPath(real),
          );
          if (rel.startsWith('..') || path.isAbsolute(rel) || !real.endsWith('.jsonl'))
            throw new Error('Unexpected rollout path');
          const stat = fs.statSync(real);
          activity = stat.mtimeMs;
          fingerprint = `${stat.size}:${stat.mtimeMs}`;
          if (fingerprint !== old?.fingerprint) usage = latestUsage(readTail(real)) || usage;
        } catch {
          /* Missing/archived rollout: usage stays unknown, never zero-filled. */
        }
        const observed = old?.usage && usage ? Math.max(0, usage.total - old.usage.total) : 0;
        const session = {
          id: row.id,
          title,
          model: row.model || '',
          activity,
          ...usage,
        };
        if (!old || fingerprint !== old.fingerprint || title !== old.title)
          this.store.saveSession(session, observed);
        this.cache.set(row.id, { usage, fingerprint, title });
        if (now - activity >= 0 && now - activity <= 60000) this.active.push(row.id);
      }
      this.status = 'ready';
    } catch {
      this.status = 'unavailable';
      this.active = [];
    } finally {
      db?.close();
    }
  }
}
