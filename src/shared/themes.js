'use strict';
// The look of the app as data, so a test can measure every colour pair. The themes are RT Markdown Reader's and the old
// app's, plus Slate. Every theme but High Contrast has panels that run from one colour to another, with a bar that
// contrasts with them. A theme with dark panels and a light page sets onPanel for the text on its panels.

const LIGHT_ALERT = { danger: '#b3261e', dangerBg: '#fbe9e7' };
const DARK_ALERT = { danger: '#ffb4ab', dangerBg: '#4a1c18' };

const THEMES = {
  light: {
    label: 'Light', tone: 'light', ...LIGHT_ALERT,
    barStart: '#2b2350', barEnd: '#15566a', onBar: '#f4f1fb', accent: '#5b3fd6', onAccent: '#ffffff',
    desk: '#e7e3ee', deskStops: ['#cfc6ee', '#e7e3ee', '#bfe2da'], panel: '#f6f4fa', panelEnd: '#ebe7f4', edge: '#d9d3e6',
    ink: '#221f2b', inkSoft: '#57516a', sheet: '#ffffff',
  },
  dark: {
    label: 'Dark', tone: 'dark', ...DARK_ALERT,
    barStart: '#1d1838', barEnd: '#0f4152', onBar: '#f4f1fb', accent: '#a896ff', onAccent: '#17132b',
    desk: '#15131c', deskStops: ['#12172c', '#1b2550', '#0f4444'], panel: '#1f1c29', panelEnd: '#262236', edge: '#363046',
    ink: '#ece9f4', inkSoft: '#a9a3b8', sheet: '#26232f',
  },
  sepia: {
    label: 'Sepia', tone: 'light', ...LIGHT_ALERT,
    barStart: '#5a3b1e', barEnd: '#7a4f20', onBar: '#fff7e6', accent: '#8a4b12', onAccent: '#ffffff',
    desk: '#e9dcc2', deskStops: ['#c9a06a', '#e9dcc2', '#b9b878'], panel: '#f4e9d3', panelEnd: '#ecdfc4', edge: '#cdbb9a',
    ink: '#43362b', inkSoft: '#65523f', sheet: '#fbf0d9',
  },
  mist: {
    label: 'Mist', tone: 'light', ...LIGHT_ALERT,
    barStart: '#355f94', barEnd: '#2f7a78', onBar: '#ffffff', accent: '#355f94', onAccent: '#ffffff',
    desk: '#dfe5ec', deskStops: ['#c7d4e4', '#d3dde8', '#bfe2da'], panel: '#dbe4ee', panelEnd: '#cfe9e2', edge: '#bccad9',
    ink: '#26313f', inkSoft: '#46536a', sheet: '#f6f8fb',
  },
  slate: {
    label: 'Slate', tone: 'dark', ...DARK_ALERT,
    barStart: '#232b36', barEnd: '#3a4756', onBar: '#eef2f6', accent: '#8fb3d9', onAccent: '#10181f',
    desk: '#1a2028', deskStops: ['#171d25', '#2b3644', '#3f4f5f'], panel: '#2b3440', panelEnd: '#222a34', edge: '#46525f',
    ink: '#e4e9ef', inkSoft: '#b4c0cc', sheet: '#2a323d',
  },
  forest: {
    label: 'Forest', tone: 'dark', ...DARK_ALERT,
    barStart: '#0f2a1c', barEnd: '#2f5a24', onBar: '#e4f0e8', accent: '#5fcf8e', onAccent: '#0b120e',
    desk: '#0b120e', deskStops: ['#0b1a12', '#143a26', '#3a4a1a'], panel: '#14301f', panelEnd: '#0e2116', edge: '#2b4a37',
    ink: '#d6e4da', inkSoft: '#a9bdb0', sheet: '#121c16',
  },
  dusk: {
    label: 'Dusk', tone: 'dark', ...DARK_ALERT,
    barStart: '#201739', barEnd: '#6a2a60', onBar: '#f1ecf8', accent: '#b197fc', onAccent: '#15102a',
    desk: '#110e18', deskStops: ['#15102a', '#3a2160', '#7a2a5e'], panel: '#2a1f4f', panelEnd: '#1c1533', edge: '#45376f',
    ink: '#e2dcee', inkSoft: '#bbb2cf', sheet: '#1a1625',
  },
  blue: {
    label: 'Blue', tone: 'light', ...LIGHT_ALERT,
    barStart: '#0e2c57', barEnd: '#0f6e72', onBar: '#ffffff', accent: '#1b5fc1', onAccent: '#ffffff',
    desk: '#1f6fa8', deskStops: ['#123a6b', '#1f6fa8', '#17a398'], panel: '#123a6b', panelEnd: '#0e2c57', edge: '#2d5f94',
    onPanel: '#eaf2fb', onPanelSoft: '#c3d5ea', ink: '#16253b', inkSoft: '#33475f', sheet: '#f6faff',
  },
  red: {
    label: 'Red', tone: 'light', ...LIGHT_ALERT,
    barStart: '#4a0c18', barEnd: '#a63e16', onBar: '#ffffff', accent: '#b3122a', onAccent: '#ffffff',
    desk: '#a8201a', deskStops: ['#5c0f1e', '#a8201a', '#e8751a'], panel: '#5c0f1e', panelEnd: '#3f0a14', edge: '#8a3440',
    onPanel: '#fdeee9', onPanelSoft: '#efc9c2', ink: '#2b1518', inkSoft: '#4f2f33', sheet: '#fff8f3',
  },
  yellow: {
    label: 'Yellow', tone: 'light', ...LIGHT_ALERT,
    barStart: '#ffd23f', barEnd: '#ffa53c', onBar: '#2a2410', accent: '#1d4e89', onAccent: '#ffffff',
    desk: '#ffb627', deskStops: ['#ffd23f', '#ffb627', '#ff8c42'], panel: '#fff0b3', panelEnd: '#ffe27a', edge: '#e0b84a',
    ink: '#2a2410', inkSoft: '#4a4020', sheet: '#fffdf2',
  },
  blueOrange: {
    label: 'Blue/Orange', tone: 'dark', ...DARK_ALERT,
    barStart: '#0d2034', barEnd: '#14436b', onBar: '#ffe4c4', accent: '#ff8c00', onAccent: '#1a1006',
    desk: '#0a1827', deskStops: ['#0a1827', '#14436b', '#7a4a10'], panel: '#142f4b', panelEnd: '#0f253c', edge: '#2a4e72',
    ink: '#ffe4c4', inkSoft: '#d9bf9f', sheet: '#0d2034',
  },
  plum: {
    label: 'Plum', tone: 'dark', ...DARK_ALERT,
    barStart: '#4d0f28', barEnd: '#7d2b52', onBar: '#ffe5f7', accent: '#dda0dd', onAccent: '#2c0a1c',
    desk: '#3a0b1e', deskStops: ['#2c0816', '#4d0f28', '#7d2b52'], panel: '#672345', panelEnd: '#4d0f28', edge: '#8e4a6e',
    ink: '#ffe5f7', inkSoft: '#ecccdf', sheet: '#4d0f28',
  },
  evergreen: {
    label: 'Evergreen', tone: 'dark', ...DARK_ALERT,
    barStart: '#19352a', barEnd: '#315c4b', onBar: '#eaf4ee', accent: '#50c878', onAccent: '#0c2018',
    desk: '#122a20', deskStops: ['#0e2219', '#1f4435', '#315c4b'], panel: '#2a4b3d', panelEnd: '#19352a', edge: '#44705c',
    ink: '#eaf4ee', inkSoft: '#c2d8cb', sheet: '#19352a',
  },
  aero: {
    label: 'Aero', tone: 'light', glass: true, ...LIGHT_ALERT,
    barStart: '#1f5a8c', barEnd: '#2a6fa3', onBar: '#ffffff', accent: '#1a66a8', onAccent: '#ffffff',
    desk: '#b2c4d5', deskStops: ['#8fbbe2', '#d6e8f5', '#9fd0c4'],
    panel: '#f0f5fbcc', panelEnd: '#e3ecf5cc', edge: '#ffffff99',
    ink: '#10202e', inkSoft: '#3a4d5e', sheet: '#ffffffe6',
  },
  contrast: {
    label: 'High Contrast', tone: 'dark', flat: true, danger: '#ffff00', dangerBg: '#000000',
    barStart: '#000000', barEnd: '#000000', onBar: '#ffffff', accent: '#ffff00', onAccent: '#000000',
    desk: '#000000', panel: '#000000', panelEnd: '#000000', edge: '#ffff00',
    ink: '#ffffff', inkSoft: '#ffffff', sheet: '#000000',
  },
};

const PAGE_FONTS = {
  georgia: { label: 'Georgia', stack: "Georgia, Gelasio, 'DejaVu Serif', serif" },
  times: { label: 'Times New Roman', stack: "'Times New Roman', Times, 'Liberation Serif', serif" },
  century: { label: 'Century Schoolbook', stack: "'Century Schoolbook', Century, C059, 'TeX Gyre Schola', Georgia, serif" },
  palatino: { label: 'Palatino', stack: "'Palatino Linotype', Palatino, 'Book Antiqua', P052, serif" },
  cambria: { label: 'Cambria', stack: 'Cambria, Caladea, Georgia, serif' },
  literata: { label: 'Literata', stack: "'Literata', Georgia, serif" },
  lora: { label: 'Lora', stack: "'Lora', Georgia, serif" },
  garamond: { label: 'EB Garamond', stack: "'EB Garamond', Garamond, Georgia, serif" },
  atkinson: { label: 'Atkinson Hyperlegible (easier to read)', stack: "'Atkinson Hyperlegible', Verdana, sans-serif" },
  courier: { label: 'Courier Prime (typewriter)', stack: "'Courier Prime', 'Courier New', monospace" },
  courierNew: { label: 'Courier New', stack: "'Courier New', Courier, 'Liberation Mono', monospace" },
  arial: { label: 'Arial', stack: "Arial, Helvetica, 'Liberation Sans', sans-serif" },
  calibri: { label: 'Calibri', stack: "Calibri, Carlito, 'Segoe UI', sans-serif" },
  verdana: { label: 'Verdana', stack: "Verdana, 'DejaVu Sans', Geneva, sans-serif" },
  tahoma: { label: 'Tahoma', stack: "Tahoma, Geneva, 'DejaVu Sans', sans-serif" },
  gothic: { label: 'Century Gothic', stack: "'Century Gothic', 'URW Gothic', Futura, sans-serif" },
  trebuchet: { label: 'Trebuchet MS', stack: "'Trebuchet MS', 'Fira Sans', sans-serif" },
};

const UI_FONTS = {
  inter: { label: 'Inter', stack: "'Inter', 'Segoe UI', system-ui, sans-serif" },
  system: { label: 'System', stack: "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif" },
  atkinson: { label: 'Atkinson Hyperlegible', stack: "'Atkinson Hyperlegible', Verdana, sans-serif" },
  arial: PAGE_FONTS.arial,
  calibri: PAGE_FONTS.calibri,
  verdana: PAGE_FONTS.verdana,
  tahoma: PAGE_FONTS.tahoma,
  trebuchet: PAGE_FONTS.trebuchet,
};

const DEFAULT_SETTINGS = {
  theme: 'system',
  pageFont: 'georgia',
  uiFont: 'inter',
  textSize: 18,
  pageWidth: 46,
  spellcheck: true,
  glass: false,
  backupFolder: '',
  backupEvery: 'off',
  backupKeep: 10,
  lockAfter: 15,
};

const LIMITS = { textSize: [14, 28], pageWidth: [32, 64], backupKeep: [1, 100] };
const LOCK_AFTER = { 0: { label: 'Never' }, 5: { label: 'After 5 minutes' }, 15: { label: 'After 15 minutes' }, 30: { label: 'After 30 minutes' }, 60: { label: 'After an hour' } };
const BACKUP_EVERY = { off: { label: 'Off' }, hour: { label: 'Every hour' }, day: { label: 'Every day' }, week: { label: 'Every week' } };

// Anything unknown falls back to the default, so a damaged settings file can't stop the app opening.
function cleanSettings(input) {
  const source = input && typeof input === 'object' ? input : {};
  const within = (name) => {
    const value = Number(source[name]);
    const [low, high] = LIMITS[name];
    return Number.isFinite(value) && value >= low && value <= high ? value : DEFAULT_SETTINGS[name];
  };
  const known = (value, table, name) => (Object.hasOwn(table, value) ? value : DEFAULT_SETTINGS[name]);
  return {
    theme: source.theme === 'system' ? 'system' : known(source.theme, THEMES, 'theme'),
    pageFont: known(source.pageFont, PAGE_FONTS, 'pageFont'),
    uiFont: known(source.uiFont, UI_FONTS, 'uiFont'),
    textSize: within('textSize'),
    pageWidth: within('pageWidth'),
    spellcheck: source.spellcheck !== false,
    glass: source.glass === true,
    backupFolder: typeof source.backupFolder === 'string' ? source.backupFolder : '',
    backupEvery: known(source.backupEvery, BACKUP_EVERY, 'backupEvery'),
    backupKeep: Math.round(within('backupKeep')),
    lockAfter: Object.hasOwn(LOCK_AFTER, source.lockAfter) ? Number(source.lockAfter) : DEFAULT_SETTINGS.lockAfter,
  };
}

module.exports = { BACKUP_EVERY, DEFAULT_SETTINGS, LIMITS, LOCK_AFTER, PAGE_FONTS, THEMES, UI_FONTS, cleanSettings };
