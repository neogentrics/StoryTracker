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
        { label: 'Library', accelerator: 'CmdOrCtrl+Shift+L', click: () => send('library') },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
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
