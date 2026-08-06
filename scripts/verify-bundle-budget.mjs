import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { basename, resolve } from 'node:path';

const output = resolve('.output/chrome-mv3');
const html = await readFile(resolve(output, 'viewer.html'), 'utf8');
const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter(Boolean);

const baselines = {
  viewer: 27_615,
  'react-vendor': 60_299,
  'markdown-vendor': 63_964,
  'katex-vendor': 154_115,
  'highlight-vendor': 53_836,
  'icons-vendor': 2_001,
  'viewer-css': 7_077,
};

const candidates = new Map();
for (const assetPath of paths) {
  const name = basename(assetPath);
  const key = name.startsWith('viewer-') && name.endsWith('.js')
    ? 'viewer'
    : name.startsWith('viewer-') && name.endsWith('.css')
      ? 'viewer-css'
      : name.endsWith('.js')
        ? Object.keys(baselines).find((candidate) => candidate !== 'viewer-css' && name.startsWith(`${candidate}-`))
        : undefined;
  if (key) candidates.set(key, resolve(output, assetPath.slice(1)));
}

const failures = [];
for (const [key, baseline] of Object.entries(baselines)) {
  const file = candidates.get(key);
  if (!file) {
    failures.push(`${key}: artifact not found`);
    continue;
  }
  const gzipBytes = gzipSync(await readFile(file)).byteLength;
  const limit = Math.ceil(baseline * 1.15);
  if (gzipBytes > limit) failures.push(`${key}: ${gzipBytes} bytes exceeds ${limit}`);
  else console.log(`${key}: ${gzipBytes} / ${limit} gzip bytes`);
}

const zipBaselines = { chrome: 2_151_481, firefox: 2_151_547 };
const outputFiles = await readdir(resolve('.output'));
for (const [browserName, baseline] of Object.entries(zipBaselines)) {
  const filename = outputFiles.find((name) => name.startsWith('quire-markdown-reader-') && name.endsWith(`-${browserName}.zip`));
  const file = filename ? resolve('.output', filename) : '';
  try {
    const bytes = (await stat(file)).size;
    const limit = Math.ceil(baseline * 1.10);
    if (bytes > limit) failures.push(`${browserName} zip: ${bytes} bytes exceeds ${limit}`);
    else console.log(`${browserName} zip: ${bytes} / ${limit} bytes`);
  } catch {
    failures.push(`${browserName} zip: artifact not found`);
  }
}

if (failures.length) {
  throw new Error(`Bundle budget failed:\n${failures.join('\n')}`);
}
