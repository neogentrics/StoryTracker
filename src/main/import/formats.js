'use strict';
// Each format, read into the same shape: a title, details, and either one run of blocks to split or ready-made sections.
const fs = require('node:fs');
const path = require('node:path');
const { XMLParser } = require('fast-xml-parser');
const { strFromU8, unzipSync } = require('fflate');
const { countWords } = require('../../shared/text');
const { htmlToBlocks, newContext } = require('./html');
const { parseRtf } = require('./rtf');

const MAX_UNZIPPED = 1024 * 1024 * 1024;
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', processEntities: true, htmlEntities: false, removeNSPrefix: true });
const ordered = new XMLParser({ ignoreAttributes: false, preserveOrder: true, trimValues: false, processEntities: true });

const asList = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const titleFromFile = (file) => path.basename(file, path.extname(file)).replace(/[_-]+/g, ' ').trim();

function unzip(file) {
  let total = 0;
  try {
    return unzipSync(new Uint8Array(fs.readFileSync(file)), {
      filter: ({ originalSize }) => {
        total += originalSize;
        if (total > MAX_UNZIPPED) throw new Error('That file unpacks to more than 1 GB.');
        return true;
      },
    });
  } catch (error) {
    if (/1 GB/.test(error.message)) throw error;
    throw new Error("That file couldn't be opened. It may be damaged.");
  }
}

function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return Buffer.from(bytes.subarray(2)).swap16().toString('utf16le');
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start));
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// Text and Markdown

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n?/;
const DETAIL_KEYS = { subtitle: 'subtitle', author: 'author', publisher: 'publisher', language: 'language', lang: 'language', description: 'description', keywords: 'keywords', series: 'seriesName' };

function splitFrontMatter(text) {
  const match = FRONT_MATTER.exec(text);
  if (!match) return { body: text, title: null, details: {} };
  const details = {};
  let title = null;
  for (const line of match[1].split('\n')) {
    const pair = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1].toLowerCase();
    const value = pair[2].trim().replace(/^["']|["']$/g, '').replace(/\\"/g, '"');
    if (key === 'title') title = value;
    else if (DETAIL_KEYS[key] && value) details[DETAIL_KEYS[key]] = value;
  }
  return { body: text.slice(match[0].length), title, details };
}

function markdownToBlocks(text) {
  const MarkdownIt = require('markdown-it');
  const renderer = new MarkdownIt({ html: true, breaks: false, linkify: false });
  return htmlToBlocks(renderer.render(text));
}

function textToBlocks(text) {
  const hasBlankLines = /\n\s*\n/.test(text);
  const chunks = hasBlankLines ? text.split(/\n\s*\n/) : text.split('\n');
  const blocks = chunks
    .map((chunk) => chunk.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }));
  return { blocks, context: newContext() };
}

// Word

// Plenty of manuscripts use a template with its own style for chapter titles, so the usual names count as headings.
const CHAPTER_STYLES = ['Chapter', 'Chapter Title', 'ChapterTitle', 'Chapter Heading', 'ChapterHeading', 'Chapter Head', 'ChapterHead', 'Chapter Name'];
const TITLE_STYLES = ['Title', 'Book Title', 'BookTitle'];
const WORD_STYLES = [
  'comment-reference => sup',
  'u => u',
  ...TITLE_STYLES.map((name) => `p[style-name='${name}'] => h1.book-title:fresh`),
  ...CHAPTER_STYLES.map((name) => `p[style-name='${name}'] => h1:fresh`),
  "p[style-name^='Subhead'] => h3:fresh",
  "p[style-name^='TOC'] => !",
  "p[style-name='RT Centre'] => p.align-center:fresh",
  "p[style-name='RT Right'] => p.align-right:fresh",
];
const ALIGNED = { center: 'RT Centre', right: 'RT Right' };

const wordText = (element) => {
  if (element.type === 'text') return element.value;
  if (element.type === 'tab') return ' ';
  return (element.children ?? []).map(wordText).join('');
};

async function readDocx(file) {
  const mammoth = require('mammoth');
  const buffer = fs.readFileSync(file);
  let contentsWords = 0;
  const pictures = [];
  const transformDocument = mammoth.transforms.paragraph((paragraph) => {
    if (/^toc/i.test(paragraph.styleName ?? '')) contentsWords += countWords(wordText(paragraph));
    return ALIGNED[paragraph.alignment] && !paragraph.styleName ? { ...paragraph, styleName: ALIGNED[paragraph.alignment] } : paragraph;
  });
  const { value: html } = await mammoth.convertToHtml({ buffer }, {
    styleMap: WORD_STYLES,
    transformDocument,
    convertImage: mammoth.images.imgElement(async (image) => {
      const extension = /\/(\w+)/.exec(image.contentType ?? '')?.[1] ?? 'png';
      pictures.push({ name: `Picture ${pictures.length + 1}.${extension}`, type: image.contentType ?? '', data: await image.read() });
      return { src: '' };
    }),
  });
  const { value: raw } = await mammoth.extractRawText({ buffer });
  const { blocks, context } = htmlToBlocks(html.replace(COMMENT_LIST, ''));
  return { blocks, context, pictures, comments: commentsIn(html), originalWords: countWords(raw) - contentsWords };
}

// Mammoth lists comments at the end as definitions. Each one's ID matches the marker left in the text.
const COMMENT_LIST = /<dl>\s*<dt id="comment-\d+">[\s\S]*<\/dl>/;

function commentsIn(html) {
  const comments = {};
  const pattern = /<dt id="comment-(\d+)">[\s\S]*?<\/dt><dd>([\s\S]*?)<\/dd>/g;
  for (const [, id, body] of html.matchAll(pattern)) {
    comments[id] = body.replace(/<a [^>]*>[\s\S]*?<\/a>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return comments;
}

// Pictures

function imageSize(data) {
  if (data[0] === 0x89 && data[1] === 0x50) return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  let at = 2;
  while (at < data.length - 8) {
    if (data[at] !== 0xff) return null;
    const marker = data[at + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: data.readUInt16BE(at + 5), width: data.readUInt16BE(at + 7) };
    }
    at += 2 + data.readUInt16BE(at + 2);
  }
  return null;
}

// EPUB

const SKIP_NAMES = /(^|\/)(cover|title|titlepage|copyright|toc|nav|contents)[^/]*\.x?html?$/i;

function readEpub(file) {
  const files = unzip(file);
  const read = (name) => (files[name] ? strFromU8(files[name]) : null);
  const container = xml.parse(read('META-INF/container.xml') ?? '');
  const opfPath = asList(container.container?.rootfiles?.rootfile)[0]?.['full-path'];
  if (!opfPath || !files[opfPath]) throw new Error("That e-book couldn't be read.");
  const base = path.posix.dirname(opfPath) === '.' ? '' : `${path.posix.dirname(opfPath)}/`;
  const { package: opf } = xml.parse(read(opfPath));
  const items = new Map(asList(opf.manifest?.item).map((item) => [item.id, item]));
  const meta = opf.metadata ?? {};
  const value = (entry) => (typeof asList(entry)[0] === 'object' ? asList(entry)[0]['#text'] : asList(entry)[0]);

  const context = newContext();
  const sections = [];
  let skipped = 0;
  for (const reference of asList(opf.spine?.itemref)) {
    const item = items.get(reference.idref);
    if (!item || !/html|xml/.test(item['media-type'] ?? '')) continue;
    const name = decodeURI(`${base}${item.href}`);
    const source = read(name);
    if (!source) continue;
    if (SKIP_NAMES.test(name) || (item.properties ?? '').includes('nav')) {
      skipped += 1;
      continue;
    }
    const { blocks } = htmlToBlocks(source, context);
    if (blocks.length === 0) continue;
    const first = blocks[0].type === 'heading' ? blocks.shift() : null;
    const title = first ? first.content.map((node) => node.text ?? ' ').join('').trim() : `Section ${sections.length + 1}`;
    if (blocks.length === 0 && first) sections.push({ type: 'part', title });
    else sections.push({ type: 'chapter', title, blocks });
  }

  const coverItem = [...items.values()].find((item) => (item.properties ?? '').includes('cover-image'));
  let cover = null;
  if (coverItem && files[`${base}${coverItem.href}`]) {
    const data = Buffer.from(files[`${base}${coverItem.href}`]);
    const size = imageSize(data);
    if (size) cover = { type: coverItem['media-type'], data, ...size };
  }
  const pictures = [...items.values()]
    .filter((item) => /^image\//.test(item['media-type'] ?? '') && item !== coverItem && files[decodeURI(`${base}${item.href}`)])
    .map((item) => ({ name: path.posix.basename(item.href), type: item['media-type'], data: Buffer.from(files[decodeURI(`${base}${item.href}`)]) }));
  const details = {};
  const creator = value(meta.creator);
  if (creator) details.author = String(creator);
  if (value(meta.publisher)) details.publisher = String(value(meta.publisher));
  if (value(meta.language)) details.language = String(value(meta.language));
  if (value(meta.description)) details.description = String(value(meta.description)).replace(/<[^>]+>/g, ' ').trim();
  return {
    title: String(value(meta.title) ?? titleFromFile(file)),
    details,
    sections,
    cover,
    context,
    pictures,
    notes: skipped ? [`${skipped} cover, title or contents pages were left out.`] : [],
  };
}

// OpenDocument

const NODE_TEXT = '#text';
const ODT_LEFT_OUT = new Set(['text:table-of-content', 'text:tracked-changes', 'text:alphabetical-index', 'text:illustration-index', 'office:forms']);
const nameOf = (node) => Object.keys(node).find((key) => key !== ':@');
const attrOf = (node, name) => node[':@']?.[`@_${name}`];

function odtStyles(tree) {
  const styles = {};
  const walk = (nodes) => {
    for (const node of nodes) {
      const name = nameOf(node);
      if (name === 'style:style') {
        const props = node[name].find((child) => nameOf(child) === 'style:text-properties');
        styles[attrOf(node, 'style:name')] = {
          parent: attrOf(node, 'style:parent-style-name'),
          level: attrOf(node, 'style:default-outline-level'),
          bold: attrOf(props ?? {}, 'fo:font-weight') === 'bold',
          italic: attrOf(props ?? {}, 'fo:font-style') === 'italic',
          underline: Boolean(attrOf(props ?? {}, 'style:text-underline-style') && attrOf(props ?? {}, 'style:text-underline-style') !== 'none'),
          strike: Boolean(attrOf(props ?? {}, 'style:text-line-through-style') && attrOf(props ?? {}, 'style:text-line-through-style') !== 'none'),
        };
      } else if (Array.isArray(node[name])) {
        walk(node[name]);
      }
    }
  };
  walk(tree);
  return styles;
}

// What a paragraph style makes of a paragraph, following the styles it's based on.
function odtRole(styles, name) {
  for (let at = name, hops = 0; at && hops < 12; at = styles[at]?.parent, hops += 1) {
    const plain = at.replace(/_20_/g, ' ');
    const heading = /^heading\s*(\d)/i.exec(plain)?.[1] ?? styles[at]?.level;
    if (/^(book\s*)?title$/i.test(plain)) return { level: 1, bookTitle: true };
    if (CHAPTER_STYLES.some((style) => style.toLowerCase() === plain.toLowerCase())) return { level: 1 };
    if (/^subhead/i.test(plain)) return { level: 3 };
    if (heading) return { level: Number(heading) };
  }
  return null;
}

function marksOf(styles, name) {
  const marks = [];
  for (let style = styles[name]; style; style = styles[style.parent]) {
    for (const mark of ['bold', 'italic', 'underline', 'strike']) if (style[mark]) marks.push(mark);
  }
  return marks;
}

function odtInline(nodes, marks, styles, out) {
  for (const node of nodes) {
    const name = nameOf(node);
    if (name === NODE_TEXT) {
      const text = String(node[NODE_TEXT]).replace(/\s+/g, ' ');
      if (text) out.push({ type: 'text', text, ...(marks.length ? { marks: [...new Set(marks)].map((type) => ({ type })) } : {}) });
    } else if (name === 'text:line-break') {
      out.push({ type: 'hardBreak' });
    } else if (name === 'text:s' || name === 'text:tab') {
      out.push({ type: 'text', text: ' ' });
    } else if (name === 'text:span') {
      odtInline(node[name], [...marks, ...marksOf(styles, attrOf(node, 'text:style-name'))], styles, out);
    } else if (name === 'draw:frame') {
      if (node[name].some((child) => nameOf(child) === 'draw:image')) out.pictures = (out.pictures ?? 0) + 1;
    } else if (Array.isArray(node[name]) && name !== 'office:annotation') {
      odtInline(node[name], marks, styles, out);
    }
  }
  return out;
}

function odtBlocks(nodes, styles, context) {
  const blocks = [];
  for (const node of nodes) {
    const name = nameOf(node);
    if (ODT_LEFT_OUT.has(name)) continue;
    if (name === 'text:p' || name === 'text:h') {
      const content = odtInline(node[name], [], styles, []);
      context.pictures += content.pictures ?? 0;
      const clean = content.filter((item) => item.type !== 'text' || item.text.trim() || content.length > 1);
      if (!clean.some((item) => item.type === 'text' && item.text.trim())) continue;
      const role = name === 'text:h' ? { level: Number(attrOf(node, 'text:outline-level') ?? 1) } : odtRole(styles, attrOf(node, 'text:style-name'));
      if (role) {
        blocks.push({
          type: 'heading',
          attrs: { level: role.level },
          ...(role.bookTitle ? { bookTitle: true } : {}),
          content: clean.map((item) => (item.type === 'text' ? { type: 'text', text: item.text } : item)),
        });
      } else {
        blocks.push({ type: 'paragraph', content: clean });
      }
    } else if (name === 'text:list') {
      const items = node[name]
        .filter((child) => nameOf(child) === 'text:list-item')
        .map((child) => {
          const content = odtBlocks(child['text:list-item'], styles, context).filter((block) => block.type !== 'heading');
          return { type: 'listItem', content: content.length ? content : [{ type: 'paragraph' }] };
        });
      if (items.length) blocks.push({ type: 'bulletList', content: items });
    } else if (Array.isArray(node[name])) {
      blocks.push(...odtBlocks(node[name], styles, context));
    }
  }
  return blocks;
}

function readOdt(file) {
  const files = unzip(file);
  if (!files['content.xml']) throw new Error("That file doesn't look like OpenDocument.");
  const tree = ordered.parse(strFromU8(files['content.xml']));
  const styles = odtStyles(tree);
  if (files['styles.xml']) Object.assign(styles, { ...odtStyles(ordered.parse(strFromU8(files['styles.xml']))), ...styles });
  const context = newContext();
  const root = tree.find((node) => nameOf(node) === 'office:document-content');
  const body = root['office:document-content'].find((node) => nameOf(node) === 'office:body');
  const pictures = Object.keys(files)
    .filter((name) => /^Pictures\/[^/]+\.(png|jpe?g|gif)$/i.test(name))
    .map((name) => ({ name: path.posix.basename(name), type: /\.png$/i.test(name) ? 'image/png' : /\.gif$/i.test(name) ? 'image/gif' : 'image/jpeg', data: Buffer.from(files[name]) }));
  return { blocks: odtBlocks(body['office:body'], styles, context), context, pictures };
}

// PDF: the words are in there, but a PDF doesn't record what's a heading or where a paragraph ends, so this is an estimate.

async function readPdf(data) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const cMapUrl = `${path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'cmaps').replaceAll(path.sep, '/')}/`;
  const loading = getDocument({ data: new Uint8Array(data), cMapUrl, cMapPacked: true, useSystemFonts: false, disableFontFace: true, isEvalSupported: false, verbosity: 0 });
  const document = await loading.promise;
  const pages = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const { items } = await page.getTextContent();
    const lines = [];
    for (const item of items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      const size = Math.abs(item.transform[3]) || item.height;
      const line = lines.find((entry) => Math.abs(entry.y - y) <= 2);
      if (line) {
        line.text += item.str;
        line.size = Math.max(line.size, size);
      } else {
        lines.push({ y, x: item.transform[4], text: item.str, size });
      }
    }
    lines.sort((a, b) => b.y - a.y);
    pages.push(lines);
  }
  await loading.destroy();

  // A line repeated at the top or bottom of many pages is a running header, and a bare number is a page number.
  const repeated = new Map();
  for (const lines of pages) {
    for (const line of [lines[0], lines.at(-1)]) {
      if (line) repeated.set(line.text.trim(), (repeated.get(line.text.trim()) ?? 0) + 1);
    }
  }
  const isFurniture = (line) => /^\d{1,4}$/.test(line.text.trim()) || (pages.length >= 4 && repeated.get(line.text.trim()) >= pages.length / 3);

  const kept = pages.map((lines) => lines.filter((line) => line.text.trim() && !isFurniture(line)));
  const sizes = kept.flat().map((line) => line.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] ?? 12;
  const blocks = [];
  let text = '';
  const flush = () => {
    if (text.trim()) blocks.push({ type: 'paragraph', content: [{ type: 'text', text: text.trim() }] });
    text = '';
  };
  for (const lines of kept) {
    let previous = null;
    for (const line of lines) {
      const value = line.text.trim();
      if (line.size > body * 1.25) {
        flush();
        blocks.push({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: value }] });
        previous = line;
        continue;
      }
      const gap = previous ? previous.y - line.y : 0;
      const indented = previous && line.x > previous.x + body * 0.8;
      if (gap > body * 1.7 || indented) flush();
      if (text.endsWith('-') && /^[a-z]/.test(value)) text = `${text.slice(0, -1)}${value}`;
      else text = `${text}${text ? ' ' : ''}${value}`;
      previous = line;
    }
  }
  flush();
  return { blocks, context: newContext(), notes: ['A PDF doesn’t record headings or paragraphs, so check this one against the original.'] };
}

// Pages: Apple doesn't publish the format. Older files carry a PDF preview, and newer ones keep their text in compressed
// records that can be searched for sentences. Either way it's a best effort.

const PAGES_HELP = 'That Pages file couldn’t be read. In Pages, choose File, then Export To, then Word, and import the Word file instead.';

function unsnappy(data) {
  const out = [];
  let at = 0;
  let length = 0;
  let shift = 0;
  while (at < data.length) {
    const byte = data[at];
    at += 1;
    length |= (byte & 0x7f) << shift;
    shift += 7;
    if (byte < 0x80) break;
  }
  while (at < data.length) {
    const tag = data[at];
    at += 1;
    const kind = tag & 3;
    if (kind === 0) {
      let size = tag >> 2;
      if (size >= 60) {
        const extra = size - 59;
        size = 0;
        for (let byte = 0; byte < extra; byte += 1) size |= data[at + byte] << (8 * byte);
        at += extra;
      }
      size += 1;
      for (let byte = 0; byte < size; byte += 1) out.push(data[at + byte]);
      at += size;
    } else {
      let offset;
      let size;
      if (kind === 1) {
        size = ((tag >> 2) & 7) + 4;
        offset = ((tag >> 5) << 8) | data[at];
        at += 1;
      } else {
        size = (tag >> 2) + 1;
        offset = kind === 2 ? data[at] | (data[at + 1] << 8) : data[at] | (data[at + 1] << 8) | (data[at + 2] << 16) | (data[at + 3] << 24);
        at += kind === 2 ? 2 : 4;
      }
      for (let byte = 0; byte < size; byte += 1) out.push(out[out.length - offset]);
    }
  }
  return Buffer.from(out.slice(0, length || out.length));
}

function iwaBytes(data) {
  const chunks = [];
  let at = 0;
  while (at + 4 <= data.length) {
    const size = data[at + 1] | (data[at + 2] << 8) | (data[at + 3] << 16);
    chunks.push(unsnappy(data.subarray(at + 4, at + 4 + size)));
    at += 4 + size;
  }
  return Buffer.concat(chunks);
}

// Long runs of readable text inside the records. The body of a Pages document sits in one or a few of these.
function sentencesIn(bytes) {
  const text = bytes.toString('utf8');
  const runs = text.match(/[\p{L}\p{N}\p{P}\p{Zs}\n\u2028\u2029]{40,}/gu) ?? [];
  return runs.filter((run) => run.trim().split(/\s+/).length >= 5);
}

async function readPages(file) {
  const files = unzip(file);
  const preview = files['QuickLook/Preview.pdf'] ?? files['preview.pdf'];
  if (preview) return { ...(await readPdf(preview)), notes: ['Read from the preview inside this Pages file. Check it against the original.'] };
  const name = Object.keys(files).find((item) => /Index\/Document\.iwa$/.test(item));
  if (!name) throw new Error(PAGES_HELP);
  let runs;
  try {
    runs = sentencesIn(iwaBytes(Buffer.from(files[name])));
  } catch {
    throw new Error(PAGES_HELP);
  }
  if (runs.length === 0) throw new Error(PAGES_HELP);
  const blocks = runs
    .flatMap((run) => run.split(/[\n\u2028\u2029]+/))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }));
  return { blocks, context: newContext(), notes: ['Pages files are hard to read from outside. Formatting is lost, so check this against the original.'] };
}

// Scrivener: a binder file listing the writing, and one RTF file per document.

function scrivenerRoot(file) {
  const stat = fs.statSync(file);
  if (stat.isDirectory()) {
    const binder = fs.readdirSync(file).find((name) => name.endsWith('.scrivx'));
    if (!binder) throw new Error("That folder isn't a Scrivener project.");
    return { root: file, binder: path.join(file, binder) };
  }
  return { root: path.dirname(file), binder: file };
}

function scrivenerText(root, item) {
  const id = String(item.UUID ?? item.ID ?? '');
  if (!/^[0-9A-Za-z-]+$/.test(id)) return null;
  const places = [path.join(root, 'Files', 'Data', id, 'content.rtf'), path.join(root, 'Files', 'Docs', `${id}.rtf`)];
  const found = places.find((place) => fs.existsSync(place));
  return found ? fs.readFileSync(found) : null;
}

function readScrivener(file) {
  const { root, binder } = scrivenerRoot(file);
  const { ScrivenerProject: project } = xml.parse(fs.readFileSync(binder, 'utf8'));
  if (!project?.Binder) throw new Error("That file isn't a Scrivener project.");
  const draft = asList(project.Binder.BinderItem).find((item) => item.Type === 'DraftFolder') ?? asList(project.Binder.BinderItem)[0];
  const sections = [];
  const context = newContext();
  const walk = (item, depth) => {
    const title = String(item.Title ?? 'Untitled');
    const rtf = item.Type === 'Text' ? scrivenerText(root, item) : null;
    const children = asList(item.Children?.BinderItem);
    if (rtf) {
      const { blocks, pictures } = parseRtf(rtf);
      context.pictures += pictures;
      sections.push({ type: 'chapter', title, blocks });
    } else if (item.Type === 'Folder' && children.length && depth === 0) {
      sections.push({ type: 'part', title });
    }
    children.forEach((child) => walk(child, depth + (item.Type === 'Folder' && depth === 0 ? 0 : 1)));
  };
  asList(draft.Children?.BinderItem).forEach((item) => walk(item, 0));
  if (sections.length === 0) throw new Error('No writing was found in that Scrivener project.');
  return { title: titleFromFile(binder), details: {}, sections, context };
}

async function readFormat(file) {
  const extension = path.extname(file).slice(1).toLowerCase();
  const title = titleFromFile(file);
  switch (extension) {
    case 'md':
    case 'markdown':
    case 'mdown': {
      const text = decodeText(fs.readFileSync(file)).replace(/\r\n?/g, '\n');
      return { format: 'Markdown', title, text };
    }
    case 'txt':
    case 'text': {
      const text = decodeText(fs.readFileSync(file)).replace(/\r\n?/g, '\n');
      return { format: 'Plain text', title, text, plain: true };
    }
    case 'rtf': {
      const { blocks, pictures } = parseRtf(fs.readFileSync(file));
      return { format: 'Rich text', title, blocks, context: { ...newContext(), pictures } };
    }
    case 'html':
    case 'htm':
    case 'xhtml': {
      const parsed = htmlToBlocks(decodeText(fs.readFileSync(file)));
      return { format: 'Web page', ...parsed, title: parsed.title || title };
    }
    case 'docx':
      return { format: 'Word', title, ...(await readDocx(file)) };
    case 'doc':
      throw new Error('That’s the old Word format. In Word, choose Save As and pick Word Document (.docx), then import that.');
    case 'epub':
      return { format: 'E-book', ...readEpub(file) };
    case 'odt':
      return { format: 'OpenDocument', title, ...readOdt(file) };
    case 'pdf':
      return { format: 'PDF', title, ...(await readPdf(fs.readFileSync(file))) };
    case 'pages':
      return { format: 'Pages', title, ...(await readPages(file)) };
    case 'scrivx':
    case 'scriv':
      return { format: 'Scrivener', ...readScrivener(file) };
    default:
      throw new Error("That kind of file can't be imported yet.");
  }
}

const IMPORT_EXTENSIONS = ['docx', 'md', 'markdown', 'txt', 'rtf', 'html', 'htm', 'epub', 'odt', 'pdf', 'pages', 'scrivx'];

module.exports = { IMPORT_EXTENSIONS, imageSize, iwaBytes, markdownToBlocks, readFormat, sentencesIn, splitFrontMatter, textToBlocks };
