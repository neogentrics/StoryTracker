'use strict';
// App Link and the inbox. A second AppLink plays RT Markdown Reader, under its id, so the real wire format is in use.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { AppLink, LinkError, call, cleanName, documentName, endpointFor, sharedFolder, validEndpoint } = require('../src/main/app-link');
const { Inbox, isWritingFile } = require('../src/main/inbox');
const { Linking, launchReader, readerPlaces } = require('../src/main/linking');
const { Security } = require('../src/main/security');
const { Workspace } = require('../src/main/workspace');
const { Library } = require('../src/main/storage/library');
const { TrustedComputer } = require('../src/main/storage/trusted');
const { cleanSettings } = require('../src/shared/themes');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const fakeVault = (available = true) => ({
  available: () => available,
  seal: (text) => Buffer.from([...Buffer.from(text)].map((byte) => byte ^ 0x5a)),
  open: (data) => Buffer.from([...data].map((byte) => byte ^ 0x5a)).toString(),
});

function setUp(t, { vault = fakeVault(), on = true, ask = async () => true, places, launch } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-link-'));
  const root = path.join(dir, 'library');
  const tempDir = path.join(dir, 'temp');
  const folder = path.join(dir, 'shared');
  fs.mkdirSync(tempDir);
  const workspace = new Workspace(new Library(root));
  const settings = { values: cleanSettings({ appLink: on }), save(changes) { this.values = cleanSettings({ ...this.values, ...changes }); return this.values; } };
  const changes = [];
  const inbox = new Inbox({ onChange: (change) => changes.push(change) });
  const previous = process.env.NMR_LINK_DIR;
  process.env.NMR_LINK_DIR = folder;
  const linking = new Linking({
    workspace, settings, vault, inbox, root, tempDir, ask,
    home: dir,
    dataDir: dir,
    version: '3.7.0',
    ...(places ? { places } : {}),
    ...(launch ? { launch } : {}),
  });
  const peers = [];
  t.after(async () => {
    for (const peer of peers) await peer.stop();
    await linking.close();
    workspace.closeProject();
    if (previous === undefined) delete process.env.NMR_LINK_DIR;
    else process.env.NMR_LINK_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  const peer = async ({ ask: peerAsk = async () => true } = {}) => {
    let links = {};
    const documents = [];
    fs.mkdirSync(path.join(dir, 'reader'), { recursive: true });
    const app = new AppLink({
      folder,
      dataDir: path.join(dir, 'reader'),
      version: '3.9.0',
      id: 'rt-markdown-reader',
      name: 'RT Markdown Reader',
      load: () => ({ ...links }),
      save: (saved) => { links = saved; },
      ask: peerAsk,
      open: async (document) => documents.push(document),
    });
    await app.start();
    peers.push(app);
    return { app, documents };
  };
  return { dir, root, tempDir, folder, workspace, settings, inbox, linking, changes, peer };
}

function project(space) {
  const { id, outline } = space.workspace.createProject('A Book');
  const book = outline.children[0];
  const chapter = book.children[0];
  space.workspace.saveChapter({ id: chapter.id, title: 'First', body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'It began here.' }] }] }) });
  return { id, book, chapter };
}

test('App Link stays off until it’s turned on, and leaves nothing behind when turned off', async (t) => {
  const space = setUp(t, { on: false });
  await space.linking.apply();
  assert.equal(fs.existsSync(path.join(space.folder, 'rt-story-tracker.json')), false);
  await space.linking.setOn(true);
  const info = JSON.parse(fs.readFileSync(path.join(space.folder, 'rt-story-tracker.json'), 'utf8'));
  assert.deepEqual([info.protocol, info.id, info.name, info.version], [1, 'rt-story-tracker', 'RT Story Tracker', '3.7.0']);
  assert.equal(validEndpoint(info.endpoint), true);
  assert.deepEqual(await call(info.endpoint, 'hello', {}), { protocol: 1, app: 'rt-story-tracker', name: 'RT Story Tracker', version: '3.7.0', accepts: ['markdown', 'text'] });
  await space.linking.setOn(false);
  assert.equal(fs.existsSync(path.join(space.folder, 'rt-story-tracker.json')), false);
  assert.equal(space.settings.values.appLink, false);
});

test('a document sent over a link waits in the inbox, and nothing is filed by itself', async (t) => {
  const space = setUp(t);
  await space.linking.apply();
  const { book } = project(space);
  const { app } = await space.peer();
  await app.pairWith('rt-story-tracker');
  assert.equal((await space.linking.status()).apps[0].linked, true);

  await app.send('rt-story-tracker', { name: 'Chapter 12.md', text: '# Chapter 12\n\nThe tide came in.\n' });
  const [item] = space.inbox.list();
  assert.deepEqual([item.from, item.name, item.words], ['RT Markdown Reader', 'Chapter 12.md', 6]);
  assert.deepEqual(space.changes, [{ arrived: true }]);
  assert.equal(space.workspace.outline().children[0].children.length, 1, 'still only the chapter that was there');

  const added = await space.inbox.add(space.workspace, { id: item.id, bookId: book.id, mode: 'none' });
  assert.equal(added.chapters, 1);
  const chapter = space.workspace.outline().children[0].children.at(-1);
  assert.equal(chapter.title, 'Chapter 12');
  assert.match(space.workspace.loadChapter(chapter.id).body, /The tide came in/);
  assert.deepEqual(space.inbox.list(), []);
});

test('a link takes the person’s yes, and a wrong key gets nowhere', async (t) => {
  const space = setUp(t, { ask: async () => false });
  await space.linking.apply();
  const { app } = await space.peer();
  await assert.rejects(app.pairWith('rt-story-tracker'), (error) => error.code === 'declined');
  await assert.rejects(app.pairWith('rt-story-tracker'), (error) => error.code === 'declined', 'it can’t keep asking');
  const { endpoint } = JSON.parse(fs.readFileSync(path.join(space.folder, 'rt-story-tracker.json'), 'utf8'));
  await assert.rejects(call(endpoint, 'open_document', { app: 'rt-markdown-reader', key: 'guess', text: 'hi' }), (error) => error.code === 'not_linked');
  await assert.rejects(call(endpoint, 'open_document', { app: '__proto__', key: 'guess', text: 'hi' }), (error) => error.code === 'not_linked');
  await assert.rejects(call(endpoint, 'nonsense', {}), (error) => error.code === 'unknown_method');
  assert.deepEqual(space.inbox.list(), []);
});

test('links from before the new App Link id are dropped, so they can be made again', (t) => {
  const space = setUp(t);
  fs.writeFileSync(path.join(space.root, 'links.bin'), 'old');
  new Linking({ workspace: space.workspace, settings: space.settings, vault: fakeVault(), inbox: space.inbox, root: space.root, tempDir: space.tempDir, home: space.dir, dataDir: space.dir, version: '3.7.1' });
  assert.equal(fs.existsSync(path.join(space.root, 'links.bin')), false);
});

test('a key is sealed, and with nowhere safe it lasts until the app closes', async (t) => {
  const space = setUp(t);
  await space.linking.apply();
  const { app } = await space.peer();
  await app.pairWith('rt-story-tracker');
  const { key } = space.linking.load()['rt-markdown-reader'];
  assert.equal(fs.readFileSync(path.join(space.root, 'app-links.bin')).includes(key), false);

  const bare = setUp(t, { vault: fakeVault(false) });
  bare.linking.save({ somebody: { name: 'Some App', key } });
  assert.equal(fs.existsSync(path.join(bare.root, 'app-links.bin')), false);
  assert.equal(bare.linking.load().somebody.key, key);
});

test('removing a link ends it on both sides', async (t) => {
  const space = setUp(t);
  await space.linking.apply();
  const { app } = await space.peer();
  await app.pairWith('rt-story-tracker');
  await space.linking.unlink('rt-markdown-reader');
  assert.deepEqual(space.linking.load(), {});
  assert.deepEqual(app.load(), {});
});

test('a linked app can ask to send a file by its path, but only writing', async (t) => {
  const space = setUp(t);
  const inbox = new Inbox();
  const file = path.join(space.dir, 'Notes.txt');
  fs.writeFileSync(file, 'One line.\n\nAnother line.\n');
  inbox.take({ from: 'RT Markdown Reader', path: file });
  fs.writeFileSync(file, 'Changed afterwards.');
  assert.equal(inbox.list()[0].words, 4, 'it holds the words as they were sent');

  const refused = (name, code) => {
    const full = path.join(space.dir, name);
    assert.throws(() => inbox.take({ from: 'x', path: full }), (error) => error instanceof LinkError && error.code === code);
  };
  refused('secret.mdlock', 'not_allowed');
  refused('project.db', 'not_allowed');
  refused('missing.md', 'not_found');
  fs.mkdirSync(path.join(space.dir, 'folder.md'));
  refused('folder.md', 'not_found');
  fs.writeFileSync(path.join(space.dir, 'huge.md'), Buffer.alloc(9 * 1024 * 1024, 97));
  refused('huge.md', 'not_allowed');
  assert.equal(isWritingFile('C:\\a\\b.MD'), true);
  assert.equal(isWritingFile('C:\\a\\b.rtstory'), false);
});

test('the inbox can’t be flooded, and names are made safe', () => {
  const inbox = new Inbox();
  for (let at = 0; at < 20; at += 1) inbox.take({ from: 'x', name: 'a.md', text: 'words' });
  assert.throws(() => inbox.take({ from: 'x', name: 'a.md', text: 'words' }), (error) => error.code === 'busy');
  assert.equal(cleanName('Safe\u202e\u0007 Name'), 'Safe Name');
  assert.equal(documentName('..\\..\\Windows\\evil'), 'evil.md');
  assert.equal(documentName(null), 'Sent document.md');
});

test('a document with several chapters can come in as several, and into a new book', async (t) => {
  const space = setUp(t);
  project(space);
  space.inbox.take({ from: 'RT Markdown Reader', name: 'Draft.md', text: '# One\n\nFirst words.\n\n# Two\n\nSecond words.\n' });
  const [item] = space.inbox.list();
  assert.equal(item.options[0].mode, 'h1');
  const added = await space.inbox.add(space.workspace, { id: item.id, bookId: null, mode: 'h1' });
  assert.equal(added.chapters, 2);
  const made = space.workspace.outline().children.at(-1);
  assert.equal(made.title, 'Draft');
  assert.deepEqual(made.children.map((node) => node.title), ['One', 'Two']);
});

test('plain text stays plain, and a failed add keeps the document waiting', async (t) => {
  const space = setUp(t);
  project(space);
  space.inbox.take({ from: 'x', name: 'Notes.txt', text: '# not a heading\n\nJust words.' });
  const [item] = space.inbox.list();
  await assert.rejects(space.inbox.add(space.workspace, { id: item.id, bookId: 'no-such-book', mode: 'none' }));
  assert.equal(space.inbox.list().length, 1);
  const added = await space.inbox.add(space.workspace, { id: item.id, bookId: null, mode: 'none' });
  assert.match(space.workspace.loadChapter(added.first).body, /# not a heading/);
});

test('pictures come too, when they’re pictures', async (t) => {
  const space = setUp(t);
  const { book } = project(space);
  const picture = path.join(space.dir, 'map.png');
  fs.writeFileSync(picture, PNG);
  const elsewhere = path.join(space.dir, 'passwords.txt');
  fs.writeFileSync(elsewhere, 'secret');
  space.inbox.take({
    from: 'RT Markdown Reader',
    name: 'Chapter.md',
    text: 'Words.',
    attachments: [{ name: 'map.png', path: picture }, { name: 'nice.png', path: elsewhere }, { name: 'relative.png', path: 'map.png' }, 'nonsense', null],
  });
  const [item] = space.inbox.list();
  assert.equal(item.pictures, 1);
  await space.inbox.add(space.workspace, { id: item.id, bookId: book.id, mode: 'none' });
  const kept = space.workspace.listAttachments(book.id);
  assert.deepEqual(kept.map((entry) => entry.name), ['map.png']);
  assert.deepEqual(await space.workspace.open().attachments.read(space.workspace.open().attachment(kept[0].id).file), PNG);
});

test('a document waits for a locked project, in memory, and goes in after the password', async (t) => {
  const space = setUp(t);
  const { id, book } = project(space);
  const trusted = new TrustedComputer(space.root, fakeVault());
  const security = new Security({ workspace: space.workspace, trusted });
  security.makeRecovery();
  await security.setPassword({ password: 'a long enough password' });
  space.workspace.closeProject();

  await space.linking.apply();
  const { app } = await space.peer();
  await app.pairWith('rt-story-tracker');
  await app.send('rt-story-tracker', { name: 'Late.md', text: 'Waiting words.' });
  const onDisk = fs.readdirSync(space.root, { recursive: true }).filter((name) => {
    const full = path.join(space.root, String(name));
    return fs.statSync(full).isFile() && fs.readFileSync(full).includes('Waiting words');
  });
  assert.deepEqual(onDisk, []);
  await assert.rejects(space.inbox.add(space.workspace, { id: space.inbox.list()[0].id, bookId: null, mode: 'none' }), /No project is open/);
  assert.equal(space.inbox.list().length, 1);

  await security.unlock({ id, how: 'password', secret: 'a long enough password' });
  await space.inbox.add(space.workspace, { id: space.inbox.list()[0].id, bookId: book.id, mode: 'none' });
  assert.match(space.workspace.loadChapter(space.workspace.outline().children[0].children.at(-1).id).body, /Waiting words/);
});

test('a chapter or a book opens over the link as Markdown', async (t) => {
  const space = setUp(t, { places: () => [] });
  await space.linking.apply();
  const { book, chapter } = project(space);
  const { app, documents } = await space.peer();
  await space.linking.pair('rt-markdown-reader');
  assert.deepEqual(await space.linking.openInReader({ scope: 'chapter', id: chapter.id }), { how: 'link' });
  assert.equal(documents[0].from, 'RT Story Tracker');
  assert.equal(documents[0].name, 'First.md');
  assert.match(documents[0].text, /It began here\./);
  await space.linking.openInReader({ scope: 'book', id: book.id });
  assert.equal(documents[1].name, 'A Book.md');
  assert.equal(app.running, true);
  assert.deepEqual(fs.readdirSync(space.tempDir), [], 'nothing is left on disk');
});

test('with no link it goes through the system, and starts the app', async (t) => {
  const launched = [];
  const reader = path.join(os.tmpdir(), `rtst-fake-reader-${process.pid}`);
  fs.writeFileSync(reader, '');
  t.after(() => fs.rmSync(reader, { force: true }));
  const space = setUp(t, { on: false, places: () => ['/no/such/place', reader], launch: (app, file) => launched.push([app, file]) });
  const { chapter } = project(space);
  assert.deepEqual(await space.linking.openInReader({ scope: 'chapter', id: chapter.id }), { how: 'system' });
  const [[app, file]] = launched;
  assert.equal(app, reader);
  assert.equal(path.basename(file), 'First.md');
  assert.match(fs.readFileSync(file, 'utf8'), /It began here\./);
  await space.linking.close();
  assert.equal(fs.existsSync(file), false, 'the copy goes when the app closes');
});

test('a plain copy goes as soon as the project is locked', async (t) => {
  const launched = [];
  const reader = path.join(os.tmpdir(), `rtst-fake-reader-lock-${process.pid}`);
  fs.writeFileSync(reader, '');
  t.after(() => fs.rmSync(reader, { force: true }));
  const space = setUp(t, { on: false, places: () => [reader], launch: (app, file) => launched.push(file) });
  const { chapter } = project(space);
  await space.linking.openInReader({ scope: 'chapter', id: chapter.id });
  const security = new Security({ workspace: space.workspace, trusted: new TrustedComputer(space.root, fakeVault()), onLocked: () => space.linking.clearSent() });
  security.makeRecovery();
  await security.setPassword({ password: 'a long enough password' });
  assert.equal(fs.existsSync(launched[0]), false);
});

test('leftover copies are swept at the next start, and only this app’s', (t) => {
  const space = setUp(t);
  fs.mkdirSync(path.join(space.tempDir, 'rtst-send-0123456789abcdef'));
  fs.mkdirSync(path.join(space.tempDir, 'something-else'));
  new Linking({ workspace: space.workspace, settings: space.settings, vault: fakeVault(), inbox: space.inbox, root: space.root, tempDir: space.tempDir, home: space.dir, dataDir: space.dir, version: '3.7.0' });
  assert.deepEqual(fs.readdirSync(space.tempDir), ['something-else']);
});

test('when RT Markdown Reader can’t be found it says so', async (t) => {
  const space = setUp(t, { on: false, places: () => ['/no/such/place'] });
  const { chapter } = project(space);
  await assert.rejects(space.linking.openInReader({ scope: 'chapter', id: chapter.id }), /isn’t on this computer/);
});

test('a locked project is never sent, by either road', async (t) => {
  const launched = [];
  const space = setUp(t, { places: () => [process.execPath], launch: (app, file) => launched.push(file) });
  await space.linking.apply();
  const { chapter } = project(space);
  const { documents } = await space.peer();
  await space.linking.pair('rt-markdown-reader');
  const security = new Security({ workspace: space.workspace, trusted: new TrustedComputer(space.root, fakeVault()) });
  security.makeRecovery();
  await security.setPassword({ password: 'a long enough password' });
  await assert.rejects(space.linking.openInReader({ scope: 'chapter', id: chapter.id }), /never sent/);
  assert.deepEqual(documents, []);
  assert.deepEqual(launched, []);
  assert.deepEqual(fs.readdirSync(space.tempDir), []);
});

test('only a chapter or a book can be sent', async (t) => {
  const space = setUp(t, { on: false });
  const { id, chapter } = project(space);
  await assert.rejects(space.linking.openInReader({ scope: 'project', id }), /chapter or a book/);
  await assert.rejects(space.linking.openInReader({ scope: 'book', id: chapter.id }), /chapter or a book/);
  await assert.rejects(space.linking.openInReader({ scope: 'chapter', id: 'nothing' }), /chapter or a book/);
});

test('the places to look are right for each system', () => {
  const windows = readerPlaces({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, home: 'C:\\Users\\a' });
  assert.ok(windows.some((place) => place.endsWith(path.join('Programs', 'neo-markdown-reader', 'RT Markdown Reader.exe'))));
  assert.ok(readerPlaces({ platform: 'darwin', env: {}, home: '/Users/a' }).includes('/Applications/RT Markdown Reader.app'));
  assert.deepEqual(readerPlaces({ env: { RTST_READER_APP: '/here' } }), ['/here']);
  const calls = [];
  const start = (...args) => { calls.push(args); return { unref() {} }; };
  launchReader('/Applications/RT Markdown Reader.app', '/tmp/a.md', { platform: 'darwin', start });
  launchReader('C:\\app.exe', 'C:\\a.md', { platform: 'win32', start });
  assert.deepEqual(calls.map(([command, args]) => [command, args]), [['open', ['-a', '/Applications/RT Markdown Reader.app', '/tmp/a.md']], ['C:\\app.exe', ['C:\\a.md']]]);
});

test('an endpoint can’t be a network address', () => {
  assert.equal(validEndpoint('\\\\.\\pipe\\rt-app-link-abc', 'win32'), true);
  assert.equal(validEndpoint('\\\\server\\pipe\\x', 'win32'), false);
  assert.equal(validEndpoint('127.0.0.1:80', 'win32'), false);
  assert.equal(validEndpoint('relative/path', 'linux'), false);
  assert.equal(sharedFolder({ env: {}, platform: 'darwin', home: '/Users/a' }), path.join('/Users/a', 'Library', 'Application Support', 'Recon Towers', 'app-link'));
  assert.ok(endpointFor('C:\\Data', 'win32').startsWith('\\\\.\\pipe\\rt-app-link-'));
});

test('a line that’s too long is cut off, and garbage ends the connection', async (t) => {
  const space = setUp(t);
  await space.linking.apply();
  const { endpoint } = JSON.parse(fs.readFileSync(path.join(space.folder, 'rt-story-tracker.json'), 'utf8'));
  await new Promise((resolve) => {
    const sock = net.connect(endpoint);
    sock.on('connect', () => sock.write('not json\n'));
    sock.on('error', resolve);
    sock.on('close', resolve);
  });
  assert.equal((await call(endpoint, 'hello', {})).app, 'rt-story-tracker');
});
