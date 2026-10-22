import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { yamlScalar } from './config.mjs';

export function validateEndpoint(endpoint) {
  if (endpoint.startsWith('\\\\.\\pipe\\')) return { socketPath: endpoint };
  const url = new URL(endpoint.includes('://') ? endpoint : `http://${endpoint}`);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Controller must be a local HTTP endpoint or Windows named pipe');
  }
  return { hostname: url.hostname.replace(/^\[|\]$/g, ''), port: url.port || 80 };
}

export function discoverEndpoints(config, env = process.env) {
  if (config.controller !== 'auto') return [{ endpoint: config.controller, secret: config.secret }];
  const candidates = [];
  const dirs = [
    env.APPDATA && path.join(env.APPDATA, 'io.github.clash-verge-rev.clash-verge-rev'),
    env.APPDATA && path.join(env.APPDATA, 'io.github.clash-verge.clash-verge'),
    path.join(os.homedir(), '.config', 'clash-verge'),
  ].filter(Boolean);
  for (const dir of dirs)
    for (const file of ['clash-verge.yaml', 'config.yaml']) {
      try {
        const text = fs.readFileSync(path.join(dir, file), 'utf8');
        const secret = config.secret || yamlScalar(text, 'secret');
        const pipe = yamlScalar(text, 'external-controller-pipe');
        const tcp = yamlScalar(text, 'external-controller');
        if (pipe) candidates.push({ endpoint: pipe, secret: '' });
        if (tcp) candidates.push({ endpoint: tcp.replace('0.0.0.0', '127.0.0.1'), secret });
      } catch {
        /* Other clients may not be installed. */
      }
    }
  if (process.platform === 'win32') {
    try {
      for (const name of fs.readdirSync('\\\\.\\pipe\\')) {
        if (/^(verge-mihomo-(production|sidecar)|mihomo$|clash$)/i.test(name))
          candidates.unshift({ endpoint: `\\\\.\\pipe\\${name}`, secret: '' });
      }
    } catch {
      /* Enumeration may be restricted; configured paths still work. */
    }
  }
  candidates.push({ endpoint: '127.0.0.1:9090', secret: config.secret });
  return candidates.filter((v, i, a) => a.findIndex((x) => x.endpoint === v.endpoint) === i);
}

export function requestSnapshot(candidate, timeoutMs = 1800) {
  const target = validateEndpoint(candidate.endpoint);
  return new Promise((resolve, reject) => {
    let deadline;
    const finish = (error, data) => {
      clearTimeout(deadline);
      if (error) reject(error);
      else resolve(data);
    };
    const req = http.get(
      {
        ...target,
        path: '/connections',
        headers: candidate.secret ? { Authorization: `Bearer ${candidate.secret}` } : {},
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          finish(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let size = 0;
        const parts = [];
        res.on('data', (part) => {
          size += part.length;
          if (size > 16 * 1024 * 1024) {
            res.destroy(new Error('Response too large'));
            return;
          }
          parts.push(part);
        });
        res.on('error', finish);
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(parts).toString('utf8'));
            if (
              !Array.isArray(data.connections) ||
              !Number.isFinite(data.uploadTotal) ||
              !Number.isFinite(data.downloadTotal)
            )
              throw new Error('Unexpected Mihomo response');
            finish(null, data);
          } catch (error) {
            finish(error);
          }
        });
      },
    );
    deadline = setTimeout(() => req.destroy(new Error('Controller timeout')), timeoutMs);
    req.on('timeout', () => req.destroy(new Error('Controller timeout')));
    req.on('error', finish);
  });
}

export class MihomoSource {
  constructor(config) {
    this.config = config;
    this.current = null;
    this.endpoint = '';
    this.generation = 0;
    this.issue = null;
  }
  async snapshot() {
    if (this.current) {
      try {
        const data = await requestSnapshot(this.current);
        this.issue = null;
        return data;
      } catch {
        this.current = null;
      }
    }
    const candidates = discoverEndpoints(this.config);
    const outcomes = await Promise.allSettled(
      candidates.map(async (c) => ({ candidate: c, data: await requestSnapshot(c) })),
    );
    const found = outcomes.find((x) => x.status === 'fulfilled');
    if (!found) {
      const unauthorized = outcomes.some((x) => /HTTP (401|403)/.test(x.reason?.message || ''));
      this.issue = unauthorized
        ? 'authorization'
        : outcomes.some(
              (x) =>
                /HTTP |Unexpected Mihomo|JSON|Response too large/i.test(x.reason?.message || '') ||
                x.reason instanceof SyntaxError,
            )
          ? 'incompatible'
          : 'unreachable';
      throw new Error(
        unauthorized
          ? '接口需要授权：设置 MIHOMO_SECRET 后重启。'
          : '未连接 Mihomo：请启动代理，或在 config.local.json 配置本地 controller。',
      );
    }
    this.current = found.value.candidate;
    this.issue = null;
    this.generation++;
    this.endpoint = this.current.endpoint.startsWith('\\\\')
      ? 'Windows 命名管道'
      : this.current.endpoint;
    return found.value.data;
  }
}
