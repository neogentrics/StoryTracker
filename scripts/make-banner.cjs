'use strict';
// Remakes docs/brand/banner.png and social-preview.png from the app icon and a real screenshot, in the look of the
// other Recon Towers apps. Only needed when the app's look changes. Uses the Edge or Chrome already on this computer.
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const brand = path.join(root, 'docs', 'brand');
const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const icon = dataUrl(path.join(root, 'build', 'icon.png'), 'image/png');
const shot = dataUrl(path.join(root, 'docs', 'screenshots', 'writing.png'), 'image/png');
const mark = dataUrl(path.join(brand, 'recon-towers.png'), 'image/png');

const css = `
  * { box-sizing: border-box; margin: 0; }
  body { width: var(--w); height: var(--h); overflow: hidden; position: relative; color: #fff;
    font-family: 'Segoe UI', sans-serif; background:
      radial-gradient(60% 90% at 12% 18%, #4a2391 0%, transparent 70%),
      radial-gradient(40% 70% at 100% 0%, #5a1f24 0%, transparent 70%),
      radial-gradient(40% 60% at 42% 110%, #0f4f5c 0%, transparent 70%), #0a0612; }
  .dots { position: absolute; inset: 0; background-image: radial-gradient(rgb(255 255 255 / 7%) 1px, transparent 1px);
    background-size: 26px 26px; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 10px;
    background: linear-gradient(90deg, #2e8fe0, #7c3aed, #d8413f, #f2b417); }
  .dept { display: flex; align-items: center; gap: 22px; font: 500 30px/1 Consolas, monospace; letter-spacing: .14em;
    color: #b79cff; }
  .dept img { width: 62px; height: 62px; object-fit: contain; }
  .title { display: flex; align-items: center; gap: 44px; }
  .title img { width: 176px; height: 176px; flex: none; }
  h1 { font: 400 150px/1 Georgia, 'Times New Roman', serif; letter-spacing: -.02em; }
  .line { font: italic 400 56px/1.2 Georgia, 'Times New Roman', serif; color: #e9e2fb; }
  .pills { display: flex; gap: 20px; }
  .pills span { padding: 14px 26px; border: 2px solid #3d2c66; border-radius: 40px; font: 500 28px/1 Consolas, monospace;
    background: rgb(255 255 255 / 3%); }
  .copy { position: absolute; left: 128px; top: 100px; display: grid; gap: 44px; }
  .shot { position: absolute; right: -120px; top: 110px; width: 1160px; border-radius: 18px;
    box-shadow: 0 30px 80px rgb(0 0 0 / 60%); transform: perspective(2400px) rotateY(-9deg) rotateZ(-1deg); }
`;

const banner = `<style>:root{--w:2560px;--h:840px}${css}</style><div class="dots"></div>
  <img class="shot" src="${shot}" alt="">
  <div class="copy">
    <div class="dept"><img src="${mark}" alt="">RECON TOWERS DEV DEPARTMENT</div>
    <div class="title"><img src="${icon}" alt=""><h1>RT Story<br>Tracker</h1></div>
    <p class="line">A place to write the book.</p>
    <div class="pills"><span>Windows</span><span>macOS</span><span>Linux</span><span>Offline</span><span>Encrypted</span></div>
  </div><div class="bar"></div>`;

const social = `<style>:root{--w:1280px;--h:640px}${css}
    .copy { left: 76px; top: 110px; gap: 30px; } .dept { font-size: 20px; gap: 14px; } .dept img { width: 40px; height: 40px; }
    .title { gap: 28px; } .title img { width: 130px; height: 130px; } h1 { font-size: 92px; } .line { font-size: 38px; }
    .pills { gap: 12px; } .pills span { font-size: 20px; padding: 10px 18px; }
  </style><div class="dots"></div>
  <div class="copy">
    <div class="dept"><img src="${mark}" alt="">RECON TOWERS DEV DEPARTMENT</div>
    <div class="title"><img src="${icon}" alt=""><h1>RT Story<br>Tracker</h1></div>
    <p class="line">A place to write the book.</p>
    <div class="pills"><span>Windows</span><span>macOS</span><span>Linux</span><span>Offline</span></div>
  </div><div class="bar"></div>`;

(async () => {
  const browser = await chromium.launch({ channel: process.env.ICON_BROWSER ?? 'msedge' });
  const page = await browser.newPage();
  for (const [name, html, width, height] of [['banner', banner, 2560, 840], ['social-preview', social, 1280, 640]]) {
    await page.setViewportSize({ width, height });
    await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
    await page.screenshot({ path: path.join(brand, `${name}.png`) });
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
