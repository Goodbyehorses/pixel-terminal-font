'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load');

const g = load();

test('CHAR_STYLES glyphs are cols*rows arrays of 0/1', () => {
  assert.ok(g.CHAR_STYLES.length > 0);
  for (const style of g.CHAR_STYLES) {
    const cols = style.cols ?? g.FONT_COLS;
    const rows = style.rows ?? g.FONT_ROWS;
    const entries = Object.entries(style.data);
    assert.ok(entries.length > 0, `${style.name}: no glyphs`);
    for (const [ch, glyph] of entries) {
      const label = `${style.name} ${JSON.stringify(ch)}`;
      assert.ok(Array.isArray(glyph), `${label}: not an array`);
      assert.equal(glyph.length, cols * rows, `${label}: length`);
      assert.ok(glyph.every((v) => v === 0 || v === 1), `${label}: values must be 0/1`);
    }
  }
});

test('FONT_MAPS glyphs match their declared dimensions', () => {
  for (const [key, map] of Object.entries(g.FONT_MAPS)) {
    assert.equal(key, `${map.cols}x${map.rows}`);
    for (const [ch, glyph] of Object.entries(map.data)) {
      assert.equal(glyph.length, map.cols * map.rows, `${key} ${JSON.stringify(ch)}`);
    }
  }
});

test('bestFontSource picks the exact map when available', () => {
  for (const [key, map] of Object.entries(g.FONT_MAPS)) {
    assert.equal(g.bestFontSource(map.cols, map.rows), g.FONT_MAPS[key], key);
  }
});

test('bestFontSource falls back to a known map for other sizes', () => {
  const maps = Object.values(g.FONT_MAPS);
  for (const [c, r] of [[6, 8], [3, 3], [14, 16], [4, 7]]) {
    assert.ok(maps.includes(g.bestFontSource(c, r)), `${c}x${r}`);
  }
});
