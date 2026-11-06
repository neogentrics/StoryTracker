'use strict';
// The only file that opens SQLite for the app. Everything is encrypted in the SQLCipher 4 format, because the Android
// companion can open that format later with SQLCipher's own library.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3-multiple-ciphers');
const { STEPS } = require('./schema');

const APPLICATION_ID = 0x52545354; // "RTST", so the app can tell its own files apart once unlocked.

class WrongKeyError extends Error {
  constructor() {
    super('This key does not open this project.');
    this.name = 'WrongKeyError';
  }
}

function openDatabase(file, projectKey) {
  if (!Buffer.isBuffer(projectKey) || projectKey.length !== 32) throw new Error('A project key must be 32 bytes.');
  const db = new Database(file);
  try {
    db.pragma("cipher = 'sqlcipher'");
    db.pragma('legacy = 4');
    db.pragma(`key = "x'${projectKey.toString('hex')}'"`);
    try {
      db.prepare('SELECT count(*) FROM sqlite_master').get();
    } catch (error) {
      if (error.code === 'SQLITE_NOTADB') throw new WrongKeyError();
      throw error;
    }
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('foreign_keys = ON');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

// A straight file copy, so a backup is exactly as encrypted as the project.
function copyDatabase(db, file, destination) {
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file, destination);
}

// Rewrites every page under a new key. It's done on a copy, so the project itself is never half one key and half the other.
function rekeyDatabase(file, oldKey, newKey) {
  const db = openDatabase(file, oldKey);
  try {
    db.pragma('journal_mode = DELETE');
    db.pragma(`rekey = "x'${newKey.toString('hex')}'"`);
  } finally {
    db.close();
  }
}

function migrate(db, file, { steps = STEPS, now = () => new Date() } = {}) {
  const current = db.pragma('user_version', { simple: true });
  const latest = steps.at(-1).version;
  if (current > latest) {
    throw new Error(`This project was saved by a newer version of the app (step ${current}, this app knows ${latest}).`);
  }
  const pending = steps.filter((step) => step.version > current);
  if (pending.length === 0) return { from: current, to: current, backup: null };

  let backup = null;
  if (current > 0) {
    const stamp = now().toISOString().replace(/[:.]/g, '-');
    backup = path.join(path.dirname(file), 'backups', `before-step-${pending[0].version}-${stamp}.db`);
    copyDatabase(db, file, backup);
  }
  for (const step of pending) {
    db.transaction(() => {
      step.up(db);
      db.pragma(`user_version = ${step.version}`);
      db.pragma(`application_id = ${APPLICATION_ID}`);
    })();
  }
  return { from: current, to: latest, backup };
}

function databaseInfo(db) {
  const { sqlite } = db.prepare('SELECT sqlite_version() AS sqlite').get();
  return { sqlite, cipher: Object.keys(db.pragma('cipher')[0] ?? {})[0] ?? 'unknown' };
}

module.exports = { APPLICATION_ID, WrongKeyError, copyDatabase, databaseInfo, migrate, openDatabase, rekeyDatabase };
