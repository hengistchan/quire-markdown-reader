import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

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
    interlaceMethod: png[28],
  };
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function classifyScreenshotTheme(png, path) {
  const { width, height, bitDepth, colorType, interlaceMethod } = inspectPng(png, path);
  if (bitDepth !== 8 || colorType !== 2 || interlaceMethod !== 0) {
    throw new Error(`${path} must be a non-interlaced 24-bit RGB PNG for theme verification.`);
  }

  const idatChunks = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idatChunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  if (idatChunks.length === 0) throw new Error(`${path} does not contain PNG image data.`);

  const bytesPerPixel = 3;
  const stride = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(idatChunks));
  if (raw.length !== (stride + 1) * height) throw new Error(`${path} has an unexpected decoded size.`);

  let cursor = 0;
  let previous = Buffer.alloc(stride);
  let luminanceTotal = 0;
  let sampleCount = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    const encoded = raw.subarray(cursor + 1, cursor + 1 + stride);
    const row = Buffer.allocUnsafe(stride);
    cursor += stride + 1;

    for (let index = 0; index < stride; index += 1) {
      const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
      const above = previous[index];
      const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
      let predictor;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paethPredictor(left, above, upperLeft);
      else throw new Error(`${path} uses unsupported PNG filter ${filter}.`);
      row[index] = (encoded[index] + predictor) & 0xff;
    }

    if (y % 16 === 8) {
      for (let x = 8; x < width; x += 16) {
        const index = x * bytesPerPixel;
        luminanceTotal += (0.2126 * row[index] + 0.7152 * row[index + 1] + 0.0722 * row[index + 2]) / 255;
        sampleCount += 1;
      }
    }
    previous = row;
  }

  return luminanceTotal / sampleCount >= 0.5 ? 'light' : 'dark';
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
  const { width, height, bitDepth, colorType, interlaceMethod } = inspectPng(png, path);
  if (width !== 1280 || height !== 800) throw new Error(`${path} must be 1280x800, received ${width}x${height}.`);
  if (bitDepth !== 8 || colorType !== 2 || interlaceMethod !== 0) {
    throw new Error(`${path} must be a non-interlaced 24-bit RGB PNG (bit depth ${bitDepth}, color type ${colorType}, interlace ${interlaceMethod}).`);
  }
}

for (const locale of locales) {
  const themes = new Map();
  for (const name of names) {
    const path = resolve('store/assets/screenshots', locale, name);
    themes.set(name, classifyScreenshotTheme(await readFile(path), path));
  }
  const lightCount = [...themes.values()].filter((theme) => theme === 'light').length;
  const darkCount = [...themes.values()].filter((theme) => theme === 'dark').length;
  if (lightCount !== 4 || darkCount !== 1 || themes.get('02-focused-reader.png') !== 'dark') {
    throw new Error(`${locale} screenshots must contain four light images and one dark 02-focused-reader.png image; received ${JSON.stringify(Object.fromEntries(themes))}.`);
  }
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

console.log('Verified 10 localized screenshots with four light and one dark per locale, store artwork, listing limits, data disclosures, and permission explanations.');
