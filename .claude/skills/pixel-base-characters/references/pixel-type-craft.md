# Pixel type craft

Contents: 1. Grid and metrics · 2. Construction · 3. Small-grid tricks · 4. Making it distinctive · 5. Review checklist

## 1. Grid and metrics

Rows are numbered from 0 at the top. Decide the **cap height**, **x-height**, **baseline** (the last row that capitals sit on) and **descender** rows before drawing anything.

| Grid | Good for | Typical metrics |
|---|---|---|
| 3×5 | tiny HUD/status text | caps = all 5 rows. Lowercase = small caps, or 3-row x-height with no descenders. Diacritics replace the top row. |
| 4×6 / 4×7 | condensed terminal | caps rows 0–5. On 7 rows, row 6 is a 1-row descender. |
| 5×7 | the classic dot-matrix | caps rows 0–6 and no real descenders: g j p q y sit raised, or are squeezed into the baseline row. The app's Classic set does this. |
| 5×8 / 5×9 | 5×7 with descenders | caps rows 0–6, descender row(s) 7–8, x-height starting at about row 2. |
| 6×9 – 6×11 | terminal fonts with room for detail | caps about 7 rows, x-height 5, 2 descender rows, 1 accent row on top for ÅÄÖ |
| 7×7 – 8×8 | wide / arcade / display | 2-pixel stems and real 3-pixel counters become possible |
| 9×12 + | detailed display, contrast, serifs | thick/thin contrast, real curves, ink traps |

**Width**: leave at least one empty column on one side (usually the right) of most glyphs. Otherwise letters touch in text, because the app adds no spacing beyond the `charSpacing` param. Very narrow glyphs (i, l, !, ., |) can sit centred.

**Diacritics (Å Ä Ö)**:
- Best: one or two rows above cap height reserved for accents.
- Without that, compress the capital by one row and put the dots or ring in row 0.
- Å needs a ring, or at least a mark visibly different from Ä's two dots.

## 2. Construction

- **Stems**: pick 1 or 2 pixels and keep it everywhere. Mixing widths reads as broken unless it's a deliberate contrast rule, for example "verticals 2, horizontals 1".
- **Bowls and curves**: on small grids, cut the corner pixel of a box (`.###.` over `#...#`). The more pixels you drop at corners, the rounder the shape looks. Keep the same corner treatment on O C D G Q o c e a b d p q.
- **Diagonals** (A K M N V W X Y Z 2 4 7 / \ < >): use clean one-pixel steps. Avoid two pixels side by side in a diagonal stroke unless every diagonal does the same.
- **Joins**: where a diagonal meets a stem (K, R leg), let them touch at a corner rather than overlapping into a blob.
- **Figures**: give 0 something O lacks (a slash, a dot, or a narrower width). Give 1 a flag and/or a foot, so it differs from l and I. Make 5 and S differ in their top-left corner or the flatness of their top.
- **I vs l vs 1 vs |**: give I serifs (top and bottom bars). Give l a tail or a foot. Give 1 a flag. Make | a full-height plain line.
- **Punctuation**: `.` is 1–2 pixels on the baseline. `,` is a `.` with a 1-pixel tail down-left. `'` and `"` sit at cap height. `-` sits at x-height middle and `_` on the baseline or descender row. Make brackets ( [ { < visibly different from each other.

## 3. Small-grid tricks (≤ 5×7)

- Let lowercase sit on fewer rows: x-height 4–5 rows.
- m and w need all 5 columns. Accept that their stems touch, and draw them as `#.#.#` patterns.
- g, y and q can borrow the baseline row: draw the bowl higher and the tail in the last row.
- e: a crossbar row with an open bottom-right corner is enough.
- Symbols like @ # % & are approximations at this size; aim for "recognisable in context".

## 4. Making it distinctive

Distinctive sets combine several clear choices, held consistently:

- **Proportion**: extreme wide (7×5) or condensed (3×9); a tall x-height (signage, contemporary) or a low one (classical, bookish); capitals that are wider than lowercase, or the same width.
- **Stroke**: hairline single-pixel (light, technical, futuristic), 2-pixel (sturdy, friendly), or contrast (thick verticals with thin horizontals reads editorial; the reverse reads western or poster).
- **Corners and curves**: square (engineered), one cut pixel (soft terminal), 45° steps (aerospace, signage), or stepped quarter-circles (round, friendly). One treatment, everywhere.
- **Details**: single- versus double-storey a and g; flat versus hooked tails on j y g; a slashed versus dotted 0; flags on 1; how wide M and W are; whether i and j have square or round dots.
- **Spacing and rhythm**: monospace evenness (terminal) versus a varied width per letter (signage, display).

Ways to land somewhere unexpected *and* good:
- **Borrow anatomy from another tradition.** Take the construction of square Kufic, stencil, OCR, cross-stitch or a split-flap board, and apply it to the whole Latin alphabet consistently.
- **Push proportion and stroke together.** Wide plus hairline, or condensed plus heavy, makes a strong silhouette.
- **Pick one memorable detail and repeat it.** For example, every terminal ends in a 45° step, or every bowl opens to the right.

For experimental briefs, test interruptions, cuts and unusual skeletons in complete words. Keep expressive rules that fit the brief; repair ambiguous glyphs locally rather than banning the construction. Compare with any user-preferred reference before replacing it with a more conventional design.

## 5. Review checklist (run on the specimen PNG)

1. All six sample lines read at a glance. Ignore glyphs you know; read it like a stranger would.
2. Confusables differ: O/0/o/D/Q, I/l/1/|/i/!, S/5, B/8, Z/2, G/6, g/9/q, n/h, u/v, ./,, '/", -/_/~, ([{< and )]}>, A/Å/Ä, O/Ö.
3. Stem width is consistent across the map. Scan each row of the character map for a glyph that looks bolder or thinner than its neighbours.
4. Cap height, x-height and baseline line up across the map. Descenders go below the baseline (on grids that have descender rows).
5. Glyphs in the text samples do not touch or merge, and spacing feels comfortable at the intended size. Check dense runs such as minimum, mwmw and LEVEL 444 in each saved look, including outlines. Compare spacing at matched letter height, not merely by fitting both samples to the page width.
6. The stance (proportion, stroke, corners, details) shows across caps, lowercase *and* figures, not only in a few letters.
7. No glyph is blank, and nothing is clipped at the grid edges unintentionally.
8. The top of the specimen (the set in its looks with the theme samples) feels like the brief. If it looks generic, change the anatomy or the look.
