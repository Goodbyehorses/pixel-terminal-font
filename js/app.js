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

function copyGlyphs(glyphs) {
  return Object.fromEntries(Object.entries(glyphs).map(([k, v]) => [k, [...v]]));
}

function activeCharStyleName() {
  const btn = document.querySelector('.char-style-btn.active');
  return btn ? btn.dataset.style : 'Classic';
}

function setActiveCharStyle(name) {
  document.querySelectorAll('.char-style-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.style === name);
  });
}

// Full editor snapshot: all params (grid size, shape, colors…) + glyphs.
function glyphSnapshot() {
  return {
    params: { ...state.params },
    glyphs: copyGlyphs(state.glyphs),
    charStyle: activeCharStyleName(),
  };
}

function restoreSnapshot(snap) {
  clearPreset();
  for (const [k, v] of Object.entries(snap.glyphs)) state.glyphs[k] = v;
  Object.assign(state.params, snap.params);
  syncParamControls();   // also sets --fg/--bg and syncs shape buttons
  setActiveCharStyle(snap.charStyle);
  const input = document.getElementById('autoscale-height');
  if (input) input.value = computeCharHeight();
}

// An in-progress param edit (slider drag, color picker drag). One undo step is
// saved when it starts; `base` keeps the pristine glyphs so cols/rows resizes
// are computed from the drag-start state instead of cumulatively.
let paramEdit = null;

function beginParamEdit(key) {
  if (paramEdit && paramEdit.key === key) return;
  saveUndo();
  paramEdit = {
    key,
    base: { cols: state.params.cols, rows: state.params.rows, glyphs: copyGlyphs(state.glyphs) },
  };
}

function endParamEdit() { paramEdit = null; }

function saveUndo() {
  paramEdit = null;   // any new undoable action closes a pending param edit
  undoStack.push(glyphSnapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  updateUndoUI();
}

function undo() {
  if (!undoStack.length) return;
  paramEdit = null;
  redoStack.push(glyphSnapshot());
  const snap = undoStack.pop();
  restoreSnapshot(snap);
  buildGridEditor();
  render();
  updateUndoUI();
}

function redo() {
  if (!redoStack.length) return;
  paramEdit = null;
  undoStack.push(glyphSnapshot());
  const snap = redoStack.pop();
  restoreSnapshot(snap);
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
    shapeWeight:   50,
    dotSize:      100,
    showOff:       false,
    offColor:     '#222222',
  },
  glyphs: {},
};

// ─────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────

// Factory defaults, captured before any theme flip / restore (used by Reset All).
const DEFAULT_PARAMS = { ...state.params };

function init() {
  for (const char of Object.keys(FONT_DATA)) {
    state.glyphs[char] = [...FONT_DATA[char]];
  }
  const restored = loadAutosave();
  buildCharList();
  buildParamControls();
  updateConditionalParams();
  buildStylesUI();
  buildGridEditor();
  buildTypeTester();
  if (restored) { setActiveCharStyle(restored.charStyle); showToast('Restored your last session'); }
  render();
  selectChar(restored ? state.currentChar : 'A');
}

// ─────────────────────────────────────────────
//  Autosave (localStorage)
// ─────────────────────────────────────────────

const AUTOSAVE_KEY = 'pfg-autosave';
const AUTOSAVE_DELAY = 500;
let autosaveTimer = null;

function writeAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
      version: 1,
      params: state.params,
      glyphs: state.glyphs,
      currentChar: state.currentChar,
      charStyle: activeCharStyleName(),
    }));
    setSaveStatus('Saved on this device');
  } catch { setSaveStatus('Could not save on this device'); }
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  setSaveStatus('Saving…');
  autosaveTimer = setTimeout(writeAutosave, AUTOSAVE_DELAY);
}

/**
 * Restore params + glyphs from localStorage into state. Returns the saved
 * record on success, or null (state untouched) if missing/invalid/mismatched.
 */
function loadAutosave() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY)); }
  catch { return null; }
  if (!saved || typeof saved !== 'object') return null;
  const { params, glyphs } = saved;
  if (!params || typeof params !== 'object' || !glyphs || typeof glyphs !== 'object') return null;

  // Grid size must be valid integers within the slider ranges
  const inRange = (key) => {
    const def = PARAM_DEFS.find(d => d.key === key);
    const v = params[key];
    return Number.isInteger(v) && v >= def.min && v <= def.max;
  };
  if (!inRange('cols') || !inRange('rows')) return null;
  const { cols, rows } = params;
  const size = cols * rows;

  // Every stored glyph must match the stored grid size and contain only 0/1
  const restoredGlyphs = {};
  for (const [char, data] of Object.entries(glyphs)) {
    if (!Array.isArray(data) || data.length !== size) return null;
    if (!data.every(v => v === 0 || v === 1)) return null;
    restoredGlyphs[char] = [...data];
  }

  // Only take known params whose type matches the default
  const restoredParams = {};
  for (const [key, def] of Object.entries(DEFAULT_PARAMS)) {
    if (typeof params[key] === typeof def) restoredParams[key] = params[key];
  }

  Object.assign(state.params, restoredParams);
  // Chars missing from the save get the built-in glyph scaled to the saved grid
  const src = bestFontSource(cols, rows);
  for (const char of Object.keys(state.glyphs)) {
    if (restoredGlyphs[char]) continue;
    const srcData = src.data[char] || FONT_DATA[char];
    const sc = src.data[char] ? src.cols : FONT_COLS;
    const sr = src.data[char] ? src.rows : FONT_ROWS;
    restoredGlyphs[char] = (sc === cols && sr === rows) ? [...srcData] : scaleGlyph(srcData, sc, sr, cols, rows);
  }
  state.glyphs = restoredGlyphs;
  if (typeof saved.currentChar === 'string' && state.glyphs[saved.currentChar]) {
    state.currentChar = saved.currentChar;
  }
  return { charStyle: typeof saved.charStyle === 'string' ? saved.charStyle : 'Classic' };
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
  // Keep keyboard focus inside the grid after a resize / undo
  focusedCell = {
    r: Math.max(0, Math.min(rows - 1, focusedCell.r)),
    c: Math.max(0, Math.min(cols - 1, focusedCell.c)),
  };

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
      let row = editor.querySelector(`[data-grid-row="${r}"]`);
      if (!row) { row = document.createElement('div'); row.dataset.gridRow = r; row.setAttribute('role', 'row'); row.style.display = 'contents'; editor.appendChild(row); }
      row.appendChild(cell);
    }
  }
  syncGridAccessibility();
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
  syncGridAccessibility();
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
  syncGridAccessibility();
  renderEditorPreview();
  renderPreviewStrip(state.currentChar);
  scheduleTypeTester();
}

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
    setCellFocus(r, c);
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
  syncGridAccessibility();
  renderEditorPreview();
  renderPreviewStrip(state.currentChar);
  scheduleTypeTester();
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

/**
 * Rotate 90° clockwise. On a square grid this is an exact rotation. On a
 * non-square grid (e.g. 5×7) the rotated glyph is rows×cols, so its lit-pixel
 * bounding box is centered in cols×rows: pixel-exact (pure pad) when it fits;
 * a dimension that overflows (a full-height 5×7 letter becomes 7 wide) is
 * shrunk with scaleGlyph, which keeps both edge strokes — plain cropping would
 * cut off e.g. the stem of a rotated L. Nothing is ever stretched.
 */
function rotate90(data, cols, rows) {
  // Rotated grid: rCols = rows, rRows = cols; rot[c][rows-1-r] = old[r][c]
  const rCols = rows, rRows = cols;
  const rot = new Array(cols * rows).fill(0);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      rot[c * rCols + (rows - 1 - r)] = data[r * cols + c] || 0;
  if (cols === rows) return rot;

  // Bounding box of lit pixels in the rotated grid
  let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
  for (let r = 0; r < rRows; r++)
    for (let c = 0; c < rCols; c++)
      if (rot[r * rCols + c]) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
  const out = new Array(cols * rows).fill(0);
  if (maxR < 0) return out;

  // Extract the bbox; shrink only the dimension(s) that overflow the target
  const bw = maxC - minC + 1, bh = maxR - minR + 1;
  let box = [];
  for (let r = minR; r <= maxR; r++) box.push(...rot.slice(r * rCols + minC, r * rCols + maxC + 1));
  const fw = Math.min(bw, cols), fh = Math.min(bh, rows);
  if (fw !== bw || fh !== bh) box = scaleGlyph(box, bw, bh, fw, fh);

  // Center it in the cols×rows grid
  const offR = Math.floor((rows - fh) / 2), offC = Math.floor((cols - fw) / 2);
  for (let r = 0; r < fh; r++)
    for (let c = 0; c < fw; c++)
      out[(r + offR) * cols + (c + offC)] = box[r * fw + c];
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
  syncGridAccessibility();
  renderEditorPreview();
  renderPreviewStrip(state.currentChar);
  scheduleTypeTester();
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
    b.setAttribute('aria-label', title);
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
    params: { cellWidth: 40, cellHeight: 40, gapX: 4,  gapY: 4,  cornerRadius: 20, innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'rect',   cornerMerge: true,  skewX: 0 },
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
    params: { cellWidth: 40, cellHeight: 40, gapX: 0,  gapY: 0,  cornerRadius: 6,  innerRadius: 0, bridgeRadius: 0, diagWidth: 18, cellShape: 'rect',   cornerMerge: true,  skewX: 0, diagFill: true },
  },
  {
    name: 'Smooth',
    params: { cellWidth: 40, cellHeight: 40, gapX: 0,  gapY: 0,  cornerRadius: 12, innerRadius: 0, bridgeRadius: 0, diagWidth: 24, cellShape: 'rect',   cornerMerge: true,  skewX: 0, diagFill: true },
  },
  {
    name: 'Blob',
    params: { cellWidth: 40, cellHeight: 40, gapX: 0,  gapY: 0,  cornerRadius: 20, innerRadius: 0, bridgeRadius: 0, diagWidth: 40, cellShape: 'rect',   cornerMerge: true,  skewX: 0, diagFill: true },
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
  {
    name: 'LED',
    params: { cellWidth: 32, cellHeight: 32, gapX: 6, gapY: 6, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'circle',     cornerMerge: true, skewX: 0, showOff: true },
  },
  {
    name: 'Diamond',
    params: { cellWidth: 40, cellHeight: 40, gapX: 2, gapY: 2, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'diamond',    cornerMerge: true, skewX: 0 },
  },
  {
    name: 'Rings',
    params: { cellWidth: 36, cellHeight: 36, gapX: 4, gapY: 4, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'ring',       cornerMerge: true, skewX: 0, shapeWeight: 35 },
  },
  {
    name: 'Cross',
    params: { cellWidth: 40, cellHeight: 40, gapX: 4, gapY: 4, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'plus',       cornerMerge: true, skewX: 0, shapeWeight: 40 },
  },
  {
    name: 'Honeycomb',
    params: { cellWidth: 40, cellHeight: 44, gapX: 2, gapY: 0, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'hexagon',    cornerMerge: true, skewX: 0 },
  },
  {
    name: 'Halftone',
    params: { cellWidth: 36, cellHeight: 36, gapX: 2, gapY: 2, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'halftone',   cornerMerge: true, skewX: 0 },
  },
  {
    name: 'Slope',
    params: { cellWidth: 40, cellHeight: 40, gapX: 0, gapY: 0, cornerRadius: 12, innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'slope',      cornerMerge: true, skewX: 0 },
  },
  {
    name: 'Stripes',
    params: { cellWidth: 40, cellHeight: 40, gapX: 0, gapY: 0, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'diagonal',   cornerMerge: true, skewX: 0, shapeWeight: 45 },
  },
  {
    name: 'Mosaic',
    params: { cellWidth: 30, cellHeight: 30, gapX: 8, gapY: 8, cornerRadius: 2,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'tile',       cornerMerge: true, skewX: 0 },
  },
  {
    name: 'LCD',
    params: { cellWidth: 30, cellHeight: 34, gapX: 4, gapY: 4, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'tile',       cornerMerge: true, skewX: 0, showOff: true },
  },
  {
    name: 'Open',
    params: { cellWidth: 36, cellHeight: 36, gapX: 4, gapY: 4, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'open',       cornerMerge: true, skewX: 0, shapeWeight: 25 },
  },
  {
    name: 'Dashed',
    params: { cellWidth: 36, cellHeight: 36, gapX: 6, gapY: 6, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'dash',       cornerMerge: true, skewX: 0, shapeWeight: 35 },
  },
  {
    name: 'Fine',
    params: { cellWidth: 40, cellHeight: 40, gapX: 0, gapY: 0, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'rect',       cornerMerge: true, skewX: 0, dotSize: 40 },
  },
  {
    name: 'Pinpoint',
    params: { cellWidth: 36, cellHeight: 36, gapX: 2, gapY: 2, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'circle',     cornerMerge: true, skewX: 0, dotSize: 60, showOff: true },
  },
  {
    name: '7-Segment',
    params: { cellWidth: 40, cellHeight: 40, gapX: 3, gapY: 3, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'seg7',       cornerMerge: true, skewX: -6, showOff: true },
  },
  {
    name: '16-Segment',
    params: { cellWidth: 40, cellHeight: 40, gapX: 3, gapY: 3, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'seg16',      cornerMerge: true, skewX: 0, showOff: true, shapeWeight: 35 },
  },
];

// Params presets don't always list — reset so one preset's effect doesn't leak into the next.
const PRESET_RESETS = { outline: false, shapeWeight: 50, showOff: false, dotSize: 100, diagFill: false };

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
  { key: 'cornerMerge',    label: 'Join corners',    type: 'checkbox', hint: 'Flatten corners where adjacent cells meet (smoother connected strokes)' },
  { key: 'lockNodeRadius', label: 'Lock Node Radius', type: 'checkbox', hint: 'Lock circular node to half the smallest cell side (matches prototype). Only applies to Nodes shape.' },
  { key: 'skewX',        label: 'Skew',           min: -30, max: 30,  step: 1, type: 'range',    hint: 'Italic slant angle in degrees (pure vector transform, exports correctly)' },
  { key: 'dotSize',      label: 'Pixel fill %',       min: 10,  max: 100, step: 1, type: 'range',    hint: 'Draw each pixel at this % of its cell — thins joined strokes, shrinks separate dots' },
  { key: 'shapeWeight',  label: 'Stroke weight',   min: 5,   max: 95,  step: 1, type: 'range',    hint: 'Ring thickness, cross arm width or stripe width (% of cell)' },
  { key: 'showOff',      label: 'Unlit Pixels',                                 type: 'checkbox', hint: 'Draw OFF cells in a dim color (LED / dot-matrix board look)' },
  { key: 'offColor',     label: 'Unlit Color',                                  type: 'color',    hint: 'Color of the unlit (OFF) cells' },
];

const PARAM_GROUPS = [
  { label: 'Grid',     keys: ['cols', 'rows'],                                                   open: true  },
  { label: 'Cell',     keys: ['cellWidth', 'cellHeight', 'dotSize'],                                         open: true  },
  { label: 'Gap',      keys: ['gapX', 'gapY'],                                                    open: false  },
  { label: 'Rounding', keys: ['cornerRadius', 'bridgeRadius', 'cornerMerge', 'lockNodeRadius'],                    open: false  },
  { label: 'Style',    keys: ['shapeWeight', 'diagFill', 'diagWidth', 'outline', 'outlineWidth', 'outlineColor', 'skewX', 'showOff', 'offColor'], open: false  },
  { label: 'Color',    keys: ['fgColor', 'bgColor'],                                              open: true  },
  { label: 'Export',   keys: ['padding'],                                          open: false },
];

function buildParamControls() {
  const panel = document.getElementById('params-panel');
  panel.innerHTML = '<h2>Parameters</h2>';

  // ── Character styles ───────────────────────
  const charStyleSection = document.createElement('div');
  charStyleSection.className = 'presets-section';

  const charStyleLabel = document.createElement('div');
  charStyleLabel.className = 'presets-label';
  charStyleLabel.textContent = 'Base Characters';
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

  charStyleSection.appendChild(Object.assign(document.createElement('p'), {className: 'control-hint', textContent: 'Replaces all character drawings and may change the grid size.'}));
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
    btn.dataset.preset = preset.name;
    btn.title = preset.name + '\n' + Object.entries(preset.params)
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

  for (const [shape, label] of [
    ['rect','Rect'],['circle','Circle'],['nodes','Nodes'],['horizontal','Horizontal'],['vertical','Vertical'],['pixel','Pixel'],
    ['diamond','Diamond'],['ring','Ring'],['plus','Cross'],['hexagon','Hexagon'],['diagonal','Diagonal'],['halftone','Halftone'],
    ['slope','Slope'],['tile','Tile'],['open','Open'],['dash','Dash'],['seg7','7-Seg'],['seg16','16-Seg'],
  ]) {
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

    const hdr = document.createElement('button');
    hdr.className = 'param-section-hdr';
    hdr.innerHTML = `<span class="param-section-label">${group.label}</span><span class="param-section-arrow">▾</span>`;
    // Accordion behaviour is attached after all controls are built.

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
        numInput.setAttribute('aria-label', def.label);
        numInput.className = 'param-num';
        numInput.dataset.key = def.key;
        numInput.min = def.min;
        numInput.max = def.max;
        numInput.step = def.step;
        numInput.value = state.params[def.key];

        // One undo step per drag: opened on the first input, closed on change
        slider.addEventListener('input', () => {
          beginParamEdit(def.key);
          numInput.value = slider.value;
          const badge = document.getElementById(`param-val-${def.key}`);
          if (badge) badge.textContent = slider.value;
          if (def.hint) slider.title = `${def.hint} (${slider.value})`;
          applyParam(def.key, Number(slider.value));
        });
        slider.addEventListener('change', endParamEdit);
        numInput.addEventListener('change', () => {
          const v = Math.min(def.max, Math.max(def.min, Number(numInput.value)));
          slider.value = v;
          numInput.value = v;
          const badge = document.getElementById(`param-val-${def.key}`);
          if (badge) badge.textContent = v;
          beginParamEdit(def.key);
          applyParam(def.key, v);
          endParamEdit();
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
        picker.addEventListener('input', () => {
          beginParamEdit(def.key);
          applyParam(def.key, picker.value);
        });
        picker.addEventListener('change', endParamEdit);
        wrap.appendChild(picker);

      } else if (def.type === 'checkbox') {
        const row = document.createElement('div');
        row.className = 'param-checkbox-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `param-${def.key}`;
        checkbox.checked = !!state.params[def.key];
        checkbox.addEventListener('change', () => {
          beginParamEdit(def.key);
          applyParam(def.key, checkbox.checked);
          endParamEdit();
        });

        label.textContent = def.label;
        if (def.hint) {
          const hint = Object.assign(document.createElement('p'), {id: `hint-${def.key}`, className: 'control-hint', textContent: def.hint});
          checkbox.setAttribute('aria-describedby', hint.id);
          wrap.appendChild(hint);
        }
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
  defaultBtn.textContent = 'Regenerate characters';
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
  autoLabel.textContent = 'Auto-size height (px)';
  autoLabel.htmlFor = 'autoscale-height';
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
  clearPreset();
  const { cols, rows } = state.params;

  // Solve: targetHeight = rows * cellH + (rows-1) * gap,  gap = cellH * gapRatio
  const gapRatio   = 0.1;
  const cellH = Math.max(4, Math.round(targetHeight / (rows + (rows - 1) * gapRatio)));
  const gap   = Math.max(0, Math.round(cellH * gapRatio));
  const cellW = cellH;
  const radius = Math.min(Math.floor(cellH / 2), Math.round(cellH * 0.28));
  const dw     = Math.round(cellH * 0.28);

  saveUndo();
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
  offerProjectUndo('Replaced base characters', undoStack[undoStack.length - 1]);
  const styleCols = style.cols ?? FONT_COLS;
  const styleRows = style.rows ?? FONT_ROWS;
  // While the grid is still some style's native size (user hasn't customised it),
  // switch to this style's native grid — e.g. Condensed → 4×7, back to 5×7 after.
  const onNativeGrid = CHAR_STYLES.some(s =>
    (s.cols ?? FONT_COLS) === state.params.cols && (s.rows ?? FONT_ROWS) === state.params.rows);
  if (onNativeGrid) {
    if (state.params.cols !== styleCols || state.params.rows !== styleRows) clearPreset();
    state.params.cols = styleCols;
    state.params.rows = styleRows;
    syncParamControls();
  }
  const { cols, rows } = state.params;
  // Apply style glyphs for all chars in state — fall back to the closest built-in
  // map (then FONT_DATA) for chars the style doesn't define.
  const fallbackMap = bestFontSource(styleCols, styleRows);
  for (const char of Object.keys(state.glyphs)) {
    let srcData = style.data[char], sc = styleCols, sr = styleRows;
    if (!srcData && fallbackMap.data[char]) {
      srcData = fallbackMap.data[char]; sc = fallbackMap.cols; sr = fallbackMap.rows;
    } else if (!srcData) {
      srcData = FONT_DATA[char]; sc = FONT_COLS; sr = FONT_ROWS;
    }
    if (!srcData) continue;
    state.glyphs[char] = (sc === cols && sr === rows)
      ? [...srcData]
      : scaleGlyph(srcData, sc, sr, cols, rows);
  }
  setActiveCharStyle(style.name);
  buildGridEditor();
  render();
}

function applyCellShape(shape) {
  clearPreset();
  saveUndo();
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
  clearPreset();
  saveUndo();
  Object.assign(state.params, PRESET_RESETS, preset.params);
  document.querySelectorAll('.preset-btn').forEach(b => { if (b.dataset.preset === preset.name) b.classList.add('active'); });
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
  clearPreset();
  const oldCols = state.params.cols;
  const oldRows = state.params.rows;
  state.params[key] = value;

  if (key === 'cols' || key === 'rows') {
    const base = paramEdit && paramEdit.base;
    if (base) {
      // Resize from the drag-start glyphs so shrinking then growing loses nothing
      for (const char of Object.keys(base.glyphs)) {
        state.glyphs[char] = resizeGlyph(base.glyphs[char], base.cols, base.rows,
          state.params.cols, state.params.rows);
      }
    } else {
      resizeAllGlyphs(oldCols, oldRows, state.params.cols, state.params.rows);
    }
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
      // Reflect the forced 0 in the UI (slider, number box, badge)
      const slider = document.getElementById(`param-${key}`);
      const num = document.querySelector(`.param-num[data-key="${key}"]`);
      const badge = document.getElementById(`param-val-${key}`);
      if (slider) slider.value = 0;
      if (num) num.value = 0;
      if (badge) badge.textContent = 0;
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
  updateConditionalParams();

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
  syncGridAccessibility();
  syncButtonStates();
  const { cols, rows } = state.params;
  const data = state.glyphs[state.currentChar];
  scheduleAutosave();   // every edit / param change / char switch passes through here
  if (!data) return;
  document.getElementById('editor-preview').innerHTML =
    generateGlyphSVG(data, cols, rows, state.params, state.currentChar);
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
        if (data) cell.innerHTML = generateGlyphSVG(data, cols, rows, previewParams, onlyChar);
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
      const cell = document.createElement('button');
      cell.setAttribute('aria-label', `Edit character ${char}`);
      cell.className = 'preview-char';
      cell.dataset.char = char;
      cell.title = char;
      cell.addEventListener('click', () => selectChar(char));
      cell.innerHTML = generateGlyphSVG(data, cols, rows, previewParams, char);
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

  const label = document.createElement('label');
  label.htmlFor = 'type-tester-input';
  label.className = 'type-tester-label';
  label.textContent = 'Text';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'type-tester-input';
  input.className = 'type-tester-input';
  input.placeholder = 'Type to preview…';
  input.value = 'HELLO WORLD';
  input.addEventListener('input', renderTypeTester);

  const sizeLabel = document.createElement('label');
  sizeLabel.htmlFor = 'type-size';
  sizeLabel.className = 'type-tester-label';
  sizeLabel.textContent = 'Size';

  const sizeInput = document.createElement('input');
  sizeInput.type = 'range';
  sizeInput.id = 'type-size';
  sizeInput.min = 30;
  sizeInput.max = 200;
  sizeInput.value = 60;
  sizeInput.title = 'Preview text size';
  sizeInput.style.cssText = 'width:72px;cursor:pointer;accent-color:var(--ui-accent);';
  sizeInput.addEventListener('input', renderTypeTester);

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export text SVG';
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

// Coalesce type tester re-renders to at most one per frame (pixel drags).
let typeTesterFrame = 0;
function scheduleTypeTester() {
  if (typeTesterFrame) return;
  if (typeof requestAnimationFrame !== 'function') { renderTypeTester(); return; }
  typeTesterFrame = requestAnimationFrame(() => {
    typeTesterFrame = 0;
    renderTypeTester();
  });
}

function renderTypeTester() {
  const input   = document.getElementById('type-tester-input');
  const preview = document.getElementById('type-tester-preview');
  if (!input || !preview) return;
  const svg = generateTextSVG(state.glyphs, input.value, state.params);
  preview.innerHTML = svg || '';
  const height = Number(document.getElementById('type-size')?.value || 60);
  preview.style.height = `${height}px`;
  const image = preview.querySelector('svg');
  if (image) image.style.height = `${height}px`;
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
  const svg = generateGlyphSVG(state.glyphs[state.currentChar], cols, rows, state.params, state.currentChar);
  downloadSVG(glyphFilename(state.currentChar), svg);
  showToast(`Exported ${glyphFilename(state.currentChar)}`);
}

function exportAll() {
  const { cols, rows } = state.params;
  const entries = Object.keys(state.glyphs).map(char => ({
    name: glyphFilename(char),
    data: generateGlyphSVG(state.glyphs[char], cols, rows, state.params, char),
  }));
  const url = URL.createObjectURL(generateZIP(entries));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pixel-font-glyphs.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${entries.length} glyphs in pixel-font-glyphs.zip`);
}

function exportCurrentPNG() {
  const { cols, rows } = state.params;
  const svg = generateGlyphSVG(state.glyphs[state.currentChar], cols, rows, state.params, state.currentChar);
  const scale = Math.max(1, Math.min(16, parseInt(document.getElementById('png-scale').value) || 4));
  document.getElementById('png-scale').value = scale;
  const filename = glyphFilename(state.currentChar, 'png');
  downloadPNG(filename, svg, scale).then(() => showToast(`Exported ${filename} ×${scale}`)).catch(() => showToast('PNG rasterising failed', 0));
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

function showToast(msg, duration = 6000, action) {
  const container = document.getElementById('toast-container');
  const toast = Object.assign(document.createElement('div'), {className: 'toast', textContent: msg + ' '});
  container.appendChild(toast);
  if (action) {
    const button = Object.assign(document.createElement('button'), {textContent: 'Undo'});
    button.addEventListener('click', () => { action(); toast.remove(); });
    toast.appendChild(button);
  }
  if (!duration) {
    // Persistent (error) toasts need an explicit way to dismiss them.
    const close = Object.assign(document.createElement('button'), {textContent: '×', className: 'toast-close'});
    close.setAttribute('aria-label', 'Dismiss notification');
    close.addEventListener('click', () => toast.remove());
    toast.appendChild(close);
  }
  // Keep an actionable notification available while keyboard or pointer is inside it.
  let timer;
  const start = () => { if (duration) timer = setTimeout(() => toast.remove(), duration); };
  toast.addEventListener('focusin', () => clearTimeout(timer));
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  toast.addEventListener('focusout', start);
  toast.addEventListener('mouseleave', start);
  start();
}

function setSaveStatus(text) {
  const status = document.getElementById('autosave-status');
  if (status) status.textContent = text;
}
function clearPreset() {
  document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
}

function toggleTheme() {
  const isLight = document.documentElement.dataset.theme === 'light';
  const goingLight = !isLight;
  document.documentElement.dataset.theme = goingLight ? 'light' : '';
  try { localStorage.setItem('pfg-theme', goingLight ? 'light' : ''); } catch {}
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = goingLight ? '☾' : '☀';


}

// ─────────────────────────────────────────────
//  Reset
// ─────────────────────────────────────────────

function resetCurrentChar() {
  saveUndo();
  offerProjectUndo('Reset character', undoStack[undoStack.length - 1]);
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
    scheduleTypeTester();
  }
}

function resetAll() {
  saveUndo();
  offerProjectUndo('Regenerated characters', undoStack[undoStack.length - 1]);
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

/**
 * Header "Reset All": back to factory state (default params, Classic 5×7
 * glyphs). With autosave a page refresh no longer gives a clean slate, so this
 * is the way to get one. It is a single undo step, and the autosave is
 * overwritten right away. ("Generate Default Characters" still calls resetAll,
 * which only regenerates glyphs for the current grid.)
 */
function resetEverything() {
  clearPreset();
  saveUndo();
  offerProjectUndo('Reset project', undoStack[undoStack.length - 1]);
  Object.assign(state.params, DEFAULT_PARAMS);
  state.glyphs = {};
  for (const char of Object.keys(FONT_DATA)) state.glyphs[char] = [...FONT_DATA[char]];
  syncParamControls();
  setActiveCharStyle('Classic');
  const input = document.getElementById('autoscale-height');
  if (input) input.value = computeCharHeight();
  buildGridEditor();
  render();
  writeAutosave();
}

// ─────────────────────────────────────────────
//  Styles — save/load/delete via localStorage
// ─────────────────────────────────────────────

const STYLES_KEY = 'pfg-styles';

function readStyles() {
  try { const styles = JSON.parse(localStorage.getItem(STYLES_KEY)); return Array.isArray(styles) ? styles : []; }
  catch { return []; }
}

function writeStyles(styles) {
  try { localStorage.setItem(STYLES_KEY, JSON.stringify(styles)); return true; }
  catch { showToast('Could not save styles on this device', 0); return false; }
}

function saveCurrentStyle(name) {
  name = name.trim();
  if (!name) return;
  const styles = readStyles();
  const before = structuredClone(styles);
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
  if (!writeStyles(styles)) return;
  renderStylesList();
  showToast(idx >= 0 ? 'Replaced saved style' : 'Saved style', 6000, () => restoreStyles(before));
}

function applyStyle(saved) {
  clearPreset();
  saved = sanitizeStyle(saved, state.params);
  if (!saved) return;
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

  if (state.params.cols !== oldCols || state.params.rows !== oldRows) {
    resizeAllGlyphs(oldCols, oldRows, state.params.cols, state.params.rows);
  }
  if (saved.glyphs) {
    for (const [char, data] of Object.entries(saved.glyphs)) {
      state.glyphs[char] = [...data];
    }
  }

  buildGridEditor();
  syncParamControls();
  syncShapeButtons();
  render();
}

function deleteStyle(name) {
  const before = readStyles();
  if (!writeStyles(before.filter(s => s.name !== name))) return;
  renderStylesList();
  showToast('Deleted saved style', 6000, () => restoreStyles(before));
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
      if (!Array.isArray(imported)) throw new Error('Expected an array');
      const existing = readStyles();
      const before = structuredClone(existing);
      let count = 0;
      for (const candidate of imported) {
        const entry = sanitizeStyle(candidate, state.params);
        if (!entry || !entry.name) continue;
        count++;
        const idx = existing.findIndex(s => s.name === entry.name);
        if (idx >= 0) existing[idx] = entry;
        else existing.push(entry);
      }
      if (!writeStyles(existing)) return;
      renderStylesList();
      showToast(`Imported ${count} styles, skipped ${imported.length - count}`, 6000, () => restoreStyles(before));
    } catch { showToast('Could not import styles: invalid JSON or style data', 0); }
  };
  reader.onerror = () => showToast('Could not read styles file', 0);
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
  const spacing = document.getElementById('tester-spacing');
  if (spacing) spacing.value = state.params.charSpacing;
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

  // shapeWeight only drives ring / plus / diagonal; offColor only with showOff
  const weightRow = document.querySelector('.param-row[data-param-key="shapeWeight"]');
  if (weightRow) weightRow.style.display = ['ring', 'plus', 'diagonal', 'open', 'dash', 'seg7', 'seg16'].includes(state.params.cellShape) ? '' : 'none';
  const offRow = document.querySelector('.param-row[data-param-key="offColor"]');
  if (offRow) offRow.style.display = state.params.showOff ? '' : 'none';

  const shape = state.params.cellShape;
  const visible = {cornerRadius: ['rect','tile','slope'].includes(shape) || (isNodes && !state.params.lockNodeRadius), cornerMerge: shape === 'rect', bridgeRadius: shape === 'rect', diagWidth: state.params.diagFill};
  for (const [key, show] of Object.entries(visible)) {
    const row = document.querySelector(`[data-param-key="${key}"]`);
    if (row) row.style.display = show ? '' : 'none';
  }
  document.getElementById('grid-editor').classList.toggle('segment-grid', ['seg7','seg16'].includes(shape));
  const segNote = document.getElementById('segment-note');
  if (segNote) segNote.hidden = !['seg7', 'seg16'].includes(state.params.cellShape);
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
  fileInput.setAttribute('aria-label', 'Import saved styles JSON');
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
    delBtn.setAttribute('aria-label', `Delete style ${style.name}`);
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
  let savedTheme = '';
  try { savedTheme = localStorage.getItem('pfg-theme') || ''; } catch {}
  document.documentElement.dataset.theme = savedTheme;
  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) themeBtn.textContent = savedTheme === 'light' ? '☾' : '☀';


  init();
  buildEditorToolbar();
  initEditorEvents();
  enhanceUI();

  document.getElementById('btn-export').addEventListener('click', exportCurrent);
  document.getElementById('btn-export-all').addEventListener('click', exportAll);
  document.getElementById('btn-export-png').addEventListener('click', exportCurrentPNG);
  document.getElementById('btn-export-sprite').addEventListener('click', exportSprite);
  document.getElementById('btn-reset').addEventListener('click', resetCurrentChar);
  document.getElementById('btn-reset-all').addEventListener('click', resetEverything);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  document.documentElement.style.setProperty('--fg', state.params.fgColor);
  document.documentElement.style.setProperty('--bg', state.params.bgColor);

  // Flush a pending autosave when the page is closed / reloaded
  window.addEventListener('pagehide', () => { if (autosaveTimer) writeAutosave(); });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    // Leave native undo to text fields (type tester, style name, number boxes)
    const t = e.target;
    if (t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
        (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'color', 'button'].includes(t.type)))) return;
    const key = e.key.toLowerCase();   // Shift turns 'z' into 'Z'
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  });
});

function offerProjectUndo(message, snapshot) {
  showToast(message, 6000, () => {
    saveUndo();
    restoreSnapshot(snapshot);
    clearPreset();
    buildGridEditor();
    render();
  });
}
function restoreStyles(styles) {
  if (writeStyles(styles)) renderStylesList();
}

// Single grid tab stop + aria-activedescendant: arrows move the active cell,
// Space/Enter edits it. Row wrappers preserve the visual CSS grid geometry.
function syncGridAccessibility() {
  const editor = document.getElementById('grid-editor');
  editor.setAttribute('role', 'grid');
  editor.setAttribute('aria-label', `Pixel editor for ${state.currentChar}`);
  editor.setAttribute('aria-describedby', 'editor-instructions');
  editor.setAttribute('aria-rowcount', state.params.rows);
  editor.setAttribute('aria-colcount', state.params.cols);
  editor.querySelectorAll('.grid-cell').forEach(cell => {
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    cell.id = `pixel-${r}-${c}`;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-rowindex', r + 1);
    cell.setAttribute('aria-colindex', c + 1);
    cell.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}, ${cell.classList.contains('on') ? 'on' : 'off'}`);
    cell.setAttribute('aria-selected', String(cell.classList.contains('on')));
  });
  editor.setAttribute('aria-activedescendant', `pixel-${focusedCell.r}-${focusedCell.c}`);
}
function syncButtonStates() {
  document.querySelectorAll('.char-btn,.char-style-btn,.cell-shape-btn,[data-brush],#btn-symmetry,#btn-guides,[data-preset]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.classList.contains('active')));
  });
}
function makeDisclosure(section, header, content, key, defaultOpen = true) {
  let open = defaultOpen;
  try { const saved = localStorage.getItem(`pfg-panel-${key}`); if (saved !== null) open = saved === 'true'; } catch {}
  content.id ||= `panel-${key}`;
  header.setAttribute('aria-controls', content.id);
  const update = () => {
    header.setAttribute('aria-expanded', String(open));
    content.hidden = !open;
    section.classList.toggle('collapsed', !open);
  };
  header.addEventListener('click', () => {
    open = !open;
    update();
    try { localStorage.setItem(`pfg-panel-${key}`, String(open)); } catch {}
  });
  update();
}
function enhanceUI() {
  document.querySelectorAll('.param-section').forEach((section, i) => {
    makeDisclosure(section, section.querySelector('.param-section-hdr'), section.querySelector('.param-section-body'), `param-${i}`, PARAM_GROUPS[i].open);
  });
  document.querySelectorAll('.presets-section').forEach((section, i) => {
    const label = section.querySelector('.presets-label');
    const header = Object.assign(document.createElement('button'), {className: 'param-section-hdr', textContent: label.textContent});
    label.replaceWith(header);
    const content = document.createElement('div');
    while (header.nextSibling) content.appendChild(header.nextSibling);
    section.appendChild(content);
    makeDisclosure(section, header, content, `catalogue-${i}`);
  });
  const swap = Object.assign(document.createElement('button'), {textContent: 'Swap colours'});
  swap.addEventListener('click', () => {
    saveUndo();
    [state.params.fgColor, state.params.bgColor] = [state.params.bgColor, state.params.fgColor];
    clearPreset(); syncParamControls(); render();
  });
  document.getElementById('param-bgColor').parentElement.after(swap);
  const nameLabel = Object.assign(document.createElement('label'), {htmlFor: 'style-name-input', textContent: 'Style name'});
  document.querySelector('.styles-save-row').before(nameLabel);
  const spacing = document.createElement('label');
  spacing.textContent = 'Char spacing ';
  const spacingInput = Object.assign(document.createElement('input'), {type: 'number', min: '0', max: '120', value: state.params.charSpacing, id: 'tester-spacing', className: 'param-num'});
  spacing.htmlFor = spacingInput.id;
  spacingInput.addEventListener('change', () => { saveUndo(); applyParam('charSpacing', Math.max(0, Math.min(120, Number(spacingInput.value) || 0))); });
  spacing.appendChild(spacingInput);
  document.querySelector('.type-tester-bar').appendChild(spacing);
  for (const [id, title, content] of [['type-tester', 'Type tester', null], ['preview-panel', 'Font preview', 'preview-strip']]) {
    const section = document.getElementById(id);
    const header = Object.assign(document.createElement('button'), {textContent: title, className: 'panel-toggle'});
    const body = document.createElement('div');
    body.className = 'panel-content';
    if (content) body.appendChild(document.getElementById(content));
    else while (section.firstChild) body.appendChild(section.firstChild);
    if (content) document.getElementById('preview-header').remove();
    section.prepend(header); section.appendChild(body);
    makeDisclosure(section, header, body, id);
  }
  // Icon/abbreviated buttons get their tooltip as accessible name; preset tooltips list
  // every param, so presets keep their visible name instead.
  document.querySelectorAll('button').forEach(b => {
    if (b.dataset.preset) b.setAttribute('aria-label', b.dataset.preset);
    else if (b.title) b.setAttribute('aria-label', b.title);
  });
  document.getElementById('btn-theme').setAttribute('aria-label', 'Toggle interface light/dark theme');
  document.querySelectorAll('.preset-btn').forEach(b => { if (!b.dataset.preset) b.title = b.textContent; });
  syncButtonStates();
  document.addEventListener('click', syncButtonStates);
  document.addEventListener('keydown', () => queueMicrotask(syncButtonStates));
  // Reflect class updates made by undo, keyboard edits and live drawing as well.
  new MutationObserver(syncButtonStates).observe(document.getElementById('params-panel'), {subtree: true, attributes: true, attributeFilter: ['class']});
}
