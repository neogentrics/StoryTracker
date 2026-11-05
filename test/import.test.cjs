'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const docx = require('docx');
const { strToU8, zipSync } = require('fflate');
const { exportFile } = require('../src/main/export');
const { Importer } = require('../src/main/import');
const { applyCleanups, findCleanups } = require('../src/main/import/cleanup');
const { htmlToBlocks } = require('../src/main/import/html');
const { parseRtf } = require('../src/main/import/rtf');
const { splitBlocks, splitOptions } = require('../src/main/import/split');
const { iwaBytes, sentencesIn } = require('../src/main/import/formats');
const { Library } = require('../src/main/storage/library');
const { Workspace } = require('../src/main/workspace');
const { findNode } = require('../src/shared/outline');
const { plainText } = require('../src/shared/text');

const tempDirs = [];
const workspaces = [];

test.after(() => {
  workspaces.forEach((space) => space.closeProject());
  tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-import-'));
  tempDirs.push(dir);
  return dir;
}

function project(title = 'Import Test') {
  const space = new Workspace(new Library(path.join(tempDir(), 'library')));
  workspaces.push(space);
  const { id, outline } = space.createProject(title);
  return { space, id, bookId: outline.children[0].id, chapter: outline.children[0].children[0].id };
}

function write(name, content) {
  const file = path.join(tempDir(), name);
  fs.writeFileSync(file, content);
  return file;
}

const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const heading = (level, text) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
const titles = (sections) => sections.map((section) => section.title);

async function importInto(space, file, options = {}) {
  const importer = new Importer();
  const first = await importer.inspect(file);
  const accepted = options.accepted ?? first.findings.map((item) => item.id);
  const result = importer.commit(space, { token: first.token, accepted, mode: options.mode ?? first.mode, target: options.target ?? { kind: 'new', parentId: space.open().id } });
  return { ...result, inspected: first };
}

const body = (space, id) => plainText(space.loadChapter(id).body);

test('HTML becomes only what the editor understands', () => {
  const { blocks } = htmlToBlocks(`<h2 style="text-align:center">Title</h2><p>One <b>bold</b> and <span style="font-style:italic">italic</span><br/>next</p>
    <script>alert(1)</script><ul><li>Item</li></ul><blockquote><p>Quoted</p></blockquote><hr><img src="x.png"><p onclick="x()"><a href="http://x">link text</a></p>`);
  assert.deepEqual(blocks.map((block) => block.type), ['heading', 'paragraph', 'bulletList', 'blockquote', 'horizontalRule', 'paragraph']);
  assert.equal(blocks[0].attrs.textAlign, 'center');
  assert.deepEqual(blocks[1].content.map((node) => node.marks?.[0].type ?? node.type), ['text', 'bold', 'text', 'italic', 'hardBreak', 'text'].map((value) => value));
  assert.ok(!JSON.stringify(blocks).includes('alert'), 'scripts never get through');
  assert.ok(!JSON.stringify(blocks).includes('onclick'));
  assert.equal(blocks.at(-1).content[0].text, 'link text');
});

test('RTF keeps formatting, special characters and the old app\'s chapters', () => {
  const rtf = Buffer.from('{\\rtf1\\ansi{\\fonttbl{\\f0 Georgia;}}{\\*\\generator Word;}\\f0\\fs24 Plain {\\b bold} {\\i italic}\\par\\qc Centred caf\\\'e9 \\u26085?\\par{\\pard\\b\\fs32 Chapter One\\par}{\\pict abcdef}Last\\par}', 'latin1');
  const { blocks, pictures } = parseRtf(rtf);
  assert.equal(pictures, 1);
  assert.equal(plainText({ type: 'doc', content: blocks }), 'Plain bold italic\nCentred café 日\nChapter One\nLast');
  assert.equal(blocks[0].content[1].marks[0].type, 'bold');
  assert.equal(blocks[1].attrs.textAlign, 'center');
  assert.equal(blocks[2].type, 'heading');
  assert.throws(() => parseRtf(Buffer.from('not rtf')), /doesn't look like RTF/);
});

test('a long file splits where it should', () => {
  const blocks = [para('Opening words.'), heading(1, 'Chapter One'), para('First.'), heading(2, 'A scene'), para('More.'), heading(1, 'Chapter Two'), para('Second.')];
  assert.deepEqual(splitOptions(blocks).map((option) => option.mode), ['pattern', 'h1', 'h2', 'none']);
  const byMain = splitBlocks(blocks, 'h1', 'My Book');
  assert.deepEqual(titles(byMain), ['My Book', 'Chapter One', 'Chapter Two']);
  assert.equal(byMain[1].blocks.length, 3, 'a subheading stays inside its chapter');
  assert.deepEqual(titles(splitBlocks(blocks, 'none', 'My Book')), ['My Book']);
});

test('chapter titles are found even with no heading styles', () => {
  const blocks = [para('CHAPTER 1'), para('Words.'), para('Chapter Two: The Road'), para('Words.'), para('Epilogue'), para('Words.')];
  assert.deepEqual(titles(splitBlocks(blocks, 'pattern', 'Book')), ['CHAPTER 1', 'Chapter Two: The Road', 'Epilogue']);
  assert.equal(splitOptions([para('Just a line'), para('Another')]).length, 1);
});

test('a part heading becomes a part', () => {
  const blocks = [heading(1, 'Part One'), heading(1, 'Chapter 1'), para('Words.')];
  const sections = splitBlocks(blocks, 'h1', 'Book');
  assert.deepEqual(sections.map((section) => section.type), ['part', 'chapter']);
});

test('AI clean-up finds each thing and only changes what was accepted', () => {
  const text = [
    "Here's your chapter:",
    '',
    '**Chapter One**',
    '',
    'It was a  dark night and she said "stop" and didn\'t.',
    '',
    '***',
    '',
    'Would you like me to continue with Chapter Two?',
  ].join('\n');
  const found = findCleanups(text);
  const labels = found.map((item) => item.label);
  assert.ok(labels.includes('Chat text at the top') && labels.includes('Chat text at the bottom'));
  assert.ok(labels.includes('Bold used as a heading') && labels.includes('A line of symbols'));
  assert.ok(labels.includes('Straight quotes') && labels.includes('Doubled spaces'));

  assert.equal(applyCleanups(text, found, []), text, 'nothing is touched unless accepted');
  const all = applyCleanups(text, found, found.map((item) => item.id));
  assert.equal(all, '## Chapter One\n\nIt was a dark night and she said “stop” and didn’t.');
});

test('text wrapped in a code block is unwrapped, and deep headings move up', () => {
  const text = '```markdown\n### One\n\nWords here.\n\n#### Two\n```';
  const found = findCleanups(text);
  const cleaned = applyCleanups(text, found, found.map((item) => item.id));
  assert.equal(cleaned, '# One\n\nWords here.\n\n## Two');
});

test('ordinary writing isn\'t flagged as chat, and a scene break stays', () => {
  assert.deepEqual(findCleanups('The road ran white.\n\nShe walked on.'), []);
  assert.deepEqual(findCleanups('Sure, he thought, that was it.\n\nThe road ran on.'), []);
  assert.deepEqual(findCleanups('First scene.\n\n***\n\nSecond scene.'), []);
});

test('Markdown comes in with its details and chapters', async () => {
  const { space } = project();
  const file = write('novel.md', '---\ntitle: "The Salt Road"\nauthor: Marit Vale\n---\n\n# Chapter 1\n\nIt *began* with **salt**.\n\n# Chapter 2\n\nIt went on.\n');
  const { bookId, first, chapters } = await importInto(space, file);
  assert.equal(chapters, 2);
  const book = findNode(space.outline(), bookId);
  assert.equal(book.title, 'The Salt Road');
  assert.equal(space.getDetails(bookId).details.author, 'Marit Vale');
  assert.equal(body(space, first), 'It began with salt.');
  const saved = JSON.parse(space.loadChapter(first).body);
  assert.ok(JSON.stringify(saved).includes('"italic"') && JSON.stringify(saved).includes('"bold"'));
});

test('accepting a clean-up changes the words that come in', async () => {
  const { space } = project();
  const file = write('ai.md', "Sure! Here's the chapter:\n\n# One\n\nThe story.\n\nLet me know if you'd like changes.\n");
  const importer = new Importer();
  const first = await importer.inspect(file);
  assert.equal(first.findings.length >= 2, true);
  const kept = importer.preview({ token: first.token, accepted: [] });
  const cleaned = importer.preview({ token: first.token, accepted: first.findings.map((item) => item.id) });
  assert.ok(kept.importedWords > cleaned.importedWords);
  const made = importer.commit(space, { token: first.token, accepted: first.findings.map((item) => item.id), mode: cleaned.mode, target: { kind: 'new', parentId: space.open().id } });
  assert.equal(body(space, made.first), 'The story.');
});

test('plain text in any encoding', async () => {
  const { space } = project();
  const cases = [
    ['utf8.txt', Buffer.from('Café first.\n\nSecond one.')],
    ['utf16.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Café first.\n\nSecond one.', 'utf16le')])],
    ['old.txt', Buffer.from('Café first.\n\nSecond one.', 'latin1')],
  ];
  for (const [name, data] of cases) {
    const { first } = await importInto(space, write(name, data));
    assert.equal(body(space, first), 'Café first.\nSecond one.', name);
  }
});

async function wordFile() {
  const comment = 0;
  const document = new docx.Document({
    comments: { children: [{ id: comment, author: 'Editor', date: new Date(), children: [new docx.Paragraph({ children: [new docx.TextRun('Check this name')] })] }] },
    sections: [{
      children: [
        new docx.Paragraph({ style: 'Title', children: [new docx.TextRun('A Word Book')] }),
        new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_1, children: [new docx.TextRun('Chapter 1')] }),
        new docx.Paragraph({ children: [new docx.TextRun('Plain and '), new docx.TextRun({ text: 'italic', italics: true }), new docx.TextRun(' words.')] }),
        new docx.Paragraph({ children: [new docx.CommentRangeStart(comment), new docx.TextRun('Marit'), new docx.CommentRangeEnd(comment), new docx.TextRun({ children: [new docx.CommentReference(comment)] }), new docx.TextRun(' walked.')] }),
        new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_1, children: [new docx.TextRun('Chapter 2')] }),
        new docx.Paragraph({ children: [new docx.TextRun('The end.')] }),
      ],
    }],
  });
  return write('book.docx', await docx.Packer.toBuffer(document));
}

test('a Word manuscript: title, chapters, italics and comments, with every word counted', async () => {
  const { space } = project();
  const file = await wordFile();
  const importer = new Importer();
  const first = await importer.inspect(file);
  assert.equal(first.title, 'A Word Book');
  assert.deepEqual(first.sections.map((section) => section.title), ['Chapter 1', 'Chapter 2']);
  assert.equal(first.comments, 1);
  assert.equal(first.importedWords + first.titleWords, first.originalWords, 'every word is accounted for');
  const made = importer.commit(space, { token: first.token, accepted: [], mode: first.mode, target: { kind: 'new', parentId: space.open().id } });
  const saved = space.loadChapter(made.first);
  assert.ok(saved.body.includes('"italic"'));
  const [note] = space.listComments(made.first);
  assert.equal(note.text, 'Check this name');
  assert.ok(saved.body.includes(note.id), 'the comment is on the words it was on');
});

test('a template\'s own styles count: chapters, contents, centring and pictures', async () => {
  const picture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const document = new docx.Document({
    styles: { paragraphStyles: [{ id: 'BookTitle', name: 'Book Title' }, { id: 'ChapterHead', name: 'Chapter Head' }, { id: 'TOC1', name: 'TOC 1' }] },
    sections: [{
      children: [
        new docx.Paragraph({ style: 'BookTitle', children: [new docx.TextRun('The Book')] }),
        new docx.Paragraph({ style: 'TOC1', children: [new docx.TextRun('The Start'), new docx.TextRun({ children: [new docx.Tab(), '3'] })] }),
        new docx.Paragraph({ style: 'ChapterHead', children: [new docx.TextRun('The Start')] }),
        new docx.Paragraph({ children: [new docx.TextRun('Words here.')] }),
        new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun('* * *')] }),
        new docx.Paragraph({ children: [new docx.ImageRun({ type: 'png', data: picture, transformation: { width: 10, height: 10 } })] }),
        new docx.Paragraph({ style: 'ChapterHead', children: [new docx.TextRun('The End')] }),
        new docx.Paragraph({ children: [new docx.TextRun({ text: 'Underlined', underline: {} })] }),
      ],
    }],
  });
  const file = write('styled.docx', await docx.Packer.toBuffer(document));
  const { space } = project();
  const importer = new Importer();
  const first = await importer.inspect(file);
  assert.equal(first.title, 'The Book');
  assert.deepEqual(first.sections.map((section) => section.title), ['The Start', 'The End']);
  assert.equal(first.importedWords + first.titleWords, first.originalWords, 'a contents page isn\'t counted as missing');
  assert.ok(first.notes.some((note) => /1 picture won/.test(note)));
  const made = importer.commit(space, { token: first.token, accepted: [], mode: first.mode, target: { kind: 'new', parentId: space.open().id } });
  const saved = JSON.parse(space.loadChapter(made.first).body);
  assert.equal(saved.content[1].attrs.textAlign, 'center');
});

test('OpenDocument headings can be styles, and contents and deleted text stay out', async () => {
  const content = `<?xml version="1.0"?><office:document-content xmlns:office="o" xmlns:text="t" xmlns:style="s" xmlns:fo="f">
    <office:automatic-styles>
      <style:style style:name="P1" style:family="paragraph" style:parent-style-name="ChapterHead"/>
      <style:style style:name="T1" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
    </office:automatic-styles>
    <office:body><office:text>
      <text:tracked-changes><text:changed-region><text:deletion><text:p>Deleted words</text:p></text:deletion></text:changed-region></text:tracked-changes>
      <text:table-of-content><text:index-body><text:p>One 3</text:p></text:index-body></text:table-of-content>
      <text:p text:style-name="P1">One</text:p><text:p>Some <text:span text:style-name="T1">slanted</text:span> words.</text:p>
      <text:p text:style-name="P1">Two</text:p><text:p>More.</text:p>
    </office:text></office:body></office:document-content>`;
  const file = write('styled.odt', Buffer.from(zipSync({ 'content.xml': strToU8(content) })));
  const { space } = project();
  const { first, inspected } = await importInto(space, file);
  assert.deepEqual(inspected.sections.map((section) => section.title), ['One', 'Two']);
  assert.equal(body(space, first), 'Some slanted words.');
  assert.ok(space.loadChapter(first).body.includes('"italic"'));
});

test('a Unicode character in a skipped part of an RTF file doesn\'t eat real text', () => {
  const { blocks } = parseRtf(Buffer.from('{\\rtf1{\\info{\\title Caf\\u233?}}The road.\\par}', 'latin1'));
  assert.equal(blocks[0].content[0].text, 'The road.');
});

test('the old Word format gets a helpful answer', async () => {
  await assert.rejects(new Importer().inspect(write('old.doc', 'x')), /Save As/);
});

test('everything the app exports comes back in', async () => {
  const { space, bookId, chapter } = project('Round Trip');
  space.saveChapter({ id: chapter, title: 'First', body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Plain and ' }, { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }, { type: 'text', text: ' words.' }] }] }) });
  const second = space.addItem({ kind: 'chapter', parentId: bookId, title: 'Second' }).item.id;
  space.saveChapter({ id: second, title: 'Second', body: JSON.stringify({ type: 'doc', content: [para('Café and more words here.')] }) });
  space.saveDetails({ id: bookId, details: { author: 'Marit Vale', publisher: 'Harbour Press' } });

  for (const format of ['md', 'html', 'docx', 'odt', 'epub', 'rtf']) {
    const file = path.join(tempDir(), `book.${format}`);
    await exportFile(space.project, { scope: 'book', id: bookId, format, file });
    const importer = new Importer();
    const first = await importer.inspect(file);
    const names = first.sections.map((section) => section.title);
    assert.ok(names.includes('First') && names.includes('Second'), `${format}: ${names.join(', ')}`);
    assert.equal(first.sections.find((section) => section.title === 'Second').words, 5, `${format} kept the words`);
  }
});

test('an e-book comes in with its cover and details', async () => {
  const { space, bookId } = project('EPUB Source');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  space.setCover(bookId, { type: 'image/png', data: png, width: 1, height: 1 });
  space.saveDetails({ id: bookId, details: { author: 'Marit Vale', description: 'A road story.' } });
  const file = path.join(tempDir(), 'book.epub');
  await exportFile(space.project, { scope: 'book', id: bookId, format: 'epub', file });

  const other = project('Destination');
  const { bookId: made } = await importInto(other.space, file);
  const { details, cover } = other.space.getDetails(made);
  assert.equal(details.author, 'Marit Vale');
  assert.equal(details.description, 'A road story.');
  assert.deepEqual([cover.width, cover.height], [1, 1]);
});

test('Scrivener: folders become parts, and documents become chapters', async () => {
  const dir = path.join(tempDir(), 'Novel.scriv');
  const place = (id, rtf) => {
    fs.mkdirSync(path.join(dir, 'Files', 'Data', id), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Files', 'Data', id, 'content.rtf'), rtf);
  };
  place('AAA-1', '{\\rtf1\\ansi First scene.\\par}');
  place('BBB-2', '{\\rtf1\\ansi Second scene.\\par}');
  fs.writeFileSync(path.join(dir, 'Novel.scrivx'), `<?xml version="1.0"?><ScrivenerProject><Binder>
    <BinderItem UUID="D" Type="DraftFolder"><Title>Manuscript</Title><Children>
      <BinderItem UUID="F" Type="Folder"><Title>Part One</Title><Children>
        <BinderItem UUID="AAA-1" Type="Text"><Title>The Start</Title></BinderItem>
        <BinderItem UUID="BBB-2" Type="Text"><Title>The Next</Title></BinderItem>
      </Children></BinderItem>
    </Children></BinderItem>
    <BinderItem UUID="R" Type="ResearchFolder"><Title>Research</Title></BinderItem>
  </Binder></ScrivenerProject>`);
  const first = await new Importer().inspect(path.join(dir, 'Novel.scrivx'));
  assert.equal(first.format, 'Scrivener');
  assert.deepEqual(first.sections.map((section) => `${section.type}:${section.title}`), ['part:Part One', 'chapter:The Start', 'chapter:The Next']);
  assert.equal(first.importedWords, 4);
});

test('a Scrivener binder can\'t reach outside its folder', async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'x.scrivx'), '<ScrivenerProject><Binder><BinderItem Type="DraftFolder"><Children><BinderItem UUID="../../secret" Type="Text"><Title>T</Title></BinderItem></Children></BinderItem></Binder></ScrivenerProject>');
  await assert.rejects(new Importer().inspect(path.join(dir, 'x.scrivx')), /No writing was found/);
});

test('a PDF gives up its words, without headers or page numbers', async () => {
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const words = [];
  for (let number = 1; number <= 5; number += 1) {
    const page = pdf.addPage([400, 600]);
    page.drawText('The Salt Road', { x: 150, y: 570, size: 10, font });
    if (number === 1 || number === 4) page.drawText(`Chapter ${number}`, { x: 150, y: 520, size: 22, font });
    const line = `Page ${number} has this line of ordinary words on it.`;
    words.push(line);
    page.drawText(line, { x: 40, y: 480, size: 12, font });
    page.drawText(String(number), { x: 195, y: 30, size: 10, font });
  }
  const file = write('book.pdf', Buffer.from(await pdf.save()));
  const first = await new Importer().inspect(file);
  assert.equal(first.format, 'PDF');
  assert.deepEqual(first.sections.map((section) => section.title), ['Chapter 1', 'Chapter 4']);
  assert.equal(first.importedWords, words.join(' ').split(' ').length);
  assert.ok(first.notes.some((note) => /check this one/.test(note)));
});

test('Pages: sentences are found inside its records', () => {
  const sentence = 'The road ran white under the moon and she kept on walking.';
  const literal = Buffer.concat([Buffer.from([sentence.length, 240, sentence.length - 1]), Buffer.from(sentence)]);
  const chunk = Buffer.concat([Buffer.from([0, literal.length & 255, 0, 0]), literal]);
  const bytes = iwaBytes(chunk);
  assert.deepEqual(sentencesIn(bytes), [sentence]);
  assert.deepEqual(sentencesIn(Buffer.from('com.apple.iwork.pages some_identifier_with_no_spaces')), []);
});

test('a Pages file with nothing readable says what to do', async () => {
  const file = write('book.pages', Buffer.from(zipSync({ 'Metadata/Properties.plist': strToU8('x') })));
  await assert.rejects(new Importer().inspect(file), /Export To/);
});

test('a broken file is refused, and nothing is left half done', async () => {
  const { space, bookId } = project();
  await assert.rejects(new Importer().inspect(write('bad.docx', 'not really a zip')));
  await assert.rejects(new Importer().inspect(write('bad.epub', 'not really a zip')), /couldn't be opened/);
  await assert.rejects(new Importer().inspect(write('nope.xyz', 'x')), /can't be imported/);
  assert.equal(findNode(space.outline(), bookId).children.length, 1);
});

test('adding to a book keeps what\'s there, and a fresh book\'s empty chapter steps aside', async () => {
  const { space, bookId, chapter } = project();
  const file = write('two.md', '# One\n\nWords.\n\n# Two\n\nMore.\n');
  await importInto(space, file, { target: { kind: 'book', id: bookId } });
  assert.deepEqual(findNode(space.outline(), bookId).children.map((item) => item.title), ['One', 'Two']);
  assert.equal(space.project.getItem(chapter), null, 'the empty first chapter made way');

  await importInto(space, file, { target: { kind: 'book', id: bookId } });
  assert.equal(findNode(space.outline(), bookId).children.length, 4, 'real chapters stay');
});

test('a file fills gaps in a book\'s details, and never replaces them', async () => {
  const { space, bookId } = project();
  space.saveDetails({ id: bookId, details: { author: 'Marit Vale' } });
  await importInto(space, write('d.md', '---\nauthor: Someone Else\npublisher: Harbour Press\n---\n\n# One\n\nWords.\n'), { target: { kind: 'book', id: bookId } });
  const { details } = space.getDetails(bookId);
  assert.equal(details.author, 'Marit Vale');
  assert.equal(details.publisher, 'Harbour Press');
});

test('importing isn\'t counted as words written today', async () => {
  const { space } = project();
  await importInto(space, write('a.md', '# One\n\nA good many words here today.\n\n# Two\n\nMore.'));
  assert.equal(space.progress().today, 0);
});

test('every imported chapter opens as a valid document', async () => {
  const { space } = project();
  const file = write('mixed.html', '<h1>One</h1><ul><li><p>a</p><ul><li>b</li></ul></li><li></li></ul><blockquote>bare text</blockquote><table><tr><td>cell</td></tr></table>');
  const { first } = await importInto(space, file, { mode: 'none' });
  const document = JSON.parse(space.loadChapter(first).body);
  const check = (node) => {
    if (node.type === 'text') assert.ok(node.text.length > 0, 'no empty text');
    if (node.type === 'listItem') assert.equal(node.content[0].type, 'paragraph');
    node.content?.forEach(check);
  };
  check(document);
});
