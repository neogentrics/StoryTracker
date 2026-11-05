'use strict';
// Builds dist/roadmap.html for the roadmap artifact, in the same layout as RT Markdown Reader's. ROADMAP.md and
// docs/decisions.md hold the plan, and docs/roadmap-now.json holds the "working on now" band and the answered questions.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const roadmap = read('ROADMAP.md');
const decisions = read('docs/decisions.md');
const page = JSON.parse(read('docs/roadmap-now.json'));
const REPO = 'https://github.com/neogentrics/StoryTracker';
const SIZES = { S: ['s', 'Small'], M: ['m', 'Medium'], L: ['l', 'Large'] };

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

const clean = (text) => text.replace(/[✅🙋💡🚧]\s*/gu, '').trim();
const anchor = (id) => `r-${id.replace(/[^a-z0-9.]/gi, '-').replace(/\./g, '').toLowerCase()}`;

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
      if (/^(Feature|Task|:?-+:?)$/.test(cells[0]) || cells.length < 3) continue;
      const name = cells[0];
      items.push({
        name: clean(name.replace(/🛡️?/gu, '')),
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
  const status = roadmap.split('\n').find((line) => line.startsWith('| [') && line.includes(`| ${theme} |`))?.split('|')[3]?.trim() ?? '';
  const released = status.includes('✅') || /released/i.test(status);
  const kind = /idea/i.test(status) ? 'idea' : status.includes('🚧') ? 'here' : released ? 'done' : 'plan';
  return { id, theme, status, kind, intro: clean(intro.join(' ')), notes: clean(notes.join(' ')), items, test: clean(test) };
}

const releases = roadmap
  .split(/\n(?=## )/)
  .filter((block) => block.startsWith('## ') && !block.startsWith('## Open decisions'))
  .map(parseRelease);
const isVersion = (release) => /^(v\d|Step zero)/.test(release.id);
const versions = releases.filter(isVersion);
const others = releases.filter((release) => !isVersion(release));
const coming = versions.filter((release) => release.kind === 'plan');
const shipped = versions.filter((release) => release.kind === 'done' || release.kind === 'here').reverse();
const latest = shipped[0];

function itemHtml(item) {
  const [sizeClass, sizeLabel] = SIZES[item.size] ?? [];
  const chips = [
    item.asked ? '<span class="chip ask">You asked</span>' : '',
    item.safety ? '<span class="chip safety">Safety gate</span>' : '',
    sizeClass ? `<span class="chip ${sizeClass}">${sizeLabel}</span>` : '',
  ].join('');
  return `<div class="item"><h3>${inline(item.name)}</h3><div class="tags">${chips}</div><p>${inline(item.details)}</p></div>`;
}

function shortId(id) {
  return id.replace(/^Step zero$/, 'Step 0').replace(/^v1\.0–v2\.3$/, 'v1–2');
}

function releaseHtml(release, { open = false, first = false } = {}) {
  const kind = release.kind === 'here' ? 'done' : release.kind;
  const count = release.items.length ? `${release.items.length} ${release.items.length === 1 ? 'feature' : 'features'}` : '';
  const notes = release.notes ? `<p class="test">${inline(release.notes)}</p>` : '';
  const test = release.test ? `<p class="test"><b>Test:</b> ${inline(release.test)}</p>` : '';
  return `<details class="rel ${kind}${first ? ' first-up' : ''}" id="${anchor(release.id)}"${open ? ' open' : ''}>
  <summary><span class="ver">${escape(shortId(release.id))}</span><span class="rel-text"><b>${inline(release.theme)}</b><span>${inline(release.intro)}</span></span><span class="rel-count">${count}</span></summary>
  ${release.items.length ? `<div class="items">${release.items.map(itemHtml).join('\n')}</div>` : ''}
  ${notes}${test}
</details>`;
}

function railNode(release) {
  const label = shortId(release.id).replace(/^v/, '');
  return `<a class="node ${release.kind}" href="#${anchor(release.id)}" title="${escape(release.theme)}">${escape(label)}</a>`;
}

function railGroup(label, list) {
  if (list.length === 0) return '';
  return `<div class="rail-group"><span class="rail-label">${label}</span><div class="rail-nodes">${list.map(railNode).join('')}</div></div>`;
}

function parseDecisions() {
  return decisions
    .split(/\n(?=### )/)
    .filter((block) => block.startsWith('### '))
    .map((block) => {
      const [title, ...rest] = block.split('\n');
      const lines = rest.filter((line) => line.trim() && !line.startsWith('|') && !line.startsWith('#'));
      const chosen = lines.find((line) => line.includes('✅ **Chosen'));
      return {
        title: title.replace(/^### \d+\.\s*/, ''),
        chosen: chosen ? clean(chosen).replace(/^\*\*Chosen [^:]*:\s*/, '').replace(/\*\*/g, '') : null,
        text: lines.find((line) => !line.includes('✅')) ?? '',
      };
    });
}

const allDecisions = parseDecisions();
const open = allDecisions.filter((item) => !item.chosen);
const decided = allDecisions.filter((item) => item.chosen);

const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const icon = `data:image/png;base64,${fs.readFileSync(path.join(root, 'build', 'icon.png')).toString('base64')}`;
const next = coming[0];

const css = `
:root { --bg:#f0eef6; --surface:#fff; --ink:#1f1b2b; --ink-soft:#4f4963; --muted:#6c6680; --line:#e0dbea; --accent:#5b3fd6; --on-accent:#fff; --accent-soft:#ece8fb;
  --ok:#0a7468; --ok-soft:#e0f3ef; --ask:#a3148d; --ask-soft:#fbe8f6; --warn:#a64b06; --warn-soft:#fdf1e1;
  --font-display:"Sora","Segoe UI",system-ui,sans-serif; --font-body:"IBM Plex Sans","Segoe UI",system-ui,sans-serif; --font-mono:"IBM Plex Mono",Consolas,monospace; }
@media (prefers-color-scheme: dark) { :root { --bg:#100e17; --surface:#1a1724; --ink:#ebe8f4; --ink-soft:#bdb7cd; --muted:#958fa8; --line:#2f2a44; --accent:#a896ff; --on-accent:#17132b; --accent-soft:#241f3d;
  --ok:#3dd0c4; --ok-soft:#10302d; --ask:#f27ad8; --ask-soft:#3a1734; --warn:#f5b25c; --warn-soft:#3a2a12; color-scheme:dark; } }
* { box-sizing:border-box; }
html { scroll-padding-top:76px; scroll-behavior:smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior:auto; } }
body { margin:0; background:var(--bg); color:var(--ink); font:400 15.5px/1.6 var(--font-body); }
h1,h2,h3 { font-family:var(--font-display); text-wrap:balance; margin:0; } p { margin:0; } a { color:var(--accent); } code { font-family:var(--font-mono); font-size:.9em; }
.bar { position:sticky; top:0; z-index:5; background:var(--surface); border-bottom:1px solid var(--line); }
.bar-in { max-width:1040px; margin:0 auto; display:flex; flex-wrap:wrap; align-items:center; gap:4px 18px; padding:10px 16px; }
.brand { display:flex; align-items:center; gap:9px; font:700 15px var(--font-display); } .brand img { width:24px; height:24px; flex:none; }
.bar nav { display:flex; flex-wrap:wrap; gap:2px 4px; margin-left:auto; }
.bar nav a { padding:4px 10px; border-radius:7px; color:var(--ink-soft); font-size:13.5px; font-weight:500; text-decoration:none; }
.bar nav a:hover { background:var(--accent-soft); color:var(--accent); } .bar nav a.lead { background:var(--accent); color:var(--on-accent); font-weight:600; }
.wrap { max-width:1040px; margin:0 auto; display:grid; gap:34px; padding:28px 16px 64px; } .wrap > * { min-width:0; }
.section-head { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 12px; margin-bottom:12px; } .section-head h2 { font-size:21px; letter-spacing:-.01em; } .section-head p { color:var(--muted); font-size:14px; }
.now { background:var(--accent); color:var(--on-accent); border-radius:16px; padding:24px 26px; display:grid; gap:14px; }
.now .kicker { display:flex; align-items:center; gap:9px; font:700 12.5px var(--font-body); letter-spacing:.1em; text-transform:uppercase; }
.pulse { width:10px; height:10px; border-radius:50%; background:currentColor; animation:pulse 1.8s infinite; } @keyframes pulse { 50% { opacity:.35; } } @media (prefers-reduced-motion: reduce) { .pulse { animation:none; } }
.now h1 { font-size:30px; letter-spacing:-.02em; line-height:1.2; color:inherit; } .now p { font-size:16px; }
.now ul { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.now li { display:grid; gap:3px; align-content:start; padding:12px 14px; border-radius:10px; background:color-mix(in srgb,var(--on-accent) 13%,transparent); font-size:14px; line-height:1.45; } .now li b { font-size:14.5px; }
.glance { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
.card { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:15px 17px; display:grid; gap:4px; align-content:start; min-width:0; }
.card .label { font:700 11.5px var(--font-body); letter-spacing:.08em; text-transform:uppercase; color:var(--muted); } .card.ok .label { color:var(--ok); } .card.next .label { color:var(--accent); } .card.you { border-color:var(--warn); } .card.you .label { color:var(--warn); }
.card b { font:600 16px var(--font-display); } .card p { color:var(--ink-soft); font-size:14px; line-height:1.45; }
.rail { display:grid; gap:10px; background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:15px 17px; }
.rail-group { display:grid; grid-template-columns:34px minmax(0,1fr); gap:10px; align-items:center; } .rail-label { font:500 12.5px var(--font-mono); color:var(--muted); } .rail-nodes { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.node { font:500 13px var(--font-mono); white-space:nowrap; padding:3px 11px; border-radius:999px; text-decoration:none; border:1.5px solid transparent; }
.node.done { background:var(--ok-soft); color:var(--ok); } .node.plan { border:1.5px dashed var(--muted); color:var(--ink-soft); } .node.here { background:var(--accent); color:var(--on-accent); font-weight:700; } .node.here::before { content:"▶ "; }
.key { display:flex; flex-wrap:wrap; gap:4px 16px; font-size:13px; color:var(--muted); } .key span { display:inline-flex; align-items:center; gap:6px; } .key i { width:11px; height:11px; border-radius:50%; display:inline-block; }
.key .k-done { background:var(--ok); } .key .k-now { background:var(--accent); } .key .k-plan { border:1.5px dashed var(--muted); }
.tools { display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; }
.tools input[type="search"] { flex:1 1 220px; min-width:0; font:inherit; font-size:14.5px; padding:8px 12px; border-radius:9px; border:1px solid var(--line); background:var(--surface); color:var(--ink); }
.tools label { display:inline-flex; align-items:center; gap:6px; font-size:14px; color:var(--ink-soft); }
.tools button { font:inherit; font-size:14px; padding:7px 12px; border-radius:9px; border:1px solid var(--line); background:var(--surface); color:var(--ink); cursor:pointer; } .tools button:hover { border-color:var(--accent); color:var(--accent); }
.empty { color:var(--muted); } .list { display:grid; gap:8px; }
details.rel { background:var(--surface); border:1px solid var(--line); border-radius:12px; overflow:hidden; } details.rel.first-up { border:2px solid var(--accent); }
summary { list-style:none; cursor:pointer; } summary::-webkit-details-marker { display:none; }
details.rel > summary { display:grid; grid-template-columns:64px minmax(0,1fr) auto 14px; gap:14px; align-items:center; padding:12px 16px; }
details.rel > summary::after { content:"›"; font-size:20px; line-height:1; color:var(--muted); transition:transform .12s; justify-self:end; } details[open].rel > summary::after { transform:rotate(90deg); }
details.rel > summary:hover { background:color-mix(in srgb,var(--accent) 5%,transparent); }
.ver { font:500 13px var(--font-mono); text-align:center; padding:3px 0; border-radius:7px; } .done > summary .ver { background:var(--ok-soft); color:var(--ok); } .plan > summary .ver { border:1.5px dashed var(--muted); color:var(--ink-soft); } .idea > summary .ver { background:var(--warn-soft); color:var(--warn); }
.rel-text { display:grid; min-width:0; line-height:1.4; } .rel-text b { font:600 15.5px var(--font-display); } .rel-text span { color:var(--ink-soft); font-size:14px; } .rel-count { color:var(--muted); font-size:13px; white-space:nowrap; }
.items { display:grid; border-top:1px solid var(--line); }
.item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:3px 18px; padding:12px 16px 12px 94px; border-bottom:1px solid var(--line); } .item:last-child { border-bottom:0; }
.item h3 { font:600 15px var(--font-body); } .item p { color:var(--ink-soft); font-size:14.5px; grid-column:1; max-width:72ch; }
.tags { display:flex; gap:6px; align-items:flex-start; justify-content:flex-end; flex-wrap:wrap; grid-row:span 2; grid-column:2; }
.test { padding:11px 16px 12px 94px; border-top:1px solid var(--line); color:var(--ink-soft); font-size:14px; }
.chip { display:inline-flex; align-items:center; font-size:11.5px; font-weight:600; padding:2px 9px; border-radius:999px; white-space:nowrap; border:1px solid transparent; }
.chip.ask { background:var(--ask-soft); color:var(--ask); } .chip.s { background:var(--accent-soft); color:var(--accent); } .chip.m { background:var(--ok-soft); color:var(--ok); } .chip.l { background:var(--warn-soft); color:var(--warn); } .chip.safety { border-color:var(--warn); color:var(--warn); }
.decisions { display:grid; gap:8px; } .decision { display:grid; gap:4px; padding:13px 16px; border-radius:12px; background:var(--surface); border:1px solid var(--line); } .decision.open { border:1.5px solid var(--warn); }
.decision h3 { font:600 15px var(--font-body); } .decision p { color:var(--ink-soft); font-size:14.5px; } .decided-tag { color:var(--ok); font-weight:600; }
details.more { background:var(--surface); border:1px solid var(--line); border-radius:12px; overflow:hidden; margin-top:8px; } details.more > summary { padding:11px 16px; font-weight:600; font-size:14.5px; color:var(--ink-soft); }
details.more > .inside { display:grid; gap:12px; padding:4px 16px 16px; } details.more .decision { background:var(--bg); }
.answer { display:grid; grid-template-columns:22px minmax(0,1fr); gap:10px; } .answer .dot { width:22px; height:22px; border-radius:50%; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; font-weight:700; font-size:12px; margin-top:2px; } .answer p { color:var(--ink-soft); } .answer b { color:var(--ink); }
footer { color:var(--muted); font-size:13px; } .hide { display:none !important; }
@media (max-width:760px) { .now ul,.glance { grid-template-columns:1fr; } .now h1 { font-size:25px; } html { scroll-padding-top:124px; } .bar nav { margin-left:0; } details.rel > summary { grid-template-columns:58px minmax(0,1fr) 14px; gap:10px; } .rel-count { display:none; } .item,.test { padding-left:16px; } .item { grid-template-columns:minmax(0,1fr); } .tags { grid-column:1; grid-row:auto; justify-content:flex-start; margin-top:4px; } }
`;

const script = `
(() => {
  const search = document.getElementById('find');
  const asked = document.getElementById('asked');
  const none = document.getElementById('none');
  const toggle = document.getElementById('toggle');
  const opened = new Map();
  function reveal(id) {
    const el = id && document.getElementById(id);
    const box = el && (el.matches('details') ? el : el.closest('details'));
    if (box) box.open = true;
  }
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (link) reveal(link.getAttribute('href').slice(1));
  });
  reveal(location.hash.slice(1));
  toggle.addEventListener('click', () => {
    const open = toggle.dataset.open !== 'yes';
    document.querySelectorAll('details.rel, details.more').forEach((box) => { box.open = open; });
    toggle.dataset.open = open ? 'yes' : 'no';
    toggle.textContent = open ? 'Collapse all' : 'Expand all';
  });
  function filter() {
    const words = search.value.toLowerCase().split(/\\s+/).filter(Boolean);
    const onlyAsked = asked.checked;
    const active = words.length > 0 || onlyAsked;
    let shown = 0;
    for (const rel of document.querySelectorAll('details.rel')) {
      if (active && !opened.has(rel)) opened.set(rel, rel.open);
      let hits = 0;
      for (const item of rel.querySelectorAll('.item')) {
        const text = item.textContent.toLowerCase();
        const match = words.every((word) => text.includes(word)) && (!onlyAsked || !!item.querySelector('.chip.ask'));
        item.classList.toggle('hide', active && !match);
        if (match) hits += 1;
      }
      rel.classList.toggle('hide', active && !hits);
      if (active) rel.open = hits > 0;
      else if (opened.has(rel)) rel.open = opened.get(rel);
      shown += hits;
    }
    if (!active) opened.clear();
    none.hidden = !active || shown > 0;
  }
  search.addEventListener('input', filter);
  asked.addEventListener('change', filter);
})();
`;

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RT Story Tracker Roadmap</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>${css}</style></head><body>
<div class="bar"><div class="bar-in">
  <div class="brand"><img src="${icon}" alt="">RT Story Tracker roadmap</div>
  <nav aria-label="Sections"><a class="lead" href="#now">Now</a><a href="#coming">Coming up</a><a href="#released">Released</a><a href="#later">Later</a><a href="#decisions">Decisions</a><a href="#questions">Your questions</a></nav>
</div></div>
<div class="wrap">
<section class="now" id="now" aria-labelledby="nowh">
  <div class="kicker"><span class="pulse" aria-hidden="true"></span>Working on now</div>
  <h1 id="nowh">${inline(page.now.title)}</h1>
  <p>${inline(page.now.note)}</p>
  <ul>${page.now.items.map((item) => `<li><b>${inline(item.title)}</b><span>${inline(item.text)}</span></li>`).join('')}</ul>
</section>
<div class="glance">
  <div class="card next"><span class="label">Up next</span><b><a href="#${anchor(next.id)}">${escape(next.id)}: ${inline(next.theme)}</a></b><p>${inline(next.intro)}</p></div>
  <div class="card ok"><span class="label">Latest release</span><b><a href="${REPO}/releases/latest">${escape(latest.id)}: ${inline(latest.theme)}</a></b><p>${inline(latest.intro)}</p></div>
  <div class="card you"><span class="label">Waiting on you</span><b>${escape(page.waiting.title.replace('{decisions}', String(open.length)))}</b><p>${inline(page.waiting.text)}</p></div>
</div>
<section aria-labelledby="railh">
  <div class="section-head"><h2 id="railh">Every version</h2></div>
  <div class="rail">
    ${railGroup('Old', versions.filter((release) => release.id.startsWith('v1')))}
    ${railGroup('3.x', versions.filter((release) => release.id === 'Step zero' || release.id.startsWith('v3')))}
    ${railGroup('4.x', versions.filter((release) => release.id.startsWith('v4')))}
    <div class="key"><span><i class="k-done"></i>Released</span><span><i class="k-now"></i>Working on now</span><span><i class="k-plan"></i>Planned</span></div>
  </div>
</section>
<div class="tools">
  <input type="search" id="find" placeholder="Find a feature…" aria-label="Find a feature">
  <label><input type="checkbox" id="asked"> Only what you asked for</label>
  <button type="button" id="toggle">Expand all</button>
</div>
<p class="empty" id="none" hidden>Nothing matches that.</p>
<section id="coming" aria-labelledby="comingh">
  <div class="section-head"><h2 id="comingh">Coming up</h2><p>In order. Open one to see what's in it.</p></div>
  <div class="list">${coming.map((release, at) => releaseHtml(release, { open: at === 0, first: at === 0 })).join('\n')}</div>
</section>
<section id="released" aria-labelledby="releasedh">
  <div class="section-head"><h2 id="releasedh">Released</h2><p>Newest first.</p></div>
  <div class="list">${shipped.map((release) => releaseHtml(release)).join('\n')}</div>
</section>
<section id="later" aria-labelledby="laterh">
  <div class="section-head"><h2 id="laterh">Later and ongoing</h2></div>
  <div class="list">${others.map((release) => releaseHtml({ ...release, kind: 'idea' })).join('\n')}</div>
</section>
<section id="decisions" aria-labelledby="decisionsh">
  <div class="section-head"><h2 id="decisionsh">Decisions</h2><p>${open.length} waiting for you.</p></div>
  <div class="decisions">${open.map((item) => `<div class="decision open"><h3>${inline(item.title)}</h3><p>${inline(item.text)}</p></div>`).join('\n')}</div>
  <details class="more"><summary>${decided.length} already decided</summary><div class="inside">${decided.map((item) => `<div class="decision"><h3>${inline(item.title)}</h3><p><span class="decided-tag">Decided:</span> ${inline(item.chosen)}</p></div>`).join('\n')}</div></details>
</section>
<section id="questions" aria-labelledby="questionsh">
  <div class="section-head"><h2 id="questionsh">Your questions</h2></div>
  <details class="more"><summary>${page.questions.length} answers</summary><div class="inside">${page.questions.map((item, at) => `<div class="answer"><span class="dot">${at + 1}</span><div><p><b>${item.q}</b> ${item.a}</p></div></div>`).join('\n')}</div></details>
</section>
<div class="key"><span><b class="chip s">Small</b> about a day</span><span><b class="chip m">Medium</b> a few days</span><span><b class="chip l">Large</b> a week or more</span><span><b class="chip safety">Safety gate</b> needs a permission step</span></div>
<footer>RT Story Tracker · © 2026 Recon Towers. Updated ${today} from <a href="${REPO}/blob/master/ROADMAP.md">ROADMAP.md</a>. Sizes are rough, and every release goes through the same automated tests on Windows, Mac and Linux.</footer>
</div>
<script>${script}</script>
</body></html>
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'roadmap.html'), html);
console.log(`dist/roadmap.html: ${coming.length} coming, ${shipped.length} released, ${open.length} open decisions`);
