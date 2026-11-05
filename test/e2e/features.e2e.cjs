'use strict';
// The 3.1 features in the real app: themes, fonts, spelling, focus, goals, find and replace, comments and split view.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-features-'));

const launch = async () => {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, RTST_USER_DATA: profile },
  });
  const window = await app.firstWindow();
  await window.waitForSelector('body[data-state="ready"]');
  return { app, window };
};

const row = (window, title) => window.locator('#chapter-list .row', { hasText: title });
const menu = (app, command) => app.evaluate(({ BrowserWindow }, name) => {
  BrowserWindow.getAllWindows()[0].webContents.send('menu:command', name);
}, command);
const titleIs = (window, title) =>
  window.waitForFunction((value) => document.querySelector('.chapter-title').value === value, title);
const cssVar = (window, name) => window.evaluate((value) => document.documentElement.style.getPropertyValue(value), name);

async function typeOnPage(window, text) {
  await window.locator('.pane').first().locator('.ProseMirror').click();
  await window.keyboard.press('ControlOrMeta+End');
  await window.keyboard.type(text);
}

(async () => {
  let { app, window } = await launch();
  window.on('dialog', (dialog) => dialog.accept());
  await window.fill('#new-title', 'Feature Test');
  await window.click('#start-project');
  await window.waitForSelector('.ProseMirror');
  await typeOnPage(window, 'Mara walked to the harbour. Mara stopped.');
  await window.waitForSelector('.save-state[data-state="saved"]', { timeout: 15000 });

  // Preferences: a theme, a font and a size take effect at once and survive a restart.
  await menu(app, 'preferences');
  await window.waitForSelector('#preferences[open]');
  await window.selectOption('#pref-theme', 'plum');
  await window.selectOption('#pref-page-font', 'literata');
  await window.waitForFunction(() => document.documentElement.dataset.theme === 'plum');
  await window.waitForFunction(() => document.documentElement.style.getPropertyValue('--page-font').includes('Literata'));
  assert.equal(await cssVar(window, '--sheet'), '#4d0f28');
  const loaded = await window.evaluate(async () => {
    await document.fonts.load("18px 'Literata'");
    return document.fonts.check("18px 'Literata'");
  });
  assert.ok(loaded, 'the carried font loads');

  // Glass goes with any theme, and High Contrast stays solid.
  await window.check('#pref-glass');
  await window.waitForFunction(() => document.documentElement.dataset.surface === 'glass');
  await window.selectOption('#pref-theme', 'contrast');
  await window.waitForFunction(() => document.documentElement.dataset.surface === 'solid');
  await window.selectOption('#pref-theme', 'slate');
  await window.waitForFunction(() => document.documentElement.dataset.surface === 'glass');
  await window.uncheck('#pref-glass');
  await window.selectOption('#pref-theme', 'plum');
  await window.waitForFunction(() => document.documentElement.dataset.theme === 'plum');

  // Your own words.
  await window.fill('#new-word', 'Xeolar');
  await window.keyboard.press('Enter');
  await window.waitForSelector('#dictionary-words >> text=Xeolar');
  await window.click('[aria-label="Remove Xeolar"]');
  await window.waitForFunction(() => !document.querySelector('#dictionary-words').textContent.includes('Xeolar'));
  await window.click('#pref-close');

  // Goals.
  await window.click('.goals-button');
  await window.fill('#goal-daily', '100');
  await window.fill('#goal-chapter', '50');
  await window.click('#goals-save');
  await window.waitForFunction(() => document.querySelector('#today-words').textContent.includes('of 100 words today'));
  await window.waitForFunction(() => document.querySelector('.word-count').textContent.includes('of 50 words in this chapter'));

  // Focus mode.
  await window.click('.focus-button');
  assert.equal(await window.isVisible('#book-list'), false, 'focus hides the lists');
  assert.equal(await window.isVisible('.toolbar'), false);
  assert.ok(await window.isVisible('.ProseMirror'));
  await window.keyboard.press('Escape');
  assert.ok(await window.isVisible('#book-list'));

  // Find and replace in the chapter, and Undo.
  await menu(app, 'find');
  await window.waitForSelector('.find-bar:not([hidden])');
  await window.fill('.find-query', 'mara');
  await window.waitForFunction(() => document.querySelector('.find-count').textContent === '2 matches');
  assert.equal(await window.locator('.ProseMirror .find-match').count(), 2);
  await window.keyboard.press('Enter');
  await window.waitForFunction(() => document.querySelector('.find-count').textContent === '1 of 2');
  await window.fill('.find-replacement', 'Marit');
  await window.click('.find-replace');
  await window.waitForFunction(() => document.querySelector('.ProseMirror').textContent.startsWith('Marit walked'));
  await window.click('.find-replace-all');
  await window.waitForFunction(() => document.querySelector('.ProseMirror').textContent === 'Marit walked to the harbour. Marit stopped.');
  await window.click('.find-close');

  // A second chapter, then a replace across the book, with Undo.
  await window.click('#add-chapter');
  await titleIs(window, 'Chapter 2');
  await typeOnPage(window, 'Marit came back.');
  await menu(app, 'find');
  await window.fill('.find-query', 'Marit');
  await window.selectOption('.find-scope', 'book');
  await window.waitForSelector('.find-result');
  assert.equal(await window.locator('.find-result').count(), 2);
  await window.fill('.find-replacement', 'Ana');
  await window.click('.find-replace-all');
  await window.waitForSelector('.find-undo');
  assert.equal(await window.textContent('.ProseMirror'), 'Ana came back.');
  await window.click('.find-undo');
  await window.waitForFunction(() => document.querySelector('.ProseMirror').textContent === 'Marit came back.');
  await window.click('.find-close');

  // Comments: on a selection, out of the word count, and kept after a restart.
  await row(window, 'Chapter 1').locator('.row-main').click();
  await titleIs(window, 'Chapter 1');
  const before = await window.textContent('.word-count');
  await window.click('.ProseMirror');
  await window.keyboard.press('ControlOrMeta+a');
  await window.click('.add-comment');
  await window.fill('.comment-box', 'Is the harbour named yet?');
  await window.click('.comment-save');
  await window.waitForSelector('.comment-card');
  assert.ok(await window.$('.ProseMirror .comment-mark'), 'the words are marked');

  // A theme with dark panels and a light page: a comment card is a piece of page, so it takes the page's text colour.
  await menu(app, 'preferences');
  await window.waitForSelector('#preferences[open]');
  await window.selectOption('#pref-theme', 'blue');
  await window.click('#pref-close');
  await window.waitForFunction(() => document.documentElement.dataset.theme === 'blue');
  assert.equal(await window.$eval('.comment-text', (node) => getComputedStyle(node).color), 'rgb(22, 37, 59)');
  assert.equal(await window.$eval('.row-title', (node) => getComputedStyle(node).color), 'rgb(234, 242, 251)');
  await menu(app, 'preferences');
  await window.waitForSelector('#preferences[open]');
  await window.selectOption('#pref-theme', 'plum');
  await window.click('#pref-close');
  await window.waitForFunction(() => document.documentElement.dataset.theme === 'plum');
  assert.match(await window.textContent('.comment-quote'), /Marit walked/);
  assert.equal(await window.textContent('.word-count'), before, 'a comment adds no words');
  await window.waitForSelector('.save-state[data-state="saved"]', { timeout: 15000 });

  // Split view: two chapters, each saving its own text.
  await row(window, 'Chapter 2').hover();
  await window.click('[aria-label="Open Chapter 2 beside"]');
  await window.waitForFunction(() => document.querySelectorAll('.ProseMirror').length === 2);
  await window.locator('.pane').nth(1).locator('.ProseMirror').click();
  await window.keyboard.press('ControlOrMeta+End');
  await window.keyboard.type(' From the right side.');
  await window.waitForFunction(() => document.querySelectorAll('.save-state[data-state="saved"]').length === 2, null, { timeout: 15000 });
  await window.click('[aria-label="Close this side"]');
  await window.waitForFunction(() => document.querySelectorAll('.ProseMirror').length === 1);
  await app.close();

  // All of it came through a restart.
  ({ app, window } = await launch());
  window.on('dialog', (dialog) => dialog.accept());
  await window.waitForSelector('.ProseMirror');
  await window.waitForFunction(() => document.documentElement.dataset.theme === 'plum');
  await window.waitForSelector('.comment-card');
  assert.equal(await window.inputValue('.comment-text'), 'Is the harbour named yet?');
  await window.click('.comment-remove');
  await window.waitForFunction(() => !document.querySelector('.ProseMirror .comment-mark'));
  await row(window, 'Chapter 2').locator('.row-main').click();
  await titleIs(window, 'Chapter 2');
  assert.equal(await window.textContent('.ProseMirror'), 'Marit came back. From the right side.');
  assert.match(await window.textContent('#today-words'), /of 100 words today/);
  await app.close();

  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  console.log('features e2e passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
