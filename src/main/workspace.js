'use strict';
// What the window can ask for. Everything from the window is checked here, because the storage trusts its callers.
const path = require('node:path');
const { findInDocument, replaceInDocument } = require('../shared/find');
const { findNode } = require('../shared/outline');
const { parseDocument, toDocument } = require('../shared/text');
const { SAMPLE_TITLE, fillSample } = require('./sample');

const MAX_TITLE = 500;
const MAX_BODY = 64 * 1024 * 1024;
const FIRST_CHAPTER = 'Chapter 1';
const MAX_GOAL = 10000000;
const MAX_RESULTS = 500;

function cleanTitle(title, fallback) {
  if (typeof title !== 'string') throw new Error('A title has to be text.');
  return title.trim().slice(0, MAX_TITLE) || fallback;
}

function cleanComment(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('A comment needs some words.');
  return text.trim().slice(0, 20000);
}

function needId(id) {
  if (typeof id !== 'string' || !id) throw new Error('That item is missing.');
  return id;
}

class Workspace {
  constructor(library) {
    this.library = library;
    this.project = null;
    this.lastReplace = null;
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
    this.lastReplace = null;
    return { id, title: this.project.title(), outline: this.project.outline(), progress: this.progress() };
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
    return { id: item.id, title: item.title, body: item.body, words: item.words, goal: item.goal };
  }

  saveChapter({ id, title, body }) {
    const item = this.need(id);
    if (item.kind !== 'chapter') throw new Error("That isn't a chapter.");
    if (typeof body !== 'string' || body.length > MAX_BODY) throw new Error("That chapter can't be saved.");
    if (body && !parseDocument(body)) throw new Error("That chapter can't be saved.");
    const saved = this.project.putItem({ id, title: cleanTitle(title, item.title), body });
    this.project.addDayWords(saved.words - item.words);
    return { words: saved.words, progress: this.progress() };
  }

  progress() {
    const project = this.open();
    return { today: project.wordsToday(), dailyGoal: project.getItem(project.id)?.goal ?? 0 };
  }

  // A daily goal lives on the project, and a chapter's goal on that chapter.
  setGoal({ id, goal }) {
    const item = this.need(id);
    if (item.kind !== 'project' && item.kind !== 'chapter') throw new Error("That can't have a goal.");
    if (!Number.isInteger(goal) || goal < 0 || goal > MAX_GOAL) throw new Error('A goal has to be a whole number.');
    this.project.putItem({ id, goal });
    return this.progress();
  }

  // Comments live beside the chapter, so they stay out of its text, its word count and anything exported from it.
  listComments(chapterId) {
    const chapter = this.need(chapterId);
    if (chapter.kind !== 'chapter') throw new Error("That isn't a chapter.");
    return this.project.listChildren(chapterId).map((item) => ({ id: item.id, text: item.title, createdAt: item.createdAt }));
  }

  addComment({ chapterId, text }) {
    const comment = this.open().addItem({ kind: 'comment', parentId: needId(chapterId), title: cleanComment(text) });
    return { id: comment.id, text: comment.title, createdAt: comment.createdAt };
  }

  editComment({ id, text }) {
    if (this.need(id).kind !== 'comment') throw new Error("That isn't a comment.");
    this.project.putItem({ id, title: cleanComment(text) });
  }

  removeComment(id) {
    if (this.need(id).kind !== 'comment') throw new Error("That isn't a comment.");
    this.project.removeItem(id);
  }

  chaptersIn({ scope, bookId }) {
    const project = this.open();
    const all = project.chapters();
    if (scope === 'project') return this.inReadingOrder(all);
    if (scope !== 'book') throw new Error('Search this book or this project.');
    const book = findNode(this.outline(), needId(bookId));
    if (!book) throw new Error("That book isn't in this project.");
    return this.inReadingOrder(all, book);
  }

  inReadingOrder(chapters, root = this.outline()) {
    const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
    const walk = (node) => (node.kind === 'chapter' ? [byId.get(node.id)] : node.children.flatMap(walk));
    return walk(root).filter(Boolean);
  }

  search({ scope, bookId, query, matchCase, wholeWord }) {
    if (typeof query !== 'string' || !query) return { results: [], total: 0 };
    const options = { matchCase: Boolean(matchCase), wholeWord: Boolean(wholeWord) };
    const results = [];
    let total = 0;
    for (const chapter of this.chaptersIn({ scope, bookId })) {
      const found = findInDocument(toDocument(chapter.body), query, options);
      if (found.length === 0) continue;
      total += found.length;
      if (results.length < MAX_RESULTS) {
        results.push({ chapterId: chapter.id, title: chapter.title, count: found.length, first: found[0] });
      }
    }
    return { results, total };
  }

  // A copy of the whole project is kept first, and the old chapters stay in memory so one click can put them back.
  replaceAll({ scope, bookId, query, replacement, matchCase, wholeWord }) {
    if (typeof query !== 'string' || !query || typeof replacement !== 'string') throw new Error('Type what to find.');
    const options = { matchCase: Boolean(matchCase), wholeWord: Boolean(wholeWord) };
    const project = this.open();
    const chapters = this.chaptersIn({ scope, bookId });
    project.backupTo(path.join(path.dirname(project.file), 'backups', 'before-replace.db'));
    const old = [];
    let count = 0;
    project.db.transaction(() => {
      for (const chapter of chapters) {
        const changed = replaceInDocument(toDocument(chapter.body), query, replacement, options);
        if (changed.count === 0) continue;
        old.push({ id: chapter.id, body: chapter.body });
        count += changed.count;
        project.putItem({ id: chapter.id, body: JSON.stringify(changed.document) });
      }
    })();
    this.lastReplace = old.length ? old : null;
    return { count, chapters: old.length, outline: this.outline() };
  }

  undoReplace() {
    if (!this.lastReplace) throw new Error('There is nothing to put back.');
    const project = this.open();
    project.db.transaction(() => {
      for (const { id, body } of this.lastReplace) project.putItem({ id, body });
    })();
    this.lastReplace = null;
    return { outline: this.outline() };
  }
}

module.exports = { Workspace };
