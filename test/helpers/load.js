// Load the browser classic scripts (font data, renderer, font export) into a
// node:vm context and return their top-level declarations as an object.
// Top-level const/let/function declarations of a classic script are not
// properties of the global object, so they are collected by evaluating a
// trailing object literal in the same script scope.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const FILES = ['js/font-data.js', 'js/renderer.js', 'js/font-export.js'];
const EXPORTS = [
  'FONT_COLS', 'FONT_ROWS', 'FONT_DATA', 'FONT_MAPS', 'CHAR_STYLES', 'bestFontSource',
  'generateGlyphPath', 'generateGlyphSVG', 'glyphDimensions',
  'skewExtraWidth', 'resolveGaps',
  'generateTTF', 'detectMetrics', 'pathToContours', 'glyphContours',
];

function load() {
  const code = FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  const context = vm.createContext({ console });
  return vm.runInContext(`${code}\n;({ ${EXPORTS.join(', ')} });`, context, {
    filename: 'pixel-font-scripts.js',
  });
}

module.exports = { load };
