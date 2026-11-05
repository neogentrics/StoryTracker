'use strict';
// CI only, on Windows: installs this build, writes a chapter in it, then updates it to a newer build the way an author
// would, by clicking Restart to update. The new version must arrive and the chapter must still be there.
// Never run this on a computer you use: it installs and removes the app.
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const { execFileSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

if (!process.env.CI) throw new Error('This installs and removes the app, so it only runs on CI.');

const root = path.join(__dirname, '..');
const release = path.join(root, 'release');
const packageFile = path.join(root, 'package.json');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-update-'));
const SENTENCE = 'Written before the update.';
const APP_EXE = 'RT Story Tracker.exe';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const setup = () => path.join(release, fs.readdirSync(release).find((name) => name.endsWith('-Setup.exe')));

function installFolder() {
  const dir = ['rt-story-tracker', 'RT Story Tracker']
    .map((name) => path.join(process.env.LOCALAPPDATA, 'Programs', name))
    .find((item) => fs.existsSync(path.join(item, APP_EXE)));
  if (!dir) throw new Error('The app is not installed.');
  return dir;
}

function buildNewer() {
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const [major, minor, patch] = pkg.version.split('-')[0].split('.').map(Number);
  pkg.version = `${major}.${minor}.${patch + 1}`;
  fs.writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
  fs.rmSync(release, { recursive: true, force: true, maxRetries: 5 });
  execSync('npm run dist:win', { cwd: root, stdio: 'inherit' });
  return pkg.version;
}

function serve() {
  const server = http.createServer((request, response) => {
    const file = path.join(release, decodeURIComponent(new URL(request.url, 'http://x').pathname));
    if (!file.startsWith(release) || !fs.existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    console.log(`Update server: ${request.method} ${request.url}`);
    response.writeHead(200, { 'Content-Length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const launch = (feed) =>
  electron.launch({
    executablePath: path.join(installFolder(), APP_EXE),
    env: { ...process.env, RTST_USER_DATA: profile, ...(feed ? { RTST_UPDATE_FEED: feed } : { RTST_DISABLE_UPDATES: '1' }) },
  });

async function waitForVersion(version) {
  for (let tries = 0; tries < 120; tries += 1) {
    await sleep(2000);
    const installed = execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      "(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | Where-Object DisplayName -like 'RT Story Tracker*').DisplayVersion",
    ], { encoding: 'utf8' }).trim();
    if (installed === version) return;
  }
  throw new Error(`Version ${version} never arrived.`);
}

(async () => {
  const oldSetup = path.join(profile, 'old-setup.exe');
  fs.copyFileSync(setup(), oldSetup);
  const oldVersion = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
  const newVersion = buildNewer();
  console.log(`Updating ${oldVersion} to ${newVersion}`);

  execFileSync('powershell', ['-NoProfile', '-Command', `Start-Process -Wait -FilePath '${oldSetup}' -ArgumentList '/S'`]);

  const server = await serve();
  const feed = `http://127.0.0.1:${server.address().port}/`;
  let app = await launch(feed);
  let window = await app.firstWindow();
  await window.waitForSelector('body[data-state="ready"]');
  await window.fill('#new-title', 'Update test');
  await window.click('#start-project');
  await window.waitForSelector('.ProseMirror');
  await window.click('.ProseMirror');
  await window.keyboard.type(SENTENCE);

  await window.waitForSelector('#update-restart', { timeout: 180000 });
  console.log('The update downloaded, and the app offered to restart.');
  await window.click('#update-restart').catch(() => {}); // The app may close before the click reports back.
  await waitForVersion(newVersion);
  console.log(`Installed version is now ${newVersion}.`);
  server.close();

  // The update reopens the app, and a second copy would only hand over to that one.
  await sleep(10000);
  try {
    execSync(`taskkill /F /T /IM "${APP_EXE}"`, { stdio: 'ignore' });
  } catch {
    // It hadn't reopened, which is fine for this test.
  }
  await sleep(2000);

  app = await launch();
  window = await app.firstWindow();
  await window.waitForSelector('.ProseMirror');
  assert.equal(await app.evaluate(({ app: electronApp }) => electronApp.getVersion()), newVersion);
  assert.equal(await window.textContent('.ProseMirror'), SENTENCE, 'the chapter came through the update');
  await app.close();

  const dir = installFolder();
  const uninstaller = fs.readdirSync(dir).find((name) => /^Uninstall.*\.exe$/.test(name));
  execFileSync('powershell', ['-NoProfile', '-Command', `Start-Process -Wait -FilePath '${path.join(dir, uninstaller)}' -ArgumentList '/S','_?=${dir}'`]);
  console.log('The update kept the writing.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
