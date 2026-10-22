import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSystemLocale } from '../src/locale.mjs';

test('Windows uses UI culture rather than the browser or process language', () => {
  const calls = [];
  const locale = detectSystemLocale({
    platform: 'win32',
    env: { LANG: 'en_US.UTF-8', LC_ALL: 'en_GB.UTF-8' },
    fallback: 'fr-FR',
    run(...args) {
      calls.push(args);
      return '  zh-CN\r\n';
    },
  });
  assert.equal(locale, 'zh-CN');
  assert.equal(calls.length, 1);
  const [executable, args, options] = calls[0];
  assert.match(executable, /powershell(?:\.exe)?$/i);
  assert.match(args.join(' '), /Get-UICulture/);
  assert.equal(options.encoding, 'utf8');
  assert.equal(options.windowsHide, true);
  assert.equal(options.timeout, 2000);
});

test('Windows keeps valid UI regions and falls back when PowerShell fails', () => {
  assert.equal(
    detectSystemLocale({ platform: 'win32', fallback: 'en-US', run: () => 'zh-TW\r\n' }),
    'zh-TW',
  );
  assert.equal(
    detectSystemLocale({ platform: 'win32', fallback: 'fr-FR', run: () => 'en-GB\r\n' }),
    'en-GB',
  );
  for (const failure of [new Error('PowerShell unavailable'), new Error('Timed out')]) {
    assert.equal(
      detectSystemLocale({
        platform: 'win32',
        env: {},
        fallback: 'en-GB',
        run() {
          throw failure;
        },
      }),
      'en-GB',
    );
  }
});

test('unusable Windows locale output cannot escape into a page language', () => {
  for (const output of [
    '',
    ' \r\n',
    'invalid locale',
    'zh-CN\nwarning text',
    '<script>',
    'C',
    'POSIX',
  ]) {
    assert.equal(
      detectSystemLocale({
        platform: 'win32',
        env: {},
        fallback: 'en-GB',
        run: () => output,
      }),
      'en-GB',
      JSON.stringify(output),
    );
  }
});

test('non-Windows uses locale environment precedence and normalizes POSIX notation', () => {
  const run = () => assert.fail('PowerShell must not run on non-Windows platforms');
  assert.equal(
    detectSystemLocale({
      platform: 'linux',
      fallback: 'en-US',
      run,
      env: { LC_ALL: 'zh_TW.UTF-8', LC_MESSAGES: 'fr_FR.UTF-8', LANG: 'de_DE.UTF-8' },
    }),
    'zh-TW',
  );
  assert.equal(
    detectSystemLocale({
      platform: 'darwin',
      fallback: 'en-US',
      run,
      env: { LC_ALL: '', LC_MESSAGES: 'en_GB.UTF-8@euro', LANG: 'de_DE.UTF-8' },
    }),
    'en-GB',
  );
  assert.equal(
    detectSystemLocale({
      platform: 'linux',
      fallback: 'en-US',
      run,
      env: { LANG: 'de_DE@euro' },
    }),
    'de-DE',
  );
  assert.equal(
    detectSystemLocale({
      platform: 'linux',
      fallback: 'en-US',
      run,
      env: { LANG: 'zh' },
    }),
    'zh',
  );
});

test('absent, POSIX C, and invalid environment locales use a deterministic fallback', () => {
  for (const env of [
    {},
    { LANG: 'C' },
    { LANG: 'C.UTF-8' },
    { LANG: 'POSIX' },
    { LANG: 'not a locale' },
  ]) {
    assert.equal(detectSystemLocale({ platform: 'linux', env, fallback: 'fr-FR' }), 'fr-FR');
  }
});
