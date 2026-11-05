'use strict';
// Starts the real app and checks it the way a person would. On Linux CI this runs under xvfb-run.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-e2e-'));

const launch = () =>
  electron.launch({
    executablePath: require('electron'),
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, RTST_USER_DATA: profile },
  });

async function statusText(window) {
  await window.waitForSelector('body[data-state]');
  return window.textContent('#status');
}

(async () => {
  let app = await launch();
  let window = await app.firstWindow();
  assert.equal(await window.title(), 'RT Story Tracker');
  assert.match(await statusText(window), /library is ready, with 0 projects/);
  assert.equal(await window.evaluate(() => typeof window.require), 'undefined', 'no Node in the window');
  assert.equal(await window.evaluate(() => typeof window.process), 'undefined', 'no Node in the window');
  await app.close();

  const { Library } = require('../../src/main/storage/library');
  new Library(path.join(profile, 'library')).createProject('From the test');

  app = await launch();
  window = await app.firstWindow();
  assert.match(await statusText(window), /with 1 project/);
  await app.close();

  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  console.log('e2e passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
