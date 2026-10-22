import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  messages,
  normalizeText,
  resolveLanguage,
  readLanguage,
  readLanguagePreference,
  saveLanguage,
  translate,
  captureStaticTranslations,
  translateAlert,
} from '../public/i18n.js';

test('language preference takes precedence and otherwise follows the preferred browser language', () => {
  assert.equal(resolveLanguage('en', ['zh-CN']), 'en');
  assert.equal(resolveLanguage('zh-CN', ['en-US']), 'zh-CN');
  for (const browserLanguage of ['zh', 'zh-CN', 'zh-TW', 'ZH-hk']) {
    assert.equal(resolveLanguage(null, [browserLanguage]), 'zh-CN');
  }
  assert.equal(resolveLanguage('invalid', ['en-GB', 'zh-CN']), 'en');
  assert.equal(resolveLanguage(null, ['fr-FR']), 'en');
  assert.equal(resolveLanguage(undefined), 'en');
  assert.equal(resolveLanguage(null, ['zho']), 'en');
});

test('language storage uses a stable key and remains optional when browser storage is denied', () => {
  const writes = [];
  const storage = {
    getItem(key) {
      assert.equal(key, 'codex-netwatch-language');
      return 'en';
    },
    setItem(...args) {
      writes.push(args);
    },
  };
  assert.equal(readLanguage(storage, ['zh-CN']), 'en');
  saveLanguage(storage, 'zh-CN');
  assert.deepEqual(writes, [['codex-netwatch-language', 'zh-CN']]);
  const denied = {
    getItem() {
      throw new Error('Storage access denied');
    },
    setItem() {
      throw new Error('Storage access denied');
    },
  };
  assert.equal(readLanguage(denied, ['zh-TW']), 'en');
  assert.doesNotThrow(() => saveLanguage(denied, 'en'));
  assert.equal(readLanguage(undefined, ['en-US']), 'en');
  assert.doesNotThrow(() => saveLanguage(undefined, 'zh-CN'));
});

test('automatic language uses the host system and explicit choices override it', () => {
  const storage = (value) => ({ getItem: () => value });
  assert.equal(readLanguage(storage(null), ['en-US'], 'zh-CN'), 'en');
  assert.equal(readLanguage(storage('auto'), ['zh-CN'], 'en-GB'), 'en');
  assert.equal(readLanguage(storage('invalid'), ['en-US'], 'zh-TW'), 'en');
  assert.equal(readLanguage(storage('auto'), ['en-US'], 'zh-TW'), 'zh-CN');
  assert.equal(readLanguage(storage('en'), ['zh-CN'], 'zh-CN'), 'en');
  assert.equal(readLanguage(storage('zh-CN'), ['en-US'], 'en-US'), 'zh-CN');
  assert.equal(readLanguage(storage(null), ['zh-TW']), 'en');
  assert.equal(readLanguage(storage(null), ['en-US']), 'en');
});

test('new or inaccessible preferences default to English while explicit auto remains available', () => {
  for (const value of [null, undefined, '', 'invalid', 'fr-FR']) {
    assert.equal(readLanguagePreference({ getItem: () => value }), 'en');
  }
  assert.equal(readLanguagePreference({ getItem: () => 'auto' }), 'auto');
  assert.equal(readLanguagePreference({ getItem: () => 'en' }), 'en');
  assert.equal(readLanguagePreference({ getItem: () => 'zh-CN' }), 'zh-CN');
  assert.equal(readLanguagePreference(undefined), 'en');
  assert.equal(
    readLanguagePreference({
      getItem() {
        throw new Error('Storage denied');
      },
    }),
    'en',
  );
});

test('translation substitutes literal values, keeps missing placeholders, and ignores inherited values', () => {
  assert.equal(translate('流量总览', 'en'), 'Overview');
  assert.equal(translate('流量总览', 'zh-CN'), '流量总览');
  assert.equal(translate('An unknown message', 'en'), 'An unknown message');
  const literal = "$& $$ $1 $` $' <script>alert(1)</script> \\path";
  assert.equal(
    translate('请求失败 ({status})', 'en', { status: literal }),
    `Request failed (${literal})`,
  );
  assert.equal(
    translate('全部 {total} 条 · {unknown} 条待识别进程', 'en', { total: 0 }),
    '0 total · {unknown} unidentified',
  );
  assert.equal(
    translate(
      '{from} 至 {to}',
      'en',
      Object.assign(Object.create({ from: 'inherited' }), { to: 'end' }),
    ),
    '{from} to end',
  );
  assert.equal(translate('{from} 至 {to}', 'zh-CN', { from: 0, to: 10 }), '0 至 10');
  assert.equal(translate(undefined, 'en'), '');
  assert.equal(translate(null, 'zh-CN'), '');
});

test('catalog translations preserve every interpolation placeholder', () => {
  const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const [source, translated] of Object.entries(messages)) {
    assert.equal(typeof translated, 'string', source);
    assert.ok(translated.length > 0, `Empty translation for ${source}`);
    assert.deepEqual(placeholders(translated), placeholders(source), source);
  }
});

test('persisted Chinese traffic alerts translate without changing amounts or unknown messages', () => {
  const original = 'Codex 最近 60 秒已观测到 123.450 MB，超过 0.10 MB 提醒阈值。';
  assert.equal(
    translateAlert(original, 'en'),
    'Observed 123.450 MB of Codex traffic in the last 60 seconds, exceeding the 0.10 MB alert threshold.',
  );
  assert.equal(translateAlert(original, 'zh-CN'), original);
  for (const custom of [
    'Custom alert: $1 <b>999</b>',
    'Codex 最近 60 秒已观测到 unknown MB，超过 1 MB 提醒阈值。',
    'Observed 5 MB of Codex traffic in the last 60 seconds, exceeding the 1 MB alert threshold.',
  ]) {
    assert.equal(translateAlert(custom, 'en'), custom);
  }
});

// The translator deliberately needs only this DOM subset. Keeping the fixture
// small makes accidental parent textContent replacement observable.
function text(textContent) {
  return { nodeType: 3, textContent };
}

function element(tagName, attributes = {}, ...childNodes) {
  const attrs = new Map(Object.entries(attributes));
  return {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    childNodes,
    getAttribute(name) {
      return attrs.get(name) ?? null;
    },
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
  };
}

test('static translation preserves nested controls, entered values, attributes, and Chinese restoration', () => {
  const label = text('\n  流量总览  ');
  const icon = element('span', { class: 'icon' }, text('◫'));
  const link = element('a', { href: '#overview', 'data-id': '流量总览' }, icon, label);
  const input = element('input', {
    placeholder: '搜索会话名称…',
    'aria-label': '搜索会话',
    title: '关闭',
  });
  input.value = '流量总览';
  const option = element('option', { value: '1h' }, text('最近 1 小时'));
  const select = element('select', {}, option);
  select.value = '1h';
  const title = element('title', {}, text('Codex Netwatch · 本地流量监控'));
  const unknown = text('A user-supplied address.example');
  const scriptText = text('流量总览');
  const styleText = text('关闭');
  const root = element(
    'html',
    {},
    title,
    link,
    input,
    select,
    unknown,
    element('script', {}, scriptText),
    element('style', {}, styleText),
  );
  const apply = captureStaticTranslations(root);

  apply('en');
  assert.equal(label.textContent, '\n  Overview  ');
  assert.strictEqual(link.childNodes[0], icon);
  assert.strictEqual(link.childNodes[1], label);
  assert.equal(icon.childNodes[0].textContent, '◫');
  assert.equal(link.getAttribute('href'), '#overview');
  assert.equal(link.getAttribute('data-id'), '流量总览');
  assert.equal(input.value, '流量总览');
  assert.equal(input.getAttribute('placeholder'), 'Search session title…');
  assert.equal(input.getAttribute('aria-label'), 'Search sessions');
  assert.equal(input.getAttribute('title'), 'Close');
  assert.equal(select.value, '1h');
  assert.equal(option.getAttribute('value'), '1h');
  assert.equal(option.childNodes[0].textContent, 'Last hour');
  assert.equal(title.childNodes[0].textContent, 'Codex Netwatch · Local network monitor');
  assert.equal(unknown.textContent, 'A user-supplied address.example');
  assert.equal(scriptText.textContent, '流量总览');
  assert.equal(styleText.textContent, '关闭');

  apply('zh-CN');
  assert.equal(label.textContent, '\n  流量总览  ');
  assert.equal(input.getAttribute('placeholder'), '搜索会话名称…');
  assert.equal(input.getAttribute('aria-label'), '搜索会话');
  assert.equal(input.getAttribute('title'), '关闭');
  assert.equal(option.childNodes[0].textContent, '最近 1 小时');
  assert.equal(title.childNodes[0].textContent, 'Codex Netwatch · 本地流量监控');
  assert.equal(input.value, '流量总览');
});

test('static capture excludes later user titles even when they match translation keys', () => {
  const root = element('main', {}, element('h1', {}, text('流量总览')));
  const apply = captureStaticTranslations(root);
  const laterTitle = element('span', { title: '关闭' }, text('流量总览'));
  root.childNodes.push(laterTitle);
  apply('en');
  assert.equal(root.childNodes[0].childNodes[0].textContent, 'Overview');
  assert.equal(laterTitle.childNodes[0].textContent, '流量总览');
  assert.equal(laterTitle.getAttribute('title'), '关闭');
  apply('zh-CN');
  assert.equal(laterTitle.childNodes[0].textContent, '流量总览');
});

test('every initial Chinese UI text and accessible label has an English catalog entry', () => {
  const html = fs
    .readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const candidates = [
    ...html.split(/<[^>]*>/g),
    ...[...html.matchAll(/\b(?:aria-label|placeholder|title)="([^"]*)"/g)].map((match) => match[1]),
  ]
    .map(normalizeText)
    .filter((value) => /\p{Script=Han}/u.test(value));
  assert.ok(candidates.length > 80, 'The fixture should inspect actual document copy');
  // Language names remain recognizable in their own language in both modes.
  const nativeLanguageNames = new Set(['中文']);
  const missing = [
    ...new Set(
      candidates.filter(
        (value) => !nativeLanguageNames.has(value) && !Object.hasOwn(messages, value),
      ),
    ),
  ];
  assert.deepEqual(missing, [], `Missing English translations: ${missing.join(' | ')}`);
});
