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

async function installWorkspacePicker(
  page: Page,
  initialHandlePermissions: Record<string, PermissionState> = {},
): Promise<void> {
  await page.addInitScript((initialPermissions) => {
    let denyDirectory = false;
    const handlePermissions = new Map<string, PermissionState>(Object.entries(initialPermissions));
    const handlePermissionRequests = new Map<string, number>();
    let remotePermission = true;
    let remotePermissionRequests = 0;
    let delayedFileName: string | undefined;
    let delayedFileReadStarted = 0;
    let delayedFileReadCompleted = 0;
    let delayedFileReadGate: Promise<void> | undefined;
    let releaseDelayedFileRead: (() => void) | undefined;
    Object.defineProperty(window, '__quireDenyDirectoryPicker', {
      configurable: true,
      value: () => {
        denyDirectory = true;
      },
    });
    Object.defineProperty(window, '__quireSetHandlePermission', {
      configurable: true,
      value: (name: string, permission: PermissionState) => handlePermissions.set(name, permission),
    });
    Object.defineProperty(window, '__quireHandleRequestCount', {
      configurable: true,
      value: (name: string) => handlePermissionRequests.get(name) ?? 0,
    });
    Object.defineProperty(window, '__quireSetRemotePermission', {
      configurable: true,
      value: (granted: boolean) => {
        remotePermission = granted;
      },
    });
    Object.defineProperty(window, '__quireRemoteRequestCount', {
      configurable: true,
      value: () => remotePermissionRequests,
    });
    Object.defineProperty(window, '__quireDelayFileRead', {
      configurable: true,
      value: (name: string) => {
        delayedFileName = name;
        delayedFileReadGate = new Promise<void>((resolve) => {
          releaseDelayedFileRead = resolve;
        });
      },
    });
    Object.defineProperty(window, '__quireDelayedFileReadCounts', {
      configurable: true,
      value: () => ({ started: delayedFileReadStarted, completed: delayedFileReadCompleted }),
    });
    Object.defineProperty(window, '__quireReleaseFileRead', {
      configurable: true,
      value: () => {
        delayedFileName = undefined;
        releaseDelayedFileRead?.();
        releaseDelayedFileRead = undefined;
        delayedFileReadGate = undefined;
      },
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
        try {
          await root.removeEntry('Quire E2E', { recursive: true });
        } catch {
          /* first run */
        }
        const workspace = await root.getDirectoryHandle('Quire E2E', { create: true });
        const docs = await workspace.getDirectoryHandle('docs', { create: true });
        const assets = await workspace.getDirectoryHandle('assets', { create: true });
        const dependencies = await workspace.getDirectoryHandle('node_modules', { create: true });
        await write(
          await workspace.getFileHandle('README.md', { create: true }),
          '# Workspace Home\n\n![Quire mark](assets/mark.svg)\n\n```mermaid\nflowchart LR\n  Source --> Reader\n```\n\n```mermaid\nsequenceDiagram\n  Browser->>Quire: Open Markdown\n  Quire-->>Browser: Render SVG\n```\n\n[Open guide](docs/guide.md#section-16)',
        );
        const longOutline = Array.from(
          { length: 32 },
          (_, index) => `## Section ${index + 1}\n\nOutline content ${index + 1}.`,
        ).join('\n\n');
        await write(
          await docs.getFileHandle('guide.md', { create: true }),
          `# Nested Guide\n\nBefore refresh.\n\n${longOutline}`,
        );
        await write(
          await assets.getFileHandle('mark.svg', { create: true }),
          '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#5266d7"/></svg>',
        );
        await write(await dependencies.getFileHandle('ignored.md', { create: true }), '# Must not be scanned');
        return workspace;
      },
    });
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory();
        const file = await root.getFileHandle('Local C.md', { create: true });
        await write(file, '# Local C\n\nLocal file body.');
        return [file];
      },
    });
    const handlePrototype = globalThis.FileSystemHandle?.prototype as FileSystemHandle & {
      queryPermission?: () => Promise<PermissionState>;
      requestPermission?: () => Promise<PermissionState>;
    };
    if (handlePrototype) {
      Object.defineProperty(handlePrototype, 'queryPermission', {
        configurable: true,
        value: async function queryPermission(this: FileSystemHandle) {
          return handlePermissions.get(this.name) ?? 'granted';
        },
      });
      Object.defineProperty(handlePrototype, 'requestPermission', {
        configurable: true,
        value: async function requestPermission(this: FileSystemHandle) {
          handlePermissionRequests.set(this.name, (handlePermissionRequests.get(this.name) ?? 0) + 1);
          handlePermissions.set(this.name, 'granted');
          return 'granted';
        },
      });
    }
    const fileHandlePrototype = globalThis.FileSystemFileHandle?.prototype as FileSystemFileHandle & {
      getFile?: () => Promise<File>;
    };
    const getFile = fileHandlePrototype?.getFile;
    if (fileHandlePrototype && getFile) {
      Object.defineProperty(fileHandlePrototype, 'getFile', {
        configurable: true,
        value: async function delayedGetFile(this: FileSystemFileHandle) {
          if (this.name === delayedFileName && delayedFileReadGate) {
            const gate = delayedFileReadGate;
            delayedFileReadStarted += 1;
            await gate;
            delayedFileReadCompleted += 1;
          }
          return getFile.call(this);
        },
      });
    }
    if (globalThis.chrome?.permissions) {
      chrome.permissions.request = async () => {
        remotePermissionRequests += 1;
        remotePermission = true;
        return true;
      };
      chrome.permissions.contains = async () => remotePermission;
    }
  }, initialHandlePermissions);
}

async function openRemote(page: Page, url: string): Promise<void> {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('button', { name: 'Open URL' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open Markdown from the web' });
  await dialog.getByPlaceholder('https://example.com/guide.md').fill(url);
  await dialog.getByRole('button', { name: 'Open' }).click();
}

interface DelayedFileReadCounts {
  started: number;
  completed: number;
}

async function delayFileRead(page: Page, name: string): Promise<DelayedFileReadCounts> {
  return page.evaluate((fileName) => {
    const controls = window as unknown as {
      __quireDelayFileRead(value: string): void;
      __quireDelayedFileReadCounts(): DelayedFileReadCounts;
    };
    const counts = controls.__quireDelayedFileReadCounts();
    controls.__quireDelayFileRead(fileName);
    return counts;
  }, name);
}

async function delayedFileReadCounts(page: Page): Promise<DelayedFileReadCounts> {
  return page.evaluate(() =>
    (window as unknown as { __quireDelayedFileReadCounts(): DelayedFileReadCounts }).__quireDelayedFileReadCounts(),
  );
}

async function releaseFileRead(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __quireReleaseFileRead(): void }).__quireReleaseFileRead());
}

async function pasteMarkdownFile(page: Page, name: string, markdown: string): Promise<void> {
  await page.locator('.app-shell').evaluate(
    (element, input) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([input.markdown], input.name, { type: 'text/markdown' }));
      element.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        }),
      );
    },
    { name, markdown },
  );
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
    await writeFile(
      localMarkdownPath,
      `<h1 align="center">
  <img src="Meta.png" alt="Meta Kennel" width="200">
  <br>Meta Kernel<br>
</h1>

<h3 align="center">Another Mihomo Kernel.</h3>

## Address Bar Preview

Opened from a local absolute path.

~~~ts
const embedded = true;
~~~`,
    );
    await writeFile(
      join(localWorkspacePath, 'Meta.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8WzAAAAAElFTkSuQmCC',
        'base64',
      ),
    );
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
    const wideControl = page.getByRole('button', { name: 'Use standard reading width' });
    const topbarSearch = page.locator('.topbar-actions').getByRole('button', { name: 'Command center' });
    const [openBox, wideBox, searchBox, wideReaderBox] = await Promise.all([
      openControl.boundingBox(),
      wideControl.boundingBox(),
      topbarSearch.boundingBox(),
      page.locator('.markdown-body').boundingBox(),
    ]);
    expect(wideBox!.x).toBeGreaterThan(openBox!.x + openBox!.width - 1);
    expect(wideBox!.x + wideBox!.width).toBeLessThanOrEqual(searchBox!.x + 1);
    await wideControl.click();
    await expect(page.getByRole('button', { name: 'Use wider reading width' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect
      .poll(async () => (await page.locator('.markdown-body').boundingBox())!.width)
      .toBeLessThan(wideReaderBox!.width);
    await page.getByRole('button', { name: 'Use wider reading width' }).click();

    await page.getByRole('button', { name: 'Reader settings' }).click();
    const pageWidth = page.getByRole('slider', { name: 'Page width' });
    await pageWidth.fill('970');
    await pageWidth.fill('980');
    await page.getByText('Advanced', { exact: true }).click();
    const customCss = page.getByLabel('Custom CSS');
    await customCss.fill('} .app-shell { display: none } @scope (.markdown-body) {');
    await expect(customCss).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByText('This CSS is not applied because it can escape the document scope or load an external resource.'),
    ).toBeVisible();
    await expect(page.locator('.app-shell')).toBeVisible();
    await customCss.fill('');
    await expect(customCss).toHaveAttribute('aria-invalid', 'false');
    await page.getByRole('button', { name: 'Close settings' }).click();
    const maxCustomReaderBox = await page.locator('.markdown-body').boundingBox();
    await page.getByRole('button', { name: 'Use wider reading width' }).click();
    await expect
      .poll(async () => (await page.locator('.markdown-body').boundingBox())!.width)
      .toBeGreaterThan(maxCustomReaderBox!.width);

    await openControl.click();
    await page.getByRole('button', { name: 'Open folder' }).click();
    await expect(page.locator('.document-identity strong')).toHaveText('README');
    await expect(page.getByRole('button', { name: 'docs' })).toBeVisible();
    await expect(page.getByRole('button', { name: /guide\.md/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /ignored\.md/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Collapse all folders' }).click();
    await expect(page.getByRole('button', { name: 'Expand all folders' })).toBeVisible();
    await expect(page.getByRole('button', { name: /guide\.md/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Expand all folders' }).click();
    await expect(page.getByRole('button', { name: /guide\.md/ })).toBeVisible();
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
    expect(Math.abs(panelBox!.y + panelBox!.height - (statusBox!.y + statusBox!.height))).toBeLessThan(2);
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
    const localDevtools = await context.newCDPSession(localPage);
    await localDevtools.send('Log.enable');
    const policyViolations: string[] = [];
    const localOriginViolations: string[] = [];
    localDevtools.on('Log.entryAdded', ({ entry }) => {
      if (entry.text.includes("'file:' URLs are treated as unique security origins")) {
        localOriginViolations.push(entry.text);
      }
    });
    localPage.on('console', (message) => {
      if (message.text().includes('Permissions policy violation')) policyViolations.push(message.text());
    });
    await localPage.goto(localMarkdownUrl);
    await expect(localPage).toHaveURL(localMarkdownUrl);
    await expect(localPage.locator('iframe[data-quire-reader]')).toHaveAttribute('allow', 'clipboard-write');
    const embeddedReader = localPage.frameLocator('iframe[data-quire-reader]');
    await expect(embeddedReader.locator('.document-identity span')).toHaveText('Local file');
    await expect(embeddedReader.getByRole('heading', { level: 1, name: 'Meta Kennel Meta Kernel' })).toBeVisible();
    const embeddedLogo = embeddedReader.getByRole('img', { name: 'Meta Kennel' });
    await expect(embeddedLogo).toHaveAttribute('src', /^data:image\/png;base64,/);
    await expect.poll(() => embeddedLogo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    const embeddedCopyCode = embeddedReader.getByRole('button', { name: 'Copy code' });
    await expect(embeddedCopyCode).toHaveCSS('opacity', '0');
    await embeddedCopyCode.locator('..').hover();
    await expect(embeddedCopyCode).toHaveCSS('opacity', '1');
    await embeddedCopyCode.click();
    await expect(embeddedReader.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(policyViolations).toEqual([]);
    expect(localOriginViolations).toEqual([]);
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

    const embeddedGuideUrl = `${localMarkdownUrl}#quire-workspace=mihomo&quire-file=docs%2Fguide.md`;
    await embeddedReader.getByRole('button', { name: /guide\.md/ }).click();
    await expect(embeddedReader.getByRole('heading', { level: 1, name: 'Embedded workspace guide' })).toBeVisible();
    await expect(localPage).toHaveURL(embeddedGuideUrl);
    await localPage.goBack();
    await expect(localPage).toHaveURL(localMarkdownUrl);
    await expect(embeddedReader.getByRole('heading', { level: 1, name: 'Meta Kennel Meta Kernel' })).toBeVisible();
    await localPage.goForward();
    await expect(localPage).toHaveURL(embeddedGuideUrl);
    await expect(embeddedReader.getByRole('heading', { level: 1, name: 'Embedded workspace guide' })).toBeVisible();
    expect(localOriginViolations).toEqual([]);
    await localPage.close();

    const sampleLibraryUrl = pathToFileURL(resolve('fixtures/sample-library/README.md')).href;
    const samplePage = await context.newPage();
    const sampleDevtools = await context.newCDPSession(samplePage);
    await sampleDevtools.send('Log.enable');
    const sampleOriginViolations: string[] = [];
    sampleDevtools.on('Log.entryAdded', ({ entry }) => {
      if (entry.text.includes("'file:' URLs are treated as unique security origins")) {
        sampleOriginViolations.push(entry.text);
      }
    });
    samplePage.on('console', (message) => {
      if (message.text().includes("'file:' URLs are treated as unique security origins")) {
        sampleOriginViolations.push(message.text());
      }
    });
    await samplePage.goto(sampleLibraryUrl);
    const sampleReader = samplePage.frameLocator('iframe[data-quire-reader]');
    await expect(sampleReader.getByRole('heading', { level: 1, name: 'Quire sample libraries' })).toBeVisible();
    expect(sampleOriginViolations).toEqual([]);
    await samplePage.close();

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
    const outlineRowHeights = await outlineNavigation
      .locator('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(Math.min(...outlineRowHeights)).toBeGreaterThanOrEqual(30);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await outlineNavigation.getByRole('button', { name: 'Section 24' }).click();
    await expect
      .poll(() => page.locator('#section-24').evaluate((element) => Math.abs(element.getBoundingClientRect().top - 92)))
      .toBeLessThanOrEqual(2);
    await expect(page.locator('#section-24')).toBeFocused();
    await outlineNavigation.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const pageScrollBeforeChaining = await page.evaluate(() => scrollY);
    await outlineNavigation.hover();
    await page.mouse.wheel(0, 480);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(pageScrollBeforeChaining);
    await outlineNavigation.evaluate((element) => {
      element.scrollTop = 0;
    });
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
    await expect
      .poll(() => page.evaluate(() => Math.abs(scrollY - (document.documentElement.scrollHeight - innerHeight))))
      .toBeLessThanOrEqual(2);
    const bottomLayout = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('.reader-stage');
      const tooltip = document.querySelector<HTMLElement>('body > .mermaidTooltip');
      if (!stage) throw new Error('Reader stage is missing.');
      const resolveColor = (value: string) => {
        const marker = document.createElement('span');
        marker.style.color = value;
        document.body.append(marker);
        const color = getComputedStyle(marker).color;
        marker.remove();
        return color;
      };
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        viewportHeight: innerHeight,
        stageBottom: stage.getBoundingClientRect().bottom,
        rootBackground: rootStyle.backgroundColor,
        stageBackground: getComputedStyle(stage).backgroundColor,
        appSurface: resolveColor(rootStyle.getPropertyValue('--surface-app')),
        documentSurface: resolveColor(rootStyle.getPropertyValue('--surface-document')),
        rootOverscroll: rootStyle.overscrollBehaviorY,
        tooltipDisplay: tooltip ? getComputedStyle(tooltip).display : null,
      };
    });
    expect(bottomLayout.stageBottom).toBeGreaterThanOrEqual(bottomLayout.viewportHeight - 1);
    expect(bottomLayout.rootBackground).toBe(bottomLayout.appSurface);
    expect(bottomLayout.stageBackground).toBe(bottomLayout.documentSurface);
    expect(bottomLayout.rootBackground).not.toBe(bottomLayout.stageBackground);
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
    await expect(reopened.locator('.document-identity strong')).toHaveText('guide');
    await expect(reopened.getByRole('heading', { level: 1, name: /Nested Guide/ })).toBeVisible();

    await reopened.evaluate(() =>
      (window as unknown as { __quireDenyDirectoryPicker: () => void }).__quireDenyDirectoryPicker(),
    );
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

    let remoteImageRequests = 0;
    server = createServer((request, response) => {
      if (request.url === '/remote.md') {
        response.writeHead(200, {
          'content-type': 'text/markdown',
          'access-control-allow-origin': '*',
          etag: '"quire-e2e"',
        });
        response.end(
          '# Remote Guide\n\nFetched with an origin-scoped permission.\n\n![Remote pixel](pixel.png)\n\n[Next remote document](next.md)',
        );
      } else if (request.url === '/pixel.png') {
        remoteImageRequests += 1;
        response.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' });
        response.end(
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8WzAAAAAElFTkSuQmCC',
            'base64',
          ),
        );
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
    await reopened
      .getByRole('dialog', { name: 'Open Markdown from the web' })
      .getByRole('button', { name: 'Open' })
      .click();
    await expect(reopened.getByText('Fetched with an origin-scoped permission.')).toBeVisible();
    const remoteImage = reopened.getByRole('img', { name: 'Remote pixel' });
    await expect(remoteImage).toHaveAttribute('data-resource-state', 'blocked');
    await expect(remoteImage).not.toHaveAttribute('src', /.+/);
    await reopened.waitForTimeout(250);
    expect(remoteImageRequests).toBe(0);

    await reopened.getByRole('button', { name: 'Reader settings' }).click();
    await reopened.getByText('Advanced', { exact: true }).click();
    await reopened.getByRole('checkbox', { name: /Remote images/ }).check();
    await reopened.getByRole('button', { name: 'Close settings' }).click();
    await remoteImage.scrollIntoViewIfNeeded();
    await expect(remoteImage).toHaveAttribute('src', `http://127.0.0.1:${address.port}/pixel.png`);
    await expect.poll(() => remoteImageRequests).toBe(1);

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

test('reopens persisted Recent Resources with workspace permission and last-document recovery', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'quire-recent-resources-e2e-'));
  let context: BrowserContext | undefined;
  let server: Server | undefined;
  try {
    server = createServer((_request, response) => {
      response.writeHead(200, {
        'content-type': 'text/markdown',
        'access-control-allow-origin': '*',
      });
      response.end('# Recent Remote\n\nRemote resource body.');
    });
    await new Promise<void>((ready) => server!.listen(0, '127.0.0.1', ready));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not start Recent Resources server.');

    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      locale: 'en-US',
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--lang=en-US'],
    });
    const id = await extensionId(context);
    const page = await context.newPage();
    await installWorkspacePicker(page);
    await page.goto(`chrome-extension://${id}/viewer.html`);

    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByRole('button', { name: 'Open folder' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workspace Home' })).toBeVisible();
    await page.getByRole('button', { name: 'guide.md' }).click();
    await expect(page.locator('.document-identity strong')).toHaveText('guide');

    await openRemote(page, `http://127.0.0.1:${address.port}/recent.md`);
    await expect(page.getByText('Remote resource body.')).toBeVisible();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByRole('button', { name: 'Open file' }).click();
    await expect(page.getByText('Local file body.')).toBeVisible();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByRole('button', { name: 'Open file' }).click();
    await expect(page.getByText('Local file body.')).toBeVisible();

    await page.getByRole('button', { name: 'Open', exact: true }).click();
    const menu = page.locator('.open-menu');
    const resourceRows = menu.locator('.recent-resource-main');
    await expect(resourceRows).toHaveCount(3);
    await expect(resourceRows.nth(0)).toContainText('Local C.md');
    await expect(resourceRows.nth(1)).toContainText('recent.md');
    await expect(resourceRows.nth(2)).toContainText('Quire E2E');

    await page.evaluate(() =>
      (
        window as unknown as { __quireSetHandlePermission(name: string, state: PermissionState): void }
      ).__quireSetHandlePermission('Quire E2E', 'prompt'),
    );
    const requestsBefore = await page.evaluate(() =>
      (window as unknown as { __quireHandleRequestCount(name: string): number }).__quireHandleRequestCount('Quire E2E'),
    );
    await menu.getByRole('button', { name: /Quire E2E Workspace/ }).click();
    await expect(page.locator('.document-identity strong')).toHaveText('guide');
    await expect(page.getByText('Before refresh.')).toBeVisible();
    expect(
      await page.evaluate(() =>
        (window as unknown as { __quireHandleRequestCount(name: string): number }).__quireHandleRequestCount(
          'Quire E2E',
        ),
      ),
    ).toBe(requestsBefore + 1);

    const reopened = await context.newPage();
    await installWorkspacePicker(reopened, { 'Quire E2E': 'prompt' });
    await reopened.goto(`chrome-extension://${id}/viewer.html`);
    await reopened.getByRole('button', { name: 'Open', exact: true }).click();
    await reopened
      .locator('.open-menu')
      .getByRole('button', { name: /Quire E2E Workspace/ })
      .click();
    await expect(reopened.locator('.document-identity strong')).toHaveText('guide');
    await expect(reopened.getByText('Before refresh.')).toBeVisible();
    expect(
      await reopened.evaluate(() =>
        (window as unknown as { __quireHandleRequestCount(name: string): number }).__quireHandleRequestCount(
          'Quire E2E',
        ),
      ),
    ).toBe(1);
  } finally {
    await context?.close();
    if (server) await new Promise<void>((done) => server!.close(() => done()));
    await rm(profile, { recursive: true, force: true });
  }
});

test('keeps installed document history coherent across races, reloads, sources, and permission recovery', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'quire-navigation-e2e-'));
  let context: BrowserContext | undefined;
  let server: Server | undefined;
  let delayNextB = false;
  let delayedBClosed = false;
  try {
    server = createServer((request, response) => {
      response.setHeader('content-type', 'text/markdown');
      response.setHeader('access-control-allow-origin', '*');
      if (request.url === '/A.md') {
        response.end('# Remote A\n\nRemote A body.\n\n[Open B](B.md)');
        return;
      }
      if (request.url === '/B.md') {
        if (delayNextB) {
          delayNextB = false;
          let finished = false;
          response.on('close', () => {
            if (!finished) delayedBClosed = true;
          });
          setTimeout(() => {
            if (response.destroyed) return;
            finished = true;
            response.end('# Remote B\n\nDelayed Remote B body.\n\n[Open C](C.md)');
          }, 900);
          return;
        }
        response.end('# Remote B\n\nRemote B body.\n\n[Open C](C.md)');
        return;
      }
      if (request.url === '/C.md') {
        response.end('# Remote C\n\nRemote C body.');
        return;
      }
      response.writeHead(404);
      response.end('Not found');
    });
    await new Promise<void>((ready) => server!.listen(0, '127.0.0.1', ready));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not start navigation E2E server.');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      locale: 'en-US',
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--lang=en-US'],
    });
    const id = await extensionId(context);

    const remotePage = await context.newPage();
    await installWorkspacePicker(remotePage);
    await remotePage.goto(`chrome-extension://${id}/viewer.html`);
    await openRemote(remotePage, `${baseUrl}/A.md`);
    await expect(remotePage.locator('.document-identity strong')).toHaveText('A');
    await expect(remotePage.getByText('Remote A body.')).toBeVisible();
    await remotePage.getByRole('link', { name: 'Open B' }).click();
    await expect(remotePage.locator('.document-identity strong')).toHaveText('B');
    await expect(remotePage.getByText('Remote B body.')).toBeVisible();
    const remoteHistoryLength = await remotePage.evaluate(() => history.length);

    await remotePage.getByRole('button', { name: 'Previous document' }).click();
    await expect(remotePage.locator('.document-identity strong')).toHaveText('A');
    await expect(remotePage).toHaveURL(new RegExp(`remote=${encodeURIComponent(`${baseUrl}/A.md`)}`));
    await remotePage.getByRole('button', { name: 'Next document' }).click();
    await expect(remotePage.locator('.document-identity strong')).toHaveText('B');
    await expect(remotePage.getByText('Remote B body.')).toBeVisible();
    expect(await remotePage.evaluate(() => history.length)).toBe(remoteHistoryLength);

    await remotePage.getByRole('button', { name: 'Previous document' }).click();
    await expect(remotePage.locator('.document-identity strong')).toHaveText('A');
    delayNextB = true;
    await remotePage.getByRole('button', { name: 'Next document' }).click();
    await expect(remotePage.getByRole('status')).toContainText('Loading Markdown…');
    await expect(remotePage).toHaveURL(new RegExp(`remote=${encodeURIComponent(`${baseUrl}/B.md`)}`));
    await remotePage.getByRole('button', { name: 'Previous document' }).click();
    await expect(remotePage).toHaveURL(new RegExp(`remote=${encodeURIComponent(`${baseUrl}/A.md`)}`));
    await remotePage.getByRole('button', { name: 'Previous document' }).click();
    await expect(remotePage.locator('.document-identity strong')).toHaveText('Welcome to Quire');
    await expect(remotePage.getByRole('heading', { level: 1, name: 'Welcome to Quire' })).toBeVisible();
    await expect.poll(() => delayedBClosed).toBe(true);
    await expect(remotePage.getByText('Delayed Remote B body.')).toHaveCount(0);
    await expect(remotePage).not.toHaveURL(/remote=/);
    expect(await remotePage.evaluate(() => history.length)).toBe(remoteHistoryLength);

    const reloadPage = await context.newPage();
    await installWorkspacePicker(reloadPage);
    await reloadPage.goto(`chrome-extension://${id}/viewer.html`);
    await openRemote(reloadPage, `${baseUrl}/A.md`);
    await reloadPage.getByRole('link', { name: 'Open B' }).click();
    await expect(reloadPage.locator('.document-identity strong')).toHaveText('B');
    await reloadPage.getByRole('link', { name: 'Open C' }).click();
    await expect(reloadPage.locator('.document-identity strong')).toHaveText('C');
    const reloadHistoryLength = await reloadPage.evaluate(() => history.length);
    await reloadPage.getByRole('button', { name: 'Previous document' }).click();
    await expect(reloadPage.locator('.document-identity strong')).toHaveText('B');
    await reloadPage.reload();
    await expect(reloadPage.locator('.document-identity strong')).toHaveText('B');
    await expect(reloadPage.getByText('Remote B body.')).toBeVisible();
    await expect(reloadPage.getByRole('button', { name: 'Next document' })).toBeEnabled();
    await reloadPage.getByRole('button', { name: 'Next document' }).click();
    await expect(reloadPage.locator('.document-identity strong')).toHaveText('C');
    await expect(reloadPage.getByText('Remote C body.')).toBeVisible();
    expect(await reloadPage.evaluate(() => history.length)).toBe(reloadHistoryLength);

    const mixedPage = await context.newPage();
    await installWorkspacePicker(mixedPage);
    await mixedPage.goto(`chrome-extension://${id}/viewer.html`);
    await mixedPage.getByRole('button', { name: 'Open', exact: true }).click();
    await mixedPage.getByRole('button', { name: 'Open folder' }).click();
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('README');
    await expect(mixedPage.getByRole('heading', { level: 1, name: 'Workspace Home' })).toBeVisible();
    await openRemote(mixedPage, `${baseUrl}/B.md`);
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('B');
    await mixedPage.getByRole('button', { name: 'Open', exact: true }).click();
    await mixedPage.getByRole('button', { name: 'Open file' }).click();
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('Local C');
    await expect(mixedPage.getByText('Local file body.')).toBeVisible();
    const mixedHistoryLength = await mixedPage.evaluate(() => history.length);
    await mixedPage.getByRole('button', { name: 'Previous document' }).click();
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('B');
    await mixedPage.getByRole('button', { name: 'Previous document' }).click();
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('README');
    await mixedPage.getByRole('button', { name: 'Next document' }).click();
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('B');
    expect(await mixedPage.evaluate(() => history.length)).toBe(mixedHistoryLength);

    const workspaceRequestsBefore = await mixedPage.evaluate(() =>
      (window as unknown as { __quireHandleRequestCount(name: string): number }).__quireHandleRequestCount('Quire E2E'),
    );
    await mixedPage.evaluate(() =>
      (
        window as unknown as { __quireSetHandlePermission(name: string, state: PermissionState): void }
      ).__quireSetHandlePermission('Quire E2E', 'prompt'),
    );
    await mixedPage.getByRole('button', { name: 'Previous document' }).click();
    const workspaceAlert = mixedPage.getByRole('alert');
    await expect(workspaceAlert).toContainText('needs your permission');
    expect(
      await mixedPage.evaluate(() =>
        (window as unknown as { __quireHandleRequestCount(name: string): number }).__quireHandleRequestCount(
          'Quire E2E',
        ),
      ),
    ).toBe(workspaceRequestsBefore);
    await workspaceAlert.getByRole('button', { name: 'Restore access' }).click();
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('README');
    expect(
      await mixedPage.evaluate(() =>
        (window as unknown as { __quireHandleRequestCount(name: string): number }).__quireHandleRequestCount(
          'Quire E2E',
        ),
      ),
    ).toBe(workspaceRequestsBefore + 1);

    await mixedPage.getByRole('button', { name: 'Next document' }).click();
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('B');
    await mixedPage.getByRole('button', { name: 'Next document' }).click();
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('Local C');
    const localRequestsBefore = await mixedPage.evaluate(() =>
      (window as unknown as { __quireHandleRequestCount(name: string): number }).__quireHandleRequestCount(
        'Local C.md',
      ),
    );
    await mixedPage.evaluate(() =>
      (
        window as unknown as { __quireSetHandlePermission(name: string, state: PermissionState): void }
      ).__quireSetHandlePermission('Local C.md', 'prompt'),
    );
    await openRemote(mixedPage, `${baseUrl}/A.md`);
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('A');
    await mixedPage.getByRole('button', { name: 'Previous document' }).click();
    const localAlert = mixedPage.getByRole('alert');
    await expect(localAlert).toContainText('needs your permission');
    expect(
      await mixedPage.evaluate(() =>
        (window as unknown as { __quireHandleRequestCount(name: string): number }).__quireHandleRequestCount(
          'Local C.md',
        ),
      ),
    ).toBe(localRequestsBefore);
    await localAlert.getByRole('button', { name: 'Restore access' }).click();
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('Local C');
    expect(
      await mixedPage.evaluate(() =>
        (window as unknown as { __quireHandleRequestCount(name: string): number }).__quireHandleRequestCount(
          'Local C.md',
        ),
      ),
    ).toBe(localRequestsBefore + 1);

    await mixedPage.getByRole('button', { name: 'Next document' }).click();
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('A');
    await mixedPage.getByRole('button', { name: 'Open', exact: true }).click();
    await mixedPage.getByRole('button', { name: 'Open file' }).click();
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('Local C');
    const remoteRequestsBefore = await mixedPage.evaluate(() =>
      (window as unknown as { __quireRemoteRequestCount(): number }).__quireRemoteRequestCount(),
    );
    await mixedPage.evaluate(() =>
      (window as unknown as { __quireSetRemotePermission(granted: boolean): void }).__quireSetRemotePermission(false),
    );
    await mixedPage.getByRole('button', { name: 'Previous document' }).click();
    const remoteAlert = mixedPage.getByRole('alert');
    await expect(remoteAlert).toContainText('needs your permission');
    expect(
      await mixedPage.evaluate(() =>
        (window as unknown as { __quireRemoteRequestCount(): number }).__quireRemoteRequestCount(),
      ),
    ).toBe(remoteRequestsBefore);
    await remoteAlert.getByRole('button', { name: 'Restore access' }).click();
    await expect(mixedPage.locator('.document-identity strong')).toHaveText('A');
    expect(
      await mixedPage.evaluate(() =>
        (window as unknown as { __quireRemoteRequestCount(): number }).__quireRemoteRequestCount(),
      ),
    ).toBe(remoteRequestsBefore + 1);

    const importedPage = await context.newPage();
    await installWorkspacePicker(importedPage);
    await importedPage.goto(`chrome-extension://${id}/viewer.html`);
    await pasteMarkdownFile(importedPage, 'Imported A.md', '# Imported A\n\nImported A body.');
    await expect(importedPage.getByText('Imported A body.')).toBeVisible();
    const importedA = new URL(importedPage.url()).searchParams.get('imported');
    await pasteMarkdownFile(importedPage, 'Imported B.md', '# Imported B\n\nImported B body.');
    await expect(importedPage.getByText('Imported B body.')).toBeVisible();
    const importedB = new URL(importedPage.url()).searchParams.get('imported');
    expect(importedA).toBeTruthy();
    expect(importedB).toBeTruthy();
    expect(importedB).not.toBe(importedA);
    const importedHistoryLength = await importedPage.evaluate(() => history.length);
    await importedPage.getByRole('button', { name: 'Previous document' }).click();
    await expect(importedPage.getByText('Imported A body.')).toBeVisible();
    expect(new URL(importedPage.url()).searchParams.get('imported')).toBe(importedA);
    await importedPage.getByRole('button', { name: 'Next document' }).click();
    await expect(importedPage.getByText('Imported B body.')).toBeVisible();
    expect(new URL(importedPage.url()).searchParams.get('imported')).toBe(importedB);
    expect(await importedPage.evaluate(() => history.length)).toBe(importedHistoryLength);
    await importedPage.reload();
    await expect(importedPage.getByRole('alert')).toContainText('no longer available in this tab session');
    await expect(importedPage.locator('.document-identity strong')).toHaveText('Document unavailable');
  } finally {
    await context?.close();
    if (server) await new Promise<void>((done) => server!.close(() => done()));
    await rm(profile, { recursive: true, force: true });
  }
});

for (const race of [
  { source: 'Workspace', fileName: 'README.md', title: 'README' },
  { source: 'Local', fileName: 'Local C.md', title: 'Local C' },
] as const) {
  test(`keeps a newer Remote navigation when a delayed ${race.source} restore finishes`, async () => {
    const profile = await mkdtemp(join(tmpdir(), `quire-${race.source.toLowerCase()}-remote-race-`));
    let context: BrowserContext | undefined;
    let server: Server | undefined;
    let page: Page | undefined;
    try {
      server = createServer((request, response) => {
        response.setHeader('content-type', 'text/markdown');
        response.setHeader('access-control-allow-origin', '*');
        if (request.url === '/A.md') {
          response.end('# Remote A\n\nRemote A body.');
          return;
        }
        if (request.url === '/B.md') {
          response.end('# Remote B\n\nRemote B wins the navigation race.');
          return;
        }
        response.writeHead(404);
        response.end('Not found');
      });
      await new Promise<void>((ready) => server!.listen(0, '127.0.0.1', ready));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not start navigation race server.');
      const baseUrl = `http://127.0.0.1:${address.port}`;

      context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: true,
        locale: 'en-US',
        viewport: { width: 1280, height: 800 },
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--lang=en-US'],
      });
      const id = await extensionId(context);
      page = await context.newPage();
      await installWorkspacePicker(page);
      await page.goto(`chrome-extension://${id}/viewer.html`);
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      await page.getByRole('button', { name: race.source === 'Workspace' ? 'Open folder' : 'Open file' }).click();
      await expect(page.locator('.document-identity strong')).toHaveText(race.title);

      await openRemote(page, `${baseUrl}/A.md`);
      await expect(page.locator('.document-identity strong')).toHaveText('A');
      const before = await delayFileRead(page, race.fileName);

      await page.getByRole('button', { name: 'Previous document' }).click();
      await expect.poll(async () => (await delayedFileReadCounts(page!)).started).toBe(before.started + 1);

      await openRemote(page, `${baseUrl}/B.md`);
      await expect(page.locator('.document-identity strong')).toHaveText('B');
      await expect(page.getByText('Remote B wins the navigation race.')).toBeVisible();
      await releaseFileRead(page);
      await expect.poll(async () => (await delayedFileReadCounts(page!)).completed).toBe(before.completed + 1);

      await expect(page.locator('.document-identity strong')).toHaveText('B');
      await expect(page.getByText('Remote B wins the navigation race.')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`remote=${encodeURIComponent(`${baseUrl}/B.md`)}`));
      await expect(
        page.getByRole('heading', { level: 1, name: race.source === 'Workspace' ? 'Workspace Home' : 'Local C' }),
      ).toHaveCount(0);
    } finally {
      if (page && !page.isClosed()) await releaseFileRead(page).catch(() => undefined);
      await context?.close();
      if (server) await new Promise<void>((done) => server!.close(() => done()));
      await rm(profile, { recursive: true, force: true });
    }
  });
}
