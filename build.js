/**
 * build.js
 * Concatenation-based bundler for mydealz Manager extension.
 * Produces:
 *   dist/content.js   – extension content script (all modules bundled)
 *   dist/userscript.js – Tampermonkey-compatible userscript (Greasyfork)
 *
 * Run: node build.js
 * Requires Node.js >= 16. No external dependencies.
 */

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC  = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// Order matters: core first, then features, then main entry point
// Ladereihenfolge: Core (Infrastruktur) → Features → content.js
const MODULE_ORDER = [
  // ── Core: Infrastruktur ─────────────────────────────────────────────────────
  'core/logger.js',             // Logging (muss zuerst laden)
  'core/message-types.js',      // Message-Registry (SSOT, audit via tests/message-audit)
  'core/storage.js',            // chrome.storage Wrapper
  'core/settings-schema.js',    // SSOT: Keys/Defaults/UI-Zugehörigkeit (VOR settings-store)
  'core/prompt-levels.js',      // SSOT: Prompt-Stufen des Exporters (VOR exporter)
  'core/settings-store.js',     // Einstellungen lesen/schreiben
  'core/deal-parser.js',        // DOM → Deal-Objekt
  'core/deal-normalizer.js',    // SSOT: GQL-Thread-Normalisierung (VOR graphql-client)
  'core/graphql-client.js',     // GQL-Fetch mit Retry/429
  'core/settings-modal.js',     // Settings-Modal (CSS + öffnen/speichern)
  // ── Features ────────────────────────────────────────────────────────────────
  'features/deal-filter-engine.js',   // Filter-Logik (pure, kein DOM)
  'features/deal-filter-ui.js',       // CSS-Vars + ✕/⚙ Buttons + Ghost/Hidden
  'features/exporter.js',                     // KI-Export (Detail-Seiten)
  'features/collector.js',                  // Deal Collector (Listing-Seiten)
  'features/sort-memory.js',                // Sortierpräferenz merken (opt-in)
  'features/permalink-tools.js',            // Permalink-Übersetzer (Popup → Tab)
  // ── Entry point ─────────────────────────────────────────────────────────────
  'content.js',
];

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         mydealz Manager (Userscript build)
// @namespace    https://github.com/grapefruit89/mydealz-Managergpt
// @version      2.0.0
// @description  Deals filtern, Haendler/User blocken, Preis- und Temperaturgrenzen setzen
// @author       Flo (9jS2PL5T) & Moritz Baumeister (grapefruit89)
// @match        https://www.mydealz.de/*
// @match        https://www.preisjaeger.at/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @run-at       document-idle
// ==/UserScript==
`;

// Shim: maps chrome.storage.local calls to GM_getValue/GM_setValue
const USERSCRIPT_STORAGE_SHIM = `
// GM -> chrome.storage shim (Tampermonkey compatibility)
const chrome = {
  storage: {
    local: {
      get: (defaults) => new Promise(resolve => {
        const result = {};
        for (const key of Object.keys(defaults)) {
          const raw = GM_getValue(key);
          result[key] = (raw !== undefined && raw !== null) ? raw : defaults[key];
        }
        resolve(result);
      }),
      set: (obj) => new Promise(resolve => {
        for (const [key, val] of Object.entries(obj)) {
          GM_setValue(key, val);
        }
        resolve();
      }),
      remove: (keys) => new Promise(resolve => {
        for (const key of (Array.isArray(keys) ? keys : [keys])) {
          GM_deleteValue(key);
        }
        resolve();
      }),
      clear: () => new Promise(resolve => resolve()), // noop for safety
    },
  },
  runtime: {
    onMessage: { addListener: () => {} },
    sendMessage: () => {},
  },
  tabs: {
    query: (_, cb) => cb([]),
    sendMessage: () => {},
  },
};
`;

// ── Strip the "if (typeof module !== 'undefined') module.exports = ..." guard ──
// Line-by-line filter: robuster als Regex, ueberlebt Prettier-Umformatierungen.
function stripModuleExports(code) {
  return code
    .split('\n')
    .filter(line => !/^\s*if\s*\(\s*typeof\s+module\b/.test(line))
    .join('\n');
}

function readModule(relPath) {
  const full = path.join(SRC, relPath);
  let code = fs.readFileSync(full, 'utf8');
  code = stripModuleExports(code);
  return `\n// === ${relPath} ===\n${code}`;

}

function buildContentScript() {
  const parts = MODULE_ORDER.map(readModule);
  const banner = `// mydealz Manager v2.0 – content script bundle\n// Built: ${new Date().toISOString()}\n// https://github.com/grapefruit89/mydealz-Managergpt\n`;
  const wrapper = `(function() {\n'use strict';\n${parts.join('\n')}\n})();\n`;

  const out = banner + wrapper;
  fs.writeFileSync(path.join(DIST, 'content.js'), out, 'utf8');
  console.log(`✔  dist/content.js (${(out.length / 1024).toFixed(1)} KB)`);

}

function buildUserscript() {
  // storage.js IS included: the GM shim below provides chrome.storage.local,
  // StorageApi (settings-store dependency) wraps it. Order: shim → storage.js → rest.
  const userscriptModules = MODULE_ORDER.slice();
  const parts = userscriptModules.map(readModule);
  const wrapper = `(function() {\n'use strict';\n${USERSCRIPT_STORAGE_SHIM}\n${parts.join('\n')}\n})();\n`;

  const out = USERSCRIPT_HEADER + '\n' + wrapper;
  fs.writeFileSync(path.join(DIST, 'userscript.js'), out, 'utf8');
  console.log(`✔  dist/userscript.js (${(out.length / 1024).toFixed(1)} KB)`);

}

function buildCSS() {
  const css = '/* mydealz Manager – additional styles (dynamic styles live in styles.js) */\n';
  fs.writeFileSync(path.join(DIST, 'content.css'), css, 'utf8');
  console.log('✔  dist/content.css');
}

// Shared bundle für Extension-Seiten (popup.html, sidepanel/sidepanel.html):
// Settings-Schema + Prompt-Level-SSOT, damit popup.js und sidepanel.js dieselben
// KEYS/DEFAULTS/LABELS nutzen wie der Content-Script-Bundle.
function buildPopupShared() {
  const code = readModule('core/settings-schema.js') + '\n' + readModule('core/prompt-levels.js');
  fs.writeFileSync(path.join(DIST, 'settings-schema.js'), code, 'utf8');
  console.log('✔  dist/settings-schema.js (Popup/SidePanel-Shared: Schema + Prompt-Levels)');
}

// ── Run ───────────────────────────────────────────────────────────────────────

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

buildContentScript();
buildUserscript();
buildPopupShared();
buildCSS();

console.log('\nDone. Load dist/ as unpacked extension in Chrome.');
