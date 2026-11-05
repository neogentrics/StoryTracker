'use strict';
// The trusted computer: a copy of a project's key, sealed by the system's own encrypted storage for this login. It lives in
// the library, outside every project, so it can't travel in a .rtstory file or a backup. If an authenticator is added, its
// secret is sealed in the same place, and the key doesn't come out without a code.
const fs = require('node:fs');
const path = require('node:path');
const { writeFileSafely } = require('./keys');
const { matchStep } = require('./totp');

const FILE = 'trusted.json';
const FREE_TRIES = 5;
const FIRST_WAIT_MS = 30000;
const LONGEST_WAIT_MS = 15 * 60 * 1000;

class TrustedComputer {
  // The vault is the system's storage: { available(), seal(text) -> Buffer, open(Buffer) -> text }.
  constructor(root, vault, { now = () => Date.now() } = {}) {
    this.file = path.join(root, FILE);
    this.vault = vault;
    this.now = now;
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  write(records) {
    writeFileSafely(this.file, `${JSON.stringify(records, null, 2)}\n`);
  }

  available() {
    return this.vault.available();
  }

  // Only a guide for what the screen offers. What counts is sealed, and checked when the key is asked for.
  hints(id) {
    const record = this.read()[id];
    return record ? { on: true, code: Boolean(record.code), quick: Boolean(record.quick) } : { on: false, code: false, quick: false };
  }

  unseal(id) {
    const record = this.read()[id];
    if (!record) throw new Error('This computer isn’t trusted for this project.');
    return { record, sealed: JSON.parse(this.vault.open(Buffer.from(record.sealed, 'base64'))) };
  }

  save(id, sealed, extra = {}) {
    const records = this.read();
    records[id] = {
      sealed: this.vault.seal(JSON.stringify(sealed)).toString('base64'),
      code: Boolean(sealed.totp),
      quick: Boolean(sealed.quick),
      ...extra,
    };
    this.write(records);
  }

  trust(id, projectKey) {
    if (!this.available()) throw new Error('This computer has no safe place to keep a key.');
    this.save(id, { key: projectKey.toString('base64'), totp: null, quick: false });
  }

  forget(id) {
    const records = this.read();
    if (!records[id]) return;
    delete records[id];
    this.write(records);
  }

  update(id, changes) {
    const { record, sealed } = this.unseal(id);
    this.save(id, { ...sealed, ...changes }, { lastStep: record.lastStep });
  }

  note(id, changes) {
    const records = this.read();
    records[id] = { ...records[id], ...changes };
    if (changes.fails === 0) delete records[id].waitUntil;
    this.write(records);
  }

  // Wrong codes cost time, so nobody at the keyboard can simply try them all.
  checkCode(id, sealed, record, code) {
    const now = this.now();
    if (record.waitUntil > now) {
      const seconds = Math.ceil((record.waitUntil - now) / 1000);
      throw new Error(`Too many wrong codes. Try again in ${seconds} seconds.`);
    }
    const step = matchStep(sealed.totp, code, now, record.lastStep ?? 0);
    if (step === null) {
      const fails = (record.fails ?? 0) + 1;
      const wait = fails < FREE_TRIES ? 0 : Math.min(LONGEST_WAIT_MS, FIRST_WAIT_MS * 2 ** (fails - FREE_TRIES));
      this.note(id, { fails, ...(wait ? { waitUntil: now + wait } : {}) });
      throw new Error('That code isn’t right.');
    }
    this.note(id, { fails: 0, lastStep: step });
  }

  // With an authenticator, the key never comes out without a code, however the screen was reached.
  keyFor(id, code = '') {
    const { record, sealed } = this.unseal(id);
    if (sealed.totp) this.checkCode(id, sealed, record, code);
    return Buffer.from(sealed.key, 'base64');
  }

  confirmCode(id, secret, code) {
    const step = matchStep(secret, code, this.now());
    if (step === null) throw new Error('That code isn’t right. Check the time on your phone, and try the next code.');
    const { sealed } = this.unseal(id);
    this.save(id, { ...sealed, totp: secret }, { lastStep: step });
  }
}

module.exports = { TrustedComputer };
