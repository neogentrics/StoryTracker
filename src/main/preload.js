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
  removeEmpty: (id) => call('item:removeEmpty', id),
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
  installUpdate: () => call('update:install'),
  onUpdate: (callback) => listen('update:status', callback),
  onMenu: (callback) => listen('menu:command', callback),
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
