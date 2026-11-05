'use strict';
// What a name can tell us. Everything here is a plain function of a name, so the guessing can be tested on its own.

const KINDS = {
  writing: ['docx', 'odt', 'rtf', 'md', 'markdown', 'txt', 'html', 'htm', 'pages', 'scrivx'],
  picture: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'psd', 'svg', 'ai'],
  audio: ['mp3', 'wav', 'm4a', 'm4b', 'flac', 'ogg', 'aac'],
  video: ['mp4', 'mov', 'mkv', 'avi', 'webm'],
  published: ['pdf', 'epub', 'mobi', 'azw3'],
};
const KIND_OF = new Map(Object.entries(KINDS).flatMap(([kind, list]) => list.map((extension) => [extension, kind])));

const NOISE_FILE = /^(desktop\.ini|thumbs\.db|\.ds_store|\.localized|icon\r?)$|^~\$|^\._|\.(tmp|lnk|crdownload|part|partial)$/i;
const NOISE_FOLDER = /^(\.git|\.svn|\.hg|node_modules|\$recycle\.bin|__macosx|\.trash|\.trashes|\.vs|\.vscode|\.idea)$/i;
const SUPPORT_FOLDER = /^(chapters?|manuscripts?|drafts?|text|writing|scenes?|versions?|revisions?|old|older|archived?|archives|backups?|previous|edits?|edited|art|artwork|covers?|images?|pictures?|photos?|illustrations?|graphics|audio|audiobooks?|music|video|marketing|promo|notes?|research|formatting|print|paperback|hardcover|ebooks?|kindle|kdp|published|exports?|exported)$/i;
const OLD_FOLDER = /^(versions?|revisions?|archived?|archives|backups?)$|\b(old|older|previous|superseded)\b/i;
const DRAFT_FOLDER = /\bdrafts?\b|\b(?:version|ver|rev|revision|v)[ .\-]*\d/i;
const COVER_FOLDER = /^covers?$/i;
const FINISHED_FOLDER = /\b(print|ebook|e-book|paperback|hardcover|kindle|kdp|formatted|published|full manuscript)\b/i;
const NOTES_FOLDER = /^(notes?|marketing|promo|characters?|lore|worldbuilding|world)$|\b(research|dossiers?)\b/i;
const SERIES_NAME = /\b(series|saga|trilogy|duology|cycle|chronicles)\b/i;
const NOTES_NAME = /\b(notes?|outline|synopsis|blurb|bible|research|characters?|timeline|query|summary|ideas?|plot|worldbuilding|marketing|bio|description|keywords?)\b/i;

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const COUNT = `\\d+|${WORDS.slice(1).join('|')}|[ivxlc]+`;
const REST = '(?![a-z])[ .:,_\\-–—]*(.*)$';
const CHAPTER = new RegExp(`^(?:chapter|chap|ch)[ .\\-]*(${COUNT})${REST}`, 'i');
const BOOK = new RegExp(`^(?:book|bk|volume|vol)[ .\\-]*(${COUNT})${REST}`, 'i');
const PART = new RegExp(`^part[ .\\-]*(${COUNT})${REST}`, 'i');
const LEADING_NUMBER = /^(\d{1,3})(?:[ .\-–—]+(\S.*))?$/;
// The Long Road Chapter 3, or The Long Road Book 2 - Chapter 3. What comes first is usually the book's own title.
const INSIDE_CHAPTER = new RegExp(`(?:^|[ (\\-–—])chapter[ .\\-]*(${COUNT})${REST}`, 'i');
const INSIDE_BOOK = /\bbook[ .\-]*(\d+)\b/i;
const INSIDE_SPECIAL = /[ (\-–—](foreword|preface|prologue|interlude|epilogue|afterword)\b[ .:,\-–—]*(.*)$/i;
const SPECIAL = /^(dedication|foreword|preface|introduction|prologue|interlude|epilogue|afterword|acknowledge?ments?|appendix)\b[ .:,\-–—]*(.*)$/i;
// Where each comes in a book, with chapters between prologue and epilogue.
const SPECIAL_PLACE = { dedication: -4, foreword: -3, preface: -2, introduction: -1.5, prologue: -1, interlude: 5000, epilogue: 10000, afterword: 10001, acknowledgements: 10002, acknowledgments: 10002, acknowledgement: 10002, acknowledgment: 10002, appendix: 10003 };

const tidy = (text) => text.replace(/_+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–—.,:]+|[\s\-–—.,:]+$/g, '').trim();

// 02_Books_in_Progress: the number is only there to sort the folder.
const folderName = (name) => tidy(name).replace(/^\d{1,3}[ .\-–—]+(?=\D)/, '');

function roman(text) {
  const values = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  const digits = [...text.toLowerCase()].map((letter) => values[letter]);
  return digits.reduce((sum, value, at) => sum + (value < (digits[at + 1] ?? 0) ? -value : value), 0);
}

function numberFrom(text) {
  if (/^\d+$/.test(text)) return Number(text);
  const word = WORDS.indexOf(text.toLowerCase());
  return word > 0 ? word : roman(text);
}

function kindOf(extension) {
  return KIND_OF.get(extension.toLowerCase()) ?? 'other';
}

// Takes the version marks off a name, and says what they were.
function versionOf(stem) {
  let rest = stem.replace(/_+/g, ' ');
  const version = { number: null, final: false, copy: false, old: false, date: null };
  const take = (pattern, use) => {
    rest = rest.replace(pattern, (...found) => {
      use(found);
      return ' ';
    });
  };
  take(/\(before (\d{4}-\d{2}-\d{2})\)/i, ([, date]) => {
    version.date = date;
    version.old = true;
  });
  take(/^copy of\b/i, () => { version.copy = true; });
  take(/\bcopy\b(?:\s*\(?\d+\)?)?/i, () => { version.copy = true; });
  take(/\s\((\d{1,2})\)\s*$/, () => { version.copy = true; });
  take(/\b(?:version|ver|rev|revision|v)[ .\-]*(\d+(?:\.\d+)*)\b/i, ([, number]) => { version.number = number.split('.').map(Number); });
  take(/\bdraft\b[ .\-]*(\d+)?/i, ([, number]) => { version.number ??= number ? [Number(number)] : null; });
  take(/\b(?:final|finished|latest|current)\b/i, () => { version.final = true; });
  take(/\b(?:older|old|backup|bak|previous)\b/i, () => { version.old = true; });
  take(/\b(20\d{2})[-_.](\d{2})[-_.](\d{2})\b/, ([, year, month, day]) => { version.date = `${year}-${month}-${day}`; });
  return { ...version, rest: tidy(rest) };
}

// Where a file sits in a book, if its name says so.
function chapterOf(name) {
  const within = INSIDE_SPECIAL.exec(name);
  if (within && !SPECIAL.test(name)) {
    const word = within[1].toLowerCase();
    return { place: SPECIAL_PLACE[word], key: word, title: tidy(`${word[0].toUpperCase()}${word.slice(1)} ${within[2]}`) };
  }
  const special = SPECIAL.exec(name);
  if (special) {
    const word = special[1].toLowerCase();
    const extra = /^\d+\b/.exec(special[2])?.[0];
    return { place: SPECIAL_PLACE[word] + (extra ? Number(extra) / 100 : 0), key: `${word}${extra ?? ''}`, title: tidy(name) };
  }
  const inside = INSIDE_CHAPTER.exec(name);
  if (inside && inside.index > 0) {
    const number = numberFrom(inside[1]);
    const book = Number(INSIDE_BOOK.exec(name.slice(0, inside.index))?.[1] ?? 0);
    const tail = tidy(inside[2]).replace(/^\(|\)$/g, '').trim();
    const label = `${book ? `Book ${book}, ` : ''}Chapter ${number}`;
    return { place: book * 1000 + number, key: `book${book}chapter${number}`, title: tail ? `${label}: ${tail}` : label };
  }
  const chapter = CHAPTER.exec(name);
  if (chapter) {
    const number = numberFrom(chapter[1]);
    return { place: number, key: `chapter${number}`, title: tidy(chapter[2]) ? `Chapter ${number}: ${tidy(chapter[2])}` : `Chapter ${number}` };
  }
  const leading = LEADING_NUMBER.exec(name);
  if (leading) {
    const number = Number(leading[1]);
    return { place: number, key: `chapter${number}`, title: tidy(leading[2] ?? '') || `Chapter ${number}` };
  }
  return null;
}

function bookOf(name) {
  const found = BOOK.exec(folderName(name));
  if (!found) return null;
  const number = numberFrom(found[1]);
  return { number, title: tidy(found[2]) || `Book ${number}` };
}

function partOf(name) {
  const found = PART.exec(folderName(name));
  return found ? { number: numberFrom(found[1]), title: folderName(name) } : null;
}

// Series_The_Long_Road becomes The Long Road.
function seriesTitle(name) {
  return folderName(name).replace(/^series\s+/i, '') || folderName(name);
}

const compareNumbers = (a, b) => {
  for (let at = 0; at < Math.max(a.length, b.length); at += 1) {
    const gap = (a[at] ?? 0) - (b[at] ?? 0);
    if (gap) return gap;
  }
  return 0;
};

// The newest first. A mark in the name counts for more than a file's date, which a copy or a download can change.
function compareVersions(a, b) {
  const rank = (file) => (file.version.old || file.inOldFolder ? 0 : file.version.copy ? 1 : 2);
  return rank(b) - rank(a)
    || compareNumbers(b.draft ?? [], a.draft ?? [])
    || Number(b.version.final) - Number(a.version.final)
    || compareNumbers(b.version.number ?? [], a.version.number ?? [])
    || (b.version.date ?? '').localeCompare(a.version.date ?? '')
    || b.mtime - a.mtime
    || a.rel.localeCompare(b.rel);
}

// True when nothing but the date on the file separates the two, which is a guess worth asking about.
function sameMarks(a, b) {
  const marks = (file) => JSON.stringify([file.version.old || file.inOldFolder, file.draft ?? null, file.version.copy, file.version.final, file.version.number, file.version.date]);
  return marks(a) === marks(b);
}

module.exports = {
  COVER_FOLDER, DRAFT_FOLDER, FINISHED_FOLDER, NOISE_FILE, NOISE_FOLDER, NOTES_FOLDER, NOTES_NAME, OLD_FOLDER, SERIES_NAME, SUPPORT_FOLDER,
  bookOf, chapterOf, compareVersions, folderName, kindOf, partOf, sameMarks, seriesTitle, tidy, versionOf,
};
