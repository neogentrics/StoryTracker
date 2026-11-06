// A document another app sent. Nothing is filed by itself: this is where the author says where it goes.
import { el, formatCount } from './dom.js';

const NEW_BOOK = '';

function select(id, entries, value) {
  const control = el('select', { id }, entries.map(([key, label]) => el('option', { value: key }, label)));
  control.value = value;
  return control;
}

function field(label, control) {
  return el('label', { class: 'field' }, el('span', {}, label), control);
}

export async function openInbox({ api, books, bookId, onAdded, onNext, onDifferentProject, onError }) {
  document.getElementById('inbox')?.remove();
  const [item] = await api.inboxList();
  if (!item) return;

  const book = select('inbox-book', [...books.map((entry) => [entry.id, entry.title]), [NEW_BOOK, 'A new book']], bookId ?? NEW_BOOK);
  const kind = select('inbox-as', item.options.map((option) => [option.mode, option.label]), item.options[0].mode);
  const size = `${formatCount(item.words)} ${item.words === 1 ? 'word' : 'words'}${item.pictures ? `, with ${item.pictures} ${item.pictures === 1 ? 'picture' : 'pictures'}` : ''}`;

  const attempt = async (work) => {
    try {
      await work();
    } catch (error) {
      dialog.close();
      onError(error.message);
    }
  };

  const dialog = el(
    'dialog',
    { id: 'inbox', class: 'dialog' },
    el('h2', { id: 'inbox-title' }, `${item.from} sent “${item.name}”`),
    el('p', { class: 'quiet-note' }, `${size}. It’s only in memory until you add it.`),
    field('Add to', book),
    field('As', kind),
    el('div', { class: 'dialog-actions spread' },
      el('button', { id: 'inbox-other', class: 'link', onclick: () => {
        dialog.close();
        onDifferentProject();
      } }, 'A different project'),
      el('div', { class: 'way-actions' },
        el('button', { id: 'inbox-drop', onclick: () => attempt(async () => {
          await api.inboxDrop(item.id);
          dialog.close();
          await onNext();
        }) }, 'Throw away'),
        el('button', { id: 'inbox-later', onclick: () => dialog.close() }, 'Not now'),
        el('button', { id: 'inbox-add', class: 'primary', onclick: () => attempt(async () => {
          const result = await api.inboxAdd({ id: item.id, bookId: book.value || null, mode: kind.value });
          dialog.close();
          await onAdded(result);
        }) }, 'Add'))),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
