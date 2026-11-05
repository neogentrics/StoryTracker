import { el } from './dom.js';
import { findState, replaceCurrent, replaceEvery, setFind, stepFind } from './find-plugin.js';

const SEARCH_DELAY_MS = 250;

// Find and replace for one page. "This chapter" works inside the editor. A book or the whole project is searched by
// the main process, because those chapters aren't open.
export class FindBar {
  constructor(root, { api, page, scopeBook, onOpenChapter, onReplaced, onFlush }) {
    this.api = api;
    this.page = page;
    this.scopeBook = scopeBook;
    this.onOpenChapter = onOpenChapter;
    this.onReplaced = onReplaced;
    this.onFlush = onFlush;
    this.timer = null;

    this.query = el('input', { class: 'find-query', type: 'text', placeholder: 'Find', 'aria-label': 'Find', oninput: () => this.search() });
    this.replacement = el('input', { class: 'find-replacement', type: 'text', placeholder: 'Replace with', 'aria-label': 'Replace with' });
    this.count = el('span', { class: 'find-count', role: 'status' });
    this.scope = el(
      'select',
      { class: 'find-scope', 'aria-label': 'Where to look', onchange: () => this.search() },
      el('option', { value: 'chapter' }, 'This chapter'),
      el('option', { value: 'book' }, 'This book'),
      el('option', { value: 'project' }, 'This project'),
    );
    this.matchCase = el('input', { class: 'find-case', type: 'checkbox', onchange: () => this.search() });
    this.wholeWord = el('input', { class: 'find-whole', type: 'checkbox', onchange: () => this.search() });
    this.results = el('ul', { class: 'find-results' });
    this.done = el('p', { class: 'find-done', hidden: true });

    this.query.addEventListener('keydown', (event) => this.onKey(event));
    this.replacement.addEventListener('keydown', (event) => this.onKey(event));
    this.previous = el('button', { type: 'button', 'aria-label': 'Previous match', onclick: () => this.step(-1) }, '‹');
    this.next = el('button', { type: 'button', 'aria-label': 'Next match', onclick: () => this.step(1) }, '›');
    this.replaceOne = el('button', { class: 'find-replace', type: 'button', onclick: () => this.replaceHere() }, 'Replace');

    this.root = el(
      'div',
      { class: 'find-bar', role: 'search', hidden: true },
      el(
        'div',
        { class: 'find-row' },
        this.query,
        this.count,
        this.previous,
        this.next,
        this.scope,
        el('label', { class: 'check' }, this.matchCase, 'Match case'),
        el('label', { class: 'check' }, this.wholeWord, 'Whole words'),
        el('button', { class: 'find-close', type: 'button', 'aria-label': 'Close find', onclick: () => this.close() }, '✕'),
      ),
      el(
        'div',
        { class: 'find-row' },
        this.replacement,
        this.replaceOne,
        el('button', { class: 'find-replace-all', type: 'button', onclick: () => this.replaceAll() }, 'Replace all'),
      ),
      this.done,
      this.results,
    );
    root.append(this.root);
  }

  get options() {
    return { matchCase: this.matchCase.checked, wholeWord: this.wholeWord.checked };
  }

  get inChapter() {
    return this.scope.value === 'chapter';
  }

  open({ replacing = false } = {}) {
    this.root.hidden = false;
    const selected = this.page.selectedText();
    if (selected && !selected.includes('\n')) this.query.value = selected;
    (replacing ? this.replacement : this.query).focus();
    this.query.select();
    this.search();
  }

  close() {
    if (this.root.hidden) return;
    this.root.hidden = true;
    clearTimeout(this.timer);
    if (this.page.editor) setFind(this.page.editor, '', {});
    this.page.focus();
  }

  onKey(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.target === this.replacement) this.replaceHere();
      else this.step(event.shiftKey ? -1 : 1);
    }
  }

  // A new chapter on the page keeps the words being looked for.
  refresh() {
    if (!this.root.hidden) this.highlight();
  }

  highlight() {
    const editor = this.page.editor;
    if (!editor) return 0;
    return setFind(editor, this.query.value, this.options);
  }

  search() {
    clearTimeout(this.timer);
    this.done.hidden = true;
    const local = this.inChapter;
    this.previous.disabled = !local;
    this.next.disabled = !local;
    this.replaceOne.disabled = !local;
    this.results.hidden = local;
    const found = this.highlight();
    if (local) {
      this.showCount(found);
      return;
    }
    this.timer = setTimeout(() => this.searchWider(), SEARCH_DELAY_MS);
  }

  showCount(count) {
    this.count.textContent = !this.query.value ? '' : count === 1 ? '1 match' : `${count} matches`;
  }

  input() {
    return { scope: this.scope.value, bookId: this.scopeBook(), query: this.query.value, ...this.options };
  }

  async searchWider() {
    await this.onFlush();
    const { results, total } = await this.api.search(this.input());
    this.showCount(total);
    this.results.replaceChildren(
      ...results.map((result) =>
        el(
          'li',
          {},
          el(
            'button',
            { class: 'find-result', type: 'button', onclick: () => this.onOpenChapter(result.chapterId) },
            el('span', { class: 'find-result-title' }, `${result.title} (${result.count})`),
            el('span', { class: 'find-result-text' }, result.first.before, el('mark', {}, result.first.match), result.first.after),
          ),
        )),
    );
  }

  step(direction) {
    const editor = this.page.editor;
    if (!editor || !this.inChapter) return;
    stepFind(editor, direction);
    const { matches, current } = findState(editor);
    if (matches.length) this.count.textContent = `${current + 1} of ${matches.length}`;
  }

  replaceHere() {
    const editor = this.page.editor;
    if (!editor || !this.inChapter || !this.query.value) return;
    replaceCurrent(editor, this.replacement.value);
    this.showCount(findState(editor).matches.length);
  }

  showDone(text, undo) {
    this.done.replaceChildren(text, ...(undo ? [' ', el('button', { class: 'find-undo', type: 'button', onclick: undo }, 'Undo')] : []));
    this.done.hidden = false;
  }

  async replaceAll() {
    if (!this.query.value) return;
    const editor = this.page.editor;
    if (this.inChapter) {
      if (!editor) return;
      const count = replaceEvery(editor, this.replacement.value);
      this.showDone(`Replaced ${count}. Undo works as usual.`);
      this.showCount(0);
      return;
    }
    const where = this.scope.value === 'book' ? 'this book' : 'this whole project';
    if (!window.confirm(`Replace “${this.query.value}” with “${this.replacement.value}” everywhere in ${where}?`)) return;
    await this.onFlush();
    const { count, chapters, outline } = await this.api.replaceAll({ ...this.input(), replacement: this.replacement.value });
    await this.onReplaced(outline);
    this.showDone(`Replaced ${count} in ${chapters === 1 ? '1 chapter' : `${chapters} chapters`}.`, count ? () => this.undo() : null);
    this.results.replaceChildren();
    this.showCount(0);
  }

  async undo() {
    await this.onFlush();
    const { outline } = await this.api.undoReplace();
    await this.onReplaced(outline);
    this.showDone('Put back.');
    this.search();
  }
}
