// The three columns: books, then the chapters of the chosen book, then the page.
import { canHold, findNode, indexTree, resolveDrop, resolveStep } from '../shared/outline.js';
import { el, formatCount, words } from './dom.js';
import { Page } from './page.js';

const DRAG_TYPE = 'application/x-rtst-item';
const lastChapterKey = (projectId) => `lastChapter:${projectId}`;

function flatten(nodes, depth = 0) {
  return nodes.flatMap((node) => [{ node, depth }, ...flatten(node.kind === 'book' ? [] : node.children, depth + 1)]);
}

function chaptersOf(node) {
  return node.kind === 'chapter' ? [node] : node.children.flatMap(chaptersOf);
}

function booksOf(node) {
  return node.kind === 'book' ? [node] : node.children.flatMap(booksOf);
}

export class WritingRoom {
  constructor(root, opened, { api, onLibrary, remember }) {
    this.api = api;
    this.remember = remember;
    this.projectId = opened.id;
    this.outline = opened.outline;
    this.bookId = null;
    this.chapterId = null;
    this.dragId = null;

    this.message = el('p', { id: 'room-message', class: 'room-message', role: 'alert', hidden: true });
    this.projectTitle = el('h1', { id: 'project-title', title: 'Double-click to rename' }, opened.title);
    this.projectTitle.addEventListener('dblclick', () => this.startRename(this.outline.id, this.projectTitle));
    this.projectWords = el('span', { id: 'project-words', class: 'header-words' });
    this.bookList = el('ul', { id: 'book-list', class: 'rows', 'aria-label': 'Books' });
    this.chapterList = el('ul', { id: 'chapter-list', class: 'rows', 'aria-label': 'Chapters' });
    this.bookHeading = el('h2', { id: 'book-heading' }, 'Chapters');
    this.pageRoot = el('section', { class: 'column page-column', 'aria-label': 'Page' });

    this.addDropZone(this.bookList, () => this.outline.id);
    this.addDropZone(this.chapterList, () => this.bookId);

    root.replaceChildren(
      el(
        'div',
        { class: 'room' },
        el(
          'header',
          { class: 'room-header' },
          el('button', { id: 'open-library', class: 'on-dark', onclick: () => onLibrary() }, 'Library'),
          this.projectTitle,
          this.projectWords,
        ),
        this.message,
        el(
          'div',
          { class: 'columns' },
          el(
            'section',
            { class: 'column', 'aria-label': 'Books' },
            el('h2', {}, 'Books'),
            this.bookList,
            el(
              'div',
              { class: 'column-actions' },
              el('button', { id: 'add-book', onclick: () => this.addBook() }, '+ Book'),
              el('button', { id: 'add-series', onclick: () => this.addSeries() }, '+ Series'),
            ),
          ),
          el(
            'section',
            { class: 'column', 'aria-label': 'Chapters' },
            this.bookHeading,
            this.chapterList,
            el(
              'div',
              { class: 'column-actions' },
              el('button', { id: 'add-chapter', onclick: () => this.addChapter() }, '+ Chapter'),
              el('button', { id: 'add-part', onclick: () => this.addPart() }, '+ Part'),
            ),
          ),
          this.pageRoot,
        ),
      ),
    );

    this.page = new Page(this.pageRoot, {
      api,
      onWords: (id, count) => this.setWords(id, count),
      onTitle: (id, title) => this.setTitle(id, title),
      onError: (text) => this.showMessage(`Your latest changes aren’t saved yet: ${text}`),
    });
  }

  async start() {
    this.renderLists();
    const remembered = this.remember.get(lastChapterKey(this.projectId));
    const node = remembered && findNode(this.outline, remembered);
    const first = node ?? chaptersOf(this.outline)[0];
    if (first) await this.openChapter(first.id);
    else this.selectBook(booksOf(this.outline)[0]?.id ?? null);
  }

  showMessage(text) {
    this.message.textContent = text;
    this.message.hidden = false;
  }

  clearMessage() {
    this.message.hidden = true;
  }

  // Everything that changes the outline goes through here, so a failure is shown and not lost.
  async attempt(work) {
    try {
      this.clearMessage();
      return await work();
    } catch (error) {
      this.showMessage(error.message);
      return null;
    }
  }

  flush() {
    return this.page.flush();
  }

  bookOf(id) {
    const index = indexTree(this.outline);
    for (let entry = index.get(id); entry; entry = entry.parent && index.get(entry.parent.id)) {
      if (entry.node.kind === 'book') return entry.node;
    }
    return null;
  }

  // Lists

  renderLists() {
    const shelves = flatten(this.outline.children);
    this.bookList.replaceChildren(...shelves.map(({ node, depth }) => this.row(node, depth)));
    this.projectWords.textContent = words(this.outline.words);
    this.renderChapters();
  }

  renderChapters() {
    const book = this.bookId && findNode(this.outline, this.bookId);
    this.bookHeading.textContent = book ? book.title : 'Chapters';
    const chapters = book ? flatten(book.children) : [];
    this.chapterList.replaceChildren(...chapters.map(({ node, depth }) => this.row(node, depth)));
    this.showSelection();
    this.showCounts();
  }

  row(node, depth) {
    const title = el('span', { class: 'row-title' }, node.title);
    const empty = node.words === 0;
    const main = el(
      'button',
      {
        class: 'row-main',
        onclick: () => this.chooseRow(node),
        ondblclick: () => this.startRename(node.id, title),
      },
      title,
      el('span', { class: 'row-words', dataset: { wordsFor: node.id } }, formatCount(node.words)),
    );
    const item = el(
      'li',
      {
        class: `row kind-${node.kind} depth-${Math.min(depth, 2)}`,
        draggable: 'true',
        dataset: { id: node.id },
        onkeydown: (event) => this.onRowKey(event, node, title),
        ondragstart: (event) => this.onDragStart(event, node),
        ondragend: () => this.onDragEnd(),
        ondragover: (event) => this.onDragOver(event, node, item),
        ondragleave: () => this.clearDropMarks(item),
        ondrop: (event) => this.onDrop(event, node, item),
      },
      main,
      el(
        'span',
        { class: 'row-actions' },
        el(
          'button',
          { class: 'row-action', title: 'Rename', 'aria-label': `Rename ${node.title}`, onclick: () => this.startRename(node.id, title) },
          '✎',
        ),
        empty
          ? el(
              'button',
              { class: 'row-action', title: 'Remove', 'aria-label': `Remove ${node.title}`, onclick: () => this.removeRow(node) },
              '✕',
            )
          : null,
      ),
    );
    return item;
  }

  showSelection() {
    for (const row of [...this.bookList.children, ...this.chapterList.children]) {
      const selected = row.dataset.id === this.bookId || row.dataset.id === this.chapterId;
      row.classList.toggle('selected', selected);
      row.querySelector('.row-main').setAttribute('aria-current', String(selected));
    }
  }

  showCounts() {
    const chapter = this.chapterId && findNode(this.outline, this.chapterId);
    const book = this.bookId && findNode(this.outline, this.bookId);
    if (chapter && book) this.page.showCounts(chapter.words, book.words);
  }

  chooseRow(node) {
    if (node.kind === 'chapter') return this.openChapter(node.id);
    if (node.kind === 'book') return this.openBook(node.id);
    return null;
  }

  selectBook(id) {
    this.bookId = id;
    this.renderChapters();
  }

  async openBook(id) {
    const first = chaptersOf(findNode(this.outline, id))[0];
    if (first) return this.openChapter(first.id);
    return this.attempt(async () => {
      await this.page.clear();
      this.chapterId = null;
      this.selectBook(id);
    });
  }

  openChapter(id, { focus = false } = {}) {
    return this.attempt(async () => {
      await this.page.open(id);
      const bookId = this.bookOf(id)?.id ?? null;
      const sameBook = bookId === this.bookId;
      this.chapterId = id;
      this.bookId = bookId;
      this.remember.set(lastChapterKey(this.projectId), id);
      // A row that was just clicked has to stay put, or the second click of a double-click lands on nothing.
      if (sameBook && this.chapterList.querySelector(`[data-id="${id}"]`)) {
        this.showSelection();
        this.showCounts();
      } else {
        this.renderChapters();
      }
      if (focus) this.page.focus();
    });
  }

  // Live updates from the page, without rebuilding the lists under the author's hands.

  setWords(id, count) {
    const index = indexTree(this.outline);
    const entry = index.get(id);
    if (!entry) return;
    const change = count - entry.node.words;
    if (change === 0) return;
    for (let at = entry; at; at = at.parent && index.get(at.parent.id)) {
      at.node.words += change;
      const label = document.querySelector(`[data-words-for="${at.node.id}"]`);
      if (label) label.textContent = formatCount(at.node.words);
    }
    this.projectWords.textContent = words(this.outline.words);
    this.showCounts();
  }

  setTitle(id, title) {
    const node = findNode(this.outline, id);
    if (!node) return;
    node.title = title;
    const label = this.chapterList.querySelector(`[data-id="${id}"] .row-title`);
    if (label) label.textContent = title;
  }

  // Adding

  async add(kind, parentId, title) {
    return this.attempt(async () => {
      await this.flush();
      const { item, outline } = await this.api.addItem({ kind, parentId, title });
      this.outline = outline;
      return item;
    });
  }

  async addBook() {
    const current = this.bookId && indexTree(this.outline).get(this.bookId);
    const parentId = current?.parent?.id ?? this.outline.id;
    const book = await this.add('book', parentId, 'New book');
    if (!book) return;
    const chapter = await this.add('chapter', book.id, 'Chapter 1');
    this.renderLists();
    if (chapter) await this.openChapter(chapter.id);
    this.startRenameOf(book.id);
  }

  async addSeries() {
    const series = await this.add('series', this.outline.id, 'New series');
    if (!series) return;
    this.renderLists();
    this.startRenameOf(series.id);
  }

  async addChapter() {
    if (!this.bookId) {
      this.showMessage('Add a book first.');
      return;
    }
    const book = findNode(this.outline, this.bookId);
    const open = this.chapterId && indexTree(this.outline).get(this.chapterId);
    const parentId = open?.parent?.kind === 'part' ? open.parent.id : this.bookId;
    const chapter = await this.add('chapter', parentId, `Chapter ${chaptersOf(book).length + 1}`);
    if (!chapter) return;
    this.renderLists();
    await this.openChapter(chapter.id, { focus: true });
  }

  async addPart() {
    if (!this.bookId) {
      this.showMessage('Add a book first.');
      return;
    }
    const part = await this.add('part', this.bookId, 'New part');
    if (!part) return;
    this.renderLists();
    this.startRenameOf(part.id);
  }

  // Renaming

  startRenameOf(id) {
    const label = document.querySelector(`.row[data-id="${id}"] .row-title`);
    if (label) this.startRename(id, label);
  }

  startRename(id, label) {
    const node = findNode(this.outline, id);
    if (!node || label.parentNode?.querySelector('.rename')) return;
    const input = el('input', { class: 'rename', type: 'text', value: node.title, 'aria-label': 'New name', maxlength: '500' });
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      input.replaceWith(label);
      if (save && input.value.trim() && input.value !== node.title) this.rename(id, input.value);
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') finish(true);
      if (event.key === 'Escape') finish(false);
    });
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('blur', () => finish(true));
    label.replaceWith(input);
    input.focus();
    input.select();
  }

  rename(id, title) {
    return this.attempt(async () => {
      await this.flush();
      this.outline = await this.api.rename({ id, title });
      if (id === this.chapterId) this.page.setTitle(findNode(this.outline, id).title);
      if (id === this.outline.id) this.projectTitle.textContent = this.outline.title;
      this.renderLists();
    });
  }

  removeRow(node) {
    return this.attempt(async () => {
      await this.flush();
      const inside = [...indexTree(node).keys()];
      const openGoes = inside.includes(this.chapterId);
      const bookGoes = inside.includes(this.bookId);
      this.outline = await this.api.removeEmpty(node.id);
      if (openGoes) {
        await this.page.clear();
        this.chapterId = null;
      }
      if (bookGoes) this.bookId = booksOf(this.outline)[0]?.id ?? null;
      this.renderLists();
      const next = !this.chapterId && this.bookId && chaptersOf(findNode(this.outline, this.bookId))[0];
      if (next) await this.openChapter(next.id);
    });
  }

  // Moving

  async applyMove(id, target) {
    if (!target) return;
    await this.attempt(async () => {
      await this.flush();
      this.outline = await this.api.move({ id, ...target });
      if (this.chapterId) this.bookId = this.bookOf(this.chapterId)?.id ?? this.bookId;
      this.renderLists();
      document.querySelector(`.row[data-id="${id}"] .row-main`)?.focus();
    });
  }

  onRowKey(event, node, title) {
    if (event.target.classList.contains('rename')) return;
    if (event.key === 'F2') {
      event.preventDefault();
      this.startRename(node.id, title);
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.applyMove(node.id, resolveStep(this.outline, node.id, event.key === 'ArrowUp' ? -1 : 1));
    }
  }

  onDragStart(event, node) {
    this.dragId = node.id;
    event.dataTransfer.setData(DRAG_TYPE, node.id);
    event.dataTransfer.effectAllowed = 'move';
  }

  onDragEnd() {
    this.dragId = null;
    document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((row) => this.clearDropMarks(row));
  }

  clearDropMarks(row) {
    row.classList.remove('drop-before', 'drop-after', 'drop-into');
  }

  dropPlace(event, node, row) {
    const box = row.getBoundingClientRect();
    const at = (event.clientY - box.top) / box.height;
    const draggedKind = findNode(this.outline, this.dragId)?.kind;
    if (canHold(node.kind, draggedKind) && at > 0.25 && at < 0.75) return 'into';
    return at < 0.5 ? 'before' : 'after';
  }

  onDragOver(event, node, row) {
    if (!this.dragId) return;
    event.stopPropagation();
    this.clearDropMarks(row);
    const place = this.dropPlace(event, node, row);
    if (!resolveDrop(this.outline, this.dragId, node.id, place)) return;
    event.preventDefault();
    row.classList.add(`drop-${place}`);
  }

  onDrop(event, node, row) {
    if (!this.dragId) return;
    event.preventDefault();
    event.stopPropagation();
    const id = this.dragId;
    const target = resolveDrop(this.outline, id, node.id, this.dropPlace(event, node, row));
    this.clearDropMarks(row);
    this.applyMove(id, target);
  }

  // Dropping on the empty part of a list puts it at the end.
  addDropZone(list, parentId) {
    const target = () => {
      const parent = parentId() && findNode(this.outline, parentId());
      const dragged = this.dragId && findNode(this.outline, this.dragId);
      return parent && dragged && canHold(parent.kind, dragged.kind) ? { parentId: parent.id, beforeId: null } : null;
    };
    list.addEventListener('dragover', (event) => {
      if (target()) event.preventDefault();
    });
    list.addEventListener('drop', (event) => {
      const place = target();
      if (!place) return;
      event.preventDefault();
      this.applyMove(this.dragId, place);
    });
  }

  newChapterFromMenu() {
    return this.addChapter();
  }

  newBookFromMenu() {
    return this.addBook();
  }
}
