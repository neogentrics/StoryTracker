'use strict';
// Key slots, as in docs/design/passwords-and-recovery.md.
// Each project has one random key. It's never stored in the open: keys.json holds copies of it, each locked a
// different way. Any one slot opens the project, and changing a slot never touches the project itself.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const KEY_FILE = 'keys.json';
const FORMAT = 1;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

// Slow on purpose: each guess at a password costs about a quarter of a second and 128 MB. The numbers are kept in each slot,
// so they can rise later without locking anyone out.
const SCRYPT = { name: 'scrypt', N: 2 ** 17, r: 8, p: 1 };
const MAX_SCRYPT_N = 2 ** 20;
const MAX_TRIES = 4;

// Crockford's letters: no I, L, O or U, so a key copied down by hand can't be misread.
const RECOVERY_LETTERS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_BYTES = 20;
const RECOVERY_LENGTH = 32;

// The slot every project starts with, so a project with no password still opens on any computer, from any backup.
// This key is in public source code, so it stops other programs reading the file and nothing more. Only a password
// gives real secrecy, and setting one removes this slot.
const APP_SLOT_KEY = crypto.createHash('sha256').update('RT Story Tracker app slot, version 1').digest();

function writeFileSafely(file, text) {
  const temp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const handle = fs.openSync(temp, 'w');
  try {
    fs.writeSync(handle, text);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(temp, file);
}

function lock(projectKey, projectId, type, wrappingKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', wrappingKey, iv);
  cipher.setAAD(Buffer.from(`${projectId}:${type}`));
  const wrapped = Buffer.concat([cipher.update(projectKey), cipher.final()]);
  return {
    id: crypto.randomUUID(),
    type,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    wrapped: wrapped.toString('base64'),
  };
}

function unlock(slot, projectId, wrappingKey) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', wrappingKey, Buffer.from(slot.iv, 'base64'));
  decipher.setAAD(Buffer.from(`${projectId}:${slot.type}`));
  decipher.setAuthTag(Buffer.from(slot.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(slot.wrapped, 'base64')), decipher.final()]);
}

function read(dir) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, KEY_FILE), 'utf8'));
  if (data.format !== FORMAT) throw new Error(`Unknown key file format: ${data.format}`);
  return data;
}

function write(dir, data) {
  writeFileSafely(path.join(dir, KEY_FILE), `${JSON.stringify(data, null, 2)}\n`);
}

function createKeys(dir, projectId) {
  const projectKey = crypto.randomBytes(KEY_BYTES);
  write(dir, { format: FORMAT, projectId, slots: [lock(projectKey, projectId, 'app', APP_SLOT_KEY)] });
  return projectKey;
}

const hasApp = (data) => data.slots.some((slot) => slot.type === 'app');

function hasAppSlot(dir) {
  return hasApp(read(dir));
}

function appSlot(projectKey, projectId) {
  return lock(projectKey, projectId, 'app', APP_SLOT_KEY);
}

function stretch(password, { N, r, p, salt }) {
  return new Promise((resolve, reject) => {
    const options = { N, r, p, maxmem: 256 * N * r };
    crypto.scrypt(String(password).normalize('NFKC'), Buffer.from(salt, 'base64'), KEY_BYTES, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

async function passwordSlot(projectKey, projectId, password) {
  const kdf = { ...SCRYPT, salt: crypto.randomBytes(SALT_BYTES).toString('base64') };
  return { ...lock(projectKey, projectId, 'password', await stretch(password, kdf)), kdf };
}

// A file from somewhere else chooses these numbers, so they're checked before any memory is spent on them.
const fairCost = ({ name, N, r, p, salt }) => name === 'scrypt' && Number.isInteger(N) && N > 1 && N <= MAX_SCRYPT_N && (N & (N - 1)) === 0 && r === 8 && p >= 1 && p <= 4 && typeof salt === 'string';

async function openWithPassword(data, password) {
  for (const slot of data.slots.filter((item) => item.type === 'password' && item.kdf && fairCost(item.kdf)).slice(0, MAX_TRIES)) {
    try {
      return unlock(slot, data.projectId, await stretch(password, slot.kdf));
    } catch {
      // Not this slot.
    }
  }
  return null;
}

function makeRecoveryKey() {
  const bytes = crypto.randomBytes(RECOVERY_BYTES);
  let bits = 0;
  let value = 0;
  let text = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      text += RECOVERY_LETTERS[(value >> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  return text.match(/.{4}/g).join('-');
}

// Forgiving about how it was typed, so a key written down by hand still works.
function cleanRecoveryKey(text) {
  const clean = String(text).toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return clean.length === RECOVERY_LENGTH && [...clean].every((letter) => RECOVERY_LETTERS.includes(letter)) ? clean : null;
}

// The key is already as long and as random as a key can usefully be, so it needs no slow stretching.
function recoveryWrappingKey(clean, salt) {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(clean, 'latin1'), Buffer.from(salt, 'base64'), 'RT Story Tracker recovery key', KEY_BYTES));
}

function recoverySlot(projectKey, projectId, text) {
  const clean = cleanRecoveryKey(text);
  if (!clean) throw new Error('That recovery key is not complete.');
  const kdf = { name: 'hkdf', salt: crypto.randomBytes(SALT_BYTES).toString('base64') };
  return { ...lock(projectKey, projectId, 'recovery', recoveryWrappingKey(clean, kdf.salt)), kdf };
}

function openWithRecovery(data, text) {
  const clean = cleanRecoveryKey(text);
  if (!clean) return null;
  for (const slot of data.slots.filter((item) => item.type === 'recovery' && item.kdf?.name === 'hkdf')) {
    try {
      return unlock(slot, data.projectId, recoveryWrappingKey(clean, slot.kdf.salt));
    } catch {
      // Not this slot.
    }
  }
  return null;
}

// One write, so a power cut leaves either the old ways in or the new ones, never neither.
function swapSlots(dir, types, slots) {
  const data = read(dir);
  const kept = data.slots.filter((slot) => !types.includes(slot.type));
  if (kept.length + slots.length === 0) throw new Error('A project must keep at least one way in.');
  write(dir, { ...data, slots: [...kept, ...slots] });
}

function setLabel(dir, label) {
  write(dir, { ...read(dir), label });
}

function openWithSlot(dir, type, wrappingKey) {
  const data = read(dir);
  for (const slot of data.slots.filter((item) => item.type === type)) {
    try {
      return unlock(slot, data.projectId, wrappingKey);
    } catch {
      // Wrong key for this slot. Another slot of the same type may fit.
    }
  }
  return null;
}

function openWithAppSlot(dir) {
  return openWithSlot(dir, 'app', APP_SLOT_KEY);
}

function appKeyFrom(data) {
  const slot = data.slots.find((item) => item.type === 'app');
  return slot ? unlock(slot, data.projectId, APP_SLOT_KEY) : null;
}

function addSlot(dir, projectKey, type, wrappingKey, details = {}) {
  const data = read(dir);
  const slot = { ...lock(projectKey, data.projectId, type, wrappingKey), ...details };
  data.slots.push(slot);
  write(dir, data);
  return slot.id;
}

function removeSlot(dir, slotId) {
  const data = read(dir);
  const remaining = data.slots.filter((slot) => slot.id !== slotId);
  if (remaining.length === 0) throw new Error('A project must keep at least one way in.');
  data.slots = remaining;
  write(dir, data);
}

function listSlots(dir) {
  return read(dir).slots.map(({ id, type }) => ({ id, type }));
}

module.exports = {
  FORMAT,
  KEY_FILE,
  addSlot,
  appKeyFrom,
  appSlot,
  createKeys,
  hasApp,
  hasAppSlot,
  listSlots,
  makeRecoveryKey,
  openWithAppSlot,
  openWithPassword,
  openWithRecovery,
  openWithSlot,
  passwordSlot,
  read,
  recoverySlot,
  removeSlot,
  setLabel,
  swapSlots,
  write,
  writeFileSafely,
};
