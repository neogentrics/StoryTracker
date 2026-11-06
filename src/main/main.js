'use strict';
const { app, BrowserWindow, dialog, ipcMain, Menu, powerMonitor, safeStorage, session, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Backups } = require('./backups');
const { exportFile } = require('./export');
const { Importer } = require('./import');
const { registerIpc } = require('./ipc');
const { buildMenu } = require('./menu');
const { Security } = require('./security');
const { runSelfTest, writeInWindow } = require('./self-test');
const { Settings } = require('./settings');
const { Library } = require('./storage/library');
const { TrustedComputer } = require('./storage/trusted');
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
let settings = null;
let backups = null;
let security = null;
let pendingFile = process.argv.slice(1).find((arg) => arg.toLowerCase().endsWith('.rtstory')) ?? null;
let libraryError = null;
let mainWindow = null;
let flushCount = 0;
let quitting = false;

const updater = new Updater((status) => mainWindow?.webContents.send('update:status', status));

// The system's own encrypted storage. On Linux with no keyring Electron falls back to a fixed password, which is no
// protection at all, so that counts as having none.
const systemVault = {
  available: () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  seal: (text) => safeStorage.encryptString(text),
  open: (data) => safeStorage.decryptString(data),
};

function openLibrary() {
  try {
    const root = path.join(app.getPath('userData'), 'library');
    workspace = new Workspace(new Library(root));
    settings = new Settings(root);
    backups = new Backups(workspace, settings);
    security = new Security({
      workspace,
      backups,
      trusted: new TrustedComputer(root, systemVault),
      onProgress: (progress) => mainWindow?.webContents.send('security:progress', progress),
    });
    session.defaultSession.setSpellCheckerEnabled(settings.values.spellcheck);
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
  const word = params.misspelledWord;
  const add = word
    ? [{ label: `Add “${word}” to Dictionary`, click: () => window.webContents.session.addWordToSpellCheckerDictionary(word) }]
    : [];
  const template = [
    ...fixes,
    ...add,
    ...(fixes.length || word ? [{ type: 'separator' }] : []),
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
  window.on('closed', () => {
    if (window === mainWindow) BrowserWindow.getAllWindows().forEach((other) => other.close());
  });
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

// Print files load fonts from inside the installed app, so this is only proven by doing it from there.
async function exportFromHere() {
  const project = workspace.open();
  for (const format of ['pdf', 'epub', 'docx']) {
    const file = path.join(scratch, `self-test.${format}`);
    const { size } = await exportFile(project, { scope: 'project', format, file });
    if (size < 1000) return `${format} came out empty`;
  }
  return 'exported';
}

// The readers for Word, e-books and PDF are libraries that load from inside the installed app, so this proves them there.
async function importFromHere() {
  for (const format of ['pdf', 'epub', 'docx']) {
    const { importedWords } = await new Importer().inspect(path.join(scratch, `self-test.${format}`));
    if (importedWords < 5) return `${format} came back with ${importedWords} words`;
  }
  const project = workspace.open();
  const picture = await project.addAttachment(project.id, { name: 'self-test.pdf', source: path.join(scratch, 'self-test.pdf') });
  const back = await project.attachments.read(project.attachment(picture.id).file);
  if (!back.equals(fs.readFileSync(path.join(scratch, 'self-test.pdf')))) return 'an attachment came back different';
  return 'imported';
}

// The password stretching and the new key are native code inside the installed app, so this proves them there.
async function lockFromHere() {
  const { id } = workspace.open();
  const password = 'correct horse battery staple';
  security.makeRecovery();
  await security.setPassword({ password });
  workspace.closeProject();
  if (workspace.library.describe(id).state !== 'locked') return 'it wasn’t locked';
  const refused = await security.unlock({ id, how: 'password', secret: 'the wrong password' }).then(() => false, () => true);
  if (!refused) return 'a wrong password opened it';
  await security.unlock({ id, how: 'password', secret: password });
  const project = workspace.open();
  const [attachment] = project.listAttachments(id);
  const back = await project.attachments.read(project.attachment(attachment.id).file);
  return back.equals(fs.readFileSync(path.join(scratch, 'self-test.pdf'))) ? 'locked' : 'an attachment came back different';
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
    const printed = await Promise.race([exportFromHere().catch((error) => error.message), timeout(120000, 'timed out')]);
    console.log(`Self-test: print export is ${printed}`);
    const imported = await Promise.race([importFromHere().catch((error) => error.message), timeout(60000, 'timed out')]);
    console.log(`Self-test: import is ${imported}`);
    const locked = await Promise.race([lockFromHere().catch((error) => error.message), timeout(60000, 'timed out')]);
    console.log(`Self-test: lock is ${locked}`);
    workspace.closeProject();
    mainWindow.destroy();
    report = runSelfTest(path.join(scratch, 'work'), { withMeasure });
    report.checks.push({ name: 'opens the window', passed: state === 'ready', detail: state });
    report.checks.push({ name: 'writes and saves a chapter in the window', passed: writing === 'saved', detail: writing });
    report.checks.push({ name: 'exports a print PDF, an e-book and a Word file', passed: printed === 'exported', detail: printed });
    report.checks.push({ name: 'reads those three files back in, and keeps an attachment', passed: imported === 'imported', detail: imported });
    report.checks.push({ name: 'locks a project with a password and opens it again', passed: locked === 'locked', detail: locked });
    report.ok = report.ok && state === 'ready' && writing === 'saved' && printed === 'exported' && imported === 'imported' && locked === 'locked';
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
  // A double-clicked .rtstory file: Windows and Linux pass it to a second copy of the app, and Mac sends this event.
  const openFile = (file) => {
    if (mainWindow?.webContents.isLoading() === false) mainWindow.webContents.send('app:openFile', file);
    else pendingFile = file;
  };
  app.on('open-file', (event, file) => {
    event.preventDefault();
    openFile(file);
  });

  app.on('second-instance', (_event, argv) => {
    const file = argv.slice(1).find((arg) => arg.toLowerCase().endsWith('.rtstory'));
    if (file) openFile(file);
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
      settings: () => {
        if (!settings) throw new Error(libraryError ?? 'The library has not opened.');
        return settings;
      },
      updater,
      backups: () => backups,
      security: () => security,
      window: () => mainWindow,
      takeFile: () => {
        const file = pendingFile;
        pendingFile = null;
        return file;
      },
    });
    Menu.setApplicationMenu(
      buildMenu({
        send: (command) => mainWindow?.webContents.send('menu:command', command),
        checkForUpdates: checkForUpdatesFromMenu,
        about: showAbout,
      }),
    );
    mainWindow = createWindow({ show: !selfTestFile });
    // A locked project shouldn't stay open behind a locked screen or a sleeping laptop.
    for (const event of ['lock-screen', 'suspend']) powerMonitor.on(event, () => mainWindow?.webContents.send('menu:command', 'auto-lock'));
    if (selfTestFile) {
      selfTest();
    } else {
      updater.start();
      backups?.start();
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

  app.on('will-quit', () => security?.close());
}
