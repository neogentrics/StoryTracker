import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Saver } from '../shared/saver.js';
import { countWords, plainText, toDocument } from '../shared/text.js';
import { CommentMark, CommentsPanel } from './comments.js';
import { el, formatCount, words } from './dom.js';
import { FindBar } from './find-bar.js';
import { FindHighlight } from './find-plugin.js';

const COUNT_DELAY_MS = 250;

const STATUS = {
  unsaved: 'Editing',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Couldn’t save. Trying again…',
};

const alignIcon = (lines) => {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');
  lines.forEach(([x1, x2], at) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const y = 3 + at * 3.3;
    Object.entries({ x1, x2, y1: y, y2: y }).forEach(([name, value]) => line.setAttribute(name, value));
    icon.append(line);
  });
  return icon;
};

const heading = (level) => ({
  label: `Heading ${level}`,
  face: `H${level}`,
  run: (chain) => chain.toggleHeading({ level }),
  active: (editor) => editor.isActive('heading', { level }),
});

const align = (value, label, lines) => ({
  label,
  face: alignIcon(lines),
  run: (chain) => chain.setTextAlign(value),
  active: (editor) => editor.isActive({ textAlign: value }),
});

const TOOLS = [
  [
    { label: 'Bold', face: 'B', class: 'face-bold', run: (chain) => chain.toggleBold(), active: (editor) => editor.isActive('bold') },
    { label: 'Italic', face: 'I', class: 'face-italic', run: (chain) => chain.toggleItalic(), active: (editor) => editor.isActive('italic') },
  ],
  [heading(1), heading(2), heading(3)],
  [
    { label: 'Bulleted list', face: '•', run: (chain) => chain.toggleBulletList(), active: (editor) => editor.isActive('bulletList') },
    { label: 'Numbered list', face: '1.', run: (chain) => chain.toggleOrderedList(), active: (editor) => editor.isActive('orderedList') },
  ],
  [
    align('left', 'Align left', [[2, 14], [2, 10], [2, 14], [2, 9]]),
    align('center', 'Align center', [[2, 14], [4, 12], [2, 14], [5, 11]]),
    align('right', 'Align right', [[2, 14], [6, 14], [2, 14], [7, 14]]),
    align('justify', 'Justify', [[2, 14], [2, 14], [2, 14], [2, 14]]),
  ],
];

export class Page {
  constructor(root, { api, onWords, onTitle, onError, onSaved, onGoals, onFocusMode, onClose, find }) {
    this.api = api;
    this.onWords = onWords;
    this.onTitle = onTitle;
    this.onError = onError;
    this.onSaved = onSaved;
    this.editor = null;
    this.chapterId = null;
    this.countTimer = null;
    this.buttons = [];

    this.saver = new Saver({
      read: () => ({ id: this.chapterId, title: this.titleInput.value, body: JSON.stringify(this.editor.getJSON()) }),
      write: async (input) => this.onSaved(await this.api.saveChapter(input)),
      onState: (state) => this.showState(state),
    });

    this.toolbar = el(
      'div',
      { class: 'toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
      this.buildTools(),
      el(
        'div',
        { class: 'tool-group' },
        el('button', {
          class: 'tool add-comment',
          type: 'button',
          title: 'Comment on the selected words',
          onmousedown: (event) => event.preventDefault(),
          onclick: () => this.comments.start(),
        }, 'Comment'),
      ),
      onClose ? el('button', { class: 'tool close-pane', type: 'button', title: 'Close this side', 'aria-label': 'Close this side', onclick: onClose }, '✕') : null,
    );
    this.titleInput = el('input', {
      id: 'chapter-title',
      class: 'chapter-title',
      type: 'text',
      'aria-label': 'Chapter title',
      maxlength: '500',
      oninput: () => {
        this.saver.touch();
        this.onTitle(this.chapterId, this.titleInput.value);
      },
      onkeydown: (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        this.focus();
      },
    });
    this.host = el('div', { class: 'editor-host' });
    this.sheet = el('div', { class: 'sheet' }, this.titleInput, this.host);
    this.scroller = el('div', { class: 'page-scroll' }, this.sheet);
    this.body = el('div', { class: 'page-body' }, this.scroller);
    this.counts = el('span', { class: 'word-count' });
    this.saveState = el('span', { class: 'save-state', role: 'status' });
    this.footer = el(
      'footer',
      { class: 'page-footer' },
      this.counts,
      el(
        'span',
        { class: 'footer-actions' },
        el('button', { class: 'footer-button goals-button', onclick: () => onGoals(this.chapterId) }, 'Goals'),
        el('button', { class: 'footer-button focus-button', onclick: () => onFocusMode() }, 'Focus'),
        this.saveState,
      ),
    );
    this.empty = el('div', { class: 'page-empty' }, 'Pick a chapter, or add one, to start writing.');
    root.append(this.toolbar);
    this.findBar = new FindBar(root, { ...find, api, page: this });
    root.append(this.body, this.footer, this.empty);
    this.comments = new CommentsPanel(this.body, { api, page: this, onError });
    this.showEditor(false);
  }

  selectedText() {
    if (!this.editor) return '';
    const { from, to } = this.editor.state.selection;
    return this.editor.state.doc.textBetween(from, to, '\n');
  }

  buildTools() {
    return TOOLS.map((group) =>
      el(
        'div',
        { class: 'tool-group' },
        group.map((tool) => {
          const button = el(
            'button',
            {
              class: `tool ${tool.class ?? ''}`,
              type: 'button',
              title: tool.label,
              'aria-label': tool.label,
              'aria-pressed': 'false',
              onmousedown: (event) => event.preventDefault(),
              onclick: () => tool.run(this.editor.chain().focus()).run(),
            },
            tool.face,
          );
          this.buttons.push({ button, tool });
          return button;
        }),
      ),
    );
  }

  showEditor(visible) {
    this.toolbar.hidden = !visible;
    this.body.hidden = !visible;
    this.footer.hidden = !visible;
    this.empty.hidden = visible;
  }

  showState(state, error) {
    this.saveState.textContent = STATUS[state];
    this.saveState.dataset.state = state;
    if (state === 'failed') this.onError(error.message);
  }

  updateTools() {
    for (const { button, tool } of this.buttons) {
      button.setAttribute('aria-pressed', String(tool.active(this.editor)));
    }
  }

  scheduleCount() {
    clearTimeout(this.countTimer);
    this.countTimer = setTimeout(() => this.count(), COUNT_DELAY_MS);
  }

  count() {
    if (!this.editor) return;
    this.onWords(this.chapterId, countWords(plainText(this.editor.getJSON())));
  }

  showCounts(chapterWords, bookWords) {
    const chapter = this.goal
      ? `${formatCount(chapterWords)} of ${words(this.goal)} in this chapter`
      : `${words(chapterWords)} in this chapter`;
    this.counts.textContent = `${chapter} · ${words(bookWords)} in this book`;
  }

  // A new editor for each chapter keeps Undo inside that chapter, so it can never bring back another chapter's text.
  buildEditor(chapter) {
    this.editor?.destroy();
    this.editor = new Editor({
      element: this.host,
      injectCSS: false,
      extensions: [
        StarterKit.configure({ code: false, codeBlock: false, link: false, heading: { levels: [1, 2, 3] } }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        CommentMark,
        FindHighlight,
      ],
      content: toDocument(chapter.body),
      editorProps: {
        attributes: { class: 'page-text', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Chapter text', spellcheck: 'true' },
      },
      onUpdate: () => {
        this.saver.touch();
        this.scheduleCount();
      },
      onTransaction: () => this.updateTools(),
    });
    this.updateTools();
  }

  // Saves the chapter on screen before anything else happens. If that fails, it stays on screen.
  async flush() {
    clearTimeout(this.countTimer);
    this.count();
    await this.saver.flush();
  }

  async open(chapterId) {
    await this.flush();
    const chapter = await this.api.loadChapter(chapterId);
    this.show(chapter);
    return chapter;
  }

  show(chapter) {
    this.chapterId = chapter.id;
    this.goal = chapter.goal;
    this.titleInput.value = chapter.title;
    this.buildEditor(chapter);
    this.showEditor(true);
    this.saveState.textContent = STATUS.saved;
    this.saveState.dataset.state = 'saved';
    this.scroller.scrollTop = 0;
    this.comments.load(chapter.id).catch((error) => this.onError(error.message));
    this.findBar.refresh();
  }

  // For after a replace across the project: what's on disk is newer than what's on screen.
  async reload() {
    if (!this.chapterId) return;
    this.show(await this.api.loadChapter(this.chapterId));
  }

  async clear() {
    await this.flush();
    this.editor?.destroy();
    this.editor = null;
    this.chapterId = null;
    this.showEditor(false);
  }

  setTitle(title) {
    this.titleInput.value = title;
  }

  focus() {
    this.editor?.commands.focus();
  }
}
