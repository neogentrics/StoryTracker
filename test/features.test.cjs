'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Library } = require('../src/main/storage/library');
const { Settings } = require('../src/main/settings');
const { Workspace } = require('../src/main/workspace');
const { findInDocument, matchesIn, replaceInDocument } = require('../src/shared/find');
const { findNode } = require('../src/shared/outline');
const { documentFromText, plainText } = require('../src/shared/text');
const { DEFAULT_SETTINGS, PAGE_FONTS, THEMES, cleanSettings } = require('../src/shared/themes');

const tempDirs = [];
const workspaces = [];

test.after(() => {
  workspaces.forEach((space) => space.closeProject());
  tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-features-'));
  tempDirs.push(dir);
  return dir;
}

function book({ now } = {}) {
  const space = new Workspace(new Library(path.join(tempDir(), 'library'), now ? { now } : {}));
  workspaces.push(space);
  const { id, outline } = space.createProject('A Book');
  const bookId = outline.children[0].id;
  return { space, id, bookId, first: outline.children[0].children[0].id };
}

const body = (text) => JSON.stringify(documentFromText(text));
const textOf = (space, id) => plainText(space.loadChapter(id).body);

// WCAG contrast, on the real theme values. A colour with transparency is laid over what's behind it first.
function channels(hex) {
  const values = [1, 3, 5, 7].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  return { rgb: values.slice(0, 3), alpha: Number.isNaN(values[3]) ? 1 : values[3] };
}

function solid(hex, behind) {
  const { rgb, alpha } = channels(hex);
  if (alpha === 1) return rgb;
  const under = channels(behind).rgb;
  return rgb.map((value, at) => value * alpha + under[at] * (1 - alpha));
}

function luminance(rgb) {
  const linear = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

for (const [name, theme] of Object.entries(THEMES)) {
  test(`${name}: every text colour can be read`, () => {
    const on = (color) => solid(color, theme.desk);
    const panelInk = theme.onPanel ?? theme.ink;
    const panelSoft = theme.onPanelSoft ?? theme.inkSoft;
    const pairs = [
      ['the writing', theme.ink, theme.sheet, 7],
      ['quiet text on the page', theme.inkSoft, theme.sheet, 4.5],
      ['panel text', panelInk, theme.panel, 4.5],
      ['panel text, lower down', panelInk, theme.panelEnd, 4.5],
      ['quiet text', panelSoft, theme.panel, 4.5],
      ['quiet text, lower down', panelSoft, theme.panelEnd, 4.5],
      ['the bar', theme.onBar, theme.barStart, 4.5],
      ['the bar, far end', theme.onBar, theme.barEnd, 4.5],
      ['buttons', theme.onAccent, theme.accent, 4.5],
      ['warnings', theme.danger, theme.dangerBg, 4.5],
    ];
    for (const [label, text, ground, least] of pairs) {
      const ratio = contrast(on(text), on(ground));
      assert.ok(ratio >= least, `${name}, ${label}: ${ratio.toFixed(2)} is under ${least}`);
    }
  });
}

// Glass lays the panels and the page over the colours behind them, so the text is measured on the worst of those.
for (const [name, theme] of Object.entries(THEMES).filter(([, item]) => !item.flat)) {
  test(`${name}: can still be read as glass`, () => {
    const over = (color, share, stop) => {
      const under = channels(stop).rgb;
      return solid(color, stop).map((value, at) => value * share + under[at] * (1 - share));
    };
    for (const stop of theme.deskStops) {
      for (const panel of [theme.panel, theme.panelEnd]) {
        const ground = over(panel, 0.72, stop);
        const ratio = contrast(solid(theme.onPanelSoft ?? theme.inkSoft, stop), ground);
        assert.ok(ratio >= 4.5, `${name}, quiet text over ${stop}: ${ratio.toFixed(2)}`);
      }
      const ratio = contrast(solid(theme.ink, stop), over(theme.sheet, 0.9, stop));
      assert.ok(ratio >= 7, `${name}, the writing over ${stop}: ${ratio.toFixed(2)}`);
    }
  });
}

test('only High Contrast is one flat colour', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const flat = theme.panel === theme.panelEnd && theme.barStart === theme.barEnd;
    assert.equal(flat, Boolean(theme.flat), name);
  }
});

test('settings survive anything in the file', () => {
  assert.deepEqual(cleanSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(cleanSettings({ theme: 'nope', pageFont: 'constructor', textSize: 900, pageWidth: 'wide' }), DEFAULT_SETTINGS);
  assert.equal(cleanSettings({ theme: 'plum' }).theme, 'plum');
  assert.equal(cleanSettings({ theme: 'system' }).theme, 'system');
  assert.equal(cleanSettings({ spellcheck: false }).spellcheck, false);
  assert.ok(PAGE_FONTS.georgia);

  const root = tempDir();
  fs.writeFileSync(path.join(root, 'settings.json'), 'not json');
  const settings = new Settings(root);
  assert.equal(settings.values.theme, 'system');
  settings.save({ theme: 'sepia', textSize: 20 });
  assert.equal(new Settings(root).values.theme, 'sepia');
  assert.equal(new Settings(root).values.textSize, 20);
});

test('finding respects case and whole words', () => {
  assert.equal(matchesIn('Cat cat cathedral', 'cat').length, 3);
  assert.equal(matchesIn('Cat cat cathedral', 'cat', { matchCase: true }).length, 2);
  assert.equal(matchesIn('Cat cat cathedral', 'cat', { wholeWord: true }).length, 2);
  assert.equal(matchesIn('Cat cat cathedral', 'cat', { matchCase: true, wholeWord: true }).length, 1);
  assert.equal(matchesIn('a.b axb (c)', 'a.b').length, 1, 'symbols are plain text');
  assert.equal(matchesIn('anything', '').length, 0);
  assert.equal(matchesIn('Élan élan', 'élan').length, 2);
});

const styled = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'the ' },
        { type: 'text', text: 'gr', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'ey cat' },
        { type: 'hardBreak' },
        { type: 'text', text: 'grey' },
      ],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'not here' }] },
  ],
};

test('a match can cross bold and italic, but not a line break', () => {
  assert.equal(findInDocument(styled, 'grey').length, 2);
  assert.equal(findInDocument(styled, 'cat grey').length, 0);
  const [first] = findInDocument(styled, 'grey');
  assert.deepEqual([first.before, first.match], ['the ', 'grey']);
});

test('replacing keeps the rest of the formatting and leaves the original alone', () => {
  const before = JSON.stringify(styled);
  const { document, count } = replaceInDocument(styled, 'grey', 'gray');
  assert.equal(count, 2);
  assert.equal(JSON.stringify(styled), before);
  assert.equal(plainText(document), 'the gray cat\ngray\nnot here');
  const line = document.content[0].content;
  assert.deepEqual(line.map((node) => node.text ?? node.type), ['the ', 'gray', ' cat', 'hardBreak', 'gray']);
  assert.deepEqual(line[1].marks, [{ type: 'bold' }]);
  assert.equal(line[2].marks, undefined);
});

test('replacing with nothing leaves a valid document', () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'gone' }] }] };
  const { document } = replaceInDocument(doc, 'gone', '');
  assert.equal(plainText(document), '');
  assert.equal(document.content[0].content, undefined);
});

test('search and replace across a book, with a way back', () => {
  const { space, id, bookId, first } = book();
  const second = space.addItem({ kind: 'chapter', parentId: bookId, title: 'Two' }).item.id;
  const otherBook = space.addItem({ kind: 'book', parentId: id, title: 'Other' }).item.id;
  const third = space.addItem({ kind: 'chapter', parentId: otherBook, title: 'Elsewhere' }).item.id;
  space.saveChapter({ id: first, title: 'One', body: body('Mara ran. Mara hid.') });
  space.saveChapter({ id: second, title: 'Two', body: body('No names here.') });
  space.saveChapter({ id: third, title: 'Elsewhere', body: body('Mara again.') });

  const inBook = space.search({ scope: 'book', bookId, query: 'mara' });
  assert.equal(inBook.total, 2);
  assert.deepEqual(inBook.results.map((row) => row.title), ['One']);
  assert.equal(space.search({ scope: 'project', query: 'mara' }).total, 3);
  assert.equal(space.search({ scope: 'project', query: '' }).total, 0);
  assert.throws(() => space.search({ scope: 'everywhere', query: 'x' }), /Search this book/);

  const replaced = space.replaceAll({ scope: 'book', bookId, query: 'Mara', replacement: 'Marit Vale' });
  assert.deepEqual([replaced.count, replaced.chapters], [2, 1]);
  assert.equal(textOf(space, first), 'Marit Vale ran. Marit Vale hid.');
  assert.equal(textOf(space, third), 'Mara again.', 'another book is left alone');
  assert.equal(findNode(replaced.outline, first).words, 6, 'word counts follow');
  assert.ok(fs.existsSync(path.join(path.dirname(space.project.file), 'backups', 'before-replace.db')));

  space.undoReplace();
  assert.equal(textOf(space, first), 'Mara ran. Mara hid.');
  assert.throws(() => space.undoReplace(), /nothing to put back/);
});

test('a replace with nothing to change offers no undo', () => {
  const { space, id } = book();
  assert.equal(space.replaceAll({ scope: 'project', bookId: id, query: 'missing', replacement: 'x' }).count, 0);
  assert.throws(() => space.undoReplace(), /nothing to put back/);
});

test('words written today are net, and belong to the local date', () => {
  let now = new Date(2026, 10, 5, 23, 30);
  const { space, first } = book({ now: () => now });
  space.saveChapter({ id: first, title: 'One', body: body('one two three four five') });
  assert.equal(space.progress().today, 5);
  space.saveChapter({ id: first, title: 'One', body: body('one two three') });
  assert.equal(space.progress().today, 3);
  now = new Date(2026, 10, 6, 0, 30);
  assert.equal(space.progress().today, 0, 'midnight starts a new day');
  space.saveChapter({ id: first, title: 'One', body: body('one') });
  assert.equal(space.progress().today, 0, 'a day of cutting never shows below zero');
});

test('goals are kept, and only on projects and chapters', () => {
  const { space, id, bookId, first } = book();
  assert.equal(space.setGoal({ id, goal: 500 }).dailyGoal, 500);
  space.setGoal({ id: first, goal: 3000 });
  assert.equal(space.loadChapter(first).goal, 3000);
  assert.throws(() => space.setGoal({ id: bookId, goal: 5 }), /can't have a goal/);
  assert.throws(() => space.setGoal({ id, goal: -1 }), /whole number/);
  assert.throws(() => space.setGoal({ id, goal: 1.5 }), /whole number/);
  space.closeProject();
  assert.equal(space.openProject(id).progress.dailyGoal, 500);
});

test('comments stay out of the outline and the word count', () => {
  const { space, id, first } = book();
  space.saveChapter({ id: first, title: 'One', body: body('three words here') });
  const comment = space.addComment({ chapterId: first, text: 'Check this date against the timeline' });
  assert.deepEqual(space.listComments(first).map((row) => row.text), ['Check this date against the timeline']);
  assert.equal(findNode(space.outline(), first).children.length, 0);
  assert.equal(space.outline().words, 3);
  assert.equal(space.listProjects().find((row) => row.id === id).words, 3);

  space.editComment({ id: comment.id, text: 'Fixed the date' });
  assert.equal(space.listComments(first)[0].text, 'Fixed the date');
  assert.throws(() => space.addComment({ chapterId: first, text: '   ' }), /needs some words/);
  assert.throws(() => space.addComment({ chapterId: id, text: 'x' }), /can't go there/);
  assert.throws(() => space.removeComment(first), /isn't a comment/);

  space.removeComment(comment.id);
  assert.deepEqual(space.listComments(first), []);
  assert.ok(space.project.removalMarkers().some((row) => row.itemId === comment.id));
});

test('a comment goes with its chapter', () => {
  const { space, first } = book();
  const comment = space.addComment({ chapterId: first, text: 'A note' });
  space.removeEmpty(first);
  assert.ok(space.project.removalMarkers().some((row) => row.itemId === comment.id));
});
