import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { meta } from '../plugin.js';

function literalManifest(source) {
  const declaration = source.match(/^export const meta = (\{[\s\S]*?^\});$/m);
  assert.ok(declaration, 'Keep meta as a standalone JSON object literal');
  return JSON.parse(declaration[1]);
}

test('marketplace can read metadata without executing plugin code', async () => {
  const source = await readFile(new URL('../plugin.js', import.meta.url), 'utf8');
  assert.deepEqual(literalManifest(source), meta);
});

test('static metadata check rejects expressions at any depth', () => {
  for (const value of ['MODEL', 'makeModel()', '...MODELS', '`beeuni-agent`'])
    assert.throws(() => literalManifest('export const meta = {\n"models": [' + value + ']\n};'));
  assert.throws(() => literalManifest('export const meta = {\n"author": {"name": AUTHOR}\n};'));
  assert.deepEqual(literalManifest('export const meta = {\n"models": ["beeuni-agent"]\n};'), { models: ['beeuni-agent'] });
});

test('community plugin guides have English fallback and matching translations', async () => {
  const english = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const chinese = await readFile(new URL('../README.zh-CN.md', import.meta.url), 'utf8');
  assert.match(english, /^---\n[\s\S]*?zh-CN: README.zh-CN.md\n[\s\S]*?---\n/);
  assert.match(chinese, /^---\nlocale: zh-CN\n---\n/);
  for (const text of [english, chinese]) {
    assert.ok(Buffer.byteLength(text) < 256 * 1024);
    assert.ok(!text.startsWith('\ufeff'));
    assert.match(text, /^# Beeuni$/m);
    assert.ok(text.includes('[English](README.md) | [简体中文](README.zh-CN.md)'));
    assert.ok(!/!\[|<\/?[a-z][^>]*>/i.test(text), 'Marketplace guides cannot contain images or raw HTML');
    for (const required of ['beeuni-agent', '/beeuni/v1/tasks', '/sessions/{session_id}/result', 'project_id', 'accept_shared_project', 'beeuni_pat_', 'Entire workspace', 'BEEUNI_PLUGIN_OK', '"status": "SUCCESS"', 'https://api.beeuni.ai', 'truncated', 'npm run pack:plugin']) assert.ok(text.includes(required), 'Missing guide detail: ' + required);
    for (const removed of ['BEEUNI_TASK_SIGNING_KEY', 'BEEUNI_ACCEPT_SHARED_PROJECT', '.env.example', 'npm start']) assert.ok(!text.includes(removed));
  }
});

test('release notes match plugin metadata and use canonical categories', async () => {
  const categoryOrder = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security', 'Migration'];
  let englishCategories;
  for (const locale of ['en', 'zh-CN']) {
    const name = locale === 'en' ? 'CHANGELOG.md' : 'CHANGELOG.zh-CN.md';
    const text = await readFile(new URL('../' + name, import.meta.url), 'utf8');
    assert.ok(text.startsWith('---\n'));
    assert.match(text, /\nchangelogVersion: 1\n/);
    assert.ok(Buffer.byteLength(text) <= 256 * 1024);
    assert.ok(!text.startsWith('\ufeff'));
    assert.ok(text.includes('locale: ' + locale + '\n'));
    assert.ok(text.includes('plugin: ' + meta.key + '\n') || text.includes('plugin: "' + meta.key + '"\n'));
    assert.ok(text.includes('version: ' + meta.version + '\n') || text.includes('version: "' + meta.version + '"\n'));
    assert.match(text, /^# Changelog$/m);
    assert.equal((text.match(/^## /gm) || []).length, 1);
    assert.ok(text.includes('## [' + meta.version + ']'));
    const categories = [...text.matchAll(/^### (.+)$/gm)].map(heading => heading[1]);
    assert.ok(categories.length > 0 && categories.some(category => category !== 'Migration'));
    assert.deepEqual(categories, categoryOrder.filter(category => categories.includes(category)));
    if (locale === 'en') englishCategories = categories;
    else assert.deepEqual(categories, englishCategories);
  }
});

test('runtime package is private and has no third-party dependencies', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.version, meta.version);
  assert.equal(pkg.private, true);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  const ignored = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.ok(ignored.split('\n').includes('.env'));
});
