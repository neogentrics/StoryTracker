'use strict';
// The library: every project lives here, in the app's own storage and never in a synced folder, because an open
// database in OneDrive or Dropbox can be damaged. Closed .rtstory files are what travel.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { migrate, openDatabase } = require('./database');
const { createKeys, hasAppSlot, openWithAppSlot, writeFileSafely } = require('./keys');
const { PackageError, extractPackage, readPackageHeader, writePackage } = require('./package');
const { Project, TRASH_DAYS } = require('./project');

const DATABASE_FILE = 'project.db';
const NEW_PREFIX = '.new-';
const SAMPLE_FILE = 'sample.json';
const KEY_FILE = 'keys.json';
const TRASHED_FILE = 'trashed.json';
const DAY_MS = 86400000;

class Library {
  constructor(root, { now = () => new Date() } = {}) {
    this.root = root;
    this.projectsDir = path.join(root, 'projects');
    this.trashDir = path.join(root, 'trash');
    this.now = now;
    fs.mkdirSync(this.projectsDir, { recursive: true });
    fs.mkdirSync(this.trashDir, { recursive: true });
    this.deviceId = this.loadDeviceId();
    this.purgeTrash();
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

  // A whole project goes to the Trash as a folder, so it can come back exactly as it was.
  trashProject(id) {
    const title = this.describe(id).title;
    writeFileSafely(path.join(this.projectDir(id), TRASHED_FILE), `${JSON.stringify({ at: this.now().toISOString(), title })}\n`);
    const target = path.join(this.trashDir, id);
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5 });
    fs.renameSync(this.projectDir(id), target);
  }

  trashedProjects() {
    return fs
      .readdirSync(this.trashDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        try {
          const { at, title } = JSON.parse(fs.readFileSync(path.join(this.trashDir, entry.name, TRASHED_FILE), 'utf8'));
          const left = TRASH_DAYS - (this.now().getTime() - new Date(at).getTime()) / DAY_MS;
          return [{ id: entry.name, title, trashedAt: at, daysLeft: Math.max(0, Math.ceil(left)) }];
        } catch {
          return []; // A folder that can't be read is left alone, and never stops the library opening.
        }
      })
      .sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
  }

  restoreProject(id) {
    if (fs.existsSync(this.projectDir(id))) throw new Error('A project with this ID is already in the library.');
    const source = path.join(this.trashDir, id);
    fs.rmSync(path.join(source, TRASHED_FILE), { force: true });
    fs.renameSync(source, this.projectDir(id));
  }

  purgeTrash() {
    for (const project of this.trashedProjects()) {
      if (project.daysLeft === 0) fs.rmSync(path.join(this.trashDir, project.id), { recursive: true, force: true, maxRetries: 5 });
    }
  }

  // Packs an open project, or a closed one found by its ID. A straight copy, so the file is as encrypted as the project.
  packProject(id, file, open = null) {
    const project = open ?? this.openProject(id);
    const temp = path.join(this.projectDir(id), `.pack-${crypto.randomUUID()}.db`);
    try {
      project.backupTo(temp);
      writePackage(file, {
        projectId: id,
        files: [
          { name: KEY_FILE, source: path.join(this.projectDir(id), KEY_FILE) },
          { name: DATABASE_FILE, source: temp },
        ],
      });
    } finally {
      fs.rmSync(temp, { force: true });
      if (!open) project.close();
    }
  }

  // Unpacks into a temporary folder and proves the project opens before it goes anywhere near the library.
  importProject(file, { replace = false } = {}) {
    const { projectId: id, files } = readPackageHeader(file);
    if (!/^[0-9a-f-]{36}$/.test(id) || !files.some((part) => part.name === DATABASE_FILE)) {
      throw new PackageError('That project file is damaged.');
    }
    const exists = fs.existsSync(this.projectDir(id));
    if (exists && !replace) {
      const error = new Error('You already have this project.');
      error.code = 'EXISTS';
      error.title = this.describe(id).title;
      throw error;
    }
    const temp = path.join(this.projectsDir, `${NEW_PREFIX}${crypto.randomUUID()}`);
    fs.mkdirSync(temp);
    try {
      extractPackage(file, temp);
      const key = openWithAppSlot(temp);
      if (!key) throw new PackageError('This project is locked.');
      const project = this.open(temp, id, key);
      try {
        if (!project.check()) throw new PackageError('That project file is damaged.');
      } finally {
        project.close();
      }
      if (exists) this.trashProject(id);
      fs.renameSync(temp, this.projectDir(id));
      return id;
    } catch (error) {
      fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5 });
      throw error;
    }
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
