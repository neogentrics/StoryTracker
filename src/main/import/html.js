'use strict';
// HTML into the app's own document. Word, Markdown and EPUB all come through here, so only what the editor understands
// gets through: nothing from a file is ever shown as HTML.
const { parse, parseFragment } = require('parse5');

const MARK_TAGS = { b: 'bold', strong: 'bold', i: 'italic', em: 'italic', cite: 'italic', u: 'underline', ins: 'underline', s: 'strike', strike: 'strike', del: 'strike' };
const SKIPPED = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'noscript', 'template', 'svg', 'math', 'object', 'iframe', 'button', 'form']);
const BLOCKS = new Set(['p', 'div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav', 'body', 'html', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr', 'pre', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'center']);

const sealed = new WeakSet();
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value ?? '';
const isText = (node) => node.nodeName === '#text';

function alignOf(node) {
  const style = attr(node, 'style');
  const found = /text-align\s*:\s*(left|right|center|justify)/i.exec(style)?.[1]?.toLowerCase()
    ?? (/\balign-(center|right|justify)\b/.exec(attr(node, 'class'))?.[1])
    ?? attr(node, 'align').toLowerCase();
  if (node.nodeName === 'center') return 'center';
  return ['center', 'right', 'justify'].includes(found) ? found : null;
}

function styleMarks(node) {
  const style = attr(node, 'style');
  const marks = [];
  if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) marks.push('bold');
  if (/font-style\s*:\s*italic/i.test(style)) marks.push('italic');
  if (/text-decoration[^;]*underline/i.test(style)) marks.push('underline');
  if (/text-decoration[^;]*line-through/i.test(style)) marks.push('strike');
  return marks;
}

function addText(out, text, marks) {
  if (!text) return;
  const names = [...new Set(marks)].sort();
  const last = out.at(-1);
  if (last?.type === 'text' && !sealed.has(last) && (last.marks ?? []).map((mark) => mark.type).join() === names.join()) {
    last.text += text;
    return;
  }
  out.push({ type: 'text', text, ...(names.length ? { marks: names.map((type) => ({ type })) } : {}) });
}

function commentReference(node) {
  const link = node.nodeName === 'a' ? node : node.childNodes?.find((child) => child.nodeName === 'a');
  return /^#comment-(\d+)$/.exec(link ? attr(link, 'href') : '')?.[1] ?? null;
}

function inline(node, marks, out, context) {
  if (isText(node)) {
    addText(out, node.value.replace(/\s+/g, ' '), marks);
    return;
  }
  const name = node.nodeName;
  if (SKIPPED.has(name) || name.startsWith('#comment')) return;
  if (name === 'br') {
    out.push({ type: 'hardBreak' });
    return;
  }
  if (name === 'img' || name === 'image') {
    context.pictures += 1;
    return;
  }
  const reference = name === 'sup' || name === 'a' ? commentReference(node) : null;
  if (reference) {
    const last = out.findLast((item) => item.type === 'text');
    if (last) {
      sealed.add(last);
      (context.commentMarks[reference] ??= []).push(last);
    }
    return;
  }
  const added = [...styleMarks(node), ...(MARK_TAGS[name] ? [MARK_TAGS[name]] : [])];
  for (const child of node.childNodes ?? []) inline(child, [...marks, ...added], out, context);
}

function tidy(content) {
  const out = content.filter((node) => node.type !== 'text' || node.text);
  while (out[0]?.type === 'hardBreak') out.shift();
  while (out.at(-1)?.type === 'hardBreak') out.pop();
  if (out[0]?.type === 'text') out[0].text = out[0].text.replace(/^\s+/, '');
  if (out.at(-1)?.type === 'text') out.at(-1).text = out.at(-1).text.replace(/\s+$/, '');
  return out.filter((node) => node.type !== 'text' || node.text);
}

function paragraph(content, align) {
  const clean = tidy(content);
  if (clean.length === 0) return null;
  return { type: 'paragraph', ...(align ? { attrs: { textAlign: align } } : {}), content: clean };
}

function listOf(node, context) {
  const items = (node.childNodes ?? [])
    .filter((child) => child.nodeName === 'li')
    .map((child) => {
      const content = blocksOf(child, context).filter((block) => block.type !== 'heading');
      return { type: 'listItem', content: content.length ? content : [{ type: 'paragraph' }] };
    });
  if (items.length === 0) return [];
  return [{ type: node.nodeName === 'ol' ? 'orderedList' : 'bulletList', ...(node.nodeName === 'ol' ? { attrs: { start: 1 } } : {}), content: items }];
}

function blocksOf(parent, context) {
  const out = [];
  let run = [];
  const flush = (align) => {
    const block = paragraph(run, align);
    if (block) out.push(block);
    run = [];
  };
  const parentAlign = alignOf(parent);

  for (const node of parent.childNodes ?? []) {
    const name = node.nodeName;
    if (SKIPPED.has(name)) continue;
    if (isText(node) || !BLOCKS.has(name)) {
      inline(node, [], run, context);
      continue;
    }
    flush(parentAlign);
    if (name === 'hr') {
      out.push({ type: 'horizontalRule' });
    } else if (/^h[1-6]$/.test(name)) {
      const content = [];
      for (const child of node.childNodes ?? []) inline(child, [], content, context);
      const clean = tidy(content);
      if (clean.length) {
        out.push({
          type: 'heading',
          attrs: { level: Number(name[1]), ...(alignOf(node) ? { textAlign: alignOf(node) } : {}) },
          ...(attr(node, 'class').includes('book-title') ? { bookTitle: true } : {}),
          content: clean,
        });
      }
    } else if (name === 'ul' || name === 'ol') {
      out.push(...listOf(node, context));
    } else if (name === 'blockquote') {
      const content = blocksOf(node, context).filter((block) => block.type !== 'heading');
      if (content.length) out.push({ type: 'blockquote', content });
    } else if (name === 'p') {
      const content = [];
      for (const child of node.childNodes ?? []) inline(child, [], content, context);
      const block = paragraph(content, alignOf(node));
      if (block) out.push(block);
    } else if (name === 'pre') {
      const text = textOf(node);
      for (const line of text.split('\n')) {
        const block = paragraph([{ type: 'text', text: line }]);
        if (block) out.push(block);
      }
    } else {
      out.push(...blocksOf(node, context));
    }
  }
  flush(parentAlign);
  return out;
}

function textOf(node) {
  if (isText(node)) return node.value;
  return (node.childNodes ?? []).map(textOf).join('');
}

function find(node, name) {
  if (node.nodeName === name) return node;
  for (const child of node.childNodes ?? []) {
    const found = find(child, name);
    if (found) return found;
  }
  return null;
}

function newContext() {
  return { pictures: 0, commentMarks: {} };
}

function htmlToBlocks(html, context = newContext()) {
  const document = /<html[\s>]|<body[\s>]/i.test(html) ? parse(html) : parseFragment(html);
  const body = find(document, 'body') ?? document;
  return { blocks: blocksOf(body, context), context, title: textOf(find(document, 'title') ?? { nodeName: '#text', value: '' }).trim() };
}

module.exports = { find, htmlToBlocks, newContext, textOf };
