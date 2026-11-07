# Pixel Terminal Font Generator

A browser-based pixel font editor for designing and exporting custom bitmap/vector fonts — no build step, no dependencies.

**Live demo:** https://goodbyehorses.github.io/pixel-terminal-font/

## Features

- **Grid editor** — click or drag to toggle pixels on each character in a 5×7 (configurable) grid
- **Live preview** — renders the current glyph as SVG in real time
- **Type tester** — type sample text to preview the full font in context
- **Font preview strip** — shows all glyphs at once
- **Character styles** — Classic, Square, Curved, Modular, Serif, Bold, Condensed (4×7), Italic, Stencil, LCD (5×8 with descenders)
- **Style presets** — one-click styles (Rounded, Dots, Italic, Outlined, LED, Diamond, Rings, Honeycomb, Halftone, Slope, Mosaic, LCD, Open, Dashed, Fine, Pinpoint, Wireframe, Nixie, Pegboard, Speed, StitchGrid, Voxel Cloud, Holo Slice, etc.)
- **Cell shapes** — rect, circle, nodes, horizontal/vertical bars, pixel, diamond, ring, cross, hexagon, diagonal stripes, halftone, slope, tile, open square, dash
- **Per-parameter controls** — grid cols/rows, cell size, horizontal/vertical gap, corner radius, inner radius, bridge radius, merge corners, diagonal fill, skew, outline width, dot size, shape weight, unlit pixels, colors, padding, char spacing
- **Undo / Redo** — up to 60 steps covering pixel edits and all parameter changes (Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y)
- **Autosave** — your work is kept in the browser and restored on reload; the header "Reset All" returns to factory defaults
- **Export options**
  - Single glyph SVG
  - All glyphs as one ZIP (one SVG per character, named by code point, e.g. `u0041-A.svg`)
  - PNG at configurable pixel scale (1×–16×)
  - Sprite SVG (all characters in one file)
- **Light / dark mode** toggle
- **Save / load styles** — named styles kept in browser localStorage, with JSON export / import

## Usage

Open `index.html` directly in a browser — no server required.

1. Select a character from the left panel
2. Toggle pixels in the grid editor
3. Adjust style parameters in the right panel
4. Preview in the type tester at the bottom
5. Export via the buttons in the header

## Files

```
index.html             — app shell
css/style.css          — all styles
js/font-data.js        — default glyph bitmap data
js/renderer.js         — SVG rendering engine
js/app.js              — state, UI, event handling, export logic
test/                  — Node test suite for font-data.js and renderer.js
circle-join-prototype/ — historical standalone prototype of the circle-join
                         technique behind the Nodes cell shape (now part of
                         renderer.js); kept as a demo, not used by the app
```

Saved styles live in your browser's localStorage. "Export" in the Styles panel
downloads them as `pixel-font-styles.json`; such exports are git-ignored.

## Development

There is no build step and no runtime dependency. The tests need Node.js 22+
and use only the built-in `node:test` runner:

```
npm test            # or: node --test "test/**/*.test.js"
```

`test/helpers/load.js` evaluates `js/font-data.js` and `js/renderer.js` in a
`node:vm` context, so the browser scripts are tested as-is. CI
(`.github/workflows/ci.yml`) runs `node --check` on every `js/*.js` file and
`npm test` on each push and pull request.

## License

MIT — see [LICENSE](LICENSE).
