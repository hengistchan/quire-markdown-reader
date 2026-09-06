import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const extensionPath = resolve('.output/chrome-mv3');
const assets = resolve('store/assets');
const sampleLibraryRoot = resolve('fixtures/sample-library');

const screenshotSets = [
  {
    directory: 'global',
    browserLocale: 'en-US',
    appLocale: 'en',
    fixtureDirectory: 'en',
    workspaceName: 'Quire Sample Library',
    labels: {
      open: 'Open',
      openFolder: 'Open folder',
      toggleWorkspace: 'Toggle file workspace',
      command: 'Command center',
      settings: 'Reader settings',
    },
    readerTitle: 'A calm place for Markdown',
    technicalFile: 'Architecture.md',
    technicalTitle: 'Architecture at a glance',
  },
  {
    directory: 'zh-CN',
    browserLocale: 'zh-CN',
    appLocale: 'zh-CN',
    fixtureDirectory: 'zh-CN',
    workspaceName: 'Quire 示例文档库',
    labels: {
      open: '打开',
      openFolder: '打开文件夹',
      toggleWorkspace: '切换文件工作区',
      command: '命令中心',
      settings: '阅读设置',
    },
    readerTitle: '安静阅读 Markdown',
    technicalFile: '架构说明.md',
    technicalTitle: '架构一目了然',
  },
];

async function readFixtureFiles(directory, prefix = '') {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await readFixtureFiles(absolutePath, path)));
    else if (/\.(md|markdown|mdx)$/i.test(entry.name))
      files.push({ path, contents: await readFile(absolutePath, 'utf8') });
  }
  return files;
}

async function captureLocalizedSet(config) {
  const output = resolve(assets, 'screenshots', config.directory);
  const profile = await mkdtemp(join(tmpdir(), `quire-store-${config.directory}-`));
  const files = await readFixtureFiles(join(sampleLibraryRoot, config.fixtureDirectory));
  await mkdir(output, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    locale: config.browserLocale,
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--lang=${config.browserLocale}`,
    ],
  });

  try {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(
      async ({ appLocale }) => {
        await chrome.storage.local.clear();
        await chrome.storage.local.set({
          'reader-settings': {
            version: 4,
            settings: {
              locale: appLocale,
              theme: 'light',
              fontFamily: 'sans',
              fontSize: 18,
              lineHeight: 1.76,
              contentWidth: 760,
              wideView: false,
              showReadingProgress: true,
              showOutline: true,
              autoRefresh: true,
              enableKatex: true,
              enableMermaid: true,
              enableHtml: false,
              loadRemoteImages: true,
              remoteImageReferrerPolicy: 'no-referrer',
              customCss: '',
            },
          },
        });
      },
      { appLocale: config.appLocale },
    );

    const page = await context.newPage();
    await page.addInitScript(
      ({ workspaceName, files }) => {
        const write = async (handle, contents) => {
          const writable = await handle.createWritable();
          await writable.write(contents);
          await writable.close();
        };
        Object.defineProperty(window, 'showDirectoryPicker', {
          configurable: true,
          value: async () => {
            const root = await navigator.storage.getDirectory();
            try {
              await root.removeEntry(workspaceName, { recursive: true });
            } catch {
              /* first capture */
            }
            const workspace = await root.getDirectoryHandle(workspaceName, { create: true });
            for (const file of files) {
              const segments = file.path.split('/');
              const name = segments.pop();
              let directory = workspace;
              for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create: true });
              await write(await directory.getFileHandle(name, { create: true }), file.contents);
            }
            return workspace;
          },
        });
      },
      { workspaceName: config.workspaceName, files },
    );

    const setTheme = async (theme) => {
      await worker.evaluate(
        async ({ theme: nextTheme }) => {
          const key = 'reader-settings';
          const stored = await chrome.storage.local.get(key);
          await chrome.storage.local.set({
            [key]: {
              ...stored[key],
              settings: { ...stored[key].settings, theme: nextTheme },
            },
          });
        },
        { theme },
      );
      await page.reload();
      await page.waitForFunction((expectedTheme) => document.documentElement.dataset.theme === expectedTheme, theme);
      await page.getByRole('heading', { level: 1, name: config.readerTitle }).waitFor();
      await page.evaluate(() => document.fonts.ready);
    };

    await page.goto(`chrome-extension://${extensionId}/viewer.html`);
    await page.getByRole('button', { name: config.labels.open, exact: true }).click();
    await page.getByRole('button', { name: config.labels.openFolder }).click();
    await page.getByRole('heading', { level: 1, name: config.readerTitle }).waitFor();
    await page.getByRole('button', { name: config.labels.toggleWorkspace }).click();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(output, '01-open-markdown.png'), animations: 'disabled' });

    await setTheme('dark');
    await page.getByRole('button', { name: config.labels.open, exact: true }).click();
    await page.screenshot({ path: resolve(output, '02-focused-reader.png'), animations: 'disabled' });

    await page.getByRole('button', { name: config.labels.open, exact: true }).click();
    await setTheme('light');
    await page.getByRole('button', { name: config.labels.command }).first().click();
    await page.screenshot({ path: resolve(output, '03-local-workspace.png'), animations: 'disabled' });

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: config.technicalFile }).click();
    await page.getByRole('heading', { level: 1, name: config.technicalTitle }).waitFor();
    await page.getByRole('button', { name: config.labels.toggleWorkspace }).click();
    await page.locator('.mermaid svg').waitFor();
    await page.screenshot({ path: resolve(output, '04-technical-markdown.png'), animations: 'disabled' });

    await page.getByRole('button', { name: config.labels.settings }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.waitForFunction(() => document.querySelector('.settings-drawer')?.getBoundingClientRect().left < 920);
    await page.screenshot({ path: resolve(output, '05-reading-settings.png'), animations: 'disabled' });
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}

for (const config of screenshotSets) await captureLocalizedSet(config);

const artworkProfile = await mkdtemp(join(tmpdir(), 'quire-store-artwork-'));
const artwork = await chromium.launchPersistentContext(artworkProfile, { channel: 'chromium', headless: true });
try {
  const promo = await artwork.newPage();
  await promo.setViewportSize({ width: 440, height: 280 });
  await promo.setContent(`<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
    body{display:grid;place-items:center;background:radial-gradient(circle at 74% 12%,#f2e2d8 0 3%,transparent 30%),linear-gradient(145deg,#f1efe9,#e9e6df 48%,#fbfaf7)}
    .paper{position:absolute;width:210px;height:154px;border:1px solid #fffdf9cc;border-radius:17px;background:#fffdf9d9;box-shadow:0 24px 70px #5c342333;transform:rotate(-7deg)}
    .paper:before,.paper:after{content:"";position:absolute;left:38px;right:25px;height:8px;border-radius:8px;background:#ba66382b}.paper:before{top:42px;box-shadow:0 28px #ba66381c,0 56px #ba663813}.paper:after{top:18px;right:92px;background:#ba6638}
    .mark{position:relative;display:grid;place-items:center;width:98px;height:98px;border-radius:26px 26px 26px 10px;color:#fffaf5;background:#ba6638;box-shadow:0 18px 38px #9145214d;font:850 51px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.04em;transform:translate(88px,34px)}
  </style><div class="paper"></div><div class="mark">M</div>`);
  await promo.screenshot({ path: resolve(assets, 'promo-small.png') });

  const icon = await artwork.newPage();
  await icon.setViewportSize({ width: 128, height: 128 });
  const iconData = (await readFile(resolve('public/icon/96.png'))).toString('base64');
  await icon.setContent(
    `<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent}body{display:grid;place-items:center}img{width:96px;height:96px}</style><img src="data:image/png;base64,${iconData}">`,
  );
  await icon.screenshot({ path: resolve(assets, 'icon-128.png'), omitBackground: true });
} finally {
  await artwork.close();
  await rm(artworkProfile, { recursive: true, force: true });
}

console.log('Captured four light and one dark screenshot for each locale, plus the promo tile and padded store icon.');
