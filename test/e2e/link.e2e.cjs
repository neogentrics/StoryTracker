'use strict';
// App Link in the real app. A small AppLink in this test plays RT Markdown Reader, so the real pipe and the real rules are used.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppLink } = require('../../src/main/app-link');

const root = path.join(__dirname, '..', '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-applink-'));
const shared = path.join(work, 'shared');
const profile = path.join(work, 'profile');
const PASSWORD = 'seven silver spoons';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const launch = async (...extra) => {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : []), ...extra],
    env: { ...process.env, RTST_USER_DATA: profile, NMR_LINK_DIR: shared },
  });
  const window = await app.firstWindow();
  await window.waitForSelector('body[data-state="ready"]');
  window.on('dialog', (dialog) => dialog.accept());
  return { app, window };
};

const menu = (app, command) => app.evaluate(({ BrowserWindow }, name) => BrowserWindow.getAllWindows()[0].webContents.send('menu:command', name), command);
const answerYes = (app) => app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });

(async () => {
  let links = {};
  const received = [];
  fs.mkdirSync(path.join(work, 'reader'));
  const reader = new AppLink({
    folder: shared,
    dataDir: path.join(work, 'reader'),
    version: '3.9.0',
    id: 'rt-markdown-reader',
    name: 'RT Markdown Reader',
    load: () => ({ ...links }),
    save: (saved) => { links = saved; },
    ask: async () => true,
    open: async (document) => received.push(document),
  });
  await reader.start();

  let { app, window } = await launch();
  await window.fill('#new-title', 'The Long Road');
  await window.click('#start-project');
  await window.waitForSelector('.ProseMirror');
  await window.click('.ProseMirror');
  await window.keyboard.type('It began on the road.');

  // Off until it's turned on: there's nothing to find.
  assert.equal(fs.existsSync(path.join(shared, 'rt-story-tracker.json')), false);
  await menu(app, 'preferences');
  await window.waitForSelector('#preferences[open]');
  await window.check('#pref-link');
  await window.waitForSelector('[aria-label="Link RT Markdown Reader"]');
  assert.ok(fs.existsSync(path.join(shared, 'rt-story-tracker.json')));
  await window.click('[aria-label="Link RT Markdown Reader"]');
  await window.waitForSelector('[aria-label="Remove the link to RT Markdown Reader"]');
  await window.click('#pref-close');

  // RT Markdown Reader sends a document, and it's offered, not filed.
  await reader.send('rt-story-tracker', { name: 'Chapter 12.md', text: '# Chapter 12\n\nThe tide came in.\n' });
  await window.waitForSelector('#inbox[open]');
  assert.match(await window.textContent('#inbox-title'), /RT Markdown Reader sent “Chapter 12\.md”/);
  assert.equal(await window.locator('#chapter-list .row').count(), 1);
  await window.click('#inbox-add');
  await window.waitForSelector('#inbox', { state: 'detached' });
  await window.waitForFunction(() => document.querySelector('#chapter-list').textContent.includes('Chapter 12'));
  await window.waitForFunction(() => document.querySelector('.ProseMirror').textContent.includes('The tide came in'));

  // Not now leaves it waiting, and Throw away ends it.
  await reader.send('rt-story-tracker', { name: 'Maybe.md', text: 'Perhaps later.' });
  await window.waitForSelector('#inbox[open]');
  await window.click('#inbox-later');
  await window.waitForSelector('#inbox', { state: 'detached' });
  await menu(app, 'inbox');
  await window.waitForSelector('#inbox[open]');
  await window.click('#inbox-drop');
  await window.waitForSelector('#inbox', { state: 'detached' });
  await menu(app, 'inbox');
  await window.waitForTimeout(300);
  assert.equal(await window.locator('#inbox').count(), 0);

  // Open in RT Markdown Reader, over the link.
  await window.locator('#chapter-list .row', { hasText: 'Chapter 1' }).first().click();
  await window.waitForSelector('.ProseMirror');
  await menu(app, 'reader-chapter');
  await window.waitForFunction(() => document.querySelector('#room-message')?.textContent.includes('Opened a copy'));
  assert.match(received[0].text, /Chapter 1|tide|road/);
  assert.equal(received[0].from, 'RT Story Tracker');
  await menu(app, 'reader-book');
  await window.waitForFunction(() => document.querySelector('#room-message')?.textContent.includes('Opened a copy'));
  await new Promise((resolve) => { setTimeout(resolve, 500); });
  assert.equal(received.length, 2);
  assert.match(received[1].text, /The tide came in/);
  assert.match(received[1].text, /It began on the road/);

  // With a picture, into a new book, from the library screen.
  const picture = path.join(work, 'map.png');
  fs.writeFileSync(picture, PNG);
  await window.click('#open-library');
  await window.waitForSelector('.project-row');
  const key = links['rt-story-tracker'].key;
  const { call } = require('../../src/main/app-link');
  const { endpoint } = JSON.parse(fs.readFileSync(path.join(shared, 'rt-story-tracker.json'), 'utf8'));
  await call(endpoint, 'open_document', { app: 'rt-markdown-reader', key, name: 'Maps.md', text: 'See the map.', attachments: [{ name: 'map.png', path: picture }] });
  await window.waitForSelector('#inbox-note');
  assert.match(await window.textContent('#inbox-note'), /Maps\.md/);
  await window.click('.project-open');
  await window.waitForSelector('#inbox[open]');
  await window.selectOption('#inbox-book', '');
  await window.click('#inbox-add');
  await window.waitForFunction(() => document.querySelector('#book-list').textContent.includes('Maps'));
  await window.click('.attachments-button');
  await window.waitForSelector('.attachment-row');
  assert.match(await window.textContent('.attachment-row'), /map\.png/);
  await window.click('#attachments-close');

  // A locked project: never sent, and a document waits for the password.
  await window.click('.security-button');
  await window.fill('#new-password', PASSWORD);
  await window.fill('#new-password-again', PASSWORD);
  await window.click('#security-next');
  await window.check('#recovery-saved');
  await window.click('#recovery-continue');
  await window.waitForSelector('#security-done');
  await window.click('#security-done');
  await window.locator('#chapter-list .row').first().click();
  received.length = 0;
  await menu(app, 'reader-chapter');
  await window.waitForFunction(() => document.querySelector('#room-message')?.textContent.includes('never sent'));
  assert.equal(received.length, 0);

  await menu(app, 'lock');
  await window.waitForSelector('#lock-screen');
  await reader.send('rt-story-tracker', { name: 'For the locked one.md', text: 'Held in memory.' });
  await new Promise((resolve) => { setTimeout(resolve, 500); });
  assert.equal(await window.locator('#inbox').count(), 0, 'nothing is offered behind the lock');
  await window.fill('#lock-password', PASSWORD);
  await window.click('#lock-open');
  await window.waitForSelector('#inbox[open]');
  await window.click('#inbox-add');
  await window.waitForFunction(() => document.querySelector('#chapter-list').textContent.includes('For the locked one'));
  await app.close();

  // With no link: started with a file, the same as Open With.
  const note = path.join(work, 'A Note.md');
  fs.writeFileSync(note, '# A Note\n\nFrom outside.\n');
  ({ app, window } = await launch(note));
  await window.waitForSelector('#lock-screen');
  await window.click('#lock-library');
  await window.waitForSelector('#inbox-note');
  assert.match(await window.textContent('#inbox-note'), /A Note\.md/);
  await app.close();
  await reader.stop();

  console.log('App Link end-to-end test passed.');
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 }));
