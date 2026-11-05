import { DEFAULT_LAYOUT, EXPORT_FORMATS, TRIM_SIZES } from '../shared/details.js';
import { PAGE_FONTS } from '../shared/themes.js';
import { el } from './dom.js';
import { icon } from './icons.js';

const LAYOUT_KEY = 'exportLayout';
const FORMAT_KEY = 'exportFormat';
const USES_LAYOUT = new Set(['pdf', 'docx', 'odt']);

function savedLayout() {
  try {
    return { ...DEFAULT_LAYOUT, ...JSON.parse(localStorage.getItem(LAYOUT_KEY)) };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

function options(table) {
  return Object.entries(table).map(([value, item]) => el('option', { value }, item.label));
}

const row = (label, control) => el('label', { class: 'field' }, el('span', {}, label), control);

function tick(id, label, checked) {
  const box = el('input', { id, type: 'checkbox', checked });
  return { box, line: el('label', { class: 'check' }, box, label) };
}

// `scopes` is what can be exported from where the author is, nearest first.
export function openExport({ api, scopes, format: wanted, preview = false, onError }) {
  document.getElementById('export')?.remove();
  const layout = savedLayout();

  const scope = el('select', { id: 'export-scope', onchange: () => refresh() }, scopes.map((item, at) => el('option', { value: String(at) }, item.label)));
  const format = el('select', { id: 'export-format', onchange: () => refresh() }, options(EXPORT_FORMATS));
  format.value = wanted ?? localStorage.getItem(FORMAT_KEY) ?? 'docx';
  scope.value = String(Math.max(0, scopes.findIndex((item) => item.scope === 'book')));

  const trim = el('select', { id: 'export-trim' }, options(TRIM_SIZES));
  trim.value = layout.trim;
  const font = el('select', { id: 'export-font' }, options(PAGE_FONTS));
  font.value = layout.pageFont;
  const size = el('input', { id: 'export-size', type: 'number', min: '9', max: '18', step: '0.5', value: String(layout.fontSize) });
  const spacing = el('input', { id: 'export-spacing', type: 'number', min: '1.1', max: '2', step: '0.05', value: String(layout.lineHeight) });
  const target = el('input', { id: 'export-target', type: 'number', min: '0', max: '2000', step: '1', value: String(layout.targetPages), title: 'For a re-upload: keeps the published page count, so the cover’s spine still fits' });
  const right = tick('export-right', 'Start chapters on a right-hand page', layout.chapterStart === 'right');
  const numbers = tick('export-numbers', 'Page numbers', layout.pageNumbers);
  const headers = tick('export-headers', 'Running headers', layout.runningHeaders);
  const drop = tick('export-drop', 'Drop caps', layout.dropCaps);
  const contents = tick('export-contents', 'Contents page', layout.contents);
  const blank = tick('export-blank', 'End on a blank page, with an even page count', layout.endBlankEven);

  const layoutBox = el(
    'div',
    { id: 'export-layout' },
    el('h3', {}, 'Book layout'),
    row('Trim size', trim),
    row('Font', font),
    row('Text size (pt)', size),
    row('Line spacing', spacing),
    el('div', { class: 'checks' }, right.line, numbers.line, headers.line, contents.line, drop.line, blank.line),
    row('Keep exactly this many pages', target),
    el('p', { class: 'quiet-note' }, 'Leave at 0 unless you’re re-uploading a published book. Blank pages are added at the end to reach it.'),
  );
  const warnings = el('ul', { id: 'export-warnings', class: 'warning-list', role: 'status' });
  const result = el('div', { id: 'export-result', class: 'export-result', role: 'status' });

  function readLayout() {
    return {
      trim: trim.value,
      pageFont: font.value,
      fontSize: Number(size.value),
      lineHeight: Number(spacing.value),
      targetPages: Number(target.value),
      chapterStart: right.box.checked ? 'right' : 'any',
      pageNumbers: numbers.box.checked,
      runningHeaders: headers.box.checked,
      dropCaps: drop.box.checked,
      contents: contents.box.checked,
      endBlankEven: blank.box.checked,
    };
  }

  const input = () => {
    const { scope: kind, id } = scopes[Number(scope.value)];
    return { scope: kind, id, format: format.value, layout: readLayout() };
  };

  async function refresh() {
    layoutBox.hidden = !USES_LAYOUT.has(format.value);
    previewButton.hidden = format.value !== 'pdf';
    try {
      const problems = await api.checkExport(input());
      warnings.replaceChildren(...problems.map((text) => el('li', {}, text)));
    } catch (error) {
      warnings.replaceChildren(el('li', {}, error.message));
    }
  }

  const remember = () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(readLayout()));
    localStorage.setItem(FORMAT_KEY, format.value);
  };

  async function busy(button, work) {
    button.disabled = true;
    result.replaceChildren('Working…');
    try {
      await work();
    } catch (error) {
      result.replaceChildren(error.message);
      onError?.(error.message);
    } finally {
      button.disabled = false;
    }
  }

  const saved = (file) => {
    result.replaceChildren(
      el('span', { class: 'export-file' }, `Saved to ${file}`),
      el('button', { id: 'export-reveal', onclick: () => api.revealFile(file) }, 'Show in folder'),
    );
  };

  const exportButton = el(
    'button',
    {
      id: 'export-go',
      class: 'primary',
      onclick: () => busy(exportButton, async () => {
        remember();
        const done = await api.runExport(input());
        if (done) saved(done.file);
        else result.replaceChildren();
      }),
    },
    icon('export'),
    'Export',
  );
  const previewButton = el(
    'button',
    {
      id: 'export-preview',
      onclick: () => busy(previewButton, async () => {
        remember();
        await api.previewExport(input());
        result.replaceChildren('The preview is open. Its print button prints the book.');
      }),
    },
    icon('print'),
    'Preview and print',
  );
  const everything = el(
    'button',
    {
      id: 'export-everything',
      class: 'link',
      onclick: () => busy(everything, async () => {
        const done = await api.exportEverything();
        if (done) saved(done.folder);
        else result.replaceChildren();
      }),
    },
    'Export everything to a folder',
  );

  const dialog = el(
    'dialog',
    { id: 'export', class: 'dialog' },
    el('h2', {}, 'Export'),
    row('What', scope),
    row('As', format),
    layoutBox,
    warnings,
    result,
    el('div', { class: 'dialog-actions spread' }, everything, el('span', { class: 'action-group' }, el('button', { id: 'export-close', onclick: () => dialog.close() }, 'Close'), previewButton, exportButton)),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  refresh().then(() => {
    if (preview) previewButton.click();
  });
}
