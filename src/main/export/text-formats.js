'use strict';
// The text-based formats: Markdown, plain text, HTML, XML and RTF. Each one walks the same saved document.
const { plainText } = require('../../shared/text');
const { authorOf, copyrightLines, matterOf } = require('./model');

const FORMAT_VERSION = 1;
const hasMark = (node, type) => node.marks?.some((mark) => mark.type === type);

const escapeXml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Markdown

const escapeMarkdown = (text) => text.replace(/([\\`*_[\]])/g, '\\$1').replace(/^(\s*)([#>+-])(\s)/, '$1\\$2$3').replace(/^(\d+)\.(\s)/, '$1\\.$2');

function inlineMarkdown(nodes = []) {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '  \n';
      let text = escapeMarkdown(node.text ?? '');
      const lead = text.match(/^\s*/)[0];
      const tail = text.match(/\s*$/)[0];
      text = text.trim();
      if (!text) return lead;
      if (hasMark(node, 'strike')) text = `~~${text}~~`;
      if (hasMark(node, 'italic')) text = `*${text}*`;
      if (hasMark(node, 'bold')) text = `**${text}**`;
      return `${lead}${text}${tail}`;
    })
    .join('');
}

function blockMarkdown(node, level = 0) {
  const indent = '  '.repeat(level);
  switch (node.type) {
    case 'heading':
      return `${'#'.repeat(Math.min(6, node.attrs.level + 2))} ${inlineMarkdown(node.content)}`;
    case 'bulletList':
      return node.content.map((item) => `${indent}- ${itemMarkdown(item, level)}`).join('\n');
    case 'orderedList':
      return node.content.map((item, at) => `${indent}${at + 1}. ${itemMarkdown(item, level)}`).join('\n');
    case 'blockquote':
      return node.content.map((child) => blockMarkdown(child)).join('\n\n').replace(/^/gm, '> ');
    case 'horizontalRule':
      return '***';
    default:
      return inlineMarkdown(node.content);
  }
}

function itemMarkdown(item, level) {
  return item.content.map((child) => blockMarkdown(child, level + 1)).join('\n');
}

const documentMarkdown = (document) => (document.content ?? []).map((block) => blockMarkdown(block)).filter(Boolean).join('\n\n');

function frontMatter(book) {
  const value = (text) => `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const lines = [`title: ${value(book.title)}`];
  if (book.details.subtitle) lines.push(`subtitle: ${value(book.details.subtitle)}`);
  if (authorOf(book)) lines.push(`author: ${value(authorOf(book))}`);
  if (book.details.publisher) lines.push(`publisher: ${value(book.details.publisher)}`);
  if (book.details.language) lines.push(`language: ${value(book.details.language)}`);
  return `---\n${lines.join('\n')}\n---`;
}

function chapterMarkdown(section) {
  return `## ${escapeMarkdown(section.title)}\n\n${documentMarkdown(section.document)}`.trimEnd();
}

function toMarkdown(model) {
  return `${model.books
    .map((book) => {
      const parts = [frontMatter(book), `# ${escapeMarkdown(book.title)}`];
      for (const section of book.sections) {
        parts.push(section.type === 'part' ? `---\n\n# ${escapeMarkdown(section.title)}` : chapterMarkdown(section));
      }
      return parts.join('\n\n');
    })
    .join('\n\n')}\n`;
}

// Plain text

function toText(model) {
  const chunks = [];
  for (const book of model.books) {
    chunks.push(book.title.toUpperCase());
    if (authorOf(book)) chunks.push(`by ${authorOf(book)}`);
    for (const section of book.sections) {
      if (section.type === 'part') chunks.push(section.title.toUpperCase());
      else chunks.push(`${section.title}\n\n${plainText(section.document).split('\n').join('\n\n')}`);
    }
  }
  return `${chunks.join('\n\n\n')}\n`;
}

// HTML. The same writer feeds the web page, the EPUB and the print PDF, so it always writes tidy XHTML.

function inlineHtml(nodes = []) {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '<br/>';
      let html = escapeXml(node.text ?? '');
      if (hasMark(node, 'strike')) html = `<s>${html}</s>`;
      if (hasMark(node, 'underline')) html = `<u>${html}</u>`;
      if (hasMark(node, 'italic')) html = `<em>${html}</em>`;
      if (hasMark(node, 'bold')) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

const alignClass = (node) => {
  const align = node.attrs?.textAlign;
  return align && align !== 'left' ? ` class="align-${escapeXml(align)}"` : '';
};

function blockHtml(node) {
  switch (node.type) {
    case 'heading':
      return `<h${node.attrs.level + 2}${alignClass(node)}>${inlineHtml(node.content)}</h${node.attrs.level + 2}>`;
    case 'bulletList':
      return `<ul>${node.content.map(itemHtml).join('')}</ul>`;
    case 'orderedList':
      return `<ol>${node.content.map(itemHtml).join('')}</ol>`;
    case 'blockquote':
      return `<blockquote>${node.content.map(blockHtml).join('')}</blockquote>`;
    case 'horizontalRule':
      return '<hr/>';
    default:
      return node.content?.length ? `<p${alignClass(node)}>${inlineHtml(node.content)}</p>` : `<p${alignClass(node)}> </p>`;
  }
}

function itemHtml(item) {
  return `<li>${item.content.map(blockHtml).join('')}</li>`;
}

const documentHtml = (document) => (document.content ?? []).map(blockHtml).join('\n');

const WEB_STYLE = `
  body { max-width: 40rem; margin: 3rem auto; padding: 0 1.25rem; font: 1.1rem/1.65 Georgia, serif; color: #222; }
  h1, h2 { line-height: 1.25; } h1 { font-size: 2.2rem; } nav ol { padding-left: 1.2rem; }
  section { margin-top: 3.5rem; } .align-center { text-align: center; } .align-right { text-align: right; } .align-justify { text-align: justify; }
  hr { width: 30%; margin: 2rem auto; border: 0; border-top: 1px solid #999; }
  @media (prefers-color-scheme: dark) { body { background: #1b1a20; color: #e9e6ef; } a { color: #b7a8ff; } }`;

function toHtml(model) {
  let chapter = 0;
  const contents = [];
  const body = [];
  for (const book of model.books) {
    const matter = matterOf(book);
    body.push(`<header><h1>${escapeXml(book.title)}</h1>`);
    if (book.details.subtitle) body.push(`<p>${escapeXml(book.details.subtitle)}</p>`);
    if (authorOf(book)) body.push(`<p>${escapeXml(authorOf(book))}</p>`);
    body.push('</header>');
    for (const section of book.sections) {
      if (section.type === 'part') {
        body.push(`<h1>${escapeXml(section.title)}</h1>`);
        contents.push(`<li><b>${escapeXml(section.title)}</b></li>`);
      } else {
        chapter += 1;
        contents.push(`<li><a href="#chapter-${chapter}">${escapeXml(section.title)}</a></li>`);
        body.push(`<section id="chapter-${chapter}"><h2>${escapeXml(section.title)}</h2>\n${documentHtml(section.document)}</section>`);
      }
    }
    if (matter.aboutAuthor.length) {
      body.push(`<section><h2>About the Author</h2>${matter.aboutAuthor.map((line) => `<p>${escapeXml(line)}</p>`).join('')}</section>`);
    }
  }
  const nav = chapter > 1 ? `<nav aria-label="Contents"><h2>Contents</h2><ol>${contents.join('')}</ol></nav>` : '';
  return `<!DOCTYPE html>
<html lang="${escapeXml(model.books[0].language)}">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeXml(model.title)}</title><style>${WEB_STYLE}</style></head>
<body>
${nav}
${body.join('\n')}
</body></html>
`;
}

// XML, in our own documented layout. See docs/design/file-types.md.

function inlineXml(nodes = []) {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '<br/>';
      const names = ['bold', 'italic', 'underline', 'strike'].filter((type) => hasMark(node, type));
      const text = escapeXml(node.text ?? '');
      return names.length ? `<span style="${names.join(' ')}">${text}</span>` : text;
    })
    .join('');
}

function blockXml(node) {
  const align = node.attrs?.textAlign && node.attrs.textAlign !== 'left' ? ` align="${escapeXml(node.attrs.textAlign)}"` : '';
  switch (node.type) {
    case 'heading':
      return `<heading level="${node.attrs.level}"${align}>${inlineXml(node.content)}</heading>`;
    case 'bulletList':
    case 'orderedList':
      return `<list type="${node.type === 'orderedList' ? 'numbered' : 'bulleted'}">${node.content
        .map((item) => `<item>${item.content.map(blockXml).join('')}</item>`)
        .join('')}</list>`;
    case 'blockquote':
      return `<quote>${node.content.map(blockXml).join('')}</quote>`;
    case 'horizontalRule':
      return '<break/>';
    default:
      return `<p${align}>${inlineXml(node.content)}</p>`;
  }
}

function toXml(model) {
  const books = model.books.map((book) => {
    const details = Object.entries(book.details).map(([name, value]) => `    <detail name="${name}">${escapeXml(value)}</detail>`);
    const sections = [];
    let inPart = false;
    for (const section of book.sections) {
      if (section.type === 'part') {
        if (inPart) sections.push('    </part>');
        sections.push(`    <part id="${section.id}" title="${escapeXml(section.title)}">`);
        inPart = true;
      } else {
        const blocks = (section.document.content ?? []).map((block) => `      ${blockXml(block)}`);
        sections.push(`    <chapter id="${section.id}" title="${escapeXml(section.title)}">`, ...blocks, '    </chapter>');
      }
    }
    if (inPart) sections.push('    </part>');
    return [`  <book id="${book.id}" title="${escapeXml(book.title)}">`, ...details, ...sections, '  </book>'].join('\n');
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rtstory version="${FORMAT_VERSION}">\n${books.join('\n')}\n</rtstory>\n`;
}

// RTF

function escapeRtf(text) {
  let out = '';
  for (const character of text) {
    const code = character.codePointAt(0);
    if (character === '\\' || character === '{' || character === '}') out += `\\${character}`;
    else if (code < 128) out += character;
    else if (code < 0x10000) out += `\\u${code > 32767 ? code - 65536 : code}?`;
    else {
      const offset = code - 0x10000;
      for (const unit of [0xd800 + (offset >> 10), 0xdc00 + (offset & 1023)]) out += `\\u${unit - 65536}?`;
    }
  }
  return out;
}

function inlineRtf(nodes = []) {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '\\line ';
      let codes = '';
      if (hasMark(node, 'bold')) codes += '\\b';
      if (hasMark(node, 'italic')) codes += '\\i';
      if (hasMark(node, 'underline')) codes += '\\ul';
      if (hasMark(node, 'strike')) codes += '\\strike';
      const text = escapeRtf(node.text ?? '');
      return codes ? `{${codes} ${text}}` : text;
    })
    .join('');
}

function blockRtf(node, prefix = '') {
  const align = { center: '\\qc', right: '\\qr', justify: '\\qj' }[node.attrs?.textAlign] ?? '';
  switch (node.type) {
    case 'heading':
      return `{\\pard${align}\\sb240\\sa120\\b\\fs${36 - node.attrs.level * 4} ${inlineRtf(node.content)}\\par}`;
    case 'bulletList':
      return node.content.map((item) => item.content.map((child) => blockRtf(child, '\\bullet\\tab ')).join('\n')).join('\n');
    case 'orderedList':
      return node.content.map((item, at) => item.content.map((child) => blockRtf(child, `${at + 1}.\\tab `)).join('\n')).join('\n');
    case 'blockquote':
      return node.content.map((child) => `{\\li720\\ri720 ${blockRtf(child)}}`).join('\n');
    case 'horizontalRule':
      return '{\\pard\\qc * * *\\par}';
    default:
      return `{\\pard${align}\\sa160 ${prefix}${inlineRtf(node.content)}\\par}`;
  }
}

function toRtf(model) {
  const body = [];
  for (const book of model.books) {
    body.push(`{\\pard\\qc\\sb2400\\b\\fs56 ${escapeRtf(book.title)}\\par}`);
    if (authorOf(book)) body.push(`{\\pard\\qc\\sb240\\fs32 ${escapeRtf(authorOf(book))}\\par}`);
    for (const line of copyrightLines(book, model.year)) body.push(`{\\pard\\qc\\fs20 ${escapeRtf(line)}\\par}`);
    for (const section of book.sections) {
      if (section.type === 'part') {
        body.push(`{\\pard\\page\\qc\\sb2400\\b\\fs44 ${escapeRtf(section.title)}\\par}`);
      } else {
        body.push(`{\\pard\\page\\qc\\sa480\\b\\fs40 ${escapeRtf(section.title)}\\par}`);
        body.push(...(section.document.content ?? []).map((block) => blockRtf(block)));
      }
    }
  }
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\froman Georgia;}}\\uc1\\f0\\fs24\n${body.join('\n')}\n}\n`;
}

module.exports = { blockHtml, documentHtml, documentMarkdown, escapeXml, inlineHtml, toHtml, toMarkdown, toRtf, toText, toXml };
