'use strict';
// Find my files: pick a folder, see the plan, fix it, bring it in, read the report.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { buildPlan } = require('./plan');
const { FolderRun } = require('./run');
const { scanFolder } = require('./scan');

const OUTCOMES = {
  chapters: 'Became chapters',
  older: 'Went into a chapter’s history',
  attachment: 'Kept as attachments',
  cover: 'Became book covers',
  duplicate: 'Exact copies of another file',
  bundled: 'Part of a Scrivener project',
  skipped: 'Left out',
  missing: 'Gone before they were reached',
};

class FolderImport {
  constructor() {
    this.state = null;
    this.stopping = false;
    this.running = false;
  }

  get title() {
    return path.basename(this.state.root) || 'Your files';
  }

  planNow() {
    return buildPlan({ title: this.title, entries: this.state.entries }, this.state.edits);
  }

  async view(workspace) {
    const plan = this.planNow();
    const { bavail, bsize } = await fs.promises.statfs(workspace.library.root);
    return { root: this.state.root, ...plan, freeBytes: bavail * bsize };
  }

  async scan(workspace, root, onProgress) {
    this.stopping = false;
    const entries = await scanFolder(root, { onProgress, shouldStop: () => this.stopping });
    this.state = { id: crypto.randomUUID(), root, entries, edits: { answers: {}, titles: {}, left: {}, roles: {}, moves: [] } };
    return this.view(workspace);
  }

  // Every edit is a small fact added to the list, and the plan is worked out again from it.
  edit(workspace, change) {
    if (!this.state) throw new Error('Choose a folder first.');
    const { edits } = this.state;
    if (change.type === 'answer') edits.answers[change.id] = String(change.value);
    else if (change.type === 'title') edits.titles[change.id] = String(change.value).trim().slice(0, 500) || 'Untitled';
    else if (change.type === 'leave') {
      if (change.left) edits.left[change.id] = true;
      else delete edits.left[change.id];
    } else if (change.type === 'role') edits.roles[change.id] = change.role === 'chapter' ? 'chapter' : 'attachment';
    else if (change.type === 'move') edits.moves.push({ id: String(change.id), to: String(change.to), before: change.before ?? null });
    else throw new Error('That change isn’t known.');
    return this.view(workspace);
  }

  stop() {
    this.stopping = true;
  }

  async run(workspace, onProgress) {
    if (!this.state) throw new Error('Choose a folder first.');
    if (this.running) throw new Error('An import is already running.');
    const project = workspace.open();
    const { id, root } = this.state;
    const plan = this.planNow();
    this.stopping = false;
    this.running = true;
    try {
      project.saveFolderImport({ id, root, state: JSON.stringify(this.state) });
      const run = new FolderRun({ workspace, importId: id, root, plan, shouldStop: () => this.stopping, onProgress });
      const finished = await run.run();
      project.finishFolderImport(id, finished ? 'done' : 'stopped');
      return { finished, report: this.report(workspace, id), outline: workspace.outline() };
    } finally {
      this.running = false;
    }
  }

  // A run that didn't finish, in the project that's open.
  pending(workspace) {
    const open = workspace.open().unfinishedFolderImport();
    return open ? { id: open.id, root: open.root, startedAt: open.startedAt } : null;
  }

  resume(workspace, onProgress) {
    const open = workspace.open().unfinishedFolderImport();
    if (!open) throw new Error('There is nothing to pick up.');
    this.state = JSON.parse(open.state);
    if (!fs.existsSync(this.state.root)) throw new Error('That folder isn’t there now. Connect it and try again.');
    return this.run(workspace, onProgress);
  }

  discard(workspace) {
    const open = workspace.open().unfinishedFolderImport();
    if (open) workspace.open().finishFolderImport(open.id, 'dropped');
  }

  report(workspace, id) {
    const { entries } = this.state;
    const rows = new Map(workspace.open().folderImportRows(id).map((row) => [row.fileId, row]));
    const plan = this.planNow();
    const lines = plan.files.map((file) => {
      const row = rows.get(file.id);
      return { rel: file.rel, outcome: row?.outcome ?? 'waiting', note: row?.note || file.reason };
    });
    const groups = Object.entries(OUTCOMES)
      .map(([outcome, label]) => ({ outcome, label, files: lines.filter((line) => line.outcome === outcome) }))
      .filter((group) => group.files.length);
    const waiting = lines.filter((line) => line.outcome === 'waiting').length;
    return { total: entries.length, accounted: entries.length - waiting, waiting, groups };
  }

  reportText(report) {
    const body = report.groups.flatMap((group) => [
      '',
      `${group.label} (${group.files.length})`,
      ...group.files.map((file) => `  ${file.rel}${file.note ? `  —  ${file.note}` : ''}`),
    ]);
    return [`Find my files: ${report.accounted} of ${report.total} files accounted for`, ...body, ''].join('\n');
  }
}

module.exports = { FolderImport };
