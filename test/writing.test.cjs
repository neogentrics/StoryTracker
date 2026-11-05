'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Library } = require('../src/main/storage/library');
const { migrate, openDatabase } = require('../src/main/storage/database');
const { STEPS } = require('../src/main/storage/schema');
const { openWithAppSlot } = require('../src/main/storage/keys');
const { Workspace } = require('../src/main/workspace');
const { canHold, findNode, resolveDrop, resolveStep } = require('../src/shared/outline');
const { LONGEST_MS, QUIET_MS, RETRY_MS, Saver } = require('../src/shared/saver');
const { countWords, documentFromText, plainText, toDocument } = require('../src/shared/text');

const tempDirs = [];
const workspaces = [];

test.after(() => {
  workspaces.forEach((workspace) => workspace.closeProject());
  tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
});

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-writing-'));
  tempDirs.push(dir);
  const created = new Workspace(new Library(path.join(dir, 'library')));
  workspaces.push(created);
  return created;
}

const body = (text) => JSON.stringify(documentFromText(text));
const titles = (node) => node.children.map((child) => child.title);

function book() {
  const space = workspace();
  const { id, outline } = space.createProject('A Book');
  const bookId = outline.children[0].id;
  const add = (kind, title, parentId = bookId) => space.addItem({ kind, parentId, title }).item.id;
  return { space, id, bookId, add, chapterOne: outline.children[0].children[0].id };
}

test('counts words the way a writer would', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   \n  '), 0);
  assert.equal(countWords('One two  three.'), 3);
  assert.equal(countWords("don't well-known"), 2);
  assert.equal(countWords('wait—what'), 2);
  assert.equal(countWords('then — now'), 2);
  assert.equal(countWords('* * *'), 0);
  assert.equal(countWords('Chapter 12'), 2);
  assert.equal(countWords('café привет'), 2);
  assert.equal(countWords('日本語'), 3);
});

test('reads the text out of a saved document', () => {
  const document = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'one ' },
          { type: 'text', text: 'bo', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'ld' },
          { type: 'hardBreak' },
          { type: 'text', text: 'two' },
        ],
      },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
    ],
  };
  assert.equal(plainText(JSON.stringify(document)), 'Title\none bold\ntwo\nitem');
  assert.equal(countWords(plainText(JSON.stringify(document))), 5);
});

test('text that is not a document still opens', () => {
  assert.equal(plainText('Just words'), 'Just words');
  assert.equal(plainText('{not json'), '{not json');
  assert.deepEqual(toDocument('One\n\nTwo').content.map((block) => block.content?.[0].text), ['One', undefined, 'Two']);
  assert.equal(toDocument('').type, 'doc');
});

test('a new project opens straight onto a first chapter', () => {
  const space = workspace();
  const { title, outline } = space.createProject('  The Long Way  ');
  assert.equal(title, 'The Long Way');
  assert.deepEqual(titles(outline), ['The Long Way']);
  assert.deepEqual(titles(outline.children[0]), ['Chapter 1']);
  assert.equal(space.createProject('   ').title, 'Untitled project');
});

test('things only go where they belong', () => {
  assert.ok(canHold('project', 'series') && canHold('series', 'book') && canHold('book', 'part') && canHold('part', 'chapter'));
  assert.ok(!canHold('chapter', 'chapter') && !canHold('part', 'book') && !canHold('project', 'chapter'));
  const { space, id, bookId, chapterOne } = book();
  assert.throws(() => space.addItem({ kind: 'chapter', parentId: id, title: 'x' }), /can't go there/);
  assert.throws(() => space.addItem({ kind: 'book', parentId: bookId, title: 'x' }), /can't go there/);
  assert.throws(() => space.move({ id: bookId, parentId: chapterOne }), /can't move there/);
});

test('word totals add up from chapters to the project', () => {
  const { space, id, bookId, add, chapterOne } = book();
  const part = add('part', 'Part One');
  const inPart = add('chapter', 'In the part', part);
  space.saveChapter({ id: chapterOne, title: 'Chapter 1', body: body('one two three') });
  space.saveChapter({ id: inPart, title: 'In the part', body: body('four five') });
  const outline = space.outline();
  assert.equal(findNode(outline, chapterOne).words, 3);
  assert.equal(findNode(outline, part).words, 2);
  assert.equal(findNode(outline, bookId).words, 5);
  assert.equal(outline.words, 5);
  assert.equal(space.listProjects().find((item) => item.id === id).words, 5);
});

test('moving puts things in the right order and survives a reopen', () => {
  const { space, id, bookId, add, chapterOne } = book();
  const two = add('chapter', 'Two');
  const three = add('chapter', 'Three');
  const order = () => titles(findNode(space.outline(), bookId));

  space.move({ id: three, parentId: bookId, beforeId: chapterOne });
  assert.deepEqual(order(), ['Three', 'Chapter 1', 'Two']);
  space.move({ id: three, parentId: bookId, beforeId: two });
  assert.deepEqual(order(), ['Chapter 1', 'Three', 'Two']);
  space.move({ id: chapterOne, parentId: bookId });
  assert.deepEqual(order(), ['Three', 'Two', 'Chapter 1']);

  space.closeProject();
  space.openProject(id);
  assert.deepEqual(order(), ['Three', 'Two', 'Chapter 1']);
});

test('a move can go between two rows forever', () => {
  const { space, bookId, add, chapterOne } = book();
  const two = add('chapter', 'Two');
  const three = add('chapter', 'Three');
  for (let tries = 0; tries < 200; tries += 1) {
    const [, middle, last] = findNode(space.outline(), bookId).children;
    space.move({ id: last.id, parentId: bookId, beforeId: middle.id });
  }
  const ids = findNode(space.outline(), bookId).children.map((child) => child.id);
  assert.equal(ids[0], chapterOne);
  assert.deepEqual([...ids].sort(), [chapterOne, two, three].sort());
});

test('a chapter can move into and out of a part, and to another book', () => {
  const { space, id, bookId, add, chapterOne } = book();
  const part = add('part', 'Part One');
  space.move({ id: chapterOne, parentId: part });
  assert.deepEqual(titles(findNode(space.outline(), part)), ['Chapter 1']);
  const other = add('book', 'Second', id);
  space.move({ id: chapterOne, parentId: other });
  assert.deepEqual(titles(findNode(space.outline(), other)), ['Chapter 1']);
  assert.deepEqual(titles(findNode(space.outline(), part)), []);
});

function tree() {
  const node = (id, kind, ...children) => ({ id, kind, title: id, words: 0, children });
  return node('project', 'project',
    node('series', 'series', node('b1', 'book')),
    node('b2', 'book',
      node('p1', 'part', node('c1', 'chapter'), node('c2', 'chapter')),
      node('p2', 'part'),
      node('c3', 'chapter')));
}

test('a drop lands where a writer expects', () => {
  const root = tree();
  assert.deepEqual(resolveDrop(root, 'c2', 'c1', 'before'), { parentId: 'p1', beforeId: 'c1' });
  assert.deepEqual(resolveDrop(root, 'c1', 'c2', 'after'), { parentId: 'p1', beforeId: null });
  assert.deepEqual(resolveDrop(root, 'c3', 'c1', 'after'), { parentId: 'p1', beforeId: 'c2' });
  assert.deepEqual(resolveDrop(root, 'c3', 'p2', 'into'), { parentId: 'p2', beforeId: null });
  assert.deepEqual(resolveDrop(root, 'c1', 'b1', 'after'), { parentId: 'b1', beforeId: null });
  assert.deepEqual(resolveDrop(root, 'p2', 'c1', 'after'), { parentId: 'b2', beforeId: 'c3' });
  assert.deepEqual(resolveDrop(root, 'b2', 'b1', 'after'), { parentId: 'series', beforeId: null });
  assert.equal(resolveDrop(root, 'c1', 'series', 'into'), null);
  assert.equal(resolveDrop(root, 'p1', 'c1', 'into'), null, 'not inside itself');
  assert.equal(resolveDrop(root, 'p1', 'p1', 'before'), null);
});

test('a step moves one place and stops at the ends', () => {
  const root = tree();
  assert.deepEqual(resolveStep(root, 'c1', 1), { parentId: 'p1', beforeId: null });
  assert.deepEqual(resolveStep(root, 'c2', -1), { parentId: 'p1', beforeId: 'c1' });
  assert.deepEqual(resolveStep(root, 'p1', 1), { parentId: 'b2', beforeId: 'c3' });
  assert.equal(resolveStep(root, 'c1', -1), null);
  assert.equal(resolveStep(root, 'c2', 1), null);
});

test('only empty things can be removed', () => {
  const { space, bookId, add, chapterOne } = book();
  const part = add('part', 'Part One');
  const inPart = add('chapter', 'In the part', part);
  space.saveChapter({ id: inPart, title: 'In the part', body: body('some writing') });
  assert.throws(() => space.removeEmpty(inPart), /stays until Trash/);
  assert.throws(() => space.removeEmpty(part), /stays until Trash/);
  assert.throws(() => space.removeEmpty(bookId), /stays until Trash/);
  assert.throws(() => space.removeEmpty(space.project.id), /can't be removed/);

  const outline = space.removeEmpty(chapterOne);
  assert.equal(findNode(outline, chapterOne), null);
  assert.ok(space.project.removalMarkers().some((row) => row.itemId === chapterOne));
});

test('the window can only save chapters, and only real documents', () => {
  const { space, bookId, chapterOne } = book();
  assert.throws(() => space.saveChapter({ id: bookId, title: 'x', body: '' }), /isn't a chapter/);
  assert.throws(() => space.saveChapter({ id: 'nope', title: 'x', body: '' }), /isn't in this project/);
  assert.throws(() => space.saveChapter({ id: chapterOne, title: 'x', body: 'not a document' }), /can't be saved/);
  assert.throws(() => space.saveChapter({ id: chapterOne, title: 'x', body: 12 }), /can't be saved/);
  assert.equal(space.saveChapter({ id: chapterOne, title: '', body: body('kept title') }).words, 2);
  assert.equal(space.loadChapter(chapterOne).title, 'Chapter 1');
});

test('nothing works without an open project', () => {
  const space = workspace();
  assert.throws(() => space.outline(), /No project is open/);
  assert.throws(() => space.saveChapter({ id: 'x', title: 'x', body: '' }), /No project is open/);
});

test('the sample has a book to read and can be removed', () => {
  const space = workspace();
  const { id, outline } = space.createSample();
  assert.equal(outline.children[0].children.length, 2);
  assert.ok(outline.words > 100);
  const listed = space.listProjects().find((item) => item.id === id);
  assert.equal(listed.sample, true);

  const real = space.createProject('Real').id;
  assert.throws(() => space.removeSample(real), /Only the sample/);
  space.removeSample(id);
  assert.deepEqual(space.listProjects().map((item) => item.id), [real]);
});

test('a project from step zero gets its word counts on opening', () => {
  const space = workspace();
  const { library } = space;
  const id = library.createProject('Old');
  const project = library.openProject(id);
  project.putItem({ id: 'old-chapter', kind: 'chapter', parentId: id, body: body('three old words') });
  project.db.exec('ALTER TABLE items DROP COLUMN words');
  project.db.pragma('user_version = 1');
  project.close();

  const opened = library.openProject(id);
  assert.equal(opened.getItem('old-chapter').words, 3);
  assert.equal(opened.db.pragma('user_version', { simple: true }), STEPS.at(-1).version);
  assert.equal(fs.readdirSync(path.join(library.projectDir(id), 'backups')).length, 1);
  opened.close();
});

function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map();
  return {
    setTimeout(fn, ms) {
      pending.set(next, { fn, at: now + ms });
      return next++;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await new Promise(setImmediate);
      }
      now = end;
    },
  };
}

function saver(write = async () => {}) {
  const timers = fakeTimers();
  const log = { writes: [], states: [] };
  let value = 0;
  const instance = new Saver({
    timers,
    read: () => value,
    write: async (payload) => {
      log.writes.push(payload);
      await write(payload);
    },
    onState: (state) => log.states.push(state),
  });
  return { timers, log, instance, type: () => { value += 1; instance.touch(); } };
}

test('a pause in the typing saves it', async () => {
  const { timers, log, type } = saver();
  type();
  await timers.advance(QUIET_MS - 1);
  assert.deepEqual(log.writes, []);
  await timers.advance(1);
  assert.deepEqual(log.writes, [1]);
  assert.equal(log.states.at(-1), 'saved');
});

test('steady typing still saves every few seconds', async () => {
  const { timers, log, type } = saver();
  for (let elapsed = 0; elapsed < LONGEST_MS; elapsed += 500) {
    type();
    await timers.advance(500);
  }
  assert.equal(log.writes.length, 1);
});

test('typing during a save is saved too, in order', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const first = saver(() => held);
  first.type();
  await first.timers.advance(QUIET_MS);
  first.type();
  const flushing = first.instance.flush();
  release();
  await flushing;
  assert.deepEqual(first.log.writes, [1, 2]);
  assert.equal(first.instance.dirty, false);
});

test('a failed save stays unsaved, says so and tries again', async () => {
  let fail = true;
  const { timers, log, instance, type } = saver(async () => {
    if (fail) throw new Error('Disk full');
  });
  type();
  await timers.advance(QUIET_MS);
  assert.equal(log.states.at(-1), 'failed');
  assert.equal(instance.dirty, true);
  await assert.rejects(instance.flush(), /Disk full/);

  fail = false;
  await timers.advance(RETRY_MS);
  assert.equal(log.states.at(-1), 'saved');
  assert.equal(instance.dirty, false);
});

test('a flush saves straight away and has nothing to do when clean', async () => {
  const { log, instance, type } = saver();
  await instance.flush();
  assert.deepEqual(log.writes, []);
  type();
  await instance.flush();
  assert.deepEqual(log.writes, [1]);
});

test('word counts come from the database encrypted like everything else', () => {
  const space = workspace();
  const { id, outline } = space.createProject('Secret');
  const chapter = outline.children[0].children[0].id;
  space.saveChapter({ id: chapter, title: 'Chapter 1', body: body('FindMeInTheFile') });
  space.closeProject();
  const dir = space.library.projectDir(id);
  const data = fs.readFileSync(path.join(dir, 'project.db'));
  assert.ok(!data.includes(Buffer.from('FindMeInTheFile')));
  const db = openDatabase(path.join(dir, 'project.db'), openWithAppSlot(dir));
  assert.equal(migrate(db, path.join(dir, 'project.db')).backup, null);
  db.close();
});
