// Finding inside the open chapter. Replacing here goes through the editor, so Undo puts it back.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { matchesIn } from '../shared/find.js';

const key = new PluginKey('find');
const EMPTY = { query: '', options: {}, matches: [], current: -1 };

function collect(doc, query, options) {
  if (!query) return [];
  const found = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) return true;
    const runs = [];
    let run = null;
    node.forEach((child, offset) => {
      if (!child.isText) {
        run = null;
        return;
      }
      if (!run) {
        run = { from: position + 1 + offset, text: '' };
        runs.push(run);
      }
      run.text += child.text;
    });
    for (const { from, text } of runs) {
      for (const match of matchesIn(text, query, options)) found.push({ from: from + match.start, to: from + match.end });
    }
    return false;
  });
  return found;
}

export const FindHighlight = Extension.create({
  name: 'findHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: () => EMPTY,
          apply(tr, value) {
            const meta = tr.getMeta(key);
            if (meta) {
              const next = { ...value, ...meta };
              const matches = collect(tr.doc, next.query, next.options);
              return { ...next, matches, current: Math.min(next.current, matches.length - 1) };
            }
            if (!tr.docChanged || !value.query) return value;
            const matches = collect(tr.doc, value.query, value.options);
            return { ...value, matches, current: Math.min(value.current, matches.length - 1) };
          },
        },
        props: {
          decorations(state) {
            const { matches, current } = key.getState(state);
            if (matches.length === 0) return null;
            return DecorationSet.create(
              state.doc,
              matches.map((match, index) =>
                Decoration.inline(match.from, match.to, { class: index === current ? 'find-current' : 'find-match' })),
            );
          },
        },
      }),
    ];
  },
});

export function setFind(editor, query, options) {
  editor.view.dispatch(editor.state.tr.setMeta(key, { query, options, current: -1 }));
  return key.getState(editor.state).matches.length;
}

export function findState(editor) {
  return key.getState(editor.state);
}

function select(editor, index) {
  const { matches } = findState(editor);
  const match = matches[index];
  if (!match) return;
  const { state, view } = editor;
  view.dispatch(
    state.tr
      .setMeta(key, { current: index })
      .setSelection(TextSelection.create(state.doc, match.from, match.to))
      .scrollIntoView(),
  );
}

export function stepFind(editor, direction) {
  const { matches, current } = findState(editor);
  if (matches.length === 0) return;
  select(editor, (current + direction + matches.length) % matches.length);
}

export function replaceCurrent(editor, replacement) {
  const { matches, current } = findState(editor);
  const match = matches[current];
  if (!match) {
    stepFind(editor, 1);
    return;
  }
  editor.view.dispatch(editor.state.tr.insertText(replacement, match.from, match.to));
  const next = findState(editor).matches.findIndex((item) => item.from >= match.from + replacement.length);
  select(editor, next === -1 ? 0 : next);
}

export function replaceEvery(editor, replacement) {
  const { matches } = findState(editor);
  const { tr } = editor.state;
  for (const match of [...matches].reverse()) tr.insertText(replacement, match.from, match.to);
  editor.view.dispatch(tr);
  return matches.length;
}
