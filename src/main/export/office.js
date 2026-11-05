'use strict';
// Word and OpenDocument. Both use the book's print layout, so a Word file can go to a printer too.
const docx = require('docx');
const { strFromU8, strToU8, unzipSync, zipSync } = require('fflate');
const { TRIM_SIZES } = require('../../shared/details');
const { PAGE_FONTS } = require('../../shared/themes');
const { authorOf, copyrightLines, matterOf } = require('./model');
const { escapeXml } = require('./text-formats');

const hasMark = (node, type) => node.marks?.some((mark) => mark.type === type);
const TWIPS = 1440;
const familyOf = (layout) => PAGE_FONTS[layout.pageFont].stack.split(',')[0].replace(/'/g, '').trim();

const ALIGN = { center: docx.AlignmentType.CENTER, right: docx.AlignmentType.RIGHT, justify: docx.AlignmentType.JUSTIFIED };

function runs(nodes = []) {
  return nodes.map((node) => {
    if (node.type === 'hardBreak') return new docx.TextRun({ break: 1 });
    return new docx.TextRun({
      text: node.text ?? '',
      bold: hasMark(node, 'bold') || undefined,
      italics: hasMark(node, 'italic') || undefined,
      underline: hasMark(node, 'underline') ? {} : undefined,
      strike: hasMark(node, 'strike') || undefined,
    });
  });
}

function blocks(node, options = {}) {
  const align = ALIGN[node.attrs?.textAlign];
  switch (node.type) {
    case 'heading':
      return [new docx.Paragraph({ heading: [docx.HeadingLevel.HEADING_3, docx.HeadingLevel.HEADING_4, docx.HeadingLevel.HEADING_5][node.attrs.level - 1], alignment: align, children: runs(node.content) })];
    case 'bulletList':
      return node.content.flatMap((item) => item.content.flatMap((child) => blocks(child, { bullet: { level: 0 } })));
    case 'orderedList':
      return node.content.flatMap((item) => item.content.flatMap((child) => blocks(child, { numbering: { reference: 'numbers', level: 0 } })));
    case 'blockquote':
      return node.content.flatMap((child) => blocks(child, { indent: { left: 720, right: 720 } }));
    case 'horizontalRule':
      return [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun('* * *')] })];
    default:
      return [new docx.Paragraph({ alignment: align, children: runs(node.content), ...options })];
  }
}

const centred = (text, extra = {}) => new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, ...extra, children: [new docx.TextRun({ text, ...extra.run })] });

function titlePages(book, year) {
  const pages = [
    centred(book.title, { spacing: { before: 2800, after: 240 }, run: { size: 56, bold: true } }),
  ];
  if (book.details.subtitle) pages.push(centred(book.details.subtitle, { run: { size: 30 } }));
  if (authorOf(book)) pages.push(centred(authorOf(book), { spacing: { before: 480 }, run: { size: 32 } }));
  if (book.details.publisher) pages.push(centred(book.details.publisher, { spacing: { before: 1800 } }));
  const isbn = book.details.isbnPrint ? [`ISBN ${book.details.isbnPrint}`] : [];
  [...copyrightLines(book, year), ...isbn].forEach((line, at) => {
    pages.push(centred(line, { pageBreakBefore: at === 0, spacing: at === 0 ? { before: 3600 } : undefined, run: { size: 20 } }));
  });
  const { dedication } = matterOf(book);
  dedication.forEach((line, at) => {
    pages.push(centred(line, { pageBreakBefore: at === 0, spacing: at === 0 ? { before: 3200 } : undefined, run: { italics: true } }));
  });
  return pages;
}

function backPages(book) {
  const matter = matterOf(book);
  const heading = (text) => new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new docx.TextRun(text)] });
  const section = (title, lines) => (lines.length ? [heading(title), ...lines.map((line) => new docx.Paragraph({ children: [new docx.TextRun(line)] }))] : []);
  return [
    ...section('Acknowledgements', matter.acknowledgements),
    ...section('About the Author', matter.aboutAuthor),
    ...section(authorOf(book) ? `Also by ${authorOf(book)}` : 'Also by This Author', matter.alsoBy),
    ...section('Stay Connected', matter.connect),
  ];
}

function bookBody(book, year, layout, single) {
  const children = single ? [] : titlePages(book, year);
  if (!single && layout.contents) {
    children.push(new docx.Paragraph({ pageBreakBefore: true, alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: 'Contents', bold: true, size: 32 })] }));
    children.push(new docx.TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }));
  }
  for (const section of book.sections) {
    if (section.type === 'part') {
      children.push(new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_1, pageBreakBefore: true, alignment: docx.AlignmentType.CENTER, spacing: { before: 2800 }, children: [new docx.TextRun(section.title)] }));
    } else {
      children.push(new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_2, pageBreakBefore: !single || children.length > 0, alignment: docx.AlignmentType.CENTER, spacing: { before: 1200, after: 480 }, children: [new docx.TextRun(section.title)] }));
      children.push(...(section.document.content ?? []).flatMap((block) => blocks(block)));
    }
  }
  if (!single) children.push(...backPages(book));
  return children;
}

function pageFooter(layout) {
  if (!layout.pageNumbers) return {};
  const number = new docx.Footer({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ children: [docx.PageNumber.CURRENT] })] })] });
  return { footers: { default: number, even: number } };
}

function pageHeaders(book, layout) {
  if (!layout.runningHeaders) return {};
  const line = (text) => new docx.Header({ children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text, size: 18 })] })] });
  return { headers: { default: line(book.title), even: line(authorOf(book) || book.title) } };
}

function gutterFor(pages) {
  if (pages <= 150) return 0.375;
  if (pages <= 300) return 0.5;
  if (pages <= 500) return 0.625;
  if (pages <= 700) return 0.75;
  return 0.875;
}

// Word has a switch for facing pages that the library doesn't write, so it's set in the finished file.
function withMirroredMargins(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const settings = strFromU8(files['word/settings.xml']);
  files['word/settings.xml'] = strToU8(settings.replace(/(<w:settings[^>]*>)/, '$1<w:mirrorMargins/>'));
  return Buffer.from(zipSync(files));
}

async function toDocx(model, layout) {
  const trim = TRIM_SIZES[layout.trim];
  const single = model.books.length === 1 && model.books[0].sections.length === 1;
  const sections = model.books.map((book) => ({
    properties: {
      titlePage: !single,
      page: {
        size: { width: trim.width * TWIPS, height: trim.height * TWIPS },
        margin: { top: 0.9 * TWIPS, bottom: 0.9 * TWIPS, left: 0.6 * TWIPS, right: 0.6 * TWIPS, gutter: gutterFor(300) * TWIPS, header: 0.4 * TWIPS, footer: 0.4 * TWIPS },
      },
    },
    ...pageFooter(layout),
    ...pageHeaders(book, layout),
    children: bookBody(book, model.year, layout, single),
  }));
  const [first] = model.books;
  const document = new docx.Document({
    title: first.title,
    creator: authorOf(first) || 'RT Story Tracker',
    description: first.details.description,
    evenAndOddHeaderAndFooters: true,
    features: { updateFields: !single && layout.contents },
    numbering: { config: [{ reference: 'numbers', levels: [{ level: 0, format: docx.LevelFormat.DECIMAL, text: '%1.', alignment: docx.AlignmentType.START }] }] },
    styles: {
      default: {
        document: { run: { font: familyOf(layout), size: layout.fontSize * 2 }, paragraph: { spacing: { line: Math.round(layout.lineHeight * 240), after: 120 } } },
        heading1: { run: { font: familyOf(layout), size: 40, bold: true }, paragraph: { spacing: { after: 240 } } },
        heading2: { run: { font: familyOf(layout), size: 34, bold: true } },
        heading3: { run: { font: familyOf(layout), size: 28, bold: true } },
        heading4: { run: { font: familyOf(layout), size: 26, bold: true } },
        heading5: { run: { font: familyOf(layout), size: 24, bold: true } },
      },
    },
    sections,
  });
  return withMirroredMargins(await docx.Packer.toBuffer(document));
}

// OpenDocument

const odtStyle = (node) => ({ center: 'Centre', right: 'Right', justify: 'Justify' }[node.attrs?.textAlign] ?? 'Body');

function odtInline(nodes = []) {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '<text:line-break/>';
      const names = [];
      if (hasMark(node, 'bold')) names.push('B');
      if (hasMark(node, 'italic')) names.push('I');
      if (hasMark(node, 'underline')) names.push('U');
      if (hasMark(node, 'strike')) names.push('S');
      const text = escapeXml(node.text ?? '');
      return names.length ? `<text:span text:style-name="T${names.join('')}">${text}</text:span>` : text;
    })
    .join('');
}

const STYLE_COMBINATIONS = ['B', 'I', 'U', 'S', 'BI', 'BU', 'BS', 'IU', 'IS', 'US', 'BIU', 'BIS', 'BUS', 'IUS', 'BIUS'];

function odtBlock(node) {
  switch (node.type) {
    case 'heading':
      return `<text:h text:style-name="Subhead" text:outline-level="${node.attrs.level + 2}">${odtInline(node.content)}</text:h>`;
    case 'bulletList':
    case 'orderedList':
      return `<text:list text:style-name="${node.type === 'orderedList' ? 'Numbers' : 'Bullets'}">${node.content
        .map((item) => `<text:list-item>${item.content.map(odtBlock).join('')}</text:list-item>`)
        .join('')}</text:list>`;
    case 'blockquote':
      return node.content.map(odtBlock).join('').replaceAll('text:style-name="Body"', 'text:style-name="Quote"');
    case 'horizontalRule':
      return '<text:p text:style-name="Centre">* * *</text:p>';
    default:
      return `<text:p text:style-name="${odtStyle(node)}">${odtInline(node.content)}</text:p>`;
  }
}

function odtContent(model) {
  const body = [];
  for (const book of model.books) {
    const line = (text, style) => `<text:p text:style-name="${style}">${escapeXml(text)}</text:p>`;
    body.push(line(book.title, 'BookTitle'));
    if (book.details.subtitle) body.push(line(book.details.subtitle, 'Centre'));
    if (authorOf(book)) body.push(line(authorOf(book), 'Centre'));
    copyrightLines(book, model.year).forEach((text, at) => body.push(line(text, at === 0 ? 'CentreBreak' : 'Centre')));
    for (const section of book.sections) {
      if (section.type === 'part') {
        body.push(`<text:h text:style-name="PartHead" text:outline-level="1">${escapeXml(section.title)}</text:h>`);
      } else {
        body.push(`<text:h text:style-name="ChapterHead" text:outline-level="2">${escapeXml(section.title)}</text:h>`);
        body.push(...(section.document.content ?? []).map(odtBlock));
      }
    }
    const matter = matterOf(book);
    if (matter.aboutAuthor.length) {
      body.push('<text:h text:style-name="ChapterHead" text:outline-level="2">About the Author</text:h>');
      body.push(...matter.aboutAuthor.map((text) => line(text, 'Body')));
    }
  }
  const spans = STYLE_COMBINATIONS.map((name) => {
    const properties = [
      name.includes('B') ? 'fo:font-weight="bold"' : '',
      name.includes('I') ? 'fo:font-style="italic"' : '',
      name.includes('U') ? 'style:text-underline-style="solid"' : '',
      name.includes('S') ? 'style:text-line-through-style="solid"' : '',
    ].join(' ');
    return `<style:style style:name="T${name}" style:family="text"><style:text-properties ${properties}/></style:style>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3">
<office:automatic-styles>${spans}
<text:list-style style:name="Bullets"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:space-before="0.25in" text:min-label-width="0.25in"/></text:list-level-style-bullet></text:list-style>
<text:list-style style:name="Numbers"><text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."><style:list-level-properties text:space-before="0.25in" text:min-label-width="0.25in"/></text:list-level-style-number></text:list-style>
</office:automatic-styles>
<office:body><office:text>${body.join('\n')}</office:text></office:body>
</office:document-content>
`;
}

function odtStyles(layout) {
  const trim = TRIM_SIZES[layout.trim];
  const font = escapeXml(familyOf(layout));
  const paragraph = (name, properties, text = '') =>
    `<style:style style:name="${name}" style:family="paragraph"><style:paragraph-properties ${properties}/><style:text-properties ${text}/></style:style>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3">
<office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="${Math.round(layout.lineHeight * 100)}%"/><style:text-properties fo:font-family="${font}" fo:font-size="${layout.fontSize}pt"/></style:default-style>
${paragraph('Body', 'fo:margin-bottom="0.08in"')}
${paragraph('Centre', 'fo:text-align="center"')}
${paragraph('CentreBreak', 'fo:text-align="center" fo:break-before="page" fo:margin-top="2in"')}
${paragraph('Right', 'fo:text-align="end"')}
${paragraph('Justify', 'fo:text-align="justify"')}
${paragraph('Quote', 'fo:margin-left="0.4in" fo:margin-right="0.4in"')}
${paragraph('BookTitle', 'fo:text-align="center" fo:margin-top="2in"', 'fo:font-size="28pt" fo:font-weight="bold"')}
${paragraph('PartHead', 'fo:text-align="center" fo:break-before="page" fo:margin-top="2in"', 'fo:font-size="22pt" fo:font-weight="bold"')}
${paragraph('ChapterHead', 'fo:text-align="center" fo:break-before="page" fo:margin-bottom="0.3in"', 'fo:font-size="18pt" fo:font-weight="bold"')}
${paragraph('Subhead', 'fo:margin-top="0.15in" fo:margin-bottom="0.08in"', 'fo:font-weight="bold"')}
</office:styles>
<office:automatic-styles><style:page-layout style:name="Page"><style:page-layout-properties fo:page-width="${trim.width}in" fo:page-height="${trim.height}in" fo:margin-top="0.9in" fo:margin-bottom="0.9in" fo:margin-left="0.9in" fo:margin-right="0.7in"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="Page"/></office:master-styles>
</office:document-styles>
`;
}

function odtMeta(model) {
  const [book] = model.books;
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3">
<office:meta><dc:title>${escapeXml(book.title)}</dc:title><dc:creator>${escapeXml(authorOf(book))}</dc:creator><dc:date>${model.generated.toISOString()}</dc:date><meta:generator>RT Story Tracker</meta:generator></office:meta>
</office:document-meta>
`;
}

const ODT_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>
`;

function toOdt(model, layout) {
  return Buffer.from(
    zipSync(
      {
        mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }],
        'content.xml': strToU8(odtContent(model)),
        'styles.xml': strToU8(odtStyles(layout)),
        'meta.xml': strToU8(odtMeta(model)),
        'META-INF/manifest.xml': strToU8(ODT_MANIFEST),
      },
      { level: 6, mtime: model.generated },
    ),
  );
}

module.exports = { gutterFor, toDocx, toOdt };
