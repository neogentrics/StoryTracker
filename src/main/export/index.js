'use strict';
// Everything that leaves the app goes through here.
const fs = require('node:fs');
const path = require('node:path');
const { EXPORT_FORMATS: FORMATS, cleanLayout } = require('../../shared/details');
const { PAGE_FONTS } = require('../../shared/themes');
const { buildModel, checkBook } = require('./model');
const { documentMarkdown, toHtml, toMarkdown, toRtf, toText, toXml } = require('./text-formats');

async function exportToBuffer(model, format, layout) {
  switch (format) {
    case 'md':
      return Buffer.from(toMarkdown(model));
    case 'txt':
      return Buffer.from(toText(model));
    case 'html':
      return Buffer.from(toHtml(model));
    case 'xml':
      return Buffer.from(toXml(model));
    case 'rtf':
      return Buffer.from(toRtf(model));
    case 'epub':
      return require('./epub').toEpub(model);
    case 'docx':
      return require('./office').toDocx(model, layout);
    case 'odt':
      return require('./office').toOdt(model, layout);
    case 'pdf':
      return (await require('./pdf').toPdf(model, layout)).bytes;
    default:
      throw new Error("That format isn't known.");
  }
}

async function exportFile(project, { scope, id, format, layout, file }) {
  const model = buildModel(project, { scope, id });
  if (FORMATS[format]?.oneBook && model.books.length > 1) throw new Error('An e-book holds one book. Choose a single book.');
  const data = await exportToBuffer(model, format, cleanLayout(layout, PAGE_FONTS));
  fs.writeFileSync(file, data);
  return { file, size: data.length };
}

function checkExport(project, { scope, id, format }) {
  const model = buildModel(project, { scope, id });
  return model.books.flatMap((book) => checkBook(book, { ebook: format === 'epub' }));
}

const safeName = (text) => String(text).replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const number = (at) => String(at).padStart(3, '0');

// The way out with nothing held back: every book as Markdown files, plus covers, comments and word counts as CSV.
function exportEverything(project, folder) {
  const outline = project.outline();
  const root = path.join(folder, safeName(outline.title));
  fs.mkdirSync(root, { recursive: true });
  const model = buildModel(project, { scope: 'project' });
  const words = [['Book', 'Chapter', 'Words']];
  const comments = [['Book', 'Chapter', 'Comment']];
  let files = 0;
  for (const book of model.books) {
    const dir = path.join(root, safeName(book.title));
    fs.mkdirSync(dir, { recursive: true });
    if (book.cover) {
      fs.writeFileSync(path.join(dir, `cover.${book.cover.extension}`), book.cover.data);
      files += 1;
    }
    let chapter = 0;
    let part = '';
    for (const section of book.sections) {
      if (section.type === 'part') {
        part = `${safeName(section.title)} - `;
      } else {
        chapter += 1;
        const name = `${number(chapter)} ${part}${safeName(section.title)}.md`;
        fs.writeFileSync(path.join(dir, name), `# ${section.title}\n\n${documentMarkdown(section.document)}\n`);
        files += 1;
        const item = project.getItem(section.id);
        words.push([book.title, section.title, item.words]);
        for (const note of project.listChildren(section.id)) comments.push([book.title, section.title, note.title]);
      }
    }
  }
  const csv = (rows) => `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
  fs.writeFileSync(path.join(root, 'word-counts.csv'), csv(words));
  fs.writeFileSync(path.join(root, 'comments.csv'), csv(comments));
  return { folder: root, files: files + 2 };
}

module.exports = { checkExport, exportEverything, exportFile, safeName };
