'use strict';
// The 3.4 test in the real app: an AI-made Markdown file and a Word manuscript, with the words checked afterwards.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const docx = require('docx');

const root = path.join(__dirname, '..', '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-import-'));

const answer = (app, file) => app.evaluate(({ dialog }, value) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [value] });
}, file);
const row = (window, title) => window.locator('#chapter-list .row', { hasText: title });

(async () => {
  const aiFile = path.join(work, 'from-ai.md');
  fs.writeFileSync(aiFile, "Here's your first two chapters:\n\n**Chapter One**\n\nThe road was \"white\" that night.\n\n**Chapter Two**\n\nShe walked  on.\n\nWould you like me to continue?\n");
  const wordFile = path.join(work, 'manuscript.docx');
  const manuscript = new docx.Document({
    sections: [{
      children: [
        new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_1, children: [new docx.TextRun('Prologue')] }),
        new docx.Paragraph({ children: [new docx.TextRun('It started '), new docx.TextRun({ text: 'quietly', italics: true }), new docx.TextRun('.')] }),
        new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_1, children: [new docx.TextRun('Chapter 1')] }),
        new docx.Paragraph({ children: [new docx.TextRun('Then it got loud.')] }),
      ],
    }],
  });
  fs.writeFileSync(wordFile, await docx.Packer.toBuffer(manuscript));

  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, RTST_USER_DATA: path.join(work, 'profile') },
  });
  const window = await app.firstWindow();
  await window.waitForSelector('body[data-state="ready"]');
  await window.fill('#new-title', 'Imports');
  await window.click('#start-project');
  await window.waitForSelector('.ProseMirror');

  // An AI-made file: each clean-up is shown, and one can be refused.
  await answer(app, aiFile);
  await window.click('.import-button');
  await window.waitForSelector('#import[open]');
  assert.match(await window.textContent('#import-findings'), /Chat text at the top/);
  assert.match(await window.textContent('#import-findings'), /Chat text at the bottom/);
  assert.match(await window.textContent('#import-findings'), /Bold used as a heading/);
  await window.waitForFunction(() => document.querySelector('#import-sections').textContent.includes('Chapter Two'));
  assert.notEqual(await window.inputValue('#import-target'), 'new', 'an empty book is the first choice');
  await window.click('#import-go');
  await window.waitForFunction(() => document.querySelector('#room-message')?.textContent.includes('Imported 2 chapters'));
  await row(window, 'Chapter One').waitFor();
  await window.waitForFunction(() => document.querySelector('.ProseMirror').textContent === 'The road was “white” that night.');
  assert.equal(await row(window, 'Chapter 1').count(), 0, 'the empty first chapter made way');

  // A Word manuscript, into a new book, with the word check shown.
  await answer(app, wordFile);
  await window.click('.import-button');
  await window.waitForSelector('#import[open]');
  await window.waitForFunction(() => document.querySelector('#import-check').textContent.includes('Nothing is missing'));
  assert.equal(await window.inputValue('#import-title'), 'manuscript');
  await window.fill('#import-title', 'The Manuscript');
  await window.click('#import-go');
  await window.waitForFunction(() => document.querySelector('#book-heading').textContent === 'The Manuscript');
  await window.waitForFunction(() => document.querySelector('.ProseMirror').textContent === 'It started quietly.');
  assert.ok(await window.$('.ProseMirror em'), 'italics came through');
  assert.equal(await row(window, 'Chapter 1').count(), 1);

  // Imported chapters are ordinary chapters: they can be written in and saved, and Ctrl+I is still italics.
  await window.click('.ProseMirror');
  await window.keyboard.press('ControlOrMeta+End');
  await window.keyboard.press('ControlOrMeta+i');
  await window.keyboard.type(' And on.');
  await window.waitForFunction(() => document.querySelector('.ProseMirror em:last-of-type')?.textContent.includes('And on.'));
  assert.equal(await window.$('#import[open]'), null, 'the italics shortcut does not open Import');
  await window.waitForSelector('.save-state[data-state="saved"]', { timeout: 15000 });

  // A file the app can't read gets an answer, and nothing changes.
  fs.writeFileSync(path.join(work, 'old.doc'), 'x');
  await answer(app, path.join(work, 'old.doc'));
  await window.click('.import-button');
  await window.waitForFunction(() => document.querySelector('#room-message')?.textContent.includes('Save As'));
  await app.close();

  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 });
  console.log('import e2e passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
