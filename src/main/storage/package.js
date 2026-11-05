'use strict';
// The .rtstory file: a whole project in one file, for backups and moving to another computer.
// It's a marker, a small header in plain JSON, then the project's files one after another. The database inside is the
// same encrypted file the library uses, so a .rtstory file is exactly as private as the project. The header holds no
// title and no writing, only sizes and checksums, and checksums are how a damaged copy gets caught.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MARKER = Buffer.from('RTSTORY\n', 'latin1');
const FORMAT = 1;
const CHUNK = 1024 * 1024;
const MAX_HEADER = 1024 * 1024;

class PackageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PackageError';
  }
}

function hashOf(file) {
  const hash = crypto.createHash('sha256');
  const handle = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(CHUNK);
  try {
    for (let read = fs.readSync(handle, buffer); read > 0; read = fs.readSync(handle, buffer)) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest('hex');
}

// Built under a temporary name, so a crash or a full disk can't leave half a backup under the real name.
function writePackage(destination, { projectId, files }) {
  const parts = files.map(({ name, source }) => ({ name, source, size: fs.statSync(source).size, sha256: hashOf(source) }));
  const header = Buffer.from(
    JSON.stringify({
      format: FORMAT,
      projectId,
      files: parts.map(({ name, size, sha256 }) => ({ name, size, sha256 })),
    }),
    'utf8',
  );
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);

  const temp = `${destination}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const out = fs.openSync(temp, 'w');
  const buffer = Buffer.alloc(CHUNK);
  try {
    fs.writeSync(out, MARKER);
    fs.writeSync(out, length);
    fs.writeSync(out, header);
    for (const { source } of parts) {
      const input = fs.openSync(source, 'r');
      try {
        for (let read = fs.readSync(input, buffer); read > 0; read = fs.readSync(input, buffer)) {
          fs.writeSync(out, buffer, 0, read);
        }
      } finally {
        fs.closeSync(input);
      }
    }
    fs.fsyncSync(out);
    fs.closeSync(out);
    fs.renameSync(temp, destination);
  } catch (error) {
    try {
      fs.closeSync(out);
    } catch {
      // Already closed.
    }
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

function readHeader(handle) {
  const start = Buffer.alloc(MARKER.length + 4);
  if (fs.readSync(handle, start, 0, start.length, 0) !== start.length || !start.subarray(0, MARKER.length).equals(MARKER)) {
    throw new PackageError("That isn't an RT Story Tracker project file.");
  }
  const length = start.readUInt32BE(MARKER.length);
  if (length === 0 || length > MAX_HEADER) throw new PackageError('That project file is damaged.');
  const text = Buffer.alloc(length);
  if (fs.readSync(handle, text, 0, length, start.length) !== length) throw new PackageError('That project file is damaged.');
  let header;
  try {
    header = JSON.parse(text.toString('utf8'));
  } catch {
    throw new PackageError('That project file is damaged.');
  }
  if (header.format > FORMAT) throw new PackageError('That project file was made by a newer version of the app.');
  if (!Array.isArray(header.files) || typeof header.projectId !== 'string') throw new PackageError('That project file is damaged.');
  return { header, bodyStart: start.length + length };
}

function readPackageHeader(file) {
  const handle = fs.openSync(file, 'r');
  try {
    return readHeader(handle).header;
  } finally {
    fs.closeSync(handle);
  }
}

// Only plain names can come out of a file: one that tried to reach another folder would be a trap, not a project.
function safeName(name) {
  if (typeof name !== 'string' || !name || name !== path.basename(name) || name === '.' || name === '..') {
    throw new PackageError('That project file is damaged.');
  }
  return name;
}

function extractPackage(file, destination) {
  const handle = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(CHUNK);
  try {
    const { header, bodyStart } = readHeader(handle);
    let position = bodyStart;
    for (const part of header.files) {
      const target = path.join(destination, safeName(part.name));
      const out = fs.openSync(target, 'w');
      const hash = crypto.createHash('sha256');
      try {
        let left = part.size;
        while (left > 0) {
          const read = fs.readSync(handle, buffer, 0, Math.min(CHUNK, left), position);
          if (read === 0) throw new PackageError('That project file is cut short.');
          hash.update(buffer.subarray(0, read));
          fs.writeSync(out, buffer, 0, read);
          position += read;
          left -= read;
        }
        fs.fsyncSync(out);
      } finally {
        fs.closeSync(out);
      }
      if (hash.digest('hex') !== part.sha256) throw new PackageError('That project file is damaged.');
    }
    return header;
  } finally {
    fs.closeSync(handle);
  }
}

module.exports = { PackageError, extractPackage, readPackageHeader, writePackage };
