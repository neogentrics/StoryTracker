import { el } from './dom.js';
import { applyLook } from './look.js';
import { openPreferences } from './prefs.js';
import { renderFailure, renderHome } from './home.js';
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
  room = new WritingRoom(root, opened, { api, onLibrary: leaveRoom, remember });
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
}

async function start() {
  api.onFlush(() => room?.flush());
  api.onUpdate(showUpdate);
  api.onMenu(onMenu);
  await run(async () => {
    applyLook(await api.settings());
    const status = await api.status();
    showUpdate(status.update);
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
