---
name: pixel-base-characters
description: "Create and revise complete bitmap Base Characters sets for the Pixel Font Generator, with importable styles, themed looks and visual specimens. Use for new pixel alphabets, grid letterforms or redesigning an existing set for this generator."
---

# Pixel Base Characters

You are designing a typeface on a pixel grid for someone who will judge it by eye. What they want is a set that **feels like the thing they described**, has real character, and still reads. A valid file is only the starting point.

The Pixel Font Generator has two layers:
- **Base Characters** (the **Letterforms** section in the app): the bitmaps, meaning which pixels are on for each character on a `cols × rows` grid. This is the font's anatomy.
- **Looks**: how lit pixels are drawn: cell shape (rect, circle, horizontal scanlines, rings…), gaps, rounding, colours, unlit pixels.

You design the anatomy. You also suggest one to three looks that put the set in its world, such as green phosphor scanlines for a terminal, amber LED dots for a station sign, or chunky rounded tiles for a kids' game. People decide whether they like a font from how it appears in context, so a set without a look undersells itself.

The generator is the sandbox. The deliverable is a style file the user loads with **Saved styles → Import → Load**. No app code changes.

## Deliverables

For each set, in the folder the user names (default `generated-fonts/<slug>/` in the repo):
1. `<slug>.source.json`: the editable source, with rows of `#` (on) and `.` (off), your looks and your theme sample lines.
2. `<slug>.style.json`: from `scripts/build_font.js`. It holds the set on its own, plus one entry per look.
3. `<slug>.specimen.png`: from `scripts/specimen.js`. It shows the set in each look first, then the full character map.
4. A short note covering the concept, the grid and metrics, what makes the set distinctive, the looks, any compromises, and how to import it.

## What makes a set good

**Give the letterforms a clear identity.** The strongest pixel fonts are distinctive in proportion, weight and detail:
- **Proportion**: wide or condensed, a tall or low x-height, and how capitals relate to lowercase.
- **Stroke and weight**: hairline, mono-weight or heavy. Where the weight sits, and whether there is contrast between horizontals and verticals.
- **Curves and corners**: a square, cut corner, 45° step or rounded staircase, used *consistently* across O C G S o e a 0 6 9.
- **Terminals and details**: hooked or flat tails, flagged 1, slashed or dotted 0, single- or double-storey a and g, and how y j g descend.
- **Rhythm and spacing**: monospace evenness versus a varied width per letter.

A strong set picks a clear stance on several of these and holds it across the alphabet. Experimental briefs also allow seams, interruptions, unusual skeletons and other expressive rules. Judge these in words: keep the idea when it creates a convincing identity and revise the individual letters that become ambiguous. Do not flatten an adventurous brief into conventional signage merely to make every shape familiar.

**Feel the brief.** Before drawing, picture where this type lives (a ship's corridor sign, a 1980s terminal, a candy wrapper) and list what that world does to letters. Is it engineered or hand-made, cramped or generous, cold or warm, worn or pristine? Let that steer every choice above, and write the sample lines from that world.

## Workflow

### 1. Concept and system

Write down the following; it goes in `concept` in the source file:
- **Grid**: `cols` is 3–14 and `rows` is 3–16, which are the app's limits. Pick it from the brief using `references/pixel-type-craft.md` (grid and metrics table). Real descenders need rows below the baseline. Å, Ä and Ö need room above the caps or a compressed cap shape.
- **Metrics**: the rows for cap height, x-height, baseline and descender. Every glyph obeys them.
- **The stance**: your choices on proportion, stroke, curves, terminals and rhythm from "What makes a set good".

For open or experimental briefs, sketch 2–3 genuinely different directions on `Hamburgefonts 0123` (as rows in your notes). Compare the directions in the same sample words and at the same size. For an unexpected brief, include a direction that takes a structural risk. Choose for the requested mood as well as coherence and readability. If the user has a preferred previous result, use it as the visual reference and preserve the qualities they value; a technically cleaner replacement is not automatically better. Say in your note why the direction won.

### 2. Draw the key glyphs first, then propagate

Draw `H O n o a e g 0 1` first. They fix stems, bowls, x-height and descenders. Derive related shapes from them:
- n → h m r u
- o → b d p q c e
- O → C D G Q
- H → E F I L T

Then do the figures, then punctuation and symbols. Most weak sets come from glyphs drawn one by one with drifting stem widths or metrics.

```json
{
  "name": "Display Name",
  "cols": 6, "rows": 9,
  "concept": "Grid, metrics and the stance, in one paragraph.",
  "params": { },
  "looks": [
    { "name": "Green phosphor", "params": { "cellShape": "horizontal", "cellWidth": 10, "cellHeight": 12, "gapX": 0, "gapY": 2, "fgColor": "#4cff8a", "bgColor": "#07130b" } }
  ],
  "samples": ["$ ping -c 4 deck07.local", "DECK 07: HYDROPONICS"],
  "glyphs": { "A": ["..##..", ".#..#.", "..."], "...": [] }
}
```

- `glyphs`: the 95 core characters. `scripts/common.js` lists them, and the builder reports any that are missing. The app also has accented letters, symbols, box drawing and Powerline characters; drawing them is optional, and the ones left out keep the app's Classic drawing. Escape `"` and `\` as JSON requires: `"\""` and `"\\"`.
- `params`: leave this empty or keep it minimal. It's the set's own entry, which users load when they want to keep their current look.
- `looks`: 1–3 named looks that fit the brief. They can use any app param:
  - `cellShape`: `rect circle nodes horizontal vertical pixel diamond ring plus hexagon diagonal halftone slope tile open dash`
  - size and spacing: `charSpacing` (0–120, added between glyph cells), `cellWidth/cellHeight` (6–120), `gapX/gapY`, `cornerRadius`, `cornerMerge`, `dotSize` (pixel fill %), `shapeWeight`
  - effects: `diagFill` + `diagWidth`, `skewX`, `outline` + `outlineWidth/outlineColor`
  - unlit pixels: `showOff` + `offColor`
  - colours: `fgColor/bgColor`, as `#rrggbb` hex
- `samples`: 2–3 short lines from the brief's world, such as signage, UI labels or a prompt. They lead the specimen, so make them sell the font. Use only characters from the set (no lowercase å ä ö, no `;`).

### 3. Build and fix

```bash
node <skill>/scripts/build_font.js <slug>.source.json
```

It checks rows, characters, missing and blank glyphs, and look-alike pairs that are identical (O/0, I/l/1, S/5, B/8, A/Å/Ä, …). It then runs the app's own `sanitizeStyle` on the set and on every look, so a pass means the file imports. It also tells you about any look param the app ignores. Fix errors, and treat warnings as real problems.

### 4. Look at it, critique, revise

```bash
node <skill>/scripts/specimen.js <slug>.style.json
```

**Open the PNG with the available image viewer and look at it like the user will.**
- **The top section** (each look with your samples): does it feel like the brief? Would you want to use it?
- **The character map and text samples** are the technical check. Run the checklist in `references/pixel-type-craft.md`: readability, look-alike pairs, consistent stems and metrics, descenders, and whether the stance shows across caps, lowercase *and* figures.

Check spacing in continuous text, especially `minimum`, `mwmw`, `nnnn` and `LEVEL 444`. The plain specimen adds its own spacing, so it cannot prove that a saved look is comfortably spaced. Compare the looks at matched letter height; increase `charSpacing` when words feel tight, allowing for outlines that extend beyond the cells. Keep a fixed requested grid; use look spacing before sacrificing drawing columns.

Revise, rebuild and look again when the review reveals a problem. Keep successful results when feedback supports them. Also revise the looks if they don't flatter the set: colour, cell shape and gaps change the feel enormously.

### 5. Deliver

Report the paths, then the note. Import steps:
1. In the app's Styles panel, click **Import** and choose `<slug>.style.json`.
2. Click **Load** next to the set or one of its looks.

The plain entry keeps your current look; a look entry also applies colours and cell shape. Loading switches the grid to the set's `cols × rows`.

To make the set a permanent Base Characters button later: the source rows already use the format `glyphsFromRows` uses in `js/font-data.js`. Mention this only if asked.

## Files

- `scripts/build_font.js`: checks the source file and writes the importable style file (the set plus its looks). Run it with no arguments to print its usage.
- `scripts/specimen.js`: renders the specimen through the app's real renderer in headless Chromium. It needs `chromium` or `google-chrome` on PATH, or `--chrome <bin>`.
- `scripts/common.js`: the required character list and the look-alike sets.
- `references/pixel-type-craft.md`: grid and metrics choices, construction techniques, small-grid tricks, the review checklist. Read it in step 1, and again whenever a glyph won't come right.
