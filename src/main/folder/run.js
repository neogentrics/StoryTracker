'use strict';
// Carries out a plan, one file at a time. Each step is written down in the project as it happens, so a run can stop at any
// point, by choice or by a power cut, and pick up where it was. The originals are only ever read.
const fs = require('node:fs');
const path = require('node:path');
const { imageSize, readSource, sectionsOf } = require('../import');
const { documentOf, wordsIn } = require('../import/split');

const MAX_WRITING_BYTES = 200 * 1024 * 1024;
const pause = () => new Promise(setImmediate);
const sameTitle = (text) => String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', epub: 'application/epub+zip' };

class FolderRun {
  constructor({ workspace, importId, root, plan, shouldStop, onProgress }) {
    Object.assign(this, { workspace, importId, root, plan, shouldStop, onProgress });
    this.project = workspace.open();
    this.files = new Map(plan.files.map((file) => [file.id, file]));
    this.done = new Map(this.project.folderImportRows(importId).map((row) => [row.fileId, row]));
    this.count = plan.files.filter((file) => this.done.has(file.id)).length;
    this.stopped = false;
  }

  record(id, outcome, itemId = null, note = '') {
    this.project.recordFolderImport(this.importId, { fileId: id, outcome, itemId, note });
    this.done.set(id, { fileId: id, outcome, itemId, note });
    if (this.files.has(id)) this.count += 1;
  }

  async step(file, work) {
    if (this.shouldStop()) {
      this.stopped = true;
      return;
    }
    if (this.done.has(file.id)) return;
    this.onProgress({ done: this.count, total: this.plan.files.length, name: file.name });
    await work(this.full(file));
    await pause();
  }

  full(file) {
    return path.join(this.root, ...file.rel.split('/'));
  }

  // A file that can't be read as writing still has a place: it's kept as it is, and the report says why.
  async keep(file, parentId, note = '') {
    const full = this.full(file);
    if (!fs.existsSync(full)) {
      this.record(file.id, 'missing', null, 'It was gone by the time it was reached.');
      return;
    }
    const item = await this.project.addAttachment(parentId, { name: file.name, source: full, type: TYPES[file.extension] ?? '', from: file.rel });
    this.record(file.id, 'attachment', item.id, note);
  }

  itemFor(id) {
    return id === 'project' ? this.project.id : this.done.get(id)?.itemId;
  }

  makeNode(node, parentItem) {
    if (this.done.has(node.id)) return this.done.get(node.id).itemId;
    const project = this.project;
    let item;
    project.db.transaction(() => {
      item = project.addItem({ kind: node.kind, parentId: parentItem, title: node.title.slice(0, 500) });
      this.record(node.id, 'node', item.id);
    })();
    return item.id;
  }

  seriesDetails(book, series) {
    if (!series) return;
    const details = { seriesName: series.title, ...(book.number ? { seriesNumber: String(book.number) } : {}) };
    this.workspace.saveDetails({ id: this.itemFor(book.id), details: { ...this.workspace.getDetails(this.itemFor(book.id)).details, ...details } });
  }

  async addWriting(file, node, bookItem, parentItem) {
    await this.step(file, async (full) => {
      if (file.size > MAX_WRITING_BYTES) {
        await this.keep(file, bookItem, 'Too big to read as writing, so it was kept as it is.');
        return;
      }
      let source;
      try {
        source = await readSource(full);
      } catch (error) {
        await this.keep(file, bookItem, `It couldn’t be read as writing: ${error.message}`);
        return;
      }
      const whole = node.kind === 'whole' || node.split;
      const sections = sectionsOf(source, whole ? null : 'none', node.kind === 'whole' ? file.name : node.title);
      if (sections.length === 0 || sections.every((section) => section.type === 'part' || wordsIn(section.blocks) === 0)) {
        await this.keep(file, bookItem, 'There were no words in it.');
        return;
      }
      if (node.kind === 'chapter' && sections.length === 1) sections[0].title = node.title;
      this.project.db.transaction(() => {
        const made = this.workspace.importSections({
          target: { kind: 'book', id: bookItem, partId: parentItem === bookItem ? null : parentItem },
          sections,
          comments: source.comments,
          marks: source.context?.commentMarks,
        });
        this.record(file.id, 'chapters', made.first, made.chapters === 1 ? '' : `${made.chapters} chapters.`);
        this.madeChapters.set(node.id, made.made);
      })();
      for (const picture of source.pictures ?? []) {
        await this.project.addAttachment(bookItem, { name: picture.name, source: picture.data, type: picture.type, from: file.rel });
      }
    });
  }

  // An older file's chapters join the matching chapters' history. Anything with no match is kept as the file it is.
  async addOlder(file, node, bookItem) {
    await this.step(file, async (full) => {
      const chapters = this.madeChapters.get(node.id) ?? this.chaptersOf(node);
      let matched = 0;
      try {
        const source = await readSource(full);
        const whole = node.kind === 'whole' || node.split;
        const sections = sectionsOf(source, whole ? null : 'none', node.title).filter((section) => section.type === 'chapter');
        const at = new Date(file.mtime || Date.now()).toISOString();
        this.project.db.transaction(() => {
          for (const section of sections) {
            const chapter = chapters.length > 1 ? chapters.find((item) => sameTitle(item.title) === sameTitle(section.title)) : chapters[0];
            if (!chapter) continue;
            this.project.addOlderVersion(chapter.id, { title: section.title, body: JSON.stringify(documentOf(section.blocks)), at });
            matched += 1;
          }
          if (matched === sections.length && matched > 0) this.record(file.id, 'older', chapters[0].id, `Went into the history of ${matched === 1 ? 'its chapter' : `${matched} chapters`}.`);
        })();
        if (this.done.has(file.id)) return;
      } catch {
        // Kept as a file, below.
      }
      await this.keep(file, bookItem, matched ? 'An earlier version. Some of it matched no chapter, so the whole file was kept too.' : 'An earlier version that matched no chapter, so it was kept as it is.');
    });
  }

  chaptersOf(node) {
    const id = this.done.get(node.file)?.itemId;
    if (!id) return [];
    const first = this.project.getItem(id);
    return first ? this.project.listChildren(first.parentId).filter((item) => item.kind === 'chapter') : [];
  }

  async addCover(file, bookItem) {
    await this.step(file, async (full) => {
      const data = fs.readFileSync(full);
      const size = imageSize(data);
      if (size && !this.project.cover(bookItem)) {
        this.project.setCover(bookItem, { type: TYPES[file.extension], data, ...size });
        this.record(file.id, 'cover', bookItem);
      } else {
        await this.keep(file, bookItem);
      }
    });
  }

  async addAttachments(node, itemId) {
    for (const id of node.attachments) {
      const file = this.files.get(id);
      await this.step(file, () => this.keep(file, itemId));
      if (this.stopped) return;
    }
  }

  async walk(node, parentItem, bookItem, series) {
    for (const child of node.children) {
      if (this.stopped) return;
      if (child.kind === 'series') {
        const item = this.makeNode(child, parentItem);
        await this.addAttachments(child, item);
        await this.walk(child, item, null, child);
      } else if (child.kind === 'book') {
        const item = this.makeNode(child, parentItem);
        this.seriesDetails(child, series);
        await this.walk(child, item, item, null);
        if (child.cover) await this.addCover(this.files.get(child.cover), item);
        await this.addAttachments(child, item);
      } else if (child.kind === 'part') {
        await this.walk(child, this.makeNode(child, bookItem), bookItem, null);
      } else {
        await this.addWriting(this.files.get(child.file), child, bookItem, parentItem);
        for (const id of [...child.older].reverse()) await this.addOlder(this.files.get(id), child, bookItem);
      }
    }
  }

  async run() {
    this.madeChapters = new Map();
    await this.addAttachments(this.plan.tree, this.project.id);
    await this.walk(this.plan.tree, this.project.id, null, null);
    if (this.stopped) return false;
    for (const file of this.plan.files) {
      if (!this.done.has(file.id) && !file.node) this.record(file.id, file.role, null, file.reason);
    }
    const missed = this.plan.files.filter((file) => !this.done.has(file.id));
    for (const file of missed) this.record(file.id, 'skipped', null, file.reason || 'It had no place in the plan.');
    this.workspace.dropEmptyBooks();
    return true;
  }
}

module.exports = { FolderRun };
