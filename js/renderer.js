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
 * Generate the combined SVG path data for a glyph (cells + orthogonal bridges).
 *
 * @param {Array<number>} data  Flat glyph array (row-major, 0 or 1)
 * @param {number} cols
 * @param {number} rows
 * @param {object} params  { cellWidth, cellHeight, gapX, gapY, cornerRadius, cornerMerge, cellShape }
 * @returns {string}       SVG path data (d attribute value)
 */
function generateGlyphPath(data, cols, rows, params) {
  const {
    cellWidth, cellHeight, cornerRadius,
    cornerMerge = true,
    cellShape = 'rect',
  } = params;
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

  const isOn = (c, r) =>
    c >= 0 && c < cols && r >= 0 && r < rows && data[r * cols + c] === 1;

  const parts = [];

  const rect = (rx, ry, rw, rh) =>
    `M ${p(rx)} ${p(ry)} H ${p(rx + rw)} V ${p(ry + rh)} H ${p(rx)} Z`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isOn(c, r)) continue;

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
  if (ir <= 0 || cellShape === 'circle') return '';

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
  if (!diagFill || diagWidth <= 0) return '';

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
  // Doubled stroke-width + paint-order="stroke fill" → only outer half of stroke shows.
  const strokeAttrs  = outline ? ` stroke="${outlineColor}" stroke-width="${outlineW * 2}" stroke-linejoin="miter" paint-order="stroke fill"` : '';

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

  if (useGroup) lines.push(`  <g${transformAttr}>`);
  lines.push(`${ind}<path d="${pathData}" fill="${fgColor}"${strokeAttrs}/>`);
  if (filletData) lines.push(`${ind}<path d="${filletData}" fill="${bgColor === 'transparent' ? 'none' : bgColor}"/>`);
  if (diagSVG) lines.push(ind + diagSVG.trim());
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

  chars.forEach((ch, i) => {
    const data = ch === ' ' ? null : glyphs[ch];
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
    const strokeAttrs  = outline ? ` stroke="${outlineColor}" stroke-width="${outlineW * 2}" stroke-linejoin="miter" paint-order="stroke fill"` : '';

    lines.push(`  <g transform="${transforms.join(' ')}">`);
    lines.push(`    <path d="${pathData}" fill="${fgColor}"${strokeAttrs}/>`);
    if (filletData) lines.push(`    <path d="${filletData}" fill="${bgColor === 'transparent' ? 'none' : bgColor}"/>`);
    if (diagSVG) lines.push('    ' + diagSVG.trim());
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

  allChars.forEach((ch, i) => {
    const data = glyphs[ch];
    if (!data) return;
    const pathData   = generateGlyphPath(data, cols, rows, params);
    const filletData = generateInnerFilletPath(data, cols, rows, params);
    const diagSVG    = generateDiagLines(data, cols, rows, params);

    const outline      = !!params.outline;
    const outlineW     = Math.max(1, params.outlineWidth != null ? params.outlineWidth : 3);
    const outlineColor = params.outlineColor || fgColor;
    const strokeAttrs  = outline ? ` stroke="${outlineColor}" stroke-width="${outlineW * 2}" stroke-linejoin="miter" paint-order="stroke fill"` : '';

    const gx = (i % perRow) * stepX;
    const gy = Math.floor(i / perRow) * stepY;
    const skewX = params.skewX || 0;
    const contentH = rows * (params.cellHeight + (params.gapY ?? params.gap ?? 0)) - (params.gapY ?? params.gap ?? 0);
    const extraW   = skewExtraWidth(skewX, contentH);
    const skewShift = skewX < 0 ? extraW : 0;
    const transforms = [`translate(${gx + skewShift},${gy})`];
    if (skewX !== 0) transforms.push(`skewX(${skewX})`);
    lines.push(`  <g id="glyph-${ch.codePointAt(0)}" transform="${transforms.join(' ')}">`);
    lines.push(`    <path d="${pathData}" fill="${fgColor}"${strokeAttrs}/>`);
    if (filletData) lines.push(`    <path d="${filletData}" fill="${bgColor === 'transparent' ? 'none' : bgColor}"/>`);
    if (diagSVG) lines.push('    ' + diagSVG.trim());
    lines.push(`  </g>`);
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
    ...lines,
    `</svg>`,
  ].join('\n');
}
