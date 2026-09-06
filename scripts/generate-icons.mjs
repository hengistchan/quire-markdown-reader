import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const svg = await readFile(resolve('assets/brand/quire-icon.svg'), 'utf8');
const browser = await chromium.launch({ channel: 'chromium', headless: true });

try {
  for (const size of [16, 32, 48, 96, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const encoded = Buffer.from(svg).toString('base64');
    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}img{display:block;width:100%;height:100%}</style><img src="data:image/svg+xml;base64,${encoded}">`,
    );
    await page.locator('img').evaluate((image) => image.decode());
    await page.screenshot({ path: resolve(`public/icon/${size}.png`), omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('Generated Chrome-compatible PNG icons at 16, 32, 48, 96, and 128 pixels from the Quire SVG source.');
