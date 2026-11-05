'use strict';
// A book's details: what stores ask for, and what goes on its title and copyright pages. The window builds its form
// from this list, and the main process cleans what comes back with it.

const SECTIONS = [
  {
    title: 'The book',
    fields: [
      { name: 'subtitle', label: 'Subtitle' },
      { name: 'author', label: 'Author' },
      { name: 'language', label: 'Language code', hint: 'For example en, en-US or es' },
      { name: 'description', label: 'Description', long: true },
      { name: 'keywords', label: 'Keywords', hint: 'Separated by commas' },
      { name: 'seriesName', label: 'Series name' },
      { name: 'seriesNumber', label: 'Number in the series' },
    ],
  },
  {
    title: 'Publishing',
    fields: [
      { name: 'publisher', label: 'Publisher' },
      { name: 'edition', label: 'Edition' },
      { name: 'isbnEbook', label: 'ISBN for the e-book', hint: 'Leave empty if the store gives you one' },
      { name: 'isbnPrint', label: 'ISBN for print' },
      { name: 'copyrightYear', label: 'Copyright year' },
      { name: 'copyrightHolder', label: 'Copyright holder', hint: 'Leave empty to use the author' },
      { name: 'notice', label: 'Notice on the copyright page', long: true },
    ],
  },
  {
    title: 'Front and back of the book',
    fields: [
      { name: 'dedication', label: 'Dedication', long: true },
      { name: 'acknowledgements', label: 'Acknowledgements', long: true },
      { name: 'aboutAuthor', label: 'About the author', long: true },
      { name: 'alsoBy', label: 'Also by this author', hint: 'One book on each line', long: true },
      { name: 'connect', label: 'Stay connected', hint: 'Your website, email or anything else, one on each line', long: true },
    ],
  },
];

const FIELD_NAMES = SECTIONS.flatMap((section) => section.fields.map((field) => field.name));
const MAX_FIELD = 20000;

function cleanDetails(input) {
  const source = input && typeof input === 'object' ? input : {};
  const clean = {};
  for (const name of FIELD_NAMES) {
    if (typeof source[name] === 'string' && source[name].trim()) clean[name] = source[name].trim().slice(0, MAX_FIELD);
  }
  return clean;
}

function parseDetails(text) {
  try {
    return cleanDetails(JSON.parse(text));
  } catch {
    return {};
  }
}

// Print sizes in inches, from the sizes most printers offer.
const TRIM_SIZES = {
  '5x8': { label: '5 × 8 in', width: 5, height: 8 },
  '5.25x8': { label: '5.25 × 8 in', width: 5.25, height: 8 },
  '5.5x8.5': { label: '5.5 × 8.5 in', width: 5.5, height: 8.5 },
  '6x9': { label: '6 × 9 in', width: 6, height: 9 },
  '7x10': { label: '7 × 10 in', width: 7, height: 10 },
  '8.5x11': { label: '8.5 × 11 in', width: 8.5, height: 11 },
};

const EXPORT_FORMATS = {
  docx: { label: 'Word (.docx)', extension: 'docx' },
  pdf: { label: 'PDF for print (.pdf)', extension: 'pdf' },
  epub: { label: 'E-book (.epub)', extension: 'epub', oneBook: true },
  md: { label: 'Markdown (.md)', extension: 'md' },
  html: { label: 'Web page (.html)', extension: 'html' },
  odt: { label: 'OpenDocument (.odt)', extension: 'odt' },
  rtf: { label: 'Rich text (.rtf)', extension: 'rtf' },
  txt: { label: 'Plain text (.txt)', extension: 'txt' },
  xml: { label: 'XML (.xml)', extension: 'xml' },
};

const DEFAULT_LAYOUT = {
  trim: '6x9',
  pageFont: 'georgia',
  fontSize: 13,
  lineHeight: 1.4,
  chapterStart: 'right',
  pageNumbers: true,
  runningHeaders: true,
  dropCaps: false,
  contents: true,
  endBlankEven: true,
  targetPages: 0,
};

function cleanLayout(input, pageFonts) {
  const source = input && typeof input === 'object' ? input : {};
  const within = (name, low, high) => {
    const value = Number(source[name]);
    return Number.isFinite(value) && value >= low && value <= high ? value : DEFAULT_LAYOUT[name];
  };
  const flag = (name) => (typeof source[name] === 'boolean' ? source[name] : DEFAULT_LAYOUT[name]);
  return {
    trim: Object.hasOwn(TRIM_SIZES, source.trim) ? source.trim : DEFAULT_LAYOUT.trim,
    pageFont: Object.hasOwn(pageFonts, source.pageFont) ? source.pageFont : DEFAULT_LAYOUT.pageFont,
    fontSize: within('fontSize', 9, 18),
    lineHeight: within('lineHeight', 1.1, 2),
    chapterStart: source.chapterStart === 'any' ? 'any' : 'right',
    pageNumbers: flag('pageNumbers'),
    runningHeaders: flag('runningHeaders'),
    dropCaps: flag('dropCaps'),
    contents: flag('contents'),
    endBlankEven: flag('endBlankEven'),
    targetPages: Math.round(within('targetPages', 0, 2000)),
  };
}

module.exports = { DEFAULT_LAYOUT, EXPORT_FORMATS, SECTIONS, TRIM_SIZES, cleanDetails, cleanLayout, parseDetails };
