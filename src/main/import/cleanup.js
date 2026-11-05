'use strict';
// Files made with AI often carry things no author wants in a chapter. This finds them and says what it would do. Nothing
// changes here: the author sees each one, and only what they accept is applied.

const INTRO_START = /^(?:(?:here(?:’|')?s|here is|here are|below is|i(?:'|’)ve (?:written|drafted|created|revised))\b|(?:sure|certainly|of course|absolutely|great)[,!.])/i;
const INTRO_END = /[:!]\s*$|\b(?:chapters?|drafts?|story|scenes?|versions?|rewrite|revision|outline|continuation)\b/i;
const OUTRO = /^(would you like|let me know|do you want|i hope this|feel free|if you('|’)d like|want me to|shall i|should i|is there anything)\b/i;
const RULE = /^\s*(\*\s*){3,}$|^\s*(-\s*){3,}$|^\s*(_\s*){3,}$/;
const FENCE = /^\s*```/;
const BOLD_LINE = /^\s*\*\*([^*]{1,120})\*\*\s*:?\s*$/;
const HEADING = /^(#{1,6})\s+/;

function firstText(lines) {
  return lines.findIndex((line) => line.trim());
}

function lastText(lines) {
  for (let at = lines.length - 1; at >= 0; at -= 1) if (lines[at].trim()) return at;
  return -1;
}

const isIntro = (line) => INTRO_START.test(line) && INTRO_END.test(line);

function curly(text) {
  return text
    .replace(/(^|[\s([{—–-])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{—–-])'/g, '$1‘')
    .replace(/'/g, '’');
}

function findCleanups(text) {
  const lines = text.split('\n');
  const found = [];
  const add = (kind, label, line, before, after) => found.push({ id: `${kind}-${found.length}`, kind, label, line, before, after });

  const first = firstText(lines);
  const last = lastText(lines);
  if (first === -1) return [];

  const intro = isIntro(lines[first].trim());
  const outro = last !== first && OUTRO.test(lines[last].trim());
  if (intro) add('remove', 'Chat text at the top', first, lines[first], '');
  if (outro) add('remove', 'Chat text at the bottom', last, lines[last], '');

  // A line of symbols between scenes is a scene break and stays. At the very start or end, or against chat text, it's left over.
  const nextText = (from, step) => {
    let at = from + step;
    while (at >= 0 && at < lines.length && !lines[at].trim()) at += step;
    return at;
  };
  const edges = new Set([first, last]);
  if (intro) edges.add(nextText(first, 1));
  if (outro) edges.add(nextText(last, -1));

  const fenceTop = lines.findIndex((line, at) => at >= first && at <= first + 2 && FENCE.test(line));
  const fenceBottom = lines.findLastIndex((line, at) => at <= last && at >= last - 2 && FENCE.test(line));
  if (fenceTop !== -1 && fenceBottom > fenceTop) {
    add('remove', 'The whole text is wrapped in a code block', fenceTop, lines[fenceTop], '');
    add('remove', 'The end of that code block', fenceBottom, lines[fenceBottom], '');
  }

  lines.forEach((line, at) => {
    const bold = BOLD_LINE.exec(line);
    if (bold) add('replace', 'Bold used as a heading', at, line, `## ${bold[1].trim()}`);
    if (RULE.test(line) && edges.has(at)) add('remove', 'A line of symbols', at, line, '');
  });

  const levels = lines.map((line) => HEADING.exec(line)?.[1].length).filter(Boolean);
  if (levels.length && Math.min(...levels) > 1) {
    add('headings', `Headings start at level ${Math.min(...levels)}`, null, `${levels.length} headings`, 'Move them up, so they start at level 1');
  }

  const straight = (text.match(/["']/g) ?? []).length;
  if (straight) add('quotes', 'Straight quotes', null, `${straight} straight quote marks`, 'Curly quotes');
  const spaces = (text.match(/[^\s.] {2,}\S/g) ?? []).length;
  if (spaces) add('spaces', 'Doubled spaces', null, `${spaces} places`, 'One space');
  return found;
}

function applyCleanups(text, findings, accepted) {
  const wanted = findings.filter((item) => accepted.includes(item.id));
  const lines = text.split('\n');
  const removed = new Set();
  for (const item of wanted) {
    if (item.kind === 'remove') removed.add(item.line);
    if (item.kind === 'replace') lines[item.line] = item.after;
  }
  let result = lines.filter((_line, at) => !removed.has(at)).join('\n');
  if (wanted.some((item) => item.kind === 'headings')) {
    const levels = result.split('\n').map((line) => HEADING.exec(line)?.[1].length).filter(Boolean);
    const shift = Math.min(...levels) - 1;
    result = result.replace(/^(#{1,6})(\s+)/gm, (_all, marks, space) => `${'#'.repeat(marks.length - shift)}${space}`);
  }
  if (wanted.some((item) => item.kind === 'quotes')) result = result.split('\n').map(curly).join('\n');
  if (wanted.some((item) => item.kind === 'spaces')) result = result.replace(/([^\s.]) {2,}(\S)/g, '$1 $2');
  return result.trim();
}

module.exports = { applyCleanups, findCleanups };
