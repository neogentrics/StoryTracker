'use strict';
// The password lock in the real app: setting it, every way back in, a locked file, and a search for the words afterwards.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { codeFor, stepAt } = require('../../src/main/storage/totp');

const root = path.join(__dirname, '..', '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-lock-'));
const profile = path.join(work, 'profile');
const WORD = 'Quarvendish';
const PASSWORD = 'seven silver spoons';
const NEXT_PASSWORD = 'nine golden forks';

const launch = async () => {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, RTST_USER_DATA: profile },
  });
  const window = await app.firstWindow();
  await window.waitForSelector('body[data-state="ready"]');
  window.on('dialog', (dialog) => dialog.accept());
  return { app, window };
};

const menu = (app, command) => app.evaluate(({ BrowserWindow }, name) => BrowserWindow.getAllWindows()[0].webContents.send('menu:command', name), command);
const saveTo = (app, file) => app.evaluate(({ dialog }, target) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
}, file);
const openFrom = (app, file) => app.evaluate(({ dialog }, target) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
}, file);

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

const unlock = async (window, password) => {
  await window.fill('#lock-password', password);
  await window.click('#lock-open');
};

(async () => {
  let { app, window } = await launch();

  await window.fill('#new-title', `The ${WORD} Chronicle`);
  await window.click('#start-project');
  await window.waitForSelector('.ProseMirror');
  await window.click('.ProseMirror');
  await window.keyboard.type(`It began with ${WORD} at dawn.`);

  // Setting a password: the fields first, and they're checked.
  await window.click('.security-button');
  await window.fill('#new-password', 'short');
  await window.fill('#new-password-again', 'short');
  await window.click('#security-next');
  assert.match(await window.textContent('#security-error'), /at least 8/);
  await window.fill('#new-password', PASSWORD);
  await window.fill('#new-password-again', 'something else');
  await window.click('#security-next');
  assert.match(await window.textContent('#security-error'), /don’t match/);
  await window.fill('#new-password-again', PASSWORD);
  await window.fill('#locked-label', 'Book one');
  await window.click('#security-next');

  // The recovery key has to be saved before the lock goes on.
  await window.waitForSelector('#recovery-key');
  const recovery = await window.textContent('#recovery-key');
  assert.match(recovery, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/);
  assert.equal(await window.isDisabled('#recovery-continue'), true);
  const keyFile = path.join(work, 'recovery.txt');
  await saveTo(app, keyFile);
  await window.click('#recovery-file');
  await window.waitForFunction(() => document.querySelector('#recovery-note').textContent.startsWith('Saved'));
  assert.ok(fs.readFileSync(keyFile, 'utf8').includes(recovery));
  await window.check('#recovery-saved');
  await window.click('#recovery-continue');
  await window.waitForSelector('#security-done');
  await window.click('#security-done');

  // Still writing, with nothing lost.
  assert.match(await window.textContent('.ProseMirror'), new RegExp(WORD));
  await window.click('.ProseMirror');
  await window.keyboard.press('End');
  await window.keyboard.type(' More words.');

  // Locking by hand, then a wrong password and a right one.
  await menu(app, 'lock');
  await window.waitForSelector('#lock-screen');
  assert.equal(await window.textContent('#lock-title'), 'Book one');
  assert.equal(await window.locator('.ProseMirror').count(), 0, 'nothing of the writing stays on screen');
  await unlock(window, 'not the password');
  await window.waitForSelector('#lock-error:not([hidden])');
  await unlock(window, PASSWORD);
  await window.waitForSelector('.ProseMirror');
  assert.match(await window.textContent('.ProseMirror'), /More words\./);

  // Exporting asks first, because what comes out isn't protected.
  await window.click('.export-button');
  await window.waitForSelector('#confirm-password');
  await window.fill('#confirm-secret', 'not the password');
  await window.click('#confirm-ok');
  await window.waitForSelector('#confirm-error:not([hidden])');
  await window.fill('#confirm-secret', PASSWORD);
  await window.click('#confirm-ok');
  await window.waitForSelector('#export-format');
  await window.keyboard.press('Escape');

  // Locks when told to by the system, as it would on sleep or Win+L.
  await menu(app, 'auto-lock');
  await window.waitForSelector('#lock-screen');

  // Forgot the password: the recovery key, then straight to a new one.
  await window.click('#lock-forgot');
  await window.fill('#lock-recovery', 'NOT-A-REAL-KEY');
  await window.click('#lock-recovery-open');
  await window.waitForSelector('#lock-error:not([hidden])');
  await window.fill('#lock-recovery', recovery.toLowerCase());
  await window.click('#lock-recovery-open');
  await window.waitForSelector('#new-password-dialog');
  await window.keyboard.press('Escape');
  assert.equal(await window.locator('#new-password-dialog[open]').count(), 1, 'it can’t be skipped');
  await window.fill('#new-password', NEXT_PASSWORD);
  await window.fill('#new-password-again', NEXT_PASSWORD);
  await window.click('#security-save-password');
  await window.waitForSelector('#new-password-dialog', { state: 'detached' });

  // Trust this computer and add an authenticator, where the system has somewhere safe to keep them.
  await window.click('.security-button');
  await window.waitForSelector('#ways');
  const canTrust = await window.locator('#way-trust').count();
  console.log(`  this computer can be trusted: ${Boolean(canTrust)}`);
  if (canTrust) {
    await window.click('#way-trust');
    await window.waitForFunction(() => document.querySelector('#confirm-password, #way-untrust'));
    if (await window.locator('#confirm-password').count()) {
      await window.fill('#confirm-secret', NEXT_PASSWORD);
      await window.click('#confirm-ok');
    }
    await window.waitForSelector('#way-add-code');
    await window.click('#way-add-code');
    await window.waitForSelector('#authenticator-secret');
    const secret = await window.textContent('#authenticator-secret');
    const code = () => codeFor(secret, stepAt(Date.now()));
    await window.fill('#authenticator-code', '000000');
    await window.click('#authenticator-confirm');
    await window.waitForSelector('#security-error:not([hidden])');
    await window.fill('#authenticator-code', code());
    await window.click('#authenticator-confirm');
    await window.waitForSelector('#way-remove-code');
    await window.check('#computer-quick');
    await window.waitForFunction(() => document.querySelector('#computer-quick')?.checked);
    await window.click('#security-close');

    await menu(app, 'lock');
    await window.waitForSelector('#lock-code');
    await window.fill('#lock-code', '000000');
    await window.click('#lock-code-open');
    await window.waitForSelector('#lock-error:not([hidden])');
    await window.click('#lock-use-password');
    await unlock(window, NEXT_PASSWORD);
    await window.waitForSelector('.ProseMirror');

    // With no code and Open without asking, the library opens it. Locking still shows the lock, and doesn't undo itself.
    await window.click('.security-button');
    await window.click('#way-remove-code');
    await window.fill('#confirm-secret', NEXT_PASSWORD);
    await window.click('#confirm-ok');
    await window.waitForSelector('#way-add-code');
    await window.click('#security-close');
    await menu(app, 'lock');
    await window.waitForSelector('#lock-here');
    assert.equal(await window.locator('.ProseMirror').count(), 0);
    await window.click('#lock-here');
    await window.waitForSelector('.ProseMirror');

    await window.click('.security-button');
    await window.click('#way-untrust');
    await window.fill('#confirm-secret', NEXT_PASSWORD);
    await window.click('#confirm-ok');
    await window.waitForSelector('#way-trust');
    await window.click('#security-close');
  } else {
    await window.click('#security-close');
  }

  // A copy of the project: the file holds a lock of its own.
  const copy = path.join(work, 'copy.rtstory');
  await saveTo(app, copy);
  await menu(app, 'export');
  await window.waitForFunction(() => document.querySelector('#room-message')?.textContent.includes('Saved a copy'));
  await menu(app, 'lock');
  await window.waitForSelector('#lock-screen');
  await app.close();

  // Starting again comes back to the lock, not the writing.
  ({ app, window } = await launch());
  await window.waitForSelector('#lock-screen');
  await window.click('#lock-library');
  await window.waitForSelector('.project-row');
  assert.match(await window.textContent('.project-row'), /Book one/);
  assert.match(await window.textContent('.project-row'), /Password needed/);
  assert.doesNotMatch(await window.textContent('.project-row'), new RegExp(WORD));

  // That file, opened as if on another computer: the project here goes first.
  await window.click('.project-row button[aria-label*="Trash"]');
  await window.waitForFunction(() => !document.querySelector('.project-row'));
  await openFrom(app, copy);
  await window.click('#open-file');
  await window.waitForSelector('#lock-screen');
  assert.equal(await window.textContent('#lock-title'), 'Book one');
  await unlock(window, 'not the password');
  await window.waitForSelector('#lock-error:not([hidden])');
  await unlock(window, NEXT_PASSWORD);
  await window.waitForSelector('.ProseMirror');
  assert.match(await window.textContent('.ProseMirror'), /More words\./);

  // Taking the password off again.
  await window.click('.security-button');
  await window.waitForSelector('#ways');
  await window.click('#security-remove');
  await window.waitForSelector('#confirm-password');
  await window.fill('#confirm-secret', NEXT_PASSWORD);
  await window.click('#confirm-ok');
  await window.waitForSelector('#security', { state: 'detached', timeout: 30000 });
  await window.click('#open-library');
  await window.waitForSelector('.project-row');
  assert.match(await window.textContent('.project-row'), new RegExp(WORD));
  await app.close();

  // The search that matters, in every file the locked copy holds.
  const file = fs.readFileSync(copy);
  for (const text of [WORD, 'More words', PASSWORD, NEXT_PASSWORD]) {
    assert.equal(file.includes(Buffer.from(text)) || file.includes(Buffer.from(text, 'utf16le')), false, `found ${text} in the locked copy`);
  }
  const trusted = path.join(profile, 'library', 'trusted.json');
  if (fs.existsSync(trusted)) assert.equal(fs.readFileSync(trusted, 'utf8').includes(WORD), false);
  assert.ok(filesUnder(path.join(profile, 'library')).length > 0);

  console.log('Lock end-to-end test passed.');
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 }));
