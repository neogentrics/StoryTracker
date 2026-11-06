'use strict';
// App Link: Recon Towers apps on one computer find each other, link once and send each other documents. The rules live in
// docs/app-link.md in the rt-markdown-reader repo, and this follows them. It's RT Markdown Reader's own code with this
// app's name in it, so the two can't drift apart by accident. It doesn't use Electron: the caller gives it somewhere to
// keep keys, a way to ask the person and a way to take a document.
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const PROTOCOL = 1;
const APP_ID = 'storytracker';
const APP_NAME = 'RT Story Tracker';
const ACCEPTS = ['markdown', 'text'];
const MAX_LINE = 8 * 1024 * 1024;
const ASK_MS = 120000;
const CALL_MS = 5000;
const SEND_MS = 15000;
const DECLINED_MS = 30000; // An app that's been told no can't keep asking.

const validId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);

// A refusal with a reason other apps can act on.
class LinkError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Where running apps leave the file that says how to reach them.
function sharedFolder({ env = process.env, platform = process.platform, home }) {
  if (env.NMR_LINK_DIR) return env.NMR_LINK_DIR;
  const base = platform === 'win32' ? env.APPDATA || path.join(home, 'AppData', 'Roaming')
    : platform === 'darwin' ? path.join(home, 'Library', 'Application Support')
      : env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(base, 'Recon Towers', 'app-link');
}

function endpointFor(dir, platform = process.platform) {
  if (platform !== 'win32') return path.join(dir, 'app-link.sock');
  return `\\\\.\\pipe\\rt-app-link-${crypto.createHash('sha256').update(dir.toLowerCase()).digest('hex').slice(0, 16)}`;
}

// Only ever a pipe or socket on this computer, whatever a file in the folder says.
function validEndpoint(endpoint, platform = process.platform) {
  if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 1024) return false;
  if (platform === 'win32') return /^\\\\\.\\pipe\\[^\\/]+$/.test(endpoint);
  return path.isAbsolute(endpoint);
}

// A name another app gave us, safe to show: no control characters, nothing that reverses the text around it.
function cleanName(name, fallback = '') {
  if (typeof name !== 'string') return fallback;
  return name.replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, '').trim().slice(0, 80) || fallback;
}

// A name for a document that was sent, without any folders.
function documentName(name) {
  const base = cleanName(typeof name === 'string' ? name.split(/[\\/]/).pop() : '', 'Sent document');
  return /\.[a-z0-9]{1,8}$/i.test(base) ? base : `${base}.md`;
}

function sameKey(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// One request to another app, on its own connection.
function call(endpoint, method, params, timeout = CALL_MS) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(endpoint);
    let buffer = '';
    const stop = (done, value) => {
      clearTimeout(timer);
      sock.destroy();
      done(value);
    };
    const timer = setTimeout(() => stop(reject, new LinkError('timed_out', 'That app didn’t answer.')), timeout);
    sock.setEncoding('utf8');
    sock.on('error', () => stop(reject, new LinkError('not_running', 'That app isn’t running.')));
    sock.on('connect', () => sock.write(`${JSON.stringify({ id: 1, method, params })}\n`));
    sock.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > MAX_LINE) {
        stop(reject, new LinkError('failed', 'That app sent too much.'));
        return;
      }
      const at = buffer.indexOf('\n');
      if (at < 0) return;
      let reply;
      try {
        reply = JSON.parse(buffer.slice(0, at));
      } catch {
        stop(reject, new LinkError('failed', 'That app sent something unreadable.'));
        return;
      }
      if (reply?.error) stop(reject, new LinkError(String(reply.error.code || 'failed'), cleanName(reply.error.message, 'That app couldn’t do it.')));
      else stop(resolve, reply?.result);
    });
  });
}

class AppLink {
  // load and save keep { id: { name, key } }. ask({ id, name }) resolves true or false. open({ from, name, text, path,
  // attachments, kind }) takes a document.
  constructor({ folder, dataDir, version, load, save, ask, open, platform = process.platform, id = APP_ID, name = APP_NAME }) {
    Object.assign(this, { folder, dataDir, version, load, save, ask, open, platform, id, name });
    this.server = null;
    this.asking = false;
    this.declined = new Map();
    this.file = path.join(folder, `${id}.json`);
  }

  get running() {
    return Boolean(this.server);
  }

  async start() {
    if (this.server) return;
    const endpoint = endpointFor(this.dataDir, this.platform);
    if (this.platform !== 'win32') fs.rmSync(endpoint, { force: true }); // Left behind by a crash.
    const server = net.createServer((sock) => this.serve(sock));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(endpoint, resolve);
    });
    server.removeAllListeners('error');
    server.on('error', () => {});
    if (this.platform !== 'win32') fs.chmodSync(endpoint, 0o600);
    fs.mkdirSync(this.folder, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ protocol: PROTOCOL, id: this.id, name: this.name, version: this.version, endpoint }, null, 2));
    this.server = server;
  }

  async stop() {
    const { server } = this;
    this.server = null;
    fs.rmSync(this.file, { force: true });
    if (server) await new Promise((resolve) => { server.close(resolve); });
  }

  serve(sock) {
    let buffer = '';
    sock.setEncoding('utf8');
    sock.on('error', () => {});
    sock.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > MAX_LINE) {
        sock.destroy();
        return;
      }
      for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 1);
        this.answer(sock, line);
      }
    });
  }

  async answer(sock, line) {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      sock.destroy();
      return;
    }
    let reply;
    try {
      reply = { id: request?.id, result: await this.handle(request?.method, request?.params || {}) };
    } catch (error) {
      reply = error instanceof LinkError
        ? { id: request?.id, error: { code: error.code, message: error.message } }
        : { id: request?.id, error: { code: 'failed', message: `${this.name} couldn’t do that.` } };
    }
    if (!sock.destroyed) sock.write(`${JSON.stringify(reply)}\n`);
  }

  handle(method, params) {
    if (method === 'hello') return { protocol: PROTOCOL, app: this.id, name: this.name, version: this.version, accepts: ACCEPTS };
    if (method === 'pair') return this.pairRequest(params);
    if (method === 'open_document') return this.openRequest(params);
    if (method === 'unlink') return this.unlinkRequest(params);
    throw new LinkError('unknown_method', `${this.name} doesn’t have that method.`);
  }

  // The app making this request, once its key has been checked.
  caller({ app: id, key }) {
    const links = this.load();
    const link = validId(id) && Object.hasOwn(links, id) ? links[id] : null;
    if (!link || !sameKey(key, link.key)) throw new LinkError('not_linked', 'That app isn’t linked. Link it first.');
    return { id, ...link };
  }

  async pairRequest({ app: id, name }) {
    if (!validId(id) || id === this.id) throw new LinkError('bad_request', 'Give the app’s id.');
    const shown = cleanName(name);
    if (!shown) throw new LinkError('bad_request', 'Give the app’s name.');
    if (this.asking) throw new LinkError('busy', `${this.name} is already asking something.`);
    if (Date.now() - (this.declined.get(id) ?? -Infinity) < DECLINED_MS) throw new LinkError('declined', 'The link was declined.');
    this.asking = true;
    let timer;
    try {
      const answer = await Promise.race([
        this.ask({ id, name: shown }),
        new Promise((resolve) => { timer = setTimeout(() => resolve('timed_out'), ASK_MS); }),
      ]);
      if (answer === 'timed_out') throw new LinkError('timed_out', 'Nobody answered.');
      if (answer !== true) {
        this.declined.set(id, Date.now());
        throw new LinkError('declined', 'The link was declined.');
      }
    } finally {
      clearTimeout(timer);
      this.asking = false;
    }
    const key = crypto.randomBytes(32).toString('hex');
    this.save({ ...this.load(), [id]: { name: shown, key } });
    return { key, app: this.id, name: this.name };
  }

  async openRequest(params) {
    const from = this.caller(params);
    const { name, text, path: file, attachments, kind } = params;
    if (typeof file === 'string' && file) await this.open({ from: from.name, path: file, attachments, kind });
    else if (typeof text === 'string') await this.open({ from: from.name, name: documentName(name), text, attachments, kind });
    else throw new LinkError('bad_request', 'Give the document’s text or its path.');
    return { opened: true };
  }

  unlinkRequest(params) {
    const { id } = this.caller(params);
    const links = this.load();
    delete links[id];
    this.save(links);
    return { unlinked: true };
  }

  // Every app that's left a file in the folder and answers.
  async found() {
    let names = [];
    try {
      names = fs.readdirSync(this.folder);
    } catch {
      return [];
    }
    const seen = await Promise.all(names.filter((name) => name.endsWith('.json') && name !== `${this.id}.json`).map(async (name) => {
      try {
        const info = JSON.parse(fs.readFileSync(path.join(this.folder, name), 'utf8'));
        if (info?.protocol !== PROTOCOL || !validId(info.id) || `${info.id}.json` !== name || !validEndpoint(info.endpoint, this.platform)) return null;
        await call(info.endpoint, 'hello', {}, 1500);
        return { id: info.id, name: cleanName(info.name, info.id), endpoint: info.endpoint };
      } catch {
        return null;
      }
    }));
    return seen.filter(Boolean);
  }

  // Linked apps and apps that could be, for the person to see.
  async list() {
    const running = await this.found();
    const links = this.load();
    const apps = running.map((item) => ({ id: item.id, name: links[item.id]?.name || item.name, linked: Object.hasOwn(links, item.id), running: true }));
    for (const [id, link] of Object.entries(links)) {
      if (!apps.some((item) => item.id === id)) apps.push({ id, name: link.name, linked: true, running: false });
    }
    return apps.sort((a, b) => a.name.localeCompare(b.name));
  }

  async reach(id) {
    const found = (await this.found()).find((item) => item.id === id);
    if (!found) throw new LinkError('not_running', 'That app isn’t running.');
    return found;
  }

  // Asks another app to link with this one. The person answers over there.
  async pairWith(id) {
    const other = await this.reach(id);
    const result = await call(other.endpoint, 'pair', { app: this.id, name: this.name }, ASK_MS + 5000);
    if (typeof result?.key !== 'string' || result.key.length < 32) throw new LinkError('failed', 'That app didn’t finish linking.');
    this.save({ ...this.load(), [id]: { name: other.name, key: result.key } });
    return { name: other.name };
  }

  async send(id, { name, text }) {
    const link = this.load()[id];
    if (!link) throw new LinkError('not_linked', 'That app isn’t linked.');
    const other = await this.reach(id);
    await call(other.endpoint, 'open_document', { app: this.id, key: link.key, name: documentName(name), text }, SEND_MS);
    return { name: link.name };
  }

  // Forgets a link here, and tells the other app if it's there to hear it.
  async unlink(id) {
    const links = this.load();
    const link = links[id];
    if (!link) return;
    delete links[id];
    this.save(links);
    try {
      const other = await this.reach(id);
      await call(other.endpoint, 'unlink', { app: this.id, key: link.key });
    } catch {
      // It isn't running, or it has forgotten already.
    }
  }
}

module.exports = { APP_ID, AppLink, LinkError, PROTOCOL, call, cleanName, documentName, endpointFor, sharedFolder, validEndpoint, validId };
