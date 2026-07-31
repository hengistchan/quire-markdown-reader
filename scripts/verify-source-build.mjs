import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const archive = resolve('.output/quire-markdown-reader-0.0.1-sources.zip');
const expected = resolve('.output/firefox-mv2');
const scratch = await mkdtemp(join(tmpdir(), 'quire-source-build-'));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
}

async function fingerprints(root, directory = root) {
  const result = new Map();
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, hash] of await fingerprints(root, path)) result.set(name, hash);
    } else {
      const relative = path.slice(root.length + 1);
      result.set(relative, createHash('sha256').update(await readFile(path)).digest('hex'));
    }
  }
  return result;
}

try {
  run('unzip', ['-q', archive, '-d', scratch]);
  run('npm', ['ci'], scratch);
  run('npm', ['run', 'build:firefox'], scratch);
  const rebuilt = await fingerprints(resolve(scratch, '.output/firefox-mv2'));
  const packaged = await fingerprints(expected);
  assert.deepEqual([...rebuilt], [...packaged], 'The Firefox build reconstructed from the source archive must match the packaged build tree byte-for-byte');
  console.log(`Reproduced ${rebuilt.size} Firefox package files byte-for-byte from the source archive.`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
