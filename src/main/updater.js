'use strict';
// Update checks against this project's GitHub Releases, copied from RT Markdown Reader.
//  - Installed Windows app and Linux AppImage: the update downloads in the background, then "Restart to update".
//  - Mac (the app isn't signed yet) and the Linux .deb can't replace themselves, so they're told a new version exists
//    and given the download page.
const { app, net } = require('electron');

const OWNER = 'neogentrics';
const REPO = 'rt-story-tracker';
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const FIRST_CHECK_MS = 8000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function canSelfUpdate() {
  if (process.platform === 'win32') return true;
  return process.platform === 'linux' && Boolean(process.env.APPIMAGE);
}

// The CI update test serves a newer build from this machine. Nothing but this machine is accepted.
function testFeed() {
  const feed = process.env.RTST_UPDATE_FEED;
  return feed && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(feed) ? feed : null;
}

function isNewer(version, current) {
  const parts = (value) => String(value).replace(/^v/, '').split('-')[0].split('.').map(Number);
  const [a, b] = [parts(version), parts(current)];
  for (let at = 0; at < 3; at += 1) {
    if ((a[at] ?? 0) !== (b[at] ?? 0)) return (a[at] ?? 0) > (b[at] ?? 0);
  }
  return false;
}

class Updater {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.status = { state: 'idle' };
    this.autoUpdater = null;
    this.running = false;
  }

  start() {
    if (!app.isPackaged || process.env.RTST_DISABLE_UPDATES) return;
    this.running = true;
    if (canSelfUpdate()) {
      ({ autoUpdater: this.autoUpdater } = require('electron-updater'));
      this.autoUpdater.autoDownload = true;
      this.autoUpdater.autoInstallOnAppQuit = true;
      if (testFeed()) this.autoUpdater.setFeedURL({ provider: 'generic', url: testFeed() });
      this.autoUpdater.on('update-available', (info) => this.emit({ state: 'downloading', version: info.version }));
      this.autoUpdater.on('update-downloaded', (info) => this.emit({ state: 'ready', version: info.version }));
      this.autoUpdater.on('error', () => {});
    }
    setTimeout(() => this.check(), FIRST_CHECK_MS);
    setInterval(() => this.check(), CHECK_EVERY_MS).unref();
  }

  emit(status) {
    this.status = status;
    this.onStatus(status);
  }

  async check() {
    if (!this.running) return { state: 'off' };
    try {
      if (this.autoUpdater) {
        const result = await this.autoUpdater.checkForUpdates();
        const latest = result?.updateInfo?.version;
        if (latest && isNewer(latest, app.getVersion())) {
          return this.status.state === 'ready' ? this.status : { state: 'downloading', version: latest };
        }
        return { state: 'current' };
      }
      const response = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `RTStoryTracker/${app.getVersion()}` },
      });
      if (response.status === 404) return { state: 'current' };
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      const release = await response.json();
      if (!isNewer(release.tag_name, app.getVersion())) return { state: 'current' };
      const status = {
        state: 'available',
        version: String(release.tag_name).replace(/^v/, ''),
        url: release.html_url ?? RELEASES_URL,
      };
      this.emit(status);
      return status;
    } catch (error) {
      return { state: 'error', message: error.message };
    }
  }

  installNow() {
    if (!this.autoUpdater || this.status.state !== 'ready') return false;
    setImmediate(() => this.autoUpdater.quitAndInstall(true, true));
    return true;
  }
}

module.exports = { Updater, isNewer };
