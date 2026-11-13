# Pixel Terminal Font Generator

A browser-based pixel font editor for designing pixel lettering and exporting it as a font file or as SVG and PNG artwork — no build step, no dependencies.

**Live demo:** https://goodbyehorses.github.io/pixel-terminal-font/

## Features

- **Glyph map**: every character as a live thumbnail in the current look. The active character is highlighted and edited drawings are marked.
- **252 characters**: full ASCII, Western European accented letters, typographic punctuation, currency and math symbols, arrows and shapes, box drawing, block elements and the Powerline symbols. The letterform sets redraw letters, digits and basic punctuation; the remaining characters come from the Classic drawings, scaled to the grid.
- **Pixel editor**: click or drag to draw on a 5×7 (configurable) grid that fills the space available, with cap, x-height and baseline guides.
- **Drawing tools**: shift, flip, rotate, invert, copy and paste, mirror while drawing, area fill, three brush sizes, clear, and reset to the original drawing. Shift-click a transform to apply it to every character.
- **Live preview and type tester**: the current character and a line of sample text, redrawn on every pixel.
- **Looks**: 47 one-click looks (Pixel, Rounded, Dots, Nodes, LED, Outlined, Scanline, Slope, Slanted and more), each shown as a thumbnail of your own "Aa".
- **Letterforms**: ten base character sets (Classic, Square, Curved, Modular, Serif, Bold, Condensed 4×7, Italic, Stencil, LCD 5×8 with descenders).
- **Pixel shapes**: rect, circle, nodes, horizontal and vertical bars, pixel, diamond, ring, cross, hexagon, diagonal stripes, halftone, slope, tile, open square, dash.
- **Settings**: grid size, pixel size and fill, gaps, character spacing, corner and bridge radius, joined corners, diagonal joins, slant, outline, unlit pixels and colors.
- **Undo / Redo**: up to 60 steps covering pixel edits and every setting.
- **Autosave**: your work is kept in the browser and restored on reload. **Project → Save project file** writes a `.pixelfont.json` you can keep or move to another machine; **Project → Reset project** returns to the defaults.
- **Export**
  - Font file (`.ttf`): an installable monospaced TrueType font that keeps the pixel shape, corners, joins, slant and spacing. Outline and unlit pixels are artwork-only and are left out; the export says so when that applies.
  - Single character as SVG or PNG (1×–16×)
  - All characters as a ZIP of SVGs or PNGs (named by code point, e.g. `u0041-A.svg`)
  - Sprite sheet SVG (all characters in one file)
  - The type tester text as one SVG
- **Light / dark theme**, following the system setting until you choose one.
- **Saved styles**: named snapshots of the drawings and settings, kept in browser localStorage, with JSON export / import.

## Usage

Open `index.html` directly in a browser — no server required.

1. Pick a character in the glyph map, or type it
2. Draw it in the pixel editor
3. Choose a look and adjust the settings on the right
4. Check it in the type tester
5. Export a font file or artwork from the **Export** menu

### Keyboard shortcuts

| Keys | Action |
|---|---|
| `[` `]` | Previous / next character |
| any character | Jump to that character |
| Arrows, Space | Move in the grid, toggle a pixel |
| Shift + Arrows | Shift the drawing by one pixel |
| Alt + H / V / R | Flip horizontally / vertically, rotate 90° |
| Alt + I / X | Invert / clear the drawing |
| Ctrl + C / V | Copy / paste a drawing |
| Ctrl + Z, Ctrl + Shift + Z | Undo, redo |
| Ctrl + S | Save a project file |

Shortcuts are inactive while a text field has focus. The same list is under the **?** button in the app.

## Files

```
index.html             — app shell, menus and help
css/style.css          — all styles
js/font-data.js        — default glyph bitmap data
js/renderer.js         — SVG rendering engine
js/font-export.js      — TrueType (.ttf) writer
js/app.js              — state, UI, event handling, export logic
test/                  — Node test suite for font-data.js, renderer.js and font-export.js
circle-join-prototype/ — historical standalone prototype of the circle-join
                         technique behind the Nodes pixel shape (now part of
                         renderer.js); kept as a demo, not used by the app
```

Saved styles live in your browser's localStorage. "Export all" in the Saved
styles section downloads them as `pixel-font-styles.json`; such exports are
git-ignored.

## Development

There is no build step and no runtime dependency. The tests need Node.js 22+
and use only the built-in `node:test` runner:

```
npm test            # or: node --test "test/**/*.test.js"
```

`test/helpers/load.js` evaluates `js/font-data.js`, `js/renderer.js` and
`js/font-export.js` in a `node:vm` context, so the browser scripts are tested as-is. CI
(`.github/workflows/ci.yml`) runs `node --check` on every `js/*.js` file and
`npm test` on each push and pull request.

## License

MIT — see [LICENSE](LICENSE).
