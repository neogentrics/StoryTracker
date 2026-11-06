'use strict';
// Documents sent to this app. Nothing is filed by itself: each one waits here, in memory and never on disk, until the author
// says where it goes. A locked project can stay closed for as long as that takes.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { LinkError, cleanName, documentName } = require('./app-link');
const { sectionsOf, sourceFromText } = require('./import');
const { splitOptions, wordsIn } = require('./import/split');

const MAX_WAITING = 20;
const MAX_FILE = 8 * 1024 * 1024;
const MAX_PICTURE = 50 * 1024 * 1024;
const MAX_PICTURES = 50;
const WRITING = /\.(md|markdown|mdown|mkd|mkdn|txt)$/i;
const PICTURES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

const titleOf = (name) => name.replace(/\.[a-z0-9]{1,8}$/i, '');
const isPlain = (name) => /\.txt$/i.test(name);

function isWritingFile(file) {
  return typeof file === 'string' && WRITING.test(file);
}

// Pictures arrive as paths on this computer, and are read when the document is added. Anything else on the list is dropped.
function usablePictures(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_PICTURES)
    .filter((item) => typeof item?.path === 'string' && path.isAbsolute(item.path) && Object.hasOwn(PICTURES, path.extname(item.path).toLowerCase()))
    .map((item) => ({ name: documentName(item.name ?? path.basename(item.path)), path: item.path, type: PICTURES[path.extname(item.path).toLowerCase()] }));
}

class Inbox {
  constructor({ onChange = () => {} } = {}) {
    this.waiting = [];
    this.onChange = onChange;
  }

  // A document from a linked app, or a file the author chose to open here.
  take({ from, name, text, path: file, attachments }) {
    if (this.waiting.length >= MAX_WAITING) throw new LinkError('busy', 'Too many documents are waiting. Deal with those first.');
    const document = file ? this.read(file) : { name: documentName(name), text };
    this.waiting.push({ id: crypto.randomUUID(), from: cleanName(from, 'Another app'), ...document, pictures: usablePictures(attachments) });
    this.onChange({ arrived: true });
  }

  read(file) {
    const full = path.resolve(file);
    if (/\.mdlock$/i.test(full)) throw new LinkError('not_allowed', 'Password-locked documents can’t be opened this way.');
    if (!isWritingFile(full)) throw new LinkError('not_allowed', 'RT Story Tracker takes Markdown and text files this way.');
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new LinkError('not_found', 'That document isn’t there.');
    if (fs.statSync(full).size > MAX_FILE) throw new LinkError('not_allowed', 'That document is too big to send. Use Import.');
    return { name: documentName(path.basename(full)), text: fs.readFileSync(full, 'utf8') };
  }

  need(id) {
    const document = this.waiting.find((item) => item.id === id);
    if (!document) throw new Error('That document is gone.');
    return document;
  }

  source(document) {
    return sourceFromText(document.text, { plain: isPlain(document.name), title: titleOf(document.name) });
  }

  // What the window shows: the words themselves stay here until they're added.
  list() {
    return this.waiting.map((document) => {
      const source = this.source(document);
      return {
        id: document.id,
        from: document.from,
        name: document.name,
        words: wordsIn(source.blocks),
        pictures: document.pictures.length,
        options: splitOptions(source.blocks),
      };
    });
  }

  // One step, so a failure leaves the document waiting and the project as it was.
  async add(workspace, { id, bookId, mode }) {
    const document = this.need(id);
    const source = this.source(document);
    const known = splitOptions(source.blocks).some((option) => option.mode === mode);
    const sections = sectionsOf(source, known ? mode : null, titleOf(document.name));
    const target = bookId ? { kind: 'book', id: bookId } : { title: titleOf(document.name) };
    const made = workspace.importSections({ target, title: titleOf(document.name), sections });
    for (const picture of document.pictures) {
      if (fs.existsSync(picture.path) && fs.statSync(picture.path).size <= MAX_PICTURE) {
        await workspace.open().addAttachment(made.bookId, { name: picture.name, source: picture.path, type: picture.type, from: document.from });
      }
    }
    this.drop(id);
    return { bookId: made.bookId, first: made.first, chapters: made.chapters, outline: workspace.outline() };
  }

  drop(id) {
    this.waiting = this.waiting.filter((item) => item.id !== id);
    this.onChange({ arrived: false });
  }
}

module.exports = { Inbox, isWritingFile };
