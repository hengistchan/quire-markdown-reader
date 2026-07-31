import assert from 'node:assert/strict';
import { copyFile, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const version = '0.0.1';
const output = resolve('.output');
const chromeArchive = resolve(output, `quire-markdown-reader-${version}-chrome.zip`);
const edgeArchive = resolve(output, `quire-markdown-reader-${version}-edge.zip`);
const firefoxArchive = resolve(output, `quire-markdown-reader-${version}-firefox.zip`);
const sourcesArchive = resolve(output, `quire-markdown-reader-${version}-sources.zip`);

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function exists(path) {
  assert.ok((await stat(path)).size > 0, `${path} must be present and non-empty`);
}

function archiveEntries(path) {
  return execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' }).trim().split('\n');
}

const chrome = await json(resolve(output, 'chrome-mv3/manifest.json'));
const firefox = await json(resolve(output, 'firefox-mv2/manifest.json'));

assert.equal(chrome.version, version);
assert.equal(chrome.manifest_version, 3);
assert.deepEqual(chrome.optional_host_permissions, ['http://*/*', 'https://*/*', 'file:///*']);
assert.ok(!chrome.host_permissions, 'Chromium must not request host access at install time');

assert.equal(firefox.version, version);
assert.equal(firefox.manifest_version, 2);
assert.deepEqual(firefox.optional_permissions, ['http://*/*', 'https://*/*', 'file:///*']);
assert.equal(firefox.browser_specific_settings.gecko.id, '{60628e87-7d17-444b-8862-499ed925bb7f}');
assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);

for (const target of ['chrome-mv3', 'firefox-mv2']) {
  for (const size of [16, 32, 48, 96, 128]) await exists(resolve(output, target, `icon/${size}.png`));
  await exists(resolve(output, target, '_locales/en/messages.json'));
  await exists(resolve(output, target, '_locales/zh_CN/messages.json'));
}

await copyFile(chromeArchive, edgeArchive);
for (const archive of [chromeArchive, edgeArchive, firefoxArchive, sourcesArchive]) await exists(archive);
for (const archive of [chromeArchive, edgeArchive, firefoxArchive]) {
  const entries = archiveEntries(archive);
  assert.ok(entries.includes('manifest.json'), `${archive} must contain a root manifest.json`);
  assert.ok(entries.includes('viewer.html'), `${archive} must contain the reader entrypoint`);
}
const sourceEntries = archiveEntries(sourcesArchive);
for (const required of ['package.json', 'package-lock.json', 'src/entrypoints/viewer/App.tsx', 'wxt.config.ts']) {
  assert.ok(sourceEntries.includes(required), `Firefox source archive is missing ${required}`);
}

console.log('Verified Chrome, Edge, Firefox, and Firefox source archives for Quire 0.0.1.');
