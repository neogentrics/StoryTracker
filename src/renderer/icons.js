// Line icons, drawn on a 24-unit grid. They use the text colour, so they suit every theme.
const PATHS = {
  menu: ['M4 6h16', 'M4 12h10', 'M4 18h13'],
  library: ['M5 4h3v16H5z', 'M11 4h3v16h-3z', 'M17.2 4.6l2.8.8-3.6 14.6-2.8-.8'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4'],
  history: ['M4 12a8 8 0 1 0 2.5-5.8L4 8.5', 'M4 4v4.5h4.5', 'M12 8v4.5l3 1.8'],
  focus: ['M4 9V5a1 1 0 0 1 1-1h4', 'M15 4h4a1 1 0 0 1 1 1v4', 'M20 15v4a1 1 0 0 1-1 1h-4', 'M9 20H5a1 1 0 0 1-1-1v-4'],
  goal: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z', 'M12 12h.01'],
  trash: ['M4 7h16', 'M9 7V4.5h6V7', 'M6.5 7l1 13h9l1-13', 'M10 11v5', 'M14 11v5'],
  settings: ['M4 7h10', 'M18 7h2', 'M4 17h2', 'M10 17h10', 'M16 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M8 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  plus: ['M12 5v14', 'M5 12h14'],
  book: ['M12 6.5C10 5 7 4.5 4 4.5v14c3 0 6 .5 8 2 2-1.5 5-2 8-2v-14c-3 0-6 .5-8 2z', 'M12 6.5v14'],
  series: ['M12 3.5 3 8.5l9 5 9-5-9-5z', 'M3 12.5l9 5 9-5', 'M3 16.5l9 5 9-5'],
  part: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z'],
  chapter: ['M7 3.5h7l4.5 4.5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z', 'M14 3.5V8h4.5', 'M9.5 13h5', 'M9.5 16.5h5'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
  redo: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 0 0 0 12h3'],
  bullets: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  numbers: ['M10 6h10', 'M10 12h10', 'M10 18h10', 'M4 5l1.5-1v5', 'M4 15.5c.5-1 2.8-1 2.8.5 0 1.3-2.8 2-2.8 3.5h3'],
  comment: ['M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  beside: ['M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M12 5v14'],
  pencil: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13.5 6.5l4 4'],
  restore: ['M4 12a8 8 0 1 0 2.5-5.8L4 8.5', 'M4 4v4.5h4.5'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  lock: ['M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z', 'M8 11V7.5a4 4 0 0 1 8 0V11'],
  open: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H7.5a2 2 0 0 0-1.9 1.4L3 19V7z', 'M3 19h15.5a2 2 0 0 0 1.9-1.4L22 12a1.5 1.5 0 0 0-1.4-2H10'],
  page: ['M6 3h9l4 4v14H6z', 'M14 3v5h5'],
  attach: ['M20 11.5l-8.2 8.2a5 5 0 0 1-7-7l8.2-8.3a3.3 3.3 0 0 1 4.7 4.7l-8.3 8.2a1.7 1.7 0 0 1-2.3-2.3l7.6-7.6'],
  folder: ['M3 7a2 2 0 0 1 2-2h4.5l2 2.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  import: ['M3 12h12', 'M11 8l4 4-4 4', 'M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4'],
  export: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M4 19h16'],
  print: ['M7 8V4h10v4', 'M7 17H5a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2', 'M7 14h10v6H7z'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],
  sample: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z', 'M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z'],
};

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  for (const shape of PATHS[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', shape);
    svg.append(path);
  }
  return svg;
}
