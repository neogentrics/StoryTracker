'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const docx = require('docx');
const { FolderImport } = require('../src/main/folder');
const { buildPlan } = require('../src/main/folder/plan');
const { scanFolder } = require('../src/main/folder/scan');
const signs = require('../src/main/folder/signs');
const { Importer } = require('../src/main/import');
const { Library } = require('../src/main/storage/library');
const { Backups } = require('../src/main/backups');
const { Workspace } = require('../src/main/workspace');
const { exportEverything } = require('../src/main/export');
const { plainText } = require('../src/shared/text');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const tempDirs = [];
const spaces = [];

test.after(() => {
  spaces.forEach((space) => space.closeProject());
  tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-folder-'));
  tempDirs.push(dir);
  return dir;
}

function project(title = 'Found') {
  const space = new Workspace(new Library(path.join(tempDir(), 'library')));
  spaces.push(space);
  const { outline } = space.createProject(title);
  return { space, bookId: outline.children[0].id };
}

function folderOf(files) {
  const root = tempDir();
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

const entries = (list) => list.map((rel, at) => (typeof rel === 'string' ? { rel, size: 100 + at, mtime: 1000 + at } : { size: 100 + at, mtime: 1000 + at, ...rel }));
const plan = (list, edits) => buildPlan({ title: 'Stories', entries: entries(list) }, edits);
const titles = (node) => node.children.map((child) => child.title);
const roleOf = (result, rel) => result.files.find((file) => file.rel === rel).role;
const nodeNamed = (node, title) => {
  if (node.title === title) return node;
  for (const child of node.children) {
    const found = nodeNamed(child, title);
    if (found) return found;
  }
  return null;
};

test('names say what they can', () => {
  assert.deepEqual(signs.chapterOf('Chapter 3 The Road').title, 'Chapter 3: The Road');
  assert.equal(signs.chapterOf('Ch03').place, 3);
  assert.equal(signs.chapterOf('Chapter Twelve').place, 12);
  assert.equal(signs.chapterOf('CHAPTER IV').place, 4);
  assert.equal(signs.chapterOf('07 - The Ferry').title, 'The Ferry');
  assert.ok(signs.chapterOf('Prologue').place < signs.chapterOf('Chapter 1').place);
  assert.ok(signs.chapterOf('Epilogue').place > signs.chapterOf('Chapter 99').place);
  assert.equal(signs.chapterOf('Chapterhouse'), null);
  assert.equal(signs.chapterOf('My Book'), null);
  assert.equal(signs.bookOf('Book_2_The_Long_Road').title, 'The Long Road');
  assert.equal(signs.bookOf('Book 2').title, 'Book 2');
  assert.equal(signs.bookOf('Bookkeeping'), null);
  assert.equal(signs.seriesTitle('Series_The_Long_Road'), 'The Long Road');
});

test('a chapter number can come after the book\'s own title', () => {
  assert.equal(signs.chapterOf('The Long Road Chapter 3').title, 'Chapter 3');
  assert.equal(signs.chapterOf('The Long Road Chapter 3').place, 3);
  assert.equal(signs.chapterOf('The Long Road Chapter 3 - The Ferry').title, 'Chapter 3: The Ferry');
  assert.equal(signs.chapterOf('The Long Road Book 2 - Chapter 5').title, 'Book 2, Chapter 5');
  assert.notEqual(signs.chapterOf('The Long Road Book 1 - Chapter 5').key, signs.chapterOf('The Long Road Book 2 - Chapter 5').key);
  assert.equal(signs.chapterOf('The Long Road Prologue').title, 'Prologue');
  assert.ok(signs.chapterOf('The Long Road Epilogue (before 2026-10-19)').place > 9000);
  assert.equal(signs.chapterOf('Prologue Notes').title, 'Prologue Notes');
  assert.equal(signs.chapterOf('Chapterhouse Dreams'), null);
  assert.equal(signs.chapterOf('The Chapterhouse 3'), null);
});

test('folder habits: sort numbers, research, old versions and dossiers', () => {
  const result = plan([
    '02_Books_in_Progress/Series_The_Long_Road/Series_Research/geography.docx',
    '02_Books_in_Progress/Series_The_Long_Road/Book_1_Ash/Chapter 1.docx',
    '02_Books_in_Progress/Series_The_Long_Road/Book_1_Ash/Old Versions/Chapter 1 (before 2026-10-19).docx',
    '02_Books_in_Progress/Series_The_Long_Road/Book_2_Salt/Chapter 1.docx',
    '01_Book_Winter/Chapter 1.docx',
    'Universe Dossiers/Characters/Marit.docx',
    'Universe Dossiers/Characters/Oren.docx',
  ]);
  const series = result.tree.children.filter((node) => node.kind === 'series');
  assert.deepEqual(series.map((node) => node.title), ['The Long Road'], 'a research folder isn\'t a series');
  assert.deepEqual(titles(series[0]), ['Ash', 'Salt']);
  assert.ok(titles(result.tree).includes('Book Winter'));
  assert.equal(roleOf(result, '02_Books_in_Progress/Series_The_Long_Road/Book_1_Ash/Old Versions/Chapter 1 (before 2026-10-19).docx'), 'older');
  assert.equal(roleOf(result, '02_Books_in_Progress/Series_The_Long_Road/Series_Research/geography.docx'), 'attachment');
  assert.equal(roleOf(result, 'Universe Dossiers/Characters/Marit.docx'), 'attachment');
  assert.deepEqual(result.asks, [], 'none of that needed asking');
});

test('a finished copy beside the chapters isn\'t worth asking about', () => {
  const result = plan([
    'Book 1/Chapter 1.docx',
    'Book 1/The Road Manuscript - Print v1.0.docx',
    'Book 1/Print Version/The Road v1.0.docx',
  ]);
  assert.deepEqual(result.asks, []);
  assert.equal(roleOf(result, 'Book 1/The Road Manuscript - Print v1.0.docx'), 'attachment');
  assert.equal(roleOf(result, 'Book 1/Print Version/The Road v1.0.docx'), 'attachment');
});

test('a folder named as a draft is the version of everything in it', () => {
  const result = plan([
    'Book 1/Manuscript/Draft v2/Chapters/Chapter 1.docx',
    'Book 1/Manuscript/Draft v3 (Rewrite)/Chapters/Chapter 1.docx',
    'Book 1/Manuscript/Draft v3 (Rewrite)/Chapters/Old Versions/Chapter 1.docx',
    'Book 1/Manuscript/First Draft/Chapter 1.docx',
  ]);
  assert.equal(roleOf(result, 'Book 1/Manuscript/Draft v3 (Rewrite)/Chapters/Chapter 1.docx'), 'chapter');
  assert.equal(roleOf(result, 'Book 1/Manuscript/Draft v2/Chapters/Chapter 1.docx'), 'older');
  assert.equal(roleOf(result, 'Book 1/Manuscript/First Draft/Chapter 1.docx'), 'older');
  assert.equal(result.tree.children.length, 1);
  assert.deepEqual(result.asks, []);
});

test('version marks come off a name', () => {
  const check = (name, rest, expected) => {
    const version = signs.versionOf(name);
    assert.equal(version.rest, rest, name);
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(version[key], value, `${name} ${key}`);
  };
  check('Manuscript - Version 2', 'Manuscript', { number: [2] });
  check('Chapter 3 v2.1', 'Chapter 3', { number: [2, 1] });
  check('Book Final', 'Book', { final: true });
  check('Chapter 3 - Copy', 'Chapter 3', { copy: true });
  check('Copy of Chapter 3', 'Chapter 3', { copy: true });
  check('Chapter 3 (1)', 'Chapter 3', { copy: true });
  check('Chapter 3 (before 2026-11-02)', 'Chapter 3', { old: true, date: '2026-11-02' });
  check('Chapter 3 Draft 2', 'Chapter 3', { number: [2] });
});

test('a marked newest beats a newer date on the file', () => {
  const older = { rel: 'a', mtime: 9999, inOldFolder: false, version: signs.versionOf('Chapter 1 v1') };
  const newer = { rel: 'b', mtime: 1, inOldFolder: false, version: signs.versionOf('Chapter 1 v2') };
  const final = { rel: 'c', mtime: 1, inOldFolder: false, version: signs.versionOf('Chapter 1 Final') };
  const copy = { rel: 'd', mtime: 99999, inOldFolder: false, version: signs.versionOf('Chapter 1 Final - Copy') };
  assert.deepEqual([older, copy, newer, final].sort(signs.compareVersions).map((file) => file.rel), ['c', 'b', 'a', 'd'].sort((a, b) => ['c', 'b', 'a', 'd'].indexOf(a) - ['c', 'b', 'a', 'd'].indexOf(b)));
});

test('a series of books, each with chapters in order', () => {
  const result = plan([
    'Series_The_Long_Road/Book_2_Salt/Chapter 1.docx',
    'Series_The_Long_Road/Book_1_Ash/Chapter 10.docx',
    'Series_The_Long_Road/Book_1_Ash/Chapter 2.docx',
    'Series_The_Long_Road/Book_1_Ash/Prologue.docx',
    'Series_The_Long_Road/Book_1_Ash/Epilogue.docx',
  ]);
  const [series] = result.tree.children;
  assert.equal(series.kind, 'series');
  assert.equal(series.title, 'The Long Road');
  assert.deepEqual(titles(series), ['Ash', 'Salt']);
  assert.deepEqual(titles(series.children[0]), ['Prologue', 'Chapter 2', 'Chapter 10', 'Epilogue']);
});

test('one folder of chapters is one book', () => {
  const result = plan(['Ch01.docx', 'Ch02.docx', 'Ch03.md']);
  assert.deepEqual(result.asks, []);
  assert.deepEqual(titles(result.tree), ['Stories']);
  assert.deepEqual(titles(result.tree.children[0]), ['Chapter 1', 'Chapter 2', 'Chapter 3']);
});

test('older files become history, and the newest is the chapter', () => {
  const result = plan([
    'Book 1/Chapter 1.docx',
    'Book 1/Chapter 1 v2.docx',
    'Book 1/Old/Chapter 1 v3.docx',
    'Book 1/Chapter 1 - Copy.docx',
    'Book 1/Chapter 2 (before 2026-11-02).docx',
    'Book 1/Chapter 2.docx',
  ]);
  assert.equal(roleOf(result, 'Book 1/Chapter 1 v2.docx'), 'chapter');
  assert.equal(roleOf(result, 'Book 1/Old/Chapter 1 v3.docx'), 'older');
  assert.equal(roleOf(result, 'Book 1/Chapter 1.docx'), 'older');
  assert.equal(roleOf(result, 'Book 1/Chapter 1 - Copy.docx'), 'older');
  assert.equal(roleOf(result, 'Book 1/Chapter 2.docx'), 'chapter');
  assert.equal(nodeNamed(result.tree, 'Chapter 1').older.length, 3);
});

test('a manuscript in versions is one book with history', () => {
  const result = plan(['The Ash Road/Manuscript - Version 1.docx', 'The Ash Road/Manuscript - Version 2.docx', 'The Ash Road/Synopsis.docx']);
  assert.equal(roleOf(result, 'The Ash Road/Manuscript - Version 2.docx'), 'whole');
  assert.equal(roleOf(result, 'The Ash Road/Manuscript - Version 1.docx'), 'older');
  assert.equal(roleOf(result, 'The Ash Road/Synopsis.docx'), 'attachment');
  assert.deepEqual(result.asks, []);
});

test('one file per book makes a series of them', () => {
  const result = plan(['Long Road/Book 1 - Ash.docx', 'Long Road/Book 2 - Salt.docx', 'Long Road/Book 2 - Salt v2.docx']);
  const [series] = result.tree.children;
  assert.equal(series.kind, 'series');
  assert.deepEqual(titles(series), ['Ash', 'Salt']);
  assert.equal(roleOf(result, 'Long Road/Book 2 - Salt.docx'), 'older');
});

test('art, audio and notes stay with their book, and a cover is found', () => {
  const result = plan([
    'Book 1/Chapter 1.docx',
    'Book 1/Covers/Front Cover v2.png',
    'Book 1/Covers/Back Cover.png',
    'Book 1/Art/map.psd',
    'Book 1/Audio/ch1.mp3',
    'Book 1/Print/interior.pdf',
    'Book 1/Notes/ideas.docx',
  ]);
  const book = result.tree.children[0];
  assert.equal(roleOf(result, 'Book 1/Covers/Front Cover v2.png'), 'cover');
  assert.equal(book.cover, result.files.find((file) => file.rel === 'Book 1/Covers/Front Cover v2.png').id);
  for (const rel of ['Book 1/Covers/Back Cover.png', 'Book 1/Art/map.psd', 'Book 1/Audio/ch1.mp3', 'Book 1/Print/interior.pdf', 'Book 1/Notes/ideas.docx']) {
    assert.equal(roleOf(result, rel), 'attachment', rel);
  }
  assert.equal(book.attachments.length, 5);
});

test('parts come from folders, and each part numbers its own chapters', () => {
  const result = plan(['Book 1/Part 1/Chapter 1.docx', 'Book 1/Part 2/Chapter 1.docx', 'Book 1/Part 2/Chapter 2.docx']);
  const book = result.tree.children[0];
  assert.deepEqual(book.children.map((child) => `${child.kind}:${child.title}`), ['part:Part 1', 'part:Part 2']);
  assert.deepEqual(titles(book.children[1]), ['Chapter 1', 'Chapter 2']);
});

test('noise, empty files and exact copies are accounted for, not imported', () => {
  const result = plan([
    'Book 1/Chapter 1.docx',
    { rel: 'Book 1/~$apter 1.docx' },
    { rel: 'Book 1/Thumbs.db' },
    { rel: 'Book 1/.git/config' },
    { rel: 'Book 1/empty.txt', size: 0 },
    { rel: 'Art/a.png', sha256: 'same', size: 500 },
    { rel: 'Art/b.png', sha256: 'same', size: 500 },
    { rel: 'Art/broken.png', error: true },
  ]);
  assert.equal(roleOf(result, 'Book 1/~$apter 1.docx'), 'skipped');
  assert.equal(roleOf(result, 'Book 1/Thumbs.db'), 'skipped');
  assert.equal(roleOf(result, 'Book 1/.git/config'), 'skipped');
  assert.equal(roleOf(result, 'Book 1/empty.txt'), 'skipped');
  assert.equal(roleOf(result, 'Art/a.png'), 'attachment');
  assert.equal(roleOf(result, 'Art/b.png'), 'duplicate');
  assert.equal(roleOf(result, 'Art/broken.png'), 'skipped');
});

test('what it can\'t tell, it asks', () => {
  const unsure = plan(['Book 1/Chapter 1.docx', 'Book 1/Random Thing.docx']);
  assert.equal(unsure.asks[0].type, 'unsure');
  assert.equal(roleOf(unsure, 'Book 1/Random Thing.docx'), 'attachment');
  const answered = plan(['Book 1/Chapter 1.docx', 'Book 1/Random Thing.docx'], { answers: { [unsure.asks[0].id]: 'chapter' } });
  assert.equal(roleOf(answered, 'Book 1/Random Thing.docx'), 'chapter');
  assert.equal(answered.asks[0].answered, true);

  const shapeless = plan(['Stuff/alpha.docx', 'Stuff/beta.docx', 'Stuff/gamma.docx']);
  assert.equal(shapeless.asks[0].type, 'organised');
  assert.equal(roleOf(shapeless, 'Stuff/alpha.docx'), 'chapter', 'the choice shown is what happens');
  const versions = plan(['Stuff/alpha.docx', 'Stuff/beta.docx', 'Stuff/gamma.docx'], { answers: { [shapeless.asks[0].id]: 'versions' } });
  assert.equal(versions.files.filter((file) => file.role === 'older').length, 2);

  const tied = plan(['Book 1/Chapter 1.docx', 'Book 1/Chapter 1.md']);
  assert.equal(tied.asks[0].type, 'same');
  assert.equal(roleOf(tied, 'Book 1/Chapter 1.md'), 'chapter', 'the later date is the first guess');
  const flipped = plan(['Book 1/Chapter 1.docx', 'Book 1/Chapter 1.md'], { answers: { [tied.asks[0].id]: tied.files[0].id } });
  assert.equal(roleOf(flipped, 'Book 1/Chapter 1.docx'), 'chapter');
});

test('writing with no book is asked about', () => {
  const list = ['Book 1/Chapter 1.docx', 'Book 2/Chapter 1.docx', 'loose thoughts.docx'];
  const first = plan(list);
  const ask = first.asks.find((item) => item.type === 'loose');
  assert.equal(roleOf(first, 'loose thoughts.docx'), 'attachment');
  const asBook = plan(list, { answers: { [ask.id]: 'books' } });
  assert.ok(titles(asBook.tree).includes('loose thoughts'));
});

test('the author can rename, move, leave out and change anything', () => {
  const list = ['Book 1/Chapter 1.docx', 'Book 1/Chapter 2.docx', 'Book 2/Chapter 1.docx', 'Book 2/map.png'];
  const first = plan(list);
  const [one, two] = first.tree.children;
  const chapter = one.children[1];
  const edits = { titles: { [two.id]: 'Renamed' }, moves: [{ id: chapter.id, to: two.id }], left: {}, roles: {} };
  const moved = plan(list, edits);
  assert.equal(moved.tree.children[1].title, 'Renamed');
  assert.deepEqual(titles(moved.tree.children[1]), ['Chapter 1', 'Chapter 2']);

  const left = plan(list, { left: { [two.id]: true } });
  assert.deepEqual(titles(left.tree), ['Book 1']);
  assert.equal(roleOf(left, 'Book 2/map.png'), 'skipped');
  assert.equal(roleOf(left, 'Book 2/Chapter 1.docx'), 'skipped');

  const badMove = plan(list, { moves: [{ id: one.id, to: chapter.id }] });
  assert.equal(badMove.tree.children.length, 2, 'a book can\'t go inside a chapter');
});

test('every file gets a place, however odd the folder', () => {
  const list = ['a.docx', 'b/c.png', 'b/d/e.mp3', 'Book 1/x.docx', 'Book 1/y/z.zip', 'Series A/q.txt', 'Series A/Book 2/Chapter 1.md', 'no extension', 'Novel.scriv/Novel.scrivx', 'Novel.scriv/Files/Data/1/content.rtf'];
  const result = plan(list);
  assert.equal(result.files.length, list.length);
  assert.ok(result.files.every((file) => file.role), JSON.stringify(result.files.filter((file) => !file.role).map((file) => file.rel)));
  assert.equal(roleOf(result, 'Novel.scriv/Files/Data/1/content.rtf'), 'bundled');
});

test('a scan only looks, finds copies, and stays in its folder', async (t) => {
  const outside = folderOf({ 'secret.txt': 'outside' });
  const root = folderOf({ 'a.txt': 'same words', 'b/c.txt': 'same words', 'd.txt': 'other wordss' });
  try {
    fs.symlinkSync(outside, path.join(root, 'link'), 'junction');
  } catch {
    t.diagnostic('Links aren\'t available here.');
  }
  const found = await scanFolder(root);
  assert.deepEqual(found.map((entry) => entry.rel).sort(), ['a.txt', 'b/c.txt', 'd.txt']);
  const [a, c] = ['a.txt', 'b/c.txt'].map((rel) => found.find((entry) => entry.rel === rel));
  assert.equal(a.sha256, c.sha256);
  assert.equal(found.find((entry) => entry.rel === 'd.txt').sha256, undefined, 'a file with no twin is never read');
});

test('an attachment is encrypted, comes back whole, and is stored once', async () => {
  const { space, bookId } = project();
  const secret = Buffer.from(`Picture of ${crypto.randomUUID()}`);
  const source = path.join(tempDir(), 'map.txt');
  fs.writeFileSync(source, secret);
  const first = await space.project.addAttachment(bookId, { name: 'map.txt', source });
  const second = await space.project.addAttachment(bookId, { name: 'again.txt', source: secret });
  const dir = space.project.attachments.dir;
  assert.equal(fs.readdirSync(dir).length, 1, 'the same contents are stored once');
  assert.ok(!fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0])).includes(secret));
  assert.deepEqual(await space.project.attachments.read(space.project.attachment(first.id).file), secret);
  assert.deepEqual(space.listAttachments(bookId).map((item) => item.name), ['map.txt', 'again.txt']);
  assert.equal(space.project.attachment(second.id).size, secret.length);

  const copy = path.join(tempDir(), 'out.txt');
  await space.saveAttachment(first.id, copy);
  assert.deepEqual(fs.readFileSync(copy), secret);
});

test('a damaged attachment says so, and leaves no half file', async () => {
  const { space, bookId } = project();
  const item = await space.project.addAttachment(bookId, { name: 'a.bin', source: Buffer.alloc(5000, 7) });
  const { file } = space.project.attachment(item.id);
  const full = space.project.attachments.pathOf(file);
  const bytes = fs.readFileSync(full);
  bytes[100] ^= 255;
  fs.writeFileSync(full, bytes);
  await assert.rejects(space.project.attachments.read(file), /damaged/);
  const out = path.join(tempDir(), 'out.bin');
  await assert.rejects(space.saveAttachment(item.id, out), /damaged/);
  assert.equal(fs.existsSync(out), false);
  assert.throws(() => space.project.attachments.pathOf('../../keys.json'), /damaged/);
});

test('attachments stay out of the outline, comments and exports, and follow the Trash', async () => {
  const { space, bookId } = project();
  const chapter = space.outline().children[0].children[0].id;
  const item = await space.project.addAttachment(chapter, { name: 'a.png', source: PNG, type: 'image/png' });
  assert.equal(space.outline().children[0].children[0].children.length, 0);
  assert.deepEqual(space.listComments(chapter), []);
  assert.ok((await space.previewAttachment(item.id)).startsWith('data:image/png;base64,'));

  space.trashItem(item.id);
  assert.equal(space.listAttachments(bookId).filter((entry) => entry.id === item.id && !space.project.getItem(entry.id).trashedAt).length, 0);
  space.project.tidyAttachments();
  assert.equal(fs.readdirSync(space.project.attachments.dir).length, 1, 'the Trash still needs it');
  space.project.removeItem(item.id);
  space.project.tidyAttachments();
  assert.equal(fs.readdirSync(space.project.attachments.dir).length, 0);
});

test('a .rtstory file carries attachments, and one without them stays readable by older apps', async () => {
  const { space, bookId } = project('Packed');
  const { id } = space.open();
  const plain = path.join(tempDir(), 'plain.rtstory');
  space.packProject(id, plain);
  assert.ok(fs.readFileSync(plain).subarray(0, 200).includes('"format":1'));

  const item = await space.project.addAttachment(bookId, { name: 'a.bin', source: Buffer.alloc(3000, 9) });
  const file = path.join(tempDir(), 'with.rtstory');
  await space.packProjectLater(id, file);
  assert.ok(fs.readFileSync(file).subarray(0, 200).includes('"format":2'));

  const other = new Workspace(new Library(path.join(tempDir(), 'elsewhere')));
  spaces.push(other);
  other.importProject(file);
  other.openProject(id);
  assert.deepEqual(await other.project.attachments.read(other.project.attachment(item.id).file), Buffer.alloc(3000, 9));
});

test('backups keep attachments beside them, copied once, and a restore finds them', async () => {
  const { space, bookId } = project('Backed up');
  const { id } = space.open();
  const item = await space.project.addAttachment(bookId, { name: 'a.bin', source: Buffer.alloc(3000, 3) });
  const folder = tempDir();
  const settings = { values: { backupEvery: 'day', backupFolder: folder, backupKeep: 3 } };
  const runner = new Backups(space, settings);
  assert.equal(runner.runNow().saved, 1);
  await runner.copying;
  const [dir] = fs.readdirSync(folder).filter((name) => name !== 'backups.json');
  const backup = fs.readdirSync(path.join(folder, dir)).find((name) => name.endsWith('.rtstory'));
  assert.ok(fs.readFileSync(path.join(folder, dir, backup)).subarray(0, 200).includes('"format":1'), 'the backup itself stays small');
  assert.equal(fs.readdirSync(path.join(folder, dir, 'attachments')).length, 1);

  const other = new Workspace(new Library(path.join(tempDir(), 'restored')));
  spaces.push(other);
  other.importProject(path.join(folder, dir, backup));
  other.openProject(id);
  assert.deepEqual(await other.project.attachments.read(other.project.attachment(item.id).file), Buffer.alloc(3000, 3));
});

test('export everything includes attachments, even two with one name', async () => {
  const { space, bookId } = project('Everything');
  await space.project.addAttachment(bookId, { name: 'map.png', source: PNG });
  await space.project.addAttachment(bookId, { name: 'map.png', source: Buffer.concat([PNG, PNG]) });
  const { folder } = await exportEverything(space.project, tempDir());
  const book = space.outline().children[0].title;
  assert.deepEqual(fs.readdirSync(path.join(folder, 'attachments', book)).sort(), ['map 2.png', 'map.png']);
});

test('a picture in a Word file stays with the book', async () => {
  const { space } = project();
  const document = new docx.Document({ sections: [{ children: [
    new docx.Paragraph({ children: [new docx.TextRun('Words.')] }),
    new docx.Paragraph({ children: [new docx.ImageRun({ type: 'png', data: PNG, transformation: { width: 10, height: 10 } })] }),
  ] }] });
  const file = path.join(tempDir(), 'pictured.docx');
  fs.writeFileSync(file, await docx.Packer.toBuffer(document));
  const importer = new Importer();
  const first = await importer.inspect(file);
  assert.ok(first.notes.some((note) => /1 picture will be kept/.test(note)));
  const { bookId } = await importer.commit(space, { token: first.token, accepted: [], mode: first.mode, target: { kind: 'new', parentId: space.open().id } });
  const [picture] = space.listAttachments(bookId);
  assert.equal(picture.type, 'image/png');
  assert.deepEqual(await space.project.attachments.read(space.project.attachment(picture.id).file), PNG);
});

async function wordFile(...lines) {
  const children = lines.map((line) => (line.startsWith('# ')
    ? new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_1, children: [new docx.TextRun(line.slice(2))] })
    : new docx.Paragraph({ children: [new docx.TextRun(line)] })));
  return docx.Packer.toBuffer(new docx.Document({ sections: [{ children }] }));
}

async function storiesFolder() {
  return folderOf({
    'Series_The_Long_Road/Book_1_Ash/Chapter 1.docx': await wordFile('The first words.'),
    'Series_The_Long_Road/Book_1_Ash/Chapter 1 v2.docx': await wordFile('The first words, better now.'),
    'Series_The_Long_Road/Book_1_Ash/Chapter 2.md': 'Second chapter words.\n',
    'Series_The_Long_Road/Book_1_Ash/Covers/Front Cover.png': PNG,
    'Series_The_Long_Road/Book_1_Ash/Art/map.psd': Buffer.alloc(2000, 1),
    'Series_The_Long_Road/Book_2_Salt/Manuscript v1.docx': await wordFile('# One', 'Old one.', '# Two', 'Old two.', '# Cut', 'Gone later.'),
    'Series_The_Long_Road/Book_2_Salt/Manuscript v2.docx': await wordFile('# One', 'New one.', '# Two', 'New two.'),
    'Series_The_Long_Road/Book_2_Salt/Audio/ch1.mp3': Buffer.alloc(3000, 2),
    'Series_The_Long_Road/Book_2_Salt/Blurb.txt': 'A blurb.',
    'Standalone/Chapter 1.txt': 'Alone at last.\n',
    'Standalone/broken.docx': 'not a real word file',
    'Standalone/Chapter 2.docx': 'not a real word file either',
    'Standalone/Chapter 2 copy.txt': 'Alone at last.\n',
    'Thumbs.db': 'noise',
    'cover art.png': Buffer.concat([PNG, Buffer.alloc(10)]),
  });
}

const snapshot = (root) => {
  const take = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return take(full);
    const { size, mtimeMs } = fs.statSync(full);
    return [`${path.relative(root, full)}|${size}|${mtimeMs}|${crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')}`];
  });
  return take(root).sort();
};

const flatten = (node) => [node, ...(node.children ?? []).flatMap(flatten)];

test('the whole thing: every file accounted for, originals unchanged', async () => {
  const root = await storiesFolder();
  const before = snapshot(root);
  const { space } = project();
  const folder = new FolderImport();
  const plan = await folder.scan(space, root, () => {});
  assert.equal(plan.totals.files, 15);
  const steps = [];
  const { finished, report, outline } = await folder.run(space, (step) => steps.push(step));

  assert.equal(finished, true);
  assert.equal(report.total, 15);
  assert.equal(report.accounted, 15);
  assert.equal(report.waiting, 0);
  assert.equal(report.groups.reduce((sum, group) => sum + group.files.length, 0), 15);
  assert.deepEqual(snapshot(root), before, 'the originals are exactly as they were');
  assert.ok(steps.length > 5);

  const nodes = flatten(outline);
  const series = nodes.find((node) => node.kind === 'series');
  assert.equal(series.title, 'The Long Road');
  assert.deepEqual(series.children.map((node) => node.title), ['Ash', 'Salt']);
  assert.equal(outline.children.filter((node) => node.kind === 'book').length, 1, 'the empty starting book made way');

  const ash = series.children[0];
  const salt = series.children[1];
  assert.deepEqual(ash.children.map((node) => node.title), ['Chapter 1', 'Chapter 2']);
  const first = ash.children[0].id;
  assert.equal(plainText(space.loadChapter(first).body), 'The first words, better now.');
  const versions = space.listVersions(first);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].reason, 'imported');
  assert.equal(plainText(space.getVersion({ chapterId: first, versionId: versions[0].id }).body), 'The first words.');

  assert.ok(space.getDetails(ash.id).cover, 'the cover was found');
  assert.equal(space.getDetails(ash.id).details.seriesName, 'The Long Road');
  assert.equal(space.getDetails(ash.id).details.seriesNumber, '1');
  assert.deepEqual(space.listAttachments(ash.id).map((item) => item.name), ['map.psd']);

  assert.deepEqual(salt.children.map((node) => node.title), ['One', 'Two']);
  assert.equal(plainText(space.loadChapter(salt.children[0].id).body), 'New one.');
  assert.equal(space.listVersions(salt.children[1].id).length, 1, 'the matching old chapter went into history');
  const kept = space.listAttachments(salt.id).map((item) => item.name);
  assert.ok(kept.includes('Manuscript v1.docx'), 'a part of it matched nothing, so the file itself is kept');
  assert.ok(kept.includes('ch1.mp3') && kept.includes('Blurb.txt'));

  const failed = report.groups.find((group) => group.outcome === 'attachment').files.find((file) => file.rel === 'Standalone/Chapter 2.docx');
  assert.ok(failed === undefined || /couldn’t be read/.test(failed.note));
  assert.ok(report.groups.find((group) => group.outcome === 'skipped').files.some((file) => file.rel === 'Thumbs.db'));
  assert.equal(space.progress().today, 0, 'bringing files in isn\'t writing');
});

test('a file with no chapter name that holds a whole book is split', async () => {
  const root = folderOf({
    'Stuff/alpha.docx': await wordFile('# Chapter 1', 'First words.', '# Chapter 2', 'Second words.'),
    'Stuff/beta.docx': await wordFile('Just a little.'),
  });
  const { space } = project();
  const folder = new FolderImport();
  await folder.scan(space, root, () => {});
  const { outline } = await folder.run(space, () => {});
  const book = outline.children.find((node) => node.title === 'Stuff');
  assert.deepEqual(book.children.map((node) => node.title), ['Chapter 1', 'Chapter 2', 'beta']);
});

test('stopping keeps what\'s done, and a resume finishes without repeating anything', async () => {
  const root = await storiesFolder();
  const { space } = project();
  const folder = new FolderImport();
  await folder.scan(space, root, () => {});
  let steps = 0;
  const first = await folder.run(space, () => {
    steps += 1;
    if (steps === 4) folder.stop();
  });
  assert.equal(first.finished, false);
  assert.ok(first.report.waiting > 0);
  const pending = folder.pending(space);
  assert.equal(pending.root, root);

  const again = new FolderImport();
  const second = await again.resume(space, () => {});
  assert.equal(second.finished, true);
  assert.equal(second.report.accounted, 15);
  assert.equal(again.pending(space), null);

  const nodes = flatten(second.outline);
  const series = nodes.filter((node) => node.kind === 'series');
  assert.equal(series.length, 1, 'nothing was made twice');
  assert.deepEqual(series[0].children.find((node) => node.title === 'Ash').children.map((node) => node.title), ['Chapter 1', 'Chapter 2']);
});

test('a file that goes missing halfway is reported, and stops nothing', async () => {
  const root = folderOf({ 'Book 1/Chapter 1.txt': 'Words here.', 'Book 1/map.png': PNG, 'Book 1/gone.png': Buffer.concat([PNG, PNG]) });
  const { space } = project();
  const folder = new FolderImport();
  await folder.scan(space, root, () => {});
  fs.rmSync(path.join(root, 'Book 1', 'gone.png'));
  const { finished, report } = await folder.run(space, () => {});
  assert.equal(finished, true);
  assert.equal(report.accounted, 3);
  assert.deepEqual(report.groups.find((group) => group.outcome === 'missing').files.map((file) => file.rel), ['Book 1/gone.png']);
});

test('the plan says how much room it needs', async () => {
  const root = folderOf({ 'Book 1/Chapter 1.txt': 'Words.', 'Book 1/map.png': PNG });
  const { space } = project();
  const plan = await new FolderImport().scan(space, root, () => {});
  assert.equal(plan.totals.attachmentBytes, PNG.length);
  assert.ok(plan.freeBytes > 0);
});

test('the report reads as plain text', () => {
  const text = new FolderImport().reportText({ total: 2, accounted: 2, groups: [{ label: 'Left out', files: [{ rel: 'a.txt', note: 'A system file.' }, { rel: 'b.txt' }] }] });
  assert.ok(text.includes('2 of 2 files accounted for'));
  assert.ok(text.includes('Left out (2)'));
  assert.ok(text.includes('a.txt  —  A system file.'));
});
