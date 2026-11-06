'use strict';
// The lock, as the window sees it. docs/design/passwords-and-recovery.md has the reasoning. The rule that matters most: the
// window asks and this file decides, so nothing here trusts the window to have checked anything.
const fs = require('node:fs');
const qrcode = require('qrcode-generator');
const { WrongKeyError } = require('./storage/database');
const { appSlot, makeRecoveryKey, openWithPassword, openWithRecovery, passwordSlot, recoverySlot, setLabel, swapSlots } = require('./storage/keys');
const { makeSecret, setupLink } = require('./storage/totp');

const PASS_MS = 5 * 60 * 1000;
const MIN_PASSWORD = 8;
const MAX_LABEL = 60;
const WRONG = { password: 'That password isn’t right.', recovery: 'That recovery key doesn’t open this project.' };

const cleanLabel = (label) => String(label ?? '').trim().slice(0, MAX_LABEL);

function checkPassword(password) {
  if (typeof password !== 'string' || [...password].length < MIN_PASSWORD) throw new Error(`A password needs at least ${MIN_PASSWORD} characters.`);
}

class Security {
  constructor({ workspace, trusted, backups, onProgress = () => {}, onLocked = () => {}, now = () => Date.now() }) {
    Object.assign(this, { workspace, trusted, backups, onProgress, onLocked, now });
    this.pendingRecovery = null;
    this.pendingSecret = null;
    this.earlier = null;
  }

  get library() {
    return this.workspace.library;
  }

  dir(id) {
    return this.library.projectDir(id);
  }

  openId() {
    return this.workspace.open().id;
  }

  // Decided when the project opened. keys.json can be changed by anyone, so it isn't asked again while the project is open.
  needLocked() {
    const id = this.openId();
    if (!this.workspace.locked) throw new Error('This project doesn’t have a password.');
    return id;
  }

  // A recent proof that the author is the one at the keyboard. Changing a way in, or taking the writing out of the
  // encryption, needs one.
  hasPass() {
    return this.workspace.passUntil > this.now();
  }

  needPass() {
    if (!this.hasPass()) throw new Error('Enter your password first.');
  }

  givePass() {
    this.workspace.passUntil = this.now() + PASS_MS;
  }

  // Exported files can be read by anyone, so on a locked project they take the same proof.
  needExportPass() {
    this.openId();
    if (this.workspace.locked) this.needPass();
  }

  async confirm(secret) {
    const id = this.needLocked();
    const keys = this.library.keysOf(id);
    const key = openWithRecovery(keys, secret) ?? (await openWithPassword(keys, secret));
    if (!key || !this.workspace.key?.equals(key)) throw new Error(WRONG.password);
    this.givePass();
  }

  status() {
    const id = this.openId();
    const keys = this.library.keysOf(id);
    return {
      id,
      locked: this.workspace.locked,
      label: keys.label ?? '',
      computer: { ...this.trusted.hints(id), available: this.trusted.available() },
      pass: this.hasPass(),
      mustReset: this.workspace.mustReset,
    };
  }

  // What the lock screen can offer. It holds nothing secret.
  lockInfo(id) {
    return { id, label: this.library.keysOf(id).label ?? '', computer: this.trusted.available() ? this.trusted.hints(id) : { on: false, code: false, quick: false } };
  }

  async keyFrom(keys, how, secret) {
    const key = how === 'recovery' ? openWithRecovery(keys, secret) : await openWithPassword(keys, secret);
    if (!key) throw new Error(WRONG[how] ?? WRONG.password);
    return key;
  }

  // Forgot means the password is gone, so the next thing the author sees is a screen to set a new one.
  async unlock({ id, how, secret, code, forgot = false }) {
    const key = how === 'computer' ? this.trusted.keyFor(id, code) : await this.keyFrom(this.library.keysOf(id), how, secret);
    let opened;
    try {
      opened = this.workspace.openProject(id, key);
    } catch (error) {
      if (how !== 'computer' || !(error instanceof WrongKeyError)) throw error;
      this.trusted.forget(id);
      throw new Error('This computer’s key no longer fits this project, so it has been removed. Use your password.');
    } finally {
      key.fill(0);
    }
    this.workspace.mustReset = how === 'recovery' || forgot;
    if (this.workspace.mustReset) this.givePass();
    return { ...opened, mustReset: this.workspace.mustReset };
  }

  // A locked project file: the key comes from the file itself, because this library doesn't have the project yet.
  async keyFromFile({ file, how, secret }) {
    return this.keyFrom(this.library.packageKeys(file), how, secret);
  }

  makeRecovery() {
    this.pendingRecovery = makeRecoveryKey();
    return this.pendingRecovery;
  }

  takeRecovery() {
    if (!this.pendingRecovery) throw new Error('Make a recovery key first.');
    const text = this.pendingRecovery;
    this.pendingRecovery = null;
    return text;
  }

  // Closes the project, moves it to a new key, and opens it again. If that fails the project is still as it was.
  async relock(makeKeys) {
    const space = this.workspace;
    if (space.busy > 1) throw new Error('Something is still running. Try again when it has finished.');
    const id = this.openId();
    const oldKey = Buffer.from(space.key);
    await this.backups?.copying;
    space.closeProject();
    let key = oldKey;
    try {
      key = await this.library.relock(id, oldKey, makeKeys, { onProgress: this.onProgress });
      return space.openProject(id, key);
    } catch (error) {
      if (key === oldKey) space.openProject(id, oldKey);
      throw error;
    } finally {
      oldKey.fill(0);
    }
  }

  async setPassword({ password, label }) {
    checkPassword(password);
    const id = this.openId();
    if (this.workspace.locked) throw new Error('This project already has a password.');
    const recovery = this.takeRecovery();
    const name = cleanLabel(label);
    const opened = await this.relock(async (key) => ({
      ...(name ? { label: name } : {}),
      slots: [await passwordSlot(key, id, password), recoverySlot(key, id, recovery)],
    }));
    this.givePass();
    this.onLocked();
    const made = this.backups?.backupNew(id);
    this.earlier = { id, folders: this.backups?.earlierFolders(id) ?? [] };
    return { opened, earlierBackups: this.earlier.folders.reduce((sum, folder) => sum + this.backups.countIn(folder), 0), newBackup: Boolean(made?.saved) };
  }

  // Only ever this project's own folders from before it was locked, and only when the author says so.
  dropEarlier() {
    if (!this.earlier?.folders.length || this.earlier.id !== this.openId()) throw new Error('There’s nothing to remove.');
    for (const folder of this.earlier.folders) fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
    this.earlier = null;
  }

  async removeLock() {
    this.needPass();
    const id = this.needLocked();
    const opened = await this.relock(async (key) => ({ slots: [appSlot(key, id)] }));
    this.trusted.forget(id);
    this.workspace.passUntil = 0;
    return { opened };
  }

  // Someone who just got in by a recovery key has already proved it, however long they take to choose. The key is copied,
  // because the project can close while the password is being stretched.
  async changePassword(password) {
    if (!this.workspace.mustReset) this.needPass();
    checkPassword(password);
    const id = this.needLocked();
    const key = Buffer.from(this.workspace.key);
    try {
      swapSlots(this.dir(id), ['password'], [await passwordSlot(key, id, password)]);
    } finally {
      key.fill(0);
    }
    this.workspace.mustReset = false;
  }

  replaceRecovery() {
    this.needPass();
    const id = this.needLocked();
    swapSlots(this.dir(id), ['recovery'], [recoverySlot(this.workspace.key, id, this.takeRecovery())]);
  }

  rename(label) {
    setLabel(this.dir(this.needLocked()), cleanLabel(label));
  }

  trust() {
    this.needPass();
    this.trusted.trust(this.needLocked(), this.workspace.key);
  }

  untrust() {
    this.needPass();
    this.trusted.forget(this.needLocked());
  }

  setQuick(quick) {
    this.needPass();
    this.trusted.update(this.needLocked(), { quick: Boolean(quick) });
  }

  beginAuthenticator() {
    this.needPass();
    const id = this.needLocked();
    if (!this.trusted.hints(id).on) throw new Error('Trust this computer first.');
    this.pendingSecret = makeSecret();
    const code = qrcode(0, 'M');
    code.addData(setupLink(this.pendingSecret, this.library.keysOf(id).label || 'Locked project'));
    code.make();
    return { secret: this.pendingSecret, picture: code.createDataURL(5, 10) };
  }

  confirmAuthenticator(code) {
    this.needPass();
    if (!this.pendingSecret) throw new Error('Start again from Add an authenticator.');
    this.trusted.confirmCode(this.needLocked(), this.pendingSecret, code);
    this.pendingSecret = null;
  }

  removeAuthenticator() {
    this.needPass();
    this.trusted.update(this.needLocked(), { totp: null });
  }

  // Before a locked project closes, because no backup can reach it once it has.
  closing() {
    if (this.workspace.locked) this.backups?.runIfDue();
  }

  // Closing always happens: a backup that fails is no reason to leave the writing open.
  close() {
    try {
      this.closing();
    } catch {
      // It'll be tried again the next time the project is open.
    }
    this.workspace.closeProject();
  }

  lockNow() {
    if (this.workspace.busy > 0) return false;
    this.close();
    return true;
  }
}

module.exports = { MIN_PASSWORD, Security };
