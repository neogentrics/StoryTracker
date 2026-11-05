'use strict';
// What the window can ask for. Everything from the window is checked here, because the storage trusts its callers.
const { parseDocument } = require('../shared/text');
const { SAMPLE_TITLE, fillSample } = require('./sample');

const MAX_TITLE = 500;
const MAX_BODY = 64 * 1024 * 1024;
const FIRST_CHAPTER = 'Chapter 1';

function cleanTitle(title, fallback) {
  if (typeof title !== 'string') throw new Error('A title has to be text.');
  return title.trim().slice(0, MAX_TITLE) || fallback;
}

function needId(id) {
  if (typeof id !== 'string' || !id) throw new Error('That item is missing.');
  return id;
}

class Workspace {
  constructor(library) {
    this.library = library;
    this.project = null;
  }

  listProjects() {
    return this.library
      .listProjects()
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  }

  createProject(title) {
    const name = cleanTitle(title, 'Untitled project');
    const id = this.library.createProject(name);
    const opened = this.openProject(id);
    const book = this.project.addItem({ kind: 'book', parentId: id, title: name });
    this.project.addItem({ kind: 'chapter', parentId: book.id, title: FIRST_CHAPTER });
    return { ...opened, outline: this.project.outline() };
  }

  createSample() {
    const id = this.library.createProject(SAMPLE_TITLE, { sample: true });
    const opened = this.openProject(id);
    fillSample(this.project);
    return { ...opened, outline: this.project.outline() };
  }

  openProject(id) {
    this.closeProject();
    this.project = this.library.openProject(needId(id));
    return { id, title: this.project.title(), outline: this.project.outline() };
  }

  closeProject() {
    this.project?.close();
    this.project = null;
  }

  removeSample(id) {
    if (this.project?.id === id) this.closeProject();
    this.library.removeSample(needId(id));
  }

  open() {
    if (!this.project) throw new Error('No project is open.');
    return this.project;
  }

  need(id) {
    const item = this.open().getItem(needId(id));
    if (!item) throw new Error("That item isn't in this project.");
    return item;
  }

  outline() {
    return this.open().outline();
  }

  addItem({ kind, parentId, title }) {
    const item = this.open().addItem({ kind, parentId: needId(parentId), title: cleanTitle(title, `New ${kind}`) });
    return { item: { id: item.id, kind: item.kind }, outline: this.outline() };
  }

  rename({ id, title }) {
    const item = this.need(id);
    this.project.putItem({ id, title: cleanTitle(title, item.title) });
    return this.outline();
  }

  move({ id, parentId, beforeId }) {
    this.need(id);
    this.project.moveItem(id, { parentId: needId(parentId), beforeId: beforeId ?? null });
    return this.outline();
  }

  // Only for things with no writing in them. Anything else waits for Trash, so no click can lose a chapter.
  removeEmpty(id) {
    const item = this.need(id);
    if (item.kind === 'project') throw new Error("A project can't be removed here.");
    const node = this.findInOutline(id);
    if (node.words > 0) throw new Error('This has writing in it, so it stays until Trash arrives.');
    this.project.removeItem(id);
    return this.outline();
  }

  findInOutline(id) {
    const walk = (node) => (node.id === id ? node : node.children.map(walk).find(Boolean));
    return walk(this.outline());
  }

  loadChapter(id) {
    const item = this.need(id);
    if (item.kind !== 'chapter') throw new Error("That isn't a chapter.");
    return { id: item.id, title: item.title, body: item.body, words: item.words };
  }

  saveChapter({ id, title, body }) {
    const item = this.need(id);
    if (item.kind !== 'chapter') throw new Error("That isn't a chapter.");
    if (typeof body !== 'string' || body.length > MAX_BODY) throw new Error("That chapter can't be saved.");
    if (body && !parseDocument(body)) throw new Error("That chapter can't be saved.");
    const saved = this.project.putItem({ id, title: cleanTitle(title, item.title), body });
    return { words: saved.words };
  }
}

module.exports = { Workspace };
