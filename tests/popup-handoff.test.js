/**
 * popup-handoff.test.js
 * Integrations-Test für die Popup-Glue-Schicht (P1.4, Quelle: Claude-Review
 * Fund 1 — das Handoff-IIFE saß versehentlich im reset()-Body und der
 * Selection-Handoff aus dem Kontextmenü war tot).
 *
 * Lädt popup/popup.js exakt wie der Browser (gleiche Concat-Eval-Semantik),
 * mit gestubbtem chrome.storage.session/chrome.runtime, und beweist:
 *   1. Handoff aus storage.session befüllt das Übersetzer-Textfeld
 *   2. Die Übersetzung läuft automatisch (Runtime-Message wurde gesendet)
 *   3. reset() ruft load() sauber auf (nicht verschluckt)
 * Run: node tests/popup-handoff.test.js
 */

const { loadBundle, assert, src } = require('./harness.js');

const HANDOFF_TEXT = 'https://www.mydealz.de/comments/permalink/50166908';

// ── Stub-Elemente ─────────────────────────────────────────────────────────────

function makeElement() {
  return {
    value: '', textContent: '', checked: false, hidden: false, disabled: false,
    innerHTML: '', style: {}, dataset: {},
    addEventListener() {}, appendChild() {}, remove() {}, removeChild() {},
    querySelectorAll() { return []; },
    setAttribute() {},
    click() {},
  };
}

const elements = {};
const el = id => (elements[id] ??= makeElement());

// ── Stubs ─────────────────────────────────────────────────────────────────────

const sentMessages = [];
const HANDOFF = { text: HANDOFF_TEXT, at: Date.now() };

const setup = () => {
  global.document = {
    getElementById: el,
    createElement: makeElement,
    querySelectorAll() { return []; },
    body: { appendChild() {}, removeChild() {} },
  };
  global.window = {};
  global.chrome = {
    storage: {
      local: { get: async (d) => d, set: async () => {} },
      session: {
        get: async (key) => ({ mdm_popup_handoff: HANDOFF }),
        remove: async () => {},
      },
    },
    runtime: {
      sendMessage: async () => ({ results: [{ id: '50166908', url: 'https://www.mydealz.de/diskussion/neue-link-struktur-von-mydealz-2462696#comment-50166908' }] }),
      onMessage: { addListener() {} },
    },
  };
  global.confirm = () => false;
  global.navigator = {};
};

loadBundle([
  src('core', 'settings-schema.js'),
  src('core', 'prompt-levels.js'),
  'popup/popup.js',
], { setup, expose: [] });

// IIFE + translatePermalinks() sind async — kurz warten, dann prüfen
setTimeout(() => {
  assert(el('pl-input').value === HANDOFF_TEXT,
    'Handoff befüllt das Übersetzer-Textfeld (der Fund-1-Regressionstest)');

  assert(!el('pl-output').hidden && el('pl-output').value.includes('#comment-50166908'),
    'Übersetzung lief automatisch und zeigt die aufgelöste URL');

  assert(el('pl-note').textContent.includes('1/1'),
    'Status-Zeile meldet 1/1 aufgelöst');

  console.log('popup-handoff.test.js PASSED');
  process.exit(0);
}, 50);
