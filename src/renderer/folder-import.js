import { sizeOf } from './attachments-dialog.js';
import { el, formatCount } from './dom.js';
import { icon } from './icons.js';

const KIND_ICONS = { series: 'library', book: 'book', part: 'folder', chapter: 'page', whole: 'page' };
const DRAGGABLE = new Set(['book', 'part', 'chapter', 'whole']);
const files = (count) => `${formatCount(count)} ${count === 1 ? 'file' : 'files'}`;
const versions = (count) => `${formatCount(count)} earlier ${count === 1 ? 'version' : 'versions'}`;
let showProgress = () => {};
let listening = false;

function holdsChapters(node) {
  return node.children.filter((child) => child.kind === 'chapter' || child.kind === 'whole').length;
}

function noteFor(node) {
  if (node.kind === 'whole') return 'Split into chapters when it comes in';
  if (node.kind === 'chapter') return node.older.length ? versions(node.older.length) : '';
  const parts = [];
  if (node.kind === 'book') parts.push(`${holdsChapters(node)} ${holdsChapters(node) === 1 ? 'chapter' : 'chapters'}`);
  if (node.cover) parts.push('cover');
  if (node.attachments.length) parts.push(`${node.attachments.length} attached`);
  return parts.join(' · ');
}

export async function openFolderImport({ api, chosen = null, onDone, onError }) {
  document.getElementById('find-files-dialog')?.remove();
  const body = el('div', { class: 'plan-screen', style: 'display: contents' });
  const actions = el('div', { class: 'dialog-actions' });
  const heading = el('h2', {}, 'Find my files');
  const dialog = el('dialog', { id: 'find-files-dialog', class: 'dialog huge' }, heading, body, actions);
  let working = false;
  let plan = null;
  const closed = new Set();
  let dragged = null;

  dialog.addEventListener('cancel', (event) => { if (working) event.preventDefault(); });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);

  const progressBar = el('progress', { id: 'folder-progress', class: 'folder-progress' });
  const progressText = el('p', { id: 'folder-progress-text', class: 'quiet-note' });
  if (!listening) {
    listening = true;
    api.onFolderProgress((data) => showProgress(data));
  }
  showProgress = (data) => {
    if (data.stage === 'looking') progressText.textContent = `Looking through your folder. ${files(data.found)} so far.`;
    else if (data.stage === 'comparing') {
      progressBar.max = data.total;
      progressBar.value = data.done;
      progressText.textContent = `Comparing files that might be copies: ${formatCount(data.done)} of ${formatCount(data.total)}.`;
    } else {
      progressBar.max = data.total;
      progressBar.value = data.done;
      progressText.textContent = `${formatCount(data.done)} of ${files(data.total)}. ${data.name}`;
    }
  };

  const button = (id, label, onclick, extra = {}) => el('button', { id, onclick, ...extra }, label);
  const close = () => dialog.close();

  async function change(edit) {
    try {
      showPlan(await api.editFolderPlan(edit));
    } catch (error) {
      onError(error.message);
    }
  }

  function renameInto(row, node, title) {
    const input = el('input', { type: 'text', value: node.title, 'aria-label': `New title for ${node.title}` });
    const done = (keep) => {
      if (keep && input.value.trim() && input.value !== node.title) change({ type: 'title', id: node.id, value: input.value });
      else input.replaceWith(title);
    };
    input.addEventListener('blur', () => done(true));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        done(false);
      }
    });
    title.replaceWith(input);
    input.select();
  }

  function fileRow(id) {
    const file = plan.files.find((item) => item.id === id);
    const role = el(
      'select',
      {
        'aria-label': `What to do with ${file.name}`,
        onchange: (event) => change(event.target.value === 'leave' ? { type: 'leave', id, left: true } : { type: 'role', id, role: event.target.value }),
      },
      el('option', { value: 'attachment' }, 'Attachment'),
      file.kind === 'writing' ? el('option', { value: 'chapter' }, 'Chapter') : null,
      el('option', { value: 'leave' }, 'Leave out'),
    );
    return el('li', {}, el('div', { class: 'plan-row' }, el('span', { class: 'plan-title', title: file.rel }, file.name), el('span', { class: 'plan-note' }, sizeOf(file.size)), role));
  }

  function nodeRow(node) {
    const hasInside = node.children.length > 0 || node.attachments.length > 0;
    const open = !closed.has(node.id);
    const title = el('button', { class: 'plan-title', title: 'Double-click to rename', ondblclick: () => renameInto(row, node, title) }, node.title);
    const row = el(
      'div',
      { class: `plan-row ${node.kind}`, draggable: DRAGGABLE.has(node.kind) ? 'true' : 'false', 'data-node': node.id, 'data-kind': node.kind },
      el('button', {
        class: 'plan-toggle',
        'aria-label': `${open ? 'Close' : 'Open'} ${node.title}`,
        hidden: !hasInside,
        onclick: () => {
          if (open) closed.add(node.id);
          else closed.delete(node.id);
          showPlan(plan);
        },
      }, open ? '▾' : '▸'),
      icon(KIND_ICONS[node.kind] ?? 'book'),
      title,
      el('span', { class: 'plan-note' }, noteFor(node)),
      el('button', {
        class: 'link plan-note',
        'aria-label': `Leave out ${node.title}`,
        onclick: () => change({ type: 'leave', id: node.id, left: true }),
      }, 'Leave out'),
    );
    row.addEventListener('dragstart', (event) => {
      dragged = node;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', node.id);
    });
    row.addEventListener('dragover', (event) => {
      if (!dragged || dragged.id === node.id) return;
      event.preventDefault();
      row.classList.add('drop-here');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-here'));
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      row.classList.remove('drop-here');
      const moving = dragged;
      dragged = null;
      if (!moving || moving.id === node.id) return;
      const inside = ['series', 'book', 'part'].includes(node.kind) && !(moving.kind === 'book' && node.kind === 'book');
      if (inside) change({ type: 'move', id: moving.id, to: node.id });
      else change({ type: 'move', id: moving.id, to: parentOf(node).id, before: node.id });
    });
    return el(
      'li',
      {},
      row,
      open && hasInside
        ? el('ul', {}, node.children.map(nodeRow), node.attachments.length ? el('li', { class: 'plan-files' }, el('ul', {}, node.attachments.map(fileRow))) : null)
        : null,
    );
  }

  function parentOf(target, node = plan.tree) {
    for (const child of node.children) {
      if (child.id === target.id) return node;
      const found = parentOf(target, child);
      if (found) return found;
    }
    return null;
  }

  function askCard(ask) {
    return el(
      'div',
      { class: 'ask-card', 'data-ask': ask.type },
      el('p', {}, el('b', {}, ask.question)),
      el('p', { class: 'quiet-note' }, ask.detail),
      ask.files ? el('ul', { class: 'ask-files' }, ask.files.slice(0, 40).map((file) => el('li', {}, file))) : null,
      ask.options.map((option) => el(
        'label',
        {},
        el('input', { type: 'radio', name: ask.id, checked: option.value === ask.value, onchange: () => change({ type: 'answer', id: ask.id, value: option.value }) }),
        option.label,
      )),
    );
  }

  function showPlan(next) {
    plan = next;
    const { totals } = plan;
    const room = plan.freeBytes >= totals.attachmentBytes;
    heading.textContent = `Find my files: ${plan.root.split(/[\\/]/).pop()}`;
    const summary = [
      `${files(totals.files)}, ${sizeOf(totals.bytes)}.`,
      `${formatCount(totals.chapters + totals.whole)} to read as writing, ${versions(totals.older)}, ${formatCount(totals.attachments + totals.covers)} to keep as attachments.`,
      totals.duplicates ? `${formatCount(totals.duplicates)} exact copies.` : '',
      `Your originals are never touched.`,
    ].filter(Boolean).join(' ');
    const open = plan.asks.filter((ask) => !ask.answered).length;
    const space = room ? [] : [el('p', { id: 'plan-space', class: 'room-message' }, `This needs ${sizeOf(totals.attachmentBytes)} of space, and only ${sizeOf(plan.freeBytes)} is free.`)];
    body.replaceChildren(
      el('p', { id: 'plan-summary', class: 'quiet-note' }, summary),
      ...space,
      el(
        'div',
        { class: 'plan-body' },
        el('div', { id: 'plan-tree', class: 'plan-tree' }, el('ul', {}, plan.tree.children.map(nodeRow), plan.tree.attachments.length ? el('li', {}, el('div', { class: 'plan-row' }, icon('attach'), el('span', { class: 'plan-title' }, 'Kept with the project')), el('ul', { class: 'plan-files' }, plan.tree.attachments.map(fileRow))) : null)),
        el(
          'div',
          { id: 'plan-asks', class: 'plan-asks' },
          el('h3', {}, 'Ask me'),
          plan.asks.length
            ? el('p', { class: 'quiet-note' }, open ? 'Anything you leave uses the choice shown.' : 'All answered.')
            : el('p', { class: 'quiet-note' }, 'Nothing to ask. Everything had a clear place.'),
          plan.asks.map(askCard),
        ),
      ),
    );
    actions.replaceChildren(
      button('plan-cancel', 'Cancel', close),
      el('button', { id: 'plan-go', class: 'primary', disabled: !room, onclick: () => bringIn(api.runFolderImport) }, icon('import'), 'Bring it in'),
    );
  }

  function showWorking(text) {
    progressText.textContent = text;
    progressBar.removeAttribute('value');
    body.replaceChildren(progressBar, progressText);
  }

  async function bringIn(start) {
    working = true;
    showWorking('Starting.');
    actions.replaceChildren(button('folder-stop', 'Stop', async (event) => {
      event.target.disabled = true;
      progressText.textContent = 'Stopping after this file.';
      await api.stopFolderImport();
    }));
    try {
      const result = await start();
      working = false;
      await onDone(result.outline);
      showReport(result);
    } catch (error) {
      working = false;
      onError(error.message);
      close();
    }
  }

  function showReport({ finished, report }) {
    heading.textContent = finished ? 'That’s everything' : 'Stopped';
    body.replaceChildren(
      el('p', { id: 'report-total' }, finished
        ? `All ${files(report.total)} accounted for.`
        : `${formatCount(report.accounted)} of ${files(report.total)} done. Choose Find My Files in the File menu to pick up where this stopped.`),
      el('div', { id: 'report-groups', class: 'report-groups' }, report.groups.map((group) => el(
        'details',
        {},
        el('summary', {}, `${group.label}: ${formatCount(group.files.length)}`),
        el('ul', {}, group.files.slice(0, 2000).map((file) => el('li', {}, file.rel, file.note ? el('span', {}, ` — ${file.note}`) : null))),
      ))),
    );
    actions.replaceChildren(
      button('report-save', 'Save the report', () => api.saveFolderReport(report).catch((error) => onError(error.message))),
      el('button', { id: 'report-close', class: 'primary', onclick: close }, 'Done'),
    );
  }

  async function scan() {
    working = true;
    showWorking('Looking through your folder.');
    actions.replaceChildren(button('folder-stop', 'Stop', () => api.stopFolderImport()));
    try {
      const result = await api.scanFolder();
      working = false;
      showPlan(result);
    } catch (error) {
      working = false;
      if (error.message !== 'Stopped.') onError(error.message);
      close();
    }
  }

  function offerResume(pending) {
    heading.textContent = 'An import stopped partway';
    body.replaceChildren(el('p', { id: 'resume-note' }, `It was reading ${pending.root}. Nothing already brought in will be repeated.`));
    actions.replaceChildren(
      button('resume-drop', 'Forget it', async () => {
        await api.discardFolderImport();
        close();
      }),
      el('button', { id: 'resume-go', class: 'primary', onclick: () => bringIn(api.resumeFolderImport) }, 'Pick up where it stopped'),
    );
  }

  const pending = await api.pendingFolderImport();
  if (pending) {
    offerResume(pending);
    dialog.showModal();
    return;
  }
  const folder = chosen ?? await api.chooseFolder();
  if (!folder) {
    dialog.remove();
    return;
  }
  dialog.showModal();
  await scan();
}
