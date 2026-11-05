'use strict';
// The lock. Every way in, every wrong answer, and the search for words that shouldn't be findable.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Backups } = require('../src/main/backups');
const { Security } = require('../src/main/security');
const { cleanSettings } = require('../src/shared/themes');
const { Workspace } = require('../src/main/workspace');
const { makeRecoveryKey, openWithAppSlot, openWithPassword, openWithRecovery, passwordSlot, read, recoverySlot, swapSlots } = require('../src/main/storage/keys');
const { Library } = require('../src/main/storage/library');
const { codeFor, makeSecret, matchStep, setupLink, stepAt } = require('../src/main/storage/totp');
const { TrustedComputer } = require('../src/main/storage/trusted');

const PASSWORD = 'a long enough password';
const WORD = 'Zanthrimble';
const PICTURE = Buffer.from(`A picture that says ${WORD}, more than once: ${WORD}.`);

const fakeVault = (available = true) => ({
  available: () => available,
  seal: (text) => Buffer.from([...Buffer.from(text)].map((byte) => byte ^ 0x5a)),
  open: (data) => Buffer.from([...data].map((byte) => byte ^ 0x5a)).toString(),
});

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

const holding = (file, text) => {
  const data = fs.readFileSync(file);
  return data.includes(Buffer.from(text, 'utf8')) || data.includes(Buffer.from(text, 'utf16le'));
};

function setUp(t, { backupFolder = '' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-lock-'));
  const root = path.join(dir, 'library');
  const clock = { now: Date.now() };
  const library = new Library(root);
  const workspace = new Workspace(library);
  t.after(() => {
    workspace.closeProject();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  const settings = { values: cleanSettings({ backupFolder, backupEvery: backupFolder ? 'hour' : 'off' }) };
  const backups = new Backups(workspace, settings);
  const trusted = new TrustedComputer(root, fakeVault(), { now: () => clock.now });
  const security = new Security({ workspace, trusted, backups, now: () => clock.now });
  return { dir, root, library, workspace, backups, trusted, security, clock };
}

async function project(space, title = `The Book of ${WORD}`) {
  const { id, outline } = space.workspace.createProject(title);
  const book = outline.children[0];
  const chapter = book.children[0];
  space.workspace.saveChapter({ id: chapter.id, title: `Chapter ${WORD}`, body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `It began with ${WORD}.` }] }] }) });
  const attachment = await space.workspace.open().addAttachment(book.id, { name: `${WORD}.txt`, source: PICTURE, type: 'text/plain' });
  return { id, book, chapter, attachment };
}

async function lock(space, options = {}) {
  const recovery = space.security.makeRecovery();
  const result = await space.security.setPassword({ password: PASSWORD, ...options });
  return { recovery, result };
}

test('a password is stretched, salted and never stored', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  await lock(space);
  const text = fs.readFileSync(path.join(space.library.projectDir(id), 'keys.json'), 'utf8');
  assert.ok(!text.includes(PASSWORD));
  const slot = JSON.parse(text).slots.find((item) => item.type === 'password');
  assert.equal(slot.kdf.name, 'scrypt');
  assert.ok(slot.kdf.N >= 2 ** 17);
});

test('a locked project opens with its password or recovery key, and nothing else', async (t) => {
  const space = setUp(t);
  const { id, chapter } = await project(space);
  const { recovery } = await lock(space);
  space.workspace.closeProject();

  assert.equal(space.library.describe(id).state, 'locked');
  assert.equal(openWithAppSlot(space.library.projectDir(id)), null);
  assert.throws(() => space.workspace.openProject(id), /locked/);
  await assert.rejects(space.security.unlock({ id, how: 'password', secret: 'not the password' }), /isn’t right/);
  await assert.rejects(space.security.unlock({ id, how: 'recovery', secret: makeRecoveryKey() }), /doesn’t open/);
  await assert.rejects(space.security.unlock({ id, how: 'recovery', secret: 'too short' }), /doesn’t open/);
  await assert.rejects(space.security.unlock({ id, how: 'computer' }), /isn’t trusted/);

  const opened = await space.security.unlock({ id, how: 'password', secret: PASSWORD });
  assert.equal(opened.title, `The Book of ${WORD}`);
  assert.equal(opened.mustReset, false);
  assert.match(space.workspace.loadChapter(chapter.id).body, new RegExp(WORD));
  space.workspace.closeProject();

  const again = await space.security.unlock({ id, how: 'recovery', secret: recovery.toLowerCase().replace(/-/g, ' ') });
  assert.equal(again.mustReset, true, 'a recovery key leads straight to a new password');
  await space.security.changePassword('a brand new password');
  space.workspace.closeProject();
  await assert.rejects(space.security.unlock({ id, how: 'password', secret: PASSWORD }), /isn’t right/);
  await space.security.unlock({ id, how: 'password', secret: 'a brand new password' });
  assert.equal(space.workspace.mustReset, false);
});

test('a password has to be long enough, and a project can only be locked once', async (t) => {
  const space = setUp(t);
  await project(space);
  space.security.makeRecovery();
  await assert.rejects(space.security.setPassword({ password: 'short' }), /at least 8/);
  await assert.rejects(space.security.setPassword({ password: PASSWORD }).then(() => space.security.setPassword({ password: PASSWORD })), /already has/);
});

test('it can’t be locked without a recovery key made first', async (t) => {
  const space = setUp(t);
  await project(space);
  await assert.rejects(space.security.setPassword({ password: PASSWORD }), /recovery key/);
  assert.equal(space.library.isLocked(space.workspace.open().id), false);
});

test('locking moves everything to a new key, so an older copy can’t open it', async (t) => {
  const space = setUp(t);
  const { id, attachment } = await project(space);
  const dir = space.library.projectDir(id);
  const oldKeys = fs.readFileSync(path.join(dir, 'keys.json'));
  const oldFile = space.workspace.open().attachment(attachment.id).file;
  const oldKey = Buffer.from(space.workspace.key);
  fs.mkdirSync(path.join(dir, 'backups'));
  fs.writeFileSync(path.join(dir, 'backups', 'before-step.db'), 'a safety copy from before');

  await lock(space);
  assert.ok(!space.workspace.key.equals(oldKey));
  const file = space.workspace.open().attachment(attachment.id).file;
  assert.notEqual(file, oldFile, 'a file under a new key needs a new name');
  assert.deepEqual(await space.workspace.open().attachments.read(file), PICTURE);
  space.workspace.closeProject();

  assert.equal(fs.existsSync(path.join(dir, 'backups')), false, 'copies under the old key go');
  assert.equal(fs.existsSync(path.join(dir, 'attachments', oldFile)), false);
  const stale = path.join(space.dir, 'old-keys');
  fs.mkdirSync(stale);
  fs.writeFileSync(path.join(stale, 'keys.json'), oldKeys);
  assert.deepEqual(openWithAppSlot(stale), oldKey, 'the old key is public to anyone with an old copy');
  assert.throws(() => space.library.openProject(id, oldKey), /does not open/);
});

test('the known words can’t be found in a locked project or its copied file', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  await lock(space, { label: 'Book one' });
  const file = path.join(space.dir, 'copy.rtstory');
  space.workspace.packProject(id, file);
  assert.equal(fs.statSync(file).size > 0, true);
  space.workspace.closeProject();

  const found = [file, ...filesUnder(space.root)].filter((item) => holding(item, WORD) || holding(item, PASSWORD));
  assert.deepEqual(found, []);
  assert.equal(space.library.describe(id).title, 'Book one');
});

test('a locked project file opens through a slot, on another computer, without unpacking first', async (t) => {
  const space = setUp(t);
  const { id, chapter, attachment } = await project(space);
  const { recovery } = await lock(space);
  const file = path.join(space.dir, 'copy.rtstory');
  await space.workspace.packProjectLater(id, file);

  const elsewhere = setUp(t);
  assert.throws(() => elsewhere.workspace.importProject(file), (error) => error.code === 'LOCKED');
  assert.deepEqual(fs.readdirSync(elsewhere.library.projectsDir), [], 'nothing is unpacked until it has its key');
  await assert.rejects(elsewhere.security.keyFromFile({ file, how: 'password', secret: 'wrong password' }), /isn’t right/);

  const key = await elsewhere.security.keyFromFile({ file, how: 'recovery', secret: recovery });
  const imported = elsewhere.workspace.importProject(file, { projectKey: key });
  assert.equal(imported, id);
  elsewhere.workspace.openProject(id, key);
  assert.match(elsewhere.workspace.loadChapter(chapter.id).body, new RegExp(WORD));
  assert.deepEqual(await elsewhere.workspace.open().attachments.read(elsewhere.workspace.open().attachment(attachment.id).file), PICTURE);
  assert.equal(elsewhere.library.isLocked(id), true);
  assert.equal(elsewhere.security.status().computer.on, false, 'trust never travels with the file');
});

test('a wrong slot in a file can’t ask for a silly amount of memory', async () => {
  const projectKey = crypto.randomBytes(32);
  const slot = await passwordSlot(projectKey, 'project-1', PASSWORD);
  assert.deepEqual(await openWithPassword({ projectId: 'project-1', slots: [slot] }, PASSWORD), projectKey);
  const greedy = { ...slot, kdf: { ...slot.kdf, N: 2 ** 40 } };
  assert.equal(await openWithPassword({ projectId: 'project-1', slots: [greedy] }, PASSWORD), null);
  const moved = await openWithPassword({ projectId: 'project-2', slots: [slot] }, PASSWORD);
  assert.equal(moved, null, 'a slot belongs to its project');
});

test('a recovery key is forgiving about how it was typed, and only that', () => {
  const projectKey = crypto.randomBytes(32);
  const text = makeRecoveryKey();
  assert.match(text, /^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
  const keys = { projectId: 'p', slots: [recoverySlot(projectKey, 'p', text)] };
  assert.deepEqual(openWithRecovery(keys, text.toLowerCase()), projectKey);
  assert.deepEqual(openWithRecovery(keys, ` ${text.replace(/-/g, ' ')} `), projectKey);
  assert.deepEqual(openWithRecovery(keys, text.replace(/0/g, 'O').replace(/1/g, 'l')), projectKey);
  assert.equal(openWithRecovery(keys, makeRecoveryKey()), null);
});

test('a power cut while a way in changes leaves the old one working', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  await lock(space);
  const dir = space.library.projectDir(id);
  const before = read(dir);
  const { key } = space.workspace;
  // keys.json is replaced in one step, so a stray temporary file is all a cut can leave.
  fs.writeFileSync(path.join(dir, 'keys.json.dead.tmp'), '{"half":');
  assert.deepEqual(read(dir), before);
  assert.ok(await openWithPassword(read(dir), PASSWORD));
  swapSlots(dir, ['password'], [await passwordSlot(key, id, 'the next password')]);
  assert.equal(await openWithPassword(read(dir), PASSWORD), null);
  assert.deepEqual(await openWithPassword(read(dir), 'the next password'), key);
  assert.throws(() => swapSlots(dir, ['password', 'recovery'], []), /at least one way in/);
});

test('a power cut during a relock leaves one whole project, whichever side of the swap it lands', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  const { projectsDir } = space.library;
  await lock(space);
  const key = Buffer.from(space.workspace.key);
  space.workspace.closeProject();

  // Before the swap: a half-built copy is thrown away.
  const stage = path.join(projectsDir, `.relock-${id}`);
  fs.mkdirSync(stage);
  fs.writeFileSync(path.join(stage, 'project.db'), 'half a file');
  // Between the two moves: the old project goes back.
  fs.renameSync(space.library.projectDir(id), path.join(projectsDir, `.old-${id}`));
  assert.deepEqual(space.library.listProjects(), []);

  const after = new Library(space.root);
  assert.equal(after.listProjects().length, 1);
  assert.deepEqual(fs.readdirSync(projectsDir), [id]);
  after.openProject(id, key).close();

  // After the swap: the old one is removed.
  fs.mkdirSync(path.join(projectsDir, `.old-${id}`));
  fs.writeFileSync(path.join(projectsDir, `.old-${id}`, 'project.db'), 'the old project');
  new Library(space.root);
  assert.deepEqual(fs.readdirSync(projectsDir), [id]);
});

test('a failed relock leaves the project as it was', async (t) => {
  const space = setUp(t);
  const { id, chapter } = await project(space);
  space.security.makeRecovery();
  const original = space.library.relock;
  space.library.relock = async () => { throw new Error('The disk is full.'); };
  await assert.rejects(space.security.setPassword({ password: PASSWORD }), /disk is full/);
  space.library.relock = original;
  assert.equal(space.library.isLocked(id), false);
  assert.match(space.workspace.loadChapter(chapter.id).body, new RegExp(WORD));
});

test('removing the lock puts the app key back, under a new key', async (t) => {
  const space = setUp(t);
  const { id, chapter, attachment } = await project(space);
  await lock(space);
  const lockedKey = Buffer.from(space.workspace.key);
  space.trusted.trust(id, space.workspace.key);
  await assert.rejects(Promise.resolve().then(() => { space.workspace.passUntil = 0; return space.security.removeLock(); }), /password first/);
  await space.security.confirm(PASSWORD);
  await space.security.removeLock();
  assert.ok(!space.workspace.key.equals(lockedKey));
  assert.equal(space.library.isLocked(id), false);
  assert.equal(space.trusted.hints(id).on, false);
  space.workspace.closeProject();
  space.workspace.openProject(id);
  assert.match(space.workspace.loadChapter(chapter.id).body, new RegExp(WORD));
  assert.deepEqual(await space.workspace.open().attachments.read(space.workspace.open().attachment(attachment.id).file), PICTURE);
});

test('changing a way in, or exporting, needs a recent proof', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  assert.doesNotThrow(() => space.security.needExportPass());
  await lock(space);
  space.workspace.closeProject();
  await space.security.unlock({ id, how: 'password', secret: PASSWORD });

  assert.throws(() => space.security.needExportPass(), /password first/);
  await assert.rejects(space.security.changePassword('another password'), /password first/);
  assert.throws(() => space.security.trust(), /password first/);
  assert.throws(() => space.security.replaceRecovery(), /password first/);
  await assert.rejects(space.security.confirm('wrong password'), /isn’t right/);

  await space.security.confirm(PASSWORD);
  assert.doesNotThrow(() => space.security.needExportPass());
  space.clock.now += 6 * 60 * 1000;
  assert.throws(() => space.security.needExportPass(), /password first/, 'a proof runs out');
  await space.security.confirm(PASSWORD);
  space.workspace.closeProject();
  await space.security.unlock({ id, how: 'password', secret: PASSWORD });
  assert.throws(() => space.security.needExportPass(), /password first/, 'and doesn’t survive locking');
});

test('a new recovery key replaces the old one', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  const { recovery } = await lock(space);
  const next = space.security.makeRecovery();
  space.security.replaceRecovery();
  assert.equal(openWithRecovery(read(space.library.projectDir(id)), recovery), null);
  assert.ok(openWithRecovery(read(space.library.projectDir(id)), next));
});

test('a trusted computer opens a project from Forgot, and only on this computer', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  await lock(space);
  space.security.trust();
  const text = fs.readFileSync(path.join(space.root, 'trusted.json'), 'utf8');
  assert.ok(!text.includes(space.workspace.key.toString('base64')), 'the key is sealed');
  assert.equal(fs.existsSync(path.join(space.library.projectDir(id), 'trusted.json')), false, 'and kept outside the project');
  space.workspace.closeProject();
  assert.deepEqual(space.security.lockInfo(id).computer, { on: true, code: false, quick: false });

  const opened = await space.security.unlock({ id, how: 'computer', forgot: true });
  assert.equal(opened.mustReset, true);
  await space.security.changePassword('a brand new password');
  space.security.setQuick(true);
  space.workspace.closeProject();
  assert.equal((await space.security.unlock({ id, how: 'computer' })).mustReset, false);
});

test('a computer with nowhere safe for a key can’t be trusted', (t) => {
  const space = setUp(t);
  const trusted = new TrustedComputer(space.root, fakeVault(false));
  assert.throws(() => trusted.trust('some-id', crypto.randomBytes(32)), /no safe place/);
});

test('a key that no longer fits is dropped from this computer', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  await lock(space);
  space.trusted.trust(id, crypto.randomBytes(32));
  space.workspace.closeProject();
  await assert.rejects(space.security.unlock({ id, how: 'computer' }), /no longer fits/);
  assert.equal(space.trusted.hints(id).on, false);
  await space.security.unlock({ id, how: 'password', secret: PASSWORD });
});

test('authenticator codes match the published test values', () => {
  // RFC 6238, the SHA-1 row, with the last six digits.
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(codeFor(secret, stepAt(59000)), '287082');
  assert.equal(codeFor(secret, stepAt(1111111109000)), '081804');
  assert.equal(codeFor(secret, stepAt(2000000000000)), '279037');
  assert.match(setupLink(makeSecret(), 'Locked project'), /^otpauth:\/\/totp\/RT%20Story%20Tracker%3ALocked%20project\?secret=[A-Z2-7]{32}&/);
});

test('a code allows a little clock drift, and never works twice', () => {
  const secret = makeSecret();
  const time = 1800000000000;
  const step = stepAt(time);
  assert.equal(matchStep(secret, codeFor(secret, step), time), step);
  assert.equal(matchStep(secret, codeFor(secret, step - 1), time), step - 1);
  assert.equal(matchStep(secret, codeFor(secret, step + 1), time), step + 1);
  assert.equal(matchStep(secret, codeFor(secret, step - 3), time), null);
  assert.equal(matchStep(secret, codeFor(secret, step), time, step), null);
  assert.equal(matchStep(secret, 'abcdef', time), null);
});

test('with an authenticator, this computer’s key needs a code, and guessing costs time', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  await lock(space);
  assert.throws(() => space.security.beginAuthenticator(), /Trust this computer/);
  space.security.trust();
  const { secret, picture } = space.security.beginAuthenticator();
  assert.match(picture, /^data:image\/gif/);
  assert.throws(() => space.security.confirmAuthenticator('000000'), /isn’t right/);
  assert.equal(space.trusted.hints(id).code, false);
  space.clock.now += 30000;
  const code = () => codeFor(secret, stepAt(space.clock.now));
  space.security.confirmAuthenticator(code());
  assert.equal(space.trusted.hints(id).code, true);
  assert.ok(!fs.readFileSync(path.join(space.root, 'trusted.json'), 'utf8').includes(secret));
  space.workspace.closeProject();

  space.clock.now += 30000;
  await assert.rejects(space.security.unlock({ id, how: 'computer' }), /isn’t right/);
  await assert.rejects(space.security.unlock({ id, how: 'computer', forgot: true }), /isn’t right/, 'Forgot needs the code too');
  for (let tries = 0; tries < 3; tries += 1) await assert.rejects(space.security.unlock({ id, how: 'computer', code: '000000' }), /isn’t right/);
  await assert.rejects(space.security.unlock({ id, how: 'computer', code: code() }), /Try again in 30 seconds/, 'even the right code waits');
  space.clock.now += 31000;
  const used = code();
  await space.security.unlock({ id, how: 'computer', code: used });
  space.workspace.closeProject();
  await assert.rejects(space.security.unlock({ id, how: 'computer', code: used }), /isn’t right/, 'a code works once');

  space.clock.now += 300000;
  await space.security.unlock({ id, how: 'password', secret: PASSWORD });
  await space.security.confirm(PASSWORD);
  space.security.removeAuthenticator();
  space.workspace.closeProject();
  await space.security.unlock({ id, how: 'computer', forgot: true });
});

test('a locked project backs up while it’s open, under a name that gives nothing away', async (t) => {
  const backupFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-lock-backups-'));
  t.after(() => fs.rmSync(backupFolder, { recursive: true, force: true, maxRetries: 5 }));
  const space = setUp(t, { backupFolder });
  const { id } = await project(space, `Book ${WORD}`);
  space.backups.runNow();
  await space.backups.copying;
  const [earlier] = fs.readdirSync(backupFolder);
  assert.match(earlier, new RegExp(WORD));

  const { result } = await lock(space);
  await space.backups.copying;
  assert.equal(result.earlierBackups, 1);
  const folders = fs.readdirSync(backupFolder);
  const locked = folders.find((name) => name.startsWith('Locked project'));
  assert.ok(locked, 'a new locked backup was made');
  assert.ok(locked.includes(id.slice(0, 8)));
  const copies = filesUnder(path.join(backupFolder, locked));
  assert.ok(copies.length >= 2);
  assert.deepEqual(copies.filter((item) => holding(item, WORD)), []);

  space.security.dropEarlier();
  assert.deepEqual(fs.readdirSync(backupFolder), [locked]);
  assert.throws(() => space.security.dropEarlier(), /nothing to remove/);

  space.workspace.closeProject();
  assert.equal(space.backups.runNow().saved, 0, 'a closed locked project is left alone');
});

test('a locked project backup restores with its password', async (t) => {
  const backupFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-lock-backups-'));
  t.after(() => fs.rmSync(backupFolder, { recursive: true, force: true, maxRetries: 5 }));
  const space = setUp(t, { backupFolder });
  const { id, attachment } = await project(space);
  await lock(space);
  await space.backups.copying;
  const folder = path.join(backupFolder, fs.readdirSync(backupFolder).find((name) => name.startsWith('Locked project')));
  const file = path.join(folder, fs.readdirSync(folder).find((name) => name.endsWith('.rtstory')));

  const elsewhere = setUp(t);
  const key = await elsewhere.security.keyFromFile({ file, how: 'password', secret: PASSWORD });
  elsewhere.workspace.importProject(file, { projectKey: key });
  elsewhere.workspace.openProject(id, key);
  assert.deepEqual(await elsewhere.workspace.open().attachments.read(elsewhere.workspace.open().attachment(attachment.id).file), PICTURE);
});

test('it won’t lock while something is running', async (t) => {
  const space = setUp(t);
  await project(space);
  await lock(space);
  space.workspace.busy = 1;
  assert.equal(space.security.lockNow(), false);
  assert.ok(space.workspace.project);
  space.workspace.busy = 0;
  assert.equal(space.security.lockNow(), true);
  assert.equal(space.workspace.project, null);
  assert.equal(space.workspace.key, null);
});

test('a project closing during a password change can’t ruin the new password', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  await lock(space);
  const changing = space.security.changePassword('a brand new password');
  space.workspace.closeProject();
  await changing;
  await space.security.unlock({ id, how: 'password', secret: 'a brand new password' });
});

test('a lock that worked isn’t reported as failed because the old copy wouldn’t go', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  const { rm } = fs.promises;
  fs.promises.rm = async () => { throw Object.assign(new Error('In use'), { code: 'EPERM' }); };
  t.after(() => { fs.promises.rm = rm; });
  await lock(space);
  fs.promises.rm = rm;
  assert.ok(space.workspace.project);
  space.workspace.closeProject();
  assert.ok(fs.existsSync(path.join(space.library.projectsDir, `.old-${id}`)));
  new Library(space.root);
  assert.deepEqual(fs.readdirSync(space.library.projectsDir), [id], 'it goes the next time the app starts');
});

test('editing keys.json while a project is open doesn’t change what it asks for', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  await lock(space);
  space.workspace.closeProject();
  await space.security.unlock({ id, how: 'password', secret: PASSWORD });
  const dir = space.library.projectDir(id);
  const keys = read(dir);
  fs.writeFileSync(path.join(dir, 'keys.json'), JSON.stringify({ ...keys, slots: [...keys.slots, { type: 'app' }] }));
  assert.throws(() => space.security.needExportPass(), /password first/);
  space.security.makeRecovery();
  await assert.rejects(space.security.setPassword({ password: 'someone else now' }), /already has/);
});

test('replacing a project keeps every original in the Trash', async (t) => {
  const space = setUp(t);
  const { id, chapter } = await project(space);
  const file = path.join(space.dir, 'copy.rtstory');
  space.workspace.packProject(id, file);
  space.workspace.saveChapter({ id: chapter.id, title: 'Changed', body: '' });
  space.workspace.closeProject();

  space.workspace.importProject(file, { replace: true });
  space.workspace.importProject(file, { replace: true });
  const trashed = space.library.trashedProjects();
  assert.equal(trashed.length, 2);
  assert.throws(() => space.library.restoreProject(trashed[0].id), /already/);
  space.library.trashProject(id);
  assert.equal(space.library.trashedProjects().length, 3);

  const titles = space.library.trashedProjects().map((entry) => {
    const dir = path.join(space.library.trashDir, entry.id);
    const opened = space.library.open(dir, id, openWithAppSlot(dir));
    const { title } = opened.getItem(chapter.id);
    opened.close();
    return title;
  });
  assert.ok(titles.includes('Changed'), 'the original can still come back');
});

test('a Trash folder from before 3.6 still comes back', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  space.workspace.closeProject();
  const title = `The Book of ${WORD}`;
  fs.writeFileSync(path.join(space.library.projectDir(id), 'trashed.json'), JSON.stringify({ at: new Date().toISOString(), title }));
  fs.renameSync(space.library.projectDir(id), path.join(space.library.trashDir, id));
  assert.equal(space.library.trashedProjects()[0].id, id);
  space.library.restoreProject(id);
  assert.equal(space.library.describe(id).title, title);
});

test('a file listing the same part twice is refused', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  const file = path.join(space.dir, 'copy.rtstory');
  space.workspace.packProject(id, file);
  const data = fs.readFileSync(file);
  const start = 8 + 4;
  const length = data.readUInt32BE(8);
  const header = JSON.parse(data.subarray(start, start + length).toString('utf8'));
  header.files.push(header.files[0]);
  const text = Buffer.from(JSON.stringify(header));
  const size = Buffer.alloc(4);
  size.writeUInt32BE(text.length);
  fs.writeFileSync(file, Buffer.concat([data.subarray(0, 8), size, text, data.subarray(start + length)]));
  assert.throws(() => space.library.packageKeys(file), /damaged/);
});

test('older backups are found under any title, and a failed new one is reported', async (t) => {
  const backupFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-lock-backups-'));
  t.after(() => fs.rmSync(backupFolder, { recursive: true, force: true, maxRetries: 5 }));
  const space = setUp(t, { backupFolder });
  const { id } = await project(space);
  space.backups.runNow();
  await space.backups.copying;
  space.workspace.rename({ id, title: 'A Later Title' });
  space.backups.runNow();
  await space.backups.copying;
  assert.equal(fs.readdirSync(backupFolder).length, 2);

  const pack = space.workspace.packProject;
  space.workspace.packProject = () => { throw new Error('The drive is gone.'); };
  const { result } = await lock(space);
  space.workspace.packProject = pack;
  assert.equal(result.earlierBackups, 2);
  assert.equal(result.newBackup, false);
  assert.doesNotMatch(space.backups.status().error, new RegExp(`${WORD}|Later`), 'a failure doesn’t show the title');

  space.security.dropEarlier();
  assert.deepEqual(fs.readdirSync(backupFolder).filter((name) => !name.startsWith('Locked project')), []);
});

test('someone who got in by a recovery key can take their time choosing a password', async (t) => {
  const space = setUp(t);
  const { id } = await project(space);
  const { recovery } = await lock(space);
  space.workspace.closeProject();
  await space.security.unlock({ id, how: 'recovery', secret: recovery });
  space.clock.now += 3600000;
  await space.security.changePassword('a brand new password');
  await assert.rejects(space.security.changePassword('and another one'), /password first/);
});

test('a backup that fails can’t keep a project open', async (t) => {
  const space = setUp(t);
  await project(space);
  await lock(space);
  space.backups.runIfDue = () => { throw new Error('The drive is gone.'); };
  assert.equal(space.security.lockNow(), true);
  assert.equal(space.workspace.project, null);
});

test('settings keep the idle time to the choices on offer', () => {
  assert.equal(cleanSettings({}).lockAfter, 15);
  assert.equal(cleanSettings({ lockAfter: 30 }).lockAfter, 30);
  assert.equal(cleanSettings({ lockAfter: 0 }).lockAfter, 0);
  assert.equal(cleanSettings({ lockAfter: 7 }).lockAfter, 15);
});
