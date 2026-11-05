'use strict';
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registerIpc } = require('./ipc');
const { buildMenu } = require('./menu');
const { runSelfTest, writeInWindow } = require('./self-test');
const { Library } = require('./storage/library');
const { Updater } = require('./updater');
const { Workspace } = require('./workspace');

const selfTestFile = process.argv.find((arg) => arg.startsWith('--self-test='))?.slice('--self-test='.length);
const withMeasure = process.argv.includes('--measure');
const FLUSH_TIMEOUT_MS = 5000;

// A self-test gets its own throwaway profile, so it can never touch an author's library.
const scratch = selfTestFile ? fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-self-test-')) : null;
if (scratch) app.setPath('userData', path.join(scratch, 'profile'));
else if (process.env.RTST_USER_DATA) app.setPath('userData', process.env.RTST_USER_DATA);

let workspace = null;
let libraryError = null;
let mainWindow = null;
let flushCount = 0;
let quitting = false;

const updater = new Updater((status) => mainWindow?.webContents.send('update:status', status));

function openLibrary() {
  try {
    workspace = new Workspace(new Library(path.join(app.getPath('userData'), 'library')));
  } catch (error) {
    libraryError = error.message;
  }
}

function status() {
  if (!workspace) throw new Error(libraryError ?? 'The library has not opened.');
  return { version: app.getVersion(), update: updater.status };
}

// Asks the window to save whatever it's holding, and waits for it. A window that doesn't answer can't stop the app
// closing, and it can lose no more than the last few seconds.
function requestFlush(window) {
  return new Promise((resolve) => {
    if (window.isDestroyed() || window.webContents.isCrashed()) {
      resolve(false);
      return;
    }
    flushCount += 1;
    const channel = `app:flushed:${flushCount}`;
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners(channel);
      resolve(false);
    }, FLUSH_TIMEOUT_MS);
    ipcMain.once(channel, (_event, saved) => {
      clearTimeout(timer);
      resolve(saved);
    });
    window.webContents.send('app:flush', channel);
  });
}

function spellingMenu(window, params) {
  const fixes = params.dictionarySuggestions.map((word) => ({
    label: word,
    click: () => window.webContents.replaceMisspelling(word),
  }));
  const template = [
    ...fixes,
    ...(fixes.length ? [{ type: 'separator' }] : []),
    { role: 'cut', enabled: params.editFlags.canCut },
    { role: 'copy', enabled: params.editFlags.canCopy },
    { role: 'paste', enabled: params.editFlags.canPaste },
    { type: 'separator' },
    { role: 'selectAll' },
  ];
  Menu.buildFromTemplate(template).popup({ window });
}

function createWindow({ show = true } = {}) {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: 'RT Story Tracker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (show) window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('context-menu', (_event, params) => spellingMenu(window, params));
  // The saved work is safe in the database, so a crashed window just starts again.
  window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit' && !window.isDestroyed()) window.webContents.reload();
  });

  let saved = false;
  window.on('close', (event) => {
    if (saved || selfTestFile) return;
    event.preventDefault();
    requestFlush(window).finally(() => {
      saved = true;
      // Stopping the close above also cancelled any quit, and on a Mac closing the window wouldn't start it again.
      if (quitting) app.quit();
      else window.close();
    });
  });

  window.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
  return window;
}

function timeout(ms, value) {
  return new Promise((resolve) => setTimeout(resolve, ms, value));
}

async function windowState(window) {
  if (window.webContents.isLoading()) {
    const loaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
    await Promise.race([loaded, timeout(30000)]);
  }
  for (let tries = 0; tries < 100; tries += 1) {
    const state = await Promise.race([
      window.webContents.executeJavaScript("document.body.dataset.state ?? ''"),
      timeout(5000, ''),
    ]);
    if (state) return state;
    await timeout(100);
  }
  return 'timed out';
}

// The window goes first and is closed before the storage work, because that work holds up this process, and a window
// still loading behind it can stall for good.
async function selfTest() {
  let report;
  try {
    console.log('Self-test: waiting for the window');
    const state = await windowState(mainWindow);
    console.log(`Self-test: window is ${state}`);
    const writing = await Promise.race([
      writeInWindow(mainWindow, workspace, requestFlush).catch((error) => error.message),
      timeout(60000, 'timed out'),
    ]);
    console.log(`Self-test: writing is ${writing}`);
    workspace.closeProject();
    mainWindow.destroy();
    report = runSelfTest(path.join(scratch, 'work'), { withMeasure });
    report.checks.push({ name: 'opens the window', passed: state === 'ready', detail: state });
    report.checks.push({ name: 'writes and saves a chapter in the window', passed: writing === 'saved', detail: writing });
    report.ok = report.ok && state === 'ready' && writing === 'saved';
  } catch (error) {
    report = { ok: false, error: error.stack };
  }
  report.packaged = app.isPackaged;
  report.version = app.getVersion();
  fs.writeFileSync(selfTestFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Self-test: finished, ok is ${report.ok}`);
  try {
    fs.rmSync(path.join(scratch, 'work'), { recursive: true, force: true, maxRetries: 5 });
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 2 });
  } catch {
    // Chromium can still hold the small profile folder on Windows. The large test files are gone by now.
  }
  app.exit(report.ok ? 0 : 1);
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'none',
    title: 'About RT Story Tracker',
    message: 'RT Story Tracker',
    detail: `Version ${app.getVersion()}\nA place to write a book and keep everything around it.\nBuilt by the Recon Towers Dev Department.`,
  });
}

async function checkForUpdatesFromMenu() {
  const result = await updater.check();
  const messages = {
    current: `You have the latest version, ${app.getVersion()}.`,
    downloading: `Version ${result.version} is downloading. You'll be asked to restart when it's ready.`,
    ready: `Version ${result.version} is ready. Use Restart to update at the top of the window.`,
    available: `Version ${result.version} is available. Use Download at the top of the window.`,
    off: 'Updates are off in this copy of the app.',
    error: `Couldn't check for updates: ${result.message}`,
  };
  dialog.showMessageBox(mainWindow, { type: 'info', message: messages[result.state] ?? messages.current });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    openLibrary();
    registerIpc({
      status,
      workspace: () => {
        if (!workspace) throw new Error(libraryError ?? 'The library has not opened.');
        return workspace;
      },
      updater,
    });
    Menu.setApplicationMenu(
      buildMenu({
        send: (command) => mainWindow?.webContents.send('menu:command', command),
        checkForUpdates: checkForUpdatesFromMenu,
        about: showAbout,
      }),
    );
    mainWindow = createWindow({ show: !selfTestFile });
    if (selfTestFile) {
      selfTest();
    } else {
      updater.start();
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !selfTestFile) app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => workspace?.closeProject());
}
