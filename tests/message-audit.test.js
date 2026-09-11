/**
 * message-audit.test.js
 * Registry-Audit (P1.1, Quelle: Claude-Review-Fund 3): Jede chrome.runtime-
 * Message-Literal im Repo muss in MessageTypes.TYPES registriert sein, und
 * jeder registrierte Typ muss eine Handler-Datei haben (msg.type === '…')
 * und eine Sender-Stelle (type: '…'). Fängt „Feature fault silently".
 * Run: node tests/message-audit.test.js
 */

const { loadBundle, assert, ROOT } = require('./harness.js');
const fs = require('fs');
const path = require('path');

const { MessageTypes } = loadBundle(['src/core/message-types.js'], {
  expose: ['MessageTypes'],
});

// Zu scannende Dateien: alles, was chrome.runtime-Nachrichten führen kann
const SCAN_FILES = [
  'background.js',
  'popup/popup.js',
  'sidepanel/sidepanel.js',
  'src/content.js',
  'src/core/graphql-client.js',
  'src/core/logger.js',
  'src/core/settings-modal.js',
  'src/core/settings-store.js',
  'src/core/storage.js',
  'src/core/deal-parser.js',
  'src/core/deal-normalizer.js',
  'src/core/comment-normalizer.js',
  'src/core/export-payload.js',
  'src/core/prompt-builder.js',
  'src/core/prompt-levels.js',
  'src/core/message-types.js',
  'src/features/exporter.js',
  'src/features/collector.js',
  'src/features/sort-memory.js',
  'src/features/permalink-tools.js',
  'src/features/deal-filter-engine.js',
  'src/features/deal-filter-ui.js',
];

// Sammelt alle Message-Typ-Literale pro Datei
function collectLiterals(relPath) {
  const text = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const sends  = [...text.matchAll(/type:\s*'([A-Z][A-Z0-9_]+)'/g)].map(m => m[1]);
  const handles = [...text.matchAll(/msg\?{0,2}\.type\s*(?:!==|===)\s*'([A-Z][A-Z0-9_]+)'/g)].map(m => m[1]);
  return { sends, handles };
}

const found = {};
for (const rel of SCAN_FILES) {
  if (!fs.existsSync(path.join(ROOT, rel))) continue;
  found[rel] = collectLiterals(rel);
}

const registryTypes = Object.keys(MessageTypes.TYPES);

// 1. Jede gefundene Literal ist registriert (typo guard)
const allLiterals = new Set();
for (const [rel, { sends, handles }] of Object.entries(found)) {
  for (const t of [...sends, ...handles]) {
    allLiterals.add(t);
    assert(registryTypes.includes(t), `Literal "${t}" (${rel}) ist in MessageTypes.TYPES registriert`);
  }
}

// 2. Jeder registrierte Typ hat ≥1 Handler-Datei (msg.type === 'X')
for (const type of registryTypes) {
  const handlerFiles = Object.entries(found)
    .filter(([rel, { handles }]) => handles.includes(type))
    .map(([rel]) => rel);
  const declared = (MessageTypes.TYPES[type].handlers ?? []);
  const covered = declared.filter(f => handlerFiles.includes(f));
  assert(covered.length > 0,
    `"${type}" hat einen registrierten Handler in einer realen Datei (${handlerFiles.join(', ') || 'KEINER!'})`);
}

// 3. Jeder registrierte Typ hat ≥1 Sender-Stelle (type: 'X') — außer explizit
//    gemarct: background reicht msg unverändert weiter (kein Literal).
for (const type of registryTypes) {
  const senderFiles = Object.entries(found)
    .filter(([rel, { sends }]) => sends.includes(type))
    .map(([rel]) => rel);
  const note = MessageTypes.TYPES[type].note ?? '';
  const relayOnly = note.includes('kein Literal');
  if (relayOnly) {
    assert(senderFiles.length >= 1, `"${type}" hat einen Sender (relay-Variante: direkte Literal ok)`);
  } else {
    assert(senderFiles.length >= 1,
      `"${type}" hat eine sendende Stelle (${senderFiles.join(', ') || 'KEINE!'})`);
  }
}

// 4. Keine registrierten Typen ohne Nutzung (tote Registry-Einträge)
for (const type of registryTypes) {
  assert(allLiterals.has(type) || (MessageTypes.TYPES[type].note ?? '').length > 0,
    `"${type}" wird im Code genutzt (kein toter Registry-Eintrag)`);
}

console.log('message-audit.test.js PASSED');
