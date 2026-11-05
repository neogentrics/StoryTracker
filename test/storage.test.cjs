'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DATABASE_FILE, Library } = require('../src/main/storage/library');
const { WrongKeyError, migrate, openDatabase } = require('../src/main/storage/database');
const { STEPS } = require('../src/main/storage/schema');
const { addSlot, createKeys, listSlots, openWithAppSlot, openWithSlot, removeSlot } = require('../src/main/storage/keys');

const LATEST = STEPS.at(-1).version;
const tempDirs = [];

// Removed once every test is over, because Windows won't delete a database that's still open.
test.after(() => tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })));

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-test-'));
  tempDirs.push(dir);
  return dir;
}

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function setup(t, options) {
  const library = new Library(path.join(tempDir(), 'library'), options);
  const id = library.createProject('My Book');
  const project = library.openProject(id);
  t.after(() => project.db.open && project.close());
  return { library, id, project };
}

test('a project keeps its title, and a new library has no leftovers', (t) => {
  const { library, id, project } = setup(t);
  assert.equal(project.title(), 'My Book');
  project.close();
  const [listed] = library.listProjects();
  assert.deepEqual([listed.id, listed.state, listed.title, listed.words], [id, 'ready', 'My Book', 0]);
  assert.deepEqual(fs.readdirSync(library.projectsDir), [id]);
});

test('every item gets a permanent random ID that survives edits and moves', (t) => {
  const { id, project } = setup(t);
  const chapter = project.putItem({ kind: 'chapter', parentId: id, title: 'One' });
  assert.match(chapter.id, /^[0-9a-f-]{36}$/);
  const moved = project.putItem({ id: chapter.id, parentId: 'another-book', title: 'Renamed' });
  assert.equal(moved.id, chapter.id);
  assert.equal(moved.createdAt, chapter.createdAt);
});

test('the change log says which fields changed, on which device', (t) => {
  const { library, id, project } = setup(t);
  const start = project.changesSince(0).at(-1).seq;
  const chapter = project.putItem({ kind: 'chapter', parentId: id, title: 'One', body: 'Text' });
  project.putItem({ id: chapter.id, body: 'More text' });
  project.putItem({ id: chapter.id, body: 'More text' });
  const changes = project.changesSince(start);
  assert.equal(changes.length, 2, 'saving the same text twice logs nothing');
  assert.deepEqual(changes[1].fields, ['body']);
  assert.equal(changes[1].deviceId, library.deviceId);
  assert.deepEqual(project.changesSince(changes[1].seq), []);
});

test('a removal covers everything under the item and leaves markers', (t) => {
  const { id, project } = setup(t);
  const book = project.putItem({ kind: 'book', parentId: id });
  const chapter = project.putItem({ kind: 'chapter', parentId: book.id });
  assert.equal(project.removeItem(book.id), 2);
  assert.equal(project.getItem(chapter.id), null);
  assert.deepEqual(project.removalMarkers().map((row) => row.itemId).sort(), [book.id, chapter.id].sort());
  assert.throws(() => project.putItem({ id: chapter.id, kind: 'chapter' }), /removed/);
  assert.equal(project.changesSince(0).filter((row) => row.op === 'remove').length, 2);
});

test('removal markers last 90 days', (t) => {
  let clock = new Date('2026-01-01T00:00:00Z');
  const { id, project } = setup(t, { now: () => clock });
  const chapter = project.putItem({ kind: 'chapter', parentId: id });
  project.removeItem(chapter.id);
  clock = new Date('2026-03-31T00:00:00Z');
  assert.equal(project.pruneRemovalMarkers(), 0);
  clock = new Date('2026-04-02T00:00:00Z');
  assert.equal(project.pruneRemovalMarkers(), 1);
});

test('children come back in order', (t) => {
  const { id, project } = setup(t);
  const second = project.putItem({ kind: 'chapter', parentId: id, position: 2 });
  const first = project.putItem({ kind: 'chapter', parentId: id, position: 1 });
  assert.deepEqual(project.listChildren(id).map((item) => item.id), [first.id, second.id]);
});

test('no file in the library contains the writing, open or closed', (t) => {
  const { library, id, project } = setup(t);
  const word = `Hidden${crypto.randomBytes(6).toString('hex')}`;
  const chapter = project.putItem({ kind: 'chapter', parentId: id, title: word, body: `${word} `.repeat(5000) });
  project.putItem({ id: chapter.id, body: `${word} again` });
  const leaks = () => filesUnder(library.root).filter((file) => fs.readFileSync(file).includes(word));
  assert.deepEqual(leaks(), [], 'while open');
  project.backupTo(path.join(library.projectDir(id), 'backups', 'copy.db'));
  project.close();
  assert.deepEqual(leaks(), [], 'once closed');
});

test('a backup is encrypted and opens with the same key', (t) => {
  const { library, id, project } = setup(t);
  project.putItem({ id: 'kept', kind: 'note', parentId: id, body: 'Kept' });
  const copy = path.join(library.projectDir(id), 'backups', 'copy.db');
  project.backupTo(copy);
  project.close();
  assert.notEqual(fs.readFileSync(copy).subarray(0, 13).toString(), 'SQLite format');
  const db = openDatabase(copy, openWithAppSlot(library.projectDir(id)));
  t.after(() => db.close());
  assert.equal(db.prepare('SELECT body FROM items WHERE id = ?').get('kept').body, 'Kept');
});

test('the wrong key is refused and the file is left alone', (t) => {
  const { library, id, project } = setup(t);
  project.close();
  const file = path.join(library.projectDir(id), DATABASE_FILE);
  const before = fs.readFileSync(file);
  assert.throws(() => openDatabase(file, crypto.randomBytes(32)), WrongKeyError);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('a second slot opens the same project, and the last slot can\'t be removed', (t) => {
  const dir = tempDir();
  const projectKey = createKeys(dir, 'project-1');
  const spare = crypto.randomBytes(32);
  addSlot(dir, projectKey, 'recovery', spare, { label: 'kept with details' });
  assert.deepEqual(openWithSlot(dir, 'recovery', spare), projectKey);
  assert.equal(openWithSlot(dir, 'recovery', crypto.randomBytes(32)), null);

  const [appSlot, recovery] = listSlots(dir);
  removeSlot(dir, appSlot.id);
  assert.equal(openWithAppSlot(dir), null, 'a password will remove the app slot, so it has to really go');
  assert.deepEqual(openWithSlot(dir, 'recovery', spare), projectKey);
  assert.throws(() => removeSlot(dir, recovery.id), /at least one way in/);
});

test('a slot can\'t be moved onto another project', (t) => {
  const dir = tempDir();
  createKeys(dir, 'project-1');
  const file = path.join(dir, 'keys.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.projectId = 'project-2';
  fs.writeFileSync(file, JSON.stringify(data));
  assert.equal(openWithAppSlot(dir), null);
});

test('a project with no app slot shows as locked and needs its key', (t) => {
  const { library, id, project } = setup(t);
  project.close();
  const dir = library.projectDir(id);
  const projectKey = openWithAppSlot(dir);
  addSlot(dir, projectKey, 'password', crypto.randomBytes(32));
  removeSlot(dir, listSlots(dir).find((slot) => slot.type === 'app').id);
  assert.deepEqual(library.listProjects(), [{ id, state: 'locked', title: null }]);
  assert.throws(() => library.openProject(id), /locked/);
  const opened = library.openProject(id, projectKey);
  t.after(() => opened.close());
  assert.equal(opened.title(), 'My Book');
});

test('a damaged project is reported and doesn\'t stop the library', (t) => {
  const { library, id, project } = setup(t);
  project.close();
  const good = library.createProject('Good');
  fs.writeFileSync(path.join(library.projectDir(id), 'keys.json'), 'not json');
  const states = Object.fromEntries(library.listProjects().map((item) => [item.id, item.state]));
  assert.deepEqual(states, { [id]: 'damaged', [good]: 'ready' });
});

test('a half-made project is ignored', (t) => {
  const { library, id } = setup(t);
  fs.mkdirSync(path.join(library.projectsDir, '.new-crashed'));
  assert.deepEqual(library.listProjects().map((item) => item.id), [id]);
});

test('the device ID stays the same between runs', (t) => {
  const root = path.join(tempDir(), 'library');
  assert.equal(new Library(root).deviceId, new Library(root).deviceId);
});

test('a new table step backs up first, then keeps the data', (t) => {
  const { library, id, project } = setup(t);
  project.putItem({ id: 'kept', kind: 'note', parentId: id, body: 'Kept' });
  const steps = [...STEPS, { version: LATEST + 1, up: (db) => db.exec('CREATE TABLE extra (id TEXT)') }];
  const result = migrate(project.db, project.file, { steps });
  assert.deepEqual([result.from, result.to], [LATEST, LATEST + 1]);
  assert.ok(fs.existsSync(result.backup));
  project.close();

  const backup = openDatabase(result.backup, openWithAppSlot(library.projectDir(id)));
  t.after(() => backup.close());
  assert.equal(backup.pragma('user_version', { simple: true }), LATEST);
  assert.equal(backup.prepare('SELECT body FROM items WHERE id = ?').get('kept').body, 'Kept');
});

test('a failed step changes nothing', (t) => {
  const { id, project } = setup(t);
  project.putItem({ id: 'kept', kind: 'note', parentId: id });
  const steps = [
    ...STEPS,
    {
      version: LATEST + 1,
      up(db) {
        db.exec('CREATE TABLE half_done (id TEXT)');
        throw new Error('Step failed');
      },
    },
  ];
  assert.throws(() => migrate(project.db, project.file, { steps }), /Step failed/);
  assert.equal(project.db.pragma('user_version', { simple: true }), LATEST);
  assert.equal(project.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'half_done'").get().n, 0);
  assert.ok(project.getItem('kept'));
});

test('a project from a newer app is left alone', (t) => {
  const { library, id, project } = setup(t);
  project.db.pragma('user_version = 99');
  project.close();
  assert.throws(() => library.openProject(id), /newer version/);
  assert.equal(library.listProjects()[0].state, 'damaged');
});
