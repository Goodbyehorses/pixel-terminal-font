'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Every character the app has a button for (CHAR_GROUPS in js/app.js), in display order.
const REQUIRED_CHARS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'0123456789',
  'Å', 'Ä', 'Ö',
  '.', ',', '!', '?', ':', '-', "'", '(', ')',
  '@', '#', '$', '%', '&', '*', '+', '=', '/', '\\', '<', '>', '[', ']', '{', '}', '"', '~', '^', '_', '|',
];

// Glyphs readers confuse; identical bitmaps within a set are flagged.
const CONFUSABLE_SETS = [
  ['O', '0', 'o', 'D', 'Q'], ['I', 'l', '1', '|', 'i', '!'], ['S', '5', 's'], ['B', '8'], ['Z', '2', 'z'],
  ['G', '6'], ['g', '9', 'q'], ['n', 'h'], ['u', 'v'], ['.', ','], [':', ';'], ["'", '"', ','], ['-', '_', '~'],
  ['(', '[', '{', '<'], [')', ']', '}', '>'], ['/', '\\'], ['A', 'Å', 'Ä'], ['O', 'Ö'],
];

/** Walk up from `start` to the folder that holds js/renderer.js (the generator repo). */
function findRepo(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'js', 'renderer.js')) && fs.existsSync(path.join(dir, 'js', 'font-data.js'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('Could not find the pixel-terminal-font repo (js/renderer.js); pass --repo <path>');
    dir = up;
  }
}

module.exports = { REQUIRED_CHARS, CONFUSABLE_SETS, findRepo };
