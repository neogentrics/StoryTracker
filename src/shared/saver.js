'use strict';
// Saving by itself. A pause in the typing saves after two seconds, and steady typing still saves every five, so at most
// a few seconds of work are ever only in memory. Saves run one at a time, in order. A failed save stays dirty and tries
// again, and flush() refuses to pretend it worked.

const QUIET_MS = 2000;
const LONGEST_MS = 5000;
const RETRY_MS = 5000;

class Saver {
  constructor({ read, write, onState, timers = globalThis }) {
    this.read = read;
    this.write = write;
    this.onState = onState;
    this.timers = timers;
    this.dirty = false;
    this.running = null;
    this.quietTimer = null;
    this.longestTimer = null;
  }

  touch() {
    this.dirty = true;
    this.onState('unsaved');
    this.timers.clearTimeout(this.quietTimer);
    this.quietTimer = this.timers.setTimeout(() => this.runQuietly(), QUIET_MS);
    this.longestTimer ??= this.timers.setTimeout(() => this.runQuietly(), LONGEST_MS);
  }

  clearTimers() {
    this.timers.clearTimeout(this.quietTimer);
    this.timers.clearTimeout(this.longestTimer);
    this.quietTimer = null;
    this.longestTimer = null;
  }

  run() {
    this.clearTimers();
    this.running ??= this.saveUntilClean().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  // From a timer nobody is waiting, and the failure has already been shown through onState.
  runQuietly() {
    this.run().catch(() => {});
  }

  async saveUntilClean() {
    while (this.dirty) {
      this.dirty = false;
      this.onState('saving');
      try {
        await this.write(this.read());
      } catch (error) {
        this.dirty = true;
        this.onState('failed', error);
        this.quietTimer = this.timers.setTimeout(() => this.runQuietly(), RETRY_MS);
        throw error;
      }
    }
    this.onState('saved');
  }

  // Resolves once everything is on disk, and rejects if it couldn't be saved.
  async flush() {
    if (this.running) await this.running.catch(() => {});
    if (this.dirty) await this.run();
  }
}

module.exports = { LONGEST_MS, QUIET_MS, RETRY_MS, Saver };
