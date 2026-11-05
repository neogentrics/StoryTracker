// Earlier versions of a chapter: see what changed, and go back with one click.
import { diffWordsWithSpace } from 'diff';
import { plainText } from '../shared/text.js';
import { el, words } from './dom.js';
import { icon } from './icons.js';

const REASONS = {
  auto: 'Saved along the way',
  restore: 'Before a restore',
  replace: 'Before a replace',
};

const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function differences(older, newer) {
  const parts = diffWordsWithSpace(older, newer);
  const changed = parts.some((part) => part.added || part.removed);
  if (!changed) return [el('p', { class: 'quiet-note' }, 'These two are the same.')];
  return parts.map((part) => {
    if (part.added) return el('ins', {}, part.value);
    if (part.removed) return el('del', {}, part.value);
    return part.value;
  });
}

export async function openHistory({ api, page, onRestored, onError }) {
  document.getElementById('history')?.remove();
  await page.flush();
  const chapterId = page.chapterId;
  const versions = await api.listVersions(chapterId);
  const now = { id: 'now', body: JSON.stringify(page.editor.getJSON()) };
  const bodies = new Map([['now', now.body]]);

  const bodyOf = async (id) => {
    if (!bodies.has(id)) bodies.set(id, (await api.getVersion({ chapterId, versionId: id })).body);
    return bodies.get(id);
  };

  const view = el('div', { class: 'history-view', tabindex: '0', 'aria-label': 'What changed' });
  const against = el(
    'select',
    { id: 'history-against', 'aria-label': 'Compare with', onchange: () => show() },
    el('option', { value: 'now' }, 'The chapter now'),
    versions.map((version) => el('option', { value: String(version.id) }, when(version.at))),
  );
  const restore = el('button', { id: 'history-restore', class: 'primary', disabled: true, onclick: () => bringBack() }, icon('restore'), 'Restore this version');
  let chosen = null;

  async function show() {
    if (!chosen) return;
    const wanted = against.value === 'now' ? 'now' : Number(against.value);
    const [older, newer] = await Promise.all([bodyOf(chosen.id), bodyOf(wanted)]);
    view.replaceChildren(...differences(plainText(older), plainText(newer)));
  }

  function choose(version, row) {
    chosen = version;
    for (const item of list.children) item.classList.toggle('selected', item === row);
    restore.disabled = false;
    show().catch((error) => onError(error.message));
  }

  async function bringBack() {
    const sure = window.confirm(`Go back to the version from ${when(chosen.at)}? The chapter as it is now is kept in this list.`);
    if (!sure) return;
    const { outline } = await api.restoreVersion({ chapterId, versionId: chosen.id });
    dialog.close();
    await onRestored(outline);
  }

  const list = el(
    'ul',
    { class: 'history-list' },
    versions.map((version) => {
      const row = el(
        'li',
        {},
        el(
          'button',
          { class: 'history-row', onclick: () => choose(version, row) },
          el('span', { class: 'history-when' }, when(version.at)),
          el('span', { class: 'history-note' }, `${words(version.words)} · ${REASONS[version.reason] ?? 'Saved'}`),
        ),
      );
      return row;
    }),
  );

  const dialog = el(
    'dialog',
    { id: 'history', class: 'dialog wide' },
    el('h2', {}, 'Earlier versions'),
    versions.length === 0
      ? el('p', { class: 'quiet-note' }, 'Nothing yet. A copy is kept as you write, at most every ten minutes, and every copy from the last two days stays. Older ones thin out to one a day.')
      : el(
          'div',
          { class: 'history-body' },
          list,
          el('div', { class: 'history-right' }, el('label', { class: 'field' }, el('span', {}, 'Compare with'), against), view),
        ),
    el(
      'div',
      { class: 'dialog-actions' },
      el('button', { id: 'history-close', onclick: () => dialog.close() }, 'Close'),
      versions.length ? restore : null,
    ),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  list.querySelector('.history-row')?.click();
}
