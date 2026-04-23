// app.js — state management, UI, and event handling

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  Undo / Redo
// ─────────────────────────────────────────────

const MAX_UNDO = 60;
const undoStack = [];
const redoStack = [];

function glyphSnapshot() {
  return Object.fromEntries(
    Object.entries(state.glyphs).map(([k, v]) => [k, [...v]])
  );
}

function saveUndo() {
  undoStack.push(glyphSnapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  updateUndoUI();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(glyphSnapshot());
  const snap = undoStack.pop();
  for (const [k, v] of Object.entries(snap)) state.glyphs[k] = v;
  buildGridEditor();
  render();
  updateUndoUI();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(glyphSnapshot());
  const snap = redoStack.pop();
  for (const [k, v] of Object.entries(snap)) state.glyphs[k] = v;
  buildGridEditor();
  render();
  updateUndoUI();
}

function updateUndoUI() {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) btnUndo.disabled = undoStack.length === 0;
  if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

const state = {
  currentChar: 'A',
  params: {
    cellWidth:    40,
    cellHeight:   40,
    gapX:          3,
    gapY:          3,
    cornerRadius: 12,
    cols:          5,
    rows:          7,
    fgColor:  '#ffffff',
    bgColor:  '#000000',
    padding:       4,
    diagFill:    false,
    diagWidth:   12,
    charSpacing:   8,
    cornerMerge:  true,
    cellShape:    'rect',
    outline:       false,
    outlineWidth:  3,
    outlineColor: '#ffffff',
    skewX:          0,
    innerRadius:    0,
    bridgeRadius:   0,
    lockNodeRadius: true,
  },
  glyphs: {},
};

// ─────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────

function init() {
  for (const char of Object.keys(FONT_DATA)) {
    state.glyphs[char] = [...FONT_DATA[char]];
  }
  buildCharList();
  buildParamControls();
  updateConditionalParams();
  buildStylesUI();
  buildGridEditor();
  buildTypeTester();
  render();
  selectChar('A');
}

// ─────────────────────────────────────────────
//  Character groups
// ─────────────────────────────────────────────

const CHAR_GROUPS = [
  { label: 'A–Z',  chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') },
  { label: 'a–z',  chars: 'abcdefghijklmnopqrstuvwxyz'.split('') },
  { label: '0–9',  chars: '0123456789'.split('') },
  { label: 'ÅÄÖ',  chars: ['Å', 'Ä', 'Ö'] },
  { label: '.,!?', chars: ['.', ',', '!', '?', ':', '-', "'", '(', ')'] },
  { label: 'Sym',  chars: ['@','#','$','%','&','*','+','=','/','\\','<','>','[',']','{','}','"','~','^','_','|'] },
];

// ─────────────────────────────────────────────
//  Character list
// ─────────────────────────────────────────────

function buildCharList() {
  const list = document.getElementById('char-list');
  list.innerHTML = '';
  for (const group of CHAR_GROUPS) {
    const lbl = document.createElement('div');
    lbl.className = 'char-group-label';
    lbl.textContent = group.label;
    list.appendChild(lbl);
    for (const char of group.chars) {
      const btn = document.createElement('button');
      btn.className = 'char-btn';
      btn.textContent = char;
      btn.dataset.char = char;
      btn.addEventListener('click', () => selectChar(char));
      list.appendChild(btn);
    }
  }
}

function selectChar(char) {
  state.currentChar = char;
  document.querySelectorAll('.char-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.char === char);
  });
  buildGridEditor();
  renderEditorPreview();
}

// ─────────────────────────────────────────────
//  Editor tool state
// ─────────────────────────────────────────────

let isDragging    = false;
let drawValue     = 1;
let symmetryMode  = false;
let brushSize     = 1;
let showGuides    = true;
let focusedCell   = { r: 0, c: 0 };
let clipboard     = null;
let clipboardCols = 0;
let clipboardRows = 0;

// Guide row indices for 7-row grid (scale proportionally for other sizes)
function getGuideRows(rows) {
  // ascender=0, xHeight=1, baseline=rows-2, descender=rows-1
  return {
    ascender:  0,
    xHeight:   Math.round(rows * 1 / 7),
    baseline:  rows - 2,
    descender: rows - 1,
  };
}

// ─────────────────────────────────────────────
//  Grid editor
// ─────────────────────────────────────────────

function buildGridEditor() {
  const { cols, rows } = state.params;
  const editor = document.getElementById('grid-editor');
  editor.innerHTML = '';
  editor.style.gridTemplateColumns = `repeat(${cols}, 32px)`;
  editor.setAttribute('tabindex', '0');

  const data = state.glyphs[state.currentChar] || [];
  const guides = getGuideRows(rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      if (data[r * cols + c]) cell.classList.add('on');

      // Guide line markers (top border of first cell in row)
      if (showGuides && c === 0) {
        if (r === guides.ascender)  cell.dataset.guide = 'ascender';
        else if (r === guides.xHeight)  cell.dataset.guide = 'xheight';
        else if (r === guides.baseline) cell.dataset.guide = 'baseline';
      }

      if (r === focusedCell.r && c === focusedCell.c) cell.classList.add('focused');
      editor.appendChild(cell);
    }
  }
}

function setCellFocus(r, c) {
  const { cols, rows } = state.params;
  r = Math.max(0, Math.min(rows - 1, r));
  c = Math.max(0, Math.min(cols - 1, c));
  const prev = document.querySelector('#grid-editor .grid-cell.focused');
  if (prev) prev.classList.remove('focused');
  focusedCell = { r, c };
  const next = document.querySelector(`#grid-editor .grid-cell[data-r="${r}"][data-c="${c}"]`);
  if (next) next.classList.add('focused');
}

function toggleCellAt(r, c, value) {
  const { cols, rows } = state.params;
  const data = state.glyphs[state.currentChar];
  if (!data) return;

  const half = Math.floor(brushSize / 2);
  for (let dr = 0; dr < brushSize; dr++) {
    for (let dc = 0; dc < brushSize; dc++) {
      const br = r + dr - half;
      const bc = c + dc - half;
      if (br < 0 || br >= rows || bc < 0 || bc >= cols) continue;
      data[br * cols + bc] = value;
      const el = document.querySelector(`#grid-editor .grid-cell[data-r="${br}"][data-c="${bc}"]`);
      if (el) el.classList.toggle('on', !!value);

      if (symmetryMode) {
        const mc = cols - 1 - bc;
        if (mc !== bc) {
          data[br * cols + mc] = value;
          const mel = document.querySelector(`#grid-editor .grid-cell[data-r="${br}"][data-c="${mc}"]`);
          if (mel) mel.classList.toggle('on', !!value);
        }
      }
    }
  }
  renderEditorPreview();
  renderPreviewStrip(state.currentChar);
}

// Legacy alias used in a few places
function toggleCell(r, c, value) { toggleCellAt(r, c, value); }

function initEditorEvents() {
  const editor = document.getElementById('grid-editor');

  editor.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;
    e.preventDefault();
    editor.focus();
    saveUndo();
    isDragging = true;
    const r = parseInt(cell.dataset.r);
    const c = parseInt(cell.dataset.c);
    const current = state.glyphs[state.currentChar][r * state.params.cols + c];
    drawValue = current ? 0 : 1;
    setCellFocus(r, c);
    toggleCellAt(r, c, drawValue);
  });

  editor.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest('#grid-editor .grid-cell');
    if (!cell) return;
    toggleCellAt(parseInt(cell.dataset.r), parseInt(cell.dataset.c), drawValue);
  });

  document.addEventListener('mouseup', () => { isDragging = false; });

  // Touch support
  editor.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = el?.closest('.grid-cell');
    if (!cell) return;
    e.preventDefault();
    saveUndo();
    isDragging = true;
    const r = parseInt(cell.dataset.r);
    const c = parseInt(cell.dataset.c);
    const current = state.glyphs[state.currentChar][r * state.params.cols + c];
    drawValue = current ? 0 : 1;
    toggleCellAt(r, c, drawValue);
  }, { passive: false });

  editor.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = el?.closest('#grid-editor .grid-cell');
    if (!cell) return;
    toggleCellAt(parseInt(cell.dataset.r), parseInt(cell.dataset.c), drawValue);
  }, { passive: false });

  editor.addEventListener('touchend', () => { isDragging = false; });

  // Keyboard navigation
  editor.addEventListener('keydown', (e) => {
    const { r, c } = focusedCell;
    const { cols } = state.params;
    switch (e.key) {
      case 'ArrowUp':    e.preventDefault(); setCellFocus(r - 1, c); break;
      case 'ArrowDown':  e.preventDefault(); setCellFocus(r + 1, c); break;
      case 'ArrowLeft':  e.preventDefault(); setCellFocus(r, c - 1); break;
      case 'ArrowRight': e.preventDefault(); setCellFocus(r, c + 1); break;
      case 'Home':       e.preventDefault(); setCellFocus(r, 0); break;
      case 'End':        e.preventDefault(); setCellFocus(r, cols - 1); break;
      case ' ':
      case 'Enter': {
        e.preventDefault();
        const data = state.glyphs[state.currentChar];
        if (!data) break;
        saveUndo();
        const cur = data[r * cols + c];
        toggleCellAt(r, c, cur ? 0 : 1);
        break;
      }
    }
  });
}

// ─────────────────────────────────────────────
//  Transform tools
// ─────────────────────────────────────────────

function applyTransform(fn) {
  saveUndo();
  const { cols, rows } = state.params;
  state.glyphs[state.currentChar] = fn(state.glyphs[state.currentChar], cols, rows);
  buildGridEditor();
  renderEditorPreview();
  renderPreviewStrip(state.currentChar);
}

function flipH(data, cols, rows) {
  const out = new Array(cols * rows).fill(0);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out[r * cols + c] = data[r * cols + (cols - 1 - c)];
  return out;
}

function flipV(data, cols, rows) {
  const out = new Array(cols * rows).fill(0);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out[r * cols + c] = data[(rows - 1 - r) * cols + c];
  return out;
}

function shiftLeft(data, cols, rows) {
  const out = new Array(cols * rows).fill(0);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols - 1; c++)
      out[r * cols + c] = data[r * cols + c + 1];
  return out;
}

function shiftRight(data, cols, rows) {
  const out = new Array(cols * rows).fill(0);
  for (let r = 0; r < rows; r++)
    for (let c = 1; c < cols; c++)
      out[r * cols + c] = data[r * cols + c - 1];
  return out;
}

function shiftUp(data, cols, rows) {
  const out = new Array(cols * rows).fill(0);
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols; c++)
      out[r * cols + c] = data[(r + 1) * cols + c];
  return out;
}

function shiftDown(data, cols, rows) {
  const out = new Array(cols * rows).fill(0);
  for (let r = 1; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out[r * cols + c] = data[(r - 1) * cols + c];
  return out;
}

function rotate90(data, cols, rows) {
  // Rotate clockwise: new[c][rows-1-r] = old[r][c]
  // Output grid: newCols=rows, newRows=cols
  const out = new Array(cols * rows).fill(0);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out[c * rows + (rows - 1 - r)] = data[r * cols + c];
  // After rotation cols/rows swap — but we keep the same grid size
  // so we remap back into the original cols×rows space
  return out;
}

// ─────────────────────────────────────────────
//  Copy / paste
// ─────────────────────────────────────────────

function copyCurrentChar() {
  const { cols, rows } = state.params;
  clipboard = [...state.glyphs[state.currentChar]];
  clipboardCols = cols;
  clipboardRows = rows;
  const btn = document.getElementById('btn-paste');
  if (btn) btn.disabled = false;
}

function pasteCurrentChar() {
  if (!clipboard) return;
  saveUndo();
  const { cols, rows } = state.params;
  state.glyphs[state.currentChar] = (clipboardCols === cols && clipboardRows === rows)
    ? [...clipboard]
    : scaleGlyph(clipboard, clipboardCols, clipboardRows, cols, rows);
  buildGridEditor();
  renderEditorPreview();
  renderPreviewStrip(state.currentChar);
}

// ─────────────────────────────────────────────
//  Editor toolbar (transform + tools)
// ─────────────────────────────────────────────

function buildEditorToolbar() {
  const existing = document.getElementById('editor-toolbar');
  if (existing) existing.remove();

  const tb = document.createElement('div');
  tb.id = 'editor-toolbar';
  tb.className = 'editor-toolbar';

  const mkBtn = (label, title, onClick) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    b.className = 'tool-btn';
    b.addEventListener('click', onClick);
    return b;
  };

  const mkSep = () => {
    const s = document.createElement('span');
    s.className = 'toolbar-sep';
    return s;
  };

  // Transform buttons
  tb.appendChild(mkBtn('↔', 'Flip Horizontal', () => applyTransform(flipH)));
  tb.appendChild(mkBtn('↕', 'Flip Vertical',   () => applyTransform(flipV)));
  tb.appendChild(mkSep());
  tb.appendChild(mkBtn('←', 'Shift Left',  () => applyTransform(shiftLeft)));
  tb.appendChild(mkBtn('→', 'Shift Right', () => applyTransform(shiftRight)));
  tb.appendChild(mkBtn('↑', 'Shift Up',    () => applyTransform(shiftUp)));
  tb.appendChild(mkBtn('↓', 'Shift Down',  () => applyTransform(shiftDown)));
  tb.appendChild(mkSep());
  tb.appendChild(mkBtn('↻', 'Rotate 90° CW', () => applyTransform(rotate90)));
  tb.appendChild(mkSep());

  // Copy / Paste
  tb.appendChild(mkBtn('⎘', 'Copy Glyph', copyCurrentChar));
  const pasteBtn = mkBtn('⏎', 'Paste Glyph', pasteCurrentChar);
  pasteBtn.id = 'btn-paste';
  pasteBtn.disabled = !clipboard;
  tb.appendChild(pasteBtn);
  tb.appendChild(mkSep());

  // Symmetry toggle
  const symBtn = document.createElement('button');
  symBtn.id = 'btn-symmetry';
  symBtn.textContent = '⇔';
  symBtn.title = 'Symmetry mode (mirror horizontally while drawing)';
  symBtn.className = 'tool-btn' + (symmetryMode ? ' active' : '');
  symBtn.addEventListener('click', () => {
    symmetryMode = !symmetryMode;
    symBtn.classList.toggle('active', symmetryMode);
  });
  tb.appendChild(symBtn);
  tb.appendChild(mkSep());

  // Brush size
  const brushLabel = document.createElement('span');
  brushLabel.className = 'toolbar-label';
  brushLabel.textContent = 'Brush:';
  tb.appendChild(brushLabel);
  for (const size of [1, 2, 3]) {
    const b = document.createElement('button');
    b.textContent = `${size}×`;
    b.title = `${size}×${size} brush`;
    b.className = 'tool-btn' + (brushSize === size ? ' active' : '');
    b.dataset.brush = size;
    b.addEventListener('click', () => {
      brushSize = size;
      tb.querySelectorAll('[data-brush]').forEach(btn =>
        btn.classList.toggle('active', parseInt(btn.dataset.brush) === size)
      );
    });
    tb.appendChild(b);
  }
  tb.appendChild(mkSep());

  // Guide toggle
  const guideBtn = document.createElement('button');
  guideBtn.id = 'btn-guides';
  guideBtn.textContent = '⊟';
  guideBtn.title = 'Toggle guide lines';
  guideBtn.className = 'tool-btn' + (showGuides ? ' active' : '');
  guideBtn.addEventListener('click', () => {
    showGuides = !showGuides;
    guideBtn.classList.toggle('active', showGuides);
    buildGridEditor();
  });
  tb.appendChild(guideBtn);

  // Insert toolbar before grid editor container
  const editorCol = document.getElementById('editor-col');
  const gridEditor = document.getElementById('grid-editor');
  editorCol.insertBefore(tb, gridEditor);
}

// ─────────────────────────────────────────────
//  Parameter controls
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  Default style presets
// ─────────────────────────────────────────────

const DEFAULT_STYLES = [
  {
    name: 'Block',
    params: { cellWidth: 40, cellHeight: 40, gapX: 0,  gapY: 0,  cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'rect',   cornerMerge: true,  skewX: 0 },
  },
  {
    name: 'Pixel',
    params: { cellWidth: 40, cellHeight: 40, gapX: 3,  gapY: 3,  cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'rect',   cornerMerge: true,  skewX: 0 },
  },
  {
    name: 'Rounded',
    params: { cellWidth: 40, cellHeight: 40, gapX: 3,  gapY: 3,  cornerRadius: 12, innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'rect',   cornerMerge: true,  skewX: 0 },
  },
  {
    name: 'Pills',
    params: { cellWidth: 40, cellHeight: 40, gapX: 4,  gapY: 4,  cornerRadius: 20, innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'rect',   cornerMerge: false, skewX: 0 },
  },
  {
    name: 'Wide',
    params: { cellWidth: 56, cellHeight: 36, gapX: 4,  gapY: 4,  cornerRadius: 10, innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'rect',   cornerMerge: true,  skewX: 0 },
  },
  {
    name: 'Tall',
    params: { cellWidth: 30, cellHeight: 52, gapX: 4,  gapY: 4,  cornerRadius: 10, innerRadius: 0, bridgeRadius: 0, diagWidth: 12, cellShape: 'rect',   cornerMerge: true,  skewX: 0 },
  },
  {
    name: 'Dots',
    params: { cellWidth: 32, cellHeight: 32, gapX: 8,  gapY: 8,  cornerRadius: 16, innerRadius: 0, bridgeRadius: 0, diagWidth: 10, cellShape: 'circle', cornerMerge: true,  skewX: 0 },
  },
  {
    name: 'Nodes',
    params: { cellWidth: 44, cellHeight: 44, gapX: 0, gapY: 0, cornerRadius: 22, innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'nodes', cornerMerge: false, skewX: 0, lockNodeRadius: true },
  },
  {
    name: 'Chunky',
    params: { cellWidth: 52, cellHeight: 52, gapX: 5,  gapY: 5,  cornerRadius: 14, innerRadius: 0, bridgeRadius: 0, diagWidth: 18, cellShape: 'rect',   cornerMerge: true,  skewX: 0 },
  },
  {
    name: 'Italic',
    params: { cellWidth: 40, cellHeight: 40, gapX: 3,  gapY: 3,  cornerRadius: 12, innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'rect',   cornerMerge: true,  skewX: -12 },
  },
  {
    name: 'Letterpress',
    params: { cellWidth: 40, cellHeight: 40, gapX: 3,  gapY: 3,  cornerRadius: 12, innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'rect',   cornerMerge: true,  skewX: 0 },
  },
  {
    name: 'Smooth',
    params: { cellWidth: 40, cellHeight: 40, gapX: 3,  gapY: 3,  cornerRadius: 16, innerRadius: 8, bridgeRadius: 3, diagWidth: 14, cellShape: 'rect',   cornerMerge: false, skewX: 0 },
  },
  {
    name: 'Blob',
    params: { cellWidth: 40, cellHeight: 40, gapX: 0,  gapY: 0,  cornerRadius: 20, innerRadius: 14, bridgeRadius: 0, diagWidth: 14, cellShape: 'rect',  cornerMerge: false, skewX: 0 },
  },
  {
    name: 'Scanline',
    params: { cellWidth: 40, cellHeight: 40, gapX: 3, gapY: 3, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'horizontal', cornerMerge: true, skewX: 0 },
  },
  {
    name: 'Blinds',
    params: { cellWidth: 40, cellHeight: 40, gapX: 3, gapY: 3, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'vertical',   cornerMerge: true, skewX: 0 },
  },
  {
    name: 'Micro',
    params: { cellWidth: 40, cellHeight: 40, gapX: 3, gapY: 3, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'pixel',      cornerMerge: true, skewX: 0 },
  },
  {
    name: 'Outlined',
    params: { cellWidth: 40, cellHeight: 40, gapX: 3, gapY: 3, cornerRadius: 12, innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'rect',       cornerMerge: true, skewX: 0, outline: true,  outlineWidth: 3 },
  },
];

const PARAM_DEFS = [
  { key: 'cellWidth',    label: 'Cell Width',     min: 6,  max: 120, step: 1, type: 'range',    hint: 'Pixel width of each grid cell' },
  { key: 'cellHeight',   label: 'Cell Height',    min: 6,  max: 120, step: 1, type: 'range',    hint: 'Pixel height of each grid cell' },
  { key: 'cornerRadius', label: 'Corner Radius',  min: 0,  max: 60,  step: 1, type: 'range',    hint: 'Rounded corner radius on each cell (outer/convex corners)' },
  { key: 'innerRadius',  label: 'Inner Radius',   min: 0,  max: 30,  step: 1, type: 'range',    hint: 'Smooth fillet at concave inner corners where cells meet at L/T junctions' },
  { key: 'bridgeRadius', label: 'Bridge Radius',  min: 0,  max: 20,  step: 1, type: 'range',    hint: 'Rounded corners on gap bridge rectangles between cells' },
  { key: 'gapX',         label: 'Gap H',          min: 0,  max: 40,  step: 1, type: 'range',    hint: 'Horizontal gap between cells' },
  { key: 'gapY',         label: 'Gap V',          min: 0,  max: 40,  step: 1, type: 'range',    hint: 'Vertical gap between cells' },
  { key: 'cols',         label: 'Grid Cols',      min: 3,  max: 14,  step: 1, type: 'range',    hint: 'Number of columns in the glyph grid' },
  { key: 'rows',         label: 'Grid Rows',      min: 3,  max: 16,  step: 1, type: 'range',    hint: 'Number of rows in the glyph grid' },
  { key: 'padding',      label: 'Export Padding', min: 0,  max: 40,  step: 1, type: 'range',    hint: 'Extra blank space around the glyph in exported SVG' },
  { key: 'fgColor',      label: 'Foreground',                                 type: 'color',    hint: 'Glyph fill color' },
  { key: 'bgColor',      label: 'Background',                                 type: 'color',    hint: 'Background fill color (or use transparent)' },
  { key: 'diagFill',    label: 'Diagonal Fill',                                type: 'checkbox', hint: 'Draw diagonal lines between diagonally adjacent cells' },
  { key: 'diagWidth',   label: 'Diag Line Width',  min: 1, max: 80,  step: 1, type: 'range',    hint: 'Stroke width of diagonal connector lines' },
  { key: 'outline',      label: 'Outline',                                      type: 'checkbox', hint: 'Add a border stroke outside the glyph fill — works on top of any style/shape' },
  { key: 'outlineWidth', label: 'Outline Width',  min: 1,   max: 20,  step: 1, type: 'range',    hint: 'Outline stroke thickness' },
  { key: 'outlineColor', label: 'Outline Color',                                type: 'color',    hint: 'Color of the outline stroke' },
  { key: 'charSpacing', label: 'Char Spacing',     min: 0, max: 120, step: 1, type: 'range',    hint: 'Extra horizontal space between characters in the type tester' },
  { key: 'cornerMerge',    label: 'Merge Corners',    type: 'checkbox', hint: 'Flatten corners where adjacent cells meet (smoother connected strokes)' },
  { key: 'lockNodeRadius', label: 'Lock Node Radius', type: 'checkbox', hint: 'Lock circular node to half the smallest cell side (matches prototype). Only applies to Nodes shape.' },
  { key: 'skewX',        label: 'Skew',           min: -30, max: 30,  step: 1, type: 'range',    hint: 'Italic slant angle in degrees (pure vector transform, exports correctly)' },
];

const PARAM_GROUPS = [
  { label: 'Grid',     keys: ['cols', 'rows'],                                                   open: true  },
  { label: 'Cell',     keys: ['cellWidth', 'cellHeight'],                                         open: true  },
  { label: 'Gap',      keys: ['gapX', 'gapY'],                                                    open: true  },
  { label: 'Rounding', keys: ['cornerRadius', 'cornerMerge', 'lockNodeRadius'],                    open: true  },
  { label: 'Style',    keys: ['diagFill', 'diagWidth', 'outline', 'outlineWidth', 'outlineColor', 'skewX'], open: true  },
  { label: 'Color',    keys: ['fgColor', 'bgColor'],                                              open: true  },
  { label: 'Export',   keys: ['padding', 'charSpacing'],                                          open: false },
];

function buildParamControls() {
  const panel = document.getElementById('params-panel');
  panel.innerHTML = '<h2>Parameters</h2>';

  // ── Character styles ───────────────────────
  const charStyleSection = document.createElement('div');
  charStyleSection.className = 'presets-section';

  const charStyleLabel = document.createElement('div');
  charStyleLabel.className = 'presets-label';
  charStyleLabel.textContent = 'Character Style';
  charStyleSection.appendChild(charStyleLabel);

  const charStyleGrid = document.createElement('div');
  charStyleGrid.className = 'presets-grid char-style-grid';

  for (const style of CHAR_STYLES) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn char-style-btn';
    btn.dataset.style = style.name;
    btn.textContent = style.name;
    if (style.name === 'Classic') btn.classList.add('active');
    btn.addEventListener('click', () => applyCharStyle(style));
    charStyleGrid.appendChild(btn);
  }

  charStyleSection.appendChild(charStyleGrid);
  panel.appendChild(charStyleSection);

  // ── Style presets ──────────────────────────
  const presetsSection = document.createElement('div');
  presetsSection.className = 'presets-section';

  const presetsLabel = document.createElement('div');
  presetsLabel.className = 'presets-label';
  presetsLabel.textContent = 'Presets';
  presetsSection.appendChild(presetsLabel);

  const presetsGrid = document.createElement('div');
  presetsGrid.className = 'presets-grid';

  for (const preset of DEFAULT_STYLES) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = preset.name;
    btn.title = Object.entries(preset.params)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    btn.addEventListener('click', () => applyPreset(preset));
    presetsGrid.appendChild(btn);
  }

  presetsSection.appendChild(presetsGrid);
  panel.appendChild(presetsSection);

  // ── Cell shape ─────────────────────────────
  const shapeSection = document.createElement('div');
  shapeSection.className = 'presets-section';

  const shapeLabel = document.createElement('div');
  shapeLabel.className = 'presets-label';
  shapeLabel.textContent = 'Cell Shape';
  shapeSection.appendChild(shapeLabel);

  const shapeGrid = document.createElement('div');
  shapeGrid.className = 'presets-grid char-style-grid';

  for (const [shape, label] of [['rect','Rect'],['circle','Circle'],['nodes','Nodes'],['horizontal','Horizontal'],['vertical','Vertical'],['pixel','Pixel']]) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn cell-shape-btn';
    btn.dataset.shape = shape;
    btn.textContent = label;
    if (state.params.cellShape === shape) btn.classList.add('active');
    btn.addEventListener('click', () => applyCellShape(shape));
    shapeGrid.appendChild(btn);
  }

  shapeSection.appendChild(shapeGrid);
  panel.appendChild(shapeSection);

  for (const group of PARAM_GROUPS) {
    const section = document.createElement('div');
    section.className = 'param-section' + (group.open ? '' : ' collapsed');

    const hdr = document.createElement('div');
    hdr.className = 'param-section-hdr';
    hdr.innerHTML = `<span class="param-section-label">${group.label}</span><span class="param-section-arrow">▾</span>`;
    hdr.addEventListener('click', () => section.classList.toggle('collapsed'));

    const body = document.createElement('div');
    body.className = 'param-section-body';

    for (const key of group.keys) {
      const def = PARAM_DEFS.find(d => d.key === key);
      if (!def) continue;

      const wrap = document.createElement('div');
      wrap.className = 'param-row';
      wrap.dataset.paramKey = def.key;

      const label = document.createElement('label');
      label.htmlFor = `param-${def.key}`;

      if (def.type === 'range') {
        label.innerHTML = `${def.label}: <span class="param-val" id="param-val-${def.key}">${state.params[def.key]}</span>`;
        if (def.hint) label.title = def.hint;
        wrap.appendChild(label);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = `param-${def.key}`;
        slider.min = def.min;
        slider.max = def.max;
        slider.step = def.step;
        slider.value = state.params[def.key];
        if (def.hint) slider.title = `${def.hint} (${state.params[def.key]})`;

        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.className = 'param-num';
        numInput.dataset.key = def.key;
        numInput.min = def.min;
        numInput.max = def.max;
        numInput.step = def.step;
        numInput.value = state.params[def.key];

        slider.addEventListener('input', () => {
          numInput.value = slider.value;
          const badge = document.getElementById(`param-val-${def.key}`);
          if (badge) badge.textContent = slider.value;
          if (def.hint) slider.title = `${def.hint} (${slider.value})`;
          applyParam(def.key, Number(slider.value));
        });
        numInput.addEventListener('change', () => {
          const v = Math.min(def.max, Math.max(def.min, Number(numInput.value)));
          slider.value = v;
          numInput.value = v;
          const badge = document.getElementById(`param-val-${def.key}`);
          if (badge) badge.textContent = v;
          applyParam(def.key, v);
        });

        wrap.appendChild(slider);
        wrap.appendChild(numInput);

      } else if (def.type === 'color') {
        label.textContent = def.label;
        wrap.appendChild(label);

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.id = `param-${def.key}`;
        picker.value = state.params[def.key];
        picker.addEventListener('input', () => applyParam(def.key, picker.value));
        wrap.appendChild(picker);

      } else if (def.type === 'checkbox') {
        const row = document.createElement('div');
        row.className = 'param-checkbox-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `param-${def.key}`;
        checkbox.checked = !!state.params[def.key];
        checkbox.addEventListener('change', () => applyParam(def.key, checkbox.checked));

        label.textContent = def.label;
        row.appendChild(checkbox);
        row.appendChild(label);
        wrap.appendChild(row);
      }

      body.appendChild(wrap);
    }

    section.appendChild(hdr);
    section.appendChild(body);
    panel.appendChild(section);
  }

  // Generate Defaults button — scales 5×7 base font to current grid size
  const defaultRow = document.createElement('div');
  defaultRow.className = 'param-row';
  const defaultBtn = document.createElement('button');
  defaultBtn.textContent = 'Generate Default Characters';
  defaultBtn.className = 'primary';
  defaultBtn.style.width = '100%';
  defaultBtn.title = 'Scale the built-in 5×7 character set to the current grid dimensions';
  defaultBtn.addEventListener('click', () => {
    resetAll();
    buildGridEditor();
    render();
  });
  defaultRow.appendChild(defaultBtn);
  panel.appendChild(defaultRow);

  // Auto-size section
  const autoRow = document.createElement('div');
  autoRow.className = 'param-row autoscale-row';

  const autoLabel = document.createElement('label');
  autoLabel.textContent = 'Auto-size';
  autoRow.appendChild(autoLabel);

  const autoControls = document.createElement('div');
  autoControls.className = 'autoscale-controls';

  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.id = 'autoscale-height';
  heightInput.className = 'param-num';
  heightInput.min = 20;
  heightInput.max = 2000;
  heightInput.placeholder = 'height px';
  heightInput.title = 'Target total character height in pixels';
  // Pre-fill with the current rendered character height
  heightInput.value = computeCharHeight();

  const genBtn = document.createElement('button');
  genBtn.textContent = 'Generate';
  genBtn.className = 'primary';
  genBtn.addEventListener('click', () => {
    const h = parseInt(heightInput.value);
    if (!isNaN(h) && h > 0) autoGenerate(h);
  });
  heightInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') genBtn.click();
  });

  autoControls.appendChild(heightInput);
  autoControls.appendChild(genBtn);
  autoRow.appendChild(autoControls);
  panel.appendChild(autoRow);
}

/** Total rendered height of a character at current params (no padding). */
function computeCharHeight() {
  const { rows, cellHeight } = state.params;
  const gapY = state.params.gapY ?? state.params.gap ?? 0;
  return rows * cellHeight + (rows - 1) * gapY;
}

/**
 * Derive cell/gap/radius params from a target character height and current grid.
 * Uses a fixed 10% gap-to-cell ratio and 28% corner radius ratio.
 */
function autoGenerate(targetHeight) {
  const { cols, rows } = state.params;

  // Solve: targetHeight = rows * cellH + (rows-1) * gap,  gap = cellH * gapRatio
  const gapRatio   = 0.1;
  const cellH = Math.max(4, Math.round(targetHeight / (rows + (rows - 1) * gapRatio)));
  const gap   = Math.max(0, Math.round(cellH * gapRatio));
  const cellW = cellH;
  const radius = Math.min(Math.floor(cellH / 2), Math.round(cellH * 0.28));
  const dw     = Math.round(cellH * 0.28);

  Object.assign(state.params, {
    cellWidth:    cellW,
    cellHeight:   cellH,
    gapX:         gap,
    gapY:         gap,
    cornerRadius: radius,
    diagWidth:    dw,
  });

  syncParamControls();
  render();

  // Keep the height input in sync with the real rendered height
  const input = document.getElementById('autoscale-height');
  if (input) input.value = computeCharHeight();
}

function applyCharStyle(style) {
  saveUndo();
  const { cols, rows } = state.params;
  // Apply style glyphs for all chars in state — fall back to FONT_DATA for chars
  // not defined in the style (numbers, nordic, punctuation only have one design).
  for (const char of Object.keys(state.glyphs)) {
    const srcData = style.data[char] ?? FONT_DATA[char];
    if (!srcData) continue;
    state.glyphs[char] = (FONT_COLS === cols && FONT_ROWS === rows)
      ? [...srcData]
      : scaleGlyph(srcData, FONT_COLS, FONT_ROWS, cols, rows);
  }
  // Update active button state
  document.querySelectorAll('.char-style-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.style === style.name);
  });
  buildGridEditor();
  render();
}

function applyCellShape(shape) {
  state.params.cellShape = shape;
  document.querySelectorAll('.cell-shape-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.shape === shape);
  });
  if (shape === 'nodes') {
    // Force square cells and no gap
    state.params.gapX = 0;
    state.params.gapY = 0;
    state.params.cellHeight = state.params.cellWidth;
    syncParamControls();
  }
  updateConditionalParams();
  renderEditorPreview();
  renderPreviewStrip();
  renderTypeTester();
}


function applyPreset(preset) {
  Object.assign(state.params, preset.params);
  if (preset.params.lockNodeRadius === undefined) state.params.lockNodeRadius = true;
  // Clamp cornerRadius to cell size
  const maxRad = Math.floor(Math.min(state.params.cellWidth, state.params.cellHeight) / 2);
  state.params.cornerRadius = Math.min(state.params.cornerRadius, maxRad);
  syncParamControls();
  syncShapeButtons();
  render();
  // Update autoscale height display
  const input = document.getElementById('autoscale-height');
  if (input) input.value = computeCharHeight();
}

function applyParam(key, value) {
  const oldCols = state.params.cols;
  const oldRows = state.params.rows;
  state.params[key] = value;

  if (key === 'cols' || key === 'rows') {
    resizeAllGlyphs(oldCols, oldRows, state.params.cols, state.params.rows);
    buildGridEditor();
  }

  // Nodes: enforce square cells and zero gap
  if (state.params.cellShape === 'nodes') {
    if (key === 'cellWidth' || key === 'cellHeight') {
      state.params.cellWidth = value;
      state.params.cellHeight = value;
      const wSlider = document.getElementById('param-cellWidth');
      const hSlider = document.getElementById('param-cellHeight');
      const wNum = document.querySelector('.param-num[data-key="cellWidth"]');
      const hNum = document.querySelector('.param-num[data-key="cellHeight"]');
      const wBadge = document.getElementById('param-val-cellWidth');
      const hBadge = document.getElementById('param-val-cellHeight');
      if (wSlider) wSlider.value = value;
      if (hSlider) hSlider.value = value;
      if (wNum) wNum.value = value;
      if (hNum) hNum.value = value;
      if (wBadge) wBadge.textContent = value;
      if (hBadge) hBadge.textContent = value;
    }
    if (key === 'gapX' || key === 'gapY') {
      state.params.gapX = 0;
      state.params.gapY = 0;
      return;
    }
  }

  // Clamp cornerRadius to fit within both cell dimensions
  if (key === 'cellWidth' || key === 'cellHeight' || key === 'cornerRadius') {
    const maxRad = Math.floor(Math.min(state.params.cellWidth, state.params.cellHeight) / 2);
    if (state.params.cornerRadius > maxRad) {
      state.params.cornerRadius = maxRad;
      const slider = document.getElementById('param-cornerRadius');
      const num = document.querySelector('.param-num[data-key="cornerRadius"]');
      if (slider) slider.value = maxRad;
      if (num) num.value = maxRad;
    }
  }

  if (key === 'fgColor') document.documentElement.style.setProperty('--fg', value);
  if (key === 'bgColor') document.documentElement.style.setProperty('--bg', value);
  if (key === 'outline') updateConditionalParams();

  renderEditorPreview();
  renderPreviewStrip();
  renderTypeTester();
}

// ─────────────────────────────────────────────
//  Grid resize
// ─────────────────────────────────────────────

function resizeGlyph(data, oldCols, oldRows, newCols, newRows) {
  const out = new Array(newCols * newRows).fill(0);
  const cCopy = Math.min(oldCols, newCols);
  const rCopy = Math.min(oldRows, newRows);
  for (let r = 0; r < rCopy; r++) {
    for (let c = 0; c < cCopy; c++) {
      out[r * newCols + c] = data[r * oldCols + c] || 0;
    }
  }
  return out;
}

/**
 * Scale a glyph from one grid size to another using nearest-neighbor sampling
 * with center-to-center mapping.  Maps dst cell centers to src cell centers
 * so that both edges of the source glyph are preserved (avoids the floor-bias
 * problem where the right/bottom edges are lost at small sizes).
 */
function scaleGlyph(data, srcCols, srcRows, dstCols, dstRows) {
  const out = new Array(dstCols * dstRows).fill(0);
  for (let r = 0; r < dstRows; r++) {
    // Map center of dst row to center of src row
    const srcR = dstRows === 1 ? 0
      : Math.min(Math.round(r * (srcRows - 1) / (dstRows - 1)), srcRows - 1);
    for (let c = 0; c < dstCols; c++) {
      const srcC = dstCols === 1 ? 0
        : Math.min(Math.round(c * (srcCols - 1) / (dstCols - 1)), srcCols - 1);
      out[r * dstCols + c] = data[srcR * srcCols + srcC] || 0;
    }
  }
  return out;
}

function resizeAllGlyphs(oldCols, oldRows, newCols, newRows) {
  for (const char of Object.keys(state.glyphs)) {
    state.glyphs[char] = resizeGlyph(state.glyphs[char], oldCols, oldRows, newCols, newRows);
  }
}

// ─────────────────────────────────────────────
//  Rendering
// ─────────────────────────────────────────────

function render() {
  renderEditorPreview();
  renderPreviewStrip();
  renderTypeTester();
}

function renderEditorPreview() {
  const { cols, rows } = state.params;
  const data = state.glyphs[state.currentChar];
  if (!data) return;
  document.getElementById('editor-preview').innerHTML =
    generateGlyphSVG(data, cols, rows, state.params);
}

function renderPreviewStrip(onlyChar) {
  const { cols, rows } = state.params;
  const previewParams = scaleParams(state.params, 10);
  const strip = document.getElementById('preview-strip');

  if (onlyChar) {
    // Update just the one changed cell — use dataset comparison (safe for all chars)
    for (const cell of strip.querySelectorAll('.preview-char')) {
      if (cell.dataset.char === onlyChar) {
        const data = state.glyphs[onlyChar];
        if (data) cell.innerHTML = generateGlyphSVG(data, cols, rows, previewParams);
        return;
      }
    }
    return;
  }

  // Full rebuild — ordered by CHAR_GROUPS
  strip.innerHTML = '';
  for (const group of CHAR_GROUPS) {
    for (const char of group.chars) {
      const data = state.glyphs[char];
      if (!data) continue;
      const cell = document.createElement('div');
      cell.className = 'preview-char';
      cell.dataset.char = char;
      cell.title = char;
      cell.addEventListener('click', () => selectChar(char));
      cell.innerHTML = generateGlyphSVG(data, cols, rows, previewParams);
      strip.appendChild(cell);
    }
  }
}

// ─────────────────────────────────────────────
//  Export
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  Type tester
// ─────────────────────────────────────────────

function buildTypeTester() {
  const panel = document.getElementById('type-tester');
  panel.innerHTML = '';

  const bar = document.createElement('div');
  bar.className = 'type-tester-bar';

  const label = document.createElement('span');
  label.className = 'type-tester-label';
  label.textContent = 'Type Tester';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'type-tester-input';
  input.className = 'type-tester-input';
  input.placeholder = 'Type to preview…';
  input.value = 'HELLO WORLD';
  input.addEventListener('input', renderTypeTester);

  const sizeLabel = document.createElement('span');
  sizeLabel.className = 'type-tester-label';
  sizeLabel.textContent = 'Size';

  const sizeInput = document.createElement('input');
  sizeInput.type = 'range';
  sizeInput.min = 30;
  sizeInput.max = 200;
  sizeInput.value = 60;
  sizeInput.title = 'Preview text size';
  sizeInput.style.cssText = 'width:72px;cursor:pointer;accent-color:var(--ui-accent);';
  sizeInput.addEventListener('input', () => {
    const preview = document.getElementById('type-tester-preview');
    if (preview) {
      const h = parseInt(sizeInput.value);
      preview.style.maxHeight = (h + 16) + 'px';
      const svg = preview.querySelector('svg');
      if (svg) svg.style.maxHeight = h + 'px';
    }
  });

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export SVG';
  exportBtn.className = 'primary';
  exportBtn.addEventListener('click', exportTypeTester);

  bar.appendChild(label);
  bar.appendChild(input);
  bar.appendChild(sizeLabel);
  bar.appendChild(sizeInput);
  bar.appendChild(exportBtn);
  panel.appendChild(bar);

  const preview = document.createElement('div');
  preview.id = 'type-tester-preview';
  preview.className = 'type-tester-preview';
  panel.appendChild(preview);

  renderTypeTester();
}

function renderTypeTester() {
  const input   = document.getElementById('type-tester-input');
  const preview = document.getElementById('type-tester-preview');
  if (!input || !preview) return;
  const svg = generateTextSVG(state.glyphs, input.value, state.params);
  preview.innerHTML = svg || '';
}

function exportTypeTester() {
  const input = document.getElementById('type-tester-input');
  const text  = input?.value || 'TEXT';
  const svg   = generateTextSVG(state.glyphs, text, state.params);
  if (svg) {
    const name = text.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 40) || 'text';
    downloadSVG(`${name}.svg`, svg);
    showToast(`Exported ${name}.svg`);
  }
}

function exportCurrent() {
  const { cols, rows } = state.params;
  const svg = generateGlyphSVG(state.glyphs[state.currentChar], cols, rows, state.params);
  downloadSVG(`${state.currentChar.toLowerCase()}.svg`, svg);
  showToast(`Exported ${state.currentChar.toLowerCase()}.svg`);
}

function exportAll() {
  const { cols, rows } = state.params;
  let count = 0;
  for (const char of Object.keys(state.glyphs)) {
    const svg = generateGlyphSVG(state.glyphs[char], cols, rows, state.params);
    downloadSVG(`${char.toLowerCase()}.svg`, svg);
    count++;
  }
  showToast(`Exported ${count} glyphs`);
}

function exportCurrentPNG() {
  const { cols, rows } = state.params;
  const svg = generateGlyphSVG(state.glyphs[state.currentChar], cols, rows, state.params);
  const scale = parseInt(document.getElementById('png-scale')?.value) || 4;
  downloadPNG(`${state.currentChar.toLowerCase()}.png`, svg, scale);
  showToast(`Exported ${state.currentChar.toLowerCase()}.png ×${scale}`);
}

function exportSprite() {
  const allChars = CHAR_GROUPS.flatMap(g => g.chars).filter(c => state.glyphs[c]);
  const svg = generateSpriteSheetSVG(state.glyphs, allChars, state.params);
  downloadSVG('sprite-sheet.svg', svg);
  showToast(`Exported sprite-sheet.svg (${allChars.length} glyphs)`);
}

// ─────────────────────────────────────────────
//  Light / dark mode
// ─────────────────────────────────────────��───

// ─────────────────────────────────────────────
//  Toast notifications
// ─────────────────────────────────────────────

function showToast(msg, duration = 2200) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

function toggleTheme() {
  const isLight = document.documentElement.dataset.theme === 'light';
  const goingLight = !isLight;
  document.documentElement.dataset.theme = goingLight ? 'light' : '';
  localStorage.setItem('pfg-theme', goingLight ? 'light' : '');
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = goingLight ? '☾' : '☀';

  // Swap fg/bg colors when switching themes (if still at defaults)
  const fg = state.params.fgColor;
  const bg = state.params.bgColor;
  const isDefaultDark = fg === '#ffffff' && bg === '#000000';
  const isDefaultLight = fg === '#000000' && bg === '#ffffff';
  if (isDefaultDark || isDefaultLight) {
    state.params.fgColor = goingLight ? '#000000' : '#ffffff';
    state.params.bgColor = goingLight ? '#ffffff' : '#000000';
    document.documentElement.style.setProperty('--fg', state.params.fgColor);
    document.documentElement.style.setProperty('--bg', state.params.bgColor);
    // Update color inputs in param panel
    const fgInput = document.getElementById('param-fgColor');
    const bgInput = document.getElementById('param-bgColor');
    if (fgInput) fgInput.value = state.params.fgColor;
    if (bgInput) bgInput.value = state.params.bgColor;
    render();
  }
}

// ─────────────────────────────────────────────
//  Reset
// ─────────────────────────────────────────────

function resetCurrentChar() {
  saveUndo();
  const { cols, rows } = state.params;
  const src = bestFontSource(cols, rows);
  const srcData = src.data[state.currentChar];
  if (srcData) {
    state.glyphs[state.currentChar] = (src.cols === cols && src.rows === rows)
      ? [...srcData]
      : scaleGlyph(srcData, src.cols, src.rows, cols, rows);
    buildGridEditor();
    renderEditorPreview();
    renderPreviewStrip(state.currentChar);
  }
}

function resetAll() {
  saveUndo();
  const { cols, rows } = state.params;
  const src = bestFontSource(cols, rows);
  for (const char of Object.keys(src.data)) {
    state.glyphs[char] = (src.cols === cols && src.rows === rows)
      ? [...src.data[char]]
      : scaleGlyph(src.data[char], src.cols, src.rows, cols, rows);
  }
  buildGridEditor();
  render();
}

// ─────────────────────────────────────────────
//  Styles — save/load/delete via localStorage
// ─────────────────────────────────────────────

const STYLES_KEY = 'pfg-styles';

function readStyles() {
  try { return JSON.parse(localStorage.getItem(STYLES_KEY)) || []; }
  catch { return []; }
}

function writeStyles(styles) {
  localStorage.setItem(STYLES_KEY, JSON.stringify(styles));
}

function saveCurrentStyle(name) {
  name = name.trim();
  if (!name) return;
  const styles = readStyles();
  const idx = styles.findIndex(s => s.name === name);
  const entry = {
    name,
    params: { ...state.params },
    glyphs: Object.fromEntries(
      Object.entries(state.glyphs).map(([k, v]) => [k, [...v]])
    ),
  };
  if (idx >= 0) styles[idx] = entry;
  else styles.push(entry);
  writeStyles(styles);
  renderStylesList();
}

function applyStyle(saved) {
  saveUndo();
  const oldCols = state.params.cols;
  const oldRows = state.params.rows;
  // Migrate legacy saves: 'gap' → gapX/gapY
  const migrated = { ...saved.params };
  if (migrated.gap != null && migrated.gapX == null) {
    migrated.gapX = migrated.gap;
    migrated.gapY = migrated.gap;
  }
  Object.assign(state.params, migrated);

  if (saved.glyphs) {
    for (const [char, data] of Object.entries(saved.glyphs)) {
      state.glyphs[char] = [...data];
    }
  } else if (saved.params.cols !== oldCols || saved.params.rows !== oldRows) {
    // Legacy save (params only) — resize existing glyph data to new grid
    resizeAllGlyphs(oldCols, oldRows, state.params.cols, state.params.rows);
  }

  buildGridEditor();
  syncParamControls();
  syncShapeButtons();
  render();
}

function deleteStyle(name) {
  writeStyles(readStyles().filter(s => s.name !== name));
  renderStylesList();
}

function exportStyles() {
  const styles = readStyles();
  if (styles.length === 0) return;
  const json = JSON.stringify(styles, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pixel-font-styles.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importStyles(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) return;
      const existing = readStyles();
      for (const entry of imported) {
        if (!entry.name || !entry.params) continue;
        const idx = existing.findIndex(s => s.name === entry.name);
        if (idx >= 0) existing[idx] = entry;
        else existing.push(entry);
      }
      writeStyles(existing);
      renderStylesList();
    } catch { /* invalid JSON — silently ignore */ }
  };
  reader.readAsText(file);
}

/** Push current state.params back into all control inputs. */
function syncParamControls() {
  for (const def of PARAM_DEFS) {
    const value = state.params[def.key];
    if (def.type === 'range') {
      const slider = document.getElementById(`param-${def.key}`);
      const num    = document.querySelector(`.param-num[data-key="${def.key}"]`);
      const badge  = document.getElementById(`param-val-${def.key}`);
      if (slider) slider.value = value;
      if (num)    num.value    = value;
      if (badge)  badge.textContent = value;
    } else if (def.type === 'color') {
      const picker = document.getElementById(`param-${def.key}`);
      if (picker) picker.value = value;
    } else if (def.type === 'checkbox') {
      const cb = document.getElementById(`param-${def.key}`);
      if (cb) cb.checked = !!value;
    }
  }
  document.documentElement.style.setProperty('--fg', state.params.fgColor);
  document.documentElement.style.setProperty('--bg', state.params.bgColor);
  syncShapeButtons();
}

function syncShapeButtons() {
  const shape = state.params.cellShape || 'rect';
  document.querySelectorAll('.cell-shape-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.shape === shape);
  });
  updateConditionalParams();
}

function updateConditionalParams() {
  const hasOutline = !!state.params.outline;
  const isNodes = state.params.cellShape === 'nodes';

  const outlineWRow = document.querySelector('.param-row[data-param-key="outlineWidth"]');
  const outlineCRow = document.querySelector('.param-row[data-param-key="outlineColor"]');
  if (outlineWRow) outlineWRow.style.display = hasOutline ? '' : 'none';
  if (outlineCRow) outlineCRow.style.display = hasOutline ? '' : 'none';

  // Nodes: hide gap controls (locked at 0) and square-cell note
  for (const key of ['gapX', 'gapY', 'cornerMerge']) {
    const row = document.querySelector(`.param-row[data-param-key="${key}"]`);
    if (row) row.style.display = isNodes ? 'none' : '';
  }
  // lockNodeRadius only relevant for nodes
  const lockRow = document.querySelector('.param-row[data-param-key="lockNodeRadius"]');
  if (lockRow) lockRow.style.display = isNodes ? '' : 'none';
}

function buildStylesUI() {
  const panel = document.getElementById('params-panel');

  const section = document.createElement('div');
  section.id = 'styles-section';

  const heading = document.createElement('h2');
  heading.className = 'styles-heading';
  heading.textContent = 'Styles';
  section.appendChild(heading);

  // Save row
  const saveRow = document.createElement('div');
  saveRow.className = 'styles-save-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'style-name-input';
  nameInput.placeholder = 'Style name…';
  nameInput.className = 'style-name-input';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'primary';
  saveBtn.addEventListener('click', () => {
    saveCurrentStyle(nameInput.value);
    nameInput.value = '';
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click();
  });

  saveRow.appendChild(nameInput);
  saveRow.appendChild(saveBtn);
  section.appendChild(saveRow);

  // Import/export row
  const ioRow = document.createElement('div');
  ioRow.className = 'styles-io-row';

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export All';
  exportBtn.title = 'Download all saved styles as JSON';
  exportBtn.addEventListener('click', exportStyles);

  const importBtn = document.createElement('button');
  importBtn.textContent = 'Import';
  importBtn.title = 'Load styles from a JSON file';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) importStyles(fileInput.files[0]);
    fileInput.value = '';
  });
  importBtn.addEventListener('click', () => fileInput.click());

  ioRow.appendChild(exportBtn);
  ioRow.appendChild(importBtn);
  ioRow.appendChild(fileInput);
  section.appendChild(ioRow);

  // List container
  const list = document.createElement('div');
  list.id = 'styles-list';
  section.appendChild(list);

  panel.appendChild(section);
  renderStylesList();
}

function renderStylesList() {
  const list = document.getElementById('styles-list');
  if (!list) return;
  const styles = readStyles();
  list.innerHTML = '';

  if (styles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'styles-empty';
    empty.textContent = 'No saved styles';
    list.appendChild(empty);
    return;
  }

  for (const style of styles) {
    const item = document.createElement('div');
    item.className = 'style-item';

    const name = document.createElement('span');
    name.className = 'style-name';
    name.textContent = style.name;
    name.title = style.name;

    const actions = document.createElement('div');
    actions.className = 'style-actions';

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => applyStyle(style));

    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.className = 'style-delete';
    delBtn.title = 'Delete style';
    delBtn.addEventListener('click', () => deleteStyle(style.name));

    actions.appendChild(loadBtn);
    actions.appendChild(delBtn);
    item.appendChild(name);
    item.appendChild(actions);
    list.appendChild(item);
  }
}

// ─────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Restore theme preference
  const savedTheme = localStorage.getItem('pfg-theme') || '';
  document.documentElement.dataset.theme = savedTheme;
  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) themeBtn.textContent = savedTheme === 'light' ? '☾' : '☀';

  // If saved theme is light, pre-flip default colors
  if (savedTheme === 'light') {
    state.params.fgColor = '#000000';
    state.params.bgColor = '#ffffff';
  }

  init();
  buildEditorToolbar();
  initEditorEvents();

  document.getElementById('btn-export').addEventListener('click', exportCurrent);
  document.getElementById('btn-export-all').addEventListener('click', exportAll);
  document.getElementById('btn-export-png').addEventListener('click', exportCurrentPNG);
  document.getElementById('btn-export-sprite').addEventListener('click', exportSprite);
  document.getElementById('btn-reset').addEventListener('click', resetCurrentChar);
  document.getElementById('btn-reset-all').addEventListener('click', resetAll);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  document.documentElement.style.setProperty('--fg', state.params.fgColor);
  document.documentElement.style.setProperty('--bg', state.params.bgColor);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  });
});
