// app.js — state management, UI, and event handling

const $ = (id) => document.getElementById(id);

// ─────────────────────────────────────────────
//  Undo / Redo
// ─────────────────────────────────────────────

const MAX_UNDO = 60;
const undoStack = [];
const redoStack = [];

function copyGlyphs(glyphs) {
  return Object.fromEntries(Object.entries(glyphs).map(([k, v]) => [k, [...v]]));
}

// Full editor snapshot: all params (grid size, shape, colors…) + drawings.
function glyphSnapshot() {
  return {
    params: { ...state.params },
    glyphs: copyGlyphs(state.glyphs),
    pristine: copyGlyphs(state.pristine),
    charStyle: state.charStyle,
    look: state.look,
  };
}

function restoreSnapshot(snap) {
  state.glyphs = copyGlyphs(snap.glyphs);
  state.pristine = copyGlyphs(snap.pristine);
  Object.assign(state.params, snap.params);
  if (!state.glyphs[state.currentChar]) state.currentChar = ALL_CHARS.find(ch => state.glyphs[ch]) || 'A';
  syncParamControls();
  setActiveCharStyle(snap.charStyle);
  setLook(snap.look);
  syncFitHeight();
}

// An in-progress param edit (slider drag, color picker drag). One undo step is
// saved when it starts; `base` keeps the pristine drawings so cols/rows resizes
// are computed from the drag-start state instead of cumulatively.
let paramEdit = null;

function beginParamEdit(key) {
  if (paramEdit && paramEdit.key === key) return;
  saveUndo();
  paramEdit = {
    key,
    base: {
      cols: state.params.cols, rows: state.params.rows,
      glyphs: copyGlyphs(state.glyphs), pristine: copyGlyphs(state.pristine),
    },
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
  restoreSnapshot(undoStack.pop());
  refreshAll();
  updateUndoUI();
}

function redo() {
  if (!redoStack.length) return;
  paramEdit = null;
  undoStack.push(glyphSnapshot());
  restoreSnapshot(redoStack.pop());
  refreshAll();
  updateUndoUI();
}

function updateUndoUI() {
  $('btn-undo').disabled = undoStack.length === 0;
  $('btn-redo').disabled = redoStack.length === 0;
}

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────

const state = {
  currentChar: 'A',
  charStyle: 'Classic',     // the letterform set the drawings came from
  look: 'Rounded',          // the look last applied, or null once it is customised
  fontName: 'Pixel Font',
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
  pristine: {},   // drawings as last generated; a drawing that differs is marked as edited
};

// Factory defaults, captured before any restore (used by Reset project).
const DEFAULT_PARAMS = { ...state.params };
const DEFAULT_FONT_NAME = state.fontName;

// ─────────────────────────────────────────────
//  Character groups
// ─────────────────────────────────────────────

const CHAR_GROUPS = [
  { label: 'Uppercase',   chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') },
  { label: 'Lowercase',   chars: 'abcdefghijklmnopqrstuvwxyz'.split('') },
  { label: 'Digits',      chars: '0123456789'.split('') },
  { label: 'Accented capitals',  chars: [...'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ'] },
  { label: 'Accented lowercase', chars: [...'ßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ'] },
  { label: 'Punctuation', chars: ['.', ',', '!', '?', ':', ';', '-', "'", '(', ')', ...'¡¿–—‘’“”„…•·«»'] },
  { label: 'Symbols',     chars: ['@','#','$','%','&','*','+','=','/','\\','<','>','[',']','{','}','"','~','^','_','|','`', ...'¢£¤¥€¦§¨´¯¸ªº°¹²³±×÷¬µ¶≠≤≥≈∞'] },
  { label: 'Arrows and shapes', chars: [...'←↑→↓↔↕■□▲▼◀▶●○◆♥✓'] },
  { label: 'Box drawing', chars: [...'─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬'] },
  { label: 'Blocks',      chars: [...'█▀▄▌▐░▒▓'] },
  { label: 'Powerline',   chars: ['\uE0A0', '\uE0A1', '\uE0A2', '\uE0B0', '\uE0B1', '\uE0B2', '\uE0B3'] },
];
const ALL_CHARS = CHAR_GROUPS.flatMap(g => g.chars);

// Private-use characters have no shape of their own in the interface font, so they
// are shown by name (headings, screen readers) and by code point (glyph map).
const CHAR_NAMES = {
  '\uE0A0': 'Branch', '\uE0A1': 'Line number', '\uE0A2': 'Lock',
  '\uE0B0': 'Right separator', '\uE0B1': 'Right thin separator',
  '\uE0B2': 'Left separator', '\uE0B3': 'Left thin separator',
};
const charName = (char) => CHAR_NAMES[char] || char;
const charKey = (char) => CHAR_NAMES[char] ? char.codePointAt(0).toString(16).toUpperCase() : char;

// ─────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────

function init() {
  for (const char of Object.keys(FONT_DATA)) state.glyphs[char] = [...FONT_DATA[char]];
  state.pristine = copyGlyphs(state.glyphs);

  let restored = null;
  try { restored = parseProject(JSON.parse(localStorage.getItem(AUTOSAVE_KEY))); } catch {}
  if (restored) applyProject(restored);

  buildCharMap();
  buildEditorToolbar();
  buildParamControls();
  buildStylesUI();
  buildTypeTester();
  syncParamControls();
  setActiveCharStyle(state.charStyle);
  setLook(state.look);
  $('font-name').value = state.fontName;
  refreshAll();
  if (restored) showToast('Restored your last session', 3000);
}

/** Redraw everything that depends on the drawings or the look. */
function refreshAll() {
  selectChar(state.currentChar);
  render();
}

// ─────────────────────────────────────────────
//  Autosave (localStorage) and project files
// ─────────────────────────────────────────────

const AUTOSAVE_KEY = 'pfg-autosave';
const AUTOSAVE_DELAY = 500;
let autosaveTimer = null;

function projectRecord() {
  return {
    app: 'pixel-font-generator',
    version: 1,
    fontName: state.fontName,
    params: state.params,
    glyphs: state.glyphs,
    pristine: state.pristine,
    currentChar: state.currentChar,
    charStyle: state.charStyle,
    look: state.look,
  };
}

function writeAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(projectRecord()));
    setSaveStatus('Saved in this browser');
  } catch { setSaveStatus('Not saved: browser storage is full or blocked'); }
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  setSaveStatus('Saving…');
  autosaveTimer = setTimeout(writeAutosave, AUTOSAVE_DELAY);
}

function setSaveStatus(text) { $('autosave-status').textContent = text; }

/**
 * Validate a saved record (autosave or project file). Returns a clean record,
 * or null when it is not usable. Nothing in `state` is touched.
 */
function parseProject(saved) {
  if (!saved || typeof saved !== 'object' || !saved.params || !saved.glyphs) return null;
  const clean = sanitizeStyle({ params: saved.params, glyphs: saved.glyphs }, DEFAULT_PARAMS);
  if (!clean || !clean.glyphs || !Number.isInteger(clean.params.cols) || !Number.isInteger(clean.params.rows)) return null;

  // Migrate legacy saves: 'gap' → gapX/gapY
  const params = { ...DEFAULT_PARAMS, ...clean.params };
  if (params.gap != null && clean.params.gapX == null) { params.gapX = params.gap; params.gapY = params.gap; }
  delete params.gap;
  const { cols, rows } = params;

  // Characters missing from the save get the built-in drawing scaled to its grid
  const glyphs = clean.glyphs;
  const src = bestFontSource(cols, rows);
  for (const char of Object.keys(FONT_DATA)) {
    if (glyphs[char]) continue;
    const srcData = src.data[char] || FONT_DATA[char];
    const sc = src.data[char] ? src.cols : FONT_COLS;
    const sr = src.data[char] ? src.rows : FONT_ROWS;
    glyphs[char] = (sc === cols && sr === rows) ? [...srcData] : scaleGlyph(srcData, sc, sr, cols, rows);
  }

  const cleanPristine = saved.pristine && sanitizeStyle({ params: saved.params, glyphs: saved.pristine }, DEFAULT_PARAMS);
  const pristine = copyGlyphs(glyphs);
  if (cleanPristine && cleanPristine.glyphs) Object.assign(pristine, cleanPristine.glyphs);

  return {
    params, glyphs, pristine,
    currentChar: typeof saved.currentChar === 'string' && glyphs[saved.currentChar] ? saved.currentChar : 'A',
    charStyle: CHAR_STYLES.some(s => s.name === saved.charStyle) ? saved.charStyle : 'Classic',
    look: DEFAULT_STYLES.some(s => s.name === saved.look) ? saved.look : null,
    fontName: typeof saved.fontName === 'string' && saved.fontName.trim() ? saved.fontName.trim().slice(0, 60) : DEFAULT_FONT_NAME,
  };
}

function applyProject(rec) {
  Object.assign(state.params, rec.params);
  state.glyphs = rec.glyphs;
  state.pristine = rec.pristine;
  state.currentChar = rec.currentChar;
  state.charStyle = rec.charStyle;
  state.look = rec.look;
  state.fontName = rec.fontName;
}

function saveProjectFile() {
  const json = JSON.stringify(projectRecord());
  const file = `${fileSlug(state.fontName)}.pixelfont.json`;
  downloadBlob(file, new Blob([json], { type: 'application/json;charset=utf-8' }));
  showToast(`Saved ${file}`);
}

function openProjectFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let rec = null;
    try { rec = parseProject(JSON.parse(reader.result)); } catch {}
    if (!rec) {
      showToast(`“${file.name}” is not a Pixel Font Generator project file. Your current project is unchanged.`, 0);
      return;
    }
    saveUndo();
    const before = undoStack[undoStack.length - 1], nameBefore = state.fontName;
    applyProject(rec);
    $('font-name').value = state.fontName;
    syncParamControls();
    setActiveCharStyle(state.charStyle);
    setLook(state.look);
    syncFitHeight();
    refreshAll();
    offerProjectUndo(`Opened ${file.name}`, before, () => { state.fontName = nameBefore; $('font-name').value = nameBefore; });
  };
  reader.onerror = () => showToast(`Could not read “${file.name}”. Your current project is unchanged.`, 0);
  reader.readAsText(file);
}

function fileSlug(name) {
  return (name || '').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pixel-font';
}

// ─────────────────────────────────────────────
//  Glyph map
// ─────────────────────────────────────────────

function buildCharMap() {
  const map = $('char-map');
  map.innerHTML = '';
  CHAR_GROUPS.forEach((group, gi) => {
    const section = document.createElement('div');
    section.className = 'char-group';
    const label = Object.assign(document.createElement('h3'), { className: 'char-group-label', id: `char-group-${gi}`, textContent: group.label });
    const grid = document.createElement('div');
    grid.className = 'char-grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-labelledby', label.id);
    for (const char of group.chars) {
      const btn = document.createElement('button');
      btn.className = 'char-btn';
      btn.dataset.char = char;
      btn.tabIndex = -1;
      btn.innerHTML = '<span class="char-thumb" aria-hidden="true"></span><span class="char-key" aria-hidden="true"></span>';
      btn.querySelector('.char-key').textContent = charKey(char);
      btn.addEventListener('click', () => selectChar(char));
      grid.appendChild(btn);
    }
    section.append(label, grid);
    map.appendChild(section);
  });

  // One tab stop for the whole map: arrow keys move between characters.
  map.addEventListener('keydown', (e) => {
    const cur = e.target.closest('.char-btn');
    if (!cur) return;
    const i = ALL_CHARS.indexOf(cur.dataset.char);
    let next = null;
    if (e.key === 'ArrowRight') next = ALL_CHARS[i + 1];
    else if (e.key === 'ArrowLeft') next = ALL_CHARS[i - 1];
    else if (e.key === 'Home') next = ALL_CHARS[0];
    else if (e.key === 'End') next = ALL_CHARS[ALL_CHARS.length - 1];
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') next = charInAdjacentRow(cur, e.key === 'ArrowDown' ? 1 : -1);
    else return;
    e.preventDefault();
    if (next) selectChar(next, true);
  });
}

function charButton(char) {
  return [...document.querySelectorAll('.char-btn')].find(b => b.dataset.char === char);
}

/** The character visually above or below, by position on screen. */
function charInAdjacentRow(btn, dir) {
  const from = btn.getBoundingClientRect();
  let best = null, bestScore = Infinity;
  for (const other of document.querySelectorAll('.char-btn')) {
    const r = other.getBoundingClientRect();
    const dy = (r.top - from.top) * dir;
    if (dy < 4) continue;
    const score = dy * 4 + Math.abs(r.left - from.left);
    if (score < bestScore) { bestScore = score; best = other; }
  }
  return best && best.dataset.char;
}

function isEdited(char) {
  const a = state.glyphs[char], b = state.pristine[char];
  return !!a && !!b && (a.length !== b.length || a.some((v, i) => v !== b[i]));
}

function selectChar(char, focusMap) {
  if (!state.glyphs[char]) return;
  state.currentChar = char;
  for (const b of document.querySelectorAll('.char-btn')) {
    const on = b.dataset.char === char;
    b.classList.toggle('active', on);
    b.tabIndex = on ? 0 : -1;
    if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  }
  const btn = charButton(char);
  if (btn) {
    btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focusMap) btn.focus();
  }
  buildGridEditor();
  renderEditorPreview();
}

function stepChar(dir) {
  const i = ALL_CHARS.indexOf(state.currentChar);
  selectChar(ALL_CHARS[(i + dir + ALL_CHARS.length) % ALL_CHARS.length]);
}

function updateCharHeading() {
  const char = state.currentChar;
  const code = char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  $('char-name').textContent = charName(char);
  $('char-meta').textContent = `U+${code} · ${ALL_CHARS.indexOf(char) + 1} of ${ALL_CHARS.length}${isEdited(char) ? ' · edited' : ''}`;
}

/** Params for the small neutral previews: the look, in interface colour. */
function thumbParams(params) {
  return {
    ...params,
    fgColor: 'currentColor', outlineColor: 'currentColor', bgColor: 'transparent',
    offColor: 'color-mix(in srgb, currentColor 22%, transparent)', padding: 0,
  };
}

function renderCharMap(onlyChar) {
  const { cols, rows } = state.params;
  const params = thumbParams(state.params);
  for (const btn of document.querySelectorAll('.char-btn')) {
    const char = btn.dataset.char;
    if (onlyChar && char !== onlyChar) continue;
    const data = state.glyphs[char];
    btn.hidden = !data;
    if (!data) continue;
    btn.querySelector('.char-thumb').innerHTML = generateGlyphSVG(data, cols, rows, params, char);
    const edited = isEdited(char);
    btn.classList.toggle('edited', edited);
    btn.setAttribute('aria-label', `Character ${charName(char)}${edited ? ', edited' : ''}`);
  }
}

// ─────────────────────────────────────────────
//  Editor tool state
// ─────────────────────────────────────────────

let drag          = null;    // { id, value, last } while a pointer is drawing
let symmetryMode  = false;
let fillMode      = false;
let brushSize     = 1;
let showGuides    = true;
let focusedCell   = { r: 0, c: 0 };
let clipboard     = null;
let clipboardCols = 0;
let clipboardRows = 0;

// ─────────────────────────────────────────────
//  Grid editor
// ─────────────────────────────────────────────

function buildGridEditor() {
  const { cols, rows } = state.params;
  const editor = $('grid-editor');
  editor.innerHTML = '';
  editor.style.setProperty('--cols', cols);
  editor.style.setProperty('--rows', rows);

  const data = state.glyphs[state.currentChar] || [];
  // Guides follow the letterform set, not the drawing in progress, so they stay put.
  const guides = showGuides ? detectMetrics(state.pristine, cols, rows) : null;
  // Keep keyboard focus inside the grid after a resize / undo
  focusedCell = {
    r: Math.max(0, Math.min(rows - 1, focusedCell.r)),
    c: Math.max(0, Math.min(cols - 1, focusedCell.c)),
  };

  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    const top = guides && (r === guides.capRow ? 'cap' : r === guides.xRow ? 'x' : '');
    const base = guides && r === guides.baselineRow - 1;

    const gutter = document.createElement('span');
    gutter.className = 'row-guide';
    gutter.setAttribute('aria-hidden', 'true');
    if (top) gutter.appendChild(Object.assign(document.createElement('i'), { className: 'g-top', textContent: top }));
    if (base) gutter.appendChild(Object.assign(document.createElement('i'), { className: 'g-base', textContent: 'base' }));
    row.appendChild(gutter);

    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.id = `pixel-${r}-${c}`;
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-rowindex', r + 1);
      cell.setAttribute('aria-colindex', c + 1);
      if (top) cell.dataset.guide = top;
      if (base) cell.dataset.base = '';
      if (r === focusedCell.r && c === focusedCell.c) cell.classList.add('focused');
      row.appendChild(cell);
      setCellState(cell, !!data[r * cols + c]);
    }
    editor.appendChild(row);
  }

  editor.setAttribute('role', 'grid');
  editor.setAttribute('aria-label', `Pixel editor for ${state.currentChar}`);
  editor.setAttribute('aria-describedby', 'editor-instructions');
  editor.setAttribute('aria-rowcount', rows);
  editor.setAttribute('aria-colcount', cols);
  editor.setAttribute('aria-activedescendant', `pixel-${focusedCell.r}-${focusedCell.c}`);
}

function cellAt(r, c) { return $(`pixel-${r}-${c}`); }

function setCellState(cell, on) {
  cell.classList.toggle('on', on);
  cell.setAttribute('aria-selected', String(on));
  cell.setAttribute('aria-label', `Row ${+cell.dataset.r + 1}, column ${+cell.dataset.c + 1}, ${on ? 'on' : 'off'}`);
}

function setCellFocus(r, c) {
  const { cols, rows } = state.params;
  r = Math.max(0, Math.min(rows - 1, r));
  c = Math.max(0, Math.min(cols - 1, c));
  cellAt(focusedCell.r, focusedCell.c)?.classList.remove('focused');
  focusedCell = { r, c };
  cellAt(r, c)?.classList.add('focused');
  $('grid-editor').setAttribute('aria-activedescendant', `pixel-${r}-${c}`);
}

/** Everything that shows the current character, after its drawing changed. */
function refreshCurrentChar() {
  renderEditorPreview();
  renderCharMap(state.currentChar);
  scheduleTypeTester();
}

function toggleCellAt(r, c, value) {
  const { cols, rows } = state.params;
  const data = state.glyphs[state.currentChar];
  if (!data) return;

  const paint = (pr, pc) => {
    if (pr < 0 || pr >= rows || pc < 0 || pc >= cols) return;
    data[pr * cols + pc] = value;
    const el = cellAt(pr, pc);
    if (el) setCellState(el, !!value);
  };
  const half = Math.floor(brushSize / 2);
  for (let dr = 0; dr < brushSize; dr++) {
    for (let dc = 0; dc < brushSize; dc++) {
      const br = r + dr - half, bc = c + dc - half;
      paint(br, bc);
      if (symmetryMode && bc >= 0 && bc < cols) paint(br, cols - 1 - bc);
    }
  }
  refreshCurrentChar();
}

/** Flip the connected area of same-state pixels under (r, c). */
function floodFill(r, c) {
  const { cols, rows } = state.params;
  const data = state.glyphs[state.currentChar];
  if (!data) return;
  const from = data[r * cols + c] ? 1 : 0;
  const stack = [[r, c]];
  while (stack.length) {
    const [y, x] = stack.pop();
    if (y < 0 || y >= rows || x < 0 || x >= cols || (data[y * cols + x] ? 1 : 0) !== from) continue;
    data[y * cols + x] = from ? 0 : 1;
    stack.push([y + 1, x], [y - 1, x], [y, x + 1], [y, x - 1]);
  }
  buildGridEditor();
  refreshCurrentChar();
}

function initEditorEvents() {
  const editor = $('grid-editor');
  const cellFromPoint = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest('#grid-editor .grid-cell');

  editor.addEventListener('pointerdown', (e) => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;
    e.preventDefault();
    editor.focus({ preventScroll: true });
    const r = +cell.dataset.r, c = +cell.dataset.c;
    saveUndo();
    setCellFocus(r, c);
    if (fillMode) { floodFill(r, c); return; }
    const current = state.glyphs[state.currentChar][r * state.params.cols + c];
    drag = { id: e.pointerId, value: current ? 0 : 1, last: cell };
    try { editor.setPointerCapture(e.pointerId); } catch {}
    toggleCellAt(r, c, drag.value);
  });

  editor.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const cell = cellFromPoint(e);
    if (!cell || cell === drag.last) return;
    drag.last = cell;
    toggleCellAt(+cell.dataset.r, +cell.dataset.c, drag.value);
  });

  // A drag can end in several ways; every one of them must release the pen.
  const endDrag = (e) => { if (drag && (e.pointerId === undefined || e.pointerId === drag.id)) drag = null; };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) editor.addEventListener(type, endDrag);
  window.addEventListener('blur', () => { drag = null; });

  // Keyboard navigation
  editor.addEventListener('keydown', (e) => {
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
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
        if (fillMode) floodFill(r, c);
        else toggleCellAt(r, c, data[r * cols + c] ? 0 : 1);
        break;
      }
    }
  });
}

// ─────────────────────────────────────────────
//  Transform tools
// ─────────────────────────────────────────────

/** Apply a drawing transform to the current character, or to every character. */
function applyTransform(fn, all) {
  saveUndo();
  const before = undoStack[undoStack.length - 1];
  const { cols, rows } = state.params;
  const targets = all ? Object.keys(state.glyphs) : [state.currentChar];
  for (const char of targets) state.glyphs[char] = fn(state.glyphs[char], cols, rows);
  buildGridEditor();
  renderEditorPreview();
  renderCharMap(all ? undefined : state.currentChar);
  scheduleTypeTester();
  if (all) offerProjectUndo(`Applied to all ${targets.length} characters`, before);
}

function invertGlyph(data) { return data.map(v => (v ? 0 : 1)); }
function clearGlyph(data) { return data.map(() => 0); }

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
  $('btn-paste').disabled = false;
  showToast(`Copied the drawing of “${state.currentChar}”`, 2500);
}

function pasteCurrentChar() {
  if (!clipboard) return;
  saveUndo();
  const { cols, rows } = state.params;
  state.glyphs[state.currentChar] = (clipboardCols === cols && clipboardRows === rows)
    ? [...clipboard]
    : scaleGlyph(clipboard, clipboardCols, clipboardRows, cols, rows);
  buildGridEditor();
  refreshCurrentChar();
}

// ─────────────────────────────────────────────
//  Icons (16px, one stroke weight)
// ─────────────────────────────────────────────

const ICON_PATHS = {
  flipH:    '<path d="M8 2v12" stroke-dasharray="2 2"/><path d="M5.5 5 2.5 8l3 3zM10.5 5l3 3-3 3z"/>',
  flipV:    '<path d="M2 8h12" stroke-dasharray="2 2"/><path d="M5 5.5 8 2.5l3 3zM5 10.5l3 3 3-3z"/>',
  left:     '<path d="M13 8H3M7 4 3 8l4 4"/>',
  right:    '<path d="M3 8h10M9 4l4 4-4 4"/>',
  up:       '<path d="M8 13V3M4 7l4-4 4 4"/>',
  down:     '<path d="M8 3v10M4 9l4 4 4-4"/>',
  rotate:   '<path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5V5h-2.5"/>',
  invert:   '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M8 2.5h4.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H8z" fill="currentColor"/>',
  clear:    '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M6 6l4 4M10 6l-4 4"/>',
  copy:     '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M3 10.5V3.5a1 1 0 0 1 1-1h6.5"/>',
  paste:    '<path d="M5.5 3.5h-2v10h9v-10h-2"/><rect x="5.5" y="2" width="5" height="3" rx="1"/>',
  symmetry: '<path d="M8 2v12"/><path d="M5.5 5v6M3 7v2M10.5 5v6M13 7v2"/>',
  fill:     '<path d="M7 2.5l5.5 5.5-4 4a1.4 1.4 0 0 1-2 0L3 8.5z"/><path d="M3 8.5h9"/><path d="M13.5 11.5v1.5"/>',
  guides:   '<path d="M2 4h12M2 12h12"/><path d="M2 8h12" stroke-dasharray="2 2"/>',
  reset:    '<path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5V5h2.5"/>',
  prev:     '<path d="M10 3 5 8l5 5"/>',
  next:     '<path d="M6 3l5 5-5 5"/>',
  chevron:  '<path d="M4 6l4 4 4-4"/>',
  close:    '<path d="M4 4l8 8M12 4l-8 8"/>',
  help:     '<circle cx="8" cy="8" r="6"/><path d="M6.3 6.3a1.8 1.8 0 1 1 2.6 1.6c-.6.4-.9.7-.9 1.4"/><path d="M8 11.4v.2"/>',
  sun:      '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
  moon:     '<path d="M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5z"/>',
};

function icon(name) {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

function setPressed(btn, on) {
  btn.classList.toggle('active', on);
  btn.setAttribute('aria-pressed', String(on));
}

// ─────────────────────────────────────────────
//  Editor toolbar
// ─────────────────────────────────────────────

function buildEditorToolbar() {
  const tb = $('editor-toolbar');
  tb.innerHTML = '';
  // Two groups that wrap as wholes: change the drawing, then how you draw.
  const newGroup = () => tb.appendChild(Object.assign(document.createElement('div'), { className: 'tool-group' }));
  let group = newGroup();

  const mkBtn = (iconName, label, shortcut, onClick) => {
    const b = document.createElement('button');
    b.className = 'tool-btn';
    if (iconName) b.innerHTML = icon(iconName);
    b.setAttribute('aria-label', label);
    b.dataset.tip = shortcut ? `${label} · ${shortcut}` : label;
    b.tabIndex = -1;
    b.addEventListener('click', onClick);
    group.appendChild(b);
    return b;
  };
  const sep = () => group.appendChild(Object.assign(document.createElement('span'), { className: 'toolbar-sep' }));
  // Shift-click a transform to apply it to every character.
  const transform = (fn) => (e) => applyTransform(fn, e.shiftKey);

  mkBtn('left',  'Shift left',  'Shift+←', transform(shiftLeft));
  mkBtn('right', 'Shift right', 'Shift+→', transform(shiftRight));
  mkBtn('up',    'Shift up',    'Shift+↑', transform(shiftUp));
  mkBtn('down',  'Shift down',  'Shift+↓', transform(shiftDown));
  sep();
  mkBtn('flipH',  'Flip horizontally', 'Alt+H', transform(flipH));
  mkBtn('flipV',  'Flip vertically',   'Alt+V', transform(flipV));
  mkBtn('rotate', 'Rotate 90°',        'Alt+R', transform(rotate90));
  mkBtn('invert', 'Invert',            'Alt+I', transform(invertGlyph));
  sep();
  mkBtn('copy', 'Copy drawing', 'Ctrl+C', copyCurrentChar);
  const paste = mkBtn('paste', 'Paste drawing', 'Ctrl+V', pasteCurrentChar);
  paste.id = 'btn-paste';
  paste.disabled = !clipboard;
  group = newGroup();

  const sym = mkBtn('symmetry', 'Mirror while drawing', '', () => { symmetryMode = !symmetryMode; setPressed(sym, symmetryMode); });
  setPressed(sym, symmetryMode);
  const fill = mkBtn('fill', 'Fill an area', '', () => {
    fillMode = !fillMode;
    setPressed(fill, fillMode);
    $('grid-editor').classList.toggle('fill-mode', fillMode);
  });
  setPressed(fill, fillMode);
  for (const size of [1, 2, 3]) {
    const b = mkBtn(null, `Brush ${size}×${size}`, '', () => {
      brushSize = size;
      tb.querySelectorAll('[data-brush]').forEach(btn => setPressed(btn, +btn.dataset.brush === size));
    });
    b.classList.add('text');
    b.textContent = `${size}×`;
    b.dataset.brush = size;
    setPressed(b, brushSize === size);
  }
  sep();

  const guide = mkBtn('guides', 'Show guides', '', () => {
    showGuides = !showGuides;
    setPressed(guide, showGuides);
    buildGridEditor();
  });
  setPressed(guide, showGuides);
  sep();
  mkBtn('clear', 'Clear drawing', 'Alt+X', () => applyTransform(clearGlyph));
  mkBtn('reset', 'Reset to the original drawing', '', resetCurrentChar);

  // Toolbar pattern: one tab stop, arrow keys move between tools.
  const tools = () => [...tb.querySelectorAll('button:not(:disabled)')];
  tools()[0].tabIndex = 0;
  tb.addEventListener('keydown', (e) => {
    const list = tools(), i = list.indexOf(document.activeElement);
    if (i < 0) return;
    let next = null;
    if (e.key === 'ArrowRight') next = list[(i + 1) % list.length];
    else if (e.key === 'ArrowLeft') next = list[(i - 1 + list.length) % list.length];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    if (!next || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    next.focus();
  });
  tb.addEventListener('focusin', (e) => {
    if (!e.target.matches('button')) return;
    tb.querySelectorAll('button').forEach(b => { b.tabIndex = b === e.target ? 0 : -1; });
  });
}

// ─────────────────────────────────────────────
//  Looks: one-click settings for how the pixels are drawn
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
    name: 'Slanted',
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
    name: 'Wireframe',
    params: { cellWidth: 40, cellHeight: 40, gapX: 0, gapY: 0, cornerRadius: 4,  innerRadius: 0, bridgeRadius: 0, diagWidth: 9,  cellShape: 'rect',       cornerMerge: true, skewX: 0, dotSize: 22, diagFill: true },
  },
  {
    name: 'Nixie',
    params: { cellWidth: 26, cellHeight: 48, gapX: 0, gapY: 0, cornerRadius: 12, innerRadius: 0, bridgeRadius: 0, diagWidth: 12, cellShape: 'rect',       cornerMerge: true, skewX: 0, dotSize: 45, diagFill: true, showOff: true },
  },
  {
    name: 'Pegboard',
    params: { cellWidth: 34, cellHeight: 34, gapX: 6, gapY: 6, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'ring',       cornerMerge: true, skewX: 0, shapeWeight: 45, showOff: true },
  },
  {
    name: 'Speed',
    params: { cellWidth: 48, cellHeight: 36, gapX: 0, gapY: 0, cornerRadius: 14, innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'slope',      cornerMerge: true, skewX: -14, outline: true, outlineWidth: 3 },
  },
  {
    name: 'StitchGrid',
    params: { cellWidth: 36, cellHeight: 36, gapX: 8, gapY: 8, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'plus',       cornerMerge: true, skewX: 0, shapeWeight: 18, showOff: true },
  },
  {
    name: 'Voxel Cloud',
    params: { cellWidth: 36, cellHeight: 36, gapX: 6, gapY: 6, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'halftone',   cornerMerge: true, skewX: 0, dotSize: 85, showOff: true },
  },
  {
    name: 'Holo Slice',
    params: { cellWidth: 48, cellHeight: 36, gapX: 0, gapY: 10, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'horizontal', cornerMerge: true, skewX: -8, dotSize: 65, showOff: true },
  },
  {
    name: 'Trace',
    params: { cellWidth: 40, cellHeight: 40, gapX: 0, gapY: 0, cornerRadius: 5,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'slope',      cornerMerge: true, skewX: 0, dotSize: 45 },
  },
  {
    name: 'Hairline',
    params: { cellWidth: 40, cellHeight: 40, gapX: 0, gapY: 0, cornerRadius: 3,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'slope',      cornerMerge: true, skewX: 0, dotSize: 28 },
  },
  {
    name: 'Circuit',
    params: { cellWidth: 40, cellHeight: 40, gapX: 0, gapY: 0, cornerRadius: 5,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'slope',      cornerMerge: true, skewX: 0, dotSize: 45, showOff: true },
  },
  {
    name: 'Chisel',
    params: { cellWidth: 30, cellHeight: 50, gapX: 0, gapY: 0, cornerRadius: 9,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'slope',      cornerMerge: true, skewX: 0 },
  },
  {
    name: 'Seeds',
    params: { cellWidth: 26, cellHeight: 44, gapX: 8, gapY: 2, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'circle',     cornerMerge: true, skewX: -12 },
  },
  {
    name: 'Rain',
    params: { cellWidth: 30, cellHeight: 48, gapX: 6, gapY: 0, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'vertical',   cornerMerge: true, skewX: -10 },
  },
  {
    name: 'Barcode',
    params: { cellWidth: 12, cellHeight: 46, gapX: 9, gapY: 0, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'tile',       cornerMerge: true, skewX: 0 },
  },
  {
    name: 'Argyle',
    params: { cellWidth: 34, cellHeight: 52, gapX: 0, gapY: 0, cornerRadius: 0,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'diamond',    cornerMerge: true, skewX: 0 },
  },
  {
    name: 'Dominos',
    params: { cellWidth: 28, cellHeight: 50, gapX: 6, gapY: 6, cornerRadius: 7,  innerRadius: 0, bridgeRadius: 0, diagWidth: 14, cellShape: 'tile',       cornerMerge: true, skewX: 0 },
  },
];

const CELL_SHAPES = [
    ['rect','Rect'],['circle','Circle'],['nodes','Nodes'],['horizontal','Horizontal'],['vertical','Vertical'],['pixel','Pixel'],
    ['diamond','Diamond'],['ring','Ring'],['plus','Cross'],['hexagon','Hexagon'],['diagonal','Diagonal'],['halftone','Halftone'],
    ['slope','Slope'],['tile','Tile'],['open','Open'],['dash','Dash'],
];

// Settings a look doesn't always list — reset so one look's effect doesn't leak into the next.
const PRESET_RESETS = { outline: false, shapeWeight: 50, showOff: false, dotSize: 100, diagFill: false };

const PARAM_DEFS = [
  { key: 'cellWidth',    label: 'Pixel width',    min: 6,  max: 120, step: 1, type: 'range',    hint: 'Width of one pixel' },
  { key: 'cellHeight',   label: 'Pixel height',   min: 6,  max: 120, step: 1, type: 'range',    hint: 'Height of one pixel' },
  { key: 'cornerRadius', label: 'Corner radius',  min: 0,  max: 60,  step: 1, type: 'range',    hint: 'Rounding of the outer corners of each pixel' },
  { key: 'innerRadius',  label: 'Inner radius',   min: 0,  max: 30,  step: 1, type: 'range',    hint: 'Smooth fillet at concave inner corners where cells meet at L/T junctions' },
  { key: 'bridgeRadius', label: 'Bridge radius',  min: 0,  max: 20,  step: 1, type: 'range',    hint: 'Rounding of the bridges that join neighbouring pixels across a gap' },
  { key: 'gapX',         label: 'Gap between columns', min: 0, max: 40, step: 1, type: 'range',  hint: 'Horizontal space between pixels' },
  { key: 'gapY',         label: 'Gap between rows', min: 0,  max: 40,  step: 1, type: 'range',   hint: 'Vertical space between pixels' },
  { key: 'cols',         label: 'Columns',        min: 3,  max: 14,  step: 1, type: 'range',    hint: 'Width of every character, in pixels' },
  { key: 'rows',         label: 'Rows',           min: 3,  max: 16,  step: 1, type: 'range',    hint: 'Height of every character, in pixels' },
  { key: 'padding',      label: 'Padding',        min: 0,  max: 40,  step: 1, type: 'range',    hint: 'Blank space around the artwork in exported SVG and PNG' },
  { key: 'fgColor',      label: 'Foreground',                                 type: 'color',    hint: 'Color of the lettering' },
  { key: 'bgColor',      label: 'Background',                                 type: 'color',    hint: 'Color behind the lettering' },
  { key: 'diagFill',    label: 'Join diagonals',                               type: 'checkbox', hint: 'Connects pixels that only touch at a corner.' },
  { key: 'diagWidth',   label: 'Diagonal width',   min: 1, max: 80,  step: 1, type: 'range',    hint: 'Thickness of the diagonal joins' },
  { key: 'outline',      label: 'Outline',                                      type: 'checkbox', hint: 'Adds a border around the lettering. Artwork only: a font file leaves it out.' },
  { key: 'outlineWidth', label: 'Outline width',  min: 1,   max: 20,  step: 1, type: 'range',    hint: 'Thickness of the outline' },
  { key: 'outlineColor', label: 'Outline color',                                type: 'color',    hint: 'Color of the outline' },
  { key: 'charSpacing', label: 'Character spacing', min: 0, max: 120, step: 1, type: 'range',   hint: 'Space between characters in text and in the font file' },
  { key: 'cornerMerge',    label: 'Join corners',    type: 'checkbox', hint: 'Squares off corners where pixels meet, so strokes read as one shape.' },
  { key: 'lockNodeRadius', label: 'Fully round nodes', type: 'checkbox', hint: 'Keeps each node a full circle. Turn off to set the radius yourself.' },
  { key: 'skewX',        label: 'Slant',          min: -30, max: 30,  step: 1, type: 'range',    hint: 'Slant angle in degrees. Negative leans right.' },
  { key: 'dotSize',      label: 'Pixel fill %',       min: 10,  max: 100, step: 1, type: 'range',    hint: 'Draws each pixel at this share of its size: thinner strokes, smaller dots' },
  { key: 'shapeWeight',  label: 'Stroke weight',   min: 5,   max: 95,  step: 1, type: 'range',    hint: 'Thickness of rings, crosses, stripes, open squares and dashes, as a share of the pixel' },
  { key: 'showOff',      label: 'Show unlit pixels',                            type: 'checkbox', hint: 'Draws the unlit pixels dimly, like an LED board. Artwork only: a font file leaves them out.' },
  { key: 'offColor',     label: 'Unlit color',                                  type: 'color',    hint: 'Color of the unlit pixels' },
];

const PARAM_GROUPS = [
  { key: 'grid',    label: 'Grid',       keys: ['cols', 'rows'], open: true, note: 'Changing the grid crops or pads every drawing.' },
  { key: 'size',    label: 'Pixel size', keys: ['cellWidth', 'cellHeight', 'dotSize'], open: true },
  { key: 'spacing', label: 'Spacing',    keys: ['gapX', 'gapY', 'charSpacing'], open: false },
  { key: 'corners', label: 'Corners',    keys: ['cornerRadius', 'bridgeRadius', 'cornerMerge', 'lockNodeRadius'], open: false },
  { key: 'effects', label: 'Effects',    keys: ['shapeWeight', 'diagFill', 'diagWidth', 'outline', 'outlineWidth', 'outlineColor', 'skewX', 'showOff', 'offColor'], open: false },
  { key: 'color',   label: 'Color',      keys: ['fgColor', 'bgColor'], open: true },
];

// Looks shown before "Show all": one of each distinct idea.
const FEATURED_LOOKS = ['Pixel', 'Rounded', 'Dots', 'Nodes', 'LED', 'Outlined', 'Scanline', 'Slope', 'Slanted'];

// Settings a look controls. Changing one of them makes the look "Custom".
const LOOK_KEYS = new Set([...Object.keys(PRESET_RESETS), ...DEFAULT_STYLES.flatMap(s => Object.keys(s.params))]);

// ─────────────────────────────────────────────
//  Settings panel
// ─────────────────────────────────────────────

const sectionValues = {};

/** A collapsible settings section. Returns its body element. */
function addSection(panel, key, title, defaultOpen) {
  const section = document.createElement('div');
  section.className = 'param-section';
  const header = document.createElement('button');
  header.className = 'section-hdr';
  header.innerHTML = `<span class="section-title"></span><span class="section-value"></span>${icon('chevron')}`;
  header.querySelector('.section-title').textContent = title;
  sectionValues[key] = header.querySelector('.section-value');
  const body = document.createElement('div');
  body.className = 'section-body';
  body.id = `section-${key}`;
  header.setAttribute('aria-controls', body.id);

  let open = defaultOpen;
  try { const saved = localStorage.getItem(`pfg-panel-${key}`); if (saved !== null) open = saved === 'true'; } catch {}
  const update = () => { header.setAttribute('aria-expanded', String(open)); body.hidden = !open; };
  header.addEventListener('click', () => {
    open = !open;
    update();
    try { localStorage.setItem(`pfg-panel-${key}`, String(open)); } catch {}
  });
  update();

  section.append(header, body);
  panel.appendChild(section);
  return body;
}

/** The current choice, shown in a section header so it reads while collapsed. */
function setSectionValue(key, text) {
  if (sectionValues[key]) sectionValues[key].textContent = text;
}

function hint(text) {
  return Object.assign(document.createElement('p'), { className: 'control-hint', textContent: text });
}

function buildParamControls() {
  const panel = $('params-panel');
  panel.innerHTML = '<h2 class="visually-hidden">Settings</h2>';

  // ── Looks ──────────────────────────────────
  const looks = addSection(panel, 'looks', 'Look', true);
  const looksGrid = document.createElement('div');
  looksGrid.className = 'option-grid three looks-grid';
  const ordered = [
    ...FEATURED_LOOKS.map(name => DEFAULT_STYLES.find(s => s.name === name)),
    ...DEFAULT_STYLES.filter(s => !FEATURED_LOOKS.includes(s.name)),
  ];
  for (const preset of ordered) {
    const btn = document.createElement('button');
    btn.className = 'look-btn' + (FEATURED_LOOKS.includes(preset.name) ? '' : ' extra');
    btn.dataset.preset = preset.name;
    btn.innerHTML = '<span class="look-thumb" aria-hidden="true"></span><span class="look-name"></span>';
    btn.querySelector('.look-name').textContent = preset.name;
    btn.addEventListener('click', () => applyPreset(preset));
    looksGrid.appendChild(btn);
  }
  const more = document.createElement('button');
  more.className = 'link-btn';
  let showAll = false;
  try { showAll = localStorage.getItem('pfg-looks-all') === 'true'; } catch {}
  const updateMore = () => {
    looksGrid.classList.toggle('all', showAll);
    more.textContent = showAll ? 'Show fewer looks' : `Show all ${DEFAULT_STYLES.length} looks`;
    more.setAttribute('aria-expanded', String(showAll));
  };
  more.addEventListener('click', () => {
    showAll = !showAll;
    updateMore();
    try { localStorage.setItem('pfg-looks-all', String(showAll)); } catch {}
  });
  updateMore();
  looks.append(looksGrid, more);

  // ── Letterforms ────────────────────────────
  const letters = addSection(panel, 'letterforms', 'Letterforms', false);
  letters.appendChild(hint('Choosing a set replaces every drawing. Choose the current set again to start over.'));
  const lettersGrid = document.createElement('div');
  lettersGrid.className = 'option-grid';
  for (const style of CHAR_STYLES) {
    const btn = document.createElement('button');
    btn.className = 'option-btn char-style-btn';
    btn.dataset.style = style.name;
    btn.textContent = style.name;
    btn.addEventListener('click', () => applyCharStyle(style));
    lettersGrid.appendChild(btn);
  }
  letters.appendChild(lettersGrid);

  // ── Pixel shape ────────────────────────────
  const shapes = addSection(panel, 'shape', 'Pixel shape', false);
  const shapeGrid = document.createElement('div');
  shapeGrid.className = 'option-grid three';
  for (const [shape, label] of CELL_SHAPES) {
    const btn = document.createElement('button');
    btn.className = 'option-btn cell-shape-btn';
    btn.dataset.shape = shape;
    btn.textContent = label;
    btn.addEventListener('click', () => applyCellShape(shape));
    shapeGrid.appendChild(btn);
  }
  shapes.appendChild(shapeGrid);

  // ── Parameter groups ───────────────────────
  for (const group of PARAM_GROUPS) {
    const body = addSection(panel, group.key, group.label, group.open);
    if (group.note) body.appendChild(hint(group.note));
    const rows = group.keys.map(key => buildParamRow(PARAM_DEFS.find(d => d.key === key)));

    if (group.key === 'color') {
      const pair = document.createElement('div');
      pair.className = 'param-pair';
      pair.append(...rows);
      const swap = Object.assign(document.createElement('button'), { textContent: 'Swap colors' });
      swap.addEventListener('click', () => {
        saveUndo();
        [state.params.fgColor, state.params.bgColor] = [state.params.bgColor, state.params.fgColor];
        syncParamControls();
        render();
      });
      body.append(pair, swap);
    } else {
      body.append(...rows);
    }

    if (group.key === 'size') body.append(...buildFitHeight());
  }
}

function buildParamRow(def) {
  const wrap = document.createElement('div');
  wrap.className = 'param-row';
  wrap.dataset.paramKey = def.key;
  const label = document.createElement('label');
  label.htmlFor = `param-${def.key}`;
  label.textContent = def.label;

  if (def.type === 'range') {
    if (def.hint) label.title = def.hint;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = `param-${def.key}`;
    slider.min = def.min; slider.max = def.max; slider.step = def.step;
    slider.value = state.params[def.key];

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.setAttribute('aria-label', `${def.label}, exact value`);
    numInput.className = 'param-num';
    numInput.dataset.key = def.key;
    numInput.min = def.min; numInput.max = def.max; numInput.step = def.step;
    numInput.value = state.params[def.key];

    // One undo step per drag: opened on the first input, closed on change
    slider.addEventListener('input', () => {
      beginParamEdit(def.key);
      numInput.value = slider.value;
      applyParam(def.key, Number(slider.value));
    });
    slider.addEventListener('change', endParamEdit);
    numInput.addEventListener('change', () => {
      // An empty or out-of-range entry snaps to the nearest allowed value.
      const typed = numInput.value === '' ? state.params[def.key] : Number(numInput.value);
      const v = Math.min(def.max, Math.max(def.min, Math.round(typed)));
      slider.value = v;
      numInput.value = v;
      beginParamEdit(def.key);
      applyParam(def.key, v);
      endParamEdit();
    });

    const head = document.createElement('div');
    head.className = 'param-head';
    head.append(label, numInput);
    wrap.append(head, slider);

  } else if (def.type === 'color') {
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.id = `param-${def.key}`;
    picker.value = state.params[def.key];
    picker.addEventListener('input', () => {
      beginParamEdit(def.key);
      applyParam(def.key, picker.value);
    });
    picker.addEventListener('change', endParamEdit);
    wrap.append(label, picker);

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
    row.append(checkbox, label);
    wrap.appendChild(row);
    if (def.hint) {
      const note = hint(def.hint);
      note.id = `hint-${def.key}`;
      checkbox.setAttribute('aria-describedby', note.id);
      wrap.appendChild(note);
    }
  }
  return wrap;
}

/** "Total height": derive pixel size, gaps and corners from one target height. */
function buildFitHeight() {
  const row = document.createElement('div');
  row.className = 'fit-row';
  const field = document.createElement('div');
  field.className = 'param-row';
  const label = Object.assign(document.createElement('label'), { htmlFor: 'autoscale-height', textContent: 'Total height (px)' });
  const input = document.createElement('input');
  input.type = 'number';
  input.id = 'autoscale-height';
  input.className = 'param-num';
  input.min = 20; input.max = 2000;
  input.value = computeCharHeight();
  field.append(label, input);

  const btn = Object.assign(document.createElement('button'), { textContent: 'Resize' });
  btn.addEventListener('click', () => {
    const h = Math.round(Number(input.value));
    if (input.value === '' || !Number.isFinite(h) || h < 20 || h > 2000) {
      showToast('Enter a total height between 20 and 2000 pixels.');
      input.focus();
      return;
    }
    autoGenerate(h);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
  row.append(field, btn);
  return [row, hint('Resizes pixels, gaps and corners together to reach this height.')];
}

function syncFitHeight() {
  const input = $('autoscale-height');
  if (input) input.value = computeCharHeight();
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
  const { rows } = state.params;

  // Solve: targetHeight = rows * cellH + (rows-1) * gap,  gap = cellH * gapRatio
  const gapRatio = 0.1;
  const cellH = Math.min(120, Math.max(6, Math.round(targetHeight / (rows + (rows - 1) * gapRatio))));
  const gap   = Math.max(0, Math.round(cellH * gapRatio));

  saveUndo();
  Object.assign(state.params, {
    cellWidth:    cellH,
    cellHeight:   cellH,
    gapX:         gap,
    gapY:         gap,
    cornerRadius: Math.min(Math.floor(cellH / 2), Math.round(cellH * 0.28)),
    diagWidth:    Math.round(cellH * 0.28),
  });
  if (state.params.cellShape === 'nodes') { state.params.gapX = 0; state.params.gapY = 0; }
  setLook(null);
  syncParamControls();
  render();
  syncFitHeight();   // show the height that was actually reached
}

// ─────────────────────────────────────────────
//  Letterforms, looks, pixel shape
// ─────────────────────────────────────────────

function setActiveCharStyle(name) {
  state.charStyle = name;
  document.querySelectorAll('.char-style-btn').forEach(b => setPressed(b, b.dataset.style === name));
  setSectionValue('letterforms', name);
}

function setLook(name) {
  state.look = name;
  document.querySelectorAll('.look-btn').forEach(b => setPressed(b, b.dataset.preset === name));
  setSectionValue('looks', name || 'Custom');
}

function applyCharStyle(style) {
  saveUndo();
  const before = undoStack[undoStack.length - 1];
  const styleCols = style.cols ?? FONT_COLS;
  const styleRows = style.rows ?? FONT_ROWS;
  // While the grid is still some set's native size (not customised), switch to
  // this set's native grid — e.g. Condensed → 4×7, back to 5×7 after.
  const onNativeGrid = CHAR_STYLES.some(s =>
    (s.cols ?? FONT_COLS) === state.params.cols && (s.rows ?? FONT_ROWS) === state.params.rows);
  if (onNativeGrid) {
    state.params.cols = styleCols;
    state.params.rows = styleRows;
  }
  const { cols, rows } = state.params;
  // Classic has purpose-drawn small sizes; every other set scales from its own grid.
  const own = style.name === 'Classic' ? bestFontSource(cols, rows) : { data: style.data, cols: styleCols, rows: styleRows };
  const fallback = bestFontSource(styleCols, styleRows);
  for (const char of Object.keys(state.glyphs)) {
    let srcData = own.data[char], sc = own.cols, sr = own.rows;
    if (!srcData && fallback.data[char]) {
      srcData = fallback.data[char]; sc = fallback.cols; sr = fallback.rows;
    } else if (!srcData) {
      srcData = FONT_DATA[char]; sc = FONT_COLS; sr = FONT_ROWS;
    }
    if (!srcData) continue;
    state.glyphs[char] = (sc === cols && sr === rows)
      ? [...srcData]
      : scaleGlyph(srcData, sc, sr, cols, rows);
  }
  state.pristine = copyGlyphs(state.glyphs);
  setActiveCharStyle(style.name);
  syncParamControls();
  syncFitHeight();
  refreshAll();
  offerProjectUndo(`Replaced every drawing with the ${style.name} letterforms`, before);
}

function applyCellShape(shape) {
  saveUndo();
  state.params.cellShape = shape;
  if (shape === 'nodes') {
    // Nodes need square pixels and no gap
    state.params.gapX = 0;
    state.params.gapY = 0;
    state.params.cellHeight = state.params.cellWidth;
  }
  setLook(null);
  syncParamControls();
  syncFitHeight();
  render();
}

function applyPreset(preset) {
  saveUndo();
  Object.assign(state.params, PRESET_RESETS, preset.params);
  if (preset.params.lockNodeRadius === undefined) state.params.lockNodeRadius = true;
  // Clamp cornerRadius to cell size
  const maxRad = Math.floor(Math.min(state.params.cellWidth, state.params.cellHeight) / 2);
  state.params.cornerRadius = Math.min(state.params.cornerRadius, maxRad);
  setLook(preset.name);
  syncParamControls();
  syncFitHeight();
  render();
}

function applyParam(key, value) {
  if (LOOK_KEYS.has(key) && state.look) setLook(null);
  const oldCols = state.params.cols;
  const oldRows = state.params.rows;
  state.params[key] = value;

  if (key === 'cols' || key === 'rows') {
    const { cols, rows } = state.params;
    const base = paramEdit && paramEdit.base;
    // Resize from the drag-start drawings so shrinking then growing loses nothing
    const from = base || { cols: oldCols, rows: oldRows, glyphs: state.glyphs, pristine: state.pristine };
    for (const set of ['glyphs', 'pristine']) {
      state[set] = Object.fromEntries(Object.entries(from[set]).map(([char, data]) =>
        [char, resizeGlyph(data, from.cols, from.rows, cols, rows)]));
    }
    buildGridEditor();
  }

  // Nodes: enforce square pixels and zero gap
  if (state.params.cellShape === 'nodes') {
    if (key === 'cellWidth' || key === 'cellHeight') {
      state.params.cellWidth = value;
      state.params.cellHeight = value;
    }
    if (key === 'gapX' || key === 'gapY') {
      state.params.gapX = 0;
      state.params.gapY = 0;
    }
  }

  // Clamp cornerRadius to fit within both pixel dimensions
  const maxRad = Math.floor(Math.min(state.params.cellWidth, state.params.cellHeight) / 2);
  if (state.params.cornerRadius > maxRad) state.params.cornerRadius = maxRad;

  syncParamControls();
  syncFitHeight();
  render();
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

// ─────────────────────────────────────────────
//  Rendering
// ─────────────────────────────────────────────

function render() {
  renderEditorPreview();
  renderCharMap();
  renderTypeTester();
}

function renderEditorPreview() {
  const { cols, rows } = state.params;
  const data = state.glyphs[state.currentChar];
  scheduleAutosave();   // every edit / param change / char switch passes through here
  scheduleLookThumbs();
  updateCharHeading();
  if (!data) return;
  $('editor-preview').innerHTML = generateGlyphSVG(data, cols, rows, state.params, state.currentChar);
}

// Look thumbnails show the user's own "Aa" in each look. They only depend on
// those two drawings and the grid, so they are redrawn when one of them changes.
let lookThumbTimer = 0, lookThumbSignature = '';
function scheduleLookThumbs() {
  clearTimeout(lookThumbTimer);
  lookThumbTimer = setTimeout(renderLookThumbs, 200);
}

function renderLookThumbs() {
  const { cols, rows } = state.params;
  const signature = JSON.stringify([cols, rows, state.glyphs.A, state.glyphs.a]);
  if (signature === lookThumbSignature) return;
  lookThumbSignature = signature;
  for (const btn of document.querySelectorAll('.look-btn')) {
    const preset = DEFAULT_STYLES.find(s => s.name === btn.dataset.preset);
    const params = thumbParams({ ...state.params, ...PRESET_RESETS, lockNodeRadius: true, ...preset.params, charSpacing: 8 });
    params.cornerRadius = Math.min(params.cornerRadius, Math.floor(Math.min(params.cellWidth, params.cellHeight) / 2));
    btn.querySelector('.look-thumb').innerHTML = generateTextSVG(state.glyphs, 'Aa', params) || '';
  }
}

// ─────────────────────────────────────────────
//  Type tester
// ─────────────────────────────────────────────

function buildTypeTester() {
  const panel = $('type-tester');
  panel.innerHTML = `
    <h2 class="visually-hidden">Type tester</h2>
    <div class="type-tester-bar">
      <label for="type-tester-input">Text</label>
      <input type="text" id="type-tester-input" class="type-tester-input" value="Hello World" autocomplete="off" spellcheck="false">
      <div class="type-size">
        <label for="type-size">Size</label>
        <input type="range" id="type-size" min="30" max="200" value="60">
        <output id="type-size-value" for="type-size"></output>
      </div>
    </div>
    <div id="type-tester-preview" class="type-tester-preview"></div>
    <p id="tester-missing" role="status" hidden></p>`;
  $('type-tester-input').addEventListener('input', renderTypeTester);
  $('type-size').addEventListener('input', renderTypeTester);
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
  const input = $('type-tester-input');
  const preview = $('type-tester-preview');
  if (!input || !preview) return;
  const height = Number($('type-size').value) || 60;
  $('type-size-value').textContent = `${height} px`;

  const text = input.value;
  const svg = text.trim() ? generateTextSVG(state.glyphs, text, state.params) : null;
  preview.innerHTML = svg || '<span class="empty">Type some text to see it in your font.</span>';
  const image = preview.querySelector('svg');
  if (image) image.style.height = `${height}px`;

  // Characters without a drawing are left blank; say which ones.
  const missing = [...new Set([...text].filter(ch => ch !== ' ' && !state.glyphs[ch]))];
  const note = $('tester-missing');
  note.hidden = missing.length === 0;
  note.textContent = missing.length
    ? `No drawing for ${missing.slice(0, 12).join(' ')}${missing.length > 12 ? ' …' : ''}. ${missing.length === 1 ? 'It is' : 'They are'} left blank.`
    : '';
}

// ─────────────────────────────────────────────
//  Export
// ─────────────────────────────────────────────

function closeMenus() {
  for (const menu of document.querySelectorAll('.menu:popover-open')) menu.hidePopover();
}

function pngScale() {
  const input = $('png-scale');
  const scale = Math.max(1, Math.min(16, parseInt(input.value) || 4));
  input.value = scale;
  return scale;
}

function glyphSVG(char) {
  const { cols, rows } = state.params;
  return generateGlyphSVG(state.glyphs[char], cols, rows, state.params, char);
}

function exportFont() {
  const name = state.fontName.trim() || DEFAULT_FONT_NAME;
  let font;
  try { font = generateTTF(state.glyphs, state.params, { familyName: name }); }
  catch { showToast('The font file could not be built. Your drawings are unchanged; try a simpler look.', 0); return; }
  const file = `${fileSlug(name)}.ttf`;
  downloadBlob(file, new Blob([font.bytes], { type: 'font/ttf' }));
  const left = font.notes.length ? ` Not included in a font file: ${font.notes.join(', ')}.` : '';
  showToast(`Exported ${file} with ${font.glyphCount} characters.${left}`, font.notes.length ? 10000 : 5000);
}

function exportCurrent() {
  const file = glyphFilename(state.currentChar);
  downloadSVG(file, glyphSVG(state.currentChar));
  showToast(`Exported ${file}`);
}

function exportCurrentPNG() {
  const scale = pngScale();
  const file = glyphFilename(state.currentChar, 'png');
  rasterizeSVG(glyphSVG(state.currentChar), scale)
    .then(blob => { downloadBlob(file, blob); showToast(`Exported ${file} at ${scale}×`); })
    .catch(() => showToast('The PNG could not be created. Try a smaller PNG scale.', 0));
}

function exportAll() {
  const entries = Object.keys(state.glyphs).map(char => ({ name: glyphFilename(char), data: glyphSVG(char) }));
  downloadBlob('pixel-font-svg.zip', generateZIP(entries));
  showToast(`Exported ${entries.length} SVG files in pixel-font-svg.zip`);
}

async function exportAllPNG(button) {
  const scale = pngScale();
  const chars = Object.keys(state.glyphs);
  button.disabled = true;
  try {
    const entries = [];
    for (const char of chars) {
      const blob = await rasterizeSVG(glyphSVG(char), scale);
      entries.push({ name: glyphFilename(char, 'png'), data: new Uint8Array(await blob.arrayBuffer()) });
    }
    downloadBlob('pixel-font-png.zip', generateZIP(entries));
    showToast(`Exported ${entries.length} PNG files at ${scale}× in pixel-font-png.zip`);
  } catch {
    showToast('The PNG files could not be created. Try a smaller PNG scale.', 0);
  } finally {
    button.disabled = false;
  }
}

function exportSprite() {
  const chars = ALL_CHARS.filter(c => state.glyphs[c]);
  downloadSVG('sprite-sheet.svg', generateSpriteSheetSVG(state.glyphs, chars, state.params));
  showToast(`Exported sprite-sheet.svg with ${chars.length} characters`);
}

function exportTypeTester() {
  const text = $('type-tester-input').value;
  const svg = text.trim() ? generateTextSVG(state.glyphs, text, state.params) : null;
  if (!svg) { showToast('Type some text in the type tester first.'); return; }
  const file = `${fileSlug(text)}.svg`;
  downloadSVG(file, svg);
  showToast(`Exported ${file}`);
}

// ─────────────────────────────────────────────
//  Toast notifications
// ─────────────────────────────────────────────

// The Undo of the latest saved-style toast. Ctrl+Z runs it while it is shown,
// because those changes are not on the project's undo stack.
let toastUndo = null;

/**
 * @param {string} msg
 * @param {number} duration  ms; 0 keeps the toast until it is dismissed
 * @param {Function} [action]  adds an Undo button
 * @param {boolean} [viaShortcut]  let Ctrl+Z trigger the action
 */
function showToast(msg, duration = 5000, action, viaShortcut = false) {
  const container = $('toast-container');
  // The same message twice replaces the first instead of stacking.
  for (const old of container.children) if (old.dataset.msg === msg) old.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.dataset.msg = msg;
  toast.appendChild(Object.assign(document.createElement('span'), { textContent: msg }));

  const remove = () => {
    toast.remove();
    if (toastUndo && toastUndo.toast === toast) toastUndo = null;
  };
  if (action) {
    const button = Object.assign(document.createElement('button'), { textContent: 'Undo' });
    button.addEventListener('click', () => { action(); remove(); });
    toast.appendChild(button);
    if (viaShortcut) toastUndo = { toast, run: () => { action(); remove(); } };
  }
  if (!duration) {
    // Persistent (error) toasts need an explicit way to dismiss them.
    const close = document.createElement('button');
    close.className = 'icon-btn';
    close.innerHTML = icon('close');
    close.setAttribute('aria-label', 'Dismiss');
    close.addEventListener('click', remove);
    toast.appendChild(close);
  }
  container.appendChild(toast);

  // Keep an actionable notification available while keyboard or pointer is inside it.
  let timer;
  const start = () => { if (duration) timer = setTimeout(remove, duration); };
  const stop = () => clearTimeout(timer);
  toast.addEventListener('focusin', stop);
  toast.addEventListener('mouseenter', stop);
  toast.addEventListener('focusout', start);
  toast.addEventListener('mouseleave', start);
  start();
}

/** Toast with an Undo that restores a project snapshot (also reachable with Ctrl+Z). */
function offerProjectUndo(message, snapshot, alsoRestore) {
  showToast(message, 6000, () => {
    saveUndo();
    restoreSnapshot(snapshot);
    if (alsoRestore) alsoRestore();
    refreshAll();
  });
}

// ─────────────────────────────────────────────
//  Theme
// ─────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('btn-theme');
  const target = theme === 'light' ? 'dark' : 'light';
  btn.innerHTML = icon(target === 'light' ? 'sun' : 'moon');
  btn.setAttribute('aria-label', `Switch to the ${target} theme`);
  btn.dataset.tip = `Switch to the ${target} theme`;
}

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  try { localStorage.setItem('pfg-theme', theme); } catch {}
}

// ─────────────────────────────────────────────
//  Reset
// ─────────────────────────────────────────────

/** Back to the drawing this character had when its letterform set was applied. */
function resetCurrentChar() {
  const char = state.currentChar;
  const original = state.pristine[char];
  if (!original || !isEdited(char)) { showToast(`“${char}” already matches its original drawing.`, 3000); return; }
  saveUndo();
  const before = undoStack[undoStack.length - 1];
  state.glyphs[char] = [...original];
  buildGridEditor();
  refreshCurrentChar();
  offerProjectUndo(`Reset “${char}” to its original drawing`, before);
}

/**
 * Back to factory state (default settings, Classic 5×7 drawings). With autosave
 * a page refresh no longer gives a clean slate, so this is the way to get one.
 * It is a single undo step, and the autosave is overwritten right away.
 */
function resetEverything() {
  saveUndo();
  const before = undoStack[undoStack.length - 1];
  Object.assign(state.params, DEFAULT_PARAMS);
  state.glyphs = {};
  for (const char of Object.keys(FONT_DATA)) state.glyphs[char] = [...FONT_DATA[char]];
  state.pristine = copyGlyphs(state.glyphs);
  syncParamControls();
  setActiveCharStyle('Classic');
  setLook('Rounded');
  syncFitHeight();
  refreshAll();
  writeAutosave();
  offerProjectUndo('Reset the project to its defaults', before);
}

// ─────────────────────────────────────────────
//  Saved styles — drawings + settings, kept in localStorage
// ─────────────────────────────────────────────

const STYLES_KEY = 'pfg-styles';

function readStyles() {
  try { const styles = JSON.parse(localStorage.getItem(STYLES_KEY)); return Array.isArray(styles) ? styles : []; }
  catch { return []; }
}

function writeStyles(styles) {
  try { localStorage.setItem(STYLES_KEY, JSON.stringify(styles)); return true; }
  catch { showToast('The style could not be saved: browser storage is full or blocked. Export your styles to keep them.', 0); return false; }
}

function restoreStyles(styles) {
  if (writeStyles(styles)) renderStylesList();
}

function saveCurrentStyle(name) {
  name = name.trim();
  if (!name) return false;
  const styles = readStyles();
  const before = structuredClone(styles);
  const idx = styles.findIndex(s => s.name === name);
  const entry = { name, params: { ...state.params }, glyphs: copyGlyphs(state.glyphs) };
  if (idx >= 0) styles[idx] = entry;
  else styles.push(entry);
  if (!writeStyles(styles)) return false;
  renderStylesList();
  showToast(idx >= 0 ? `Replaced the saved style “${name}”` : `Saved the style “${name}”`, 8000, () => restoreStyles(before), true);
  return true;
}

function applyStyle(saved) {
  const clean = sanitizeStyle(saved, state.params);
  if (!clean) { showToast(`“${saved.name}” could not be loaded: its data is not valid.`, 0); return; }
  saveUndo();
  const before = undoStack[undoStack.length - 1];
  const oldCols = state.params.cols, oldRows = state.params.rows;
  // Migrate legacy saves: 'gap' → gapX/gapY
  const migrated = { ...clean.params };
  if (migrated.gap != null && migrated.gapX == null) { migrated.gapX = migrated.gap; migrated.gapY = migrated.gap; }
  delete migrated.gap;
  Object.assign(state.params, migrated);

  const { cols, rows } = state.params;
  if (cols !== oldCols || rows !== oldRows) {
    for (const char of Object.keys(state.glyphs)) state.glyphs[char] = resizeGlyph(state.glyphs[char], oldCols, oldRows, cols, rows);
  }
  if (clean.glyphs) for (const [char, data] of Object.entries(clean.glyphs)) state.glyphs[char] = [...data];
  state.pristine = copyGlyphs(state.glyphs);

  setLook(null);
  syncParamControls();
  syncFitHeight();
  refreshAll();
  offerProjectUndo(`Loaded the style “${saved.name}”. It replaced your drawings and settings.`, before);
}

function deleteStyle(name) {
  const before = readStyles();
  if (!writeStyles(before.filter(s => s.name !== name))) return;
  renderStylesList();
  showToast(`Deleted the saved style “${name}”`, 8000, () => restoreStyles(before), true);
}

function exportStyles() {
  const styles = readStyles();
  if (!styles.length) return;
  downloadBlob('pixel-font-styles.json', new Blob([JSON.stringify(styles, null, 2)], { type: 'application/json;charset=utf-8' }));
  showToast(`Exported ${styles.length} saved ${styles.length === 1 ? 'style' : 'styles'} in pixel-font-styles.json`);
}

function importStyles(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let imported;
    try { imported = JSON.parse(reader.result); } catch { imported = null; }
    // A single style object is accepted as well as a list of them.
    if (imported && !Array.isArray(imported) && typeof imported === 'object') imported = [imported];
    if (!Array.isArray(imported)) {
      showToast(`“${file.name}” is not a styles file. Choose a .json file exported from Saved styles.`, 0);
      return;
    }
    const existing = readStyles();
    const before = structuredClone(existing);
    let added = 0, replaced = 0;
    for (const candidate of imported) {
      const entry = sanitizeStyle(candidate, state.params);
      if (!entry || !entry.name) continue;
      const idx = existing.findIndex(s => s.name === entry.name);
      if (idx >= 0) { existing[idx] = entry; replaced++; } else { existing.push(entry); added++; }
    }
    const skipped = imported.length - added - replaced;
    if (!added && !replaced) {
      showToast(`Nothing was imported from “${file.name}”: no entry has a name and valid settings.`, 0);
      return;
    }
    if (!writeStyles(existing)) return;
    renderStylesList();
    const parts = [`Imported ${added + replaced} ${added + replaced === 1 ? 'style' : 'styles'}`];
    if (replaced) parts.push(`${replaced} replaced a saved style with the same name`);
    if (skipped) parts.push(`${skipped} skipped for missing a name or valid settings`);
    showToast(parts.join('. ') + '.', 10000, () => restoreStyles(before), true);
  };
  reader.onerror = () => showToast(`Could not read “${file.name}”.`, 0);
  reader.readAsText(file);
}

function buildStylesUI() {
  const body = addSection($('params-panel'), 'styles', 'Saved styles', false);
  body.appendChild(hint('A saved style keeps every drawing and setting, so you can return to it or share it.'));

  const field = document.createElement('div');
  field.className = 'param-row';
  const label = Object.assign(document.createElement('label'), { htmlFor: 'style-name-input', textContent: 'Name' });
  const saveRow = document.createElement('div');
  saveRow.className = 'styles-save-row';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'style-name-input';
  nameInput.maxLength = 60;
  nameInput.autocomplete = 'off';
  const saveBtn = Object.assign(document.createElement('button'), { textContent: 'Save', disabled: true });
  nameInput.addEventListener('input', () => { saveBtn.disabled = !nameInput.value.trim(); });
  saveBtn.addEventListener('click', () => {
    if (saveCurrentStyle(nameInput.value)) { nameInput.value = ''; saveBtn.disabled = true; }
  });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });
  saveRow.append(nameInput, saveBtn);
  field.append(label, saveRow);
  body.appendChild(field);

  const list = document.createElement('div');
  list.id = 'styles-list';
  body.appendChild(list);

  const ioRow = document.createElement('div');
  ioRow.className = 'styles-io-row';
  const importBtn = Object.assign(document.createElement('button'), { textContent: 'Import…' });
  const fileInput = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json', hidden: true });
  fileInput.setAttribute('aria-label', 'Styles file');
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) importStyles(fileInput.files[0]);
    fileInput.value = '';
  });
  importBtn.addEventListener('click', () => fileInput.click());
  const exportBtn = Object.assign(document.createElement('button'), { textContent: 'Export all', id: 'btn-export-styles' });
  exportBtn.addEventListener('click', exportStyles);
  ioRow.append(importBtn, exportBtn, fileInput);
  body.appendChild(ioRow);

  renderStylesList();
}

function renderStylesList() {
  const list = $('styles-list');
  if (!list) return;
  const styles = readStyles();
  list.innerHTML = '';
  $('btn-export-styles').disabled = styles.length === 0;
  setSectionValue('styles', styles.length ? String(styles.length) : '');

  if (styles.length === 0) {
    list.appendChild(Object.assign(document.createElement('p'), { className: 'styles-empty', textContent: 'Nothing saved yet. Name the current style above to save it.' }));
    return;
  }
  for (const style of styles) {
    const item = document.createElement('div');
    item.className = 'style-item';
    const name = Object.assign(document.createElement('span'), { className: 'style-name', textContent: style.name, title: style.name });
    const loadBtn = Object.assign(document.createElement('button'), { textContent: 'Load' });
    loadBtn.setAttribute('aria-label', `Load the style ${style.name}`);
    loadBtn.addEventListener('click', () => applyStyle(style));
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn style-delete';
    delBtn.innerHTML = icon('close');
    delBtn.setAttribute('aria-label', `Delete the style ${style.name}`);
    delBtn.addEventListener('click', () => deleteStyle(style.name));
    item.append(name, loadBtn, delBtn);
    list.appendChild(item);
  }
}

// ─────────────────────────────────────────────
//  Settings ↔ controls
// ─────────────────────────────────────────────

/** Push current state.params back into all control inputs. */
function syncParamControls() {
  for (const def of PARAM_DEFS) {
    const value = state.params[def.key];
    const control = $(`param-${def.key}`);
    if (!control) continue;
    if (def.type === 'checkbox') control.checked = !!value;
    else control.value = value;
    const num = document.querySelector(`.param-num[data-key="${def.key}"]`);
    if (num) num.value = value;
  }
  const shape = state.params.cellShape || 'rect';
  document.querySelectorAll('.cell-shape-btn').forEach(b => setPressed(b, b.dataset.shape === shape));
  setSectionValue('shape', (CELL_SHAPES.find(([key]) => key === shape) || [])[1] || '');
  setSectionValue('grid', `${state.params.cols} × ${state.params.rows}`);
  updateConditionalParams();
}

/** Show only the settings that do something for the current pixel shape. */
function updateConditionalParams() {
  const p = state.params, shape = p.cellShape;
  const isNodes = shape === 'nodes';
  const visible = {
    outlineWidth: !!p.outline,
    outlineColor: !!p.outline,
    gapX: !isNodes,
    gapY: !isNodes,
    lockNodeRadius: isNodes,
    shapeWeight: ['ring', 'plus', 'diagonal', 'open', 'dash'].includes(shape),
    offColor: !!p.showOff,
    cornerRadius: ['rect', 'tile', 'slope'].includes(shape) || (isNodes && !p.lockNodeRadius),
    cornerMerge: shape === 'rect',
    bridgeRadius: shape === 'rect',
    diagFill: !isNodes,
    diagWidth: !!p.diagFill && !isNodes,
  };
  for (const [key, show] of Object.entries(visible)) {
    const row = document.querySelector(`.param-row[data-param-key="${key}"]`);
    if (row) row.hidden = !show;
  }
}

// ─────────────────────────────────────────────
//  Keyboard shortcuts
// ─────────────────────────────────────────────

function isTextEntry(t) {
  return !!t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
    (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'color', 'button', 'file'].includes(t.type)));
}

function handleShortcut(e) {
  if (e.defaultPrevented || isTextEntry(e.target)) return;   // text fields keep their native keys
  const mod = e.ctrlKey || e.metaKey;
  const done = () => e.preventDefault();

  if (mod && !e.altKey) {
    const key = e.key.toLowerCase();   // Shift turns 'z' into 'Z'
    if (key === 'z' && !e.shiftKey) { done(); if (toastUndo) toastUndo.run(); else undo(); }
    else if (key === 'y' || (key === 'z' && e.shiftKey)) { done(); redo(); }
    else if (key === 's') { done(); saveProjectFile(); }
    else if (key === 'c' && !String(getSelection()).length) { done(); copyCurrentChar(); }
    else if (key === 'v' && clipboard) { done(); pasteCurrentChar(); }
    return;
  }
  if (document.querySelector('.menu:popover-open')) return;

  if (e.altKey && !mod) {
    const fn = { KeyH: flipH, KeyV: flipV, KeyR: rotate90, KeyI: invertGlyph, KeyX: clearGlyph }[e.code];
    if (fn) { done(); applyTransform(fn); }
    return;
  }
  if (e.shiftKey && e.key.startsWith('Arrow')) {
    if (e.target.type === 'range') return;   // sliders use the arrow keys themselves
    const fn = { ArrowLeft: shiftLeft, ArrowRight: shiftRight, ArrowUp: shiftUp, ArrowDown: shiftDown }[e.key];
    done(); applyTransform(fn);
    return;
  }
  if (e.key === '[') { done(); stepChar(-1); }
  else if (e.key === ']') { done(); stepChar(1); }
  else if (e.key.length === 1 && e.key !== ' ' && state.glyphs[e.key]) { done(); selectChar(e.key); }
}

// ─────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  $('btn-help').innerHTML = icon('help');
  $('btn-prev-char').innerHTML = icon('prev');
  $('btn-next-char').innerHTML = icon('next');

  init();
  initEditorEvents();

  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  $('btn-theme').addEventListener('click', toggleTheme);
  $('btn-prev-char').addEventListener('click', () => stepChar(-1));
  $('btn-next-char').addEventListener('click', () => stepChar(1));

  // Menus close once an action has run; the toast confirms what happened.
  const menuAction = (id, fn) => $(id).addEventListener('click', (e) => { closeMenus(); fn(e.currentTarget); });
  menuAction('exp-font', exportFont);
  menuAction('exp-svg', exportCurrent);
  menuAction('exp-png', exportCurrentPNG);
  menuAction('exp-zip', exportAll);
  menuAction('exp-pngzip', exportAllPNG);
  menuAction('exp-sprite', exportSprite);
  menuAction('exp-text', exportTypeTester);
  menuAction('btn-save-project', saveProjectFile);
  menuAction('btn-reset-all', resetEverything);
  menuAction('btn-open-project', () => $('project-file').click());
  $('project-file').addEventListener('change', (e) => {
    if (e.target.files[0]) openProjectFile(e.target.files[0]);
    e.target.value = '';
  });

  $('font-name').addEventListener('input', (e) => { state.fontName = e.target.value; scheduleAutosave(); });
  $('param-padding').addEventListener('change', (e) => {
    const v = Math.min(40, Math.max(0, Math.round(Number(e.target.value) || 0)));
    beginParamEdit('padding');
    applyParam('padding', v);
    endParamEdit();
  });

  // Flush a pending autosave when the page is closed / reloaded
  window.addEventListener('pagehide', () => { if (autosaveTimer) writeAutosave(); });
  document.addEventListener('keydown', handleShortcut);
});
