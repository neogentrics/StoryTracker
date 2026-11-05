'use strict';
// The 3.3 test in the real app: book details, a cover, and a book exported to every format, with print PDFs checked.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');

const root = path.join(__dirname, '..', '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-export-'));
const out = (name) => path.join(work, name);
const INCH = 72;

const answer = (app, file) => app.evaluate(({ dialog }, value) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: value });
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [value] });
}, file);

(async () => {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, RTST_USER_DATA: out('profile') },
  });
  const window = await app.firstWindow();
  await window.waitForSelector('body[data-state="ready"]');
  await window.click('#try-sample');
  await window.waitForSelector('.ProseMirror');
  await window.waitForFunction(() => document.querySelector('#book-heading').textContent === 'The Salt Road');

  // Book details and a cover.
  await window.locator('#book-list .row', { hasText: 'The Salt Road' }).hover();
  await window.click('[aria-label="Details of The Salt Road"]');
  await window.waitForSelector('#details[open]');
  await window.fill('#detail-author', 'Marit Vale');
  await window.fill('#detail-publisher', 'Harbour Press');
  await window.fill('#detail-description', 'A ledger, a mule and seven doors.');
  await window.fill('#detail-dedication', 'For the mule.');
  await window.fill('#detail-aboutAuthor', 'Marit walks a lot.');
  await answer(app, path.join(root, 'build', 'icon.png'));
  await window.click('#cover-choose');
  await window.waitForSelector('#cover-preview img');
  assert.match(await window.textContent('#cover-preview'), /512 × 512 pixels/);
  await window.click('#details-save');
  await window.waitForFunction(() => !document.querySelector('#details'));

  // Every format, through the real dialog.
  await window.click('.export-button');
  await window.waitForSelector('#export[open]');
  for (const format of ['docx', 'pdf', 'epub', 'md', 'html', 'odt', 'rtf', 'txt', 'xml']) {
    const file = out(`book.${format}`);
    await answer(app, file);
    await window.selectOption('#export-format', format);
    await window.click('#export-go');
    await window.waitForSelector('#export-reveal', { timeout: 60000 });
    assert.ok(fs.statSync(file).size > 200, `${format} wrote a file`);
    await window.evaluate(() => document.querySelector('#export-result').replaceChildren());
  }

  // The store check warns about a small cover.
  await window.selectOption('#export-format', 'epub');
  await window.waitForFunction(() => document.querySelector('#export-warnings').textContent.includes('512 × 512'));

  // A print PDF: the trim size, an even count, and a fixed count for a re-upload.
  const pdf = async (name) => PDFDocument.load(fs.readFileSync(out(name)));
  const book = await pdf('book.pdf');
  assert.equal(Math.round(book.getPage(0).getWidth()), 6 * INCH);
  assert.equal(Math.round(book.getPage(0).getHeight()), 9 * INCH);
  assert.equal(book.getPageCount() % 2, 0, 'an even page count');
  assert.equal(book.getTitle(), 'The Salt Road');
  assert.equal(book.getAuthor(), 'Marit Vale');

  await window.selectOption('#export-format', 'pdf');
  await window.selectOption('#export-trim', '5x8');
  await window.fill('#export-target', '40');
  await answer(app, out('fixed.pdf'));
  await window.click('#export-go');
  await window.waitForSelector('#export-reveal', { timeout: 60000 });
  const fixed = await pdf('fixed.pdf');
  assert.equal(fixed.getPageCount(), 40, 'a re-upload keeps its published page count');
  assert.equal(Math.round(fixed.getPage(0).getWidth()), 5 * INCH);

  // Everything, to a folder.
  await answer(app, work);
  await window.click('#export-everything');
  await window.waitForSelector('#export-reveal', { timeout: 30000 });
  const folder = out('Sample- The Salt Road'.replace('-', ''));
  const names = fs.existsSync(folder) ? fs.readdirSync(folder) : fs.readdirSync(work);
  assert.ok(names.some((name) => name.includes('word-counts') || name.includes('Salt Road')));

  // Preview opens its own window.
  await window.fill('#export-target', '0');
  await window.click('#export-preview');
  await window.waitForFunction(() => document.querySelector('#export-result').textContent.includes('preview is open'), null, { timeout: 60000 });
  const windows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((item) => !item.isDestroyed()).length);
  assert.equal(windows, 2);
  await app.close();

  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 });
  console.log('export e2e passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
