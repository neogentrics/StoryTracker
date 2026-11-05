'use strict';
const { ipcMain, session } = require('electron');

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

function registerIpc({ status, workspace, updater, settings }) {
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
  handle('item:setGoal', (input) => workspace().setGoal(input));
  handle('comment:list', (id) => workspace().listComments(id));
  handle('comment:add', (input) => workspace().addComment(input));
  handle('comment:edit', (input) => workspace().editComment(input));
  handle('comment:remove', (id) => workspace().removeComment(id));
  handle('find:search', (input) => workspace().search(input));
  handle('find:replaceAll', (input) => workspace().replaceAll(input));
  handle('find:undo', () => workspace().undoReplace());
  handle('settings:get', () => settings().values);
  handle('settings:save', (changes) => {
    const saved = settings().save(changes);
    session.defaultSession.setSpellCheckerEnabled(saved.spellcheck);
    return saved;
  });
  handle('dictionary:list', async () => {
    const words = await session.defaultSession.listWordsInSpellCheckerDictionary();
    return words.sort((a, b) => a.localeCompare(b));
  });
  handle('dictionary:add', (word) => session.defaultSession.addWordToSpellCheckerDictionary(String(word)));
  handle('dictionary:remove', (word) => session.defaultSession.removeWordFromSpellCheckerDictionary(String(word)));
  handle('update:install', () => updater.installNow());
}

module.exports = { registerIpc };
