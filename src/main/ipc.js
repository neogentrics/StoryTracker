'use strict';
const { ipcMain } = require('electron');

// Errors come back as plain results, so the window can show the app's own words and not Electron's wrapper around them.
function handle(channel, work) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, value: await work(...args) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

function registerIpc({ status, workspace, updater }) {
  handle('app:status', status);
  handle('library:list', () => workspace().listProjects());
  handle('library:removeSample', (id) => workspace().removeSample(id));
  handle('project:create', (title) => workspace().createProject(title));
  handle('project:createSample', () => workspace().createSample());
  handle('project:open', (id) => workspace().openProject(id));
  handle('project:close', () => workspace().closeProject());
  handle('item:add', (input) => workspace().addItem(input));
  handle('item:rename', (input) => workspace().rename(input));
  handle('item:move', (input) => workspace().move(input));
  handle('item:removeEmpty', (id) => workspace().removeEmpty(id));
  handle('chapter:load', (id) => workspace().loadChapter(id));
  handle('chapter:save', (input) => workspace().saveChapter(input));
  handle('update:install', () => updater.installNow());
}

module.exports = { registerIpc };
