'use strict';
// A reflowable EPUB 3 with an EPUB 2 contents file beside it, which is what KDP and the other big stores take. The mimetype
// has to be the first file in the zip and stored uncompressed, or readers refuse it.
const { strToU8, zipSync } = require('fflate');
const { authorOf, copyrightLines, matterOf } = require('./model');
const { documentHtml, escapeXml } = require('./text-formats');

const STYLE = `
body { margin: 0; line-height: 1.5; }
h1, h2 { text-align: center; line-height: 1.25; margin: 2em 0 1.5em; font-weight: normal; }
h3, h4, h5 { margin: 1.4em 0 .6em; }
p { margin: 0; text-indent: 1.4em; }
h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, hr + p, .first { text-indent: 0; }
hr { width: 30%; margin: 1.5em auto; border: 0; border-top: 1px solid currentColor; }
blockquote { margin: 1em 1.5em; }
ul, ol { margin: 1em 0 1em 1.5em; padding: 0; }
li p { text-indent: 0; }
.align-center { text-align: center; text-indent: 0; } .align-right { text-align: right; text-indent: 0; } .align-justify { text-align: justify; }
.title-page { text-align: center; margin-top: 20%; } .title-page p { text-indent: 0; } .book-title { font-size: 2em; margin: 0 0 .5em; }
.small { font-size: .9em; text-align: center; margin-top: 2em; } .small p { text-indent: 0; margin-bottom: .5em; }
.dedication { text-align: center; font-style: italic; margin-top: 25%; } .dedication p { text-indent: 0; }
.matter p { text-indent: 0; margin-bottom: .8em; }
.cover { margin: 0; padding: 0; text-align: center; } .cover img { max-width: 100%; max-height: 100%; }
#landmarks { display: none; }
nav ol { list-style: none; padding-left: 0; } nav ol ol { padding-left: 1.2em; } nav a { text-decoration: none; }
`;

const page = (title, language, body, type) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body${type ? ` epub:type="${type}"` : ''}>
${body}
</body>
</html>
`;

const paragraphs = (lines) => lines.map((line) => `<p>${escapeXml(line)}</p>`).join('\n');

function identifierOf(book) {
  const isbn = book.details.isbnEbook?.replace(/[^0-9Xx]/g, '');
  return isbn ? `urn:isbn:${isbn}` : `urn:uuid:${book.id}`;
}

function buildPages(book, year) {
  const matter = matterOf(book);
  const { language } = book;
  const pages = [];
  const add = (name, title, body, options = {}) => {
    pages.push({ name, title, ...options, html: page(title, language, body, options.type) });
  };

  if (book.cover) {
    add('cover.xhtml', 'Cover', `<div class="cover"><img src="cover.${book.cover.extension}" alt="Cover of ${escapeXml(book.title)}"/></div>`, {
      landmark: 'cover',
      linear: true,
      hidden: true,
    });
  }
  add(
    'title.xhtml',
    'Title Page',
    `<section class="title-page" epub:type="titlepage"><h1 class="book-title">${escapeXml(book.title)}</h1>
${book.details.subtitle ? `<p>${escapeXml(book.details.subtitle)}</p>` : ''}
${authorOf(book) ? `<p>${escapeXml(authorOf(book))}</p>` : ''}
${book.details.publisher ? `<p>${escapeXml(book.details.publisher)}</p>` : ''}</section>`,
    { landmark: 'titlepage', hidden: true },
  );
  const isbn = book.details.isbnEbook ? [`ISBN ${book.details.isbnEbook}`] : [];
  add('copyright.xhtml', 'Copyright', `<section class="small" epub:type="copyright-page">${paragraphs([...copyrightLines(book, year), ...isbn])}</section>`, {
    landmark: 'copyright-page',
  });
  if (matter.dedication.length) {
    add('dedication.xhtml', 'Dedication', `<section class="dedication" epub:type="dedication">${paragraphs(matter.dedication)}</section>`);
  }

  let parts = 0;
  let chapters = 0;
  for (const section of book.sections) {
    if (section.type === 'part') {
      parts += 1;
      add(`part-${parts}.xhtml`, section.title, `<section epub:type="part"><h1>${escapeXml(section.title)}</h1></section>`, { part: true });
    } else {
      chapters += 1;
      add(
        `chapter-${chapters}.xhtml`,
        section.title,
        `<section epub:type="chapter"><h2>${escapeXml(section.title)}</h2>\n${documentHtml(section.document)}</section>`,
        { chapter: true, landmark: chapters === 1 ? 'bodymatter' : null },
      );
    }
  }

  if (matter.acknowledgements.length) {
    add('acknowledgements.xhtml', 'Acknowledgements', `<section class="matter" epub:type="acknowledgments"><h2>Acknowledgements</h2>${paragraphs(matter.acknowledgements)}</section>`);
  }
  if (matter.aboutAuthor.length) {
    add('about.xhtml', 'About the Author', `<section class="matter" epub:type="appendix"><h2>About the Author</h2>${paragraphs(matter.aboutAuthor)}</section>`);
  }
  if (matter.alsoBy.length) {
    const heading = authorOf(book) ? `Also by ${authorOf(book)}` : 'Also by This Author';
    add('also-by.xhtml', heading, `<section class="matter" epub:type="appendix"><h2>${escapeXml(heading)}</h2>${paragraphs(matter.alsoBy)}</section>`);
  }
  if (matter.connect.length) {
    add('connect.xhtml', 'Stay Connected', `<section class="matter" epub:type="appendix"><h2>Stay Connected</h2>${paragraphs(matter.connect)}</section>`);
  }
  return pages;
}

// Chapters sit inside their part in the contents, as they do in the book.
function contentsTree(pages) {
  const tree = [];
  let part = null;
  for (const item of pages) {
    if (item.hidden) continue;
    const entry = { name: item.name, title: item.title, children: [] };
    if (item.part) {
      part = entry;
      tree.push(entry);
    } else if (item.chapter && part) {
      part.children.push(entry);
    } else {
      if (!item.chapter) part = null;
      tree.push(entry);
    }
  }
  return tree;
}

function navList(entries) {
  return `<ol>${entries
    .map((entry) => `<li><a href="${entry.name}">${escapeXml(entry.title)}</a>${entry.children.length ? navList(entry.children) : ''}</li>`)
    .join('')}</ol>`;
}

function navPage(book, pages, tree) {
  const landmarks = pages
    .filter((item) => item.landmark)
    .map((item) => `<li><a epub:type="${item.landmark}" href="${item.name}">${escapeXml(item.title)}</a></li>`)
    .join('');
  return page(
    'Contents',
    book.language,
    `<nav epub:type="toc" id="toc"><h1>Contents</h1>${navList(tree)}</nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden"><ol><li><a epub:type="toc" href="nav.xhtml">Contents</a></li>${landmarks}</ol></nav>`,
  );
}

function ncx(book, tree) {
  let order = 0;
  const point = (entry) => {
    order += 1;
    const id = order;
    return `<navPoint id="n${id}" playOrder="${id}"><navLabel><text>${escapeXml(entry.title)}</text></navLabel><content src="${entry.name}"/>${entry.children.map(point).join('')}</navPoint>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${escapeXml(identifierOf(book))}"/><meta name="dtb:depth" content="2"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${escapeXml(book.title)}</text></docTitle>
<navMap>${tree.map(point).join('')}</navMap>
</ncx>
`;
}

function opf(book, pages, modified, year) {
  const { details } = book;
  const optional = [];
  if (authorOf(book)) optional.push(`<dc:creator id="creator">${escapeXml(authorOf(book))}</dc:creator><meta refines="#creator" property="role" scheme="marc:relators">aut</meta>`);
  if (details.publisher) optional.push(`<dc:publisher>${escapeXml(details.publisher)}</dc:publisher>`);
  if (details.description) optional.push(`<dc:description>${escapeXml(details.description)}</dc:description>`);
  for (const keyword of (details.keywords ?? '').split(',').map((word) => word.trim()).filter(Boolean)) {
    optional.push(`<dc:subject>${escapeXml(keyword)}</dc:subject>`);
  }
  const holder = details.copyrightHolder || details.author;
  if (holder) optional.push(`<dc:rights>Copyright © ${escapeXml(details.copyrightYear || year)} ${escapeXml(holder)}</dc:rights>`);
  if (details.subtitle) {
    optional.push(`<dc:title id="subtitle">${escapeXml(details.subtitle)}</dc:title><meta refines="#subtitle" property="title-type">subtitle</meta>`);
  }
  if (details.seriesName) {
    optional.push(`<meta property="belongs-to-collection" id="series">${escapeXml(details.seriesName)}</meta><meta refines="#series" property="collection-type">series</meta>`);
    if (/^\d+(\.\d+)?$/.test(details.seriesNumber ?? '')) optional.push(`<meta refines="#series" property="group-position">${details.seriesNumber}</meta>`);
  }
  if (book.cover) optional.push('<meta name="cover" content="cover-image"/>');

  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="style" href="style.css" media-type="text/css"/>',
    ...(book.cover ? [`<item id="cover-image" href="cover.${book.cover.extension}" media-type="${book.cover.type}" properties="cover-image"/>`] : []),
    ...pages.map((item, at) => `<item id="p${at}" href="${item.name}" media-type="application/xhtml+xml"/>`),
  ];
  const navAt = pages.findIndex((item) => item.chapter || item.part);
  const spine = pages.map((item, at) => `<itemref idref="p${at}"/>`);
  spine.splice(navAt === -1 ? spine.length : navAt, 0, '<itemref idref="nav"/>');
  const guide = pages.some((item) => item.name === 'cover.xhtml') ? '<guide><reference type="cover" title="Cover" href="cover.xhtml"/></guide>' : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(book.language)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${escapeXml(identifierOf(book))}</dc:identifier>
<dc:title id="title">${escapeXml(book.title)}</dc:title><meta refines="#title" property="title-type">main</meta>
<dc:language>${escapeXml(book.language)}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
<meta property="schema:accessMode">textual</meta>
<meta property="schema:accessModeSufficient">textual</meta>
<meta property="schema:accessibilityFeature">tableOfContents</meta>
<meta property="schema:accessibilityFeature">readingOrder</meta>
<meta property="schema:accessibilityHazard">none</meta>
<meta property="schema:accessibilitySummary">Reflowable text with a table of contents.</meta>
${optional.join('\n')}
</metadata>
<manifest>
${manifest.join('\n')}
</manifest>
<spine toc="ncx">
${spine.join('\n')}
</spine>
${guide}
</package>
`;
}

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`;

function toEpub(model) {
  const [book] = model.books;
  const modified = model.generated.toISOString().replace(/\.\d+Z$/, 'Z');
  const pages = buildPages(book, model.year);
  const tree = contentsTree(pages);
  const files = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(opf(book, pages, modified, model.year)),
    'OEBPS/nav.xhtml': strToU8(navPage(book, pages, tree)),
    'OEBPS/toc.ncx': strToU8(ncx(book, tree)),
    'OEBPS/style.css': strToU8(STYLE),
  };
  for (const item of pages) files[`OEBPS/${item.name}`] = strToU8(item.html);
  if (book.cover) files[`OEBPS/cover.${book.cover.extension}`] = [new Uint8Array(book.cover.data), { level: 0 }];
  return Buffer.from(zipSync(files, { level: 6, mtime: model.generated }));
}

module.exports = { toEpub };
