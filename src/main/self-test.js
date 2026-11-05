'use strict';
// Proves the storage works in whatever build is running, installed or not. CI runs it from the real installers on
// Windows, Mac and Linux. It works in a temporary folder and never touches an author's library.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DATABASE_FILE, Library } = require('./storage/library');
const { WrongKeyError, openDatabase } = require('./storage/database');
const { measure } = require('./measure');

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function contains(file, text) {
  const data = fs.readFileSync(file);
  return data.includes(Buffer.from(text, 'utf8')) || data.includes(Buffer.from(text, 'utf16le'));
}

function runStorageChecks(dir) {
  const checks = [];
  const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), ...(detail ? { detail } : {}) });
  const secret = `SecretWord${crypto.randomBytes(6).toString('hex')}`;

  const library = new Library(path.join(dir, 'library'));
  const id = library.createProject(`Title ${secret}`);
  check('makes a project', library.listProjects().some((item) => item.id === id && item.state === 'ready'));

  let project = library.openProject(id);
  const info = project.info();
  const chapter = project.putItem({ kind: 'chapter', parentId: id, title: 'Chapter One', body: `It began with ${secret}.` });
  project.putItem({ id: chapter.id, body: `It ended with ${secret}.` });
  const changes = project.changesSince(0);
  check('logs every change', changes.length === 3 && changes.at(-1).fields.join() === 'body');
  project.close();

  project = library.openProject(id);
  check('keeps what was saved', project.getItem(chapter.id)?.body === `It ended with ${secret}.`);
  check('passes the integrity check', project.check());
  project.backupTo(path.join(library.projectDir(id), 'backups', 'test.db'));
  project.removeItem(chapter.id);
  check('leaves a marker for a removal', project.removalMarkers().some((row) => row.itemId === chapter.id));
  project.close();

  const file = path.join(library.projectDir(id), DATABASE_FILE);
  const header = fs.readFileSync(file).subarray(0, 16).toString('latin1');
  check('file header is garbled', !header.startsWith('SQLite format'));

  let refused = false;
  try {
    openDatabase(file, crypto.randomBytes(32)).close();
  } catch (error) {
    refused = error instanceof WrongKeyError;
  }
  check('refuses the wrong key', refused);

  const searchFile = path.join(dir, 'search.db');
  const search = openDatabase(searchFile, crypto.randomBytes(32));
  search.exec('CREATE VIRTUAL TABLE s USING fts5(body)');
  search.prepare('INSERT INTO s VALUES (?)').run(`Searching for ${secret}`);
  const { hits } = search.prepare('SELECT count(*) AS hits FROM s WHERE s MATCH ?').get(secret);
  search.close();
  check('searches inside the encryption', hits === 1);

  const leaks = filesUnder(dir).filter((item) => contains(item, secret));
  check('no file contains the writing', leaks.length === 0, leaks.map((item) => path.basename(item)).join(', '));

  return { checks, info };
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Types into the real editor of whatever build is running, then reads the chapter back from the database.
async function writeInWindow(window, workspace, requestFlush) {
  const page = (code) => window.webContents.executeJavaScript(code);
  const sentence = 'Written in the installed app.';
  await page("document.querySelector('#new-title').value = 'Self-test'; document.querySelector('#start-project').click()");
  for (let tries = 0; !(await page("Boolean(document.querySelector('.ProseMirror'))")); tries += 1) {
    if (tries > 100) return 'the editor never opened';
    await pause(100);
  }
  await page(`document.querySelector('.ProseMirror').focus(); document.execCommand('insertText', false, '${sentence}')`);
  if (!(await requestFlush(window))) return 'the window could not save';
  const book = workspace.outline().children[0];
  const chapter = workspace.loadChapter(book.children[0].id);
  return chapter.body.includes(sentence) && chapter.words === 5 ? 'saved' : `read back ${chapter.words} words`;
}

function runSelfTest(dir, { withMeasure = false } = {}) {
  const started = Date.now();
  const { checks, info } = runStorageChecks(path.join(dir, 'storage'));
  const report = {
    ok: checks.every((item) => item.passed),
    platform: process.platform,
    arch: process.arch,
    versions: { electron: process.versions.electron, node: process.versions.node, ...info },
    checks,
    seconds: (Date.now() - started) / 1000,
  };
  if (withMeasure) report.measure = measure(path.join(dir, 'measure'));
  return report;
}

module.exports = { runSelfTest, writeInWindow };
