'use strict';
// Find my files in the real app, from the library screen to the report, with a made-up folder of stories.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const docx = require('docx');

const root = path.join(__dirname, '..', '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-folder-'));
const stories = path.join(work, 'My Stories');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const write = (rel, content) => {
  const full = path.join(stories, ...rel.split('/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};
const word = (text) => docx.Packer.toBuffer(new docx.Document({ sections: [{ children: [new docx.Paragraph({ children: [new docx.TextRun(text)] })] }] }));
const answer = (app, value) => app.evaluate(({ dialog }, folder) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
}, value);

(async () => {
  write('Series_The_Long_Road/Book_1_Ash/Chapter 1.docx', await word('Older words here.'));
  write('Series_The_Long_Road/Book_1_Ash/Chapter 1 v2.docx', await word('Newer words here.'));
  write('Series_The_Long_Road/Book_1_Ash/Chapter 2.docx', await word('The second chapter.'));
  write('Series_The_Long_Road/Book_1_Ash/Something Else.docx', await word('Who knows.'));
  write('Series_The_Long_Road/Book_1_Ash/Covers/Front Cover.png', PNG);
  write('Series_The_Long_Road/Book_1_Ash/Art/map.png', Buffer.concat([PNG, PNG]));
  write('Series_The_Long_Road/Book_2_Salt/Chapter 1.docx', await word('Salt begins.'));
  write('Series_The_Long_Road/Book_2_Salt/Chapter 9.docx', await word('This one moves.'));
  write('Unwanted/Chapter 1.docx', await word('Leave this out.'));
  write('Thumbs.db', 'noise');

  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, RTST_USER_DATA: path.join(work, 'profile') },
  });
  const window = await app.firstWindow();
  await window.waitForSelector('body[data-state="ready"]');
  await answer(app, stories);

  // From the library screen: the project is named after the folder, and the plan appears.
  await window.click('#find-files');
  await window.waitForSelector('#plan-tree');
  assert.match(await window.textContent('#plan-summary'), /10 files/);
  assert.match(await window.textContent('#plan-summary'), /never touched/);
  assert.match(await window.textContent('#plan-tree'), /The Long Road/);
  assert.match(await window.textContent('#plan-tree'), /1 earlier version/);

  // Ask me: the unsure file is a chapter.
  await window.locator('.ask-card[data-ask="unsure"] label', { hasText: 'They’re chapters' }).locator('input').check();
  await window.waitForFunction(() => document.querySelector('#plan-tree').textContent.includes('Something Else'));

  // Rename a book, leave one out, and drag a chapter to another book.
  await window.locator('.plan-row.book .plan-title', { hasText: 'Salt' }).dblclick();
  await window.fill('[aria-label="New title for Salt"]', 'Salt and Stone');
  await window.keyboard.press('Enter');
  await window.waitForFunction(() => document.querySelector('#plan-tree').textContent.includes('Salt and Stone'));
  await window.click('[aria-label="Leave out Unwanted"]');
  await window.waitForFunction(() => !document.querySelector('#plan-tree').textContent.includes('Unwanted'));
  await window.locator('.plan-row.chapter', { hasText: 'Chapter 9' }).dragTo(window.locator('.plan-row.book', { hasText: 'Ash' }));
  await window.waitForFunction(() => {
    const rows = [...document.querySelectorAll('#plan-tree .plan-row')].map((row) => row.textContent);
    return rows.findIndex((text) => text.includes('Chapter 9')) < rows.findIndex((text) => text.includes('Salt and Stone'));
  });

  await window.click('#plan-go');
  await window.waitForSelector('#report-total');
  assert.match(await window.textContent('#report-total'), /All 10 files accounted for/);
  assert.match(await window.textContent('#report-groups'), /Left out: 2/);
  await window.click('#report-close');

  // What came in is ordinary writing.
  await window.locator('#book-list .row', { hasText: 'Ash' }).click();
  await window.locator('#chapter-list .row', { hasText: 'Chapter 1' }).click();
  await window.waitForFunction(() => document.querySelector('.ProseMirror')?.textContent === 'Newer words here.');
  assert.equal(await window.locator('#chapter-list .row', { hasText: 'Chapter 9' }).count(), 1);
  assert.equal(await window.locator('#chapter-list .row', { hasText: 'Something Else' }).count(), 1);
  assert.equal(await window.locator('#book-list .row', { hasText: 'Salt and Stone' }).count(), 1);
  assert.equal(await window.locator('#book-list .row', { hasText: 'Unwanted' }).count(), 0);

  // The older file is in the chapter's history.
  await window.click('.history-button');
  await window.waitForSelector('.history-row');
  assert.match(await window.textContent('.history-row'), /From your files/);
  await window.click('#history-close');

  // Attachments show, with a picture's preview.
  await window.click('.attachments-button');
  await window.waitForSelector('#attachments[open]');
  assert.match(await window.textContent('#attachment-list'), /map\.png/);
  await window.waitForFunction(() => document.querySelector('.attachment-thumb')?.src.startsWith('data:image/png'));
  await window.click('#attachments-close');

  await app.close();
  assert.equal(fs.existsSync(path.join(stories, 'Thumbs.db')), true);
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 });
  console.log('folder e2e passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
