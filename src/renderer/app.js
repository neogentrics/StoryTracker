import { el } from './dom.js';
import { applyLook } from './look.js';
import { openPreferences } from './prefs.js';
import { renderFailure, renderHome } from './home.js';
import { openTrash } from './trash.js';
import { WritingRoom } from './writing-room.js';

const api = window.storyTracker;
const root = document.getElementById('app');
const LAST_PROJECT = 'lastProject';

const remember = {
  get: (key) => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
};

let room = null;

function ready() {
  document.body.dataset.state = 'ready';
}

async function enterRoom(opened) {
  remember.set(LAST_PROJECT, opened.id);
  room = new WritingRoom(root, opened, { api, onLibrary: leaveRoom, onPreferences: () => openPreferences(api), remember });
  await room.start();
  ready();
}

async function showHome() {
  const projects = await api.listProjects();
  renderHome(root, {
    projects,
    onOpen: (id) => run(async () => enterRoom(await api.openProject(id))),
    onCreate: (title) => run(async () => enterRoom(await api.createProject(title))),
    onSample: () => run(async () => enterRoom(await api.createSample())),
    onOpenFile: () => openProjectFile(),
    onTrashProject: (project) => {
      if (window.confirm(`Move “${project.title}” to the Trash? It waits there for 30 days.`)) {
        run(async () => {
          await api.trashProject(project.id);
          await showHome();
        });
      }
    },
    onShowTrash: () => showProjectTrash(),
    onRemoveSample: (id) => {
      const sure = window.confirm('Remove the sample? Anything you wrote in it goes with it.');
      if (sure) run(async () => {
        await api.removeSample(id);
        await showHome();
      });
    },
  });
  ready();
}

// Failures on the home screen are shown there, and never leave the author at an empty window.
async function run(work) {
  try {
    await work();
  } catch (error) {
    renderFailure(root, error.message);
    document.body.dataset.state = 'failed';
  }
}

function showProjectTrash() {
  return run(() =>
    openTrash({
      title: 'Projects in the Trash',
      load: () => api.listProjectTrash(),
      restore: async (id) => {
        await api.restoreProject(id);
        if (!room) await showHome();
      },
      onError: (text) => window.alert(text),
    }));
}

// A project file from the menu, a double-click, or a backup. If it replaces the open project, that closes first.
async function openProjectFile(file) {
  try {
    await room?.flush();
    const id = await api.importProject(file);
    if (!id) return;
    room?.leave();
    room = null;
    await enterRoom(await api.openProject(id));
  } catch (error) {
    if (room) room.showMessage(error.message);
    else window.alert(error.message);
  }
}

async function exportProject() {
  if (!room) return;
  try {
    await room.flush();
    const file = await api.exportProject();
    if (file) room.showInfo(`Saved a copy to ${file}`);
  } catch (error) {
    room.showMessage(error.message);
  }
}

async function leaveRoom() {
  try {
    await room?.flush();
  } catch (error) {
    room?.showMessage(`Stayed here, because your latest changes aren’t saved yet: ${error.message}`);
    return;
  }
  room?.leave();
  room = null;
  localStorage.removeItem(LAST_PROJECT);
  await run(async () => {
    await api.closeProject();
    await showHome();
  });
}

function showUpdate(status) {
  const banner = document.getElementById('update-banner');
  if (status.state === 'ready') {
    banner.replaceChildren(
      `Version ${status.version} is ready.`,
      el('button', {
        id: 'update-restart',
        onclick: async () => {
          await room?.flush();
          await api.installUpdate();
        },
      }, 'Restart to update'),
    );
  } else if (status.state === 'available') {
    banner.replaceChildren(
      `Version ${status.version} is out.`,
      el('a', { href: status.url, target: '_blank', rel: 'noreferrer' }, 'Download'),
    );
  } else {
    return;
  }
  banner.hidden = false;
}

function onMenu(command) {
  if (command === 'library') leaveRoom();
  if (command === 'new-chapter') room?.newChapterFromMenu();
  if (command === 'new-book') room?.newBookFromMenu();
  if (command === 'preferences') openPreferences(api);
  if (command === 'find') room?.find();
  if (command === 'replace') room?.find({ replacing: true });
  if (command === 'focus') room?.toggleFocus();
  if (command === 'history') room?.showHistory();
  if (command === 'trash') {
    if (room) room.showTrash();
    else showProjectTrash();
  }
  if (command === 'export') exportProject();
  if (command === 'open-file') openProjectFile();
}

async function start() {
  api.onFlush(() => room?.flush());
  api.onUpdate(showUpdate);
  api.onMenu(onMenu);
  api.onOpenFile((file) => openProjectFile(file));
  await run(async () => {
    applyLook(await api.settings());
    const status = await api.status();
    showUpdate(status.update);
    const file = await api.takeFile();
    if (file) {
      await showHome();
      await openProjectFile(file);
      return;
    }
    const last = remember.get(LAST_PROJECT);
    if (last) {
      const projects = await api.listProjects();
      if (projects.some((project) => project.id === last && project.state === 'ready')) {
        await enterRoom(await api.openProject(last));
        return;
      }
    }
    await showHome();
  });
}

start();
