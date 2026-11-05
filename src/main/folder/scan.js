'use strict';
// Looks through a folder and only ever reads. Links aren't followed, so a scan can't wander out of the folder it was given.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const hashOf = async (file) => {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
};

async function walk(root, onFile, shouldStop) {
  const entries = [];
  const queue = [''];
  while (queue.length) {
    if (shouldStop()) throw new Error('Stopped.');
    const rel = queue.shift();
    let listed;
    try {
      listed = await fs.promises.readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      entries.push({ rel: rel || '.', size: 0, mtime: 0, error: true });
      continue;
    }
    for (const entry of listed) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        queue.push(child);
      } else if (entry.isFile()) {
        try {
          const { size, mtimeMs } = await fs.promises.stat(path.join(root, child));
          entries.push({ rel: child, size, mtime: Math.round(mtimeMs) });
        } catch {
          entries.push({ rel: child, size: 0, mtime: 0, error: true });
        }
        onFile(entries.length);
      }
    }
  }
  return entries;
}

// Only files of the same size can be the same file, so most files never need reading at all.
async function markDuplicates(root, entries, onFile, shouldStop) {
  const bySize = new Map();
  for (const entry of entries) {
    if (entry.size > 0 && !entry.error) bySize.set(entry.size, [...(bySize.get(entry.size) ?? []), entry]);
  }
  const twins = [...bySize.values()].filter((group) => group.length > 1).flat();
  let done = 0;
  for (const entry of twins) {
    if (shouldStop()) throw new Error('Stopped.');
    try {
      entry.sha256 = await hashOf(path.join(root, entry.rel));
    } catch {
      entry.error = true;
    }
    done += 1;
    onFile(done, twins.length);
  }
}

async function scanFolder(root, { onProgress = () => {}, shouldStop = () => false } = {}) {
  const entries = await walk(root, (found) => onProgress({ stage: 'looking', found }), shouldStop);
  await markDuplicates(root, entries, (done, total) => onProgress({ stage: 'comparing', found: entries.length, done, total }), shouldStop);
  return entries;
}

module.exports = { scanFolder };
