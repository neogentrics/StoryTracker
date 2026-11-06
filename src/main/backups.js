'use strict';
// Automatic backups: each project that has changed goes to the folder the author chose, as a closed .rtstory file. A
// closed file is safe in OneDrive or Dropbox, where a live database isn't. Nothing runs until a folder is chosen.
const fs = require('node:fs');
const path = require('node:path');
const { writeFileSafely } = require('./storage/keys');

const STATE_FILE = 'backups.json';
const EVERY_MS = { hour: 3600000, day: 86400000, week: 604800000 };
const CHECK_MS = 10 * 60 * 1000;
const FIRST_CHECK_MS = 30 * 1000;
const FILE_ENDING = '.rtstory';

const stamp = (date) => date.toISOString().replace(/[:.]/g, '-');

const LOCKED_NAME = 'Locked project';
const shownName = ({ title, state }) => (state === 'locked' ? LOCKED_NAME : title ?? 'Project');

// A locked project's title stays inside it, so its backups can't be named after it.
function folderName(project) {
  const { id } = project;
  const clean = String(shownName(project)).replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${clean || 'Project'} ${id.slice(0, 8)}`;
}

class Backups {
  constructor(workspace, settings, { now = () => new Date() } = {}) {
    this.workspace = workspace;
    this.settings = settings;
    this.now = now;
    this.file = path.join(workspace.library.root, STATE_FILE);
    this.state = this.read();
    this.lastError = null;
    this.timers = [];
    this.copying = Promise.resolve();
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return { projects: {} };
    }
  }

  write() {
    writeFileSafely(this.file, `${JSON.stringify(this.state, null, 2)}\n`);
  }

  start() {
    this.timers.push(setTimeout(() => this.runIfDue(), FIRST_CHECK_MS));
    this.timers.push(setInterval(() => this.runIfDue(), CHECK_MS));
    this.timers.forEach((timer) => timer.unref());
  }

  stop() {
    this.timers.forEach(clearTimeout);
  }

  status() {
    const times = Object.values(this.state.projects).map((item) => item.at).filter(Boolean).sort();
    return { last: times.at(-1) ?? null, error: this.lastError };
  }

  due(project) {
    const { backupEvery } = this.settings.values;
    const last = this.state.projects[project.id];
    if (!last) return true;
    if (last.updatedAt === project.updatedAt) return false;
    return this.now().getTime() - new Date(last.at).getTime() >= EVERY_MS[backupEvery];
  }

  runIfDue() {
    const { backupEvery, backupFolder } = this.settings.values;
    if (backupEvery === 'off' || !backupFolder) return { saved: 0 };
    return this.run((project) => this.due(project));
  }

  // Backing up again when nothing has changed would only push older copies out.
  runNow() {
    if (!this.settings.values.backupFolder) throw new Error('Choose a folder first.');
    return this.run((project) => this.state.projects[project.id]?.updatedAt !== project.updatedAt);
  }

  run(wanted) {
    const { backupFolder, backupKeep } = this.settings.values;
    let saved = 0;
    this.lastError = null;
    for (const listed of this.workspace.library.listProjects()) {
      const project = this.reachable(listed);
      if (!project || !wanted(project)) continue;
      try {
        const dir = path.join(backupFolder, folderName(project));
        fs.mkdirSync(dir, { recursive: true });
        this.workspace.packProject(project.id, path.join(dir, `${stamp(this.now())}${FILE_ENDING}`), { attachments: false });
        this.copyAttachments(project, dir);
        this.keepNewest(dir, backupKeep);
        this.state.projects[project.id] = { at: this.now().toISOString(), updatedAt: project.updatedAt };
        saved += 1;
      } catch (error) {
        this.lastError = `${shownName(project)}: ${error.message}`;
      }
    }
    if (saved) this.write();
    return { saved, error: this.lastError };
  }

  // A locked project can only be backed up while it's open, which is also the only time it can change.
  reachable(project) {
    if (project.state === 'ready') return project;
    const open = this.workspace.project;
    return project.state === 'locked' && open?.id === project.id ? { ...open.summary(), id: project.id, state: 'locked' } : null;
  }

  // Every folder of this project's from before it was locked, whatever it was called at the time.
  earlierFolders(id) {
    const { backupFolder } = this.settings.values;
    if (!backupFolder || !fs.existsSync(backupFolder)) return [];
    return fs
      .readdirSync(backupFolder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(` ${id.slice(0, 8)}`) && !entry.name.startsWith(LOCKED_NAME))
      .map((entry) => path.join(backupFolder, entry.name));
  }

  countIn(folder) {
    return fs.existsSync(folder) ? fs.readdirSync(folder).filter((name) => name.endsWith(FILE_ENDING)).length : 0;
  }

  // A newly locked project goes straight to a new backup, so the older unlocked ones aren't the only copies.
  backupNew(id) {
    delete this.state.projects[id];
    return this.settings.values.backupFolder ? this.run((project) => project.id === id) : { saved: 0 };
  }

  // Can take a while the first time, so it carries on behind the app.
  copyAttachments(project, dir) {
    this.copying = this.copying
      .then(() => this.workspace.library.copyAttachments(project.id, dir))
      .catch((error) => { this.lastError = `${shownName(project)}: ${error.message}`; });
  }

  keepNewest(dir, keep) {
    const files = fs.readdirSync(dir).filter((name) => name.endsWith(FILE_ENDING)).sort().reverse();
    for (const name of files.slice(keep)) fs.rmSync(path.join(dir, name), { force: true });
  }
}

module.exports = { Backups };
