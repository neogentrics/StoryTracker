import { SECTIONS } from '../shared/details.js';
import { el } from './dom.js';
import { icon } from './icons.js';

function fieldFor(field, value) {
  const props = { id: `detail-${field.name}`, 'data-field': field.name, placeholder: field.hint ?? '', 'aria-label': field.label };
  const control = field.long ? el('textarea', { ...props, rows: '3' }) : el('input', { ...props, type: 'text' });
  control.value = value ?? '';
  return el('label', { class: 'field' }, el('span', {}, field.label), control);
}

export async function openDetails({ api, bookId, onError }) {
  document.getElementById('details')?.remove();
  const { title, details, cover } = await api.getDetails(bookId);
  const picture = el('div', { id: 'cover-preview', class: 'cover-preview' });
  const showCover = (value) => {
    picture.replaceChildren(
      ...(value
        ? [el('img', { src: value.url, alt: 'The cover' }), el('span', { class: 'quiet-note' }, `${value.width} × ${value.height} pixels`)]
        : [el('span', { class: 'quiet-note' }, 'No cover yet. Most stores ask for a JPEG or PNG at least 1000 × 1600 pixels, and KDP suggests 1600 × 2560.')]),
    );
  };
  showCover(cover);

  const chooseCover = async () => {
    try {
      const chosen = await api.chooseCover(bookId);
      if (chosen) showCover(chosen);
    } catch (error) {
      onError(error.message);
    }
  };
  const removeCover = async () => {
    await api.removeCover(bookId);
    showCover(null);
  };

  const form = el(
    'form',
    {
      class: 'details-form',
      onsubmit: async (event) => {
        event.preventDefault();
        const values = {};
        for (const control of form.querySelectorAll('[data-field]')) values[control.dataset.field] = control.value;
        try {
          await api.saveDetails({ id: bookId, details: values });
          dialog.close();
        } catch (error) {
          onError(error.message);
        }
      },
    },
    el('h3', {}, 'Cover'),
    picture,
    el('div', { class: 'word-form' }, el('button', { id: 'cover-choose', type: 'button', onclick: chooseCover }, icon('open'), 'Choose a picture…'), el('button', { id: 'cover-remove', type: 'button', onclick: removeCover }, 'Remove')),
    SECTIONS.map((section) => [el('h3', {}, section.title), section.fields.map((field) => fieldFor(field, details[field.name]))]),
    el(
      'div',
      { class: 'dialog-actions' },
      el('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel'),
      el('button', { id: 'details-save', class: 'primary', type: 'submit' }, 'Save'),
    ),
  );
  const dialog = el('dialog', { id: 'details', class: 'dialog' }, el('h2', {}, `Book details: ${title}`), form);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
