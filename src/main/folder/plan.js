'use strict';
// Works out what a folder is, from a list of what's in it. The plan is rebuilt from that list and the author's edits every
// time, so it has no state of its own, an edit can never leave it half changed, and every file always has a place.
const crypto = require('node:crypto');
const signs = require('./signs');

const WHOLE_NAME = /\b(manuscript|full|complete|whole|combined|compiled|master)\b/i;
const COVER_NAME = /\bcover\b/i;
const NOT_FRONT = /\b(back|spine|wrap|full|thumb|thumbnail|mock-?up|old)\b/i;
const COVER_TYPES = new Set(['png', 'jpg', 'jpeg']);

const idOf = (prefix, text) => `${prefix}-${crypto.createHash('sha1').update(text).digest('hex').slice(0, 14)}`;
const byName = (a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true, sensitivity: 'base' });

function prepare(entry) {
  const parts = entry.rel.split('/');
  const name = parts.at(-1);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const folders = parts.slice(0, -1);
  const version = signs.versionOf(stem);
  return {
    ...entry,
    id: idOf('f', entry.rel),
    name,
    stem,
    extension,
    folders,
    version,
    kind: signs.kindOf(extension),
    inOldFolder: folders.some((folder) => signs.OLD_FOLDER.test(signs.tidy(folder))),
    role: null,
    node: null,
    reason: '',
  };
}

function folderTree(files) {
  const root = { rel: '', name: '', files: [], folders: new Map() };
  for (const file of files) {
    let at = root;
    for (const name of file.folders) {
      if (!at.folders.has(name)) at.folders.set(name, { rel: at.rel ? `${at.rel}/${name}` : name, name, files: [], folders: new Map() });
      at = at.folders.get(name);
    }
    at.files.push(file);
  }
  return root;
}

const subfolders = (folder) => [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
const filesUnder = (folder) => [...folder.files, ...subfolders(folder).flatMap(filesUnder)];
const isWriting = (file) => !file.role && file.kind === 'writing' && !isNotes(file);
const isSupport = (folder) => signs.SUPPORT_FOLDER.test(signs.tidy(folder.name)) || Boolean(signs.partOf(folder.name));

function isNotes(file) {
  return signs.NOTES_NAME.test(file.version.rest) || file.folders.some((folder) => signs.NOTES_FOLDER.test(signs.tidy(folder)));
}

function writingNear(folder) {
  return [...folder.files.filter(isWriting), ...subfolders(folder).filter(isSupport).flatMap(writingNear)];
}

// Book 1 - X.docx, Book 2 - Y.docx: one file per book, with the folder as their series.
function booksByFile(folder) {
  const groups = new Map();
  for (const file of folder.files.filter(isWriting)) {
    const book = signs.bookOf(file.version.rest);
    if (book) groups.set(book.number, [...(groups.get(book.number) ?? []), file]);
  }
  return groups.size >= 2 ? groups : null;
}

function isBook(folder) {
  if (folder.isBook !== undefined) return folder.isBook;
  const decide = () => {
    if (signs.bookOf(folder.name)) return true;
    if (isSupport(folder) || signs.SERIES_NAME.test(signs.tidy(folder.name)) || booksByFile(folder)) return false;
    if (writingNear(folder).length === 0) return false;
    return !subfolders(folder).some((child) => !isSupport(child) && holdsBook(child));
  };
  folder.isBook = decide();
  return folder.isBook;
}

function holdsBook(folder) {
  return isBook(folder) || subfolders(folder).some(holdsBook);
}

class Planner {
  constructor(entries, edits) {
    this.edits = { answers: {}, titles: {}, left: {}, roles: {}, moves: [], ...edits };
    this.files = entries.map(prepare);
    this.asks = [];
    this.project = { id: 'project', kind: 'project', title: '', children: [], attachments: [] };
  }

  node(kind, key, title, parent, extra = {}) {
    const id = idOf(kind[0], `${kind}:${key}`);
    const made = { id, kind, title: this.edits.titles[id] ?? title, children: [], attachments: [], ...extra };
    parent.children.push(made);
    return made;
  }

  place(file, role, node, reason = '') {
    Object.assign(file, { role, node: node?.id ?? null, reason });
  }

  attach(file, node, reason = '') {
    this.place(file, 'attachment', node, reason);
    node.attachments.push(file.id);
  }

  ask(ask) {
    const value = this.edits.answers[ask.id];
    const known = ask.options.some((option) => option.value === value);
    const made = { ...ask, value: known ? value : ask.value, answered: known };
    this.asks.push(made);
    return made.value;
  }

  // Files that don't need a look at their folder: noise, exact copies, and what's inside a Scrivener project.
  sort() {
    const seen = new Map();
    for (const file of [...this.files].sort(byName)) {
      const scrivener = file.folders.findIndex((folder) => /\.scriv$/i.test(folder));
      if (file.error) this.place(file, 'skipped', null, 'It couldn’t be read.');
      else if (signs.NOISE_FILE.test(file.name) || file.folders.some((folder) => signs.NOISE_FOLDER.test(folder))) this.place(file, 'skipped', null, 'A system file.');
      else if (scrivener !== -1 && !(file.extension === 'scrivx' && scrivener === file.folders.length - 1)) this.place(file, 'bundled', null, 'Part of a Scrivener project.');
      else if (file.size === 0) this.place(file, 'skipped', null, 'The file is empty.');
      else if (file.sha256 && seen.has(file.sha256)) this.place(file, 'duplicate', null, `The same as ${seen.get(file.sha256)}.`);
      if (file.sha256 && !file.role) seen.set(file.sha256, file.rel);
      if (this.edits.left[file.id] && !file.role) this.place(file, 'skipped', null, 'You left it out.');
    }
  }

  // Everything to do with one book. `folder` may be null when the files came from a folder of loose ones.
  book({ key, title, files, parent, number = null }) {
    const book = this.node('book', key, title, parent, { number });
    const parts = new Map();
    const holderOf = (file) => {
      const name = file.folders.find((folder) => signs.partOf(folder));
      if (!name) return book;
      if (!parts.has(name)) parts.set(name, this.node('part', `${key}/${name}`, signs.partOf(name).title, book, { place: signs.partOf(name).number }));
      return parts.get(name);
    };

    const open = files.filter((file) => !file.role);
    for (const file of open) file.forced = this.edits.roles[file.id];
    const writing = open.filter((file) => file.forced === 'chapter' || (file.forced !== 'attachment' && isWriting(file)));
    const named = writing.filter((file) => signs.chapterOf(file.version.rest));

    if (named.length) {
      const groups = this.groups(named, (file) => `${holderOf(file).id}:${signs.chapterOf(file.version.rest).key}`);
      for (const group of groups) this.chapter(group, book, holderOf(group[0]), signs.chapterOf(group[0].version.rest));
      this.unsure(writing.filter((file) => !named.includes(file)), book, holderOf);
    } else if (writing.length) {
      this.unnamed(writing, book, key, holderOf);
    }

    this.cover(open, book);
    for (const file of open) if (!file.role) this.attach(file, book);
    book.children.sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
    for (const part of parts.values()) part.children.sort((a, b) => a.place - b.place);
    return book;
  }

  groups(files, keyOf) {
    const groups = new Map();
    for (const file of files) groups.set(keyOf(file), [...(groups.get(keyOf(file)) ?? []), file]);
    return [...groups.values()];
  }

  // The newest file is the writing, and the rest are its history. When only the date on the file tells them apart, ask.
  ordered(group) {
    const sorted = [...group].sort(signs.compareVersions);
    if (sorted.length > 1 && signs.sameMarks(sorted[0], sorted[1])) {
      const tied = sorted.filter((file) => signs.sameMarks(file, sorted[0]));
      const chosen = this.ask({
        id: idOf('same', tied.map((file) => file.rel).join('|')),
        type: 'same',
        question: 'Which of these is the newest?',
        detail: 'Their names don’t say, so the date on the file was used. The others become earlier versions.',
        options: tied.map((file) => ({ value: file.id, label: file.rel })),
        value: tied[0].id,
      });
      const first = sorted.find((file) => file.id === chosen);
      return [first, ...sorted.filter((file) => file !== first)];
    }
    return sorted;
  }

  chapter(group, book, holder, sign) {
    const [current, ...older] = this.ordered(group);
    const node = this.node('chapter', current.rel, sign.title, holder, { place: sign.place, file: current.id, older: older.map((file) => file.id) });
    this.place(current, 'chapter', node);
    older.forEach((file) => this.place(file, 'older', node, `An earlier version of ${current.name}.`));
    return node;
  }

  whole(group, book) {
    const [current, ...older] = this.ordered(group);
    const node = this.node('whole', current.rel, current.name, book, { file: current.id, older: older.map((file) => file.id) });
    this.place(current, 'whole', node);
    older.forEach((file) => this.place(file, 'older', node, `An earlier version of ${current.name}.`));
    return node;
  }

  // Writing in a book with chapters, whose name says nothing. It might be anything.
  unsure(files, book, holderOf) {
    if (files.length === 0) return;
    const forced = files.filter((file) => file.forced === 'chapter');
    const open = files.filter((file) => !forced.includes(file));
    forced.forEach((file, at) => this.chapter([file], book, holderOf(file), { place: 9000 + at, title: signs.tidy(file.version.rest) }));
    if (open.length === 0) return;
    const value = this.ask({
      id: idOf('unsure', book.id),
      type: 'unsure',
      question: `${open.length === 1 ? 'What is this file' : `What are these ${open.length} files`} in “${book.title}”?`,
      detail: 'The book has chapters, but these names don’t say where they’d go.',
      files: open.map((file) => file.rel),
      options: [
        { value: 'attachment', label: 'Keep them with the book as attachments' },
        { value: 'chapter', label: 'They’re chapters, after the numbered ones' },
      ],
      value: 'attachment',
    });
    if (value === 'chapter') open.forEach((file, at) => this.chapter([file], book, holderOf(file), { place: 9000 + at, title: signs.tidy(file.version.rest) }));
  }

  // No chapter names at all: one manuscript in some number of versions, or several files that need explaining.
  unnamed(writing, book, key, holderOf) {
    const groups = this.groups(writing, (file) => file.version.rest.toLowerCase());
    const manuscripts = groups.filter((group) => group.some((file) => WHOLE_NAME.test(file.version.rest)));
    if (groups.length === 1) {
      this.whole(groups[0], book);
      return;
    }
    if (manuscripts.length === 1) {
      this.whole(manuscripts[0], book);
      this.unsure(groups.filter((group) => group !== manuscripts[0]).flat(), book, holderOf);
      return;
    }
    const value = this.ask({
      id: idOf('organised', key),
      type: 'organised',
      question: `How is “${book.title}” organized?`,
      detail: `It has ${groups.length} files, and their names don’t say.`,
      files: groups.map((group) => group[0].rel),
      options: [
        { value: 'chapters', label: 'Each file is a chapter, in name order' },
        { value: 'versions', label: 'They’re versions of one manuscript' },
        { value: 'attachment', label: 'Keep them with the book as attachments' },
      ],
      value: 'chapters',
    });
    if (value === 'versions') this.whole(writing, book);
    if (value === 'chapters') {
      [...groups].sort((a, b) => byName(a[0], b[0])).forEach((group, at) => {
        this.chapter(group, book, holderOf(group[0]), { place: at + 1, title: signs.tidy(group[0].version.rest) });
      });
    }
  }

  cover(files, book) {
    const inCovers = (file) => file.folders.some((folder) => signs.COVER_FOLDER.test(signs.tidy(folder)));
    const front = files
      .filter((file) => !file.role && !file.forced && COVER_TYPES.has(file.extension) && (COVER_NAME.test(file.stem) || inCovers(file)) && !NOT_FRONT.test(file.stem))
      .sort((a, b) => signs.compareVersions(a, b) || b.size - a.size)[0];
    if (front) {
      this.place(front, 'cover', book);
      book.cover = front.id;
    }
  }

  // Writing with no book. The folder has no pattern, so the author says what it is.
  loose(folder, files, owner) {
    const where = folder.rel || 'the folder you chose';
    const value = this.ask({
      id: idOf('loose', folder.rel),
      type: 'loose',
      question: `${files.length === 1 ? 'What is this file' : `What are these ${files.length} files`} in ${where}?`,
      detail: 'They aren’t in a book.',
      files: files.map((file) => file.rel),
      options: [
        { value: 'attachment', label: 'Keep them as attachments' },
        { value: 'book', label: 'One book, made from all of them' },
        { value: 'books', label: 'One book for each file' },
      ],
      value: 'attachment',
    });
    if (value === 'book') this.book({ key: `loose:${folder.rel}`, title: signs.tidy(folder.name) || 'Imported book', files, parent: owner });
    if (value === 'books') {
      for (const file of files) this.book({ key: `loose:${file.rel}`, title: signs.tidy(file.version.rest) || file.stem, files: [file], parent: owner });
    }
  }

  walk(folder, owner, inSeries) {
    if (isBook(folder)) {
      const sign = signs.bookOf(folder.name);
      this.book({ key: folder.rel, title: sign?.title ?? (signs.tidy(folder.name) || this.project.title), files: filesUnder(folder), parent: owner, number: sign?.number ?? null });
      return;
    }
    const books = subfolders(folder).filter(isBook);
    const byFile = booksByFile(folder);
    const asSeries = !inSeries && folder.rel && !isSupport(folder)
      && (signs.SERIES_NAME.test(signs.tidy(folder.name)) || books.length >= 2 || byFile);
    const here = asSeries ? this.node('series', folder.rel, signs.seriesTitle(folder.name), owner) : owner;

    if (byFile) {
      for (const [number, files] of [...byFile].sort((a, b) => a[0] - b[0])) {
        const { title } = signs.bookOf(files[0].version.rest);
        this.book({ key: `${folder.rel}#${number}`, title, files, parent: here, number });
      }
    }
    const writing = folder.files.filter(isWriting);
    if (writing.length) this.loose(folder, writing, here);
    for (const file of folder.files) if (!file.role) this.attach(file, here);
    for (const child of subfolders(folder)) this.walk(child, here, inSeries || Boolean(asSeries));
  }

  applyMoves() {
    const nodes = new Map();
    const index = (node, parent) => {
      nodes.set(node.id, { node, parent });
      node.children.forEach((child) => index(child, node));
    };
    index(this.project, null);
    const CAN_HOLD = { project: ['series', 'book'], series: ['book'], book: ['part', 'chapter', 'whole'], part: ['chapter'] };
    for (const { id, to, before } of this.edits.moves) {
      const moving = nodes.get(id);
      const target = nodes.get(to);
      if (!moving || !target || !CAN_HOLD[target.node.kind]?.includes(moving.node.kind)) continue;
      moving.parent.children.splice(moving.parent.children.indexOf(moving.node), 1);
      const at = target.node.children.findIndex((child) => child.id === before);
      target.node.children.splice(at === -1 ? target.node.children.length : at, 0, moving.node);
      moving.parent = target.node;
    }
  }

  // Leaving out a book or chapter leaves out everything that's in it, and the report still lists each file.
  applyLeftOut(node) {
    node.children = node.children.filter((child) => {
      if (this.edits.left[child.id]) {
        this.dropNode(child);
        return false;
      }
      this.applyLeftOut(child);
      return true;
    });
  }

  dropNode(node) {
    const owned = this.files.filter((file) => file.node === node.id);
    owned.forEach((file) => this.place(file, 'skipped', null, 'You left it out.'));
    node.children.forEach((child) => this.dropNode(child));
  }

  build(title) {
    this.project.title = title;
    this.sort();
    this.walk(folderTree(this.files), this.project, false);
    this.applyMoves();
    this.applyLeftOut(this.project);
    return this.result();
  }

  result() {
    const count = (role) => this.files.filter((file) => file.role === role).length;
    const kept = this.files.filter((file) => file.role === 'attachment' || file.role === 'cover');
    return {
      tree: this.project,
      asks: this.asks,
      files: this.files.map(({ id, rel, name, size, mtime, kind, extension, role, node, reason }) => ({ id, rel, name, size, mtime, kind, extension, role, node, reason })),
      totals: {
        files: this.files.length,
        bytes: this.files.reduce((sum, file) => sum + file.size, 0),
        attachmentBytes: kept.reduce((sum, file) => sum + file.size, 0),
        chapters: count('chapter'),
        whole: count('whole'),
        older: count('older'),
        attachments: count('attachment'),
        covers: count('cover'),
        duplicates: count('duplicate'),
        bundled: count('bundled'),
        skipped: count('skipped'),
      },
    };
  }
}

function buildPlan({ title, entries }, edits = {}) {
  return new Planner(entries, edits).build(title);
}

module.exports = { buildPlan };
