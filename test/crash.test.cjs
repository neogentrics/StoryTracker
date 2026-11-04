'use strict';
// Kills a writer hard, five times, and checks every save it reported is still there.
// Killing a process isn't the same as pulling the power: that stays a hand test, in the roadmap's v3.0.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Library } = require('../src/main/storage/library');

const ROUNDS = 5;

function writeUntilKilled(root, id, round) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'crash-writer.cjs'), root, id, String(round)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let errors = '';
    const killAfter = 40 + round * 11;
    child.stdout.on('data', (data) => {
      out += data;
      if (out.split('\n').length > killAfter) child.kill('SIGKILL');
    });
    child.stderr.on('data', (data) => {
      errors += data;
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal !== 'SIGKILL') reject(new Error(`Writer stopped by itself (${code}): ${errors}`));
      else resolve(out.split('\n').slice(0, -1));
    });
  });
}

test('every reported save survives a hard kill', { timeout: 120000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-crash-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  const root = path.join(dir, 'library');
  const id = new Library(root).createProject('Crash test');

  const saved = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    saved.push(...(await writeUntilKilled(root, id, round)));
    const project = new Library(root).openProject(id);
    try {
      assert.ok(project.check(), `integrity check after kill ${round + 1}`);
      const missing = saved.filter((itemId) => !project.getItem(itemId));
      assert.deepEqual(missing, [], `saves lost after kill ${round + 1}`);
    } finally {
      project.close();
    }
  }
  assert.ok(saved.length >= ROUNDS * 40);
});
