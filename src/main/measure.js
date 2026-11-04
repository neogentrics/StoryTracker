'use strict';
// The database test from docs/design/database.md, repeated with encryption on, inside the real app. The text is made
// up, so these numbers compare encrypted with plain in the same run, not with the first test's real files.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3-multiple-ciphers');
const { copyDatabase, openDatabase } = require('./storage/database');

const DOCUMENTS = 10500;
const WORDS_PER_DOCUMENT = 850;

function wordSource() {
  let seed = 12345;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed >>> 8;
  };
  const words = [];
  for (let i = 0; i < 20000; i += 1) {
    let word = '';
    const length = 2 + (next() % 9);
    for (let j = 0; j < length; j += 1) word += String.fromCharCode(97 + (next() % 26));
    words.push(word);
  }
  return { words, next };
}

function makeDocument({ words, next }) {
  const parts = [];
  for (let i = 0; i < WORDS_PER_DOCUMENT; i += 1) parts.push(words[next() % words.length]);
  return parts.join(' ');
}

function timed(work) {
  const start = process.hrtime.bigint();
  const result = work();
  return { ms: Number(process.hrtime.bigint() - start) / 1e6, result };
}

function run(db, file) {
  db.exec(`CREATE TABLE docs (id TEXT PRIMARY KEY, body TEXT NOT NULL);
           CREATE VIRTUAL TABLE docs_search USING fts5(body);`);
  const source = wordSource();
  const addDoc = db.prepare('INSERT INTO docs VALUES (?, ?)');
  const addSearch = db.prepare('INSERT INTO docs_search VALUES (?)');
  let bytes = 0;
  const load = timed(() => {
    db.transaction(() => {
      for (let i = 0; i < DOCUMENTS; i += 1) {
        const body = makeDocument(source);
        bytes += Buffer.byteLength(body);
        addDoc.run(crypto.randomUUID(), body);
        addSearch.run(body);
      }
    })();
  });
  const query = db.prepare('SELECT count(*) AS hits FROM docs_search WHERE docs_search MATCH ?');
  const searches = [];
  for (let i = 0; i < 21; i += 1) searches.push(timed(() => query.get(source.words[i * 37])).ms);
  searches.sort((a, b) => a - b);
  const backup = timed(() => copyDatabase(db, file, `${file}.backup`));
  const check = timed(() => db.pragma('integrity_check', { simple: true }));
  return {
    documents: DOCUMENTS,
    textMB: +(bytes / 1e6).toFixed(1),
    loadSeconds: +(load.ms / 1000).toFixed(2),
    searchMs: +searches[10].toFixed(2),
    backupSeconds: +(backup.ms / 1000).toFixed(2),
    checkSeconds: +(check.ms / 1000).toFixed(2),
    checkPassed: check.result === 'ok',
    sizeMB: +(fs.statSync(file).size / 1e6).toFixed(1),
  };
}

function measure(dir) {
  fs.mkdirSync(dir, { recursive: true });

  const encryptedFile = path.join(dir, 'encrypted.db');
  const encrypted = openDatabase(encryptedFile, crypto.randomBytes(32));
  const encryptedResult = run(encrypted, encryptedFile);
  encrypted.close();

  const plainFile = path.join(dir, 'plain.db');
  const plain = new Database(plainFile);
  plain.pragma('journal_mode = WAL');
  plain.pragma('synchronous = FULL');
  const plainResult = run(plain, plainFile);
  plain.close();

  return { encrypted: encryptedResult, plain: plainResult };
}

module.exports = { measure };
