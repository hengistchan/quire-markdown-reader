import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const extensionPath = resolve('.output/chrome-mv3');
const assets = resolve('store/assets');

const screenshotSets = [
  {
    directory: 'global',
    browserLocale: 'en-US',
    appLocale: 'en',
    workspaceName: 'Quire Sample Library',
    labels: { openFolder: 'Open folder', files: 'Files', outline: 'Outline', settings: 'Reader settings', dark: 'Dark' },
    readerTitle: 'A calm place for Markdown',
    technicalFile: 'Architecture.md',
    technicalTitle: 'Architecture at a glance',
    files: [
      {
        path: 'README.md',
        contents: [
          '# A calm place for Markdown',
          '',
          'Quire turns local notes and documentation into a focused reading workspace.',
          '',
          '::: note',
          '**Read-only by design.** Your files stay on this device and the source is never modified.',
          ':::',
          '',
          '## One library, two ways to navigate',
          '',
          'Move between a real folder tree and the current document outline without leaving the page.',
          '',
          '- [x] Open a single Markdown file',
          '- [x] Connect a local documentation folder',
          '- [x] Follow relative links and images',
          '- [x] Read remote Markdown with permission',
          '',
          '## Built for long-form reading',
          '',
          'Search the document, tune the typography, and keep your place with reading progress.',
        ].join('\n'),
      },
      { path: 'Guides/Getting Started.md', contents: '# Getting started\n\nChoose a document and start reading.\n\n## Open a file\n\nUse the toolbar to select a Markdown file.\n\n## Connect a folder\n\nKeep an entire documentation library together.' },
      { path: 'Guides/Keyboard Shortcuts.md', contents: '# Keyboard shortcuts\n\nUse `Alt/Option + Shift + M` to open Quire.' },
      {
        path: 'Notes/Architecture.md',
        contents: [
          '# Architecture at a glance',
          '',
          'Technical Markdown stays readable, from diagrams and formulas to highlighted code.',
          '',
          '```mermaid',
          'flowchart LR',
          '  A[Markdown] --> B[Sanitize]',
          '  B --> C[Render]',
          '  C --> D[Read]',
          '```',
          '',
          '## Precise notation',
          '',
          'Inline math remains crisp: $E = mc^2$ and $O(n \\log n)$.',
          '',
          '```ts',
          'const workspace = { mode: "local", editable: false };',
          '```',
        ].join('\n'),
      },
      { path: 'Notes/Reading List.md', contents: '# Reading list\n\n- Browser architecture\n- Documentation systems\n- Local-first software' },
    ],
  },
  {
    directory: 'zh-CN',
    browserLocale: 'zh-CN',
    appLocale: 'zh-CN',
    workspaceName: 'Quire 示例文档库',
    labels: { openFolder: '打开文件夹', files: '文件', outline: '大纲', settings: '阅读设置', dark: '深色' },
    readerTitle: '安静阅读 Markdown',
    technicalFile: '架构说明.md',
    technicalTitle: '架构一目了然',
    files: [
      {
        path: 'README.md',
        contents: [
          '# 安静阅读 Markdown',
          '',
          'Quire 将本地笔记和技术文档整理成专注、舒适的阅读工作区。',
          '',
          '::: note',
          '**只读设计。** 文件保留在这台设备上，Quire 永远不会修改源文件。',
          ':::',
          '',
          '## 一套文档，两种导航方式',
          '',
          '在真实文件树和当前文档大纲之间切换，不必离开阅读页面。',
          '',
          '- [x] 打开单个 Markdown 文件',
          '- [x] 连接本地文档文件夹',
          '- [x] 跟随相对链接和图片',
          '- [x] 授权后读取网络 Markdown',
          '',
          '## 为长文阅读而生',
          '',
          '搜索文档、调整排版，并通过阅读进度保留当前位置。',
        ].join('\n'),
      },
      { path: '指南/开始使用.md', contents: '# 开始使用\n\n选择一份文档，马上开始阅读。\n\n## 打开文件\n\n从工具栏选择 Markdown 文件。\n\n## 连接文件夹\n\n把整套文档放在一个工作区中阅读。' },
      { path: '指南/键盘快捷键.md', contents: '# 键盘快捷键\n\n使用 `Alt/Option + Shift + M` 打开 Quire。' },
      {
        path: '笔记/架构说明.md',
        contents: [
          '# 架构一目了然',
          '',
          '从图表、公式到高亮代码，技术 Markdown 也能保持清晰易读。',
          '',
          '```mermaid',
          'flowchart LR',
          '  A[Markdown] --> B[安全清洗]',
          '  B --> C[渲染]',
          '  C --> D[阅读]',
          '```',
          '',
          '## 精确表达',
          '',
          '行内公式依然清晰：$E = mc^2$ 与 $O(n \\log n)$。',
          '',
          '```ts',
          'const workspace = { mode: "local", editable: false };',
          '```',
        ].join('\n'),
      },
      { path: '笔记/阅读清单.md', contents: '# 阅读清单\n\n- 浏览器架构\n- 文档系统\n- 本地优先软件' },
    ],
  },
];

async function captureLocalizedSet(config) {
  const output = resolve(assets, 'screenshots', config.directory);
  const profile = await mkdtemp(join(tmpdir(), `quire-store-${config.directory}-`));
  await mkdir(output, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    locale: config.browserLocale,
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, `--lang=${config.browserLocale}`],
  });

  try {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(async ({ appLocale }) => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({
        'reader-settings': {
          locale: appLocale,
          theme: 'light',
          fontFamily: 'sans',
          fontSize: 18,
          lineHeight: 1.76,
          contentWidth: 760,
          showReadingProgress: true,
          autoRefresh: true,
          enableKatex: true,
          enableMermaid: true,
          enableHtml: false,
          customCss: '',
        },
      });
    }, { appLocale: config.appLocale });

    const page = await context.newPage();
    await page.addInitScript(({ workspaceName, files }) => {
      const write = async (handle, contents) => {
        const writable = await handle.createWritable();
        await writable.write(contents);
        await writable.close();
      };
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: async () => {
          const root = await navigator.storage.getDirectory();
          try { await root.removeEntry(workspaceName, { recursive: true }); } catch { /* first capture */ }
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
    }, { workspaceName: config.workspaceName, files: config.files });

    await page.goto(`chrome-extension://${extensionId}/viewer.html`);
    await page.locator('.onboarding').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(output, '01-open-markdown.png'), animations: 'disabled' });

    await page.locator('.onboarding-close').click();
    await page.getByRole('button', { name: config.labels.openFolder }).click();
    await page.getByRole('heading', { level: 1, name: config.readerTitle }).waitFor();
    await page.getByRole('tab', { name: config.labels.outline }).click();
    await page.screenshot({ path: resolve(output, '02-focused-reader.png'), animations: 'disabled' });

    await page.getByRole('tab', { name: config.labels.files }).click();
    await page.screenshot({ path: resolve(output, '03-local-workspace.png'), animations: 'disabled' });

    await page.getByRole('button', { name: config.technicalFile }).click();
    await page.getByRole('heading', { level: 1, name: config.technicalTitle }).waitFor();
    await page.getByRole('tab', { name: config.labels.outline }).click();
    await page.locator('.mermaid svg').waitFor();
    await page.screenshot({ path: resolve(output, '04-technical-markdown.png'), animations: 'disabled' });

    await page.getByRole('button', { name: config.labels.settings }).click();
    await page.getByRole('button', { name: config.labels.dark, exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
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
    body{display:grid;place-items:center;background:radial-gradient(circle at 74% 12%,#91a0ff 0 3%,transparent 30%),linear-gradient(145deg,#eef0ff,#dfe4ff 48%,#f7f5ef)}
    .paper{position:absolute;width:210px;height:154px;border:1px solid #ffffffcc;border-radius:17px;background:#ffffffbf;box-shadow:0 24px 70px #293b8b33;transform:rotate(-7deg)}
    .paper:before,.paper:after{content:"";position:absolute;left:38px;right:25px;height:8px;border-radius:8px;background:#5266d72b}.paper:before{top:42px;box-shadow:0 28px #5266d71c,0 56px #5266d713}.paper:after{top:18px;right:92px;background:#5266d7}
    .mark{position:relative;display:grid;place-items:center;width:98px;height:98px;border-radius:26px 26px 26px 10px;color:white;background:#5266d7;box-shadow:0 18px 38px #3549a74d;font:850 51px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.04em;transform:translate(88px,34px)}
  </style><div class="paper"></div><div class="mark">M</div>`);
  await promo.screenshot({ path: resolve(assets, 'promo-small.png') });

  const icon = await artwork.newPage();
  await icon.setViewportSize({ width: 128, height: 128 });
  const iconData = (await readFile(resolve('public/icon/96.png'))).toString('base64');
  await icon.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent}body{display:grid;place-items:center}img{width:96px;height:96px}</style><img src="data:image/png;base64,${iconData}">`);
  await icon.screenshot({ path: resolve(assets, 'icon-128.png'), omitBackground: true });
} finally {
  await artwork.close();
  await rm(artworkProfile, { recursive: true, force: true });
}

console.log('Captured five global and five Simplified Chinese store screenshots, promo tile, and padded store icon.');
