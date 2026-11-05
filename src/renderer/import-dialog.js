import { el, formatCount, words } from './dom.js';
import { icon } from './icons.js';

function wordCheck(preview) {
  if (preview.originalWords === null) return `${words(preview.importedWords)} in these chapters.`;
  const total = preview.importedWords + preview.titleWords;
  const gap = total - preview.originalWords;
  const compared = `The file has ${formatCount(preview.originalWords)} words. These chapters have ${formatCount(preview.importedWords)}, plus ${formatCount(preview.titleWords)} in their titles.`;
  return gap === 0 ? `${compared} Nothing is missing.` : `${compared} That’s a difference of ${words(Math.abs(gap))}.`;
}

function findingRow(finding, onChange) {
  const box = el('input', { type: 'checkbox', checked: true, 'data-finding': finding.id, onchange: onChange });
  return el(
    'label',
    { class: 'finding' },
    box,
    el(
      'span',
      { class: 'finding-text' },
      el('b', {}, finding.label),
      el('span', { class: 'finding-before' }, finding.before || ' '),
      el('span', { class: 'finding-after' }, `→ ${finding.after.replace(/^#+\s+/, 'Heading: ') || 'Removed'}`),
    ),
  );
}

// `books` are the books in this project, and `parentId` is where a new book would go. An open book with nothing in it is
// the natural place for the file, so it starts out chosen.
export async function openImport({ api, books, parentId, emptyBookId, onDone, onError }) {
  document.getElementById('import')?.remove();
  let first;
  try {
    first = await api.chooseImport();
  } catch (error) {
    onError(error.message);
    return;
  }
  if (!first) return;
  const { token } = first;

  const findings = el('div', { id: 'import-findings', class: 'findings' });
  const list = el('ol', { id: 'import-sections', class: 'import-sections' });
  const check = el('p', { id: 'import-check', class: 'quiet-note' });
  const notes = el('ul', { id: 'import-notes', class: 'warning-list' });
  const split = el('select', { id: 'import-split', onchange: () => refresh() });
  const splitRow = el('label', { class: 'field' }, el('span', {}, 'Split into chapters'), split);
  const newTitle = el('input', { id: 'import-title', type: 'text', value: first.title, 'aria-label': 'Title of the new book' });
  const target = el(
    'select',
    { id: 'import-target', onchange: () => { newTitleRow.hidden = target.value !== 'new'; } },
    el('option', { value: 'new' }, 'A new book'),
    books.map((book) => el('option', { value: book.id }, `Add to: ${book.title}`)),
  );
  const newTitleRow = el('label', { class: 'field' }, el('span', {}, 'Title'), newTitle);
  if (emptyBookId) {
    target.value = emptyBookId;
    newTitleRow.hidden = true;
  }

  const accepted = () => [...findings.querySelectorAll('[data-finding]:checked')].map((box) => box.dataset.finding);

  function show(preview) {
    split.replaceChildren(...preview.options.map((option) => el('option', { value: option.mode }, option.label)));
    split.value = preview.mode;
    splitRow.hidden = preview.options.length === 0;
    list.replaceChildren(
      ...preview.sections.map((section) =>
        section.type === 'part'
          ? el('li', { class: 'import-part' }, section.title)
          : el('li', {}, el('span', {}, section.title), el('span', { class: 'row-words' }, formatCount(section.words)))),
    );
    check.textContent = wordCheck(preview);
    const lines = [...preview.notes];
    if (preview.comments) lines.push(`${preview.comments} ${preview.comments === 1 ? 'comment' : 'comments'} will come in too.`);
    notes.replaceChildren(...lines.map((text) => el('li', {}, text)));
  }

  async function refresh() {
    try {
      show(await api.previewImport({ token, accepted: accepted(), mode: split.value }));
    } catch (error) {
      onError(error.message);
    }
  }

  async function bringIn() {
    const wanted = target.value === 'new' ? { kind: 'new', parentId, title: newTitle.value } : { kind: 'book', id: target.value };
    go.disabled = true;
    try {
      const result = await api.commitImport({ token, accepted: accepted(), mode: split.value, target: wanted });
      dialog.close();
      await onDone(result);
    } catch (error) {
      go.disabled = false;
      onError(error.message);
    }
  }

  if (first.findings.length) {
    findings.replaceChildren(
      el('h3', {}, 'Clean-up'),
      el('p', { class: 'quiet-note' }, 'This looks like a file made with AI. Untick anything you want to keep as it is.'),
      ...first.findings.map((finding) => findingRow(finding, refresh)),
    );
  }

  const go = el('button', { id: 'import-go', class: 'primary', onclick: bringIn }, icon('import'), 'Import');
  const dialog = el(
    'dialog',
    { id: 'import', class: 'dialog wide' },
    el('h2', {}, `Import: ${first.file.split(/[\\/]/).pop()}`),
    el('p', { class: 'quiet-note' }, `${first.format}. The original file stays exactly as it is.`),
    el('div', { class: 'import-body' },
      el('div', {}, el('label', { class: 'field' }, el('span', {}, 'Bring it into'), target), newTitleRow, splitRow, findings),
      el('div', {}, el('h3', {}, 'What will come in'), list, check, notes)),
    el('div', { class: 'dialog-actions' }, el('button', { id: 'import-cancel', onclick: () => dialog.close() }, 'Cancel'), go),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  show(first);
  dialog.showModal();
}
