// The three columns: books, then the chapters of the chosen book, then the page.
import { canHold, findNode, indexTree, resolveDrop, resolveStep } from '../shared/outline.js';
import { el, formatCount, words } from './dom.js';
import { openDetails } from './details-dialog.js';
import { openExport } from './export-dialog.js';
import { openHistory } from './history.js';
import { openImport } from './import-dialog.js';
import { icon } from './icons.js';
import { Page } from './page.js';
import { openTrash } from './trash.js';

const DRAG_TYPE = 'application/x-rtst-item';
const lastChapterKey = (projectId) => `lastChapter:${projectId}`;
const MAX_GOAL = 10000000;
const KIND_ICONS = { series: 'series', book: 'book', part: 'part', chapter: 'chapter' };

function iconButton(id, name, label, onclick) {
  return el('button', { class: `bar-button ${id}`, title: label, 'aria-label': label, onclick }, icon(name));
}

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
  constructor(root, opened, { api, onLibrary, onPreferences, remember }) {
    this.api = api;
    this.remember = remember;
    this.projectId = opened.id;
    this.outline = opened.outline;
    this.bookId = null;
    this.chapterId = null;
    this.dragId = null;
    this.progress = opened.progress;
    this.secondPage = null;

    this.message = el('div', { id: 'room-message', class: 'room-message', role: 'alert', hidden: true });
    this.subtitle = el('p', { id: 'room-subtitle', class: 'room-subtitle' });
    this.projectTitle = el('h1', { id: 'project-title', title: 'Double-click to rename' }, opened.title);
    this.projectTitle.addEventListener('dblclick', () => this.startRename(this.outline.id, this.projectTitle));
    this.projectWords = el('span', { id: 'project-words', class: 'header-words' });
    this.todayWords = el('span', { id: 'today-words', class: 'header-words' });
    this.bookList = el('ul', { id: 'book-list', class: 'rows', 'aria-label': 'Books' });
    this.chapterList = el('ul', { id: 'chapter-list', class: 'rows', 'aria-label': 'Chapters' });
    this.bookHeading = el('h2', { id: 'book-heading' }, 'Chapters');
    this.filter = el('input', {
      id: 'chapter-filter',
      class: 'list-filter',
      type: 'search',
      placeholder: 'Filter chapters…',
      'aria-label': 'Filter chapters',
      oninput: () => this.applyFilter(),
    });
    this.pageRoot = el('div', { class: 'pane' });
    this.secondRoot = el('div', { class: 'pane', hidden: true });
    this.pages = el('section', { class: 'column page-column', 'aria-label': 'Page' }, this.pageRoot, this.secondRoot);

    this.addDropZone(this.bookList, () => this.outline.id);
    this.addDropZone(this.chapterList, () => this.bookId);

    root.replaceChildren(
      el(
        'div',
        { class: 'room' },
        el(
          'header',
          { class: 'room-header' },
          el(
            'div',
            { class: 'bar-side' },
            iconButton('toggle-lists', 'menu', 'Show or hide the lists', () => this.room.classList.toggle('lists-hidden')),
            el('button', { id: 'open-library', class: 'bar-primary', onclick: () => onLibrary() }, icon('library'), 'Library'),
          ),
          el('div', { class: 'bar-title' }, this.projectTitle, this.subtitle),
          el(
            'div',
            { class: 'bar-side bar-right' },
            el('span', { class: 'bar-words' }, this.todayWords, this.projectWords),
            iconButton('find-button', 'search', 'Find and replace', () => this.find()),
            iconButton('import-button', 'import', 'Import', () => this.showImport()),
            iconButton('export-button', 'export', 'Export', () => this.showExport()),
            iconButton('history-button', 'history', 'Earlier versions of this chapter', () => this.showHistory()),
            iconButton('goals-button', 'goal', 'Goals', () => this.openGoals(this.activePage.chapterId)),
            iconButton('focus-button', 'focus', 'Focus mode', () => this.toggleFocus()),
            iconButton('trash-button', 'trash', 'Trash', () => this.showTrash()),
            iconButton('prefs-button', 'settings', 'Preferences', () => onPreferences()),
          ),
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
              el('button', { id: 'add-book', onclick: () => this.addBook() }, icon('plus'), 'Book'),
              el('button', { id: 'add-series', onclick: () => this.addSeries() }, icon('plus'), 'Series'),
            ),
          ),
          el(
            'section',
            { class: 'column', 'aria-label': 'Chapters' },
            this.bookHeading,
            this.filter,
            this.chapterList,
            el(
              'div',
              { class: 'column-actions' },
              el('button', { id: 'add-chapter', class: 'primary', onclick: () => this.addChapter() }, icon('plus'), 'Chapter'),
              el('button', { id: 'add-part', onclick: () => this.addPart() }, icon('plus'), 'Part'),
            ),
          ),
          this.pages,
        ),
        el('button', { class: 'focus-exit', onclick: () => this.toggleFocus() }, icon('close'), 'Leave focus mode'),
      ),
    );

    this.room = root.querySelector('.room');
    this.page = this.makePage(this.pageRoot);
    this.activePage = this.page;
    this.pageRoot.addEventListener('focusin', () => {
      this.activePage = this.page;
    });
    this.secondRoot.addEventListener('focusin', () => {
      this.activePage = this.secondPage ?? this.page;
    });
    this.keys = (event) => {
      if (event.key === 'Escape' && this.room.classList.contains('focus') && !document.querySelector('dialog[open]')) {
        this.toggleFocus();
      }
    };
    document.addEventListener('keydown', this.keys);
    this.showProgress();
  }

  makePage(root, extra = {}) {
    return new Page(root, {
      api: this.api,
      onWords: (id, count) => this.setWords(id, count),
      onTitle: (id, title) => this.setTitle(id, title),
      onError: (text) => this.showMessage(text),
      onSaved: ({ progress }) => this.setProgress(progress),
      onNewChapter: () => this.addChapter(),
      find: {
        scopeBook: () => this.bookId,
        onFlush: () => this.flush(),
        onOpenChapter: (id) => this.openChapter(id),
        onReplaced: (outline) => this.afterReplace(outline),
      },
      ...extra,
    });
  }

  leave() {
    document.removeEventListener('keydown', this.keys);
  }

  setProgress(progress) {
    this.progress = progress;
    this.showProgress();
  }

  showProgress() {
    const { today, dailyGoal } = this.progress;
    const met = dailyGoal > 0 && today >= dailyGoal;
    this.todayWords.textContent = dailyGoal ? `${formatCount(today)} of ${words(dailyGoal)} today` : `${words(today)} today`;
    this.todayWords.classList.toggle('goal-met', met);
  }

  toggleFocus() {
    this.room.classList.toggle('focus');
    this.activePage.focus();
  }

  openGoals(chapterId) {
    document.getElementById('goals')?.remove();
    const number = (id, label, value) => {
      const input = el('input', { id, type: 'number', min: '0', max: String(MAX_GOAL), step: '50', value: String(value), 'aria-label': label });
      return { input, row: el('label', { class: 'field' }, el('span', {}, label), input) };
    };
    const daily = number('goal-daily', 'Words a day, for this project', this.progress.dailyGoal);
    const chapterPage = [this.page, this.secondPage].find((page) => page?.chapterId === chapterId);
    const chapter = number('goal-chapter', 'Words for this chapter', chapterPage?.goal ?? 0);
    const dialog = el(
      'dialog',
      { id: 'goals', class: 'dialog' },
      el('h2', {}, 'Goals'),
      el('p', { class: 'quiet-note' }, 'Leave a goal at 0 to have none.'),
      daily.row,
      chapter.row,
      el(
        'div',
        { class: 'dialog-actions' },
        el('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel'),
        el('button', { id: 'goals-save', class: 'primary', onclick: () => this.saveGoals(dialog, chapterPage, daily.input, chapter.input) }, 'Save'),
      ),
    );
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  saveGoals(dialog, chapterPage, daily, chapter) {
    const whole = (input) => Math.max(0, Math.min(MAX_GOAL, Math.round(Number(input.value) || 0)));
    return this.attempt(async () => {
      this.setProgress(await this.api.setGoal({ id: this.outline.id, goal: whole(daily) }));
      if (chapterPage) {
        this.setProgress(await this.api.setGoal({ id: chapterPage.chapterId, goal: whole(chapter) }));
        chapterPage.goal = whole(chapter);
      }
      this.showCounts();
      dialog.close();
    });
  }

  find({ replacing = false } = {}) {
    if (this.activePage.chapterId) this.activePage.findBar.open({ replacing });
  }

  async afterReplace(outline) {
    this.outline = outline;
    await this.page.reload();
    await this.secondPage?.reload();
    this.renderLists();
  }

  openBeside(id) {
    if (id === this.chapterId) {
      this.showMessage('That chapter is already open.');
      return null;
    }
    return this.attempt(async () => {
      if (!this.secondPage) {
        this.secondRoot.hidden = false;
        this.secondPage = this.makePage(this.secondRoot, { onClose: () => this.closeBeside() });
      }
      await this.secondPage.open(id);
      this.showSelection();
      this.showCounts();
    });
  }

  closeBeside() {
    return this.attempt(async () => {
      await this.secondPage?.flush();
      this.secondPage?.editor?.destroy();
      this.secondPage = null;
      this.secondRoot.replaceChildren();
      this.secondRoot.hidden = true;
      this.activePage = this.page;
      this.showSelection();
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
    this.message.className = 'room-message';
    this.message.textContent = text;
    this.message.hidden = false;
  }

  showInfo(text, action) {
    this.message.className = 'room-message info';
    this.message.replaceChildren(
      el('span', {}, text),
      ...(action ? [el('button', { id: 'message-action', onclick: action.run }, action.label)] : []),
      el('button', { class: 'message-close', 'aria-label': 'Dismiss', onclick: () => this.clearMessage() }, icon('close')),
    );
    this.message.hidden = false;
  }

  applyFilter() {
    const wanted = this.filter.value.trim().toLowerCase();
    for (const row of this.chapterList.children) {
      const title = row.querySelector('.row-title')?.textContent.toLowerCase() ?? '';
      row.hidden = Boolean(wanted) && !title.includes(wanted);
    }
  }

  async showHistory() {
    const page = this.activePage;
    if (!page.chapterId) return;
    await this.attempt(() =>
      openHistory({
        api: this.api,
        page,
        onRestored: (outline) => this.afterReplace(outline),
        onError: (text) => this.showMessage(text),
      }));
  }

  exportScopes() {
    const scopes = [];
    const chapter = this.activePage.chapterId && findNode(this.outline, this.activePage.chapterId);
    if (chapter) scopes.push({ scope: 'chapter', id: chapter.id, label: `This chapter: ${chapter.title}` });
    const book = this.bookId && findNode(this.outline, this.bookId);
    if (book) scopes.push({ scope: 'book', id: book.id, label: `This book: ${book.title}` });
    const holder = book && indexTree(this.outline).get(book.id)?.parent;
    if (holder?.kind === 'series') scopes.push({ scope: 'series', id: holder.id, label: `This series: ${holder.title}` });
    scopes.push({ scope: 'project', id: this.outline.id, label: `The whole project: ${this.outline.title}` });
    return scopes;
  }

  async showExport(options = {}) {
    await this.attempt(async () => {
      await this.flush();
      openExport({ api: this.api, scopes: this.exportScopes(), onError: (text) => this.showMessage(text), ...options });
    });
  }

  async showImport() {
    await this.attempt(async () => {
      await this.flush();
      const holder = this.bookId && indexTree(this.outline).get(this.bookId)?.parent;
      await openImport({
        api: this.api,
        books: booksOf(this.outline),
        parentId: holder?.id ?? this.outline.id,
        emptyBookId: this.bookId && findNode(this.outline, this.bookId)?.words === 0 ? this.bookId : null,
        onError: (text) => this.showMessage(text),
        onDone: (result) => this.afterImport(result),
      });
    });
  }

  async afterImport({ outline, first, chapters }) {
    this.outline = outline;
    this.chapterId = null;
    this.bookId = null;
    await this.page.clear();
    this.renderLists();
    if (first) await this.openChapter(first);
    this.showInfo(`Imported ${chapters === 1 ? '1 chapter' : `${chapters} chapters`}.`);
  }

  showDetails(id = this.bookId) {
    if (!id) {
      this.showMessage('Choose a book first.');
      return null;
    }
    return this.attempt(() => openDetails({ api: this.api, bookId: id, onError: (text) => this.showMessage(text) }));
  }

  showTrash() {
    return this.attempt(() =>
      openTrash({
        title: 'Trash',
        load: () => this.api.listTrash(),
        restore: (id) => this.restoreRow(id),
        onError: (text) => this.showMessage(text),
      }));
  }

  async restoreRow(id) {
    this.outline = await this.api.restoreItem(id);
    this.renderLists();
    this.clearMessage();
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

  async flush() {
    await this.page.flush();
    await this.secondPage?.flush();
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
    this.applyFilter();
    this.showSelection();
    this.showCounts();
  }

  row(node, depth) {
    const title = el('span', { class: 'row-title' }, node.title);
    const main = el(
      'button',
      {
        class: 'row-main',
        onclick: (event) => this.chooseRow(node, event),
        ondblclick: () => this.startRename(node.id, title),
      },
      icon(KIND_ICONS[node.kind]),
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
          icon('pencil'),
        ),
        node.kind === 'book'
          ? el(
              'button',
              { class: 'row-action', title: 'Book details', 'aria-label': `Details of ${node.title}`, onclick: () => this.showDetails(node.id) },
              icon('info'),
            )
          : null,
        node.kind === 'chapter'
          ? el(
              'button',
              { class: 'row-action', title: 'Open beside', 'aria-label': `Open ${node.title} beside`, onclick: () => this.openBeside(node.id) },
              icon('beside'),
            )
          : null,
        el(
          'button',
          { class: 'row-action', title: 'Move to Trash', 'aria-label': `Move ${node.title} to Trash`, onclick: () => this.removeRow(node) },
          icon('trash'),
        ),
      ),
    );
    return item;
  }

  showSelection() {
    for (const row of [...this.bookList.children, ...this.chapterList.children]) {
      const selected = row.dataset.id === this.bookId || row.dataset.id === this.chapterId;
      row.classList.toggle('selected', selected);
      row.classList.toggle('beside', row.dataset.id === this.secondPage?.chapterId);
      row.querySelector('.row-main').setAttribute('aria-current', String(selected));
    }
    this.showSubtitle();
  }

  showSubtitle() {
    const book = this.bookId && findNode(this.outline, this.bookId);
    const chapter = this.chapterId && findNode(this.outline, this.chapterId);
    this.subtitle.textContent = [book?.title, chapter?.title].filter(Boolean).join(' · ');
  }

  showCounts() {
    const chapter = this.chapterId && findNode(this.outline, this.chapterId);
    const book = this.bookId && findNode(this.outline, this.bookId);
    if (chapter && book) this.page.showCounts(chapter.words, book.words);
    const second = this.secondPage?.chapterId && findNode(this.outline, this.secondPage.chapterId);
    if (second) this.secondPage.showCounts(second.words, this.bookOf(second.id)?.words ?? second.words);
  }

  chooseRow(node, event) {
    if (node.kind === 'chapter' && (event.ctrlKey || event.metaKey)) return this.openBeside(node.id);
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
      if (id === this.secondPage?.chapterId) await this.closeBeside();
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
    this.showSubtitle();
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
      if (id === this.secondPage?.chapterId) this.secondPage.setTitle(findNode(this.outline, id).title);
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
      if (inside.includes(this.secondPage?.chapterId)) await this.closeBeside();
      this.outline = await this.api.trashItem(node.id);
      if (openGoes) {
        await this.page.clear();
        this.chapterId = null;
      }
      if (bookGoes) this.bookId = booksOf(this.outline)[0]?.id ?? null;
      this.renderLists();
      const next = !this.chapterId && this.bookId && chaptersOf(findNode(this.outline, this.bookId))[0];
      if (next) await this.openChapter(next.id);
      this.showInfo(`“${node.title}” is in the Trash.`, {
        label: 'Undo',
        run: () => this.attempt(async () => {
          await this.restoreRow(node.id);
          if (node.kind === 'chapter') await this.openChapter(node.id);
        }),
      });
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
