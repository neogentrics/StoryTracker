'use strict';
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function listen(channel, callback) {
  ipcRenderer.on(channel, (_event, ...args) => callback(...args));
}

contextBridge.exposeInMainWorld('storyTracker', {
  status: () => call('app:status'),
  listProjects: () => call('library:list'),
  removeSample: (id) => call('library:removeSample', id),
  createProject: (title) => call('project:create', title),
  createSample: () => call('project:createSample'),
  openProject: (id) => call('project:open', id),
  closeProject: () => call('project:close'),
  addItem: (input) => call('item:add', input),
  rename: (input) => call('item:rename', input),
  move: (input) => call('item:move', input),
  trashItem: (id) => call('item:trash', id),
  restoreItem: (id) => call('item:restore', id),
  listTrash: () => call('trash:list'),
  trashProject: (id) => call('library:trashProject', id),
  restoreProject: (id) => call('library:restoreProject', id),
  listProjectTrash: () => call('library:trashList'),
  listVersions: (id) => call('version:list', id),
  getVersion: (input) => call('version:get', input),
  restoreVersion: (input) => call('version:restore', input),
  exportProject: () => call('project:export'),
  importProject: (file) => call('project:import', file),
  importLocked: (input) => call('project:importLocked', input),
  linkStatus: () => call('link:status'),
  setLink: (on) => call('link:set', on),
  pairApp: (id) => call('link:pair', id),
  unlinkApp: (id) => call('link:unlink', id),
  openInReader: (input) => call('link:openInReader', input),
  inboxList: () => call('inbox:list'),
  inboxAdd: (input) => call('inbox:add', input),
  inboxDrop: (id) => call('inbox:drop', id),
  onInbox: (callback) => listen('inbox:changed', callback),
  securityStatus: () => call('security:status'),
  lockInfo: (id) => call('security:lockInfo', id),
  unlock: (input) => call('security:unlock', input),
  confirmPassword: (secret) => call('security:confirm', secret),
  makeRecovery: () => call('security:makeRecovery'),
  saveRecovery: (input) => call('security:saveRecovery', input),
  printRecovery: (text) => call('security:printRecovery', text),
  setPassword: (input) => call('security:setPassword', input),
  dropEarlierBackups: () => call('security:dropEarlier'),
  removeLock: () => call('security:removeLock'),
  changePassword: (password) => call('security:changePassword', password),
  replaceRecovery: () => call('security:replaceRecovery'),
  renameLocked: (label) => call('security:rename', label),
  trustComputer: () => call('security:trust'),
  untrustComputer: () => call('security:untrust'),
  setQuickOpen: (quick) => call('security:setQuick', quick),
  beginAuthenticator: () => call('security:beginAuthenticator'),
  confirmAuthenticator: (code) => call('security:confirmAuthenticator', code),
  removeAuthenticator: () => call('security:removeAuthenticator'),
  lockNow: () => call('security:lockNow'),
  onLockProgress: (callback) => listen('security:progress', callback),
  takeFile: () => call('app:takeFile'),
  chooseBackupFolder: () => call('backup:chooseFolder'),
  backupNow: () => call('backup:now'),
  backupStatus: () => call('backup:status'),
  loadChapter: (id) => call('chapter:load', id),
  saveChapter: (input) => call('chapter:save', input),
  setGoal: (input) => call('item:setGoal', input),
  listComments: (id) => call('comment:list', id),
  addComment: (input) => call('comment:add', input),
  editComment: (input) => call('comment:edit', input),
  removeComment: (id) => call('comment:remove', id),
  search: (input) => call('find:search', input),
  replaceAll: (input) => call('find:replaceAll', input),
  undoReplace: () => call('find:undo'),
  settings: () => call('settings:get'),
  saveSettings: (changes) => call('settings:save', changes),
  dictionary: () => call('dictionary:list'),
  addWord: (word) => call('dictionary:add', word),
  removeWord: (word) => call('dictionary:remove', word),
  getDetails: (id) => call('details:get', id),
  saveDetails: (input) => call('details:save', input),
  chooseCover: (id) => call('cover:choose', id),
  removeCover: (id) => call('cover:remove', id),
  checkExport: (input) => call('export:check', input),
  runExport: (input) => call('export:run', input),
  exportEverything: () => call('export:everything'),
  previewExport: (input) => call('export:preview', input),
  revealFile: (file) => call('export:reveal', file),
  chooseFolder: () => call('folder:choose'),
  scanFolder: () => call('folder:scan'),
  editFolderPlan: (change) => call('folder:edit', change),
  runFolderImport: () => call('folder:run'),
  stopFolderImport: () => call('folder:stop'),
  pendingFolderImport: () => call('folder:pending'),
  resumeFolderImport: () => call('folder:resume'),
  discardFolderImport: () => call('folder:discard'),
  saveFolderReport: (report) => call('folder:saveReport', report),
  onFolderProgress: (callback) => listen('folder:progress', callback),
  listAttachments: (id) => call('attachments:list', id),
  addAttachments: (parentId) => call('attachments:add', parentId),
  previewAttachment: (id) => call('attachments:preview', id),
  saveAttachment: (id) => call('attachments:save', id),
  chooseImport: () => call('import:choose'),
  previewImport: (input) => call('import:preview', input),
  commitImport: (input) => call('import:commit', input),
  installUpdate: () => call('update:install'),
  onUpdate: (callback) => listen('update:status', callback),
  onMenu: (callback) => listen('menu:command', callback),
  onOpenFile: (callback) => listen('app:openFile', callback),
  onFlush: (callback) => {
    listen('app:flush', async (channel) => {
      let saved = true;
      try {
        await callback();
      } catch {
        saved = false;
      }
      ipcRenderer.send(channel, saved);
    });
  },
});
