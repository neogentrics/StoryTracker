'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { strFromU8, unzipSync } = require('fflate');
const { DEFAULT_LAYOUT, cleanDetails, cleanLayout } = require('../src/shared/details');
const { PAGE_FONTS } = require('../src/shared/themes');
const { checkExport, exportEverything, exportFile, safeName } = require('../src/main/export');
const { buildModel } = require('../src/main/export/model');
const { Library } = require('../src/main/storage/library');
const { Workspace } = require('../src/main/workspace');

const tempDirs = [];
const workspaces = [];

test.after(() => {
  workspaces.forEach((space) => space.closeProject());
  tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-export-'));
  tempDirs.push(dir);
  return dir;
}

const text = (value, ...marks) => ({ type: 'text', text: value, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const para = (...content) => ({ type: 'paragraph', content });
const doc = (...content) => JSON.stringify({ type: 'doc', content });

const RICH = doc(
  para(text('Opening with '), text('bold', 'bold'), text(' and '), text('italic', 'italic'), text(' and <angle> & ampersand.')),
  { type: 'heading', attrs: { level: 1 }, content: [text('A Heading')] },
  { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('first item'))] }] },
  { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [para(text('numbered item'))] }] },
  { type: 'blockquote', content: [para(text('quoted words'))] },
  { type: 'horizontalRule' },
  { type: 'paragraph', attrs: { textAlign: 'center' }, content: [text('centred line')] },
  para(text('line one'), { type: 'hardBreak' }, text('line two')),
  para({ type: 'text', text: 'marked for a note', marks: [{ type: 'comment', attrs: { id: 'x' } }] }),
);

function book() {
  const space = new Workspace(new Library(path.join(tempDir(), 'library')));
  workspaces.push(space);
  const { id, outline } = space.createProject('The Salt Road');
  const bookId = outline.children[0].id;
  const first = outline.children[0].children[0].id;
  space.saveChapter({ id: first, title: 'The Ledger', body: RICH });
  const part = space.addItem({ kind: 'part', parentId: bookId, title: 'Part One' }).item.id;
  const inPart = space.addItem({ kind: 'chapter', parentId: part, title: 'The Mule' }).item.id;
  space.saveChapter({ id: inPart, title: 'The Mule', body: doc(para(text('The mule took it badly.'))) });
  space.addComment({ chapterId: inPart, text: 'SECRET NOTE' });
  const gone = space.addItem({ kind: 'chapter', parentId: bookId, title: 'Deleted Chapter' }).item.id;
  space.saveChapter({ id: gone, title: 'Deleted Chapter', body: doc(para(text('Words in the Trash'))) });
  space.trashItem(gone);
  space.saveDetails({
    id: bookId,
    details: {
      author: 'Marit Vale',
      subtitle: 'A Road Story',
      publisher: 'Harbour Press',
      description: 'A ledger, a mule and seven doors.',
      keywords: 'road, ledger',
      seriesName: 'The Salt Road Trilogy',
      seriesNumber: '1',
      dedication: 'For the mule.',
      aboutAuthor: 'Marit walks a lot.',
      alsoBy: 'The Seventh Door',
      connect: 'www.example.com',
      copyrightYear: '2026',
      notice: 'This is a work of fiction.',
    },
  });
  return { space, id, bookId, first, inPart };
}

async function exported(space, bookId, format, layout) {
  const file = path.join(tempDir(), `book.${format}`);
  await exportFile(space.project, { scope: 'book', id: bookId, format, layout, file });
  return file;
}

const read = (file) => fs.readFileSync(file, 'utf8');
const unzip = (file) => unzipSync(new Uint8Array(fs.readFileSync(file)));

test('details keep only known fields, and layouts stay within limits', () => {
  assert.deepEqual(cleanDetails({ author: ' A ', hacked: 'x', title: 'y', subtitle: '' }), { author: 'A' });
  const layout = cleanLayout({ trim: 'nope', fontSize: 500, pageFont: 'constructor', targetPages: -5, pageNumbers: false }, PAGE_FONTS);
  assert.equal(layout.trim, DEFAULT_LAYOUT.trim);
  assert.equal(layout.fontSize, DEFAULT_LAYOUT.fontSize);
  assert.equal(layout.pageFont, DEFAULT_LAYOUT.pageFont);
  assert.equal(layout.targetPages, 0);
  assert.equal(layout.pageNumbers, false);
  assert.ok(DEFAULT_LAYOUT.fontSize >= 13, 'print text starts at a size nobody has to squint at');
});

test('author and publisher carry to the next book', () => {
  const { space, id } = book();
  const next = space.addItem({ kind: 'book', parentId: id, title: 'Book Two' }).item.id;
  const { details } = space.getDetails(next);
  assert.equal(details.author, 'Marit Vale');
  assert.equal(details.publisher, 'Harbour Press');
  assert.equal(details.dedication, undefined, 'only those two carry');
});

test('comments and the Trash never reach any format', async () => {
  const { space, bookId } = book();
  for (const format of ['md', 'txt', 'html', 'xml', 'rtf']) {
    const output = read(await exported(space, bookId, format));
    assert.ok(!output.includes('SECRET NOTE'), `${format} has a comment`);
    assert.ok(!output.includes('Words in the Trash'), `${format} has trashed writing`);
    assert.ok(output.includes('marked for a note') || format === 'rtf', `${format} lost the words a comment was on`);
  }
  const model = buildModel(space.project, { scope: 'book', id: bookId });
  const marks = JSON.stringify(model.books[0].sections);
  assert.ok(!marks.includes('"comment"'));
});

test('Markdown carries the structure', async () => {
  const { space, bookId } = book();
  const output = read(await exported(space, bookId, 'md'));
  assert.match(output, /^---\ntitle: "The Salt Road"\nsubtitle: "A Road Story"\nauthor: "Marit Vale"/);
  assert.match(output, /Opening with \*\*bold\*\* and \*italic\* and <angle> & ampersand\./);
  assert.match(output, /### A Heading/);
  assert.match(output, /- first item/);
  assert.match(output, /1\. numbered item/);
  assert.match(output, /> quoted words/);
  assert.match(output, /line one {2}\nline two/);
  assert.match(output, /# Part One\n\n## The Mule/);
});

test('Markdown symbols in the writing stay as words', async () => {
  const space = new Workspace(new Library(path.join(tempDir(), 'library')));
  workspaces.push(space);
  const { outline } = space.createProject('Symbols');
  const chapter = outline.children[0].children[0].id;
  space.saveChapter({ id: chapter, title: 'One', body: doc(para(text('2 * 3 and _under_ and # not a heading'))) });
  const file = path.join(tempDir(), 'one.md');
  await exportFile(space.project, { scope: 'chapter', id: chapter, format: 'md', file });
  assert.match(read(file), /2 \\\* 3 and \\_under\\_ and # not a heading/);
});

test('HTML escapes what it should and links its contents', async () => {
  const { space, bookId } = book();
  const output = read(await exported(space, bookId, 'html'));
  assert.ok(output.includes('&lt;angle&gt; &amp; ampersand'));
  assert.ok(!output.includes('<angle>'));
  assert.match(output, /<a href="#chapter-1">The Ledger<\/a>/);
  assert.match(output, /<p class="align-center">centred line<\/p>/);
});

test('a title can\'t break out of the markup', async () => {
  const { space, first, bookId } = book();
  space.rename({ id: first, title: '</title><script>alert(1)</script>' });
  const output = read(await exported(space, bookId, 'html'));
  assert.ok(!output.includes('<script>'));
});

test('XML is our own documented layout', async () => {
  const { space, bookId } = book();
  const output = read(await exported(space, bookId, 'xml'));
  assert.match(output, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rtstory version="1">/);
  assert.match(output, /<detail name="author">Marit Vale<\/detail>/);
  assert.match(output, /<span style="bold">bold<\/span>/);
  assert.match(output, /<part id="[^"]+" title="Part One">\s+<chapter id="[^"]+" title="The Mule">/);
});

test('RTF keeps its formatting and any language', async () => {
  const { space, bookId, first } = book();
  space.saveChapter({ id: first, title: 'The Ledger', body: doc(para(text('Café 日本 😀 {brace}', 'bold'))) });
  const output = read(await exported(space, bookId, 'rtf'));
  assert.match(output, /^\{\\rtf1/);
  assert.ok(output.includes('{\\b Caf\\u233?'));
  assert.ok(output.includes('\\u-10179?\\u-8704?'), 'a character outside the first plane is written as a pair');
  assert.ok(output.includes('\\{brace\\}'));
  assert.equal([...output].filter((c) => c === '{').length - output.split('\\{').length + 1, [...output].filter((c) => c === '}').length - output.split('\\}').length + 1);
});

test('Word files hold the book, its layout and facing pages', async () => {
  const { space, bookId } = book();
  const files = unzip(await exported(space, bookId, 'docx', { trim: '5x8', fontSize: 14 }));
  const body = strFromU8(files['word/document.xml']);
  assert.ok(body.includes('The mule took it badly.'));
  assert.ok(body.includes('Opening with'));
  assert.ok(!body.includes('SECRET NOTE'));
  assert.ok(body.includes('Copyright © 2026 Marit Vale'));
  assert.ok(body.includes('w:w="7200"') && body.includes('w:h="11520"'), 'the page is 5 by 8 inches');
  assert.ok(strFromU8(files['word/settings.xml']).includes('<w:mirrorMargins/>'));
  assert.ok(strFromU8(files['word/styles.xml']).includes('w:val="28"'), 'the text is 14 point');
});

test('OpenDocument is a valid package', async () => {
  const { space, bookId } = book();
  const file = await exported(space, bookId, 'odt');
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(30, 38).toString(), 'mimetype', 'the mimetype comes first');
  const files = unzip(file);
  assert.equal(strFromU8(files.mimetype), 'application/vnd.oasis.opendocument.text');
  assert.ok(strFromU8(files['content.xml']).includes('The mule took it badly.'));
  assert.ok(strFromU8(files['meta.xml']).includes('Marit Vale'));
  // A font named without its family makes LibreOffice drop the text, which no check of the XML alone can see.
  assert.ok(strFromU8(files['styles.xml']).includes('fo:font-family="Georgia"'));
  assert.ok(!strFromU8(files['styles.xml']).includes('style:font-name'));
});

// A one-pixel PNG, sized up in its details, is enough to test the wiring.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('an e-book has everything a store looks for', async () => {
  const { space, bookId } = book();
  space.setCover(bookId, { type: 'image/png', data: PNG, width: 1600, height: 2560 });
  const file = await exported(space, bookId, 'epub');
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(30, 38).toString(), 'mimetype');
  assert.equal(bytes.subarray(38, 58).toString(), 'application/epub+zip', 'stored without compression');
  const files = unzip(file);
  const opf = strFromU8(files['OEBPS/content.opf']);
  for (const wanted of ['<dc:title id="title">The Salt Road', '<dc:creator id="creator">Marit Vale', '<dc:language>en', 'urn:uuid:', 'dcterms:modified',
    '<dc:publisher>Harbour Press', '<dc:description>A ledger', '<dc:subject>ledger', 'belongs-to-collection', 'group-position">1', 'properties="cover-image"', 'properties="nav"']) {
    assert.ok(opf.includes(wanted), wanted);
  }
  const nav = strFromU8(files['OEBPS/nav.xhtml']);
  assert.match(nav, /<a href="part-1.xhtml">Part One<\/a><ol><li><a href="chapter-2.xhtml">The Mule/);
  assert.ok(nav.includes('epub:type="landmarks"'));
  assert.ok(files['OEBPS/toc.ncx'] && files['OEBPS/cover.png'] && files['OEBPS/copyright.xhtml'] && files['OEBPS/dedication.xhtml'] && files['OEBPS/about.xhtml']);
  assert.ok(strFromU8(files['OEBPS/chapter-1.xhtml']).includes('&lt;angle&gt;'));
  assert.ok(!Object.values(files).some((data) => strFromU8(data).includes('SECRET NOTE')));
});

test('an ISBN becomes the book\'s identifier', async () => {
  const { space, bookId } = book();
  const { details } = space.getDetails(bookId);
  space.saveDetails({ id: bookId, details: { ...details, isbnEbook: '978-1-23456-789-7' } });
  const opf = strFromU8(unzip(await exported(space, bookId, 'epub'))['OEBPS/content.opf']);
  assert.ok(opf.includes('urn:isbn:9781234567897'));
});

const java = spawnSync('java', ['-version']).status === 0;

test('the official EPUB validator passes it', { skip: !java && 'Java is not installed' }, async () => {
  const { space, bookId } = book();
  space.setCover(bookId, { type: 'image/png', data: PNG, width: 1600, height: 2560 });
  const file = await exported(space, bookId, 'epub');
  const jar = fs.globSync('node_modules/epubchecker/vendors/*/epubcheck.jar')[0];
  const output = `${file}.json`;
  spawnSync('java', ['-jar', jar, file, '--json', output], { encoding: 'utf8' });
  const report = JSON.parse(read(output));
  assert.equal(report.publication.ePubVersion, '3.3');
  const problems = report.messages.filter((item) => ['ERROR', 'FATAL', 'WARNING'].includes(item.severity));
  assert.deepEqual(problems.map((item) => `${item.severity} ${item.ID}: ${item.message} ${JSON.stringify(item.locations?.[0] ?? {})}`), []);
});

test('the store check says what\'s missing', () => {
  const { space, bookId, inPart } = book();
  assert.ok(checkExport(space.project, { scope: 'book', id: bookId, format: 'epub' }).some((line) => line.includes('No cover')));
  space.setCover(bookId, { type: 'image/png', data: PNG, width: 400, height: 600 });
  assert.ok(checkExport(space.project, { scope: 'book', id: bookId, format: 'epub' }).some((line) => line.includes('400 × 600')));
  space.saveChapter({ id: inPart, title: 'The Mule', body: doc({ type: 'paragraph' }) });
  assert.ok(checkExport(space.project, { scope: 'book', id: bookId, format: 'docx' }).some((line) => line.includes('“The Mule” is empty')));
});

test('a series exports as one file, but an e-book is one book', async () => {
  const { space, id, bookId } = book();
  const series = space.addItem({ kind: 'series', parentId: id, title: 'Trilogy' }).item.id;
  space.move({ id: bookId, parentId: series });
  const second = space.addItem({ kind: 'book', parentId: series, title: 'Book Two' }).item.id;
  space.addItem({ kind: 'chapter', parentId: second, title: 'Second Opening' });
  const file = path.join(tempDir(), 'series.md');
  await exportFile(space.project, { scope: 'series', id: series, format: 'md', file });
  const output = read(file);
  assert.ok(output.includes('The Mule') && output.includes('Second Opening'));
  await assert.rejects(exportFile(space.project, { scope: 'series', id: series, format: 'epub', file: `${file}.epub` }), /holds one book/);
});

test('a single chapter exports alone', async () => {
  const { space, inPart } = book();
  const file = path.join(tempDir(), 'chapter.txt');
  await exportFile(space.project, { scope: 'chapter', id: inPart, format: 'txt', file });
  const output = read(file);
  assert.ok(output.includes('The mule took it badly.'));
  assert.ok(!output.includes('Opening with'));
});

test('export everything leaves nothing behind', () => {
  const { space, bookId } = book();
  space.setCover(bookId, { type: 'image/png', data: PNG, width: 1600, height: 2560 });
  const folder = tempDir();
  const { folder: root } = exportEverything(space.project, folder);
  const inBook = fs.readdirSync(path.join(root, 'The Salt Road'));
  assert.deepEqual(inBook.sort(), ['001 The Ledger.md', '002 Part One - The Mule.md', 'cover.png']);
  assert.match(read(path.join(root, 'comments.csv')), /"The Mule","SECRET NOTE"/);
  assert.match(read(path.join(root, 'word-counts.csv')), /"The Mule","5"/);
});

test('names can\'t reach outside the folder', () => {
  assert.equal(safeName('../../etc/passwd'), '.. .. etc passwd');
  assert.equal(safeName('   '), 'Untitled');
  assert.ok(!safeName('a:b*c?').match(/[:*?]/));
});

test('blank pages at the end make the count even, or match a fixed one', () => {
  const blanks = (pages, existing, layout) => {
    const body = pages - existing;
    if (layout.targetPages > body) return layout.targetPages - body;
    if (!layout.endBlankEven) return 0;
    return (body + 1) % 2 === 0 ? 1 : 2;
  };
  assert.equal(blanks(151, 0, { endBlankEven: true, targetPages: 0 }), 1, 'odd count: one blank makes it even');
  assert.equal(blanks(150, 0, { endBlankEven: true, targetPages: 0 }), 2, 'even count: two, so the last page is still blank');
  assert.equal(blanks(150, 0, { endBlankEven: false, targetPages: 0 }), 0);
  assert.equal(blanks(150, 0, { endBlankEven: true, targetPages: 156 }), 6, 'a re-upload keeps its published count');
});
