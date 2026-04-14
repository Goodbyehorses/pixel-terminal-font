# Pixel Terminal Font Generator

A browser-based pixel font editor for designing and exporting custom bitmap/vector fonts — no build step, no dependencies.

## Features

- **Grid editor** — click or drag to toggle pixels on each character in a 5×7 (configurable) grid
- **Live preview** — renders the current glyph as SVG in real time
- **Type tester** — type sample text to preview the full font in context
- **Font preview strip** — shows all glyphs at once
- **Style presets** — one-click styles (Classic, Rounded, Circle, Italic, Outline, etc.)
- **Cell shapes** — rect, circle, horizontal bar, vertical bar, pixel, and more
- **Per-parameter controls** — cell size, gap, corner radius, inner radius, bridge radius, skew, outline width, colors, padding, char spacing
- **Undo / Redo** — up to 60 steps (Ctrl+Z / Ctrl+Shift+Z)
- **Export options**
  - Single glyph SVG
  - All glyphs SVG (one file per character)
  - PNG at configurable pixel scale (1×–16×)
  - Sprite SVG (all characters in one file)
- **Light / dark mode** toggle
- **Save / load styles** as JSON

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
pixel-font-styles.json — saved style presets
```

## License

MIT
