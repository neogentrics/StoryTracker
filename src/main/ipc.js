'use strict';
const { BrowserWindow, dialog, ipcMain, nativeImage, session, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EXPORT_FORMATS } = require('../shared/details');
const { checkExport, exportEverything, exportFile, safeName } = require('./export');
const { FolderImport } = require('./folder');
const { IMPORT_EXTENSIONS, Importer } = require('./import');

const MAX_COVER = 50 * 1024 * 1024;
const importer = new Importer();
const folderImport = new FolderImport();
let chosenFolder = null;

// The window can only ask to scan the folder the author just picked, never a path of its own.
async function chooseFolder(window) {
  const { canceled, filePaths } = await dialog.showOpenDialog(window(), { title: 'Where are your files?', properties: ['openDirectory'] });
  if (canceled) return null;
  [chosenFolder] = filePaths;
  return { name: path.basename(chosenFolder) };
}

async function saveFolderReport(window) {
  const { canceled, filePath } = await dialog.showSaveDialog(window(), {
    title: 'Save the report',
    defaultPath: 'Find my files report.txt',
    filters: [{ name: 'Text', extensions: ['txt'] }],
  });
  return canceled ? null : filePath;
}

async function addAttachments(workspace, window, parentId) {
  const { canceled, filePaths } = await dialog.showOpenDialog(window(), { title: 'Add attachments', properties: ['openFile', 'multiSelections'] });
  return canceled ? 0 : workspace().addAttachments({ parentId, files: filePaths });
}

async function saveAttachment(workspace, window, id) {
  const { name } = workspace().open().attachment(id);
  const { canceled, filePath } = await dialog.showSaveDialog(window(), { title: 'Save a copy', defaultPath: name });
  if (canceled || !filePath) return null;
  await workspace().saveAttachment(id, filePath);
  return filePath;
}

async function chooseImport(window) {
  const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
    title: 'Import a file',
    properties: ['openFile'],
    filters: [{ name: 'Writing', extensions: IMPORT_EXTENSIONS }],
  });
  if (canceled) return null;
  return importer.inspect(filePaths[0]);
}

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
  await space.packProjectLater(id, filePath);
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

async function chooseCover(workspace, window, bookId) {
  const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
    title: 'Choose a cover picture',
    properties: ['openFile'],
    filters: [{ name: 'Pictures', extensions: ['jpg', 'jpeg', 'png'] }],
  });
  if (canceled) return null;
  const [file] = filePaths;
  const data = fs.readFileSync(file);
  if (data.length > MAX_COVER) throw new Error('That picture is too large. Stores ask for under 50 MB.');
  const { width, height } = nativeImage.createFromBuffer(data).getSize();
  if (!width) throw new Error("That picture couldn't be read. Use a JPEG or PNG.");
  const type = path.extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  workspace().setCover(bookId, { type, data, width, height });
  return { width, height, url: `data:${type};base64,${data.toString('base64')}` };
}

function exportName(project, input) {
  const item = input.scope === 'project' ? project.getItem(project.id) : project.getItem(input.id);
  return `${safeName(item?.title)}.${EXPORT_FORMATS[input.format].extension}`;
}

async function runExport(workspace, window, input) {
  const project = workspace().open();
  const format = EXPORT_FORMATS[input.format];
  if (!format) throw new Error("That format isn't known.");
  const { canceled, filePath } = await dialog.showSaveDialog(window(), {
    title: 'Export',
    defaultPath: exportName(project, input),
    filters: [{ name: format.label, extensions: [format.extension] }],
  });
  if (canceled || !filePath) return null;
  return exportFile(project, { ...input, file: filePath });
}

async function everything(workspace, window) {
  const { canceled, filePaths } = await dialog.showOpenDialog(window(), {
    title: 'Choose a folder for the whole project',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled) return null;
  return exportEverything(workspace().open(), filePaths[0]);
}

// Chromium's own PDF viewer, which also has the print button. The file goes when the window does.
async function preview(workspace, input) {
  const file = path.join(os.tmpdir(), `rtst-preview-${process.pid}-${Date.now()}.pdf`);
  await exportFile(workspace().open(), { ...input, format: 'pdf', file });
  const viewer = new BrowserWindow({
    width: 900,
    height: 900,
    title: 'Print preview',
    webPreferences: { plugins: true, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  viewer.setMenuBarVisibility(false);
  viewer.on('closed', () => fs.rmSync(file, { force: true }));
  await viewer.loadFile(file);
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
  handle('details:get', (id) => workspace().getDetails(id));
  handle('details:save', (input) => workspace().saveDetails(input));
  handle('cover:choose', (id) => chooseCover(workspace, window, id));
  handle('cover:remove', (id) => workspace().removeCover(id));
  handle('export:check', (input) => checkExport(workspace().open(), input));
  handle('export:run', (input) => runExport(workspace, window, input));
  handle('export:everything', () => everything(workspace, window));
  handle('export:preview', (input) => preview(workspace, input));
  handle('export:reveal', (file) => shell.showItemInFolder(String(file)));
  const folderProgress = (data) => window()?.webContents.send('folder:progress', data);
  handle('folder:choose', () => chooseFolder(window));
  handle('folder:scan', () => {
    if (!chosenFolder) throw new Error('Choose a folder first.');
    return folderImport.scan(workspace(), chosenFolder, folderProgress);
  });
  handle('folder:edit', (change) => folderImport.edit(workspace(), change));
  handle('folder:run', () => folderImport.run(workspace(), folderProgress));
  handle('folder:stop', () => folderImport.stop());
  handle('folder:pending', () => folderImport.pending(workspace()));
  handle('folder:resume', () => folderImport.resume(workspace(), folderProgress));
  handle('folder:discard', () => folderImport.discard(workspace()));
  handle('folder:saveReport', async (report) => {
    const file = await saveFolderReport(window);
    if (file) fs.writeFileSync(file, folderImport.reportText(report));
    return file;
  });
  handle('attachments:list', (id) => workspace().listAttachments(id));
  handle('attachments:add', (parentId) => addAttachments(workspace, window, parentId));
  handle('attachments:preview', (id) => workspace().previewAttachment(id));
  handle('attachments:save', (id) => saveAttachment(workspace, window, id));
  handle('import:choose', () => chooseImport(window));
  handle('import:preview', (input) => importer.preview(input));
  handle('import:commit', (input) => importer.commit(workspace(), input));
  handle('update:install', () => updater.installNow());
}

module.exports = { registerIpc };
