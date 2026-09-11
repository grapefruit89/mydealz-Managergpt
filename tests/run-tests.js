/**
 * tests/run-tests.js
 * Zero-Dependency Test-Runner: führt alle *.test.js sequenziell in
 * Kindprozessen aus (jede Suite ist auch einzeln lauffähig).
 * Run: node tests/run-tests.js
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TESTS_DIR = __dirname;
const testFiles = fs.readdirSync(TESTS_DIR).filter(f => f.endsWith('.test.js')).sort();

if (testFiles.length === 0) {
  console.error('Keine Tests gefunden in ' + TESTS_DIR);
  process.exit(1);
}

let failed = 0;
const started = Date.now();

for (const file of testFiles) {
  console.log('\n══ ' + file + ' ══');
  const res = spawnSync(process.execPath, [path.join(TESTS_DIR, file)], {
    stdio: 'inherit',
    timeout: 60_000,
  });
  if (res.status !== 0) failed++;
}

const ms = Date.now() - started;
console.log('\n──────────────────────────────────────');
console.log(`${testFiles.length} Suiten, ${failed} fehlgeschlagen (${ms} ms)`);
process.exit(failed ? 1 : 0);
