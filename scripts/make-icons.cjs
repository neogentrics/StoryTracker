'use strict';
// Remakes build/icon.png and build/icon.ico from build/icon.svg, using the Edge or Chrome already on this computer.
// Only needed when the logo changes. The results are committed.
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const build = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(build, 'icon.svg'), 'utf8');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

(async () => {
  const browser = await chromium.launch({ channel: process.env.ICON_BROWSER ?? 'msedge' });
  const page = await browser.newPage();
  const png = async (size) => {
    await page.setViewportSize({ width: size, height: size });
    const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
    await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };

  fs.writeFileSync(path.join(build, 'icon.png'), await png(512));

  const images = [];
  for (const size of SIZES) images.push(await png(size));
  await browser.close();

  // An ICO file is a small table followed by PNGs.
  const header = Buffer.alloc(6 + 16 * SIZES.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(SIZES.length, 4);
  let offset = header.length;
  SIZES.forEach((size, at) => {
    const entry = 6 + at * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[at].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[at].length;
  });
  fs.writeFileSync(path.join(build, 'icon.ico'), Buffer.concat([header, ...images]));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
