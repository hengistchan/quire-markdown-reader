import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const names = ['01-open-markdown.png', '02-focused-reader.png', '03-local-workspace.png', '04-technical-markdown.png', '05-reading-settings.png'];
const paths = ['global', 'zh-CN'].flatMap((locale) => names.map((name) => resolve('store/assets/screenshots', locale, name)));

for (const path of paths) {
  const png = await readFile(path);
  const signature = png.subarray(0, 8).toString('hex');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colorType = png[25];
  if (signature !== '89504e470d0a1a0a') throw new Error(`${path} is not a PNG file.`);
  if (width !== 1280 || height !== 800) throw new Error(`${path} must be 1280x800, received ${width}x${height}.`);
  if (bitDepth !== 8 || colorType !== 2) throw new Error(`${path} must be 24-bit RGB without alpha (bit depth ${bitDepth}, color type ${colorType}).`);
}

console.log('Verified 10 Chrome Web Store screenshots at 1280x800, 24-bit RGB PNG without alpha.');
