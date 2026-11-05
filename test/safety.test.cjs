'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Backups } = require('../src/main/backups');
const { Settings } = require('../src/main/settings');
const { Library } = require('../src/main/storage/library');
const { extractPackage, writePackage } = require('../src/main/storage/package');
const { Workspace } = require('../src/main/workspace');
const { findNode } = require('../src/shared/outline');
const { documentFromText, plainText } = require('../src/shared/text');

const tempDirs = [];
const workspaces = [];

test.after(() => {
  workspaces.forEach((space) => space.closeProject());
  tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-safety-'));
  tempDirs.push(dir);
  return dir;
}

function space(clock) {
  const created = new Workspace(new Library(path.join(tempDir(), 'library'), clock ? { now: clock } : {}));
  workspaces.push(created);
  return created;
}

function book(clock) {
  const made = space(clock);
  const { id, outline } = made.createProject('A Book');
  const bookNode = outline.children[0];
  return { space: made, id, bookId: bookNode.id, chapter: bookNode.children[0].id };
}

const MINUTE = 60000;
const DAY = 86400000;
const body = (text) => JSON.stringify(documentFromText(text));
const textOf = (made, id) => plainText(made.loadChapter(id).body);
const save = (made, id, text) => made.saveChapter({ id, title: 'One', body: body(text) });

function clock(start = new Date('2026-11-05T12:00:00Z')) {
  let now = start.getTime();
  const read = () => new Date(now);
  read.advance = (ms) => {
    now += ms;
  };
  return read;
}

test('a chapter in the Trash leaves the book and the counts, and comes back whole', () => {
  const { space: made, bookId, chapter } = book();
  save(made, chapter, 'five words in this chapter');
  made.addComment({ chapterId: chapter, text: 'A note' });

  const outline = made.trashItem(chapter);
  assert.equal(findNode(outline, chapter), null);
  assert.equal(findNode(outline, bookId).words, 0);
  assert.equal(made.search({ scope: 'project', query: 'words' }).total, 0, 'search skips the Trash');
  const [item] = made.listTrash();
  assert.deepEqual([item.id, item.daysLeft], [chapter, 30]);

  const back = made.restoreItem(chapter);
  assert.equal(findNode(back, chapter).words, 5);
  assert.equal(textOf(made, chapter), 'five words in this chapter');
  assert.equal(made.listComments(chapter).length, 1);
  assert.deepEqual(made.listTrash(), []);
});

test('everything inside a book goes and returns with it', () => {
  const { space: made, id, bookId, chapter } = book();
  save(made, chapter, 'kept safe');
  made.trashItem(bookId);
  assert.equal(made.outline().words, 0);
  assert.equal(made.listProjects().find((row) => row.id === id).words, 0);
  made.restoreItem(bookId);
  assert.equal(made.outline().words, 2);
});

test('a chapter can\'t return into a book that is still in the Trash', () => {
  const { space: made, bookId, chapter } = book();
  made.trashItem(chapter);
  made.trashItem(bookId);
  assert.throws(() => made.restoreItem(chapter), /Restore “A Book” first/);
  made.restoreItem(bookId);
  made.restoreItem(chapter);
});

test('the Trash empties itself after 30 days, and not before', () => {
  const time = clock();
  const { space: made, id, chapter } = book(time);
  made.trashItem(chapter);
  time.advance(29 * DAY);
  made.closeProject();
  made.openProject(id);
  assert.equal(made.listTrash()[0].daysLeft, 1);

  time.advance(2 * DAY);
  made.closeProject();
  made.openProject(id);
  assert.deepEqual(made.listTrash(), []);
  assert.equal(made.project.getItem(chapter), null);
  assert.ok(made.project.removalMarkers().some((row) => row.itemId === chapter), 'it leaves a marker for sync');
});

test('a project in the Trash can be restored, and goes for good after 30 days', () => {
  const time = clock();
  const { space: made, id, chapter } = book(time);
  save(made, chapter, 'whole project');
  made.trashProject(id);
  assert.deepEqual(made.listProjects(), []);
  assert.equal(made.listProjectTrash()[0].title, 'A Book');
  made.restoreProject(made.listProjectTrash()[0].id);
  made.openProject(id);
  assert.equal(textOf(made, chapter), 'whole project');

  made.trashProject(id);
  time.advance(31 * DAY);
  made.library.purgeTrash();
  assert.deepEqual(made.listProjectTrash(), []);
});

test('versions are kept every ten minutes at most, holding the writing as it stood', () => {
  const time = clock();
  const { space: made, chapter } = book(time);
  save(made, chapter, 'first draft');
  save(made, chapter, 'first draft, a bit more');
  assert.equal(made.listVersions(chapter).length, 1, 'the first change keeps what came before it');
  time.advance(5 * MINUTE);
  save(made, chapter, 'still typing');
  assert.equal(made.listVersions(chapter).length, 1);
  time.advance(6 * MINUTE);
  save(made, chapter, 'second draft');
  const versions = made.listVersions(chapter);
  assert.equal(versions.length, 2);
  assert.equal(plainText(made.getVersion({ chapterId: chapter, versionId: versions[0].id }).body), 'still typing');
  assert.equal(plainText(made.getVersion({ chapterId: chapter, versionId: versions[1].id }).body), 'first draft');
});

test('saving the same text keeps no version', () => {
  const { space: made, chapter } = book();
  save(made, chapter, 'same');
  const before = made.listVersions(chapter).length;
  save(made, chapter, 'same');
  assert.equal(made.listVersions(chapter).length, before);
});

test('restoring keeps what was on the page, so it can be undone', () => {
  const time = clock();
  const { space: made, chapter } = book(time);
  save(made, chapter, 'old words');
  save(made, chapter, 'old words again');
  time.advance(11 * MINUTE);
  save(made, chapter, 'new words');
  const [recent] = made.listVersions(chapter);
  const { outline } = made.restoreVersion({ chapterId: chapter, versionId: recent.id });
  assert.equal(textOf(made, chapter), 'old words again');
  assert.equal(findNode(outline, chapter).words, 3);
  const [kept] = made.listVersions(chapter);
  assert.equal(kept.reason, 'restore');
  assert.equal(plainText(made.getVersion({ chapterId: chapter, versionId: kept.id }).body), 'new words');
});

test('a version can only be read through its own chapter', () => {
  const { space: made, bookId, chapter } = book();
  save(made, chapter, 'one');
  save(made, chapter, 'two');
  const other = made.addItem({ kind: 'chapter', parentId: bookId, title: 'Other' }).item.id;
  const [version] = made.listVersions(chapter);
  assert.throws(() => made.getVersion({ chapterId: other, versionId: version.id }), /isn't part of this chapter/);
});

test('old versions thin out to one a day', () => {
  const time = clock();
  const { space: made, chapter } = book(time);
  save(made, chapter, 'start');
  for (let at = 0; at < 6; at += 1) {
    time.advance(11 * MINUTE);
    save(made, chapter, `edit ${at}`);
  }
  assert.equal(made.listVersions(chapter).length, 6);
  time.advance(5 * DAY);
  assert.ok(made.project.thinVersions() > 0);
  assert.equal(made.listVersions(chapter).length, 1);
});

test('a replace across chapters keeps a version of each one it changes', () => {
  const { space: made, chapter } = book();
  save(made, chapter, 'Mara ran');
  made.replaceAll({ scope: 'project', query: 'Mara', replacement: 'Ana' });
  assert.ok(made.listVersions(chapter).some((row) => row.reason === 'replace'));
});

test('a .rtstory file moves a whole project to another computer', () => {
  const { space: made, id, chapter } = book();
  save(made, chapter, 'moved across');
  made.addComment({ chapterId: chapter, text: 'A note' });
  const file = path.join(tempDir(), 'Book.rtstory');
  made.packProject(id, file);
  assert.ok(!fs.readFileSync(file).includes(Buffer.from('moved across')), 'the file is as private as the project');

  const other = space();
  assert.equal(other.importProject(file), id);
  other.openProject(id);
  assert.equal(textOf(other, chapter), 'moved across');
  assert.equal(other.listComments(chapter).length, 1);
  assert.notEqual(other.library.deviceId, made.library.deviceId, 'each computer keeps its own ID');
});

test('a closed project can be packed too, and works from a backup after changes', () => {
  const { space: made, id, chapter } = book();
  save(made, chapter, 'version one');
  made.closeProject();
  const file = path.join(tempDir(), 'Closed.rtstory');
  made.packProject(id, file);
  made.openProject(id);
  save(made, chapter, 'version two, later');

  assert.throws(() => made.importProject(file), (error) => error.code === 'EXISTS' && error.title === 'A Book');
  assert.equal(made.importProject(file, { replace: true }), id);
  made.openProject(id);
  assert.equal(textOf(made, chapter), 'version one', 'the old backup is back');
  assert.equal(made.listProjectTrash().length, 1, 'and the project it replaced is in the Trash');
});

test('a damaged or wrong file never reaches the library', () => {
  const { space: made, id } = book();
  const dir = tempDir();
  const good = path.join(dir, 'good.rtstory');
  made.packProject(id, good);
  const other = space();

  const flipped = path.join(dir, 'flipped.rtstory');
  const data = fs.readFileSync(good);
  data[data.length - 100] ^= 0xff;
  fs.writeFileSync(flipped, data);
  assert.throws(() => other.importProject(flipped), /damaged/);

  const short = path.join(dir, 'short.rtstory');
  fs.writeFileSync(short, data.subarray(0, data.length - 5000));
  assert.throws(() => other.importProject(short), /cut short/);

  const wrong = path.join(dir, 'wrong.rtstory');
  fs.writeFileSync(wrong, 'just some text that is long enough');
  assert.throws(() => other.importProject(wrong), /isn't an RT Story Tracker/);

  assert.deepEqual(other.listProjects(), []);
  assert.deepEqual(fs.readdirSync(other.library.projectsDir), [], 'nothing is left behind');
});

test('a file can\'t write outside its own folder', () => {
  const dir = tempDir();
  const source = path.join(dir, 'source.txt');
  fs.writeFileSync(source, 'x');
  const file = path.join(dir, 'evil.rtstory');
  writePackage(file, { projectId: 'x', files: [{ name: '../escaped.txt', source }] });
  const target = path.join(dir, 'unpack');
  fs.mkdirSync(target);
  assert.throws(() => extractPackage(file, target), /damaged/);
  assert.ok(!fs.existsSync(path.join(dir, 'escaped.txt')));
});

function backups(made, time, values) {
  const settings = new Settings(made.library.root);
  const folder = tempDir();
  settings.save({ backupFolder: folder, backupEvery: 'day', backupKeep: 2, ...values });
  return { folder, settings, runner: new Backups(made, settings, { now: time }) };
}

const allFiles = (dir) => fs.readdirSync(dir, { recursive: true }).filter((name) => name.endsWith('.rtstory'));

test('backups run on their schedule, and only when something changed', () => {
  const time = clock();
  const { space: made, chapter } = book(time);
  const { folder, runner } = backups(made, time);
  assert.equal(runner.runIfDue().saved, 1);
  assert.equal(runner.runIfDue().saved, 0, 'nothing has changed');

  time.advance(1000);
  save(made, chapter, 'new writing');
  assert.equal(runner.runIfDue().saved, 0, 'a day hasn\'t passed');
  time.advance(DAY);
  assert.equal(runner.runIfDue().saved, 1);
  assert.equal(allFiles(folder).length, 2);
  assert.ok(runner.status().last);
});

test('only the newest backups are kept', () => {
  const time = clock();
  const { space: made, chapter } = book(time);
  const { folder, runner } = backups(made, time);
  for (let at = 0; at < 4; at += 1) {
    time.advance(DAY);
    save(made, chapter, `writing ${at}`);
    runner.runIfDue();
  }
  assert.equal(allFiles(folder).length, 2);
});

test('nothing runs until a folder is chosen and a schedule is on', () => {
  const time = clock();
  const { space: made } = book(time);
  assert.equal(backups(made, time, { backupEvery: 'off' }).runner.runIfDue().saved, 0);
  assert.equal(backups(made, time, { backupFolder: '' }).runner.runIfDue().saved, 0);
  assert.throws(() => backups(made, time, { backupFolder: '' }).runner.runNow(), /Choose a folder/);
});

test('a backup can be restored from the folder', () => {
  const time = clock();
  const { space: made, id, chapter } = book(time);
  save(made, chapter, 'safe in the backup');
  const { folder, runner } = backups(made, time);
  runner.runNow();
  const other = space();
  other.importProject(path.join(folder, allFiles(folder)[0]));
  other.openProject(id);
  assert.equal(textOf(other, chapter), 'safe in the backup');
});

test('a folder that can\'t be used is reported and stops nothing', () => {
  const time = clock();
  const { space: made } = book(time);
  const blocked = path.join(tempDir(), 'a-file');
  fs.writeFileSync(blocked, 'not a folder');
  const { runner } = backups(made, time, { backupFolder: blocked });
  const result = runner.runIfDue();
  assert.equal(result.saved, 0);
  assert.match(result.error, /A Book/);
});
