import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function loadConfig(root, env = process.env) {
  const file = path.join(root, 'config.local.json');
  const local = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const config = {
    port: 43128,
    controller: 'auto',
    codexHome: path.join(env.USERPROFILE || os.homedir(), '.codex'),
    intervalMs: 1000,
    retentionDays: 30,
    alertMBPerMinute: 100,
    includeDescendants: true,
    processNames: [
      'codex',
      'codex.exe',
      'codex-code-mode-host.exe',
      'codex-computer-use-swift.exe',
    ],
    ...local,
  };
  if (!config.codexHome) config.codexHome = path.join(env.USERPROFILE || os.homedir(), '.codex');
  if (env.CODEX_HOME) config.codexHome = env.CODEX_HOME;
  if (env.CODEX_FLOW_CONTROLLER) config.controller = env.CODEX_FLOW_CONTROLLER;
  if (env.CODEX_FLOW_PORT) config.port = Number(env.CODEX_FLOW_PORT);
  config.secret = env.MIHOMO_SECRET || '';
  config.desktopToken = env.CODEX_NETWATCH_DESKTOP_TOKEN || '';
  if (config.desktopToken && !/^[a-f0-9]{32,128}$/i.test(config.desktopToken))
    throw new Error('Invalid desktop instance marker');
  config.root = root;
  config.demo = process.argv.includes('--demo');
  const dataRoot = env.CODEX_FLOW_DATA_DIR
    ? path.resolve(env.CODEX_FLOW_DATA_DIR)
    : path.join(root, 'data');
  config.dataDir = config.demo ? path.join(dataRoot, 'demo') : dataRoot;
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535)
    throw new Error('port must be 1024–65535');
  if (!Number.isInteger(config.intervalMs) || config.intervalMs < 500 || config.intervalMs > 10000)
    throw new Error('intervalMs must be 500–10000');
  if (
    !Number.isInteger(config.retentionDays) ||
    config.retentionDays < 1 ||
    config.retentionDays > 365
  )
    throw new Error('retentionDays must be 1–365');
  if (!Number.isFinite(config.alertMBPerMinute) || config.alertMBPerMinute <= 0)
    throw new Error('alertMBPerMinute must be positive');
  if (
    !Array.isArray(config.processNames) ||
    !config.processNames.every((x) => typeof x === 'string')
  )
    throw new Error('processNames must be strings');
  if (typeof config.includeDescendants !== 'boolean')
    throw new Error('includeDescendants must be boolean');
  if (typeof config.controller !== 'string' || !config.controller)
    throw new Error('controller must be a nonempty string');
  if (typeof config.codexHome !== 'string') throw new Error('codexHome must be a path string');
  return config;
}

// This deliberately reads only top-level scalar keys; it is not a general YAML parser.
export function yamlScalar(text, key) {
  const line = text.split(/\r?\n/).find((x) => x.startsWith(`${key}:`));
  if (!line) return '';
  const value = line.slice(key.length + 1).trim();
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return '';
    }
  }
  if (value.startsWith("'")) return value.slice(1, value.lastIndexOf("'")).replaceAll("''", "'");
  return value.replace(/\s+#.*$/, '').trim();
}
