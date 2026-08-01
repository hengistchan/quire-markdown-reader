import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const names = ['01-open-markdown.png', '02-focused-reader.png', '03-local-workspace.png', '04-technical-markdown.png', '05-reading-settings.png'];
const locales = ['global', 'zh-CN'];
const paths = locales.flatMap((locale) => names.map((name) => resolve('store/assets/screenshots', locale, name)));

function inspectPng(png, path) {
  const signature = png.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error(`${path} is not a PNG file.`);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    bitDepth: png[24],
    colorType: png[25],
  };
}

async function markdownSection(path, heading) {
  const markdown = await readFile(path, 'utf8');
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`(?:^|\\n)## ${escaped}\\n\\n([\\s\\S]*?)(?=\\n## |$)`));
  if (!match) throw new Error(`${path} must contain the “${heading}” section.`);
  return match[1].trim();
}

for (const locale of locales) {
  const directory = resolve('store/assets/screenshots', locale);
  const actual = (await readdir(directory)).filter((name) => name.toLowerCase().endsWith('.png')).sort();
  if (actual.join('\n') !== [...names].sort().join('\n')) {
    throw new Error(`${directory} must contain exactly the five documented screenshots.`);
  }
}

for (const path of paths) {
  const png = await readFile(path);
  const { width, height, bitDepth, colorType } = inspectPng(png, path);
  if (width !== 1280 || height !== 800) throw new Error(`${path} must be 1280x800, received ${width}x${height}.`);
  if (bitDepth !== 8 || colorType !== 2) throw new Error(`${path} must be 24-bit RGB without alpha (bit depth ${bitDepth}, color type ${colorType}).`);
}

for (const [relativePath, expectedWidth, expectedHeight, allowedColorTypes] of [
  ['store/assets/promo-small.png', 440, 280, [2]],
  ['store/assets/icon-128.png', 128, 128, [2, 6]],
]) {
  const path = resolve(relativePath);
  const { width, height, bitDepth, colorType } = inspectPng(await readFile(path), path);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${path} must be ${expectedWidth}x${expectedHeight}, received ${width}x${height}.`);
  }
  if (bitDepth !== 8 || !allowedColorTypes.includes(colorType)) {
    throw new Error(`${path} has an unsupported PNG format (bit depth ${bitDepth}, color type ${colorType}).`);
  }
}

for (const [path, shortHeading, disclosureHeading] of [
  ['store/en/listing.md', 'Short description', 'Data handling disclosure'],
  ['store/zh-CN/listing.md', '简短说明', '数据处理醒目说明'],
]) {
  const description = await markdownSection(path, shortHeading);
  if (description.length > 132) throw new Error(`${path} short description exceeds 132 characters (${description.length}).`);
  await markdownSection(path, disclosureHeading);
}

const privacyPath = 'store/zh-CN/privacy-practices.md';
for (const heading of [
  '单一用途说明',
  '需请求 activeTab 的理由',
  '需请求 contextMenus 的理由',
  '需请求 scripting 的理由',
  '需请求 storage 的理由',
]) {
  const value = await markdownSection(privacyPath, heading);
  if (value.length > 1000) throw new Error(`${privacyPath} “${heading}” exceeds 1,000 characters (${value.length}).`);
}

console.log('Verified 10 localized screenshots, store artwork, listing limits, data disclosures, and permission explanations.');
