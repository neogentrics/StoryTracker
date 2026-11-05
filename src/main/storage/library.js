'use strict';
// The library: every project lives here, in the app's own storage and never in a synced folder, because an open
// database in OneDrive or Dropbox can be damaged. Closed .rtstory files are what travel.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { migrate, openDatabase } = require('./database');
const { createKeys, hasAppSlot, openWithAppSlot, writeFileSafely } = require('./keys');
const { Project } = require('./project');

const DATABASE_FILE = 'project.db';
const NEW_PREFIX = '.new-';
const SAMPLE_FILE = 'sample.json';

class Library {
  constructor(root, { now = () => new Date() } = {}) {
    this.root = root;
    this.projectsDir = path.join(root, 'projects');
    this.now = now;
    fs.mkdirSync(this.projectsDir, { recursive: true });
    this.deviceId = this.loadDeviceId();
  }

  // Each computer has its own ID, which is never synced or copied into a project backup.
  loadDeviceId() {
    const file = path.join(this.root, 'device.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).deviceId;
    const deviceId = crypto.randomUUID();
    writeFileSafely(file, `${JSON.stringify({ deviceId }, null, 2)}\n`);
    return deviceId;
  }

  projectDir(id) {
    return path.join(this.projectsDir, id);
  }

  open(dir, id, projectKey) {
    const file = path.join(dir, DATABASE_FILE);
    const db = openDatabase(file, projectKey);
    try {
      migrate(db, file, { now: this.now });
    } catch (error) {
      db.close();
      throw error;
    }
    return new Project(db, { id, file, deviceId: this.deviceId, now: this.now });
  }

  // Built under a temporary name, so a crash halfway through leaves nothing that looks like a project.
  createProject(title, { sample = false } = {}) {
    const id = crypto.randomUUID();
    const temp = path.join(this.projectsDir, `${NEW_PREFIX}${id}`);
    fs.mkdirSync(temp);
    const projectKey = createKeys(temp, id);
    const project = this.open(temp, id, projectKey);
    project.putItem({ id, kind: 'project', title });
    project.close();
    if (sample) writeFileSafely(path.join(temp, SAMPLE_FILE), '{}\n');
    fs.renameSync(temp, this.projectDir(id));
    return id;
  }

  openProject(id, projectKey = null) {
    const dir = this.projectDir(id);
    const key = projectKey ?? openWithAppSlot(dir);
    if (!key) throw new Error('This project is locked.');
    return this.open(dir, id, key);
  }

  listProjects() {
    return fs
      .readdirSync(this.projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(NEW_PREFIX))
      .map((entry) => this.describe(entry.name));
  }

  isSample(id) {
    return fs.existsSync(path.join(this.projectDir(id), SAMPLE_FILE));
  }

  // The sample is the only project that can be removed for now, because it holds nothing an author can't get back.
  removeSample(id) {
    if (!this.isSample(id)) throw new Error('Only the sample can be removed.');
    fs.rmSync(this.projectDir(id), { recursive: true, force: true, maxRetries: 5 });
  }

  describe(id) {
    try {
      if (!hasAppSlot(this.projectDir(id))) return { id, state: 'locked', title: null };
      const project = this.openProject(id);
      try {
        return { id, state: 'ready', sample: this.isSample(id), ...project.summary() };
      } finally {
        project.close();
      }
    } catch (error) {
      return { id, state: 'damaged', title: null, error: error.message };
    }
  }
}

module.exports = { DATABASE_FILE, Library };
