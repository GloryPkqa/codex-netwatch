import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { VERSION } from './version.mjs';
import { createDiagnostics } from './diagnostics.mjs';

export function parseRange(url, now, firstAt) {
  const ranges = {
    '15m': 900000,
    '1h': 3600000,
    '24h': 86400000,
    '7d': 604800000,
    '30d': 2592000000,
  };
  let from = url.searchParams.has('from')
    ? Number(url.searchParams.get('from'))
    : url.searchParams.get('range') === 'all'
      ? firstAt || now
      : now - (ranges[url.searchParams.get('range')] || ranges['1h']);
  let to = url.searchParams.has('to') ? Math.min(now, Number(url.searchParams.get('to'))) : now;
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    to < from ||
    to - from > 366 * 86400000
  )
    throw new Error('Invalid range');
  // Minute buckets and aggregate queries share the same inclusive start boundary.
  from = Math.floor(from / 60000) * 60000;
  // Historical custom ends are exclusive minute boundaries. Otherwise a bucket
  // beginning exactly at `to` would include traffic after the selected range.
  if (url.searchParams.has('to') && to < now) to = Math.ceil(to / 60000) * 60000 - 1;
  if (to < from) throw new Error('Invalid range');
  return { from, to };
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const onData = (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.removeListener('data', onData);
        chunks.length = 0;
        const error = new Error('Body too large');
        error.status = 413;
        reject(error);
        req.resume();
      } else chunks.push(chunk);
    };
    req.on('data', onData);
    req.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.once('error', reject);
  });
}
export function createServer(config, store, monitor, shutdown) {
  let insightCache = null;
  const insights = (range) => {
    const key = `${Math.floor(range.from / 60000)}:${Math.floor(range.to / 60000)}`;
    if (!insightCache || insightCache.key !== key || Date.now() - insightCache.at >= 10000)
      insightCache = { key, at: Date.now(), value: store.insights?.(range.from, range.to) || null };
    return insightCache.value;
  };
  const assets = new Map(
    ['/', '/app.js', '/i18n.js', '/desktop.js', '/setup.js', '/style.css', '/icon.svg'].map(
      (route) => [
        route,
        path.join(config.root, 'public', route === '/' ? 'index.html' : route.slice(1)),
      ],
    ),
  );
  const server = http.createServer(async (req, res) => {
    const port = server.address()?.port || config.port;
    const expectedHost = `127.0.0.1:${port}`;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const json = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    if (req.headers.host !== expectedHost) return json(403, { error: 'Invalid Host' });
    if (req.headers.origin && req.headers.origin !== `http://${expectedHost}`)
      return json(403, { error: 'Cross-origin requests are not allowed' });
    try {
      const url = new URL(req.url, `http://${expectedHost}`);
      if (url.pathname === '/api/health' && req.method === 'GET')
        return json(200, {
          app: 'codex-flow',
          version: VERSION,
          ...(config.desktopToken ? { desktopInstance: config.desktopToken } : {}),
          systemLocale: config.systemLocale || Intl.DateTimeFormat().resolvedOptions().locale,
          state: monitor.state,
          demo: config.demo,
        });
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['x-codex-flow'] !== '1')
          return json(403, { error: 'Missing local client header' });
        if (req.method === 'POST') {
          const body = await readBody(req);
          if (url.pathname === '/api/settings') {
            const value = JSON.parse(body || '{}').alertMBPerMinute;
            if (!Number.isFinite(value) || value < 0.1 || value > 1000000)
              return json(400, { error: '阈值应为 0.1–1000000 MB/分钟' });
            monitor.setThreshold(value);
            return json(200, { ok: true });
          }
          if (url.pathname === '/api/stop') {
            if (config.desktopToken && req.headers['x-codex-desktop-token'] !== config.desktopToken)
              return json(403, { error: 'Desktop instance marker required' });
            json(200, { ok: true });
            setTimeout(shutdown, 100);
            return;
          }
          return json(404, { error: 'Not found' });
        }
        if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });
        if (url.pathname === '/api/diagnostics') {
          res.setHeader(
            'Content-Disposition',
            'attachment; filename="codex-netwatch-diagnostics.json"',
          );
          return json(200, createDiagnostics(config, store, monitor));
        }
        const range = parseRange(url, Date.now(), store.firstAt());
        const scope = ['codex', 'unknown', 'other', 'all'].includes(url.searchParams.get('scope'))
          ? url.searchParams.get('scope')
          : 'codex';
        if (url.pathname === '/api/dashboard') {
          return json(200, {
            status: monitor.status(),
            range,
            totals: store.totals(range.from, range.to),
            trend: store.trend(range.from, range.to),
            connections: store.connections(range.from, range.to, scope),
            domains: store.domains(range.from, range.to, scope),
            sessions: store.sessions(),
            alerts: store.alerts(),
            insights: insights(range),
          });
        }
        if (url.pathname === '/api/correlation') {
          const id = (url.searchParams.get('id') || '').slice(0, 128);
          return json(200, {
            ...store.correlation(id, range.from, range.to),
            attribution: 'activity_only',
            message: '仅表示日志活动与网络采样时间重合，不代表该会话产生这些字节。',
          });
        }
        if (url.pathname === '/api/export') {
          const rows = store.connections(range.from, range.to, scope, 10000);
          const columns = [
            'host',
            'process',
            'pid',
            'scope',
            'evidence',
            'network',
            'up',
            'down',
            'last_seen',
          ];
          res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="codex-netwatch-connections.csv"',
          });
          res.end(
            '\uFEFF' +
              [
                '# Mihomo observed bytes; not VPN wire bytes. Sessions are not byte-attributed.',
                columns.join(','),
                ...rows.map((row) => columns.map((k) => csvCell(row[k])).join(',')),
              ].join('\r\n'),
          );
          return;
        }
        return json(404, { error: 'Not found' });
      }
      if (req.method !== 'GET' || !assets.has(url.pathname))
        return json(404, { error: 'Not found' });
      const file = assets.get(url.pathname);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] });
      fs.createReadStream(file)
        .on('error', () => res.destroy())
        .pipe(res);
    } catch (error) {
      if (!res.headersSent)
        json(
          error.status === 413
            ? 413
            : error.message === 'Invalid range' ||
                error instanceof SyntaxError ||
                error.code === 'ERR_INVALID_URL'
              ? 400
              : 500,
          {
            error: '请求无法处理，请检查参数或稍后重试。',
          },
        );
      else res.end();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
