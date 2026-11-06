'use strict';
// Remakes docs/screenshots from the real app, with a made-up library so no real writing ends up in a public repo.
// Run it with: npm run build:renderer && node scripts/make-screenshots.cjs
const { _electron: electron } = require('playwright-core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppLink } = require('../src/main/app-link');
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
  save(opening, 'The Third Stair', doc(
    plain('Marit found the ledger under the stairs, which had always complained.'),
    plain('The rest held names, and most of them she knew.'),
  ));
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

  await window.click('.export-button');
  await window.waitForSelector('#export[open]');
  await window.selectOption('#export-format', 'pdf');
  await pause(400);
  await shot(window, 'export');
  await window.click('#export-close');

  const draft = path.join(profile, 'salt-road-draft.md');
  fs.writeFileSync(draft, [
    "Sure! Here's the next part of the story:",
    '',
    '**Chapter Five**',
    '',
    'The ferryman kept his money in a boot, and he didn\'t say why.',
    '',
    'Marit paid him  anyway, and the river took its time.',
    '',
    '**Chapter Six**',
    '',
    'By morning there were two names left, and the mule had opinions about both.',
    '',
    '---',
    '',
    'Would you like me to continue with Chapter Seven?',
  ].join('\n'));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, draft);
  await window.click('.import-button');
  await window.waitForSelector('#import[open]');
  await pause(400);
  await shot(window, 'import');
  await window.click('#import-cancel');

  const found = path.join(profile, 'My Stories');
  const place = (rel, content) => {
    const full = path.join(found, ...rel.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  for (let number = 1; number <= 5; number += 1) {
    place(`Series_The_Glass_Coast/Book_1_The_Lamplighter/Chapter ${number}.md`, `Chapter ${number} of the lamplighter.\n`);
    place(`Series_The_Glass_Coast/Book_2_Harbour_Lights/Chapter ${number}.md`, `Chapter ${number} of the harbour.\n`);
  }
  place('Series_The_Glass_Coast/Book_1_The_Lamplighter/Chapter 1 v2.md', 'A better first chapter.\n');
  place('Series_The_Glass_Coast/Book_1_The_Lamplighter/Covers/Front Cover.png', fs.readFileSync(path.join(root, 'build', 'icon.png')));
  place('Series_The_Glass_Coast/Book_1_The_Lamplighter/Art/map of the coast.psd', 'map');
  place('Series_The_Glass_Coast/Book_1_The_Lamplighter/Audio/chapter one.mp3', 'audio');
  place('Series_The_Glass_Coast/Book_1_The_Lamplighter/odds and ends.md', 'Some loose words.\n');
  place('Standalone/Winter Tales/first.md', 'One.\n');
  place('Standalone/Winter Tales/second.md', 'Two.\n');
  place('Standalone/Winter Tales/third.md', 'Three.\n');
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, found);
  await send('find-files');
  await window.waitForSelector('#plan-tree');
  await pause(400);
  await shot(window, 'find-my-files');
  await window.click('#plan-cancel');

  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
  }, [path.join(root, 'build', 'icon.png'), path.join(root, 'docs', 'screenshots', 'writing.png'), path.join(root, 'LICENSE')]);
  await window.click('.attachments-button');
  await window.waitForSelector('#attachments[open]');
  await window.click('#attachment-add');
  await window.waitForFunction(() => document.querySelectorAll('.attachment-row').length === 3);
  await pause(500);
  await shot(window, 'attachments');
  await window.click('#attachments-close');

  await window.locator('#book-list .row', { hasText: 'The Ledger' }).hover();
  await window.click('[aria-label="Details of The Ledger"]');
  await window.waitForSelector('#details[open]');
  await window.fill('#detail-author', 'Marit Vale');
  await window.fill('#detail-publisher', 'Harbour Press');
  await window.fill('#detail-subtitle', 'Book One of the Salt Road');
  await pause(300);
  await shot(window, 'details');
  await window.click('#details-save');

  await window.click('.history-button');
  await window.waitForSelector('.history-view ins');
  await pause(300);
  await shot(window, 'history');
  await window.click('#history-close');

  await row('Low Pan').hover();
  await window.click('[aria-label="Move Low Pan to Trash"]');
  await window.click('.trash-button');
  await window.waitForSelector('#trash[open]');
  await pause(300);
  await shot(window, 'trash');
  await window.click('[aria-label="Restore Low Pan"]');
  await window.click('#trash-close');

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

  // The lock, on a project of its own, so nothing above is affected.
  process.env.NMR_LINK_DIR = path.join(profile, 'shared');
  await window.evaluate(() => window.storyTracker.saveSettings({ theme: 'system', glass: false }));
  await app.close();
  app = await launch(profile);
  window = await open(app);
  await window.click('#open-library');
  await window.waitForSelector('#new-title');
  await window.fill('#new-title', 'A Book in Progress');
  await window.click('#start-project');
  await window.waitForSelector('.ProseMirror');

  // A document from RT Markdown Reader, played here by App Link's own code.
  let links = {};
  const reader = new AppLink({
    folder: process.env.NMR_LINK_DIR,
    dataDir: path.join(profile, 'reader'),
    version: '3.9.0',
    id: 'rt-markdown-reader',
    name: 'RT Markdown Reader',
    load: () => ({ ...links }),
    save: (saved) => { links = saved; },
    ask: async () => true,
    open: async () => {},
  });
  await reader.start();
  await window.evaluate(() => window.storyTracker.setLink(true));
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
  await reader.pairWith('storytracker');
  await window.click('.prefs-button');
  await window.waitForSelector('#linked-apps .word-row');
  await window.locator('#linked-apps').scrollIntoViewIfNeeded();
  await pause(300);
  await shot(window, 'linked-apps');
  await window.click('#pref-close');
  await reader.send('storytracker', { name: 'Chapter 12.md', text: '# Chapter 12\n\nThe tide came in before anyone had finished packing, and it did not ask.\n' });
  await window.waitForSelector('#inbox[open]');
  await pause(300);
  await shot(window, 'inbox');
  await window.click('#inbox-drop');
  await reader.stop();

  await window.click('.security-button');
  await window.fill('#new-password', 'seven silver spoons');
  await window.fill('#new-password-again', 'seven silver spoons');
  await window.fill('#locked-label', 'Book one');
  await pause(300);
  await shot(window, 'password');
  await window.click('#security-next');
  await window.waitForSelector('#recovery-key');
  await window.check('#recovery-saved');
  await pause(300);
  await shot(window, 'recovery-key');
  await window.click('#recovery-continue');
  await window.waitForSelector('#security-done');
  if (await window.locator('#offer-trust').count()) await window.click('#offer-trust');
  await window.click('#security-done');
  await window.click('.security-button');
  await window.waitForSelector('#ways');
  await pause(300);
  await shot(window, 'ways-in');
  await window.click('#security-lock-now');
  await window.waitForSelector('#lock-screen');
  await pause(300);
  await shot(window, 'lock');
  await app.close();

  for (const dir of [profile, firstRun]) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  console.log('Screenshots written to docs/screenshots');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
