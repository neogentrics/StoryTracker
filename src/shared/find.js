'use strict';
// Finding text. The window uses this for the open chapter and the main process for whole books, so both agree on what
// a match is. A match never crosses from one paragraph to the next.

const SNIPPET_CHARS = 40;

const escapeForPattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matcher(query, { matchCase = false, wholeWord = false } = {}) {
  if (!query) return null;
  const body = escapeForPattern(query);
  const pattern = wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(pattern, `gu${matchCase ? '' : 'i'}`);
}

function matchesIn(text, query, options) {
  const pattern = matcher(query, options);
  if (!pattern) return [];
  return [...text.matchAll(pattern)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

function isTextBlock(node) {
  return Array.isArray(node.content) && node.content.some((child) => child.type === 'text');
}

function walkBlocks(node, visit) {
  if (isTextBlock(node)) visit(node);
  else node.content?.forEach((child) => walkBlocks(child, visit));
}

// Runs of neighbouring text nodes. Anything else on the line, like a line break, ends a run.
function runsOf(block) {
  const runs = [];
  let run = null;
  block.content.forEach((node, index) => {
    if (node.type !== 'text') {
      run = null;
      return;
    }
    if (!run) {
      run = { from: index, to: index, text: '' };
      runs.push(run);
    }
    run.to = index;
    run.text += node.text;
  });
  return runs;
}

function snippet(text, { start, end }) {
  const before = text.slice(Math.max(0, start - SNIPPET_CHARS), start);
  const after = text.slice(end, end + SNIPPET_CHARS);
  return {
    before: `${start > SNIPPET_CHARS ? '…' : ''}${before}`,
    match: text.slice(start, end),
    after: `${after}${end + SNIPPET_CHARS < text.length ? '…' : ''}`,
  };
}

function findInDocument(document, query, options) {
  const found = [];
  walkBlocks(document, (block) => {
    for (const run of runsOf(block)) {
      for (const match of matchesIn(run.text, query, options)) found.push(snippet(run.text, match));
    }
  });
  return found;
}

// Splits a run's nodes around the matches, keeping each piece's bold or italic. The new words take the look of the
// first character they replace.
function replaceInRun(nodes, matches, replacement) {
  const out = [];
  const add = (text, marks) => {
    if (!text) return;
    const last = out.at(-1);
    if (last && JSON.stringify(last.marks ?? []) === JSON.stringify(marks ?? [])) last.text += text;
    else out.push({ type: 'text', text, ...(marks?.length ? { marks } : {}) });
  };
  let position = 0;
  let next = 0;
  for (const node of nodes) {
    const end = position + node.text.length;
    let at = position;
    while (at < end) {
      const match = matches[next];
      if (!match || match.start >= end) {
        add(node.text.slice(at - position), node.marks);
        at = end;
      } else if (at < match.start) {
        add(node.text.slice(at - position, match.start - position), node.marks);
        at = match.start;
      } else {
        if (at === match.start) add(replacement, node.marks);
        at = Math.min(end, match.end);
        if (at === match.end) next += 1;
      }
    }
    position = end;
  }
  return out;
}

// Returns a changed copy and how many it changed. The document passed in is left alone.
function replaceInDocument(document, query, replacement, options) {
  const copy = structuredClone(document);
  let count = 0;
  walkBlocks(copy, (block) => {
    for (const run of runsOf(block).reverse()) {
      const matches = matchesIn(run.text, query, options);
      if (matches.length === 0) continue;
      count += matches.length;
      const nodes = block.content.slice(run.from, run.to + 1);
      block.content.splice(run.from, run.to - run.from + 1, ...replaceInRun(nodes, matches, replacement));
    }
    if (block.content.length === 0) delete block.content;
  });
  return { document: copy, count };
}

module.exports = { findInDocument, matchesIn, replaceInDocument };
