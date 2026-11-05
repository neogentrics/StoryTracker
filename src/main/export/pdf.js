'use strict';
// Print PDFs, from a hidden window. It takes more than one pass: a first one to find which page each chapter lands on,
// so the contents page can say so, then again if the page count changes the binding margin or the padding at the end.
// Chromium ignores "start on a right-hand page", so the same passes add a blank page wherever one is needed.
// Nothing here makes a link. KDP's previewer warns about links in a print file, so a print book has none.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { PDFArray, PDFDocument, PDFName } = require('pdf-lib');
const { TRIM_SIZES } = require('../../shared/details');
const { PAGE_FONTS } = require('../../shared/themes');
const { authorOf, copyrightLines, matterOf } = require('./model');
const { gutterFor } = require('./office');
const { documentHtml, escapeXml } = require('./text-formats');

const OUTSIDE_MARGIN = 0.5;
const TOP_MARGIN = 0.8;
const BOTTOM_MARGIN = 0.8;
const MAX_PASSES = 5;

function pageCss(layout, gutter, book) {
  const trim = TRIM_SIZES[layout.trim];
  const author = escapeXml(authorOf(book) || book.title).replace(/"/g, '\\"');
  const title = escapeXml(book.title).replace(/"/g, '\\"');
  const box = `font-family: ${PAGE_FONTS[layout.pageFont].stack}; font-size: 9pt; color: #000;`;
  const number = layout.pageNumbers ? `@bottom-center { content: counter(page); ${box} }` : '';
  const left = layout.runningHeaders ? `@top-center { content: "${author}"; ${box} }` : '';
  const right = layout.runningHeaders ? `@top-center { content: "${title}"; ${box} }` : '';
  return `
  @page { size: ${trim.width}in ${trim.height}in; margin: ${TOP_MARGIN}in ${OUTSIDE_MARGIN}in ${BOTTOM_MARGIN}in ${OUTSIDE_MARGIN}in; }
  @page :left { margin-left: ${OUTSIDE_MARGIN}in; margin-right: ${gutter}in; ${number} ${left} }
  @page :right { margin-left: ${gutter}in; margin-right: ${OUTSIDE_MARGIN}in; ${number} ${right} }
  @page plain { @top-center { content: none; } @bottom-center { content: none; } }
  @page plain:left { @top-center { content: none; } @bottom-center { content: none; } }
  @page plain:right { @top-center { content: none; } @bottom-center { content: none; } }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ${PAGE_FONTS[layout.pageFont].stack}; font-size: ${layout.fontSize}pt; line-height: ${layout.lineHeight}; color: #000; }
  .plain { page: plain; break-before: page; }
  body > .plain:first-child { break-before: auto; }
  .ghost { position: absolute; margin: 0; font-size: 1pt; color: #fff; }
  .title-page { text-align: center; padding-top: 22%; }
  .book-title { font-size: 2.3em !important; line-height: 1.15; margin: 0 0 .5em !important; }
  .title-page p { text-indent: 0; margin: .4em 0; }
  .publisher { margin-top: 6em !important; font-size: .85em; }
  .small { padding-top: 45%; text-align: center; font-size: .78em; }
  .small p { text-indent: 0; margin: .3em 0; }
  .dedication { padding-top: 30%; text-align: center; font-style: italic; }
  .dedication p { text-indent: 0; }
  .contents h2 { text-align: center; font-weight: normal; font-size: 1.5em; margin: 0 0 1.2em; }
  .contents ol { list-style: none; margin: 0; padding: 0; }
  .contents li { display: flex; align-items: baseline; gap: .4em; margin: .25em 0; }
  .contents .fill { flex: 1; border-bottom: 1px dotted #000; transform: translateY(-.25em); }
  .contents .part { margin-top: .8em; font-weight: bold; }
  .part-page { text-align: center; padding-top: 32%; }
  .part-page h1 { font-weight: normal; font-size: 1.9em; margin: 0; }
  .chapter { break-before: page; }
  .chapter > h2 { text-align: center; font-weight: normal; font-size: 1.6em; line-height: 1.2; margin: 1.6em 0 1.4em; break-after: avoid; }
  .chapter p { margin: 0; text-indent: 1.4em; text-align: justify; orphans: 2; widows: 2; }
  .chapter h2 + p, .chapter h3 + p, .chapter h4 + p, .chapter h5 + p, .chapter hr + p { text-indent: 0; }
  ${layout.dropCaps ? '.chapter > h2 + p::first-letter { float: left; font-size: 3.1em; line-height: .85; padding: .06em .08em 0 0; }' : ''}
  h3, h4, h5 { font-size: 1.1em; margin: 1.2em 0 .5em; break-after: avoid; }
  hr { width: 30%; margin: 1.2em auto; border: 0; border-top: 1px solid #000; }
  blockquote { margin: 1em 1.5em; } ul, ol { margin: .8em 0 .8em 1.5em; padding: 0; } li p { text-indent: 0 !important; }
  .align-center { text-align: center !important; text-indent: 0 !important; }
  .align-right { text-align: right !important; text-indent: 0 !important; }
  .matter h2 { text-align: center; font-weight: normal; font-size: 1.5em; margin: 0 0 1.2em; }
  .matter p { text-indent: 0; margin: 0 0 .7em; }
  .blank { page: plain; break-before: page; height: 1px; }
  `;
}

const paragraphs = (lines) => lines.map((line) => `<p>${escapeXml(line)}</p>`).join('');

function contentsHtml(book, numbers) {
  const rows = [];
  for (const section of book.sections) {
    if (section.type === 'part') {
      rows.push(`<li class="part"><span>${escapeXml(section.title)}</span></li>`);
    } else {
      rows.push(`<li><span>${escapeXml(section.title)}</span><span class="fill"></span><span>${numbers.get(section.id) ?? '000'}</span></li>`);
    }
  }
  return `<section class="plain contents"><h2>Contents</h2><ol>${rows.join('')}</ol></section>`;
}

// The places a page has to start, in reading order. Each one shows up in the outline, so its page can be found.
function marksOf(book, layout) {
  const marks = [];
  if (matterOf(book).dedication.length) marks.push({ key: `${book.id}:dedication`, title: 'Dedication', right: true });
  if (layout.contents) marks.push({ key: `${book.id}:contents`, title: 'Contents', right: true });
  for (const section of book.sections) {
    marks.push({ key: section.id, title: section.title, right: section.type === 'part' || layout.chapterStart === 'right' });
  }
  return marks;
}

function bookHtml(book, year, layout, { numbers, fillers, outline }) {
  const matter = matterOf(book);
  const out = [];
  const filler = (key) => (fillers.has(key) ? '<section class="plain"></section>' : '');
  out.push(`<section class="plain title-page"><p class="book-title">${escapeXml(book.title)}</p>
    ${book.details.subtitle ? `<p>${escapeXml(book.details.subtitle)}</p>` : ''}
    ${authorOf(book) ? `<p>${escapeXml(authorOf(book))}</p>` : ''}
    ${book.details.publisher ? `<p class="publisher">${escapeXml(book.details.publisher)}</p>` : ''}</section>`);
  const isbn = book.details.isbnPrint ? [`ISBN ${book.details.isbnPrint}`] : [];
  out.push(`<section class="plain small">${paragraphs([...copyrightLines(book, year), ...isbn])}</section>`);
  if (matter.dedication.length) {
    const ghost = outline ? '<h2 class="ghost">Dedication</h2>' : '';
    out.push(`${filler(`${book.id}:dedication`)}<section class="plain dedication">${ghost}${paragraphs(matter.dedication)}</section>`);
  }
  if (layout.contents) out.push(filler(`${book.id}:contents`), contentsHtml(book, numbers));
  for (const section of book.sections) {
    out.push(filler(section.id));
    if (section.type === 'part') {
      out.push(`<section class="plain part-page"><h1>${escapeXml(section.title)}</h1></section>`);
    } else {
      out.push(`<section class="chapter"><h2>${escapeXml(section.title)}</h2>\n${documentHtml(section.document)}</section>`);
    }
  }
  const back = (title, lines) => (lines.length ? `<section class="plain matter"><h2>${escapeXml(title)}</h2>${paragraphs(lines)}</section>` : '');
  out.push(back('Acknowledgements', matter.acknowledgements));
  out.push(back('About the Author', matter.aboutAuthor));
  out.push(back(authorOf(book) ? `Also by ${authorOf(book)}` : 'Also by This Author', matter.alsoBy));
  out.push(back('Stay Connected', matter.connect));
  return out.join('\n');
}

function pageHtml(model, layout, { gutter, numbers, fillers, blanks, outline }) {
  const [book] = model.books;
  const base = pathToFileURL(path.join(app.getAppPath(), 'dist', 'renderer', 'fonts.css')).href;
  const bodies = model.books.map((item) => bookHtml(item, model.year, layout, { numbers, fillers, outline }));
  return `<!DOCTYPE html><html lang="${escapeXml(book.language)}"><head><meta charset="utf-8"/>
  <title>${escapeXml(model.title)}</title><link rel="stylesheet" href="${base}"/><style>${pageCss(layout, gutter, book)}</style></head>
  <body>${bodies.join('\n')}${'<div class="blank"></div>'.repeat(blanks)}</body></html>`;
}

async function render(html, outline) {
  const file = path.join(os.tmpdir(), `rtst-print-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(file, html);
  const window = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  try {
    await window.loadFile(file);
    return await window.webContents.printToPDF({
      printBackground: false,
      preferCSSPageSize: true,
      generateDocumentOutline: outline,
      generateTaggedPDF: outline,
    });
  } finally {
    window.destroy();
    fs.rmSync(file, { force: true });
  }
}

async function readOutline(bytes) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = document.getPages().map((page) => page.ref.toString());
  const items = [];
  const outlines = document.catalog.lookup(PDFName.of('Outlines'));
  const walk = (reference, seen) => {
    let item = reference && document.context.lookup(reference);
    while (item && !seen.has(item)) {
      seen.add(item);
      const title = item.lookup(PDFName.of('Title'));
      let target = item.lookup(PDFName.of('Dest'));
      const action = item.lookup(PDFName.of('A'));
      if (!target && action) target = action.lookup(PDFName.of('D'));
      const page = target instanceof PDFArray ? pages.indexOf(target.get(0).toString()) + 1 : 0;
      items.push({ title: title ? title.decodeText() : '', page });
      const first = item.get(PDFName.of('First'));
      if (first) walk(first, seen);
      const next = item.get(PDFName.of('Next'));
      item = next && document.context.lookup(next);
    }
  };
  if (outlines) walk(outlines.get(PDFName.of('First')), new Set());
  return { pages: pages.length, items };
}

const same = (text) => String(text).replace(/\s+/g, ' ').trim().toLowerCase();

// Matched in order, so two chapters with the same name each get their own page.
function pagesOf(marks, outline) {
  let from = 0;
  return marks.map((mark) => {
    for (let at = from; at < outline.items.length; at += 1) {
      if (same(outline.items[at].title) === same(mark.title)) {
        from = at + 1;
        return outline.items[at].page;
      }
    }
    return 0;
  });
}

// Which marks need a blank page before them, worked out as if none were there yet. Each blank moves everything after it.
function fillersFor(marks, pages, existing) {
  const needed = new Set();
  let already = 0;
  let added = 0;
  marks.forEach((mark, at) => {
    if (existing.has(mark.key)) already += 1;
    const page = pages[at] - already + added;
    if (mark.right && pages[at] > 0 && page % 2 === 0) {
      needed.add(mark.key);
      added += 1;
    }
  });
  return needed;
}

const sameSet = (a, b) => a.size === b.size && [...a].every((item) => b.has(item));

function blanksNeeded(pages, existing, layout) {
  const body = pages - existing;
  if (layout.targetPages > body) return layout.targetPages - body;
  if (!layout.endBlankEven) return 0;
  const withBlank = body + 1;
  return withBlank % 2 === 0 ? 1 : 2;
}

async function finish(bytes, model) {
  const document = await PDFDocument.load(bytes);
  const [book] = model.books;
  document.setTitle(book.title);
  if (authorOf(book)) document.setAuthor(authorOf(book));
  document.setProducer('RT Story Tracker');
  document.setCreator('RT Story Tracker');
  return { bytes: Buffer.from(await document.save()), pages: document.getPageCount() };
}

async function toPdf(model, layout) {
  const marks = model.books.flatMap((book) => marksOf(book, layout));
  let gutter = gutterFor(100);
  let numbers = new Map();
  let fillers = new Set();
  let blanks = 0;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const html = pageHtml(model, layout, { gutter, numbers, fillers, blanks, outline: true });
    const outline = await readOutline(await render(html, true));
    const pages = pagesOf(marks, outline);
    const nextFillers = fillersFor(marks, pages, fillers);
    const nextGutter = gutterFor(outline.pages);
    const nextBlanks = blanksNeeded(outline.pages, blanks, layout);
    const nextNumbers = new Map(marks.map((mark, at) => [mark.key, pages[at]]));
    const settled =
      nextGutter === gutter &&
      nextBlanks === blanks &&
      sameSet(nextFillers, fillers) &&
      [...nextNumbers].every(([key, page]) => numbers.get(key) === page);
    gutter = nextGutter;
    numbers = nextNumbers;
    fillers = nextFillers;
    blanks = nextBlanks;
    if (settled) break;
  }
  return finish(await render(pageHtml(model, layout, { gutter, numbers, fillers, blanks, outline: false }), false), model);
}

module.exports = { blanksNeeded, fillersFor, toPdf };
