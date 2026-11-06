'use strict';
// Pictures, audio and other files that belong to a project. They sit beside the database so a big file never slows the
// writing down, and each one is encrypted with a key made from the project's own key. A file's name is random, so the
// folder gives nothing away. What's in it, and what it's called, is only recorded in the encrypted database.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const ATTACHMENTS_DIR = 'attachments';
const MARKER = Buffer.from('RTATT1\n', 'latin1');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FILE_NAME = /^[0-9a-f-]{36}\.rtatt$/;

class AttachmentStore {
  constructor(dir, projectKey) {
    this.dir = dir;
    this.key = Buffer.from(crypto.hkdfSync('sha256', projectKey, Buffer.alloc(0), 'RT Story Tracker attachments', 32));
  }

  pathOf(file) {
    if (!FILE_NAME.test(file)) throw new Error('That attachment is damaged.');
    return path.join(this.dir, file);
  }

  // Takes a path, a Buffer or a stream. Written under a temporary name, so a crash can't leave half a file under the real one.
  async store(input) {
    fs.mkdirSync(this.dir, { recursive: true });
    const file = `${crypto.randomUUID()}.rtatt`;
    const target = this.pathOf(file);
    const temp = `${target}.tmp`;
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(file));
    const hash = crypto.createHash('sha256');
    let size = 0;
    const source = Buffer.isBuffer(input) ? Readable.from([input]) : typeof input === 'string' ? fs.createReadStream(input) : input;
    const seal = async function* seal(chunks) {
      yield MARKER;
      yield iv;
      for await (const chunk of chunks) {
        hash.update(chunk);
        size += chunk.length;
        yield cipher.update(chunk);
      }
      yield cipher.final();
      yield cipher.getAuthTag();
    };
    try {
      await pipeline(source, seal, fs.createWriteStream(temp));
      fs.renameSync(temp, target);
    } catch (error) {
      fs.rmSync(temp, { force: true });
      throw error;
    }
    return { file, size, sha256: hash.digest('hex') };
  }

  decipherFor(file) {
    const full = this.pathOf(file);
    const { size } = fs.statSync(full);
    const start = MARKER.length + IV_BYTES;
    if (size < start + TAG_BYTES) throw new Error('That attachment is damaged.');
    const handle = fs.openSync(full, 'r');
    const head = Buffer.alloc(start);
    const tag = Buffer.alloc(TAG_BYTES);
    try {
      fs.readSync(handle, head, 0, start, 0);
      fs.readSync(handle, tag, 0, TAG_BYTES, size - TAG_BYTES);
    } finally {
      fs.closeSync(handle);
    }
    if (!head.subarray(0, MARKER.length).equals(MARKER)) throw new Error('That attachment is damaged.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, head.subarray(MARKER.length));
    decipher.setAAD(Buffer.from(file));
    decipher.setAuthTag(tag);
    const end = size - TAG_BYTES - 1;
    return { decipher, source: end >= start ? fs.createReadStream(full, { start, end }) : Readable.from([]) };
  }

  // The file's contents as a stream, for moving it to another key. It fails at the end if the file has been damaged.
  reader(file) {
    const { decipher, source } = this.decipherFor(file);
    source.on('error', (error) => decipher.destroy(error));
    return source.pipe(decipher);
  }

  async read(file) {
    const { decipher, source } = this.decipherFor(file);
    const parts = [];
    for await (const chunk of source) parts.push(decipher.update(chunk));
    try {
      parts.push(decipher.final());
    } catch {
      throw new Error('That attachment is damaged.');
    }
    return Buffer.concat(parts);
  }

  // Nothing appears under the real name until the whole file has proved itself.
  async saveTo(file, destination) {
    const { decipher, source } = this.decipherFor(file);
    const temp = `${destination}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      await pipeline(source, decipher, fs.createWriteStream(temp));
      fs.renameSync(temp, destination);
    } catch {
      fs.rmSync(temp, { force: true });
      throw new Error('That attachment is damaged.');
    }
  }

  remove(file) {
    fs.rmSync(this.pathOf(file), { force: true });
  }

  // Anything in the folder that isn't on the list: a file no longer used, or a temporary one left by a crash.
  sweep(keep) {
    if (!fs.existsSync(this.dir)) return 0;
    const stray = fs.readdirSync(this.dir).filter((name) => !keep.has(name));
    stray.forEach((name) => fs.rmSync(path.join(this.dir, name), { force: true }));
    return stray.length;
  }
}

module.exports = { ATTACHMENTS_DIR, AttachmentStore, FILE_NAME };
