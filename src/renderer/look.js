import { PAGE_FONTS, THEMES, UI_FONTS } from '../shared/themes.js';

const dark = window.matchMedia('(prefers-color-scheme: dark)');
let current = null;

function setColors(theme) {
  const style = document.documentElement.style;
  const set = (name, value) => style.setProperty(name, value);
  set('--bar-start', theme.barStart);
  set('--bar-end', theme.barEnd);
  set('--on-bar', theme.onBar);
  set('--accent', theme.accent);
  set('--on-accent', theme.onAccent);
  set('--desk', theme.desk);
  set('--desk-image', theme.deskStops ? `linear-gradient(135deg, ${theme.deskStops.join(', ')})` : 'none');
  set('--panel', theme.panel);
  set('--panel-end', theme.panelEnd);
  set('--panel-edge', theme.edge);
  set('--ink', theme.ink);
  set('--ink-soft', theme.inkSoft);
  set('--sheet-ink', theme.ink);
  set('--sheet-ink-soft', theme.inkSoft);
  set('--on-panel', theme.onPanel ?? theme.ink);
  set('--on-panel-soft', theme.onPanelSoft ?? theme.inkSoft);
  set('--sheet', theme.sheet);
  set('--danger', theme.danger);
  set('--on-danger-bg', theme.dangerBg);
  style.colorScheme = theme.tone;
  document.documentElement.dataset.tone = theme.tone;
}

export function applyLook(settings) {
  current = settings;
  const name = settings.theme === 'system' ? (dark.matches ? 'dark' : 'light') : settings.theme;
  document.documentElement.dataset.theme = name;
  setColors(THEMES[name]);
  const glass = THEMES[name].glass || (settings.glass && !THEMES[name].flat);
  document.documentElement.dataset.surface = glass ? 'glass' : 'solid';
  const style = document.documentElement.style;
  style.setProperty('--page-font', PAGE_FONTS[settings.pageFont].stack);
  style.setProperty('--ui-font', UI_FONTS[settings.uiFont].stack);
  style.setProperty('--text-size', `${settings.textSize}px`);
  style.setProperty('--page-width', `${settings.pageWidth}rem`);
}

dark.addEventListener('change', () => {
  if (current?.theme === 'system') applyLook(current);
});
