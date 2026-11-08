#!/usr/bin/env node
// Validate a Base Characters source file and convert it to a style file the
// Pixel Font Generator can load with Styles -> Import.
//
//   node build_font.js <font.source.json> [--out <file.style.json>] [--repo <repo root>]
//
// Source format (rows of '#' = lit pixel, '.' = off):
//   { "name": "Kids Round", "cols": 5, "rows": 7, "concept": "...",
//     "params": { optional look params, e.g. "cornerRadius": 12 },
//     "glyphs": { "A": [".###.", "#...#", ...], ... } }
//
// Exit code 0 = importable (warnings may still be printed), 1 = errors.

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { findRepo, REQUIRED_CHARS, CONFUSABLE_SETS } = require('./common');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const src = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!src) { console.error('usage: node build_font.js <font.source.json> [--out file] [--repo dir]'); process.exit(2); }

const errors = [], warnings = [];
let font;
try { font = JSON.parse(fs.readFileSync(src, 'utf8')); }
catch (e) { console.error(`ERROR: cannot read ${src} as JSON: ${e.message}`); process.exit(1); }

const { name, cols, rows, glyphs = {}, params = {} } = font;
if (typeof name !== 'string' || !name.trim()) errors.push('"name" must be a non-empty string');
if (!Number.isInteger(cols) || cols < 3 || cols > 14) errors.push(`"cols" must be an integer 3-14 (got ${cols})`);
if (!Number.isInteger(rows) || rows < 3 || rows > 16) errors.push(`"rows" must be an integer 3-16 (got ${rows})`);

// Row strings -> flat 0/1 arrays, with precise per-glyph error messages.
const flat = {};
for (const [ch, rowList] of Object.entries(glyphs)) {
  if ([...ch].length !== 1) { errors.push(`glyph key ${JSON.stringify(ch)} must be a single character`); continue; }
  if (!Array.isArray(rowList)) { errors.push(`${JSON.stringify(ch)}: expected an array of ${rows} row strings`); continue; }
  if (rowList.length !== rows) errors.push(`${JSON.stringify(ch)}: has ${rowList.length} rows, expected ${rows}`);
  rowList.forEach((row, r) => {
    if (typeof row !== 'string') { errors.push(`${JSON.stringify(ch)} row ${r}: not a string`); return; }
    if (row.length !== cols) errors.push(`${JSON.stringify(ch)} row ${r}: ${JSON.stringify(row)} is ${row.length} wide, expected ${cols}`);
    if (/[^#.]/.test(row)) errors.push(`${JSON.stringify(ch)} row ${r}: ${JSON.stringify(row)} may only contain '#' and '.'`);
  });
  flat[ch] = rowList.join('').split('').map(c => (c === '#' ? 1 : 0));
}

const missing = REQUIRED_CHARS.filter(c => !glyphs[c]);
if (missing.length) errors.push(`missing ${missing.length} required characters: ${missing.join(' ')}`);
const extra = Object.keys(glyphs).filter(c => !REQUIRED_CHARS.includes(c));
if (extra.length) warnings.push(`extra characters (kept, but the app has no button for them): ${extra.join(' ')}`);

for (const ch of REQUIRED_CHARS) {
  if (flat[ch] && !flat[ch].some(Boolean)) warnings.push(`${JSON.stringify(ch)} is completely blank`);
}
// Confusable pairs that render identically are a legibility bug.
for (const set of CONFUSABLE_SETS) {
  for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) {
    const a = flat[set[i]], b = flat[set[j]];
    if (a && b && a.join('') === b.join('')) warnings.push(`${JSON.stringify(set[i])} and ${JSON.stringify(set[j])} are identical — make them distinguishable`);
  }
}
// Any two glyphs identical (outside the deliberate Å/Ä/A-style families) is suspicious.
const seen = new Map();
for (const ch of REQUIRED_CHARS) {
  if (!flat[ch]) continue;
  const key = flat[ch].join('');
  if (seen.has(key)) warnings.push(`${JSON.stringify(seen.get(key))} and ${JSON.stringify(ch)} have identical bitmaps`);
  else seen.set(key, ch);
}

if (errors.length) {
  console.error(`✗ ${errors.length} error(s):`);
  for (const e of errors.slice(0, 60)) console.error('  - ' + e);
  if (errors.length > 60) console.error(`  … and ${errors.length - 60} more`);
  for (const w of warnings) console.error('  ! ' + w);
  process.exit(1);
}

// Run the app's own import sanitizer so "valid here" means "imports in the app".
const repo = opt('--repo') || findRepo(__dirname);
const ctx = vm.createContext({ console });
vm.runInContext(['js/font-data.js', 'js/renderer.js'].map(f => fs.readFileSync(path.join(repo, f), 'utf8')).join('\n;\n') +
  '\n;this.sanitizeStyle = sanitizeStyle;', ctx);
const style = { name: name.trim(), params: { cols, rows, ...params }, glyphs: flat };
const clean = ctx.sanitizeStyle(JSON.parse(JSON.stringify(style)), { cols, rows });
if (!clean) { console.error('✗ the app rejected the style (sanitizeStyle returned null)'); process.exit(1); }
const dropped = Object.keys(style.params).filter(k => !(k in clean.params));
if (dropped.length) warnings.push(`look params ignored by the app (unknown or out of range): ${dropped.join(', ')}`);
const droppedGlyphs = Object.keys(flat).filter(k => !(k in (clean.glyphs || {})));
if (droppedGlyphs.length) { console.error(`✗ the app would drop these glyphs: ${droppedGlyphs.join(' ')}`); process.exit(1); }

// Optional looks: extra styles with the same glyphs and a full rendering look
// (colours, cell shape, gaps…), so the user can load the set already dressed.
const entries = [{ name: clean.name, params: clean.params, glyphs: clean.glyphs }];
for (const look of Array.isArray(font.looks) ? font.looks : []) {
  if (!look || typeof look.name !== 'string' || !look.params) { warnings.push('skipped a look without name/params'); continue; }
  const l = ctx.sanitizeStyle({ name: `${clean.name} — ${look.name}`, params: { ...look.params, cols, rows }, glyphs: flat }, { cols, rows });
  if (!l) { warnings.push(`look "${look.name}" was rejected by the app`); continue; }
  const lost = Object.keys(look.params).filter(k => !(k in l.params));
  if (lost.length) warnings.push(`look "${look.name}": params ignored by the app (unknown or out of range): ${lost.join(', ')}`);
  entries.push({ name: l.name, params: l.params, glyphs: l.glyphs });
}
// Theme sample lines for the specimen (the app ignores this field on import).
const samples = (Array.isArray(font.samples) ? font.samples : []).filter(s => typeof s === 'string' && s.trim());
if (samples.length) entries.forEach(e => { e.samples = samples; });

const out = opt('--out') || src.replace(/(\.source)?\.json$/i, '') + '.style.json';
// The Import button expects an array of styles.
fs.writeFileSync(out, JSON.stringify(entries, null, 1));

const lit = Object.values(flat).reduce((n, g) => n + g.reduce((a, b) => a + b, 0), 0);
console.log(`✓ ${name}: ${Object.keys(flat).length} glyphs on a ${cols}×${rows} grid, ${(lit / Object.keys(flat).length).toFixed(1)} lit pixels/glyph on average, ${entries.length - 1} look(s), ${samples.length} theme sample(s)`);
for (const w of warnings) console.log('  ! ' + w);
console.log(`→ ${out}  (load it in the app with Styles → Import, then Load)`);
