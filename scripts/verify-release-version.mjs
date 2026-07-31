import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { version } = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
const tag = process.env.GITHUB_REF_NAME || process.argv[2];

assert.ok(tag, 'Provide a release tag through GITHUB_REF_NAME or as the first argument.');
assert.equal(tag, `v${version}`, `Release tag ${tag} must match package version v${version}.`);

console.log(`Verified release tag ${tag} matches package version ${version}.`);
