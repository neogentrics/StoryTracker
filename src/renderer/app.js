import { el } from './dom.js';
import { applyLook } from './look.js';
import { openPreferences } from './prefs.js';
import { renderFailure, renderHome } from './home.js';
import { renderLock } from './lock-screen.js';
import { askNewPassword, openSecurity } from './security-dialog.js';
import { openTrash } from './trash.js';
import { WritingRoom } from './writing-room.js';

const api = window.storyTracker;
const root = document.getElementById('app');
const LAST_PROJECT = 'lastProject';

const remember = {
  get: (key) => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
};

const IDLE_CHECK_MS = 15000;

let room = null;
let lockedOpen = false;
let lastActive = Date.now();

function ready() {
  document.body.dataset.state = 'ready';
}

async function enterRoom(opened) {
  remember.set(LAST_PROJECT, opened.id);
  lockedOpen = Boolean(opened.locked);
  lastActive = Date.now();
  room = new WritingRoom(root, opened, { api, onLibrary: leaveRoom, onPreferences: () => openPreferences(api), onSecurity: showSecurity, remember });
  await room.start();
  ready();
  await room.showInbox();
}

// A document from another app. With a project open it's offered now. If not, the library says so, and it's offered as soon
// as a project opens, which for a locked one is after its password.
async function documentsChanged() {
  if (room) await room.showInbox();
  else if (document.querySelector('.project-list, .start-form') && !document.querySelector('#lock-screen')) await showHome();
}

function showSecurity() {
  if (!room) return null;
  return openSecurity({
    api,
    beforeChange: () => room?.flush(),
    onChanged: (opened) => { lockedOpen = Boolean(opened.locked); },
    onLock: () => lockProject(),
    onError: (text) => room?.showMessage(text),
  }).catch((error) => room?.showMessage(error.message));
}

// Whatever was open goes with the project. Unsaved words are saved first, and if they can't be, it stays open.
async function lockProject() {
  if (!room || !lockedOpen) return;
  const { projectId } = room;
  try {
    await room.flush();
  } catch (error) {
    room.showMessage(`Stayed open, because your latest changes aren’t saved yet: ${error.message}`);
    return;
  }
  if (!(await api.lockNow())) return;
  document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
  room.leave();
  room = null;
  lockedOpen = false;
  await showLock({ id: projectId, stay: true });
}

function watchForIdle() {
  const active = () => { lastActive = Date.now(); };
  for (const event of ['keydown', 'pointerdown', 'pointermove', 'wheel']) document.addEventListener(event, active, { passive: true, capture: true });
  setInterval(async () => {
    if (!room || !lockedOpen) return;
    const { lockAfter } = await api.settings();
    if (lockAfter && Date.now() - lastActive >= lockAfter * 60000) await lockProject();
  }, IDLE_CHECK_MS);
}

async function opened(result) {
  await enterRoom(result);
  if (result.mustReset) {
    document.getElementById('inbox')?.remove();
    await askNewPassword(api);
    await room.showInbox();
  }
}

// stay is for a project that has just been locked: opening it again straight away would undo that.
async function showLock({ id, title, stay = false }) {
  const info = await api.lockInfo(id);
  if (!stay && info.computer.quick && !info.computer.code) {
    try {
      await opened(await api.unlock({ id, how: 'computer' }));
      return;
    } catch {
      // This computer's way in didn't work, so the screen below offers the others.
    }
  }
  renderLock(root, {
    title: title ?? (info.label || 'Locked project'),
    computer: info.computer,
    open: async (request) => opened(await api.unlock({ id, ...request })),
    onBack: () => run(showHome),
  });
  ready();
}

function showFileLock({ file, label }) {
  renderLock(root, {
    title: label || 'Locked project',
    computer: { on: false, code: false, quick: false },
    open: async (request) => {
      const result = await api.importLocked({ file, ...request });
      if (result) await opened(result);
      else await showHome();
    },
    onBack: () => run(showHome),
  });
  ready();
}

async function showHome() {
  const [projects, waiting] = await Promise.all([api.listProjects(), api.inboxList()]);
  renderHome(root, {
    projects,
    waiting,
    onOpen: (id) => run(async () => enterRoom(await api.openProject(id))),
    onUnlock: (project) => run(() => showLock(project)),
    onCreate: (title) => run(async () => enterRoom(await api.createProject(title))),
    onSample: () => run(async () => enterRoom(await api.createSample())),
    onOpenFile: () => openProjectFile(),
    onFindFiles: () => run(async () => {
      const folder = await api.chooseFolder();
      if (!folder) return;
      await enterRoom(await api.createProject(folder.name));
      await room.findFiles({ chosen: folder });
    }),
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
    if (id.locked) {
      room?.leave();
      room = null;
      await api.closeProject();
      showFileLock(id);
      return;
    }
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
  if (command === 'export-book') room?.showExport();
  if (command === 'import') room?.showImport();
  if (command === 'find-files') room?.findFiles();
  if (command === 'attachments') room?.showAttachments();
  if (command === 'print') room?.showExport({ format: 'pdf', preview: true });
  if (command === 'details') room?.showDetails();
  if (command === 'open-file') openProjectFile();
  if (command === 'security') showSecurity();
  if (command === 'reader-chapter') room?.openInReader('chapter');
  if (command === 'reader-book') room?.openInReader('book');
  if (command === 'inbox') room?.showInbox();
  if (command === 'lock') {
    if (lockedOpen) lockProject();
    else showSecurity();
  }
  if (command === 'auto-lock') lockProject();
}

async function start() {
  api.onFlush(() => room?.flush());
  api.onUpdate(showUpdate);
  api.onMenu(onMenu);
  api.onOpenFile((file) => openProjectFile(file));
  api.onInbox(() => documentsChanged());
  watchForIdle();
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
      const project = projects.find((item) => item.id === last);
      if (project?.state === 'ready') {
        await enterRoom(await api.openProject(last));
        return;
      }
      if (project?.state === 'locked') {
        await showLock(project);
        return;
      }
    }
    await showHome();
  });
}

start();
