// font-export.js — TrueType (.ttf) writer for the pixel font. No dependencies.
//
// The font keeps the look that can be expressed as filled outlines: pixel
// shape, corner rounding, joins, diagonal fill, slant and spacing. Strokes and
// second colours (outline, unlit pixels) have no equivalent in a plain
// TrueType outline and are reported back as notes.

const TTF_UNITS_PER_EM = 1000;

// ─────────────────────────────────────────────
//  Type metrics from the drawings
// ─────────────────────────────────────────────

/**
 * Find the rows the type sits on. Rows are counted from the top of the grid:
 * capRow is the first row capitals use, xRow the first row of a lowercase x,
 * and baselineRow the first row below the baseline (rows = no descender row).
 */
function detectMetrics(glyphs, cols, rows) {
  const extent = (ch) => {
    const d = glyphs[ch];
    if (!d || d.length !== cols * rows) return null;
    let top = -1, bottom = -1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (d[r * cols + c]) { if (top < 0) top = r; bottom = r; break; }
      }
    }
    return top < 0 ? null : { top, bottom };
  };
  // Most common value wins, so one unusual drawing does not move a guide.
  const mode = (values, fallback) => {
    if (!values.length) return fallback;
    const counts = new Map();
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  };

  const tops = [], bottoms = [];
  for (const ch of 'ABCDEFGHIKLMNOPRSTUVWXYZ') {   // J and Q may descend
    const e = extent(ch);
    if (e) { tops.push(e.top); bottoms.push(e.bottom + 1); }
  }
  const capRow = mode(tops, 0);
  const baselineRow = Math.max(capRow + 1, mode(bottoms, rows));

  const xTops = [];
  for (const ch of 'xzvnou') { const e = extent(ch); if (e) xTops.push(e.top); }
  let xRow = mode(xTops, -1);
  if (xRow <= capRow || xRow >= baselineRow) {
    xRow = Math.min(baselineRow - 1, capRow + Math.max(1, Math.round((baselineRow - capRow) * 2 / 7)));
  }
  return { capRow, xRow, baselineRow };
}

// ─────────────────────────────────────────────
//  SVG path data → contours of quadratic points
// ─────────────────────────────────────────────
// A contour is [{ x, y, on }], where on = false marks a quadratic control point.

/** Append quadratic segments for an axis-aligned elliptical arc. */
function arcQuads(pts, cx, cy, rx, ry, start, delta) {
  const n = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 8) - 1e-9));
  const step = delta / n;
  const k = 1 / Math.cos(step / 2);
  for (let j = 0; j < n; j++) {
    const mid = start + step * (j + 0.5), end = start + step * (j + 1);
    pts.push({ x: cx + rx * k * Math.cos(mid), y: cy + ry * k * Math.sin(mid), on: false });
    pts.push({ x: cx + rx * Math.cos(end), y: cy + ry * Math.sin(end), on: true });
  }
}

/** SVG endpoint arc (x-axis-rotation 0) → quadratic segments. */
function appendArc(pts, x1, y1, rx, ry, large, sweep, x2, y2) {
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry || (x1 === x2 && y1 === y2)) { pts.push({ x: x2, y: y2, on: true }); return; }
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const lambda = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx;
  const den = rx * rx * dy * dy + ry * ry * dx * dx;
  let co = Math.sqrt(Math.max(0, num / den));
  if (!!large === !!sweep) co = -co;
  const cx = co * rx * dy / ry + (x1 + x2) / 2;
  const cy = -co * ry * dx / rx + (y1 + y2) / 2;
  const a1 = Math.atan2((y1 - cy) / ry, (x1 - cx) / rx);
  const a2 = Math.atan2((y2 - cy) / ry, (x2 - cx) / rx);
  let delta = a2 - a1;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  else if (!sweep && delta > 0) delta -= 2 * Math.PI;
  arcQuads(pts, cx, cy, rx, ry, a1, delta);
  const last = pts[pts.length - 1];
  last.x = x2; last.y = y2;   // land exactly on the endpoint
}

/** Parse the absolute M/L/H/V/A/Z path data the renderer emits. */
function pathToContours(d) {
  const tokens = d.match(/[MLHVAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const contours = [];
  let cur = null, x = 0, y = 0, sx = 0, sy = 0, i = 0, cmd = null;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/^[MLHVAZ]$/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M') {
      x = sx = num(); y = sy = num();
      cur = [{ x, y, on: true }];
      contours.push(cur);
      cmd = 'L';
    } else if (cmd === 'Z') {
      x = sx; y = sy; cur = null;
    } else if (!cur) {
      break;   // malformed data: nothing to draw into
    } else if (cmd === 'L') {
      x = num(); y = num(); cur.push({ x, y, on: true });
    } else if (cmd === 'H') {
      x = num(); cur.push({ x, y, on: true });
    } else if (cmd === 'V') {
      y = num(); cur.push({ x, y, on: true });
    } else if (cmd === 'A') {
      const rx = num(), ry = num(); num();
      const large = num(), sweep = num(), ex = num(), ey = num();
      appendArc(cur, x, y, rx, ry, large, sweep, ex, ey);
      x = ex; y = ey;
    } else {
      break;
    }
  }
  return contours;
}

/** Twice the signed area of the control polygon; positive = clockwise on screen. */
function contourArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

/** All filled shapes must wind the same way, or overlapping ones cancel out. */
function windClockwise(pts) {
  return contourArea(pts) < 0 ? pts.slice().reverse() : pts;
}

/** A round-capped line as a filled outline (the diagonal fill strokes). */
function capsuleContour(x1, y1, x2, y2, r) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (!len || r <= 0) return null;
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  const an = Math.atan2(ny, nx);
  const pts = [
    { x: x1 + nx * r, y: y1 + ny * r, on: true },
    { x: x2 + nx * r, y: y2 + ny * r, on: true },
  ];
  arcQuads(pts, x2, y2, r, r, an, -Math.PI);
  pts.push({ x: x1 - nx * r, y: y1 - ny * r, on: true });
  arcQuads(pts, x1, y1, r, r, an - Math.PI, -Math.PI);
  return windClockwise(pts);
}

/** Diagonal fill: same connections as generateDiagLines, as filled capsules. */
function diagContours(data, cols, rows, params) {
  const { cellWidth, cellHeight, diagFill, diagWidth = 8 } = params;
  if (!diagFill || diagWidth <= 0 || params.cellShape === 'nodes') return [];
  const { gapX, gapY } = resolveGaps(params);
  const stepX = cellWidth + gapX, stepY = cellHeight + gapY;
  const isOn = (c, r) => c >= 0 && c < cols && r >= 0 && r < rows && data[r * cols + c] === 1;
  const cx = (c) => c * stepX + cellWidth / 2;
  const cy = (r) => r * stepY + cellHeight / 2;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isOn(c, r)) continue;
      for (const dc of [1, -1]) {
        if (isOn(c + dc, r + 1) && !isOn(c + dc, r) && !isOn(c, r + 1)) {
          const cap = capsuleContour(cx(c), cy(r), cx(c + dc), cy(r + 1), diagWidth / 2);
          if (cap) out.push(cap);
        }
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────
//  Nodes shape: joins with the cutter circles already subtracted
// ─────────────────────────────────────────────
// The SVG renderer subtracts the cutters with a mask. A font outline has no
// mask, so the patch minus its cutters is built as geometry here.

/** Rectangle with concave quarter-circle bites of radius R at the given corners. */
function rectWithCornerBites(x0, y0, x1, y1, R, cut) {
  const p = (n) => Math.round(n * 1000) / 1000;
  const arc = (x, y) => `A ${p(R)} ${p(R)} 0 0 0 ${p(x)} ${p(y)}`;
  const d = [`M ${p(cut.tl ? x0 + R : x0)} ${p(y0)}`];
  if (cut.tr) d.push(`L ${p(x1 - R)} ${p(y0)}`, arc(x1, y0 + R)); else d.push(`L ${p(x1)} ${p(y0)}`);
  if (cut.br) d.push(`L ${p(x1)} ${p(y1 - R)}`, arc(x1 - R, y1)); else d.push(`L ${p(x1)} ${p(y1)}`);
  if (cut.bl) d.push(`L ${p(x0 + R)} ${p(y1)}`, arc(x0, y1 - R)); else d.push(`L ${p(x0)} ${p(y1)}`);
  if (cut.tl) d.push(`L ${p(x0)} ${p(y0 + R)}`, arc(x0 + R, y0));
  d.push('Z');
  return pathToContours(d.join(' '));
}

/** Convex polygon minus a convex polygon, as disjoint convex pieces. */
function polyMinusConvex(poly, cutter) {
  const pieces = [];
  let rest = poly;
  for (let i = 0; i < cutter.length && rest.length >= 3; i++) {
    const [ax, ay] = cutter[i], [bx, by] = cutter[(i + 1) % cutter.length];
    const inside = (x, y) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const piece = clipHalfPlane(rest, (x, y) => -inside(x, y));
    if (piece.length >= 3) pieces.push(piece);
    rest = clipHalfPlane(rest, inside);
  }
  return pieces;
}

/** Axis-aligned rectangle minus discs of radius R. */
function rectMinusDiscs(x0, y0, x1, y1, discs, R) {
  const eps = 0.01;
  const near = (a, b) => Math.abs(a - b) < eps;
  const cut = { tl: false, tr: false, br: false, bl: false };
  const atCorners = R <= x1 - x0 + eps && R <= y1 - y0 + eps && discs.every(([cx, cy]) => {
    if (near(cx, x0) && near(cy, y0)) return (cut.tl = true);
    if (near(cx, x1) && near(cy, y0)) return (cut.tr = true);
    if (near(cx, x1) && near(cy, y1)) return (cut.br = true);
    if (near(cx, x0) && near(cy, y1)) return (cut.bl = true);
    return false;
  });
  if (atCorners) return rectWithCornerBites(x0, y0, x1, y1, R, cut);

  // General position: approximate each disc with a polygon and clip.
  let polys = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
  for (const [cx, cy] of discs) {
    const ring = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * 2 * Math.PI;
      ring.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    polys = polys.flatMap(poly => polyMinusConvex(poly, ring));
  }
  return polys.map(poly => poly.map(([x, y]) => ({ x, y, on: true })));
}

function nodesContours(data, cols, rows, params) {
  const { cellWidth, cellHeight } = params;
  const { gapX, gapY } = resolveGaps(params);
  const R = resolveNodeR(params);
  const stepX = cellWidth + gapX, stepY = cellHeight + gapY;
  const isOn = (c, r) => c >= 0 && c < cols && r >= 0 && r < rows && data[r * cols + c] === 1;
  const cx = (c) => c * stepX + cellWidth / 2;
  const cy = (r) => r * stepY + cellHeight / 2;
  const rect = (x, y, w, h) => `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;

  const parts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isOn(c, r)) continue;
      parts.push(ellipseSubpath(cx(c), cy(r), R, R));
      if (isOn(c + 1, r)) parts.push(rect(cx(c), cy(r) - R, cx(c + 1) - cx(c), 2 * R));
      if (isOn(c, r + 1)) parts.push(rect(cx(c) - R, cy(r), 2 * R, cy(r + 1) - cy(r)));
    }
  }
  const contours = pathToContours(parts.join(' '));

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const ul = isOn(c, r), ur = isOn(c + 1, r), ll = isOn(c, r + 1), lr = isOn(c + 1, r + 1);
      const count = ul + ur + ll + lr;
      const xL = cx(c), xR = cx(c + 1), yT = cy(r), yB = cy(r + 1);
      const vx = (xL + xR) / 2, vy = (yT + yB) / 2;
      if (count === 3) {
        const px = (!ul || !ll) ? vx - R : vx;
        const py = (!ul || !ur) ? vy - R : vy;
        const disc = !ul ? [xL, yT] : !ur ? [xR, yT] : !ll ? [xL, yB] : [xR, yB];
        contours.push(...rectMinusDiscs(px, py, px + R, py + R, [disc], R));
      } else if (count === 2 && ((ul && lr) || (ur && ll))) {
        const discs = (ul && lr) ? [[xR, yT], [xL, yB]] : [[xL, yT], [xR, yB]];
        contours.push(...rectMinusDiscs(vx - R, vy - R, vx + R, vy + R, discs, R));
      }
    }
  }
  return contours;
}

/** Every filled outline of one glyph, in the renderer's pixel coordinates. */
function glyphContours(data, cols, rows, params) {
  const contours = params.cellShape === 'nodes'
    ? nodesContours(data, cols, rows, params)
    : pathToContours(generateGlyphPath(data, cols, rows, { ...params, _overlap: true }));
  return contours.concat(diagContours(data, cols, rows, params));
}

// ─────────────────────────────────────────────
//  Binary writing
// ─────────────────────────────────────────────

class ByteWriter {
  constructor() { this.bytes = []; }
  get length() { return this.bytes.length; }
  u8(v) { this.bytes.push(v & 0xff); return this; }
  u16(v) { this.bytes.push((v >>> 8) & 0xff, v & 0xff); return this; }
  i16(v) { return this.u16(v < 0 ? v + 0x10000 : v); }
  u32(v) { this.bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); return this; }
  i32(v) { return this.u32(v < 0 ? v + 0x100000000 : v); }
  tag(s) { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i)); return this; }
  pad(n = 4) { while (this.bytes.length % n) this.bytes.push(0); return this; }
  append(bytes) { for (let i = 0; i < bytes.length; i++) this.bytes.push(bytes[i]); return this; }
  toUint8Array() { return Uint8Array.from(this.bytes); }
}

function tableChecksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    sum = (sum + (((bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0)) >>> 0)) >>> 0;
  }
  return sum;
}

/** One simple glyph record. contours: [[{x, y, on}]] in integer font units. */
function encodeGlyph(contours) {
  const w = new ByteWriter();
  if (!contours.length) return { bytes: w.toUint8Array(), points: 0, box: null };
  const all = contours.flat();
  const box = {
    xMin: Math.min(...all.map(p => p.x)), yMin: Math.min(...all.map(p => p.y)),
    xMax: Math.max(...all.map(p => p.x)), yMax: Math.max(...all.map(p => p.y)),
  };
  w.i16(contours.length).i16(box.xMin).i16(box.yMin).i16(box.xMax).i16(box.yMax);
  let end = -1;
  for (const c of contours) { end += c.length; w.u16(end); }
  w.u16(0);   // no instructions

  const flags = [], xs = new ByteWriter(), ys = new ByteWriter();
  let px = 0, py = 0;
  all.forEach((p, i) => {
    let flag = p.on ? 0x01 : 0;
    if (i === 0) flag |= 0x40;   // contours may overlap
    const dx = p.x - px, dy = p.y - py;
    if (dx === 0) flag |= 0x10;
    else if (Math.abs(dx) < 256) { flag |= 0x02 | (dx > 0 ? 0x10 : 0); xs.u8(Math.abs(dx)); }
    else xs.i16(dx);
    if (dy === 0) flag |= 0x20;
    else if (Math.abs(dy) < 256) { flag |= 0x04 | (dy > 0 ? 0x20 : 0); ys.u8(Math.abs(dy)); }
    else ys.i16(dy);
    flags.push(flag);
    px = p.x; py = p.y;
  });
  for (const f of flags) w.u8(f);
  w.append(xs.bytes).append(ys.bytes);
  w.pad(4);
  return { bytes: w.toUint8Array(), points: all.length, box };
}

/** Round to font units, flip to y-up, and drop points that collapse together. */
function finishContour(pts, toUnits) {
  const out = [];
  for (const raw of pts) {
    const p = toUnits(raw);
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) {
      if (p.on && !last.on) out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  while (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].y === out[out.length - 1].y) out.pop();
  if (out.length < 3 || contourArea(out) === 0) return null;
  // Flipping y reversed the winding; reverse the order so filled shapes run
  // clockwise in font space, then start on an on-curve point.
  out.reverse();
  const firstOn = out.findIndex(p => p.on);
  return firstOn > 0 ? out.slice(firstOn).concat(out.slice(0, firstOn)) : out;
}

// ─────────────────────────────────────────────
//  The font
// ─────────────────────────────────────────────

/**
 * Build a monospaced TrueType font from the drawings and the current look.
 *
 * @param {Object<string, number[]>} glyphs  char → flat 0/1 grid
 * @param {object} params                    the app's look parameters
 * @param {{familyName?: string, date?: Date}} [options]
 * @returns {{bytes: Uint8Array, glyphCount: number, notes: string[]}}
 */
function generateTTF(glyphs, params, options = {}) {
  const { cols, rows, cellWidth, cellHeight } = params;
  const { gapX, gapY } = resolveGaps(params);
  const charSpacing = params.charSpacing ?? 8;
  const family = (options.familyName || '').trim() || 'Pixel Font';

  const notes = [];
  if (params.outline) notes.push('outline');
  if (params.showOff) notes.push('unlit pixels');
  if ((params.innerRadius || 0) > 0 && params.cellShape !== 'nodes' && !NO_FILLET_SHAPES.includes(params.cellShape || 'rect')) notes.push('inner radius');

  // Geometry: one em is the grid height plus one row gap.
  const stepX = cellWidth + gapX, stepY = cellHeight + gapY;
  const glyphW = cols * stepX - gapX, gridH = rows * stepY - gapY;
  const scale = TTF_UNITS_PER_EM / (rows * stepY);
  const metrics = detectMetrics(glyphs, cols, rows);
  const baselinePx = metrics.baselineRow * stepY - gapY;
  const shear = Math.tan((params.skewX || 0) * Math.PI / 180);
  const toUnits = (p) => ({
    x: Math.round((p.x + shear * (p.y - baselinePx) + charSpacing / 2) * scale),
    y: Math.round((baselinePx - p.y) * scale),
    on: p.on,
  });
  const units = (px) => Math.round(px * scale);

  const advance = units(glyphW + charSpacing);
  const ascender = units(baselinePx);
  const descender = -units(gridH - baselinePx);
  const lineGap = units(stepY);
  const capHeight = units(baselinePx - metrics.capRow * stepY);
  const xHeight = units(baselinePx - metrics.xRow * stepY);

  // Glyph order: .notdef, space, then every drawn character by code point.
  const chars = Object.keys(glyphs)
    .filter(ch => [...ch].length === 1 && ch.codePointAt(0) > 0x20 && ch.codePointAt(0) < 0xffff
      && Array.isArray(glyphs[ch]) && glyphs[ch].length === cols * rows)
    .sort((a, b) => a.codePointAt(0) - b.codePointAt(0));

  const box = units(charSpacing / 2), boxR = units(charSpacing / 2 + glyphW), t = Math.max(20, units(Math.min(cellWidth, cellHeight) / 2));
  const notdef = [
    [{ x: box, y: 0, on: true }, { x: box, y: capHeight, on: true }, { x: boxR, y: capHeight, on: true }, { x: boxR, y: 0, on: true }],
    [{ x: box + t, y: t, on: true }, { x: boxR - t, y: t, on: true }, { x: boxR - t, y: capHeight - t, on: true }, { x: box + t, y: capHeight - t, on: true }],
  ];
  const outlines = [capHeight > 2 * t && boxR - box > 2 * t ? notdef : [notdef[0]], []];
  for (const ch of chars) {
    outlines.push(glyphContours(glyphs[ch], cols, rows, params)
      .map(c => finishContour(c, toUnits)).filter(Boolean));
  }
  const encoded = outlines.map(encodeGlyph);
  const numGlyphs = encoded.length;

  // glyf + loca
  const glyf = new ByteWriter(), loca = new ByteWriter();
  for (const g of encoded) { loca.u32(glyf.length); glyf.append(g.bytes); }
  loca.u32(glyf.length);

  const boxes = encoded.map(g => g.box).filter(Boolean);
  const bounds = {
    xMin: Math.min(...boxes.map(b => b.xMin)), yMin: Math.min(...boxes.map(b => b.yMin)),
    xMax: Math.max(...boxes.map(b => b.xMax)), yMax: Math.max(...boxes.map(b => b.yMax)),
  };

  // hmtx
  const hmtx = new ByteWriter();
  for (const g of encoded) hmtx.u16(advance).i16(g.box ? g.box.xMin : 0);

  // cmap: one format 4 subtable; space and no-break space share glyph 1.
  const mapping = [[0x20, 1], [0xa0, 1], ...chars.map((ch, i) => [ch.codePointAt(0), i + 2])]
    .sort((a, b) => a[0] - b[0])
    .filter((m, i, list) => i === 0 || m[0] !== list[i - 1][0]);
  const segments = [];
  for (const [code, gid] of mapping) {
    const seg = segments[segments.length - 1];
    if (seg && code === seg.end + 1 && gid - code === seg.delta) seg.end = code;
    else segments.push({ start: code, end: code, delta: gid - code });
  }
  segments.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const segCount = segments.length;
  const entrySelector = Math.floor(Math.log2(segCount));
  const searchRange = 2 * 2 ** entrySelector;
  const cmap = new ByteWriter();
  cmap.u16(0).u16(1).u16(3).u16(1).u32(12);
  cmap.u16(4).u16(16 + segCount * 8).u16(0).u16(segCount * 2).u16(searchRange).u16(entrySelector).u16(segCount * 2 - searchRange);
  for (const s of segments) cmap.u16(s.end);
  cmap.u16(0);
  for (const s of segments) cmap.u16(s.start);
  for (const s of segments) cmap.u16(s.delta & 0xffff);
  for (let i = 0; i < segCount; i++) cmap.u16(0);

  // head
  const seconds = Math.floor((options.date || new Date()).getTime() / 1000) + 2082844800;
  const italic = !!params.skewX;
  const head = new ByteWriter();
  head.u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(TTF_UNITS_PER_EM);
  for (let i = 0; i < 2; i++) head.u32(Math.floor(seconds / 0x100000000)).u32(seconds >>> 0);
  head.i16(bounds.xMin).i16(bounds.yMin).i16(bounds.xMax).i16(bounds.yMax);
  head.u16(italic ? 0x0002 : 0).u16(8).i16(2).i16(1).i16(0);

  // hhea
  const lsbs = encoded.filter(g => g.box).map(g => g.box.xMin);
  const hhea = new ByteWriter();
  hhea.u32(0x00010000).i16(ascender).i16(descender).i16(lineGap).u16(advance);
  hhea.i16(Math.min(...lsbs)).i16(Math.min(...boxes.map(b => advance - b.xMax))).i16(bounds.xMax);
  hhea.i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(numGlyphs);

  // maxp
  const maxp = new ByteWriter();
  maxp.u32(0x00010000).u16(numGlyphs).u16(Math.max(...encoded.map(g => g.points)));
  maxp.u16(Math.max(...outlines.map(o => o.length))).u16(0).u16(0).u16(2);
  for (let i = 0; i < 8; i++) maxp.u16(0);

  // OS/2 (version 4)
  const codes = mapping.map(m => m[0]);
  const os2 = new ByteWriter();
  os2.u16(4).i16(advance).u16(400).u16(5).u16(0);
  os2.i16(650).i16(600).i16(0).i16(75).i16(650).i16(600).i16(0).i16(350).i16(50).i16(Math.round(xHeight / 2));
  os2.i16(0);
  for (const v of [2, 0, 0, 9, 0, 0, 0, 0, 0, 0]) os2.u8(v);   // panose: monospaced
  os2.u32(3).u32(0).u32(0).u32(0).tag('PXFG');
  os2.u16(italic ? 0x0081 : 0x00c0).u16(Math.min(...codes)).u16(Math.max(...codes));
  os2.i16(ascender).i16(descender).i16(lineGap).u16(Math.max(ascender, bounds.yMax)).u16(Math.max(-descender, -bounds.yMin));
  os2.u32(1).u32(0).i16(xHeight).i16(capHeight).u16(0).u16(0x20).u16(0);

  // post (version 3: no glyph names)
  const post = new ByteWriter();
  post.u32(0x00030000).i32(Math.round((params.skewX || 0) * 65536)).i16(-Math.round(TTF_UNITS_PER_EM / 10)).i16(Math.round(TTF_UNITS_PER_EM / 20)).u32(1);
  for (let i = 0; i < 4; i++) post.u32(0);

  // name
  const style = italic ? 'Italic' : 'Regular';
  const psName = (family.replace(/[^A-Za-z0-9]+/g, '') || 'PixelFont').slice(0, 50) + '-' + style;
  const names = [
    [1, family], [2, style], [3, `${family} ${style}; Pixel Font Generator`],
    [4, italic ? `${family} ${style}` : family], [5, 'Version 1.000'], [6, psName],
  ];
  const name = new ByteWriter(), strings = new ByteWriter();
  name.u16(0).u16(names.length).u16(6 + names.length * 12);
  for (const [id, text] of names) {
    name.u16(3).u16(1).u16(0x0409).u16(id).u16(text.length * 2).u16(strings.length);
    for (let i = 0; i < text.length; i++) strings.u16(text.charCodeAt(i));
  }
  name.append(strings.bytes);

  // Assemble: table directory, then tables in tag order.
  const tables = [
    ['OS/2', os2], ['cmap', cmap], ['glyf', glyf], ['head', head], ['hhea', hhea],
    ['hmtx', hmtx], ['loca', loca], ['maxp', maxp], ['name', name], ['post', post],
  ].map(([tag, w]) => {
    const length = w.length;   // the directory records the unpadded length
    return { tag, length, data: w.pad(4).toUint8Array() };
  });
  const file = new ByteWriter();
  const dirSelector = Math.floor(Math.log2(tables.length));
  file.u32(0x00010000).u16(tables.length).u16(16 * 2 ** dirSelector).u16(dirSelector).u16(tables.length * 16 - 16 * 2 ** dirSelector);
  let offset = 12 + tables.length * 16, headOffset = 0;
  for (const tbl of tables) {
    if (tbl.tag === 'head') headOffset = offset;
    file.tag(tbl.tag).u32(tableChecksum(tbl.data)).u32(offset).u32(tbl.length);
    offset += tbl.data.length;
  }
  for (const tbl of tables) file.append(tbl.data);
  const bytes = file.toUint8Array();
  const adjust = (0xb1b0afba - tableChecksum(bytes)) >>> 0;
  new DataView(bytes.buffer).setUint32(headOffset + 8, adjust);

  return { bytes, glyphCount: chars.length, notes };
}
