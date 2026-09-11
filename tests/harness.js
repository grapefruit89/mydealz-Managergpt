/**
 * tests/harness.js
 * Minimale Test-Infrastruktur ohne npm-Abhängigkeiten.
 *
 * Muster: build.js konkateniert die IIFE-Module zu EINEM Script (kein
 * import/export im MV3-Content-Script). Tests tun dasselbe: Dateien
 * konkatenieren, module.exports-Guards raus, gemeinsam eval-en — exakt die
 * Browser-Runtime-Semantik, in Node mit gemockten globalen Objekten.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** module.exports-Guards entfernen (die sind für Node-Direct-Use, nicht fürs Bundle) */
function strip(code) {
  return code
    .split('\n')
    .filter(l => !/^\s*if\s*\(\s*typeof\s+module\b/.test(l))
    .join('\n');
}

/**
 * Konkateniert Dateien (in Bundle-Reihenfolge) und evaluiert sie gemeinsam —
 * die Module teilen sich denselben Scope wie im echten Browser-Bundle.
 *
 * @param {string[]} relFiles  – Pfade relativ zum Repo-Root, z.B. ['src/core/logger.js', ...]
 * @param {Object}   opts
 * @param {Function} opts.setup  – Stubs einrichten (globals) VOR dem Eval
 * @param {string[]} opts.expose – Modul-Globals, die zurückgegeben werden sollen
 * @returns {Object} { name: value }
 */
function loadBundle(relFiles, { setup = () => {}, expose = [] } = {}) {
  setup();
  const src = relFiles
    .map(rel => strip(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')))
    .join('\n');
  const names = expose.join(', ');
  // eslint-disable-next-line no-eval
  eval(src + `\nglobalThis.__t = { ${names} };`);
  const out = {};
  for (const name of expose) out[name] = globalThis.__t[name];
  delete globalThis.__t;
  return out;
}

/** Pfad-Helfer für Datei-Ladeaufrufe aus den Tests heraus */
function src(...parts) {
  return ['src', ...parts].join('/');
}

let _passed = 0;
function assert(cond, msg) {
  if (!cond) {
    throw new Error('ASSERT FAILED: ' + msg);
  }
  console.log('  ok: ' + msg);
  _passed++;
}

/**
 * Liest MODULE_ORDER direkt aus build.js — SSOT statt von Hand gepflegter
 * Test-Dateilisten (P1.2, Claude/DeepSeek-Review-Fund F2). Ohne 'content.js'
 * (Entry-Point ruft start() auf — darf in Tests nicht laufen).
 * Die Tests laden denselben Bundle-Plan wie der echte Build -> kein Drift.
 */
function moduleOrder({ excludeContent = true } = {}) {
  const build = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const m = build.match(/const MODULE_ORDER = \[([\s\S]*?)\n\];/);
  if (!m) throw new Error('MODULE_ORDER in build.js nicht gefunden');
  const files = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  const list = excludeContent ? files.filter(f => f !== 'content.js') : files;
  // MODULE_ORDER-Einträge sind relativ zu src/ (readModule in build.js)
  return list.map(f => 'src/' + f);
}

module.exports = { loadBundle, assert, src, moduleOrder, ROOT: path.join(__dirname, '..') };
