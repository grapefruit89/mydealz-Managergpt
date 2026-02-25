#!/usr/bin/env node
/**
 * @file build.js
 * @description Build-Skript für den mydealz Manager.
 * @role Fügt Quellteile aus src/parts in genau eine distributable Userscript-Datei zusammen.
 * @inputs src/parts/00-metadata.js, src/parts/10-main.js
 * @output dist/mydealz-manager.user.js
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC_PARTS_DIR = path.join(ROOT, 'src', 'parts');
const DIST_DIR = path.join(ROOT, 'dist');
const DIST_FILE = path.join(DIST_DIR, 'mydealz-manager.user.js');

const PARTS_ORDER = [
  '00-metadata.js',
  '10-main.js',
];

function assertFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fehlende Build-Datei: ${path.relative(ROOT, filePath)}`);
  }
}

function build() {
  PARTS_ORDER.forEach((fileName) => assertFileExists(path.join(SRC_PARTS_DIR, fileName)));

  const content = PARTS_ORDER
    .map((fileName) => fs.readFileSync(path.join(SRC_PARTS_DIR, fileName), 'utf8').trimEnd())
    .join('\n\n') + '\n';

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(DIST_FILE, content, 'utf8');

  console.log(`✅ Build erfolgreich: ${path.relative(ROOT, DIST_FILE)}`);
}

try {
  build();
} catch (error) {
  console.error('❌ Build fehlgeschlagen:', error.message);
  process.exit(1);
}
