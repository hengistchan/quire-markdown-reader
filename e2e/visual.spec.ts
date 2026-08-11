import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const extensionPath = resolve('.output/chrome-mv3');
const galleryMarkdown = await readFile(resolve('fixtures/theme-gallery.md'), 'utf8');
const galleryImage = await readFile(resolve('fixtures/assets/quire-mark.svg'), 'utf8');

async function extensionId(context: BrowserContext): Promise<string> {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  return new URL(worker.url()).host;
}

async function installThemeGallery(page: Page): Promise<void> {
  await page.addInitScript(({ markdown, image }) => {
    const write = async (handle: FileSystemFileHandle, contents: string) => {
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
    };
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory();
        try { await root.removeEntry('Quire Theme Gallery', { recursive: true }); } catch { /* first run */ }
        const workspace = await root.getDirectoryHandle('Quire Theme Gallery', { create: true });
        const assets = await workspace.getDirectoryHandle('assets', { create: true });
        await write(await workspace.getFileHandle('theme-gallery.md', { create: true }), markdown);
        await write(await assets.getFileHandle('quire-mark.svg', { create: true }), image);
        return workspace;
      },
    });
  }, { markdown: galleryMarkdown, image: galleryImage });
}

async function setTheme(context: BrowserContext, theme: 'light' | 'dark'): Promise<void> {
  const id = await extensionId(context);
  const worker = context.serviceWorkers()[0]!;
  await worker.evaluate(async ({ selectedTheme }) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      'reader-settings': {
        version: 4,
        settings: {
          locale: 'en',
          theme: selectedTheme,
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
          enableHtml: true,
          loadRemoteImages: true,
          remoteImageReferrerPolicy: 'no-referrer',
          customCss: '',
        },
      },
    });
  }, { selectedTheme: theme });
  await context.pages()[0]?.goto(`chrome-extension://${id}/viewer.html`);
}

async function capture(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: .06,
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`visual system gallery in ${theme} mode`, async () => {
    const profile = await mkdtemp(join(tmpdir(), `quire-visual-${theme}-`));
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: true,
        locale: 'en-US',
        viewport: { width: 1280, height: 800 },
        colorScheme: theme,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--lang=en-US'],
      });
      const page = context.pages()[0] ?? await context.newPage();
      await installThemeGallery(page);
      await setTheme(context, theme);
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      await page.getByRole('button', { name: 'Open folder' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Quire Visual System v2' })).toBeVisible();
      await expect(page.locator('.context-panel')).toBeVisible();

      await page.getByRole('button', { name: 'Toggle file workspace' }).click();
      await page.evaluate(() => scrollTo(0, 0));
      await capture(page, `markdown-${theme}-1280x800.png`);

      await page.getByRole('button', { name: 'Toggle file workspace' }).click();
      await capture(page, `workspace-${theme}-1280x800.png`);
      await expect(page.locator('.file-row').first()).toHaveCSS('font-size', '12px');

      await page.getByRole('button', { name: 'Toggle file workspace' }).click();
      await page.getByRole('button', { name: 'Toggle document outline' }).click();
      await expect(page.locator('.outline-navigation button').first()).toHaveCSS('font-size', '12px');
      await capture(page, `outline-${theme}-1280x800.png`);
      await page.getByRole('button', { name: 'Toggle document outline' }).click();
      await page.getByRole('button', { name: 'Toggle file workspace' }).click();

      await page.getByRole('button', { name: 'Open', exact: true }).click();
      await expect(page.locator('.open-menu')).toBeVisible();
      await capture(page, `recent-open-menu-${theme}-1280x800.png`);
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Command center' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Command center' })).toBeVisible();
      await capture(page, `command-${theme}-1280x800.png`);
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Toggle file workspace' }).click();
      await page.getByRole('button', { name: 'Reader settings' }).click();
      await expect(page.locator('.settings-drawer')).toBeVisible();
      await page.waitForFunction(() => {
        const drawer = document.querySelector('.settings-drawer');
        if (!(drawer instanceof HTMLElement)) return false;
        const bounds = drawer.getBoundingClientRect();
        return bounds.right <= innerWidth + 1 && bounds.left <= innerWidth - bounds.width + 1;
      });
      await page.locator('.settings-drawer').evaluate((drawer) => { drawer.style.animation = 'none'; });
      await capture(page, `settings-${theme}-1280x800.png`);
      await page.getByRole('button', { name: 'Close settings' }).click();
      await expect(page.locator('.settings-drawer')).toHaveCount(0);

      const flowchart = page.locator('#mermaid-flowchart + .diagram-shell .mermaid');
      await page.getByRole('img', { name: 'Quire visual system sample' }).scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const image = document.querySelector<HTMLImageElement>('img[alt="Quire visual system sample"]');
        return Boolean(image?.complete && image.naturalWidth > 0);
      }, undefined, { timeout: 5_000 });
      await expect(flowchart.locator('svg')).toHaveCount(1, { timeout: 10_000 });
      await expect(flowchart).toHaveAttribute('data-mermaid-theme', theme);
      await page.locator('#mermaid-flowchart').evaluate(async (element) => {
        const previousBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        element.scrollIntoView({ block: 'start' });
        document.documentElement.style.scrollBehavior = previousBehavior;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      await capture(page, `mermaid-${theme}-1280x800.png`);

      await page.setViewportSize({ width: 720, height: 800 });
      await page.evaluate(() => scrollTo(0, 0));
      await capture(page, `markdown-${theme}-720x800.png`);

      if (theme === 'light') {
        for (const width of [1280, 1024, 720, 480]) {
          await page.setViewportSize({ width, height: 800 });
          await page.evaluate(() => scrollTo(0, 0));
          const overflow = await page.evaluate(() => {
            const failures: string[] = [];
            if (document.documentElement.scrollWidth > innerWidth + 1) failures.push('document');
            for (const selector of ['.topbar', '.reader-stage', '.markdown-body', '.markdown-body table', '.code-shell', '.diagram-shell']) {
              for (const element of document.querySelectorAll<HTMLElement>(selector)) {
                const bounds = element.getBoundingClientRect();
                if (bounds.left < -1 || bounds.right > innerWidth + 1) failures.push(selector);
              }
            }
            return [...new Set(failures)];
          });
          expect(overflow, `${width}px content overflow`).toEqual([]);

          await page.getByRole('button', { name: 'Toggle file workspace' }).click();
          const panel = page.locator('.context-panel');
          await expect(panel).toBeVisible();
          expect(await panel.evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(width + 1);
          await page.getByRole('button', { name: 'Toggle file workspace' }).click();

          await page.getByRole('button', { name: 'Command center' }).first().click();
          const command = page.getByRole('dialog', { name: 'Command center' });
          await expect(command).toBeVisible();
          expect(await command.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.left >= -1 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1;
          })).toBe(true);
          await page.keyboard.press('Escape');

          await page.getByRole('button', { name: 'Open', exact: true }).click();
          const openMenu = page.locator('.open-menu');
          await expect(openMenu).toBeVisible();
          expect(await openMenu.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.left >= -1 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1;
          })).toBe(true);
          await page.keyboard.press('Escape');

          await page.getByRole('button', { name: 'Reader settings' }).click();
          const responsiveDrawer = page.locator('.settings-drawer');
          await expect(responsiveDrawer).toBeVisible();
          await responsiveDrawer.evaluate((drawer) => { drawer.style.animation = 'none'; });
          expect(await responsiveDrawer.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.left >= -1 && bounds.right <= innerWidth + 1;
          })).toBe(true);
          await page.getByRole('button', { name: 'Close settings' }).click();
        }
      }
    } finally {
      await context?.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
