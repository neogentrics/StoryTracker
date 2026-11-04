'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Library } = require('./storage/library');
const { runSelfTest } = require('./self-test');

const selfTestFile = process.argv.find((arg) => arg.startsWith('--self-test='))?.slice('--self-test='.length);
const withMeasure = process.argv.includes('--measure');

// A self-test gets its own throwaway profile, so it can never touch an author's library.
const scratch = selfTestFile ? fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-self-test-')) : null;
if (scratch) app.setPath('userData', path.join(scratch, 'profile'));
else if (process.env.RTST_USER_DATA) app.setPath('userData', process.env.RTST_USER_DATA);

let library = null;
let libraryError = null;
let mainWindow = null;

function openLibrary() {
  try {
    library = new Library(path.join(app.getPath('userData'), 'library'));
  } catch (error) {
    libraryError = error.message;
  }
}

function status() {
  if (!library) return { ok: false, error: libraryError ?? 'The library has not opened.' };
  return { ok: true, version: app.getVersion(), projects: library.listProjects().length };
}

function createWindow({ show = true } = {}) {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
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
  window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return window;
}

async function windowState(window) {
  if (window.webContents.isLoading()) {
    await new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
  }
  for (let tries = 0; tries < 100; tries += 1) {
    const state = await window.webContents.executeJavaScript("document.body.dataset.state ?? ''");
    if (state) return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return 'timed out';
}

async function selfTest() {
  let report;
  try {
    report = runSelfTest(path.join(scratch, 'work'), { withMeasure });
    const state = await windowState(mainWindow);
    report.checks.push({ name: 'opens the window', passed: state === 'ready', detail: state });
    report.ok = report.ok && state === 'ready';
  } catch (error) {
    report = { ok: false, error: error.stack };
  }
  report.packaged = app.isPackaged;
  report.version = app.getVersion();
  fs.writeFileSync(selfTestFile, `${JSON.stringify(report, null, 2)}\n`);
  mainWindow.destroy();
  try {
    fs.rmSync(path.join(scratch, 'work'), { recursive: true, force: true, maxRetries: 5 });
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 2 });
  } catch {
    // Chromium can still hold the small profile folder on Windows. The large test files are gone by now.
  }
  app.exit(report.ok ? 0 : 1);
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
    ipcMain.handle('app:status', status);
    openLibrary();
    mainWindow = createWindow({ show: !selfTestFile });
    if (selfTestFile) selfTest();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
