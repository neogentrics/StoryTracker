'use strict';
// Importing happens in two steps. First a file is read and shown, with its chapters and any clean-ups to accept. Nothing is
// saved until the author says so, and the original file is never changed.
const crypto = require('node:crypto');
const { countWords } = require('../../shared/text');
const { applyCleanups, findCleanups } = require('./cleanup');
const { IMPORT_EXTENSIONS, markdownToBlocks, readFormat, splitFrontMatter, textToBlocks } = require('./formats');
const { splitBlocks, splitOptions, wordsIn } = require('./split');

function resolve(source, accepted) {
  if (source.text === undefined) return source;
  const text = applyCleanups(source.text, source.findings, accepted);
  return { ...source, ...(source.plain ? textToBlocks(text) : markdownToBlocks(text)), title: source.title };
}

function sectionsFor(resolved, mode) {
  if (resolved.sections) return resolved.sections;
  const sections = splitBlocks(resolved.blocks, mode, resolved.title);
  const [top, next] = sections;
  return top?.type === 'chapter' && top.blocks.length === 0 && next ? sections.slice(1) : sections;
}

function bookTitle(resolved, mode) {
  if (resolved.sections) return resolved.title;
  const [top, next] = splitBlocks(resolved.blocks, mode, resolved.title);
  return top?.type === 'chapter' && top.blocks.length === 0 && next ? top.title : resolved.title;
}

const summary = (section) => ({ type: section.type, title: section.title, words: section.blocks ? wordsIn(section.blocks) : 0 });

class Importer {
  constructor() {
    this.pending = new Map();
  }

  async inspect(file) {
    const source = await readFormat(file);
    if (source.text !== undefined) {
      if (!source.plain) {
        const { body, title, details } = splitFrontMatter(source.text);
        Object.assign(source, { text: body, title: title ?? source.title, details });
      }
      source.findings = findCleanups(source.text);
    }
    // A title styled as one in Word names the book, and doesn't become a chapter.
    const titleBlock = source.blocks?.find((block) => block.bookTitle);
    if (titleBlock) {
      source.title = titleBlock.content.map((node) => node.text ?? '').join('').trim() || source.title;
      source.bookTitleWords = countWords(source.title);
      source.blocks = source.blocks.filter((block) => block !== titleBlock);
    }
    const token = crypto.randomUUID();
    this.pending.clear();
    this.pending.set(token, source);
    const findings = source.findings ?? [];
    return { token, file, format: source.format, findings, ...this.preview({ token, accepted: findings.map((item) => item.id) }) };
  }

  need(token) {
    const source = this.pending.get(token);
    if (!source) throw new Error('That import has expired. Choose the file again.');
    return source;
  }

  preview({ token, accepted = [], mode = null }) {
    const source = this.need(token);
    const resolved = resolve(source, accepted);
    const options = resolved.sections ? [] : splitOptions(resolved.blocks);
    const chosen = mode && options.some((option) => option.mode === mode) ? mode : options[0]?.mode ?? 'none';
    const sections = sectionsFor(resolved, chosen);
    const pictures = resolved.context?.pictures ?? 0;
    const notes = [...(resolved.notes ?? [])];
    if (pictures) notes.push(`${pictures} ${pictures === 1 ? 'picture' : 'pictures'} won’t come in yet. Pictures arrive with attachments in 3.5.`);
    const importedWords = sections.reduce((sum, section) => sum + (section.blocks ? wordsIn(section.blocks) : 0), 0);
    const titleWords = sections.reduce((sum, section) => sum + (section.named ? 0 : countWords(section.title)), source.bookTitleWords ?? 0);
    return {
      title: bookTitle(resolved, chosen),
      details: resolved.details ?? {},
      hasCover: Boolean(resolved.cover),
      options,
      mode: chosen,
      sections: sections.map(summary),
      importedWords,
      titleWords,
      originalWords: resolved.originalWords ?? null,
      comments: Object.keys(resolved.comments ?? {}).length,
      notes,
    };
  }

  // `target` is a new book under a parent, or an existing book to add to.
  commit(workspace, { token, accepted = [], mode, target }) {
    const source = this.need(token);
    const resolved = resolve(source, accepted);
    const sections = sectionsFor(resolved, mode);
    if (sections.length === 0) throw new Error('There is nothing in that file to import.');
    const made = workspace.importSections({ target, title: bookTitle(resolved, mode), details: resolved.details, cover: resolved.cover, sections, comments: resolved.comments, marks: resolved.context?.commentMarks });
    this.pending.delete(token);
    return made;
  }
}

module.exports = { IMPORT_EXTENSIONS, Importer };
