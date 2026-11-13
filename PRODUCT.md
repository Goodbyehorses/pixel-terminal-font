# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Designers making pixel lettering for logos, posters and graphics. They draw or adjust characters, choose how the pixels are rendered, and take the result into other design tools. (Confirmed by the owner, November 2026.)

## Product Purpose

Pixel Font Generator is a browser tool for drawing a pixel character set and rendering it in many looks. The same drawings can be exported as artwork (SVG, PNG, sprite sheet) or as an installable font file. Success is a designer leaving with lettering they can use straight away.

## Positioning

Open decision: not yet confirmed with the owner. Working reading from the code: the rendering engine is the differentiator. One set of pixel drawings can be shown as rounded, joined, dotted, ringed, slanted or LED-style lettering without redrawing anything.

## Operating Context

- Runs as a static page, opened from disk or from GitHub Pages (`goodbyehorses.github.io/pixel-terminal-font`).
- Work is autosaved in the browser's localStorage. A project file (`.pixelfont.json`) is the durable copy.
- A bundled agent skill (`.claude/skills/pixel-base-characters`) generates character sets as style files that are imported through Saved styles.

## Capabilities and Constraints

- No build step and no runtime dependencies. This is a hard constraint: everything, including the TrueType writer in `js/font-export.js`, is hand-written vanilla JavaScript loaded as classic scripts.
- Output: font file (`.ttf`, monospaced), single-character SVG and PNG, ZIPs of all characters, sprite sheet SVG, type tester text SVG.
- The font file carries what a filled outline can express: pixel shape, corners, joins, slant and spacing. Outline and unlit pixels are artwork-only.
- Terminology used in the interface: **Letterforms** (the base character set), **Look** (a one-click set of rendering settings), **Pixel shape**, **Saved styles** (drawings plus settings, stored in the browser), **Project file**.
- Character set: 252 characters. Full ASCII, Western European accented letters (Latin-1), typographic punctuation, currency and math symbols, arrows and shapes, box drawing, block elements and the seven Powerline symbols. Only the Classic letterforms draw the characters beyond the original 95; other letterforms and grid sizes scale the Classic drawings.

## Product Principles

1. The drawing is the centre of the screen; settings support it.
2. Every destructive action is instant and undoable, never guarded by a confirmation dialog.
3. The interface stays neutral so the artwork carries the character.
4. Say plainly what an export contains and what it leaves out.

## Accessibility & Inclusion

The pixel editor, glyph map and toolbar are each one keyboard tab stop with arrow-key navigation. Text contrast is kept at 4.5:1 or better in both themes. No further standard has been set by the owner.
