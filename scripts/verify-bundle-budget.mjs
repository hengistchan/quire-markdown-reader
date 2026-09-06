import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { basename, resolve } from 'node:path';

const output = resolve('.output/chrome-mv3');
const html = await readFile(resolve(output, 'viewer.html'), 'utf8');
const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter(Boolean);

const initialBaselines = {
  viewer: 40_300,
  'react-vendor': 60_299,
  'markdown-vendor': 63_964,
  'icons-vendor': 2_001,
  'viewer-css': 7_500,
};

const lazyBaselines = {
  'katex-vendor': 154_115,
  'highlight-vendor': 53_836,
  'katex-css': 8_100,
  'highlight-css': 500,
};

const initialCandidates = new Map();
for (const assetPath of paths) {
  const name = basename(assetPath);
  const key =
    name.startsWith('viewer-') && name.endsWith('.js')
      ? 'viewer'
      : name.startsWith('viewer-') && name.endsWith('.css')
        ? 'viewer-css'
        : name.endsWith('.js')
          ? Object.keys(initialBaselines).find(
              (candidate) => candidate !== 'viewer-css' && name.startsWith(`${candidate}-`),
            )
          : undefined;
  if (key) initialCandidates.set(key, resolve(output, assetPath.slice(1)));
}

const failures = [];
for (const assetPath of paths) {
  const name = basename(assetPath);
  if (/^(?:katex|highlight)-vendor-/u.test(name)) {
    failures.push(`${name}: optional Markdown runtime is preloaded by viewer.html`);
  }
}

async function verifyGzipBudgets(baselines, candidates) {
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
}

await verifyGzipBudgets(initialBaselines, initialCandidates);

const lazyCandidates = new Map();
for (const directory of ['chunks', 'assets']) {
  const files = await readdir(resolve(output, directory));
  for (const name of files) {
    const key =
      name.startsWith('katex-vendor-') && name.endsWith('.js')
        ? 'katex-vendor'
        : name.startsWith('highlight-vendor-') && name.endsWith('.js')
          ? 'highlight-vendor'
          : name.startsWith('katex-vendor-') && name.endsWith('.css')
            ? 'katex-css'
            : name.startsWith('highlight-vendor-') && name.endsWith('.css')
              ? 'highlight-css'
              : undefined;
    if (key) lazyCandidates.set(key, resolve(output, directory, name));
  }
}

await verifyGzipBudgets(lazyBaselines, lazyCandidates);

const zipBaselines = { chrome: 2_151_481, firefox: 2_151_547 };
const outputFiles = await readdir(resolve('.output'));
for (const [browserName, baseline] of Object.entries(zipBaselines)) {
  const filename = outputFiles.find(
    (name) => name.startsWith('quire-markdown-reader-') && name.endsWith(`-${browserName}.zip`),
  );
  const file = filename ? resolve('.output', filename) : '';
  try {
    const bytes = (await stat(file)).size;
    const limit = Math.ceil(baseline * 1.1);
    if (bytes > limit) failures.push(`${browserName} zip: ${bytes} bytes exceeds ${limit}`);
    else console.log(`${browserName} zip: ${bytes} / ${limit} bytes`);
  } catch {
    failures.push(`${browserName} zip: artifact not found`);
  }
}

if (failures.length) {
  throw new Error(`Bundle budget failed:\n${failures.join('\n')}`);
}
