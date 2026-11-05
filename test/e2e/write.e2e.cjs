'use strict';
// Writes a book in the real app: types, formats, reorders, closes, kills it, and checks nothing went missing.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-write-'));

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

const pageText = (window) => window.textContent('.ProseMirror');
const chapterTitles = (window) => window.$$eval('#chapter-list .row-title', (rows) => rows.map((row) => row.textContent));
const saved = (window) => window.waitForSelector('.save-state[data-state="saved"]', { timeout: 15000 });
const row = (window, list, title) => window.locator(`${list} .row`, { hasText: title });

async function typeOnPage(window, text) {
  await window.click('.ProseMirror');
  await window.keyboard.press('ControlOrMeta+End');
  await window.keyboard.type(text);
}

(async () => {
  let { app, window } = await launch();

  // First run: straight onto a page.
  await window.fill('#new-title', 'Test Novel');
  await window.click('#start-project');
  await window.waitForSelector('.ProseMirror');
  assert.equal(await window.textContent('#project-title'), 'Test Novel');
  assert.equal(await window.inputValue('#chapter-title'), 'Chapter 1');

  // Writing and live word counts.
  await typeOnPage(window, 'The first line of the book');
  await window.waitForFunction(() => document.querySelector('.word-count').textContent.startsWith('6 words in this chapter'));
  assert.match(await window.textContent('#project-words'), /^6 words/);
  await saved(window);

  // Formatting, by the toolbar and by Markdown shortcuts.
  await window.keyboard.press('Enter');
  await window.keyboard.type('# A Heading');
  assert.equal(await window.textContent('.ProseMirror h1'), 'A Heading');
  await window.keyboard.press('Enter');
  await window.keyboard.type('## Smaller');
  const look = await window.$eval('.ProseMirror h2', (node) => getComputedStyle(node).textTransform);
  assert.equal(look, 'none', 'a heading on the page has none of the side lists\' styling');
  await window.keyboard.press('Enter');
  await window.keyboard.type('- a list item');
  assert.equal(await window.textContent('.ProseMirror ul li'), 'a list item');
  await window.keyboard.press('Enter');
  await window.keyboard.press('Enter');
  await window.keyboard.type('**strong** words');
  assert.equal(await window.textContent('.ProseMirror strong'), 'strong');
  await window.keyboard.press('Enter');
  await window.keyboard.type('Centred');
  await window.click('[aria-label="Align center"]');
  const align = await window.locator('.ProseMirror p', { hasText: 'Centred' }).evaluate((node) => getComputedStyle(node).textAlign);
  assert.equal(align, 'center', 'alignment shows on the page');
  await window.keyboard.press('ControlOrMeta+a');
  await window.click('[aria-label="Italic"]');
  assert.ok(await window.$('.ProseMirror em'), 'italic from the toolbar');
  await window.click('[aria-label="Italic"]');
  await window.keyboard.press('ControlOrMeta+End');
  await saved(window);

  // More chapters, and Undo stays inside its chapter.
  await window.click('#add-chapter');
  await window.waitForFunction(() => document.querySelector('#chapter-title').value === 'Chapter 2');
  await typeOnPage(window, 'Second chapter words');
  await window.click('#add-chapter');
  await window.waitForFunction(() => document.querySelector('#chapter-title').value === 'Chapter 3');
  await typeOnPage(window, 'Third');
  await row(window, '#chapter-list', 'Chapter 2').locator('.row-main').click();
  await window.waitForFunction(() => document.querySelector('#chapter-title').value === 'Chapter 2');
  assert.equal(await pageText(window), 'Second chapter words', 'switching saves and opens the right chapter');
  await window.click('.ProseMirror');
  await window.keyboard.press('ControlOrMeta+z');
  await window.keyboard.press('ControlOrMeta+z');
  assert.ok(!(await pageText(window)).includes('Third'), 'Undo never brings in another chapter');
  await window.keyboard.press('ControlOrMeta+Shift+z');
  await window.keyboard.press('ControlOrMeta+Shift+z');

  // Reordering by keyboard and by dragging.
  await row(window, '#chapter-list', 'Chapter 3').locator('.row-main').focus();
  await window.keyboard.press('Alt+ArrowUp');
  await window.waitForFunction(() => document.querySelector('#chapter-list .row:nth-child(2) .row-title').textContent === 'Chapter 3');
  assert.deepEqual(await chapterTitles(window), ['Chapter 1', 'Chapter 3', 'Chapter 2']);
  await row(window, '#chapter-list', 'Chapter 2').dragTo(row(window, '#chapter-list', 'Chapter 1'), { targetPosition: { x: 20, y: 2 } });
  await window.waitForFunction(() => document.querySelector('#chapter-list .row:nth-child(1) .row-title').textContent === 'Chapter 2');
  assert.deepEqual(await chapterTitles(window), ['Chapter 2', 'Chapter 1', 'Chapter 3']);

  // Parts, renaming and dragging into a part.
  await window.click('#add-part');
  await window.fill('.rename', 'Part One');
  await window.keyboard.press('Enter');
  await row(window, '#chapter-list', 'Part One').waitFor();
  await row(window, '#chapter-list', 'Chapter 3').dragTo(row(window, '#chapter-list', 'Part One'));
  await window.waitForSelector('#chapter-list .row.depth-1');
  assert.match(await window.textContent('#chapter-list .row.depth-1'), /Chapter 3/);
  await row(window, '#chapter-list', 'Chapter 1').locator('.row-main').dblclick();
  await window.fill('.rename', 'The Beginning');
  await window.keyboard.press('Enter');
  await row(window, '#chapter-list', 'The Beginning').waitFor();
  assert.equal(await window.inputValue('#chapter-title'), 'The Beginning', 'renaming the open chapter updates its page');

  // A title typed on the page reaches the list, and saves.
  await window.fill('#chapter-title', 'Opening');
  await row(window, '#chapter-list', 'Opening').waitFor();
  await saved(window);

  // Anything can go to the Trash, with an Undo, and it comes back.
  await window.click('#add-chapter');
  await window.waitForFunction(() => document.querySelector('#chapter-title').value === 'Chapter 4');
  await row(window, '#chapter-list', 'Chapter 4').hover();
  await window.click('[aria-label="Move Chapter 4 to Trash"]');
  await window.waitForFunction(() => ![...document.querySelectorAll('#chapter-list .row-title')].some((node) => node.textContent === 'Chapter 4'));
  await window.click('#message-action');
  await row(window, '#chapter-list', 'Chapter 4').waitFor();
  await row(window, '#chapter-list', 'Chapter 4').hover();
  await window.click('[aria-label="Move Chapter 4 to Trash"]');
  await window.waitForFunction(() => ![...document.querySelectorAll('#chapter-list .row-title')].some((node) => node.textContent === 'Chapter 4'));

  // A second book, with its own chapter.
  await window.click('#add-book');
  await window.fill('.rename', 'Book Two');
  await window.keyboard.press('Enter');
  await row(window, '#book-list', 'Book Two').waitFor();
  assert.deepEqual(await chapterTitles(window), ['Chapter 1']);
  await typeOnPage(window, 'Book two starts here');
  await row(window, '#book-list', 'Test Novel').locator('.row-main').click();
  await window.waitForFunction(() => document.querySelector('#book-heading').textContent === 'Test Novel');
  const before = await window.textContent('#project-words');
  assert.match(before, /words/);

  // Closing the window right after typing keeps the last words, with no wait for the timer.
  await row(window, '#book-list', 'Book Two').locator('.row-main').click();
  await window.waitForFunction(() => document.querySelector('#book-heading').textContent === 'Book Two');
  await typeOnPage(window, ' and closes straight away');
  await app.close();

  // It reopens where the author left off.
  ({ app, window } = await launch());
  await window.waitForSelector('.ProseMirror');
  assert.equal(await window.textContent('#book-heading'), 'Book Two');
  assert.equal(await pageText(window), 'Book two starts here and closes straight away');

  // Killed outright: everything reported as saved is there.
  await typeOnPage(window, ' then the machine dies');
  await saved(window);
  const pid = await app.evaluate(() => process.pid);
  process.kill(pid, 'SIGKILL');
  await new Promise((resolve) => setTimeout(resolve, 1500));

  ({ app, window } = await launch());
  await window.waitForSelector('.ProseMirror');
  assert.equal(await pageText(window), 'Book two starts here and closes straight away then the machine dies');

  // The first book came through in one piece.
  await row(window, '#book-list', 'Test Novel').locator('.row-main').click();
  await window.waitForFunction(() => document.querySelector('#book-heading').textContent === 'Test Novel');
  assert.deepEqual(await chapterTitles(window), ['Chapter 2', 'Opening', 'Part One', 'Chapter 3']);
  await row(window, '#chapter-list', 'Opening').locator('.row-main').click();
  await window.waitForFunction(() => document.querySelector('#chapter-title').value === 'Opening');
  assert.equal(await window.textContent('.ProseMirror h1'), 'A Heading');
  assert.equal(await window.textContent('.ProseMirror strong'), 'strong');

  // The library, and the sample.
  await window.click('#open-library');
  await window.waitForSelector('.project-row');
  assert.match(await window.textContent('.project-row'), /Test Novel/);
  await window.click('#try-sample');
  await window.waitForSelector('.ProseMirror');
  assert.match(await window.textContent('#project-title'), /Sample/);
  assert.match(await pageText(window), /ledger/);
  window.on('dialog', (dialog) => dialog.accept());
  await window.click('#open-library');
  await window.waitForSelector('.project-row');
  await window.click('text=Remove sample');
  await window.waitForFunction(() => document.querySelectorAll('.project-row').length === 1);
  await window.click('.project-open');
  await window.waitForSelector('.ProseMirror');
  assert.equal(await window.textContent('#project-title'), 'Test Novel');
  await app.close();

  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  console.log('write e2e passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
