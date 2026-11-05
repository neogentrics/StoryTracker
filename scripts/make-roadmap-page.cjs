'use strict';
// Builds dist/roadmap.html from ROADMAP.md and docs/decisions.md, for the roadmap artifact. ROADMAP.md stays the one
// place the plan is written. To change what's highlighted, change the status in the roadmap's table.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const roadmap = fs.readFileSync(path.join(root, 'ROADMAP.md'), 'utf8').replace(/\r\n/g, '\n');
const decisions = fs.readFileSync(path.join(root, 'docs', 'decisions.md'), 'utf8').replace(/\r\n/g, '\n');
const REPO = 'https://github.com/neogentrics/StoryTracker';

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Links inside the repo only work there, so they become plain words here.
function inline(text) {
  return escape(text)
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function statusOf(id) {
  const row = roadmap.split('\n').find((line) => line.startsWith(`| [${id}]`));
  return row?.split('|')[3]?.trim() ?? '';
}

function parseRelease(block) {
  const lines = block.split('\n');
  const [, id, theme] = lines[0].match(/^## (.+?) — (.+)$/) ?? [];
  const intro = [];
  const notes = [];
  const items = [];
  let test = '';
  for (const line of lines.slice(1)) {
    if (test && line.trim()) {
      test += ` ${line.trim()}`;
    } else if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      if (/^(Feature|Task|-+|:?-+:?)$/.test(cells[0]) || cells.length < 3) continue;
      const name = cells[0];
      items.push({
        name: name.replace(/[✅🙋🛡️]/gu, '').replace(/️/g, '').trim(),
        done: name.includes('✅'),
        asked: name.includes('🙋'),
        safety: name.includes('🛡'),
        size: cells[1],
        details: cells[2],
      });
    } else if (line.startsWith('**Test:**')) {
      test = line.replace('**Test:**', '').trim();
    } else if (line.trim() && !line.startsWith('#')) {
      (items.length ? notes : intro).push(line.trim());
    }
  }
  const clean = (text) => text.replace(/[✅🙋]\s*/gu, '').trim();
  return { id, theme, intro: clean(intro.join(' ')), notes: clean(notes.join(' ')), items, test: clean(test) };
}

const blocks = roadmap.split(/\n(?=## )/).filter((block) => block.startsWith('## '));
const releases = blocks.filter((block) => !block.startsWith('## Open decisions')).map(parseRelease);

function kindOf(status) {
  if (status.includes('🚧') || /working on/i.test(status)) return 'now';
  if (status.includes('✅')) return 'shipped';
  if (/idea/i.test(status)) return 'idea';
  return 'planned';
}

function itemHtml(item) {
  const chips = [
    item.done ? '<span class="chip done-chip">Done</span>' : '',
    item.asked ? '<span class="chip ask">You asked</span>' : '',
    item.safety ? '<span class="chip safety">Permission step</span>' : '',
    /^[SML]$/.test(item.size) ? `<span class="chip ${item.size.toLowerCase()}">${item.size}</span>` : '',
  ].join('');
  return `<div class="item"><h3>${inline(item.name)}</h3><div class="tags">${chips}</div><p>${inline(item.details)}</p></div>`;
}

function releaseHtml(release) {
  const key = roadmap.match(new RegExp(`\\| \\[([^\\]]+)\\]\\(#[^)]*\\) \\| ${release.theme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|`))?.[1] ?? release.id;
  const status = statusOf(key);
  const kind = kindOf(status);
  const label = kind === 'now' ? status.replace('🚧', '').trim() : '';
  return `<section class="release ${kind}" id="${release.id.replace(/[^a-z0-9]/gi, '-').toLowerCase()}">
    <div class="release-head"><span class="ver">${escape(release.id)}</span><h2>${inline(release.theme)}</h2>
    ${release.intro ? `<p>${inline(release.intro)}</p>` : '<p></p>'}
    ${label ? `<p class="now-label">${inline(label)}</p>` : ''}</div>
    ${release.items.length ? `<div class="items">${release.items.map(itemHtml).join('')}</div>` : ''}
    ${release.notes ? `<p class="test">${inline(release.notes)}</p>` : ''}
    ${release.test ? `<p class="test"><b>Test:</b> ${inline(release.test)}</p>` : ''}
  </section>`;
}

function openDecisions() {
  return decisions
    .split(/\n(?=### )/)
    .filter((block) => block.startsWith('### ') && !block.includes('✅ **Chosen'))
    .map((block) => {
      const [title, ...rest] = block.split('\n');
      const first = rest.find((line) => line.trim() && !line.startsWith('|') && !line.startsWith('#')) ?? '';
      return `<div class="decision"><h3>${inline(title.replace(/^### \d+\.\s*/, ''))}</h3><p>${inline(first)}</p></div>`;
    })
    .join('');
}

const nowRelease = releases.find((release) => {
  const row = roadmap.split('\n').find((line) => line.includes(`| ${release.theme} |`));
  return row?.includes('🚧');
});
const doneItems = nowRelease?.items.filter((item) => item.done).length ?? 0;

const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const icon = `data:image/png;base64,${fs.readFileSync(path.join(root, 'build', 'icon.png')).toString('base64')}`;

const page = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RT Story Tracker Roadmap</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>
:root { --bg:#f0eef6; --surface:#fff; --ink:#1f1b2b; --ink-soft:#4f4963; --muted:#7c7691; --line:#e0dbea; --accent:#5b3fd6; --accent-2:#0f7c8a;
  --accent-soft:#ece8fb; --ask:#b5179e; --ask-soft:#fbe8f6; --warn:#b45309; --warn-soft:#fdf1e1; color-scheme:light;
  --font-display:"Sora","Segoe UI",system-ui,sans-serif; --font-body:"IBM Plex Sans","Segoe UI",system-ui,sans-serif; --font-mono:"IBM Plex Mono",Consolas,monospace; }
@media (prefers-color-scheme: dark) { :root { --bg:#100e17; --surface:#1a1724; --ink:#ebe8f4; --ink-soft:#b7b1c8; --muted:#8c869f; --line:#2c2740;
  --accent:#a896ff; --accent-2:#3dc4d0; --accent-soft:#241f3d; --ask:#f27ad8; --ask-soft:#3a1734; --warn:#f5b25c; --warn-soft:#3a2a12; color-scheme:dark; } }
* { box-sizing:border-box; } html,body { margin:0; }
body { background:var(--bg); color:var(--ink); font:400 15.5px/1.6 var(--font-body); padding:40px 20px 72px; }
.wrap { max-width:980px; margin:0 auto; display:grid; gap:24px; }
h1,h2,h3 { font-family:var(--font-display); text-wrap:balance; margin:0; }
h1 { font-size:34px; letter-spacing:-.02em; line-height:1.15; } h2 { font-size:21px; letter-spacing:-.01em; } p { margin:0; }
a { color:var(--accent); } code { font-family:var(--font-mono); font-size:.88em; }
header { display:grid; gap:6px; }
.brand { display:flex; align-items:center; gap:10px; color:var(--muted); font-weight:600; font-size:13px; letter-spacing:.04em; text-transform:uppercase; }
.brand img { width:30px; height:30px; }
.lede { color:var(--ink-soft); max-width:68ch; font-size:16.5px; margin-top:6px; }
.card { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:22px 24px; }
.now-card { border:2px solid var(--accent); background:linear-gradient(135deg,var(--accent-soft),var(--surface) 70%); display:grid; gap:12px; }
.kicker { font:600 12px var(--font-body); letter-spacing:.08em; text-transform:uppercase; color:var(--accent); display:flex; align-items:center; gap:8px; }
.pulse { width:9px; height:9px; border-radius:50%; background:var(--accent); box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 60%,transparent); animation:pulse 1.8s infinite; }
@keyframes pulse { 70% { box-shadow:0 0 0 9px transparent; } 100% { box-shadow:0 0 0 0 transparent; } }
@media (prefers-reduced-motion: reduce) { .pulse { animation:none; } }
.now-card ul { margin:0; padding-left:20px; color:var(--ink-soft); display:grid; gap:4px; } .now-card b { color:var(--ink); }
.legend { display:flex; flex-wrap:wrap; gap:8px 14px; color:var(--muted); font-size:13px; align-items:center; }
.chip { display:inline-flex; align-items:center; font-size:11.5px; font-weight:600; padding:2px 9px; border-radius:999px; white-space:nowrap; border:1px solid transparent; }
.chip.ask { background:var(--ask-soft); color:var(--ask); } .chip.s { background:var(--accent-soft); color:var(--accent); }
.chip.m { background:color-mix(in srgb,var(--accent-2) 14%,var(--surface)); color:var(--accent-2); } .chip.l { background:var(--warn-soft); color:var(--warn); }
.chip.safety { border-color:var(--warn); color:var(--warn); } .chip.done-chip { background:var(--accent-2); color:var(--surface); }
.release { background:var(--surface); border:1px solid var(--line); border-radius:14px; overflow:hidden; }
.release-head { display:grid; grid-template-columns:auto 1fr; gap:4px 16px; align-items:baseline; padding:20px 24px 16px; }
.release-head p { grid-column:2; color:var(--ink-soft); font-size:14.5px; }
.ver { font-family:var(--font-mono); font-size:13px; color:#fff; background:linear-gradient(135deg,#5b3fd6,#0f7c8a); padding:3px 10px; border-radius:7px; align-self:center; white-space:nowrap; }
.release h2::after { margin-left:10px; font:600 11.5px var(--font-body); vertical-align:middle; padding:2px 9px; border-radius:999px; }
.release.shipped h2::after { content:"Done"; color:var(--accent-2); background:color-mix(in srgb,var(--accent-2) 14%,var(--surface)); }
.release.planned h2::after { content:"Planned"; color:var(--ink-soft); background:var(--bg); border:1px solid var(--line); }
.release.idea h2::after { content:"Ideas"; color:var(--warn); background:var(--warn-soft); }
.release.now { border:2px solid var(--accent); box-shadow:0 6px 24px color-mix(in srgb,var(--accent) 18%,transparent); }
.release.now .release-head { background:var(--accent-soft); }
.release.now h2::after { content:"Working on now"; color:var(--surface); background:var(--accent); }
.now-label { font-weight:600; color:var(--accent) !important; }
.items { display:grid; border-top:1px solid var(--line); }
.item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 18px; padding:13px 24px; border-bottom:1px solid var(--line); }
.item:last-child { border-bottom:0; } .item h3 { font-family:var(--font-body); font-size:15.5px; font-weight:600; }
.item p { color:var(--ink-soft); font-size:14.5px; grid-column:1; max-width:72ch; }
.tags { display:flex; gap:6px; align-items:flex-start; justify-content:flex-end; flex-wrap:wrap; grid-row:span 2; }
.test { padding:12px 24px 14px; border-top:1px solid var(--line); font-size:14px; color:var(--ink-soft); background:color-mix(in srgb,var(--bg) 50%,var(--surface)); }
.decisions { display:grid; gap:10px; margin-top:12px; }
.decision { display:grid; gap:2px; padding:12px 14px; border-radius:10px; background:var(--bg); border:1px solid var(--line); }
.decision h3 { font-family:var(--font-body); font-size:15px; font-weight:600; } .decision p { color:var(--ink-soft); font-size:14.5px; }
footer { color:var(--muted); font-size:13px; }
@media (max-width:640px) { body { padding:24px 14px 56px; } h1 { font-size:27px; } .item { grid-template-columns:1fr; } .tags { justify-content:flex-start; grid-row:auto; } .release-head { grid-template-columns:1fr; } .release-head p { grid-column:1; } }
</style></head><body><div class="wrap">
<header>
  <div class="brand"><img src="${icon}" alt="">Recon Towers Dev Department</div>
  <h1>RT Story Tracker Roadmap</h1>
  <p class="lede">From a chapter editor to the place a book lives. A desktop app for any author, on Windows, Mac and Linux, in releases that can each be tested on their own.</p>
</header>
${nowRelease ? `<section class="card now-card">
  <div class="kicker"><span class="pulse"></span>Working on now</div>
  <h2>${escape(nowRelease.id)}: ${inline(nowRelease.theme)}</h2>
  <p>${doneItems} of ${nowRelease.items.length} features are out, on Windows, Mac and Linux. What's left before moving on:</p>
  <ul><li><b>Your testing.</b> Install it and write in it. Anything that's wrong gets fixed before 3.1.</li>
  <li><b>A real power cut.</b> Write a chapter, pull the power, restart. It's the one test that can't be automated.</li></ul>
  <p><b>After that:</b> your own stories and Notion become the test bed, and what you need for how you write goes on this roadmap.</p>
</section>` : ''}
<div class="legend"><span>Size:</span><span class="chip s">S</span> about a day <span class="chip m">M</span> a few days <span class="chip l">L</span> a week or more <span class="chip ask">You asked</span> <span class="chip safety">Permission step</span></div>
${releases.map(releaseHtml).join('\n')}
<section class="card"><h2>Still to decide</h2><div class="decisions">${openDecisions()}</div></section>
<footer>RT Story Tracker · © 2026 Recon Towers. Updated ${today} from <a href="${REPO}/blob/master/ROADMAP.md">ROADMAP.md</a>. Sizes are rough, and every release goes through the same automated tests on Windows, Mac and Linux.</footer>
</div></body></html>
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'roadmap.html'), page);
console.log(`dist/roadmap.html: ${releases.length} releases`);
