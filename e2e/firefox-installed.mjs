import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Builder, By, Key, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const addonId = '{60628e87-7d17-444b-8862-499ed925bb7f}';
const archive = resolve('.output/quire-markdown-reader-0.0.1-firefox.zip');
const fixture = process.env.FIREFOX_FIXTURE_PATH || resolve('e2e/fixtures/guide.md');
const options = new firefox.Options()
  .setPreference('intl.locale.requested', 'en-US')
  .setPreference('browser.shell.checkDefaultBrowser', false)
  .setPreference('browser.startup.homepage_override.mstone', 'ignore');
if (!process.env.FIREFOX_HEADED) options.addArguments('-headless');

let builder = new Builder().forBrowser('firefox').setFirefoxOptions(options);
if (process.env.FIREFOX_WEBDRIVER_URL) builder = builder.usingServer(process.env.FIREFOX_WEBDRIVER_URL);
else builder = builder.setFirefoxService(new firefox.ServiceBuilder().addArguments('--allow-system-access'));
const driver = await builder.build();
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end('<title>Example Domain</title><main><h1>Example Domain</h1><p>Deterministic Quire browser-action fixture.</p></main>');
});
await new Promise((ready) => server.listen(41737, '0.0.0.0', ready));
const exampleUrl = `http://${process.env.FIREFOX_TEST_HOST || '127.0.0.1'}:41737/`;

try {
  const installedId = await driver.installAddon(archive, true);
  assert.equal(installedId, addonId, 'Firefox installed the expected stable add-on ID');

  await driver.setContext(firefox.Context.CHROME);
  const viewerUrl = await driver.executeScript(
    'return WebExtensionPolicy.getByID(arguments[0]).getURL("viewer.html")',
    addonId,
  );
  assert.match(viewerUrl, /^moz-extension:\/\//, 'Firefox resolved a real extension origin');
  await driver.setContext(firefox.Context.CONTENT);

  await driver.get(viewerUrl);
  await driver.wait(until.titleIs('Quire'), 15_000);
  const body = await driver.findElement(By.css('body'));
  await driver.wait(until.elementTextContains(body, 'Welcome to Quire'), 15_000);
  assert.match(await body.getText(), /documents stay on your device/);

  const onboardingClose = await driver.findElements(By.css('button[aria-label="Close"]'));
  if (onboardingClose.length) await onboardingClose[0].click();
  const input = await driver.findElement(By.css('input[type="file"]'));
  await driver.executeScript('arguments[0].hidden = false', input);
  await input.sendKeys(fixture);
  await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), 'Local reading works.') ]")), 15_000);
  assert.equal(await driver.findElement(By.css('.document-identity strong')).getText(), 'guide');

  await driver.findElement(By.css('button[aria-label="Reader settings"]')).click();
  const language = await driver.findElement(By.css('select[aria-label="Language"]'));
  await driver.executeScript(`arguments[0].value = 'zh-CN'; arguments[0].dispatchEvent(new Event('change', { bubbles: true }))`, language);
  await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), '按你的方式阅读')]")), 10_000);

  const openExample = async () => {
    await driver.setContext(firefox.Context.CONTENT);
    await driver.get(exampleUrl);
    await driver.wait(until.titleContains('Example'), 15_000);
  };
  const switchToNewViewer = async (handlesBefore) => {
    await driver.setContext(firefox.Context.CONTENT);
    await driver.wait(async () => (await driver.getAllWindowHandles()).some((handle) => !handlesBefore.includes(handle)), 10_000);
    const handlesAfter = await driver.getAllWindowHandles();
    await driver.switchTo().window(handlesAfter.find((handle) => !handlesBefore.includes(handle)));
    await driver.wait(until.titleIs('Quire'), 10_000);
    await driver.wait(until.elementLocated(By.css('.document-identity strong')), 10_000);
    assert.equal(await driver.findElement(By.css('.document-identity strong')).getText(), 'Example Domain');
  };

  await openExample();
  let handlesBefore = await driver.getAllWindowHandles();
  await driver.setContext(firefox.Context.CHROME);
  await driver.executeScript(`document.getElementById('unified-extensions-button')?.click()`);
  await driver.wait(async () => driver.executeScript(`return Boolean(document.getElementById('_60628e87-7d17-444b-8862-499ed925bb7f_-BAP'))`), 5_000);
  await driver.findElement(By.id('_60628e87-7d17-444b-8862-499ed925bb7f_-BAP')).click();
  await switchToNewViewer(handlesBefore);
  console.log('Firefox native toolbar action passed.');

  if (!process.env.FIREFOX_SKIP_CONTEXT) {
    await openExample();
    handlesBefore = await driver.getAllWindowHandles();
    await driver.actions().contextClick(await driver.findElement(By.css('body'))).perform();
    await driver.setContext(firefox.Context.CHROME);
    await driver.wait(async () => driver.executeScript(`return Boolean(document.querySelector('#contentAreaContextMenu menuitem[label="Open in Quire"]'))`), 5_000);
    await driver.findElement(By.css('#contentAreaContextMenu menuitem[label="Open in Quire"]')).click();
    await switchToNewViewer(handlesBefore);
    console.log('Firefox native context menu passed.');
  }

  if (!process.env.FIREFOX_SKIP_SHORTCUT) {
    await openExample();
    handlesBefore = await driver.getAllWindowHandles();
    if (process.env.FIREFOX_NATIVE_INPUT_CONTAINER) {
      execFileSync('docker', ['exec', '-e', `DISPLAY=${process.env.FIREFOX_NATIVE_DISPLAY || ':99'}`, process.env.FIREFOX_NATIVE_INPUT_CONTAINER, 'xdotool', 'key', 'alt+shift+m']);
    } else if (process.env.FIREFOX_NATIVE_INPUT) {
      execFileSync('xdotool', ['key', 'alt+shift+m']);
    } else {
      await driver.actions().keyDown(Key.ALT).keyDown(Key.SHIFT).sendKeys('m').keyUp(Key.SHIFT).keyUp(Key.ALT).perform();
    }
    await switchToNewViewer(handlesBefore);
    console.log('Firefox extension shortcut passed.');
  }

  const capabilities = await driver.getCapabilities();
  const nativeFlows = ['toolbar action'];
  if (!process.env.FIREFOX_SKIP_CONTEXT) nativeFlows.push('context menu');
  if (!process.env.FIREFOX_SKIP_SHORTCUT) nativeFlows.push('shortcut');
  console.log(`Firefox ${capabilities.get('browserVersion')}: installed add-on, local file, localization, and ${nativeFlows.join(', ')} flows passed.`);
} finally {
  await driver.quit();
  await new Promise((done) => server.close(done));
}
