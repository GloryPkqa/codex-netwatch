import { execFileSync } from 'node:child_process';

function normalizeLocale(value) {
  const candidate = String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/[.@]/)[0]
    .replaceAll('_', '-');
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(candidate)) return null;
  try {
    return Intl.getCanonicalLocales(candidate)[0] || null;
  } catch {
    return null;
  }
}

// Windows display language can differ from the browser's own preference.
// Probe once at startup, without a visible PowerShell window.
export function detectSystemLocale({
  platform = process.platform,
  env = process.env,
  run = execFileSync,
  fallback = Intl.DateTimeFormat().resolvedOptions().locale,
} = {}) {
  if (platform === 'win32') {
    try {
      const result = run(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '(Get-UICulture).Name'],
        { encoding: 'utf8', windowsHide: true, timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      const locale = normalizeLocale(result);
      if (locale) return locale;
    } catch {
      /* Fall back when PowerShell is unavailable or restricted. */
    }
  } else {
    const locale = normalizeLocale(env.LC_ALL || env.LC_MESSAGES || env.LANG);
    if (locale) return locale;
  }
  return normalizeLocale(fallback) || 'en-US';
}
