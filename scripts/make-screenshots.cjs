'use strict';
// Remakes docs/screenshots from the real app, with a made-up library so no real writing ends up in a public repo.
// Run it with: npm run build:renderer && node scripts/make-screenshots.cjs
const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Library } = require('../src/main/storage/library');
const { Workspace } = require('../src/main/workspace');

const root = path.join(__dirname, '..');
const out = path.join(root, 'docs', 'screenshots');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-shots-'));
const WIDTH = 1440;
const HEIGHT = 873;

const paragraph = (...content) => ({ type: 'paragraph', content });
const text = (value, ...marks) => ({ type: 'text', text: value, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const plain = (value) => paragraph(text(value));
const doc = (...content) => JSON.stringify({ type: 'doc', content });

const LEDGER = doc(
  plain('Marit found the ledger under the third stair, which was the stair that had always complained.'),
  paragraph(text('The first page held a single line in her grandmother’s hand: '), text('Everything owed is written here.', 'italic')),
  plain('The rest held names, and most of them she knew. The baker. The ferryman. Her own father, twice.'),
  plain('She read until the lamp ran low, then packed the book in her coat and went to wake the mule.'),
  plain('It was still dark when they reached the end of the lane. Behind her the house kept its one lit window, the way it had kept everything else, without being asked. She didn’t look back. She had read enough to know what was owed there, and it would keep.'),
  plain('The road ran white under the moon, salt on both sides of it as far as anyone had ever bothered to walk. Seven names. She said them over once, quietly, so the mule would know what it was in for.'),
);

const NOTES = doc(
  { type: 'heading', attrs: { level: 1 }, content: [text('What the ledger says')] },
  paragraph(text('Each door on the road owes something, and '), text('none', 'bold'), text(' of them know the others do.')),
  { type: 'heading', attrs: { level: 2 }, content: [text('Who she has to find')] },
  {
    type: 'orderedList',
    attrs: { start: 1 },
    content: ['The baker at Low Pan', 'The ferryman, if he’s still working', 'Her father, both times'].map((item) => ({
      type: 'listItem',
      content: [plain(item)],
    })),
  },
  { type: 'paragraph', attrs: { textAlign: 'center' }, content: [text('* * *')] },
  plain('Type # and a space for a heading, or - and a space for a list. The buttons above the page do the same.'),
);

const MULE = doc(
  plain('The mule took the news badly.'),
  plain('It stood in the yard with its ears back while she tied on the bags. It had walked the Salt Road once, years ago, and had made up its mind about the experience.'),
  plain('“Seven names,” Marit told it. “Seven doors, and then we come home.”'),
  plain('The mule breathed out through its nose. Neither of them believed her.'),
);

function makeLibrary() {
  const space = new Workspace(new Library(path.join(profile, 'library')));
  const add = (kind, parentId, title) => space.addItem({ kind, parentId, title }).item.id;
  const save = (id, title, body) => space.saveChapter({ id, title, body });

  const { id, outline } = space.createProject('The Salt Road');
  const firstBook = outline.children[0];
  const series = add('series', id, 'The Salt Road Trilogy');
  space.move({ id: firstBook.id, parentId: series });
  space.rename({ id: firstBook.id, title: 'The Ledger' });
  const opening = firstBook.children[0].id;

  const partOne = add('part', firstBook.id, 'Part One: Leaving');
  space.move({ id: opening, parentId: partOne });
  save(opening, 'The Third Stair', LEDGER);
  save(add('chapter', partOne, 'The Mule'), 'The Mule', MULE);
  save(add('chapter', partOne, 'Low Pan'), 'Low Pan', doc(plain('The baker saw her coming and put the kettle on, which was the worst thing he could have done.')));
  const partTwo = add('part', firstBook.id, 'Part Two: The Doors');
  save(add('chapter', partTwo, 'The Seven Doors'), 'The Seven Doors', NOTES);
  add('chapter', partTwo, 'The Ferryman');

  add('book', series, 'The Seventh Door');
  add('book', series, 'What the Salt Keeps');
  add('book', id, 'Stories from the Road');
  space.closeProject();

  const other = space.createProject('Harbour Lights').outline.children[0];
  space.saveChapter({ id: other.children[0].id, title: 'Chapter 1', body: doc(plain('The harbour had four lights and only one of them was honest.')) });
  space.closeProject();
  space.createProject('Notes on Rivers');
  space.closeProject();
  return id;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });

  // The very first run, on an empty library.
  const firstRun = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-shots-first-'));
  const launch = (userData) =>
    electron.launch({
      executablePath: require('electron'),
      args: [root],
      env: { ...process.env, RTST_USER_DATA: userData },
    });
  const open = async (app) => {
    const window = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height);
    }, { width: WIDTH, height: HEIGHT });
    await window.waitForSelector('body[data-state="ready"]');
    await pause(500);
    return window;
  };
  const shot = (window, name) => window.screenshot({ path: path.join(out, `${name}.png`) });

  let app = await launch(firstRun);
  let window = await open(app);
  await shot(window, 'first-run');
  await app.close();

  makeLibrary();
  app = await launch(profile);
  window = await open(app);
  await shot(window, 'library');

  await window.click('.project-open:has-text("The Salt Road")');
  await window.waitForSelector('.ProseMirror');
  await pause(400);
  await shot(window, 'writing');

  await window.emulateMedia({ colorScheme: 'dark' });
  await pause(300);
  await shot(window, 'dark');
  await window.emulateMedia({ colorScheme: 'light' });

  await window.locator('#chapter-list .row', { hasText: 'The Seven Doors' }).locator('.row-main').click();
  await window.waitForFunction(() => document.querySelector('#chapter-title').value === 'The Seven Doors');
  await window.click('.ProseMirror h2');
  await pause(300);
  await shot(window, 'formatting');

  const send = (command) => app.evaluate(({ BrowserWindow }, name) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:command', name);
  }, command);
  const row = (title) => window.locator('#chapter-list .row', { hasText: title });

  await row('The Third Stair').locator('.row-main').click();
  await window.waitForFunction(() => document.querySelector('#chapter-title').value === 'The Third Stair');
  await send('find');
  await window.fill('.find-query', 'the');
  await window.selectOption('.find-scope', 'chapter');
  await window.fill('.find-replacement', 'that');
  await pause(300);
  await shot(window, 'find');
  await window.click('.find-close');

  await window.click('.ProseMirror p:nth-child(3)', { clickCount: 3 });
  await window.click('.add-comment');
  await window.fill('.comment-box', 'Should her father\u2019s name be here twice, or is that the point?');
  await window.click('.comment-save');
  await window.waitForSelector('.comment-card');
  await pause(300);
  await shot(window, 'comments');

  await row('The Mule').hover();
  await window.click('[aria-label="Open The Mule beside"]');
  await window.waitForFunction(() => document.querySelectorAll('.ProseMirror').length === 2);
  await pause(400);
  await shot(window, 'split');
  await window.click('[aria-label="Close this side"]');
  await window.click('.focus-button');
  await pause(300);
  await shot(window, 'focus');
  await window.keyboard.press('Escape');

  await send('preferences');
  await window.waitForSelector('#preferences[open]');
  await pause(300);
  await shot(window, 'preferences');
  await window.click('#pref-close');

  const looks = {
    sepia: { theme: 'sepia' },
    slate: { theme: 'slate' },
    blue: { theme: 'blue' },
    glass: { theme: 'dusk', glass: true },
  };
  for (const [name, look] of Object.entries(looks)) {
    await window.evaluate((settings) => window.storyTracker.saveSettings(settings), look);
    await app.close();
    app = await launch(profile);
    window = await open(app);
    await window.waitForSelector('.ProseMirror');
    await pause(400);
    await shot(window, `theme-${name}`);
  }
  await app.close();

  for (const dir of [profile, firstRun]) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  console.log('Screenshots written to docs/screenshots');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
