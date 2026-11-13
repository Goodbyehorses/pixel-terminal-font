'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load');

const { FONT_DATA, FONT_COLS, FONT_ROWS, generateTTF, detectMetrics, pathToContours, glyphContours } = load();

const PARAMS = {
  cols: FONT_COLS, rows: FONT_ROWS, cellWidth: 40, cellHeight: 40, gapX: 3, gapY: 3,
  cornerRadius: 12, cornerMerge: true, cellShape: 'rect', charSpacing: 8,
};

/** Read the table directory of a font into { tag: { checksum, offset, length } }. */
function readTables(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = {};
  for (let i = 0; i < view.getUint16(4); i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4));
    tables[tag] = { checksum: view.getUint32(at + 4), offset: view.getUint32(at + 8), length: view.getUint32(at + 12) };
  }
  return { view, tables };
}

function checksum(bytes, offset, length) {
  let sum = 0;
  for (let i = 0; i < length; i += 4) {
    const word = ((bytes[offset + i] << 24) | ((bytes[offset + i + 1] || 0) << 16) | ((bytes[offset + i + 2] || 0) << 8) | (bytes[offset + i + 3] || 0)) >>> 0;
    sum = (sum + word) >>> 0;
  }
  return sum;
}

/** Look a code point up in the format 4 cmap subtable. */
function glyphIndex(view, cmap, code) {
  const sub = cmap.offset + view.getUint32(cmap.offset + 8);
  const segCount = view.getUint16(sub + 6) / 2;
  for (let i = 0; i < segCount; i++) {
    const end = view.getUint16(sub + 14 + i * 2);
    const start = view.getUint16(sub + 16 + segCount * 2 + i * 2);
    const delta = view.getUint16(sub + 16 + segCount * 4 + i * 2);
    if (code >= start && code <= end) return (code + delta) & 0xffff;
  }
  return 0;
}

test('the font has every required table, with valid checksums', () => {
  const { bytes } = generateTTF(FONT_DATA, PARAMS, { familyName: 'Test Font' });
  const { view, tables } = readTables(bytes);
  assert.equal(view.getUint32(0), 0x00010000);
  for (const tag of ['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post']) {
    assert.ok(tables[tag], `missing table ${tag}`);
  }
  for (const [tag, t] of Object.entries(tables)) {
    if (tag === 'head') continue;   // holds the whole-file adjustment
    assert.equal(checksum(bytes, t.offset, Math.ceil(t.length / 4) * 4), t.checksum, `checksum of ${tag}`);
  }
  assert.equal(checksum(bytes, 0, bytes.length), 0xb1b0afba, 'whole-file checksum');
  assert.equal(view.getUint32(tables.head.offset + 12), 0x5f0f3cf5, 'head magic number');
});

test('every drawn character is mapped to a glyph with an outline', () => {
  const { bytes, glyphCount } = generateTTF(FONT_DATA, PARAMS);
  const { view, tables } = readTables(bytes);
  const chars = Object.keys(FONT_DATA);
  assert.equal(glyphCount, chars.length);
  assert.equal(view.getUint16(tables.maxp.offset + 4), chars.length + 2, '.notdef + space + characters');

  const seen = new Set();
  for (const ch of chars) {
    const gid = glyphIndex(view, tables.cmap, ch.codePointAt(0));
    assert.ok(gid >= 2, `no glyph for ${ch}`);
    seen.add(gid);
    const from = view.getUint32(tables.loca.offset + gid * 4);
    const to = view.getUint32(tables.loca.offset + (gid + 1) * 4);
    assert.ok(to > from, `empty outline for ${ch}`);
    assert.ok(view.getInt16(tables.glyf.offset + from) > 0, `no contours for ${ch}`);
  }
  assert.equal(seen.size, chars.length, 'each character has its own glyph');
  assert.equal(glyphIndex(view, tables.cmap, 0x20), 1, 'space');
  assert.equal(glyphIndex(view, tables.cmap, 0x1f600), 0, 'unmapped code points fall back to .notdef');
});

test('the font is monospaced and its metrics follow the grid', () => {
  const { bytes } = generateTTF(FONT_DATA, PARAMS);
  const { view, tables } = readTables(bytes);
  const numGlyphs = view.getUint16(tables.maxp.offset + 4);
  const advance = view.getUint16(tables.hmtx.offset);
  for (let g = 0; g < numGlyphs; g++) assert.equal(view.getUint16(tables.hmtx.offset + g * 4), advance);
  assert.equal(view.getUint32(tables.post.offset + 12), 1, 'isFixedPitch');
  // 5 columns of 40 + 4 gaps of 3 + spacing 8 = 220px; one em is 7 rows of 43px.
  assert.equal(advance, Math.round(220 * 1000 / 301));
  assert.equal(view.getInt16(tables.hhea.offset + 4), Math.round(298 * 1000 / 301), 'ascender = grid height');
  assert.equal(view.getInt16(tables.hhea.offset + 6), 0, 'no descender row in the classic 5×7 set');
});

test('artwork-only settings are reported, not silently dropped', () => {
  assert.deepEqual(Array.from(generateTTF(FONT_DATA, PARAMS).notes), []);
  const { notes } = generateTTF(FONT_DATA, { ...PARAMS, outline: true, showOff: true });
  assert.deepEqual(Array.from(notes), ['outline', 'unlit pixels']);
});

test('every pixel shape exports, and a slant marks the font italic', () => {
  for (const cellShape of ['rect', 'nodes', 'circle', 'horizontal', 'vertical', 'pixel', 'diamond', 'hexagon', 'ring', 'plus', 'diagonal', 'halftone', 'open', 'dash', 'tile', 'slope']) {
    const params = { ...PARAMS, cellShape, diagFill: cellShape === 'rect' };
    if (cellShape === 'nodes') Object.assign(params, { gapX: 0, gapY: 0 });
    const { bytes } = generateTTF(FONT_DATA, params);
    assert.ok(bytes.length > 2000, `${cellShape} produced a font`);
  }
  const { bytes } = generateTTF(FONT_DATA, { ...PARAMS, skewX: -12 });
  const { view, tables } = readTables(bytes);
  assert.equal(view.getUint16(tables.head.offset + 44) & 2, 2, 'macStyle italic');
});

test('arcs become quadratic curves that stay on the circle', () => {
  const [circle] = pathToContours('M 0 10 A 10 10 0 1 1 20 10 A 10 10 0 1 1 0 10 Z');
  const onCurve = circle.filter(p => p.on);
  assert.ok(onCurve.length >= 16);
  for (const p of onCurve) assert.ok(Math.abs(Math.hypot(p.x - 10, p.y - 10) - 10) < 1e-6);
});

test('Nodes joins are built with their cutters already subtracted', () => {
  // An L of three pixels: the join in the inside corner must stay inside the
  // 2×2 block; a cutter left as a positive shape would spill out of it.
  const data = [1, 0, 1, 1];
  const params = { cellWidth: 40, cellHeight: 40, gapX: 0, gapY: 0, cellShape: 'nodes', lockNodeRadius: true };
  const contours = glyphContours(data, 2, 2, params);
  for (const p of contours.flat()) {
    assert.ok(p.x >= -1e-6 && p.x <= 80 + 1e-6 && p.y >= -1e-6 && p.y <= 80 + 1e-6);
  }
  assert.ok(contours.length >= 6, 'three circles, two bridges and the corner join');
});

test('guides come from the drawings', () => {
  assert.deepEqual({ ...detectMetrics(FONT_DATA, FONT_COLS, FONT_ROWS) }, { capRow: 0, xRow: 2, baselineRow: 7 });
  assert.deepEqual({ ...detectMetrics({}, 5, 8) }, { capRow: 0, xRow: 2, baselineRow: 8 });
});
