'use strict';
// The 3.2 test in the real app: delete a chapter and restore it, move a project in one file, restore an old backup.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-safety-'));
const firstComputer = path.join(work, 'first');
const secondComputer = path.join(work, 'second');
const backupFolder = path.join(work, 'backups');
const movedFile = path.join(work, 'Moved.rtstory');

const launch = async (profile) => {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, RTST_USER_DATA: profile },
  });
  const window = await app.firstWindow();
  window.on('dialog', (dialog) => dialog.accept());
  await window.waitForSelector('body[data-state="ready"]');
  return { app, window };
};

const row = (window, title) => window.locator('#chapter-list .row', { hasText: title });
const saved = (window) => window.waitForSelector('.save-state[data-state="saved"]', { timeout: 15000 });
const menu = (app, command) => app.evaluate(({ BrowserWindow }, name) => {
  BrowserWindow.getAllWindows()[0].webContents.send('menu:command', name);
}, command);
const answerDialogs = (app, file, button = 0) => app.evaluate(({ dialog }, values) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: values.file });
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [values.file] });
  dialog.showMessageBox = async () => ({ response: values.button });
}, { file, button });

async function typeOnPage(window, text) {
  await window.click('.ProseMirror');
  await window.keyboard.press('ControlOrMeta+End');
  await window.keyboard.type(text);
}

(async () => {
  let { app, window } = await launch(firstComputer);
  await window.fill('#new-title', 'Safety Test');
  await window.click('#start-project');
  await window.waitForSelector('.ProseMirror');
  await typeOnPage(window, 'The writing that must never be lost');
  await saved(window);

  // Delete a chapter with writing in it, and restore it from the Trash.
  await window.click('#add-chapter');
  await window.waitForFunction(() => document.querySelector('#chapter-title').value === 'Chapter 2');
  await row(window, 'Chapter 1').hover();
  await window.click('[aria-label="Move Chapter 1 to Trash"]');
  await window.waitForFunction(() => document.querySelector('#room-message').textContent.includes('is in the Trash'));
  assert.equal(await row(window, 'Chapter 1').count(), 0);
  await window.waitForFunction(() => document.querySelector('#project-words').textContent.startsWith('0 words'));
  await window.click('.trash-button');
  await window.waitForSelector('#trash[open]');
  assert.match(await window.textContent('#trash-list'), /Chapter 1.*30 days left/);
  await window.click('[aria-label="Restore Chapter 1"]');
  await window.waitForFunction(() => document.querySelector('#trash-list').textContent.includes('empty'));
  await window.click('#trash-close');
  await row(window, 'Chapter 1').locator('.row-main').click();
  await window.waitForFunction(() => document.querySelector('.ProseMirror').textContent === 'The writing that must never be lost');
  assert.match(await window.textContent('#project-words'), /^7 words/);

  // Earlier versions: compare and restore. The first change keeps what came before it.
  await typeOnPage(window, ' and more');
  await saved(window);
  await window.click('.history-button');
  await window.waitForSelector('#history[open]');
  await window.waitForSelector('.history-view ins');
  assert.equal(await window.textContent('.history-view ins'), ' and more');
  await window.click('#history-restore');
  await window.waitForFunction(() => document.querySelector('.ProseMirror').textContent === 'The writing that must never be lost');
  await window.click('.history-button');
  await window.waitForSelector('#history[open]');
  assert.match(await window.textContent('.history-list'), /Before a restore/);
  await window.click('#history-close');

  // A backup, to a chosen folder.
  await answerDialogs(app, backupFolder);
  fs.mkdirSync(backupFolder);
  await menu(app, 'preferences');
  await window.waitForSelector('#preferences[open]');
  await window.click('#backup-choose');
  await window.waitForFunction((folder) => document.querySelector('#backup-folder').textContent === folder, backupFolder);
  await window.selectOption('#pref-backup-every', 'day');
  await window.click('#backup-now');
  await window.waitForFunction(() => document.querySelector('#backup-note').textContent.startsWith('Last backup'));
  await window.click('#pref-close');
  const backups = fs.readdirSync(backupFolder, { recursive: true }).filter((name) => name.endsWith('.rtstory'));
  assert.equal(backups.length, 1);

  // Writing goes on after the backup.
  await typeOnPage(window, ' written later');
  await saved(window);

  // One file carries the whole project to another computer.
  await answerDialogs(app, movedFile);
  await menu(app, 'export');
  await window.waitForFunction(() => document.querySelector('#room-message').textContent.includes('Saved a copy'));
  assert.ok(fs.statSync(movedFile).size > 1000);
  assert.ok(!fs.readFileSync(movedFile).includes(Buffer.from('must never be lost')), 'the file stays encrypted');
  await app.close();

  ({ app, window } = await launch(secondComputer));
  await answerDialogs(app, movedFile);
  await window.click('#open-file');
  await window.waitForSelector('.ProseMirror');
  assert.equal(await window.textContent('#project-title'), 'Safety Test');
  await row(window, 'Chapter 1').locator('.row-main').click();
  await window.waitForFunction(() => document.querySelector('.ProseMirror').textContent.endsWith('written later'));
  await app.close();

  // Restoring an old backup replaces the project, and what it replaced waits in the Trash.
  ({ app, window } = await launch(firstComputer));
  await window.waitForSelector('.ProseMirror');
  await answerDialogs(app, path.join(backupFolder, backups[0]));
  await menu(app, 'open-file');
  await window.waitForFunction(() => document.querySelector('.ProseMirror')?.textContent === 'The writing that must never be lost');
  await window.click('#open-library');
  await window.waitForSelector('.project-row');
  await window.click('#open-trash');
  await window.waitForSelector('#trash[open]');
  assert.match(await window.textContent('#trash-list'), /Safety Test/);
  await window.click('#trash-close');
  await app.close();

  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 });
  console.log('safety e2e passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
