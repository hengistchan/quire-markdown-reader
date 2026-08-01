import { expect, test, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const extensionPath = resolve('.output/chrome-mv3');

async function extensionId(context: BrowserContext): Promise<string> {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  return new URL(worker.url()).host;
}

async function installWorkspacePicker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let denyDirectory = false;
    Object.defineProperty(window, '__quireDenyDirectoryPicker', {
      configurable: true,
      value: () => { denyDirectory = true; },
    });
    const write = async (handle: FileSystemFileHandle, contents: string) => {
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
    };
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => {
        if (denyDirectory) {
          denyDirectory = false;
          throw new DOMException('The user denied access.', 'NotAllowedError');
        }
        const root = await navigator.storage.getDirectory();
        try { await root.removeEntry('Quire E2E', { recursive: true }); } catch { /* first run */ }
        const workspace = await root.getDirectoryHandle('Quire E2E', { create: true });
        const docs = await workspace.getDirectoryHandle('docs', { create: true });
        const assets = await workspace.getDirectoryHandle('assets', { create: true });
        await write(await workspace.getFileHandle('README.md', { create: true }), '# Workspace Home\n\n![Quire mark](assets/mark.svg)\n\n[Open guide](docs/guide.md)');
        const longOutline = Array.from({ length: 32 }, (_, index) => `## Section ${index + 1}\n\nOutline content ${index + 1}.`).join('\n\n');
        await write(await docs.getFileHandle('guide.md', { create: true }), `# Nested Guide\n\nBefore refresh.\n\n${longOutline}`);
        await write(await assets.getFileHandle('mark.svg', { create: true }), '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#5266d7"/></svg>');
        return workspace;
      },
    });
    const handlePrototype = globalThis.FileSystemHandle?.prototype as FileSystemHandle & {
      queryPermission?: () => Promise<PermissionState>;
      requestPermission?: () => Promise<PermissionState>;
    };
    if (handlePrototype && !handlePrototype.queryPermission) handlePrototype.queryPermission = async () => 'granted';
    if (handlePrototype && !handlePrototype.requestPermission) handlePrototype.requestPermission = async () => 'granted';
    if (globalThis.chrome?.permissions) chrome.permissions.request = async () => true;
  });
}

test('runs the complete reader flow as an installed Chromium extension', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'quire-chromium-e2e-'));
  let context: BrowserContext | undefined;
  let server: Server | undefined;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      locale: 'en-US',
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--lang=en-US'],
    });
    const id = await extensionId(context);
    const localMarkdownPath = join(profile, 'Address Bar Preview.md');
    await writeFile(localMarkdownPath, '# Address Bar Preview\n\nOpened from a local absolute path.');
    const localMarkdownUrl = pathToFileURL(localMarkdownPath).href;

    const page = await context.newPage();
    await installWorkspacePicker(page);
    await page.goto(`chrome-extension://${id}/viewer.html`);

    await expect(page).toHaveTitle('Quire');
    await expect(page.getByRole('img', { name: 'Quire' })).toHaveAttribute('src', '/icon/96.png');
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Quire' })).toBeVisible();
    await expect(page.locator('.context-panel')).toHaveCount(0);

    const openControl = page.getByRole('button', { name: 'Open', exact: true });
    const wideControl = page.getByRole('button', { name: 'Use wider reading width' });
    const topbarSearch = page.locator('.topbar-actions').getByRole('button', { name: 'Command center' });
    const [openBox, wideBox, searchBox, standardReaderBox] = await Promise.all([
      openControl.boundingBox(), wideControl.boundingBox(), topbarSearch.boundingBox(), page.locator('.markdown-body').boundingBox(),
    ]);
    expect(wideBox!.x).toBeGreaterThan(openBox!.x + openBox!.width - 1);
    expect(wideBox!.x + wideBox!.width).toBeLessThanOrEqual(searchBox!.x + 1);
    await wideControl.click();
    await expect(page.getByRole('button', { name: 'Use standard reading width' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await page.locator('.markdown-body').boundingBox())!.width).toBeGreaterThan(standardReaderBox!.width);
    await page.getByRole('button', { name: 'Use standard reading width' }).click();

    await openControl.click();
    await page.getByRole('button', { name: 'Open folder' }).click();
    await expect(page.locator('.document-identity strong')).toHaveText('README');
    await expect(page.getByRole('button', { name: 'docs' })).toBeVisible();
    await expect(page.getByRole('button', { name: /guide\.md/ })).toBeVisible();
    const folderName = page.getByRole('button', { name: 'docs' }).locator('span');
    await expect(folderName).toHaveText('docs');
    expect((await folderName.boundingBox())?.width).toBeGreaterThan(24);
    const panelBox = await page.locator('.context-panel').boundingBox();
    const statusBox = await page.locator('.context-foot').boundingBox();
    expect(Math.abs((panelBox!.y + panelBox!.height) - (statusBox!.y + statusBox!.height))).toBeLessThan(2);
    await expect(page.locator('.markdown-body img')).toHaveAttribute('src', /^blob:/);

    const localPage = await context.newPage();
    await localPage.goto(localMarkdownUrl);
    await expect(localPage).toHaveURL(localMarkdownUrl);
    const embeddedReader = localPage.frameLocator('iframe[data-quire-reader]');
    await expect(embeddedReader.locator('.document-identity span')).toHaveText('Local file');
    await expect(embeddedReader.getByRole('heading', { level: 1, name: 'Address Bar Preview' })).toBeVisible();
    await expect(embeddedReader.locator('.context-panel')).toHaveCount(0);
    await expect(localPage).toHaveURL(localMarkdownUrl);
    await localPage.close();

    await page.getByRole('link', { name: 'Open guide' }).click();
    await expect(page.locator('.document-identity strong')).toHaveText('guide');
    await expect(page.getByText('Before refresh.')).toBeVisible();
    const outline = page.locator('.outline-popover');
    const outlineBox = await outline.boundingBox();
    expect(outlineBox!.y + outlineBox!.height).toBeLessThanOrEqual(800);
    const outlineNavigation = outline.locator('nav');
    expect(await outlineNavigation.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await expect(outlineNavigation.locator('button')).toHaveCount(33);
    const outlineRowHeights = await outlineNavigation.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(Math.min(...outlineRowHeights)).toBeGreaterThanOrEqual(30);
    await outlineNavigation.hover();
    await page.mouse.wheel(0, 480);
    await expect.poll(() => outlineNavigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const workspace = await root.getDirectoryHandle('Quire E2E');
      const docs = await workspace.getDirectoryHandle('docs');
      const file = await docs.getFileHandle('guide.md');
      const writable = await file.createWritable();
      await writable.write('# Nested Guide\n\nAfter refresh.');
      await writable.close();
    });
    await expect(page.getByText('After refresh.')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('status')).toHaveText('Document refreshed');

    const reopened = await context.newPage();
    await installWorkspacePicker(reopened);
    await reopened.goto(`chrome-extension://${id}/viewer.html`);
    await expect(reopened.locator('.document-identity strong')).toHaveText('README');
    await expect(reopened.getByRole('heading', { level: 1, name: /Workspace Home/ })).toBeVisible();

    await reopened.evaluate(() => (window as unknown as { __quireDenyDirectoryPicker: () => void }).__quireDenyDirectoryPicker());
    await reopened.getByRole('button', { name: 'Open', exact: true }).click();
    await reopened.getByRole('button', { name: 'Open folder' }).click();
    await expect(reopened.getByRole('alert')).toContainText('Access was not granted');

    server = createServer((request, response) => {
      if (request.url === '/remote.md') {
        response.writeHead(200, { 'content-type': 'text/markdown', 'access-control-allow-origin': '*', etag: '"quire-e2e"' });
        response.end('# Remote Guide\n\nFetched with an origin-scoped permission.\n\n[Next remote document](next.md)');
      } else if (request.url === '/next.md') {
        setTimeout(() => {
          response.writeHead(200, { 'content-type': 'text/markdown', 'access-control-allow-origin': '*' });
          response.end('# Next Remote Guide\n\nThe linked network document finished loading.');
        }, 450);
      } else {
        response.writeHead(404);
        response.end('Not found');
      }
    });
    await new Promise<void>((ready) => server!.listen(0, '127.0.0.1', ready));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not start E2E server.');

    await reopened.getByRole('button', { name: 'Open', exact: true }).click();
    await reopened.getByRole('button', { name: 'Open URL' }).click();
    const remoteUrl = `http://127.0.0.1:${address.port}/remote.md`;
    await reopened.getByPlaceholder('https://example.com/guide.md').fill(remoteUrl);
    await reopened.getByRole('dialog', { name: 'Open Markdown from the web' }).getByRole('button', { name: 'Open' }).click();
    await expect(reopened.getByText('Fetched with an origin-scoped permission.')).toBeVisible();
    await reopened.getByRole('link', { name: 'Next remote document' }).click();
    await expect(reopened.getByRole('status')).toHaveText('Loading Markdown…');
    await expect(reopened.getByText('The linked network document finished loading.')).toBeVisible();
    await expect(reopened.getByRole('status')).toHaveCount(0);

    await reopened.getByRole('button', { name: 'Reader settings' }).click();
    await reopened.getByRole('combobox', { name: 'Language' }).selectOption('zh-CN');
    await expect(reopened.getByText('修改后立即应用到当前文档。')).toBeVisible();
    await expect(reopened.locator('.document-meta')).toHaveText(/^\d+ 分钟阅读$/);
    await expect(reopened.locator('.document-meta')).not.toContainText('工程笔记');
    await reopened.setViewportSize({ width: 600, height: 800 });
    await expect(reopened.locator('.reader-stage')).toBeVisible();
  } finally {
    await context?.close();
    if (server) await new Promise<void>((done) => server!.close(() => done()));
    await rm(profile, { recursive: true, force: true });
  }
});
