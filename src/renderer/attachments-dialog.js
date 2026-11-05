import { el, formatCount } from './dom.js';
import { icon } from './icons.js';

export function sizeOf(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${formatCount(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

// What's kept with a book, or with the project when no book is open. Files stay encrypted, and leave by Save a copy.
export async function openAttachments({ api, id, title, onError }) {
  document.getElementById('attachments')?.remove();
  const list = el('ul', { id: 'attachment-list', class: 'attachment-list' });
  const attempt = async (work) => {
    try {
      await work();
    } catch (error) {
      onError(error.message);
    }
  };

  function row(item) {
    const thumb = el('img', { class: 'attachment-thumb', alt: '' });
    if (/^image\//.test(item.type) && item.size < 5 * 1024 * 1024) {
      api.previewAttachment(item.id).then((url) => { if (url) thumb.src = url; }).catch(() => {});
    }
    return el(
      'li',
      { class: 'attachment-row' },
      thumb,
      el('div', { class: 'attachment-name' }, el('span', { title: item.from || item.name }, item.name), el('small', {}, `${sizeOf(item.size)} · ${item.owner}`)),
      el('button', { 'aria-label': `Save a copy of ${item.name}`, onclick: () => attempt(() => api.saveAttachment(item.id)) }, 'Save a copy'),
      el('button', {
        class: 'quiet icon-only',
        title: 'Move to Trash',
        'aria-label': `Move ${item.name} to Trash`,
        onclick: () => attempt(async () => {
          await api.trashItem(item.id);
          await show();
        }),
      }, icon('trash')),
    );
  }

  async function show() {
    const items = await api.listAttachments(id);
    list.replaceChildren(...(items.length ? items.map(row) : [el('li', { class: 'quiet-note' }, 'Nothing is attached yet.')]));
  }

  const add = el('button', {
    id: 'attachment-add',
    class: 'primary',
    onclick: () => attempt(async () => {
      await api.addAttachments(id);
      await show();
    }),
  }, icon('plus'), 'Add files');
  const dialog = el(
    'dialog',
    { id: 'attachments', class: 'dialog wide' },
    el('h2', {}, `Attachments: ${title}`),
    el('p', { class: 'quiet-note' }, 'Pictures, audio and other files kept with your writing, encrypted like the rest of the project.'),
    list,
    el('div', { class: 'dialog-actions' }, el('button', { id: 'attachments-close', onclick: () => dialog.close() }, 'Close'), add),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  await show();
  dialog.showModal();
}
