import { chromium } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const extensionPath = resolve('.output/chrome-mv3');
const assets = resolve('store/assets');
const profile = await mkdtemp(join(tmpdir(), 'quire-store-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  locale: 'en-US',
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--lang=en-US'],
});

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.addInitScript(() => {
    chrome.storage.local.set({ onboardingComplete: true });
    const write = async (handle, contents) => {
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
    };
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory();
        try { await root.removeEntry('Quire Sample Library', { recursive: true }); } catch { /* first capture */ }
        const workspace = await root.getDirectoryHandle('Quire Sample Library', { create: true });
        const guides = await workspace.getDirectoryHandle('Guides', { create: true });
        const notes = await workspace.getDirectoryHandle('Notes', { create: true });
        await write(await workspace.getFileHandle('README.md', { create: true }), '# A calm place for Markdown\n\nQuire keeps local documents together and gives every page room to breathe.\n\n::: note\n**Read-only by design.** Your source files stay untouched.\n:::\n\n## Today\n\n- [x] Open a real document workspace\n- [x] Follow relative links\n- [ ] Keep reading');
        await write(await guides.getFileHandle('Getting Started.md', { create: true }), '# Getting Started\n\nChoose a document and start reading.');
        await write(await guides.getFileHandle('Technical Notes.md', { create: true }), '# Technical Notes\n\n```ts\nconst mode = "focused";\n```');
        await write(await notes.getFileHandle('Reading List.md', { create: true }), '# Reading List');
        return workspace;
      },
    });
  });
  await page.goto(`chrome-extension://${extensionId}/viewer.html`);
  await page.locator('.markdown-body h1').waitFor();
  await page.screenshot({ path: resolve(assets, 'screenshot-reader.png') });

  await page.getByRole('button', { name: 'Open folder' }).click();
  await page.getByText('A calm place for Markdown').waitFor();
  await page.screenshot({ path: resolve(assets, 'screenshot-workspace.png') });

  await page.getByRole('button', { name: 'Reader settings' }).click();
  await page.getByText('Make it yours').waitFor();
  await page.waitForTimeout(350);
  await page.screenshot({ path: resolve(assets, 'screenshot-settings.png') });

  const promo = await context.newPage();
  await promo.setViewportSize({ width: 440, height: 280 });
  await promo.setContent(`<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
    body{display:grid;place-items:center;background:radial-gradient(circle at 74% 12%,#91a0ff 0 3%,transparent 30%),linear-gradient(145deg,#eef0ff,#dfe4ff 48%,#f7f5ef)}
    .paper{position:absolute;width:210px;height:154px;border:1px solid #ffffffcc;border-radius:17px;background:#ffffffbf;box-shadow:0 24px 70px #293b8b33;transform:rotate(-7deg)}
    .paper:before,.paper:after{content:"";position:absolute;left:38px;right:25px;height:8px;border-radius:8px;background:#5266d72b}.paper:before{top:42px;box-shadow:0 28px #5266d71c,0 56px #5266d713}.paper:after{top:18px;right:92px;background:#5266d7}
    .mark{position:relative;display:grid;place-items:center;width:98px;height:98px;border-radius:26px 26px 26px 10px;color:white;background:#5266d7;box-shadow:0 18px 38px #3549a74d;font:850 31px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.07em;transform:translate(88px,34px)}
  </style><div class="paper"></div><div class="mark">MD</div>`);
  await promo.screenshot({ path: resolve(assets, 'promo-small.png') });

  const icon = await context.newPage();
  await icon.setViewportSize({ width: 128, height: 128 });
  const iconData = (await readFile(resolve('public/icon/96.png'))).toString('base64');
  await icon.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent}body{display:grid;place-items:center}img{width:96px;height:96px}</style><img src="data:image/png;base64,${iconData}">`);
  await icon.screenshot({ path: resolve(assets, 'icon-128.png'), omitBackground: true });
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}

console.log('Captured Quire store screenshots, promo tile, and padded store icon.');
