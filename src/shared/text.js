'use strict';
// Shared by the main process and the window, so the count on screen and the saved count can't disagree.

const BLOCK_SEPARATOR = '\n';
const CHARACTER_SCRIPTS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

function textOfNode(node) {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return BLOCK_SEPARATOR;
  const children = node.content ?? [];
  const inline = children.some((child) => child.type === 'text' || child.type === 'hardBreak');
  return children.map(textOfNode).join(inline ? '' : BLOCK_SEPARATOR);
}

// A chapter body is a saved editor document. Anything else is treated as plain text, so nothing is ever unreadable.
function parseDocument(body) {
  if (typeof body !== 'string' || !body.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(body);
    return parsed?.type === 'doc' ? parsed : null;
  } catch {
    return null;
  }
}

function plainText(body) {
  const document = typeof body === 'string' ? parseDocument(body) : body;
  if (document) return textOfNode(document);
  return typeof body === 'string' ? body : '';
}

// Words are split on spaces and dashes, as a writer would count them: "well-known" is one word, "wait—what" is two.
// Chinese and Japanese have no spaces, so each character counts as a word, as Word does.
function countWords(text) {
  const characters = text.match(CHARACTER_SCRIPTS)?.length ?? 0;
  const words = text
    .replace(CHARACTER_SCRIPTS, ' ')
    .split(/[\s–—]+/u)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return characters + words;
}

function documentFromText(text) {
  const paragraphs = text.split(/\r?\n/).map((line) => ({
    type: 'paragraph',
    ...(line ? { content: [{ type: 'text', text: line }] } : {}),
  }));
  return { type: 'doc', content: paragraphs };
}

function toDocument(body) {
  return parseDocument(body) ?? documentFromText(body ?? '');
}

module.exports = { countWords, documentFromText, parseDocument, plainText, toDocument };
