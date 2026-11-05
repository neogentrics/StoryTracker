// Notes on a selection. The mark in the text only holds an ID, and the note itself is saved beside the chapter, so a
// comment never counts as words and never reaches anything exported from the book.
import { Mark, mergeAttributes } from '@tiptap/core';
import { el } from './dom.js';

export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  excludes: '',
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (node) => node.getAttribute('data-comment'),
        renderHTML: (attributes) => ({ 'data-comment': attributes.id }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-comment]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-mark' }), 0];
  },
});

function rangesOf(editor, id) {
  const ranges = [];
  editor.state.doc.descendants((node, position) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === 'comment' && mark.attrs.id === id)) {
      ranges.push({ from: position, to: position + node.nodeSize, text: node.text });
    }
  });
  return ranges;
}

export class CommentsPanel {
  constructor(root, { api, page, onError }) {
    this.api = api;
    this.page = page;
    this.onError = onError;
    this.comments = [];
    this.list = el('ul', { class: 'comment-list' });
    this.box = el('textarea', { class: 'comment-box', rows: '3', placeholder: 'Your note', 'aria-label': 'New comment' });
    this.form = el(
      'form',
      { class: 'comment-form', hidden: true, onsubmit: (event) => this.save(event) },
      this.box,
      el(
        'div',
        { class: 'dialog-actions' },
        el('button', { type: 'button', onclick: () => this.cancel() }, 'Cancel'),
        el('button', { class: 'primary comment-save', type: 'submit' }, 'Add comment'),
      ),
    );
    this.root = el('aside', { class: 'comments', 'aria-label': 'Comments', hidden: true }, el('h2', {}, 'Comments'), this.form, this.list);
    root.append(this.root);
  }

  async load(chapterId) {
    this.comments = await this.api.listComments(chapterId);
    this.form.hidden = true;
    this.pending = null;
    this.render();
  }

  render() {
    this.root.hidden = this.comments.length === 0 && this.form.hidden;
    this.list.replaceChildren(...this.comments.map((comment) => this.card(comment)));
  }

  card(comment) {
    const ranges = rangesOf(this.page.editor, comment.id);
    const quote = ranges.map((range) => range.text).join(' ');
    const text = el('textarea', { class: 'comment-text', rows: '3', 'aria-label': 'Comment' });
    text.value = comment.text;
    text.addEventListener('change', () => this.edit(comment, text));
    return el(
      'li',
      { class: 'comment-card' },
      el(
        'button',
        { class: 'comment-quote', type: 'button', onclick: () => this.show(comment) },
        quote || 'The words this was on are gone',
      ),
      text,
      el('button', { class: 'quiet comment-remove', type: 'button', onclick: () => this.remove(comment) }, 'Remove'),
    );
  }

  // The selection is held here until the note is saved, because typing in the box moves focus off the page.
  start() {
    const { editor } = this.page;
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      this.onError('Select some words first, then add a comment.');
      return;
    }
    this.pending = { from, to };
    this.form.hidden = false;
    this.root.hidden = false;
    this.box.value = '';
    this.box.focus();
  }

  cancel() {
    this.pending = null;
    this.form.hidden = true;
    this.render();
  }

  async save(event) {
    event.preventDefault();
    if (!this.pending || !this.box.value.trim()) return;
    const comment = await this.api.addComment({ chapterId: this.page.chapterId, text: this.box.value });
    const { editor } = this.page;
    const { from, to } = this.pending;
    editor.view.dispatch(editor.state.tr.addMark(from, to, editor.schema.marks.comment.create({ id: comment.id })));
    this.comments.push(comment);
    this.pending = null;
    this.form.hidden = true;
    this.render();
    this.page.focus();
  }

  async edit(comment, input) {
    if (!input.value.trim()) {
      input.value = comment.text;
      return;
    }
    await this.api.editComment({ id: comment.id, text: input.value });
    comment.text = input.value;
  }

  show(comment) {
    const [first] = rangesOf(this.page.editor, comment.id);
    if (first) this.page.editor.chain().focus().setTextSelection({ from: first.from, to: first.to }).scrollIntoView().run();
  }

  async remove(comment) {
    if (!window.confirm('Remove this comment?')) return;
    await this.api.removeComment(comment.id);
    const { editor } = this.page;
    const mark = editor.schema.marks.comment.create({ id: comment.id });
    const { tr } = editor.state;
    for (const range of rangesOf(editor, comment.id)) tr.removeMark(range.from, range.to, mark);
    editor.view.dispatch(tr);
    this.comments = this.comments.filter((item) => item.id !== comment.id);
    this.render();
  }
}
