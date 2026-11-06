'use strict';
// The library: every project lives here, in the app's own storage and never in a synced folder, because an open
// database in OneDrive or Dropbox can be damaged. Closed .rtstory files are what travel.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { migrate, openDatabase, rekeyDatabase } = require('./database');
const { FORMAT, KEY_FILE, appKeyFrom, createKeys, hasApp, openWithAppSlot, read: readKeys, write: writeKeys, writeFileSafely } = require('./keys');
const { PackageError, extractPackage, readPackageHeader, readPackagePart, writePackage, writePackageLater } = require('./package');
const { ATTACHMENTS_DIR, AttachmentStore, FILE_NAME } = require('./attachments');
const { Project, TRASH_DAYS } = require('./project');

const DATABASE_FILE = 'project.db';
const NEW_PREFIX = '.new-';
const RELOCK_PREFIX = '.relock-';
const OLD_PREFIX = '.old-';
const LOCKED_TITLE = 'Locked project';
const SAMPLE_FILE = 'sample.json';
const TRASHED_FILE = 'trashed.json';
const DAY_MS = 86400000;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Windows refuses to move a folder while anything still has a file open in it, and a virus scanner often does, briefly.
async function moveFolder(from, to) {
  for (let tries = 0; ; tries += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (tries >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      await pause(250);
    }
  }
}

function flushFile(file) {
  const handle = fs.openSync(file, 'r+');
  try {
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

class Library {
  constructor(root, { now = () => new Date() } = {}) {
    this.root = root;
    this.projectsDir = path.join(root, 'projects');
    this.trashDir = path.join(root, 'trash');
    this.now = now;
    fs.mkdirSync(this.projectsDir, { recursive: true });
    fs.mkdirSync(this.trashDir, { recursive: true });
    this.deviceId = this.loadDeviceId();
    this.finishRelocks();
    this.purgeTrash();
  }

  // Tidies up after a power cut during a relock. Until the moment of the swap the old project is the real one, and after
  // it the new one is, so what's left over tells which.
  finishRelocks() {
    for (const name of fs.readdirSync(this.projectsDir)) {
      const full = path.join(this.projectsDir, name);
      if (name.startsWith(RELOCK_PREFIX)) fs.rmSync(full, { recursive: true, force: true, maxRetries: 5 });
      if (!name.startsWith(OLD_PREFIX)) continue;
      const home = this.projectDir(name.slice(OLD_PREFIX.length));
      if (fs.existsSync(home)) fs.rmSync(full, { recursive: true, force: true, maxRetries: 5 });
      else fs.renameSync(full, home);
    }
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
    const attachments = new AttachmentStore(path.join(dir, ATTACHMENTS_DIR), projectKey);
    return new Project(db, { id, file, deviceId: this.deviceId, attachments, now: this.now });
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

  appKey(id) {
    const key = openWithAppSlot(this.projectDir(id));
    if (!key) throw new Error('This project is locked.');
    return key;
  }

  openProject(id, projectKey = null) {
    return this.open(this.projectDir(id), id, projectKey ?? this.appKey(id));
  }

  keysOf(id) {
    return readKeys(this.projectDir(id));
  }

  isLocked(id) {
    return !hasApp(this.keysOf(id));
  }

  // Moves the whole project to a new key, with new ways in. This happens when a lock goes on or comes off, because the old
  // key can't be taken back: any copy or backup made before still holds it, and the app slot in those copies is public.
  // All of it is built beside the project and proved, then swapped in at once. The project must be closed.
  async relock(id, oldKey, makeKeys, { onProgress = () => {} } = {}) {
    const dir = this.projectDir(id);
    const stage = path.join(this.projectsDir, `${RELOCK_PREFIX}${id}`);
    const old = path.join(this.projectsDir, `${OLD_PREFIX}${id}`);
    const newKey = crypto.randomBytes(32);
    fs.rmSync(stage, { recursive: true, force: true, maxRetries: 5 });
    fs.mkdirSync(stage);
    try {
      await this.buildRelocked({ id, dir, stage, oldKey, newKey, makeKeys, onProgress });
      await moveFolder(dir, old);
      try {
        await moveFolder(stage, dir);
      } catch (error) {
        await moveFolder(old, dir);
        throw error;
      }
    } catch (error) {
      fs.rmSync(stage, { recursive: true, force: true, maxRetries: 5 });
      throw error;
    }
    // The swap has happened, so this can't fail the lock. Anything left is removed the next time the app starts.
    await fs.promises.rm(old, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => {});
    return newKey;
  }

  async buildRelocked({ id, dir, stage, oldKey, newKey, makeKeys, onProgress }) {
    const source = this.open(dir, id, oldKey);
    let staged = null;
    try {
      const files = source.attachmentFiles().filter((file) => fs.existsSync(source.attachments.pathOf(file)));
      const sizes = new Map(files.map((file) => [file, fs.statSync(source.attachments.pathOf(file)).size]));
      const total = [...sizes.values()].reduce((sum, size) => sum + size, 0) + fs.statSync(source.file).size;
      const { bavail, bsize } = await fs.promises.statfs(this.root);
      if (bavail * bsize < total * 1.05) throw new Error('There isn’t enough free disk space. This needs room for a second copy of the project while it works.');

      const database = path.join(stage, DATABASE_FILE);
      source.backupTo(database);
      rekeyDatabase(database, oldKey, newKey);
      writeKeys(stage, { format: FORMAT, projectId: id, ...(await makeKeys(newKey)) });
      staged = this.open(stage, id, newKey);

      let done = 0;
      const moved = [];
      for (const file of files) {
        const stored = await staged.attachments.store(source.attachments.reader(file));
        flushFile(staged.attachments.pathOf(stored.file));
        moved.push([file, stored.file]);
        done += sizes.get(file);
        onProgress({ done, total });
      }
      staged.renameAttachmentFiles(moved);
      if (!staged.check()) throw new Error('The new copy didn’t pass its check, so nothing has changed.');
    } finally {
      staged?.close();
      source.close();
    }
    if (this.isSample(id)) writeFileSafely(path.join(stage, SAMPLE_FILE), '{}\n');
  }

  listProjects() {
    return fs
      .readdirSync(this.projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
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

  // A whole project goes to the Trash as a folder, so it can come back exactly as it was. Each trip gets a folder of its
  // own, because the same project can be there twice: replacing one with a copy of itself sends the original here.
  trashProject(id) {
    const title = this.describe(id).title;
    writeFileSafely(path.join(this.projectDir(id), TRASHED_FILE), `${JSON.stringify({ at: this.now().toISOString(), title, projectId: id })}\n`);
    fs.renameSync(this.projectDir(id), path.join(this.trashDir, crypto.randomUUID()));
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

  // Folders from before 3.6 are named after their project, and their note doesn't say.
  restoreProject(trashId) {
    const source = path.join(this.trashDir, path.basename(trashId));
    const { projectId = path.basename(trashId) } = JSON.parse(fs.readFileSync(path.join(source, TRASHED_FILE), 'utf8'));
    if (fs.existsSync(this.projectDir(projectId))) throw new Error('This project is in your library already. Move that one to the Trash first, and it will wait here too.');
    fs.rmSync(path.join(source, TRASHED_FILE), { force: true });
    fs.renameSync(source, this.projectDir(projectId));
  }

  purgeTrash() {
    for (const project of this.trashedProjects()) {
      if (project.daysLeft === 0) fs.rmSync(path.join(this.trashDir, project.id), { recursive: true, force: true, maxRetries: 5 });
    }
  }

  packingList(id, project, temp, attachments) {
    project.backupTo(temp);
    const stored = attachments ? project.attachmentFiles() : [];
    return {
      projectId: id,
      files: [
        { name: KEY_FILE, source: path.join(this.projectDir(id), KEY_FILE) },
        { name: DATABASE_FILE, source: temp },
        ...stored
          .filter((name) => fs.existsSync(project.attachments.pathOf(name)))
          .map((name) => ({ name: `${ATTACHMENTS_DIR}/${name}`, source: project.attachments.pathOf(name) })),
      ],
    };
  }

  // Packs an open project, or a closed one found by its ID. A straight copy, so the file is as encrypted as the project.
  // Automatic backups leave attachments out and copy them beside the file instead, so a gigabyte of pictures isn't written
  // again every hour.
  packProject(id, file, open = null, { attachments = true } = {}) {
    const project = open ?? this.openProject(id);
    const temp = path.join(this.projectDir(id), `.pack-${crypto.randomUUID()}.db`);
    try {
      writePackage(file, this.packingList(id, project, temp, attachments));
    } finally {
      fs.rmSync(temp, { force: true });
      if (!open) project.close();
    }
  }

  // The same, without holding the window up. Packing a project with big attachments can take a while.
  async packProjectLater(id, file, open) {
    const temp = path.join(this.projectDir(id), `.pack-${crypto.randomUUID()}.db`);
    try {
      await writePackageLater(file, this.packingList(id, open, temp, true));
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }

  // Backups keep attachments in a folder beside them. They're only ever added to, so each is copied once.
  async copyAttachments(id, folder) {
    const from = path.join(this.projectDir(id), ATTACHMENTS_DIR);
    if (!fs.existsSync(from)) return 0;
    const to = path.join(folder, ATTACHMENTS_DIR);
    await fs.promises.mkdir(to, { recursive: true });
    let copied = 0;
    for (const name of await fs.promises.readdir(from)) {
      if (!FILE_NAME.test(name) || fs.existsSync(path.join(to, name))) continue;
      await fs.promises.copyFile(path.join(from, name), path.join(to, `${name}.tmp`));
      await fs.promises.rename(path.join(to, `${name}.tmp`), path.join(to, name));
      copied += 1;
    }
    return copied;
  }

  // The ways into a project file, without unpacking it.
  packageKeys(file) {
    const text = readPackagePart(file, KEY_FILE);
    if (!text) throw new PackageError('That project file is damaged.');
    try {
      return JSON.parse(text.toString('utf8'));
    } catch {
      throw new PackageError('That project file is damaged.');
    }
  }

  // Unpacks into a temporary folder and proves the project opens before it goes anywhere near the library. A locked file
  // needs its key first, and nothing is unpacked until it has one.
  importProject(file, { replace = false, projectKey = null } = {}) {
    const { projectId: id, files } = readPackageHeader(file);
    if (!/^[0-9a-f-]{36}$/.test(id) || !files.some((part) => part.name === DATABASE_FILE)) {
      throw new PackageError('That project file is damaged.');
    }
    const keys = this.packageKeys(file);
    const key = projectKey ?? appKeyFrom(keys);
    if (!key) {
      const error = new Error('This project is locked.');
      error.code = 'LOCKED';
      error.label = keys.label ?? '';
      throw error;
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
      this.bringAttachmentsBeside(file, temp);
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

  // A backup's attachments sit in a folder next to it.
  bringAttachmentsBeside(file, dir) {
    const beside = path.join(path.dirname(file), ATTACHMENTS_DIR);
    if (!fs.existsSync(beside)) return;
    fs.mkdirSync(path.join(dir, ATTACHMENTS_DIR), { recursive: true });
    for (const name of fs.readdirSync(beside)) {
      const target = path.join(dir, ATTACHMENTS_DIR, name);
      if (FILE_NAME.test(name) && !fs.existsSync(target)) fs.copyFileSync(path.join(beside, name), target);
    }
  }

  describe(id) {
    try {
      const keys = this.keysOf(id);
      if (!hasApp(keys)) return { id, state: 'locked', title: keys.label || LOCKED_TITLE };
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
