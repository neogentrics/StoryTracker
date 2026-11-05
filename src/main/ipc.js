'use strict';
const { dialog, ipcMain, session } = require('electron');

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

// Asking comes first and the file is only touched after that. A cancelled dialog is a plain "no", not an error.
async function exportProject(workspace, window) {
  const space = workspace();
  const { id } = space.open();
  const { canceled, filePath } = await dialog.showSaveDialog(window(), {
    title: 'Save a copy of this project',
    defaultPath: `${space.open().title().replace(/[<>:"/\\|?*]/g, ' ').trim() || 'Project'}.rtstory`,
    filters: [{ name: 'RT Story Tracker project', extensions: ['rtstory'] }],
  });
  if (canceled || !filePath) return null;
  space.packProject(id, filePath);
  return filePath;
}

async function pickProjectFile(window) {
  const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
    title: 'Open a project file',
    properties: ['openFile'],
    filters: [{ name: 'RT Story Tracker project', extensions: ['rtstory'] }],
  });
  return canceled ? null : filePaths[0];
}

async function importProject(workspace, window, given) {
  const file = given ?? (await pickProjectFile(window));
  if (!file) return null;
  try {
    return workspace().importProject(file);
  } catch (error) {
    if (error.code !== 'EXISTS') throw error;
    const { response } = await dialog.showMessageBox(window(), {
      type: 'question',
      buttons: ['Replace it', 'Cancel'],
      cancelId: 1,
      message: `You already have “${error.title}”.`,
      detail: 'Replacing it opens this file instead. The project you have now goes to the Trash for 30 days, so you can get it back.',
    });
    return response === 0 ? workspace().importProject(file, { replace: true }) : null;
  }
}

function registerIpc({ status, workspace, updater, settings, backups, window, takeFile }) {
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
  handle('item:trash', (id) => workspace().trashItem(id));
  handle('item:restore', (id) => workspace().restoreItem(id));
  handle('trash:list', () => workspace().listTrash());
  handle('library:trashProject', (id) => workspace().trashProject(id));
  handle('library:restoreProject', (id) => workspace().restoreProject(id));
  handle('library:trashList', () => workspace().listProjectTrash());
  handle('version:list', (id) => workspace().listVersions(id));
  handle('version:get', (input) => workspace().getVersion(input));
  handle('version:restore', (input) => workspace().restoreVersion(input));
  handle('project:export', () => exportProject(workspace, window));
  handle('project:import', (file) => importProject(workspace, window, file));
  handle('app:takeFile', () => takeFile());
  handle('backup:chooseFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
      title: 'Choose a folder for backups',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled) return settings().values;
    return settings().save({ backupFolder: filePaths[0] });
  });
  handle('backup:now', () => backups().runNow());
  handle('backup:status', () => backups().status());
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
