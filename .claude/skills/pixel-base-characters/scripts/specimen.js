#!/usr/bin/env node
// Render a specimen PNG of a Base Characters style file through the generator's
// real renderer (js/renderer.js) in headless Chromium.
//
//   node specimen.js <font.style.json> [--out specimen.png] [--repo <repo root>] [--chrome <binary>]
//
// The specimen shows: the full character map as plain square pixels (to judge the
// bitmaps themselves), text samples that stress spacing, descenders and confusable
// characters, and — if the style carries look params — the same text in that look.

'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { findRepo, REQUIRED_CHARS } = require('./common');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const src = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!src) { console.error('usage: node specimen.js <font.style.json> [--out file.png] [--repo dir] [--chrome bin]'); process.exit(2); }

const styles = JSON.parse(fs.readFileSync(src, 'utf8'));
const all = Array.isArray(styles) ? styles : [styles];
const style = all[0];
if (!style || !style.glyphs || !style.params) { console.error('not a style file (expected [{name, params, glyphs}]) — run build_font.js first'); process.exit(1); }
const repo = opt('--repo') || findRepo(__dirname);
const out = path.resolve(opt('--out') || src.replace(/(\.style)?\.json$/i, '') + '.specimen.png');

const chrome = opt('--chrome') || process.env.CHROME_BIN ||
  ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome'].find(b => {
    try { execFileSync('which', [b], { stdio: 'ignore' }); return true; } catch { return false; }
  });
if (!chrome) { console.error('No Chromium/Chrome found; pass --chrome <binary> or set CHROME_BIN'); process.exit(1); }

const { cols, rows } = style.params;
// Size the plain-pixel cell so the character map stays readable for any grid.
const cell = Math.max(4, Math.min(12, Math.floor(120 / Math.max(cols, rows))));
// Fit the character map into the 1400px page (1344px content width, 14px column gap).
const perRow = Math.max(4, Math.min(16, Math.floor((1344 + 14) / (cols * (cell + 1) + 14))));
const mapRows = Math.ceil(REQUIRED_CHARS.length / perRow);
const glyphH = rows * (cell + 1);
const samples = [
  'The quick brown fox jumps over the lazy dog',
  'SPHINX OF BLACK QUARTZ, JUDGE MY VOW!',
  'gypsy jelly quip: (fig) [yoga] {pq}',
  '0O 1Il| 5S 8B 2Z 6G 9g rn m',
  '0123456789 @#$%&*+-=/\\<>~^_"\'',
  'ÅSA ÄR PÅ ÖLAND',
];
// Hero section: the set dressed in each of its looks, with the theme sample lines.
const isLook = (e) => Object.keys(e.params || {}).some(k => !['cols', 'rows'].includes(k));
let looks = all.filter(isLook);
if (!looks.length) looks = [{ name: 'Default dark', params: {} }];
const theme = (Array.isArray(style.samples) && style.samples.length) ? style.samples : samples.slice(0, 2);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-specimen-'));
const fileURL = (p) => 'file://' + path.resolve(p).split(path.sep).map(encodeURIComponent).join('/');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 body{margin:0;padding:24px 28px;background:#f4f1ea;color:#1b1b1b;font:13px/1.4 ui-monospace,monospace}
 h1{font-size:20px;margin:0 0 2px} .meta{color:#555;margin-bottom:18px}
 h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#666;margin:22px 0 8px;border-top:1px solid #ccc;padding-top:10px}
 .map{display:grid;grid-template-columns:repeat(${perRow},max-content);gap:10px 14px}
 .g{display:flex;flex-direction:column;align-items:center;gap:3px} .g span{font-size:10px;color:#777}
 .g.blank svg{outline:1px dashed #c33}
 .line{margin:6px 0 14px} .line svg{display:block;max-width:100%;height:auto}
 .hero{padding:22px 24px 10px;margin:0 0 10px;border-radius:4px}
 .hero .lbl{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:12px}
 .hero svg{display:block;margin:0 0 14px;max-width:100%}
</style></head><body>
<h1 id="t"></h1><div class="meta" id="m"></div>
<div id="heroes"></div>
<h2>Character map — plain pixels</h2><div class="map" id="map"></div>
<h2>Text samples</h2><div id="samples"></div>
<div id="lookwrap"></div>
<script src="${fileURL(path.join(repo, 'js/font-data.js'))}"></script>
<script src="${fileURL(path.join(repo, 'js/renderer.js'))}"></script>
<script>
const STYLE = ${JSON.stringify(style)};
const CHARS = ${JSON.stringify(REQUIRED_CHARS)};
const SAMPLES = ${JSON.stringify(samples)};
const LOOKS = ${JSON.stringify(looks.map(l => ({ name: l.name, params: l.params })))};
const THEME = ${JSON.stringify(theme)};
const {cols, rows} = STYLE.params;
const plain = {cols, rows, cellWidth:${cell}, cellHeight:${cell}, gapX:1, gapY:1, cornerRadius:0, cornerMerge:true,
  cellShape:'rect', fgColor:'#1b1b1b', bgColor:'transparent', padding:0, charSpacing:${cell + 1}};
document.getElementById('t').textContent = STYLE.name;
document.getElementById('m').textContent = cols + '×' + rows + ' grid · ' + Object.keys(STYLE.glyphs).length + ' glyphs';
const map = document.getElementById('map');
for (const ch of CHARS) {
  const d = document.createElement('div'); const data = STYLE.glyphs[ch];
  d.className = 'g' + (data && data.some(Boolean) ? '' : ' blank');
  d.innerHTML = data ? generateGlyphSVG(data, cols, rows, plain, ch) : '<svg width="${cols * (cell + 1)}" height="${glyphH}"></svg>';
  const l = document.createElement('span'); l.textContent = data ? ch : ch + ' ✗'; d.appendChild(l); map.appendChild(d);
}
const s = document.getElementById('samples');
for (const t of SAMPLES) { const d = document.createElement('div'); d.className = 'line'; d.innerHTML = generateTextSVG(STYLE.glyphs, t, plain) || ''; s.appendChild(d); }
const heroes = document.getElementById('heroes');
for (const L of LOOKS) {
  const look = {cellWidth:30, cellHeight:30, gapX:3, gapY:3, cornerRadius:0, cornerMerge:true, cellShape:'rect',
    fgColor:'#e8e8e8', bgColor:'#111111', padding:0, charSpacing:12, ...L.params, cols, rows};
  const box = document.createElement('div'); box.className = 'hero';
  box.style.background = look.bgColor === 'transparent' ? '#111111' : look.bgColor; box.style.color = look.fgColor;
  box.innerHTML = '<div class="lbl"></div>'; box.firstChild.textContent = L.name;
  for (const t of THEME) {
    const svg = generateTextSVG(STYLE.glyphs, t, {...look, bgColor:'transparent'}); if (!svg) continue;
    const w = document.createElement('div'); w.innerHTML = svg; const el = w.firstChild;
    const sw = +el.getAttribute('width'), sh = +el.getAttribute('height');
    const h = Math.min(110, 1296 * sh / sw); el.style.height = h + 'px'; el.style.width = (h * sw / sh) + 'px';
    box.appendChild(el);
  }
  heroes.appendChild(box);
}
document.title = 'H=' + Math.ceil(document.documentElement.scrollHeight);
</script></body></html>`;
const page = path.join(tmp, 'specimen.html');
fs.writeFileSync(page, html);
const base = ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  `--user-data-dir=${path.join(tmp, 'profile')}`, '--virtual-time-budget=4000'];
try {
  // Pass 1: lay the page out and read its real height; pass 2: screenshot exactly that tall.
  const dom = execFileSync(chrome, [...base, '--window-size=1400,1000', '--dump-dom', fileURL(page)],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000 });
  const m = dom.match(/<title>H=(\d+)<\/title>/);
  if (!m) throw new Error('specimen page failed to render (renderer error?)');
  const height = Math.min(10000, Number(m[1]) + 4);
  execFileSync(chrome, [...base, `--window-size=1400,${height}`, `--screenshot=${out}`, fileURL(page)],
    { stdio: 'ignore', timeout: 90000 });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (!fs.existsSync(out)) { console.error('✗ Chromium did not write a screenshot'); process.exit(1); }
console.log(`✓ specimen → ${out}`);
