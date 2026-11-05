'use strict';
// The sample project: a short made-up story, written for this app, that shows what a book looks like in it.

const paragraph = (...content) => ({ type: 'paragraph', content });
const text = (value, ...marks) => ({ type: 'text', text: value, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const plain = (value) => paragraph(text(value));
const heading = (level, value) => ({ type: 'heading', attrs: { level }, content: [text(value)] });
const doc = (...content) => JSON.stringify({ type: 'doc', content });

const SAMPLE_TITLE = 'Sample: The Salt Road';

const CHAPTERS = [
  {
    part: 'Part One: Leaving',
    title: 'The Ledger',
    body: doc(
      plain('Marit found the ledger under the third stair, which was the stair that had always complained.'),
      paragraph(
        text('The first page held a single line in her grandmother’s hand: '),
        text('Everything owed is written here.', 'italic'),
      ),
      plain('The rest held names, and most of them she knew. The baker. The ferryman. Her own father, twice.'),
      plain('She read until the lamp ran low, then packed the book in her coat and went to wake the mule.'),
    ),
  },
  {
    part: 'Part One: Leaving',
    title: 'The Mule',
    body: doc(
      plain('The mule took the news badly.'),
      plain('It stood in the yard with its ears back while she tied on the bags. It had walked the Salt Road once, years ago, and had made up its mind about the experience.'),
      plain('“Seven names,” Marit told it. “Seven doors, and then we come home.”'),
      plain('The mule breathed out through its nose. Neither of them believed her.'),
    ),
  },
  {
    part: 'Part Two: Try It Yourself',
    title: 'Your Turn',
    body: doc(
      heading(2, 'This chapter is yours'),
      plain('Type anywhere on this page. It saves by itself every few seconds, so there’s no Save button to remember.'),
      paragraph(
        text('Select some words to make them '),
        text('bold', 'bold'),
        text(' or '),
        text('italic', 'italic'),
        text(', or use the buttons above the page.'),
      ),
      plain('If you like Markdown, it works here too. Start a new line with # and a space for a heading, or - and a space for a list.'),
      plain('Drag a chapter in the list to move it. Double-click its name to rename it. When you’re done with this sample, you can remove it from the library.'),
    ),
  },
];

function fillSample(project) {
  const book = project.addItem({ kind: 'book', parentId: project.id, title: 'The Salt Road' });
  const parts = new Map();
  for (const chapter of CHAPTERS) {
    if (!parts.has(chapter.part)) {
      parts.set(chapter.part, project.addItem({ kind: 'part', parentId: book.id, title: chapter.part }));
    }
    project.addItem({
      kind: 'chapter',
      parentId: parts.get(chapter.part).id,
      title: chapter.title,
      body: chapter.body,
    });
  }
}

module.exports = { SAMPLE_TITLE, fillSample };
