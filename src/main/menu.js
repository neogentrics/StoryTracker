'use strict';
const { Menu } = require('electron');

// There's no Reload here on purpose: it would throw away whatever hasn't saved yet.
function buildMenu({ send, checkForUpdates, about }) {
  const isMac = process.platform === 'darwin';
  const help = [
    { label: 'Check for Updates…', click: checkForUpdates },
    ...(isMac ? [] : [{ type: 'separator' }, { label: 'About RT Story Tracker', click: about }]),
  ];
  return Menu.buildFromTemplate([
    ...(isMac
      ? [{
          label: 'RT Story Tracker',
          submenu: [
            { label: 'About RT Story Tracker', click: about },
            { type: 'separator' },
            { label: 'Preferences…', accelerator: 'Cmd+,', click: () => send('preferences') },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Chapter', accelerator: 'CmdOrCtrl+N', click: () => send('new-chapter') },
        { label: 'New Book', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('new-book') },
        { type: 'separator' },
        { label: 'Open Project File…', accelerator: 'CmdOrCtrl+O', click: () => send('open-file') },
        { label: 'Save a Copy of This Project…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('export') },
        { type: 'separator' },
        { label: 'Import…', accelerator: 'CmdOrCtrl+Shift+I', click: () => send('import') },
        { label: 'Find My Files…', click: () => send('find-files') },
        { label: 'Attachments…', click: () => send('attachments') },
        { label: 'Export…', accelerator: 'CmdOrCtrl+E', click: () => send('export-book') },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => send('print') },
        { label: 'Book Details…', click: () => send('details') },
        { type: 'separator' },
        { label: 'Earlier Versions of This Chapter…', click: () => send('history') },
        { label: 'Trash', click: () => send('trash') },
        { type: 'separator' },
        { label: 'Library', accelerator: 'CmdOrCtrl+Shift+L', click: () => send('library') },
        ...(isMac
          ? []
          : [
              { label: 'Preferences…', accelerator: 'Ctrl+,', click: () => send('preferences') },
              { type: 'separator' },
              { role: 'quit' },
            ]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: () => send('find') },
        { label: 'Replace…', accelerator: isMac ? 'Cmd+Alt+F' : 'Ctrl+H', click: () => send('replace') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Focus Mode', accelerator: 'CmdOrCtrl+Shift+F', click: () => send('focus') },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { label: 'Help', submenu: help },
  ]);
}

module.exports = { buildMenu };
