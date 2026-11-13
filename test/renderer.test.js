'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/load');

// Objects from the vm context have foreign prototypes; spread into plain objects
// before deepEqual.
const g = load();
const COLS = 5;
const ROWS = 7;
const A = g.FONT_DATA.A;
const BLANK = new Array(COLS * ROWS).fill(0);

function baseParams(extra) {
  return {
    cellWidth: 20, cellHeight: 20, gapX: 2, gapY: 2, cornerRadius: 4,
    innerRadius: 0, bridgeRadius: 0, cornerMerge: true, cellShape: 'rect',
    fgColor: '#ffffff', bgColor: '#000000', padding: 0, skewX: 0,
    ...extra,
  };
}

const PIXEL_SHAPES = [
  'rect', 'circle', 'nodes', 'horizontal', 'vertical', 'pixel', 'diamond',
  'ring', 'plus', 'hexagon', 'diagonal', 'halftone', 'slope', 'tile', 'open', 'dash',
];

test('generateGlyphPath returns path data for A in pixel cell shapes', () => {
  for (const cellShape of PIXEL_SHAPES) {
    const d = g.generateGlyphPath(A, COLS, ROWS, baseParams({ cellShape }));
    assert.equal(typeof d, 'string', cellShape);
    assert.ok(d.trim().length > 0, `${cellShape}: empty path`);
    assert.match(d.trim(), /^M/, `${cellShape}: path should start with M`);
  }
});

test('generateGlyphPath returns empty path data for an all-zero glyph', () => {
  for (const cellShape of PIXEL_SHAPES) {
    const d = g.generateGlyphPath(BLANK, COLS, ROWS, baseParams({ cellShape }));
    assert.equal(d.trim(), '', cellShape);
  }
});

function assertWellFormedSVG(svg, label) {
  assert.ok(svg.startsWith('<svg'), `${label}: should start with <svg`);
  assert.ok(svg.trim().endsWith('</svg>'), `${label}: should end with </svg>`);
  const open = svg.match(/^<svg[^>]*>/)[0];
  assert.match(open, /\swidth="[\d.]+"/, `${label}: width`);
  assert.match(open, /\sheight="[\d.]+"/, `${label}: height`);
  assert.match(open, /\sviewBox="0 0 [\d.]+ [\d.]+"/, `${label}: viewBox`);
  // Every tag's attribute quotes are balanced.
  for (const tag of svg.match(/<[^>]+>/g)) {
    const quotes = (tag.match(/"/g) || []).length;
    assert.equal(quotes % 2, 0, `${label}: unbalanced quotes in ${tag}`);
  }
}

test('generateGlyphSVG output is well-formed', () => {
  const variants = [
    baseParams(),
    baseParams({ cellShape: 'circle', skewX: -12, padding: 6 }),
    baseParams({ cellShape: 'nodes', outline: true, outlineWidth: 2 }),
    baseParams({ outline: true, outlineColor: '#ff0000', bgColor: 'transparent' }),
    baseParams({ cellShape: 'ring', showOff: true, shapeWeight: 45 }),
    baseParams({ showOff: true, diagFill: true, diagWidth: 6 }),
  ];
  for (const params of variants) {
    assertWellFormedSVG(g.generateGlyphSVG(A, COLS, ROWS, params, 'A'), JSON.stringify(params));
    assertWellFormedSVG(g.generateGlyphSVG(BLANK, COLS, ROWS, params, ' '), `blank ${params.cellShape}`);
  }
});

test('generateGlyphSVG size matches glyphDimensions', () => {
  const params = baseParams({ skewX: 10, padding: 3 });
  const { w, h } = g.glyphDimensions(COLS, ROWS, params);
  const svg = g.generateGlyphSVG(A, COLS, ROWS, params, 'A');
  assert.ok(svg.includes(`width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"`));
});

test('glyphDimensions without skew or padding', () => {
  // 5 * (20 + 2) - 2 = 108, 7 * (20 + 2) - 2 = 152
  assert.deepEqual({ ...g.glyphDimensions(COLS, ROWS, baseParams()) }, { w: 108, h: 152 });
});

test('glyphDimensions with separate gaps and padding', () => {
  const params = baseParams({ cellWidth: 10, cellHeight: 12, gapX: 4, gapY: 1, padding: 5 });
  // w = 5*14 - 4 + 10 = 76, h = 7*13 - 1 + 10 = 100
  assert.deepEqual({ ...g.glyphDimensions(COLS, ROWS, params) }, { w: 76, h: 100 });
});

test('glyphDimensions falls back to legacy gap', () => {
  const params = { cellWidth: 10, cellHeight: 10, gap: 3 };
  // w = 5*13 - 3 = 62, h = 7*13 - 3 = 88
  assert.deepEqual({ ...g.glyphDimensions(COLS, ROWS, params) }, { w: 62, h: 88 });
});

test('glyphDimensions adds skew extra width (sign-independent)', () => {
  const contentH = 152;
  for (const skewX of [15, -15, 30, -7]) {
    const extra = Math.ceil(Math.abs(Math.tan(skewX * Math.PI / 180)) * contentH);
    assert.ok(extra > 0);
    const dims = { ...g.glyphDimensions(COLS, ROWS, baseParams({ skewX, padding: 2 })) };
    assert.deepEqual(dims, { w: 108 + extra + 4, h: contentH + 4 }, `skewX=${skewX}`);
  }
  assert.equal(g.skewExtraWidth(0, contentH), 0);
});

test('slope bands run between the corner cuts, so diagonals match straight strokes', () => {
  const subpaths = (data, extra) => {
    const d = g.generateGlyphPath(data, 2, 2, baseParams({ cellShape: 'slope', gapX: 0, gapY: 0, ...extra }));
    return d.split('Z').map((sub) => sub.trim()).filter(Boolean)
      .map((sub) => sub.replace(/[ML] /g, '|').split('|').filter(Boolean).map((pt) => pt.trim()));
  };

  // "\\" pair: pixel, band, pixel. Every band point sits on a corner cut of one of the
  // two pixels, so no part of the band pokes out past a cut.
  const [first, band, second] = subpaths([1, 0, 0, 1]);
  assert.equal(band.join(', '), '16 0, 20 4, 36 20, 40 24, 24 40, 20 36, 4 20, 0 16');
  for (const pt of band.slice(0, 2).concat(band.slice(6))) assert.ok(first.includes(pt), `${pt} is not on the first pixel`);
  for (const pt of band.slice(2, 6)) assert.ok(second.includes(pt), `${pt} is not on the second pixel`);

  // "/" pair mirrors it.
  const [, upBand] = subpaths([0, 1, 1, 0]);
  assert.equal(upBand.join(', '), '24 0, 40 16, 36 20, 20 36, 16 40, 0 24, 4 20, 20 4');

  // With the cut at 1 - 1/sqrt(2) of the pixel, the band is exactly one pixel thick.
  const size = 20, cut = size * (1 - Math.SQRT1_2);
  const [, even] = subpaths([1, 0, 0, 1], { cornerRadius: cut });
  const [ax, ay] = even[0].split(' ').map(Number);   // on the upper long edge
  const [bx, by] = even[7].split(' ').map(Number);   // on the lower long edge
  const thickness = Math.abs((ax - ay) - (bx - by)) / Math.SQRT2;
  assert.ok(Math.abs(thickness - size) < 0.02, `band is ${thickness} thick, pixel is ${size}`);
});

test('font export covers the shared edge of touching pixels when the gap is zero', () => {
  for (const cellShape of ['rect', 'slope']) {
    const params = baseParams({ cellShape, gapX: 0, gapY: 0 });
    const count = (extra) => g.generateGlyphPath([1, 1], 2, 1, { ...params, ...extra }).split('Z').filter((s) => s.trim()).length;
    assert.equal(count({}), 2, `${cellShape}: artwork is just the two pixels`);
    assert.equal(count({ _overlap: true }), 3, `${cellShape}: export adds a cover over the seam`);
  }
});
