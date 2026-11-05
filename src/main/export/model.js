'use strict';
// What every format reads: the books being exported, in reading order, with their details and front and back matter.
// Comments and anything in the Trash never reach this, so they can't reach a file.
const { parseDetails } = require('../../shared/details');
const { findNode } = require('../../shared/outline');
const { toDocument } = require('../../shared/text');

function stripComments(node) {
  const copy = { ...node };
  if (copy.marks) {
    copy.marks = copy.marks.filter((mark) => mark.type !== 'comment');
    if (copy.marks.length === 0) delete copy.marks;
  }
  if (copy.content) copy.content = copy.content.map(stripComments);
  return copy;
}

function sectionsOf(project, node) {
  return node.children.flatMap((child) => {
    if (child.kind === 'part') return [{ type: 'part', id: child.id, title: child.title }, ...sectionsOf(project, child)];
    if (child.kind !== 'chapter') return [];
    const item = project.getItem(child.id);
    return [{ type: 'chapter', id: child.id, title: child.title, document: stripComments(toDocument(item.body)) }];
  });
}

function bookOf(project, node, projectDetails) {
  const item = project.getItem(node.id);
  const details = { ...projectDetails, ...parseDetails(item.details) };
  const chapterOnly = node.kind === 'chapter';
  const sections = chapterOnly
    ? [{ type: 'chapter', id: node.id, title: node.title, document: stripComments(toDocument(item.body)) }]
    : sectionsOf(project, node);
  return {
    id: node.id,
    title: node.title,
    details,
    language: details.language || 'en',
    cover: chapterOnly ? null : project.cover(node.id),
    sections,
  };
}

function booksIn(node) {
  return node.kind === 'book' ? [node] : node.children.flatMap(booksIn);
}

function buildModel(project, { scope, id }) {
  const outline = project.outline();
  const projectDetails = parseDetails(project.getItem(project.id)?.details);
  const node = scope === 'project' ? outline : findNode(outline, id);
  if (!node) throw new Error("That isn't in this project.");
  const nodes = node.kind === 'chapter' ? [node] : booksIn(node);
  if (nodes.length === 0) throw new Error('There is nothing to export yet.');
  const books = nodes.map((item) => bookOf(project, item, projectDetails));
  const generated = project.now();
  return { title: node.title, books, generated, year: String(generated.getFullYear()) };
}

const authorOf = (book) => book.details.author ?? '';

function copyrightLines(book, year) {
  const { details } = book;
  const holder = details.copyrightHolder || details.author;
  const lines = [];
  if (holder) lines.push(`Copyright © ${details.copyrightYear || year} ${holder}`);
  lines.push('All rights reserved.');
  if (details.notice) lines.push(...details.notice.split('\n'));
  if (details.edition) lines.push(details.edition);
  if (details.publisher) lines.push(`Published by ${details.publisher}`);
  return lines;
}

const lines = (text) => (text ? text.split('\n').map((line) => line.trim()).filter(Boolean) : []);

// Front and back matter as plain data, so every format lays out the same pages. A single chapter gets none.
function matterOf(book) {
  const { details } = book;
  return {
    dedication: lines(details.dedication),
    acknowledgements: lines(details.acknowledgements),
    aboutAuthor: lines(details.aboutAuthor),
    alsoBy: lines(details.alsoBy),
    connect: lines(details.connect),
  };
}

const chapterCount = (book) => book.sections.filter((section) => section.type === 'chapter').length;

// What a store is likely to refuse or complain about. Nothing here stops an export.
function checkBook(book, { ebook = false } = {}) {
  const problems = [];
  if (!book.details.author) problems.push('No author is set.');
  if (chapterCount(book) === 0) problems.push('This book has no chapters.');
  for (const section of book.sections) {
    const empty = section.type === 'chapter' && !section.document.content?.some((block) => block.content?.length);
    if (empty) problems.push(`“${section.title}” is empty.`);
  }
  if (ebook) {
    if (!book.cover) problems.push('No cover image is set. Most stores ask for one.');
    else if (book.cover.width < 1000 || book.cover.height < 1600) {
      problems.push(`The cover is ${book.cover.width} × ${book.cover.height} pixels. Stores ask for at least 1000 × 1600, and KDP suggests 1600 × 2560.`);
    }
    if (!book.details.description) problems.push('No description is set.');
  }
  return problems;
}

module.exports = { authorOf, buildModel, chapterCount, checkBook, copyrightLines, matterOf };
