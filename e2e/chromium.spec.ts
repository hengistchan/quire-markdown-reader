import { expect, test, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
        const dependencies = await workspace.getDirectoryHandle('node_modules', { create: true });
        await write(await workspace.getFileHandle('README.md', { create: true }), '# Workspace Home\n\n![Quire mark](assets/mark.svg)\n\n```mermaid\nflowchart LR\n  Source --> Reader\n```\n\n```mermaid\nsequenceDiagram\n  Browser->>Quire: Open Markdown\n  Quire-->>Browser: Render SVG\n```\n\n[Open guide](docs/guide.md#section-16)');
        const longOutline = Array.from({ length: 32 }, (_, index) => `## Section ${index + 1}\n\nOutline content ${index + 1}.`).join('\n\n');
        await write(await docs.getFileHandle('guide.md', { create: true }), `# Nested Guide\n\nBefore refresh.\n\n${longOutline}`);
        await write(await assets.getFileHandle('mark.svg', { create: true }), '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#5266d7"/></svg>');
        await write(await dependencies.getFileHandle('ignored.md', { create: true }), '# Must not be scanned');
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
    const localWorkspacePath = join(profile, 'mihomo');
    await mkdir(join(localWorkspacePath, 'docs'), { recursive: true });
    const localMarkdownPath = join(localWorkspacePath, 'README.md');
    await writeFile(localMarkdownPath, `<h1 align="center">
  <img src="Meta.png" alt="Meta Kennel" width="200">
  <br>Meta Kernel<br>
</h1>

<h3 align="center">Another Mihomo Kernel.</h3>

## Address Bar Preview

Opened from a local absolute path.

~~~ts
const embedded = true;
~~~`);
    await writeFile(join(localWorkspacePath, 'Meta.png'), Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8WzAAAAAElFTkSuQmCC',
      'base64',
    ));
    await writeFile(join(localWorkspacePath, 'docs', 'guide.md'), '# Embedded workspace guide');
    const localMarkdownUrl = pathToFileURL(localMarkdownPath).href;

    const page = await context.newPage();
    await installWorkspacePicker(page);
    await page.goto(`chrome-extension://${id}/viewer.html`);

    await expect(page).toHaveTitle('Quire');
    await expect(page.getByRole('img', { name: 'Quire' })).toHaveAttribute('src', '/icon/96.png');
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Quire' })).toBeVisible();
    await expect(page.locator('.context-panel')).toHaveCount(0);
    const welcomeDiagram = page.locator('.mermaid').first();
    await welcomeDiagram.scrollIntoViewIfNeeded();
    await expect(welcomeDiagram.locator('svg')).toHaveCount(1, { timeout: 10_000 });
    await expect(welcomeDiagram).toHaveAttribute('data-resource-state', 'ready');
    const copyCode = page.getByRole('button', { name: 'Copy code' });
    await expect(copyCode).toHaveCount(1);
    await expect(copyCode).toHaveCSS('opacity', '0');
    await copyCode.locator('..').hover();
    await expect(copyCode).toHaveCSS('opacity', '1');
    await copyCode.click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

    const diagramToolbar = page.getByRole('toolbar', { name: 'Diagram controls' });
    await expect(diagramToolbar).toBeVisible();
    const diagramBox = await welcomeDiagram.boundingBox();
    await page.mouse.move(diagramBox!.x + diagramBox!.width / 2, diagramBox!.y + diagramBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(diagramBox!.x + diagramBox!.width / 2 + 36, diagramBox!.y + diagramBox!.height / 2 + 18);
    await page.mouse.up();
    expect(await welcomeDiagram.getAttribute('data-diagram-pan-x')).not.toBe('0');
    expect(await welcomeDiagram.getAttribute('data-diagram-pan-y')).not.toBe('0');
    await diagramToolbar.getByRole('button', { name: 'Reset zoom: 100%' }).click();
    await expect(welcomeDiagram).toHaveAttribute('data-diagram-pan-x', '0');
    await expect(welcomeDiagram).toHaveAttribute('data-diagram-pan-y', '0');

    await diagramToolbar.getByRole('button', { name: 'Zoom in' }).click();
    const resetDiagram = diagramToolbar.getByRole('button', { name: 'Reset zoom: 125%' });
    await expect(resetDiagram).toBeVisible();
    await expect(welcomeDiagram.locator('svg')).toHaveCSS('transform', /matrix\(1\.25, 0, 0, 1\.25,/);
    await resetDiagram.click();
    await expect(diagramToolbar.getByRole('button', { name: 'Reset zoom: 100%' })).toBeDisabled();

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
    await expect(page.getByRole('button', { name: /ignored\.md/ })).toHaveCount(0);
    await page.getByRole('button', { name: /guide\.md/ }).click();
    await expect(page.locator('.document-identity strong')).toHaveText('guide');
    await expect(page).toHaveURL(/\?workspace=[^&]+&file=docs%2Fguide\.md$/);
    await page.getByRole('button', { name: /README\.md/ }).click();
    await expect(page.locator('.document-identity strong')).toHaveText('README');
    await expect(page).toHaveURL(/\?workspace=[^&]+&file=README\.md$/);
    const workspaceDiagrams = page.locator('.mermaid');
    await expect(workspaceDiagrams).toHaveCount(2);
    await workspaceDiagrams.last().scrollIntoViewIfNeeded();
    await expect(workspaceDiagrams.locator('svg')).toHaveCount(2, { timeout: 10_000 });
    await expect(workspaceDiagrams.first()).toHaveAttribute('data-resource-state', 'ready');
    await expect(workspaceDiagrams.last()).toHaveAttribute('data-resource-state', 'ready');
    const folderName = page.getByRole('button', { name: 'docs' }).locator('span');
    await expect(folderName).toHaveText('docs');
    expect((await folderName.boundingBox())?.width).toBeGreaterThan(24);
    const panelBox = await page.locator('.context-panel').boundingBox();
    const statusBox = await page.locator('.context-foot').boundingBox();
    expect(Math.abs((panelBox!.y + panelBox!.height) - (statusBox!.y + statusBox!.height))).toBeLessThan(2);
    await expect(page.locator('.markdown-body img')).toHaveAttribute('src', /^blob:/);
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const workspace = await root.getDirectoryHandle('Quire E2E');
      const docs = await workspace.getDirectoryHandle('docs');
      const added = await docs.getFileHandle('new-note.md', { create: true });
      const writable = await added.createWritable();
      await writable.write('# New note');
      await writable.close();
    });
    await page.getByRole('button', { name: 'Refresh workspace' }).click();
    await expect(page.getByRole('button', { name: /new-note\.md/ })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Workspace refreshed');

    const localPage = await context.newPage();
    const policyViolations: string[] = [];
    localPage.on('console', (message) => {
      if (message.text().includes('Permissions policy violation')) policyViolations.push(message.text());
    });
    await localPage.goto(localMarkdownUrl);
    await expect(localPage).toHaveURL(localMarkdownUrl);
    await expect(localPage.locator('iframe[data-quire-reader]')).toHaveAttribute('allow', 'clipboard-write');
    const embeddedReader = localPage.frameLocator('iframe[data-quire-reader]');
    await expect(embeddedReader.locator('.document-identity span')).toHaveText('Local file');
    await expect(embeddedReader.getByRole('heading', { level: 1, name: 'Meta Kennel Meta Kernel' })).toBeVisible();
    await expect(embeddedReader.getByRole('img', { name: 'Meta Kennel' })).toHaveAttribute('src', /\/Meta\.png$/);
    const embeddedCopyCode = embeddedReader.getByRole('button', { name: 'Copy code' });
    await expect(embeddedCopyCode).toHaveCSS('opacity', '0');
    await embeddedCopyCode.locator('..').hover();
    await expect(embeddedCopyCode).toHaveCSS('opacity', '1');
    await embeddedCopyCode.click();
    await expect(embeddedReader.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(policyViolations).toEqual([]);
    await expect(embeddedReader.getByRole('heading', { level: 3, name: 'Another Mihomo Kernel.' })).toBeVisible();
    await expect(embeddedReader.getByRole('heading', { level: 2, name: 'Address Bar Preview' })).toBeVisible();
    await expect(embeddedReader.locator('.context-panel')).toHaveCount(0);
    const embeddedFolderChooser = localPage.waitForEvent('filechooser');
    await embeddedReader.getByRole('button', { name: 'Toggle file workspace' }).click();
    await (await embeddedFolderChooser).setFiles(localWorkspacePath);
    await expect(embeddedReader.locator('.workspace-panel')).toBeVisible();
    await expect(embeddedReader.locator('.context-heading strong')).toHaveText('mihomo');
    await expect(embeddedReader.getByRole('button', { name: /README\.md/ })).toBeVisible();
    await expect(embeddedReader.getByRole('button', { name: /guide\.md/ })).toBeVisible();
    await expect(embeddedReader.getByRole('button', { name: 'Refresh workspace' })).toHaveCount(0);
    await expect(embeddedReader.locator('.context-foot')).toContainText('Local-only reading');
    await expect(localPage).toHaveURL(localMarkdownUrl);
    await localPage.close();

    await page.getByRole('link', { name: 'Open guide' }).click();
    await expect(page.locator('.document-identity strong')).toHaveText('guide');
    await expect(page.getByText('Before refresh.')).toBeVisible();
    await expect(page).toHaveURL(/\?workspace=[^&]+&file=docs%2Fguide\.md#section-16$/);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    const historyLength = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: 'Previous document' }).click();
    await expect(page.locator('.document-identity strong')).toHaveText('README');
    await expect(page).toHaveURL(/\?workspace=[^&]+&file=README\.md$/);
    await page.getByRole('button', { name: 'Next document' }).click();
    await expect(page.locator('.document-identity strong')).toHaveText('guide');
    await expect(page).toHaveURL(/\?workspace=[^&]+&file=docs%2Fguide\.md#section-16$/);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    const restoredPage = await context.newPage();
    await installWorkspacePicker(restoredPage);
    await restoredPage.goto(page.url());
    await expect(restoredPage.locator('.document-identity strong')).toHaveText('guide');
    await expect(restoredPage.getByText('Before refresh.')).toBeVisible();
    await expect(restoredPage).toHaveURL(/\?workspace=[^&]+&file=docs%2Fguide\.md#section-16$/);
    await restoredPage.close();
    const outlineToggle = page.getByRole('button', { name: 'Toggle document outline' });
    await outlineToggle.click();
    await expect(outlineToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.workspace-panel')).toHaveCount(0);
    const outline = page.locator('.outline-panel');
    const initialOutlineBox = await outline.boundingBox();
    const workspaceToggle = page.getByRole('button', { name: 'Toggle file workspace' });
    await workspaceToggle.click();
    await expect(workspaceToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(outline).toHaveCount(0);
    const workspacePanelBox = await page.locator('.workspace-panel').boundingBox();
    expect(workspacePanelBox!.x).toBe(initialOutlineBox!.x);
    expect(workspacePanelBox!.width).toBe(initialOutlineBox!.width);
    await outlineToggle.click();
    await expect(page.locator('.workspace-panel')).toHaveCount(0);
    const outlineBox = await outline.boundingBox();
    expect(outlineBox!.y + outlineBox!.height).toBeLessThanOrEqual(800);
    const outlineNavigation = outline.locator('.outline-navigation');
    expect(await outlineNavigation.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await expect(outlineNavigation.locator('button')).toHaveCount(33);
    const outlineRowHeights = await outlineNavigation.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(Math.min(...outlineRowHeights)).toBeGreaterThanOrEqual(30);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await outlineNavigation.getByRole('button', { name: 'Section 24' }).click();
    await expect.poll(() => page.locator('#section-24').evaluate((element) => Math.abs(element.getBoundingClientRect().top - 92))).toBeLessThanOrEqual(2);
    await expect(page.locator('#section-24')).toBeFocused();
    await outlineNavigation.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const pageScrollBeforeChaining = await page.evaluate(() => scrollY);
    await outlineNavigation.hover();
    await page.mouse.wheel(0, 480);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(pageScrollBeforeChaining);
    await outlineNavigation.evaluate((element) => { element.scrollTop = 0; });
    await outlineNavigation.hover();
    await page.mouse.wheel(0, 480);
    await expect.poll(() => outlineNavigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.setViewportSize({ width: 720, height: 800 });
    const compactOutlineBox = await outline.boundingBox();
    expect(compactOutlineBox!.x).toBe(48);
    expect(compactOutlineBox!.width).toBe(280);
    expect(compactOutlineBox!.y + compactOutlineBox!.height).toBeLessThanOrEqual(800);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => Math.abs(
      scrollY - (document.documentElement.scrollHeight - innerHeight),
    ))).toBeLessThanOrEqual(1);
    const bottomLayout = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('.reader-stage');
      const tooltip = document.querySelector<HTMLElement>('body > .mermaidTooltip');
      if (!stage) throw new Error('Reader stage is missing.');
      return {
        viewportHeight: innerHeight,
        stageBottom: stage.getBoundingClientRect().bottom,
        rootBackground: getComputedStyle(document.documentElement).backgroundColor,
        stageBackground: getComputedStyle(stage).backgroundColor,
        rootOverscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
        tooltipDisplay: tooltip ? getComputedStyle(tooltip).display : null,
      };
    });
    expect(bottomLayout.stageBottom).toBeGreaterThanOrEqual(bottomLayout.viewportHeight - 1);
    expect(bottomLayout.rootBackground).toBe(bottomLayout.stageBackground);
    expect(bottomLayout.rootOverscroll).toBe('none');
    expect(bottomLayout.tooltipDisplay).toBe('none');

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

    const nativeFindPreserved = await reopened.evaluate(() => {
      const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true });
      dispatchEvent(event);
      return !event.defaultPrevented;
    });
    expect(nativeFindPreserved).toBe(true);
    await reopened.keyboard.press('Control+K');
    const commandCenter = reopened.getByRole('dialog', { name: 'Command center' });
    await commandCenter.getByPlaceholder('Type a command, filename, or URL…').fill('guide');
    await expect(commandCenter.getByText('Workspace files')).toBeVisible();
    await commandCenter.getByRole('button', { name: /guide\.md/ }).click();
    await expect(reopened.locator('.document-identity strong')).toHaveText('guide');
    await reopened.keyboard.press('Control+K');
    const documentSearch = reopened.getByRole('dialog', { name: 'Command center' });
    await documentSearch.getByPlaceholder('Type a command, filename, or URL…').fill('After refresh');
    await documentSearch.getByRole('button', { name: /After refresh/ }).click();
    await expect(reopened.locator('mark[data-quire-search-hit]')).toHaveText('After refresh');

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
    await expect(reopened.getByRole('status')).toContainText('Loading Markdown…');
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
