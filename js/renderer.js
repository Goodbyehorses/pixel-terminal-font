// renderer.js — pure SVG path generation for the pixel font

/**
 * Generate a rounded rectangle SVG path segment.
 * Per-corner radii: rTL, rTR, rBR, rBL (clockwise from top-left).
 */
function roundedRectPath(x, y, w, h, rTL, rTR, rBR, rBL) {
  const p = (n) => Math.round(n * 100) / 100;
  const parts = [];
  parts.push(`M ${p(x + rTL)} ${p(y)}`);
  parts.push(`H ${p(x + w - rTR)}`);
  if (rTR > 0) parts.push(`A ${p(rTR)} ${p(rTR)} 0 0 1 ${p(x + w)} ${p(y + rTR)}`);
  parts.push(`V ${p(y + h - rBR)}`);
  if (rBR > 0) parts.push(`A ${p(rBR)} ${p(rBR)} 0 0 1 ${p(x + w - rBR)} ${p(y + h)}`);
  parts.push(`H ${p(x + rBL)}`);
  if (rBL > 0) parts.push(`A ${p(rBL)} ${p(rBL)} 0 0 1 ${p(x)} ${p(y + h - rBL)}`);
  parts.push(`V ${p(y + rTL)}`);
  if (rTL > 0) parts.push(`A ${p(rTL)} ${p(rTL)} 0 0 1 ${p(x + rTL)} ${p(y)}`);
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Generate an ellipse SVG subpath (two half-arcs).
 * cx/cy = center, rx/ry = radii.
 */
function ellipseSubpath(cx, cy, rx, ry) {
  const p = (n) => Math.round(n * 100) / 100;
  return [
    `M ${p(cx - rx)} ${p(cy)}`,
    `A ${p(rx)} ${p(ry)} 0 1 1 ${p(cx + rx)} ${p(cy)}`,
    `A ${p(rx)} ${p(ry)} 0 1 1 ${p(cx - rx)} ${p(cy)}`,
    'Z',
  ].join(' ');
}

/**
 * Closed polygon subpath from [[x, y], ...] points (clockwise on screen).
 */
function polygonSubpath(pts) {
  const p = (n) => Math.round(n * 100) / 100;
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${p(x)} ${p(y)}`).join(' ') + ' Z';
}

/**
 * Clip a polygon to the half-plane f(x, y) >= 0 (Sutherland–Hodgman, one edge).
 * f must be affine so the edge intersection can be interpolated linearly.
 */
function clipHalfPlane(pts, f) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const fa = f(a[0], a[1]), fb = f(b[0], b[1]);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * Resolve gapX / gapY from params, falling back to legacy 'gap' for old saved styles.
 */
function resolveGaps(params) {
  const gapX = params.gapX != null ? params.gapX : (params.gap ?? 0);
  const gapY = params.gapY != null ? params.gapY : (params.gap ?? 0);
  return { gapX, gapY };
}

/**
 * Compute extra width added to an SVG to prevent skew clipping.
 * skewX(angle) shears x by y*tan(angle), so a glyph of height H
 * needs |tan(angle)|*H extra horizontal space.
 */
function skewExtraWidth(skewX, contentH) {
  if (!skewX) return 0;
  return Math.ceil(Math.abs(Math.tan(skewX * Math.PI / 180)) * contentH);
}


/**
 * Resolve the effective node radius from params (respects lockNodeRadius).
 */
function resolveNodeR(params) {
  if (params._nodeR != null) return params._nodeR;
  const maxR = Math.min(params.cellWidth, params.cellHeight) / 2;
  return (params.lockNodeRadius !== false)
    ? maxR
    : Math.max(0, Math.min(params.cornerRadius || 0, maxR));
}

/**
 * Generate outline halo for Nodes style: same geometry as positive layer but with
 * nodeR enlarged by outlineWidth. Rendered in outlineColor beneath the main shape.
 */
function generateNodesHalo(data, cols, rows, params) {
  const outlineW = Math.max(1, params.outlineWidth != null ? params.outlineWidth : 3);
  const nodeR = resolveNodeR(params);
  const haloParams = { ...params, _nodeR: nodeR + outlineW };
  return generateNodesGeometry(data, cols, rows, haloParams);
}

/**
 * Nodes style: circles at each ON pixel centre, orthogonal bridge rects between
 * adjacent ON pixels, concave corner fillets at count=3 L/T junctions, diagonal
 * bridges at count=2 diagonal configurations. Positive + cutter shapes coexist in
 * one path — rendered with so cutters carve the concave notches.
 * Ported from circle-join-prototype/index.html build v3.
 */
function generateNodesGeometry(data, cols, rows, params) {
  const { cellWidth, cellHeight } = params;
  const { gapX, gapY } = resolveGaps(params);
  const nodeR = resolveNodeR(params);

  const stepX = cellWidth + gapX;
  const stepY = cellHeight + gapY;
  const p = (n) => Math.round(n * 100) / 100;

  const isOn = (c, r) =>
    c >= 0 && c < cols && r >= 0 && r < rows && data[r * cols + c] === 1;

  const cx = (c) => c * stepX + cellWidth / 2;
  const cy = (r) => r * stepY + cellHeight / 2;

  const parts = [];
  const rectPath = (x, y, w, h) =>
    `M ${p(x)} ${p(y)} H ${p(x + w)} V ${p(y + h)} H ${p(x)} Z`;
  const circlePath = (x, y) => ellipseSubpath(x, y, nodeR, nodeR);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isOn(c, r)) continue;
      parts.push(circlePath(cx(c), cy(r)));
      if (isOn(c + 1, r)) {
        parts.push(rectPath(cx(c), cy(r) - nodeR, cx(c + 1) - cx(c), 2 * nodeR));
      }
      if (isOn(c, r + 1)) {
        parts.push(rectPath(cx(c) - nodeR, cy(r), 2 * nodeR, cy(r + 1) - cy(r)));
      }
    }
  }

  // Vertex pass: corner fill-patches (count=3) and diagonal bridge rects (count=2).
  // Cutter circles are returned separately by generateInnerFilletPath (nodes branch)
  // and drawn in bgColor on top, same pipeline as inner fillets.
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const ul = isOn(c,     r)     ? 1 : 0;
      const ur = isOn(c + 1, r)     ? 1 : 0;
      const ll = isOn(c,     r + 1) ? 1 : 0;
      const lr = isOn(c + 1, r + 1) ? 1 : 0;
      const count = ul + ur + ll + lr;

      const xL = cx(c), xR = cx(c + 1);
      const yT = cy(r), yB = cy(r + 1);
      const vx = (xL + xR) / 2;
      const vy = (yT + yB) / 2;

      if (count === 3) {
        let px, py;
        if (!ul)      { px = vx - nodeR; py = vy - nodeR; }
        else if (!ur) { px = vx;         py = vy - nodeR; }
        else if (!ll) { px = vx - nodeR; py = vy;         }
        else          { px = vx;         py = vy;         }
        parts.push(rectPath(px, py, nodeR, nodeR));
      } else if (count === 2) {
        const nwse = ul && lr && !ur && !ll;
        const nesw = ur && ll && !ul && !lr;
        if (!nwse && !nesw) continue;
        parts.push(rectPath(vx - nodeR, vy - nodeR, 2 * nodeR, 2 * nodeR));
      }
    }
  }

  return parts.join(' ');
}

/**
 * Generate the combined SVG path data for a glyph (cells + orthogonal bridges).
 *
 * @param {Array<number>} data  Flat glyph array (row-major, 0 or 1)
 * @param {number} cols
 * @param {number} rows
 * @param {object} params  { cellWidth, cellHeight, gapX, gapY, cornerRadius, cornerMerge, cellShape }
 * @returns {string}       SVG path data (d attribute value)
 */
function generateGlyphPath(data, cols, rows, params) {
  if (params.cellShape === 'nodes' && !params._isolated) {
    return generateNodesGeometry(data, cols, rows, params);
  }
  const {
    cellWidth, cellHeight, cornerRadius,
    cornerMerge = true,
  } = params;
  // Isolated Nodes (unlit layer) = plain node circles, no bridges.
  const cellShape = params.cellShape === 'nodes' ? 'circle' : (params.cellShape || 'rect');
  const { gapX, gapY } = resolveGaps(params);

  const stepX = cellWidth + gapX;
  const stepY = cellHeight + gapY;
  const rad = Math.min(cornerRadius, cellWidth / 2, cellHeight / 2);
  const br  = Math.min(params.bridgeRadius || 0, gapX > 0 ? gapX / 2 : 0, cellHeight / 2);
  const bvr = Math.min(params.bridgeRadius || 0, gapY > 0 ? gapY / 2 : 0, cellWidth  / 2);
  const p = (n) => Math.round(n * 100) / 100;
  // Intra-cell gap = inter-cell gap on the same axis → continuous even rhythm.
  const barH = Math.max(1, Math.floor((cellHeight - gapY) / 2));  // for horizontal
  const barW = Math.max(1, Math.floor((cellWidth  - gapX) / 2));  // for vertical
  const subW = Math.max(1, Math.floor((cellWidth  - gapX) / 2));  // for pixel
  const subH = Math.max(1, Math.floor((cellHeight - gapY) / 2));  // for pixel

  const isCell = (c, r) =>
    c >= 0 && c < cols && r >= 0 && r < rows && data[r * cols + c] === 1;
  // _isolated: every cell drawn alone (unlit layer) — neighbours never count.
  const isOn = params._isolated ? () => false : isCell;
  // Shape weight (ring thickness, plus arm, stripe width) as a 0–1 fraction.
  const weight = Math.min(0.95, Math.max(0.05, (params.shapeWeight ?? 50) / 100));

  const parts = [];

  const rect = (rx, ry, rw, rh) =>
    `M ${p(rx)} ${p(ry)} H ${p(rx + rw)} V ${p(ry + rh)} H ${p(rx)} Z`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isCell(c, r)) continue;

      const nN  = isOn(c,     r - 1);
      const nS  = isOn(c,     r + 1);
      const nW  = isOn(c - 1, r);
      const nE  = isOn(c + 1, r);
      const nSE = isOn(c + 1, r + 1);
      const nNW = isOn(c - 1, r - 1);
      const nNE = isOn(c + 1, r - 1);
      const nSW = isOn(c - 1, r + 1);

      const x = c * stepX;
      const y = r * stepY;
      const cw = cellWidth;
      const ch = cellHeight;

      if (cellShape === 'circle') {
        parts.push(ellipseSubpath(x + cw / 2, y + ch / 2, cw / 2, ch / 2));

      } else if (cellShape === 'horizontal') {
        // Two horizontal bars per cell.
        // Bridge gapX (right neighbor) so bars run continuous across full row.
        // No gapY bridge — gapY is the separation between row groups.
        const y1 = y + ch - barH;
        parts.push(rect(x, y,  cw, barH));
        parts.push(rect(x, y1, cw, barH));
        if (nE && gapX > 0) {
          parts.push(rect(x + cw, y,  gapX, barH));
          parts.push(rect(x + cw, y1, gapX, barH));
        }

      } else if (cellShape === 'vertical') {
        // Two vertical bars per cell.
        // Bridge gapY (bottom neighbor) so bars run continuous down full column.
        // No gapX bridge — gapX is the separation between column groups.
        const x1 = x + cw - barW;
        parts.push(rect(x,  y, barW, ch));
        parts.push(rect(x1, y, barW, ch));
        if (nS && gapY > 0) {
          parts.push(rect(x,  y + ch, barW, gapY));
          parts.push(rect(x1, y + ch, barW, gapY));
        }

      } else if (cellShape === 'pixel') {
        // 2×2 sub-cells per cell. No bridges — gapX/gapY separates cells.
        const x1 = x + cw - subW;
        const y1 = y + ch - subH;
        parts.push(rect(x,  y,  subW, subH));
        parts.push(rect(x1, y,  subW, subH));
        parts.push(rect(x,  y1, subW, subH));
        parts.push(rect(x1, y1, subW, subH));

      } else if (cellShape === 'diamond') {
        // Square rotated 45°, inscribed in the cell. No bridges.
        parts.push(polygonSubpath([
          [x + cw / 2, y], [x + cw, y + ch / 2], [x + cw / 2, y + ch], [x, y + ch / 2],
        ]));

      } else if (cellShape === 'hexagon') {
        // Pointy-top hexagon inscribed in the cell. No bridges.
        parts.push(polygonSubpath([
          [x + cw / 2, y], [x + cw, y + ch / 4], [x + cw, y + ch * 3 / 4],
          [x + cw / 2, y + ch], [x, y + ch * 3 / 4], [x, y + ch / 4],
        ]));

      } else if (cellShape === 'ring') {
        // Outer ellipse clockwise + inner ellipse counter-clockwise = hollow (nonzero rule).
        const rx = cw / 2, ry = ch / 2;
        const t  = Math.min(rx, ry) * weight;
        const irx = Math.max(0, rx - t), iry = Math.max(0, ry - t);
        const cxm = x + rx, cym = y + ry;
        parts.push(ellipseSubpath(cxm, cym, rx, ry));
        if (irx > 0 && iry > 0) {
          parts.push(`M ${p(cxm - irx)} ${p(cym)} A ${p(irx)} ${p(iry)} 0 1 0 ${p(cxm + irx)} ${p(cym)} A ${p(irx)} ${p(iry)} 0 1 0 ${p(cxm - irx)} ${p(cym)} Z`);
        }

      } else if (cellShape === 'plus') {
        // Cross per cell; arms bridge the gap to ON neighbours.
        const a  = Math.max(1, Math.min(cw, ch) * weight);
        const ay = y + (ch - a) / 2;
        const ax = x + (cw - a) / 2;
        parts.push(rect(x, ay, cw, a));
        parts.push(rect(ax, y, a, ch));
        if (nE && gapX > 0) parts.push(rect(x + cw, ay, gapX, a));
        if (nS && gapY > 0) parts.push(rect(ax, y + ch, a, gapY));

      } else if (cellShape === 'diagonal') {
        // "/" stripes: bands of X+Y (cell-unit coords) centred on 0, 1, 2 so the
        // stripes continue across neighbouring cells when gaps are 0.
        const h = weight / 2;
        const sq = [[x, y], [x + cw, y], [x + cw, y + ch], [x, y + ch]];
        const u = (px, py) => (px - x) / cw + (py - y) / ch;
        for (const k of [0, 1, 2]) {
          let poly = clipHalfPlane(sq, (px, py) => u(px, py) - (k - h));
          poly = clipHalfPlane(poly, (px, py) => (k + h) - u(px, py));
          if (poly.length >= 3) parts.push(polygonSubpath(poly));
        }

      } else if (cellShape === 'halftone') {
        // Dot size grows with the number of ON neighbours (8-connected), full size at 4+.
        const n = [nN, nS, nW, nE, nNE, nNW, nSE, nSW].filter(Boolean).length;
        const s = 0.4 + 0.6 * (Math.min(n, 4) / 4);
        parts.push(ellipseSubpath(x + cw / 2, y + ch / 2, (cw / 2) * s, (ch / 2) * s));

      } else if (cellShape === 'tile') {
        // Isolated rounded squares — never bridged or merged.
        parts.push(roundedRectPath(x, y, cw, ch, rad, rad, rad, rad));

      } else if (cellShape === 'slope') {
        // Rect cells with 45° chamfered outer corners + filled diagonal bands
        // between diagonal-only neighbours (smooth "sloped" pixel edges).
        const cTL = (nN || nW) ? 0 : rad;
        const cTR = (nN || nE) ? 0 : rad;
        const cBR = (nS || nE) ? 0 : rad;
        const cBL = (nS || nW) ? 0 : rad;
        parts.push(polygonSubpath([
          [x + cTL, y], [x + cw - cTR, y], [x + cw, y + cTR], [x + cw, y + ch - cBR],
          [x + cw - cBR, y + ch], [x + cBL, y + ch], [x, y + ch - cBL], [x, y + cTL],
        ]));
        if (nE && gapX > 0) parts.push(rect(x + cw, y, gapX, ch));
        if (nS && gapY > 0) parts.push(rect(x, y + ch, cw, gapY));
        if (nE && nS && nSE && gapX > 0 && gapY > 0)
          parts.push(rect(x + cw, y + ch, gapX, gapY));
        // SE band: this cell's TR corner → SE cell's TR, SE cell's BL → this cell's BL
        if (nSE && !nE && !nS) {
          parts.push(polygonSubpath([
            [x + cw, y], [x + stepX + cw, y + stepY], [x + stepX, y + stepY + ch], [x, y + ch],
          ]));
        }
        // SW band (listed clockwise): TL → BR of this cell, then BR → TL of SW cell
        if (nSW && !nW && !nS) {
          parts.push(polygonSubpath([
            [x, y], [x + cw, y + ch], [x - stepX + cw, y + stepY + ch], [x - stepX, y + stepY],
          ]));
        }

      } else {
        // rect (solid) — original behavior with cornerMerge + bridgeRadius
        const rTL = (cornerMerge && (nN || nW)) ? 0 : rad;
        const rTR = (cornerMerge && (nN || nE)) ? 0 : rad;
        const rBR = (cornerMerge && (nS || nE)) ? 0 : rad;
        const rBL = (cornerMerge && (nS || nW)) ? 0 : rad;
        parts.push(roundedRectPath(x, y, cw, ch, rTL, rTR, rBR, rBL));

        // Gap bridges
        if (nE && gapX > 0)
          parts.push(br > 0
            ? roundedRectPath(x + cw, y, gapX, ch, br, br, br, br)
            : rect(x + cw, y, gapX, ch));
        if (nS && gapY > 0)
          parts.push(bvr > 0
            ? roundedRectPath(x, y + ch, cw, gapY, bvr, bvr, bvr, bvr)
            : rect(x, y + ch, cw, gapY));
        if (nE && nS && nSE && gapX > 0 && gapY > 0)
          parts.push(rect(x + cw, y + ch, gapX, gapY));
      }

      // (inner concave fillets handled separately — see generateInnerFilletPath)
    }
  }

  return parts.join(' ');
}

// Shapes without solid orthogonal joins — inner fillets would just punch holes.
const NO_FILLET_SHAPES = ['circle', 'diamond', 'hexagon', 'ring', 'plus', 'diagonal', 'halftone', 'tile'];

/**
 * Unlit-pixel layer: every OFF cell drawn alone in offColor (LED / dot-matrix look).
 * Returns a <path> line or '' when showOff is disabled.
 */
function generateOffLayer(data, cols, rows, params, ind) {
  if (!params.showOff) return '';
  const inverted = data.map(v => (v ? 0 : 1));
  const d = generateGlyphPath(inverted, cols, rows, { ...params, _isolated: true });
  return d ? `${ind}<path d="${d}" fill="${params.offColor || '#222222'}"/>` : '';
}

/**
 * Glow filter (CRT bloom). Returns { defs, attr } — both '' when glow is 0.
 * Ids are unique per call because many SVGs share one page (preview strip).
 */
let glowSeq = 0;
function glowFilter(params) {
  const g = params.glow || 0;
  if (g <= 0) return { defs: '', attr: '' };
  const id = `pfg-glow-${++glowSeq}`;
  return {
    defs: `<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">` +
          `<feGaussianBlur in="SourceGraphic" stdDeviation="${g}" result="b"/>` +
          `<feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>` +
          `</filter></defs>`,
    attr: ` filter="url(#${id})"`,
  };
}

/**
 * Generate concave inner fillet path data (drawn in bgColor OVER the glyph).
 *
 * At each L / T / + junction where two orthogonal neighbors are both ON but
 * the diagonal is OFF, we cut a quarter-circle notch INTO the corner.
 * Arc center sits `ir` inward from the corner; sweep=1 (CW) bows the arc
 * toward the corner point, creating a visually concave rounded notch.
 *
 * Returns empty string when innerRadius = 0 or cellShape = 'circle'.
 */
function generateInnerFilletPath(data, cols, rows, params) {
  const { cellWidth, cellHeight, cornerRadius, cornerMerge = true, cellShape = 'rect' } = params;
  const { gapX, gapY } = resolveGaps(params);
  const ir = params.innerRadius || 0;
  if (cellShape === 'nodes') {
    // Cutter circles drawn in bgColor on top of positive shapes — carve concave fillets.
    const { gapX: gx, gapY: gy } = resolveGaps(params);
    const lock2 = params.lockNodeRadius !== false;
    const maxR2 = Math.min(cellWidth, cellHeight) / 2;
    const nodeR2 = lock2 ? maxR2 : Math.max(0, Math.min(params.cornerRadius || 0, maxR2));
    const stepX2 = cellWidth + gx;
    const stepY2 = cellHeight + gy;
    const cx2 = (c) => c * stepX2 + cellWidth / 2;
    const cy2 = (r) => r * stepY2 + cellHeight / 2;
    const isOn2 = (c, r) =>
      c >= 0 && c < cols && r >= 0 && r < rows && data[r * cols + c] === 1;
    const cutters = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const ul = isOn2(c,     r)     ? 1 : 0;
        const ur = isOn2(c + 1, r)     ? 1 : 0;
        const ll = isOn2(c,     r + 1) ? 1 : 0;
        const lr = isOn2(c + 1, r + 1) ? 1 : 0;
        const count = ul + ur + ll + lr;
        const xL = cx2(c), xR = cx2(c + 1);
        const yT = cy2(r), yB = cy2(r + 1);
        if (count === 3) {
          let ecx, ecy;
          if (!ul)      { ecx = xL; ecy = yT; }
          else if (!ur) { ecx = xR; ecy = yT; }
          else if (!ll) { ecx = xL; ecy = yB; }
          else          { ecx = xR; ecy = yB; }
          cutters.push(ellipseSubpath(ecx, ecy, nodeR2, nodeR2));
        } else if (count === 2) {
          const nwse = ul && lr && !ur && !ll;
          const nesw = ur && ll && !ul && !lr;
          if (!nwse && !nesw) continue;
          if (nwse) {
            cutters.push(ellipseSubpath(xR, yT, nodeR2, nodeR2));
            cutters.push(ellipseSubpath(xL, yB, nodeR2, nodeR2));
          } else {
            cutters.push(ellipseSubpath(xL, yT, nodeR2, nodeR2));
            cutters.push(ellipseSubpath(xR, yB, nodeR2, nodeR2));
          }
        }
      }
    }
    return cutters.join(' ');
  }
  if (ir <= 0 || NO_FILLET_SHAPES.includes(cellShape)) return '';

  const stepX = cellWidth  + gapX;
  const stepY = cellHeight + gapY;
  const cw  = cellWidth;
  const ch  = cellHeight;
  const rad = Math.min(cornerRadius || 0, cw / 2, ch / 2);
  const p   = (n) => Math.round(n * 100) / 100;
  const isOn = (c, r) =>
    c >= 0 && c < cols && r >= 0 && r < rows && data[r * cols + c] === 1;

  const parts = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isOn(c, r)) continue;
      const nN  = isOn(c,     r - 1);
      const nS  = isOn(c,     r + 1);
      const nW  = isOn(c - 1, r);
      const nE  = isOn(c + 1, r);
      const nNW = isOn(c - 1, r - 1);
      const nNE = isOn(c + 1, r - 1);
      const nSW = isOn(c - 1, r + 1);
      const nSE = isOn(c + 1, r + 1);
      const x = c * stepX;
      const y = r * stepY;

      // When cornerMerge=false, the cell's own rounding (rad) already carves away the
      // corner. The fillet must extend PAST that rounding to bite into filled area.
      // effectiveIR = cellCornerRadius + ir  (clamped to half-cell).
      // When cornerMerge=true, the corner radius at a join = 0, so effectiveIR = ir.

      // TL fillet: nN + nW ON, nNW OFF
      // sweep=1 (CW on screen): arc from (x, y+eir) goes CW through NW quadrant to
      // (x+eir, y) — bows TOWARD corner point (x,y) = concave cut into white material.
      if (nN && nW && !nNW) {
        const cellRad = cornerMerge ? 0 : rad;
        const eir = Math.min(cellRad + ir, cw / 2, ch / 2);
        parts.push(`M ${p(x)} ${p(y + eir)} A ${eir} ${eir} 0 0 1 ${p(x + eir)} ${p(y)} L ${p(x)} ${p(y)} Z`);
      }

      // TR fillet: nN + nE ON, nNE OFF
      if (nN && nE && !nNE) {
        const cellRad = cornerMerge ? 0 : rad;
        const eir = Math.min(cellRad + ir, cw / 2, ch / 2);
        parts.push(`M ${p(x + cw - eir)} ${p(y)} A ${eir} ${eir} 0 0 1 ${p(x + cw)} ${p(y + eir)} L ${p(x + cw)} ${p(y)} Z`);
      }

      // BR fillet: nS + nE ON, nSE OFF
      if (nS && nE && !nSE) {
        const cellRad = cornerMerge ? 0 : rad;
        const eir = Math.min(cellRad + ir, cw / 2, ch / 2);
        parts.push(`M ${p(x + cw)} ${p(y + ch - eir)} A ${eir} ${eir} 0 0 1 ${p(x + cw - eir)} ${p(y + ch)} L ${p(x + cw)} ${p(y + ch)} Z`);
      }

      // BL fillet: nS + nW ON, nSW OFF
      if (nS && nW && !nSW) {
        const cellRad = cornerMerge ? 0 : rad;
        const eir = Math.min(cellRad + ir, cw / 2, ch / 2);
        parts.push(`M ${p(x + eir)} ${p(y + ch)} A ${eir} ${eir} 0 0 1 ${p(x)} ${p(y + ch - eir)} L ${p(x)} ${p(y + ch)} Z`);
      }
    }
  }

  return parts.join(' ');
}

/**
 * Generate SVG <line> elements for diagonal cell connections.
 */
function generateDiagLines(data, cols, rows, params) {
  const { cellWidth, cellHeight, diagFill, diagWidth = 8, fgColor = '#ffffff' } = params;
  const { gapX, gapY } = resolveGaps(params);
  if (!diagFill || diagWidth <= 0 || params.cellShape === 'nodes') return '';

  const stepX = cellWidth + gapX;
  const stepY = cellHeight + gapY;

  const isOn = (c, r) =>
    c >= 0 && c < cols && r >= 0 && r < rows && data[r * cols + c] === 1;

  const cx = (c) => c * stepX + cellWidth / 2;
  const cy = (r) => r * stepY + cellHeight / 2;
  const p  = (n) => Math.round(n * 100) / 100;

  const lines = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isOn(c, r)) continue;

      // SE diagonal — drawn from the upper-left cell only
      if (isOn(c + 1, r + 1) && !isOn(c + 1, r) && !isOn(c, r + 1)) {
        lines.push(
          `<line x1="${p(cx(c))}" y1="${p(cy(r))}" x2="${p(cx(c + 1))}" y2="${p(cy(r + 1))}"/>`
        );
      }

      // SW diagonal
      if (isOn(c - 1, r + 1) && !isOn(c - 1, r) && !isOn(c, r + 1)) {
        lines.push(
          `<line x1="${p(cx(c))}" y1="${p(cy(r))}" x2="${p(cx(c - 1))}" y2="${p(cy(r + 1))}"/>`
        );
      }
    }
  }

  if (lines.length === 0) return '';
  return `<g stroke="${fgColor}" stroke-width="${diagWidth}" stroke-linecap="round" fill="none">
    ${lines.join('\n    ')}
  </g>`;
}

/**
 * Return the pixel dimensions of a rendered glyph (including skew extra width).
 */
function glyphDimensions(cols, rows, params) {
  const { cellWidth, cellHeight, padding = 0 } = params;
  const { gapX, gapY } = resolveGaps(params);
  const contentH = rows * (cellHeight + gapY) - gapY;
  const extra = skewExtraWidth(params.skewX || 0, contentH);
  const w = cols * (cellWidth + gapX) - gapX + extra + padding * 2;
  const h = contentH + padding * 2;
  return { w, h };
}

/**
 * Generate a complete SVG string for a single glyph.
 *
 * Supports skewX (italic slant).
 */
function generateGlyphSVG(data, cols, rows, params) {
  const { fgColor = '#ffffff', bgColor = '#000000', padding = 0 } = params;
  const { gapX, gapY } = resolveGaps(params);
  const { w, h } = glyphDimensions(cols, rows, params);

  const skewX    = params.skewX || 0;
  const contentH = rows * (params.cellHeight + gapY) - gapY;
  const extraW   = skewExtraWidth(skewX, contentH);
  // For negative skewX (italic lean), the bottom-left goes outside the left edge.
  // Shift content right by extraW to compensate.
  const skewShift = skewX < 0 ? extraW : 0;

  const pathData    = generateGlyphPath(data, cols, rows, params);
  const filletData  = generateInnerFilletPath(data, cols, rows, params);
  const diagSVG     = generateDiagLines(data, cols, rows, params);

  const outline      = !!params.outline;
  const outlineW     = Math.max(1, params.outlineWidth != null ? params.outlineWidth : 3);
  const outlineColor = params.outlineColor || fgColor;
  const isNodes      = params.cellShape === 'nodes';
  // Nodes use halo-path outline (stroke traces internal subpath edges and looks wrong).
  const strokeAttrs  = (outline && !isNodes) ? ` stroke="${outlineColor}" stroke-width="${outlineW * 2}" stroke-linejoin="miter" paint-order="stroke fill"` : '';

  const lines = [];

  if (bgColor !== 'transparent')
    lines.push(`  <rect width="${w}" height="${h}" fill="${bgColor}"/>`);

  // Build content group transform (padding translate + optional skew)
  const tx = padding + skewShift;
  const ty = padding;
  const transforms = [];
  if (tx !== 0 || ty !== 0) transforms.push(`translate(${tx},${ty})`);
  if (skewX !== 0)           transforms.push(`skewX(${skewX})`);

  const transformAttr = transforms.length ? ` transform="${transforms.join(' ')}"` : '';
  const useGroup      = !!transformAttr;
  const ind           = useGroup ? '    ' : '  ';

  const glow = glowFilter(params);
  if (glow.defs) lines.push(`  ${glow.defs}`);
  if (useGroup) lines.push(`  <g${transformAttr}>`);
  const offLayer = generateOffLayer(data, cols, rows, params, ind);
  if (offLayer) lines.push(offLayer);
  if (glow.attr) lines.push(`${ind}<g${glow.attr}>`);
  if (isNodes && outline) lines.push(`${ind}<path d="${generateNodesHalo(data, cols, rows, params)}" fill="${outlineColor}"/>`);
  lines.push(`${ind}<path d="${pathData}" fill="${fgColor}"${strokeAttrs}/>`);
  if (filletData) lines.push(`${ind}<path d="${filletData}" fill="${bgColor === 'transparent' ? 'none' : bgColor}"/>`);
  if (diagSVG) lines.push(ind + diagSVG.trim());
  if (glow.attr) lines.push(`${ind}</g>`);
  if (useGroup) lines.push(`  </g>`);

  const body = lines.join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>`;
}

/**
 * Scale params proportionally to a target cell height.
 * Used for the preview strip (renders at smaller size).
 * Note: skewX is an angle and does NOT scale.
 */
function scaleParams(params, targetCellHeight) {
  const scale = targetCellHeight / params.cellHeight;
  const { gapX, gapY } = resolveGaps(params);
  return {
    ...params,
    cellWidth:    Math.max(1, Math.round(params.cellWidth * scale)),
    cellHeight:   targetCellHeight,
    gapX:         Math.max(0, Math.round(gapX * scale)),
    gapY:         Math.max(0, Math.round(gapY * scale)),
    cornerRadius: Math.max(0, Math.round(params.cornerRadius * scale)),
    innerRadius:  Math.max(0, Math.round((params.innerRadius  || 0) * scale)),
    bridgeRadius: Math.max(0, Math.round((params.bridgeRadius || 0) * scale)),
    diagWidth:    Math.max(1, Math.round((params.diagWidth || 8) * scale)),
    padding:      Math.max(0, Math.round((params.padding || 0) * scale)),
    outlineWidth: Math.max(1, Math.round((params.outlineWidth != null ? params.outlineWidth : 3) * scale)),
    glow:         (params.glow || 0) * scale,
    // skewX is an angle — does not scale
    // cellFill is a string enum — does not scale
  };
}

/**
 * Generate a single SVG with all characters in `text` laid out horizontally.
 * Spaces are rendered as blank glyph-width gaps.
 * Supports skewX and ink-bleed filter.
 */
function generateTextSVG(glyphs, text, params) {
  const {
    cols, rows, cellWidth, cellHeight,
    charSpacing = 8, fgColor = '#ffffff', bgColor = '#000000', padding = 8,
  } = params;
  const { gapX, gapY } = resolveGaps(params);

  const chars = [...text];
  if (!chars.length) return null;

  const glyphW = cols * (cellWidth + gapX) - gapX;
  const glyphH = rows * (cellHeight + gapY) - gapY;
  const advance = glyphW + charSpacing;

  const skewX  = params.skewX || 0;
  const extraW = skewExtraWidth(skewX, glyphH);
  // For negative skewX: each glyph's bottom-left goes left by extraW, so
  // we shift the whole run right by extraW to keep it within bounds.
  const textShift = skewX < 0 ? extraW : 0;

  const totalW = chars.length * advance - charSpacing + padding * 2 + extraW;
  const totalH = glyphH + padding * 2;

  const lines = [];

  if (bgColor !== 'transparent')
    lines.push(`  <rect width="${totalW}" height="${totalH}" fill="${bgColor}"/>`);

  const glow = glowFilter(params);
  if (glow.defs) lines.push(`  ${glow.defs}`);

  chars.forEach((ch, i) => {
    // Spaces show an all-unlit matrix when showOff is on (LED board look).
    const data = ch === ' '
      ? (params.showOff ? new Array(cols * rows).fill(0) : null)
      : glyphs[ch];
    if (!data) return;

    const x = padding + textShift + i * advance;
    const transforms = [`translate(${x},${padding})`];
    if (skewX !== 0) transforms.push(`skewX(${skewX})`);

    const pathData   = generateGlyphPath(data, cols, rows, params);
    const filletData = generateInnerFilletPath(data, cols, rows, params);
    const diagSVG    = generateDiagLines(data, cols, rows, params);

    const outline      = !!params.outline;
    const outlineW     = Math.max(1, params.outlineWidth != null ? params.outlineWidth : 3);
    const outlineColor = params.outlineColor || fgColor;
    const isNodes      = params.cellShape === 'nodes';
    const strokeAttrs  = (outline && !isNodes) ? ` stroke="${outlineColor}" stroke-width="${outlineW * 2}" stroke-linejoin="miter" paint-order="stroke fill"` : '';

    lines.push(`  <g transform="${transforms.join(' ')}">`);
    const offLayer = generateOffLayer(data, cols, rows, params, '    ');
    if (offLayer) lines.push(offLayer);
    if (glow.attr) lines.push(`    <g${glow.attr}>`);
    if (isNodes && outline) lines.push(`    <path d="${generateNodesHalo(data, cols, rows, params)}" fill="${outlineColor}"/>`);
    lines.push(`    <path d="${pathData}" fill="${fgColor}"${strokeAttrs}/>`);
    if (filletData) lines.push(`    <path d="${filletData}" fill="${bgColor === 'transparent' ? 'none' : bgColor}"/>`);
    if (diagSVG) lines.push('    ' + diagSVG.trim());
    if (glow.attr) lines.push(`    </g>`);
    lines.push(`  </g>`);
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`,
    ...lines,
    `</svg>`,
  ].join('\n');
}

/**
 * Trigger a file download of the given SVG string.
 */
function downloadSVG(filename, svgString) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Rasterize an SVG string to PNG and trigger download.
 * scale: output pixel multiplier (e.g. 4 = 4× the SVG's natural pixel size).
 */
function downloadPNG(filename, svgString, scale = 4) {
  const img = new Image();
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(img.naturalWidth  * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(pngBlob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(pngBlob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, 'image/png');
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

/**
 * Generate a single SVG sprite sheet with all glyphs laid out in a grid.
 * Each glyph is wrapped in a <g id="glyph-NNN"> (code point) for easy referencing.
 */
function generateSpriteSheetSVG(glyphs, allChars, params, perRow = 16) {
  const { cols, rows } = params;
  const { w: gw, h: gh } = glyphDimensions(cols, rows, params);
  const margin = Math.max(8, Math.round(gw * 0.15));
  const stepX  = gw + margin;
  const stepY  = gh + margin;
  const totalCols = Math.min(perRow, allChars.length);
  const totalRows = Math.ceil(allChars.length / perRow);
  const svgW = totalCols * stepX - margin;
  const svgH = totalRows * stepY - margin;

  const { fgColor = '#ffffff', bgColor = '#000000' } = params;
  const lines = [];

  if (bgColor !== 'transparent')
    lines.push(`  <rect width="${svgW}" height="${svgH}" fill="${bgColor}"/>`);

  const glow = glowFilter(params);
  if (glow.defs) lines.push(`  ${glow.defs}`);

  allChars.forEach((ch, i) => {
    const data = glyphs[ch];
    if (!data) return;
    const pathData   = generateGlyphPath(data, cols, rows, params);
    const filletData = generateInnerFilletPath(data, cols, rows, params);
    const diagSVG    = generateDiagLines(data, cols, rows, params);

    const outline      = !!params.outline;
    const outlineW     = Math.max(1, params.outlineWidth != null ? params.outlineWidth : 3);
    const outlineColor = params.outlineColor || fgColor;
    const isNodes      = params.cellShape === 'nodes';
    const strokeAttrs  = (outline && !isNodes) ? ` stroke="${outlineColor}" stroke-width="${outlineW * 2}" stroke-linejoin="miter" paint-order="stroke fill"` : '';

    const gx = (i % perRow) * stepX;
    const gy = Math.floor(i / perRow) * stepY;
    const skewX = params.skewX || 0;
    const contentH = rows * (params.cellHeight + (params.gapY ?? params.gap ?? 0)) - (params.gapY ?? params.gap ?? 0);
    const extraW   = skewExtraWidth(skewX, contentH);
    const skewShift = skewX < 0 ? extraW : 0;
    const transforms = [`translate(${gx + skewShift},${gy})`];
    if (skewX !== 0) transforms.push(`skewX(${skewX})`);
    lines.push(`  <g id="glyph-${ch.codePointAt(0)}" transform="${transforms.join(' ')}">`);
    const offLayer = generateOffLayer(data, cols, rows, params, '    ');
    if (offLayer) lines.push(offLayer);
    if (glow.attr) lines.push(`    <g${glow.attr}>`);
    if (isNodes && outline) lines.push(`    <path d="${generateNodesHalo(data, cols, rows, params)}" fill="${outlineColor}"/>`);
    lines.push(`    <path d="${pathData}" fill="${fgColor}"${strokeAttrs}/>`);
    if (filletData) lines.push(`    <path d="${filletData}" fill="${bgColor === 'transparent' ? 'none' : bgColor}"/>`);
    if (diagSVG) lines.push('    ' + diagSVG.trim());
    if (glow.attr) lines.push(`    </g>`);
    lines.push(`  </g>`);
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
    ...lines,
    `</svg>`,
  ].join('\n');
}
