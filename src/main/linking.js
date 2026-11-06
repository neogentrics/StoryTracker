'use strict';
// This app's side of App Link, and Open in RT Markdown Reader. docs/design/working-with-rt-markdown-reader.md has the
// reasoning. It stays off until the author turns it on, and a locked project never leaves through here.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppLink, LinkError, sharedFolder, validId } = require('./app-link');
const { exportFile, safeName } = require('./export');
const { writeFileSafely } = require('./storage/keys');

const READER_ID = 'rt-markdown-reader';
const LINKS_FILE = 'app-links.bin';
const OLD_LINKS_FILE = 'links.bin';
const SENT_FOLDER = /^rtst-send-[0-9a-f]{16}$/;
const LOCKED_WORDS = 'A locked project is never sent to another app. Take the password off first if you want to.';
const NOT_FOUND_WORDS = 'RT Markdown Reader isn’t on this computer, or it’s somewhere this app can’t find. If it’s running, link the two in Preferences.';

// Where the installers put it. There's no other way to ask for an app by name on Windows or Linux.
function readerPlaces({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  if (env.RTST_READER_APP) return [env.RTST_READER_APP];
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const programs = [path.join(local, 'Programs'), env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean);
    return programs.flatMap((dir) => ['neo-markdown-reader', 'rt-markdown-reader', 'RT Markdown Reader'].map((name) => path.join(dir, name, 'RT Markdown Reader.exe')));
  }
  if (platform === 'darwin') return ['/Applications/RT Markdown Reader.app', path.join(home, 'Applications', 'RT Markdown Reader.app')];
  return ['/opt/RT Markdown Reader/neo-markdown-reader', '/opt/RT Markdown Reader/rt-markdown-reader', '/usr/bin/neo-markdown-reader', '/usr/bin/rt-markdown-reader'];
}

function launchReader(app, file, { platform = process.platform, start = spawn } = {}) {
  const [command, args] = platform === 'darwin' && app.endsWith('.app') ? ['open', ['-a', app, file]] : [app, [file]];
  start(command, args, { detached: true, stdio: 'ignore' }).unref();
}

class Linking {
  constructor({ workspace, settings, vault, inbox, root, home, dataDir, version, ask, places = readerPlaces, launch = launchReader, tempDir = os.tmpdir() }) {
    Object.assign(this, { workspace, settings, vault, inbox, root, home, dataDir, version, ask, places, launch, tempDir });
    this.file = path.join(root, LINKS_FILE);
    // Links made under this app's old App Link id can't work, so they go, and the app offers to link again.
    fs.rmSync(path.join(root, OLD_LINKS_FILE), { force: true });
    this.memory = null;
    this.server = null;
    this.sentFolder = null;
    this.sweep();
  }

  // Keys go in the system's encrypted storage. Where it has none, they last until the app closes, and never touch a file.
  load() {
    if (this.memory) return { ...this.memory };
    if (!this.vault.available()) return {};
    try {
      const saved = JSON.parse(this.vault.open(fs.readFileSync(this.file)));
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  }

  save(links) {
    if (!this.vault.available()) {
      this.memory = { ...links };
      return;
    }
    writeFileSafely(this.file, this.vault.seal(JSON.stringify(links)));
  }

  async apply() {
    if (!this.settings.values.appLink) {
      await this.stop();
      return;
    }
    if (this.server) return;
    const server = new AppLink({
      folder: sharedFolder({ home: this.home }),
      dataDir: this.dataDir,
      version: this.version,
      load: () => this.load(),
      save: (links) => this.save(links),
      ask: this.ask,
      open: (document) => this.inbox.take(document),
    });
    await server.start();
    this.server = server;
  }

  async stop() {
    const { server } = this;
    this.server = null;
    await server?.stop();
  }

  async setOn(on) {
    this.settings.save({ appLink: on === true });
    try {
      await this.apply();
      return this.status();
    } catch {
      this.settings.save({ appLink: false });
      return { ...(await this.status()), error: 'App Link couldn’t start.' };
    }
  }

  async status() {
    return { on: this.settings.values.appLink, safe: this.vault.available(), apps: this.server ? await this.server.list() : [] };
  }

  async pair(id) {
    if (!this.server || !validId(id)) throw new Error('Turn on App Link first.');
    await this.server.pairWith(id);
    return this.status();
  }

  async unlink(id) {
    if (validId(id)) await this.server?.unlink(id);
    return this.status();
  }

  // A chapter or a book, as Markdown. The exporter only writes files, so it passes through one that's removed at once.
  async markdownOf(project, { scope, id }) {
    const folder = fs.mkdtempSync(path.join(this.tempDir, 'rtst-make-'));
    const file = path.join(folder, 'out.md');
    try {
      await exportFile(project, { scope, id, format: 'md', file });
      return fs.readFileSync(file, 'utf8');
    } finally {
      fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
    }
  }

  // Through the link if there is one and the app's running. If not, the same way as Open With, so no link is needed and it
  // starts the app if it's closed.
  async openInReader({ scope, id }) {
    if (this.workspace.locked) throw new Error(LOCKED_WORDS);
    const project = this.workspace.open();
    const item = project.getItem(id);
    if (!item || !['chapter', 'book'].includes(item.kind) || item.kind !== scope) throw new Error('Choose a chapter or a book.');
    const text = await this.markdownOf(project, { scope, id });
    const name = `${safeName(item.title)}.md`;
    if (this.server && Object.hasOwn(this.load(), READER_ID)) {
      try {
        await this.server.send(READER_ID, { name, text });
        return { how: 'link' };
      } catch (error) {
        if (!(error instanceof LinkError) || !['not_running', 'not_linked', 'timed_out'].includes(error.code)) throw error;
      }
    }
    return this.openThroughSystem(name, text);
  }

  openThroughSystem(name, text) {
    const app = this.places().find((place) => fs.existsSync(place));
    if (!app) throw new Error(NOT_FOUND_WORDS);
    if (!this.sentFolder) {
      this.sentFolder = path.join(this.tempDir, `rtst-send-${crypto.randomBytes(8).toString('hex')}`);
      fs.mkdirSync(this.sentFolder);
    }
    const file = path.join(this.sentFolder, name);
    fs.writeFileSync(file, text);
    this.launch(app, file);
    return { how: 'system' };
  }

  // The app that opened a file may still be reading it, so these wait for the app to close, and for the next start if it
  // didn't get that far. Only ever this app's own folders.
  sweep() {
    for (const name of fs.readdirSync(this.tempDir)) {
      if (SENT_FOLDER.test(name) || /^rtst-make-/.test(name)) fs.rmSync(path.join(this.tempDir, name), { recursive: true, force: true, maxRetries: 2 });
    }
  }

  clearSent() {
    if (this.sentFolder) fs.rmSync(this.sentFolder, { recursive: true, force: true, maxRetries: 2 });
    this.sentFolder = null;
  }

  async close() {
    this.clearSent();
    await this.stop();
  }
}

module.exports = { Linking, launchReader, readerPlaces };
