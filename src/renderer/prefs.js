import { BACKUP_EVERY, LIMITS, LOCK_AFTER, PAGE_FONTS, THEMES, UI_FONTS } from '../shared/themes.js';
import { el } from './dom.js';
import { applyLook } from './look.js';

function field(label, control) {
  return el('label', { class: 'field' }, el('span', {}, label), control);
}

function select(id, options, value, onChange) {
  const control = el(
    'select',
    { id, onchange: () => onChange(control.value) },
    Object.entries(options).map(([key, option]) => el('option', { value: key }, option.label)),
  );
  control.value = value;
  return control;
}

function range(id, name, value, onChange) {
  const [min, max] = LIMITS[name];
  const control = el('input', { id, type: 'range', min: String(min), max: String(max), step: '1', value: String(value) });
  control.addEventListener('input', () => onChange(Number(control.value)));
  return control;
}

function wordRow(word, onRemove) {
  return el(
    'li',
    { class: 'word-row' },
    el('span', {}, word),
    el('button', { class: 'quiet', 'aria-label': `Remove ${word}`, onclick: () => onRemove(word) }, 'Remove'),
  );
}

// Everything changes as it's picked, so there's nothing to apply and nothing to lose.
export async function openPreferences(api) {
  document.getElementById('preferences')?.remove();
  let settings = await api.settings();
  const change = async (name, value) => {
    settings = await api.saveSettings({ [name]: value });
    applyLook(settings);
  };

  const words = el('ul', { id: 'dictionary-words', class: 'word-list' });
  const showWords = async () => {
    const list = await api.dictionary();
    words.replaceChildren(
      ...(list.length ? list.map((word) => wordRow(word, removeWord)) : [el('li', { class: 'quiet-note' }, 'No words yet.')]),
    );
  };
  const removeWord = async (word) => {
    await api.removeWord(word);
    await showWords();
  };
  const newWord = el('input', { id: 'new-word', type: 'text', placeholder: 'A name or word', 'aria-label': 'Word to add' });
  const addWord = async (event) => {
    event.preventDefault();
    if (!newWord.value.trim()) return;
    await api.addWord(newWord.value.trim());
    newWord.value = '';
    await showWords();
  };

  const folder = el('span', { id: 'backup-folder', class: 'backup-folder' });
  const backupNote = el('p', { id: 'backup-note', class: 'quiet-note', role: 'status' });
  const showBackups = async () => {
    folder.textContent = settings.backupFolder || 'No folder chosen yet';
    const { last, error } = await api.backupStatus();
    if (error) backupNote.textContent = `The last backup had a problem. ${error}`;
    else backupNote.textContent = last ? `Last backup: ${new Date(last).toLocaleString()}` : 'No backups yet.';
  };
  const chooseFolder = async () => {
    settings = await api.chooseBackupFolder();
    await showBackups();
  };
  const backupNow = async () => {
    try {
      const { saved, error } = await api.backupNow();
      await showBackups();
      if (!error && saved === 0) backupNote.textContent = 'Nothing has changed since the last backup.';
    } catch (error) {
      backupNote.textContent = error.message;
    }
  };

  const themes = { system: { label: 'Same as this computer' }, ...THEMES };
  const dialog = el(
    'dialog',
    { id: 'preferences', class: 'dialog' },
    el('h2', {}, 'Preferences'),
    el(
      'section',
      {},
      el('h3', {}, 'Look'),
      field('Theme', select('pref-theme', themes, settings.theme, (value) => change('theme', value))),
      el(
        'label',
        { class: 'check' },
        el('input', {
          id: 'pref-glass',
          type: 'checkbox',
          checked: settings.glass,
          onchange: (event) => change('glass', event.target.checked),
        }),
        'Glass: frosted panels over colour, with any theme but High Contrast',
      ),
      field('Page font', select('pref-page-font', PAGE_FONTS, settings.pageFont, (value) => change('pageFont', value))),
      field('App font', select('pref-ui-font', UI_FONTS, settings.uiFont, (value) => change('uiFont', value))),
      field('Text size', range('pref-text-size', 'textSize', settings.textSize, (value) => change('textSize', value))),
      field('Page width', range('pref-page-width', 'pageWidth', settings.pageWidth, (value) => change('pageWidth', value))),
    ),
    el(
      'section',
      {},
      el('h3', {}, 'Spelling'),
      el(
        'label',
        { class: 'check' },
        el('input', {
          id: 'pref-spellcheck',
          type: 'checkbox',
          checked: settings.spellcheck,
          onchange: (event) => change('spellcheck', event.target.checked),
        }),
        'Check spelling as I type',
      ),
      el('p', { class: 'quiet-note' }, 'Your own words stop being marked wrong in every project. Right-click a word to add it, or add one here.'),
      el('form', { class: 'word-form', onsubmit: addWord }, newWord, el('button', { type: 'submit' }, 'Add')),
      words,
    ),
    el(
      'section',
      {},
      el('h3', {}, 'Backups'),
      el('p', { class: 'quiet-note' }, 'Each project is saved as a closed .rtstory file, which is safe in OneDrive or Dropbox. To bring one back, use File, then Open Project File.'),
      el('div', { class: 'word-form' }, folder, el('button', { id: 'backup-choose', onclick: chooseFolder }, 'Choose folder…')),
      field('How often', select('pref-backup-every', BACKUP_EVERY, settings.backupEvery, (value) => change('backupEvery', value))),
      field('Keep the newest', el('input', {
        id: 'pref-backup-keep',
        type: 'number',
        min: String(LIMITS.backupKeep[0]),
        max: String(LIMITS.backupKeep[1]),
        value: String(settings.backupKeep),
        onchange: (event) => change('backupKeep', Number(event.target.value)),
      })),
      el('div', { class: 'word-form' }, el('button', { id: 'backup-now', onclick: backupNow }, 'Back up now'), backupNote),
    ),
    el(
      'section',
      {},
      el('h3', {}, 'Lock'),
      field('Lock a project that has a password', select('pref-lock-after', LOCK_AFTER, String(settings.lockAfter), (value) => change('lockAfter', Number(value)))),
      el('p', { class: 'quiet-note' }, 'Counts time away from this app. A project with a password also locks when you close it, and when this computer locks or sleeps.'),
    ),
    el('div', { class: 'dialog-actions' }, el('button', { id: 'pref-close', class: 'primary', onclick: () => dialog.close() }, 'Done')),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  await showWords();
  await showBackups();
  dialog.showModal();
}
