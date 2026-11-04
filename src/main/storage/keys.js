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

function hasAppSlot(dir) {
  return read(dir).slots.some((slot) => slot.type === 'app');
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
  KEY_FILE,
  addSlot,
  createKeys,
  hasAppSlot,
  listSlots,
  openWithAppSlot,
  openWithSlot,
  removeSlot,
  writeFileSafely,
};
