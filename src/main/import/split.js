'use strict';
// One long file into chapters. The author sees the result before anything is saved and can pick another way to split it.
const { countWords, plainText } = require('../../shared/text');

const CHAPTER_LINE = /^(chapter|ch\.|book|part)\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty[a-z-]*|thirty[a-z-]*|forty[a-z-]*|fifty[a-z-]*)\b|^(prologue|epilogue|interlude|foreword|preface|introduction|afterword|acknowledg(e)?ments)\b/i;
const PART_LINE = /^part\s+/i;
const MAX_LINE = 90;

const textOf = (block) => (block.content ?? []).map((node) => node.text ?? ' ').join('').trim();

function isChapterLine(block) {
  if (block.type !== 'paragraph' && block.type !== 'heading') return false;
  const text = textOf(block);
  return text.length <= MAX_LINE && CHAPTER_LINE.test(text);
}

function matcher(mode) {
  if (mode === 'h1') return (block) => block.type === 'heading' && block.attrs.level === 1;
  if (mode === 'h2') return (block) => block.type === 'heading' && block.attrs.level <= 2;
  if (mode === 'pattern') return isChapterLine;
  return () => false;
}

function countFor(blocks, mode) {
  return blocks.filter(matcher(mode)).length;
}

function splitOptions(blocks) {
  const options = [];
  const h1 = countFor(blocks, 'h1');
  const h2 = countFor(blocks, 'h2');
  const lines = countFor(blocks, 'pattern');
  if (lines >= 2) options.push({ mode: 'pattern', label: `At chapter titles (${lines})` });
  if (h1 >= 2) options.push({ mode: 'h1', label: `At main headings (${h1})` });
  if (h2 > h1 && h2 >= 2) options.push({ mode: 'h2', label: `At main headings and subheadings (${h2})` });
  options.push({ mode: 'none', label: 'Keep it as one chapter' });
  return options;
}

// The editor has three heading sizes, so anything deeper becomes the smallest.
function normaliseBlock(block) {
  if (block.type !== 'heading') return block;
  const { bookTitle, ...rest } = block;
  return { ...rest, attrs: { ...block.attrs, level: Math.min(3, block.attrs.level) } };
}

function splitBlocks(blocks, mode, fallbackTitle) {
  if (mode === 'none') {
    const [top, ...rest] = blocks;
    if (top?.type === 'heading' && rest.length) return [{ type: 'chapter', title: textOf(top), blocks: rest.map(normaliseBlock) }];
    return [{ type: 'chapter', title: fallbackTitle, named: true, blocks: blocks.map(normaliseBlock) }];
  }
  const isBreak = matcher(mode);
  const sections = [];
  let current = null;
  const open = (title) => {
    current = { type: 'chapter', title, blocks: [] };
    sections.push(current);
  };

  for (const block of blocks) {
    if (isBreak(block)) {
      const title = textOf(block);
      if (PART_LINE.test(title) && block.type === 'heading') {
        sections.push({ type: 'part', title });
        current = null;
      } else {
        open(title);
      }
    } else {
      if (!current) {
        open(sections.length === 0 ? fallbackTitle : 'Untitled chapter');
        current.named = true;
      }
      current.blocks.push(normaliseBlock(block));
    }
  }
  return sections.filter((section) => section.type === 'part' || section.blocks.length > 0 || section.title !== fallbackTitle);
}

const documentOf = (blocks) => ({ type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] });
const wordsIn = (blocks) => countWords(plainText(documentOf(blocks)));

module.exports = { documentOf, isChapterLine, splitBlocks, splitOptions, wordsIn };
