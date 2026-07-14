# ADR 001: Build-System — Concatenation statt ES-Module

**Status:** Accepted  
**Datum:** 2026-07  
**Kontext:** mydealz Manager Browser Extension (Manifest V3)

---

## Entscheidung

Wir verwenden `build.js` — einen selbstgeschriebenen Concatenation-Bundler — statt nativer ES-Module oder einem externen Tool (Vite, esbuild, Rollup).

---

## Kontext und Problemstellung

Eine Browser-Extension besteht aus mehreren JS-Kontexten mit unterschiedlichen Regeln:

- **Popup / Background (Service Worker):** Manifest V3 erlaubt hier `"type": "module"` — echte ES-Module wären möglich.
- **Content Script:** Das ist die kritische Einschränkung. Content Scripts, die über `manifest.json` deklariert werden, unterstützen **kein** `"type": "module"`. Der Browser lädt sie als klassische Scripts in den Seiten-Kontext.

Wir injizieren unseren gesamten Filter- und UI-Code als Content Script auf mydealz.de. Das bedeutet: kein direkter ES-Modul-Support für den Kern der Extension.

---

## Evaluierte Alternativen

### Option A: Dynamischer Import via Loader-Script (abgelehnt)

Ein winziges Vanilla-JS Content Script laedt das eigentliche Modul dynamisch:

```js
// content-loader.js (deklariert in manifest.json)
(async () => {
  await import(chrome.runtime.getURL('src/content-main.js'));
})();
```

Alle `src/`-Dateien werden dann echte ES-Module mit `export`/`import`.

**Nachteile:**
- Asynchroner Bootstrap: Die Seite kann bereits interaktiv sein, bevor das Modul geladen ist — Deals werden u.U. sichtbar, bevor Filter greifen (Flash of Unfiltered Content).
- `chrome.runtime.getURL()` erfordert alle Dateien als `web_accessible_resources` in der `manifest.json` — das exponiert die interne Dateistruktur.
- Debugging-Erfahrung schlechter: Source Maps fehlen, Modul-Graphen in DevTools sind komplex.
- Firefox-Kompatibilitaet: Unterschiede im dynamic-import-Verhalten bei Extensions.
- Kein echter Vorteil solange Popup und Background ohnehin separat geladen werden.

### Option B: Externer Bundler (Vite/esbuild/Rollup) (abgelehnt)

Standard-Webentwicklung, aber fuer eine Extension mit 10–15 Dateien ueberdimensioniert:

- Neue Abhaengigkeit (`node_modules`, `package.json`, Lock-File).
- Build-Konfiguration muss Extension-spezifische Eigenheiten kennen (kein `window`, kein `document` im Service Worker, kein `import` in Content Scripts).
- `watch`-Mode + HMR funktioniert nicht mit Chrome Extension Reloading.
- Ersetzt ein 150-Zeilen-Problem mit einem 500-Zeilen-Konfigurations-Problem.

### Option C: Concatenation via `build.js` (gewaehlt)

`build.js` liest alle Module in `MODULE_ORDER`, entfernt `module.exports`-Guards und schreibt eine einzige `dist/content.js`:

```
src/core/logger.js
src/core/storage.js
src/core/settings-store.js
src/core/deal-parser.js
src/core/graphql-client.js
src/core/settings-modal.js
src/features/deal-filter/filter-engine.js
src/features/deal-filter/deal-ui.js
src/features/ai-export/exporter.js
src/features/collector/collector.js
src/content.js
```

Jedes Modul ist ein IIFE (Immediately Invoked Function Expression), das seinen Public-API als globale Variable exponiert. Das ermoeglicht Node.js-kompatible Tests via `module.exports`-Guards.

**Vorteile:**
- Kein Async-Bootstrap, kein FOUC.
- Keine externen Abhaengigkeiten, kein `node_modules`.
- Deterministisch und transparent: `node build.js` erzeugt exakt das, was man liest.
- Dasselbe Build erzeugt auch `dist/userscript.js` fuer Tampermonkey (mit GM_-Shim).
- Der `stripModuleExports()`-Filter in `build.js` ist robust: line-by-line, kein Regex-Missbrauch.

---

## Bekannte Einschraenkungen

- **Kein Tree-Shaking:** Unbenutzter Code landet im Bundle. Bei aktuell ~130 KB akzeptabel.
- **Kein HMR:** Aenderungen erfordern `node build.js` + Extension-Reload in Chrome. Dauert ~1 Sekunde.
- **Backtick-Problem beim Schreiben:** Das Write-Tool (im KI-Kontext) trunciert Dateien die Template Literals enthalten. Workaround: Python-Writes fuer komplexe Dateien verwenden (build.js, content.js, settings-modal.js).
- **Globaler Namespace:** Module kommunizieren ueber globale Variablen (`Logger`, `SettingsStore`, etc.). Kollisionen mit mydealz-eigenem Code moeglich — bisher nicht aufgetreten, alle MDM-Variablen haben klare Namen.

---

## Migrationspfad (FUTURE)

Wenn die Extension deutlich groesser wird (>5 Features, >20 Dateien) oder ein Bundler-Setup wuenschenswert wird:

1. Popup und Background zuerst auf `"type": "module"` umstellen — das ist in MV3 direkt moeglich und entkoppelt den SettingsStore von seinem eigenen hardcodierten Key-Duplikat in `popup.js`.
2. Fuer Content Script: Option A (Loader-Script) nochmals evaluieren. Das FOUC-Risiko kann durch `document_start` Injection entschaerft werden.
3. CSS auf `oklch()` + `light-dark()` migrieren (siehe `// FUTURE`-Kommentar in `deal-ui.js`).

Diese Migration ist kein Bugfix, sondern ein Qualitaets-Upgrade. Nicht durchfuehren wenn alles funktioniert.

---

## Fazit

`build.js` ist die pragmatischste Loesung fuer diesen Anwendungsfall. Die Komplexitaet einer Extension-spezifischen ES-Modul-Architektur ueberwiegt den Nutzen solange der Codebase ueberschaubar bleibt. Die Entscheidung ist reversibel — der Migrationspfad ist dokumentiert.

> "Einfach ist besser als clever. Explizit ist besser als implizit."
