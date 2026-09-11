# mydealz Manager — Browser Extension v2.0

> **Deals filtern, Händler und User blocken, Preis- und Temperaturgrenzen setzen.**  
> Läuft auf [mydealz.de](https://www.mydealz.de) und [preisjaeger.at](https://www.preisjaeger.at) als Manifest V3 Browser Extension (Chrome, Edge, Brave) und optional als Tampermonkey-Userscript.

---

## Inhalt

- [Features](#features)
- [Installation](#installation)
- [Benutzung](#benutzung)
- [Filtersyntax](#filtersyntax)
- [Preis-Tier-System](#preis-tier-system)
- [Projektstruktur](#projektstruktur)
- [Architektur](#architektur)
- [Build-System](#build-system)
- [Entwicklung](#entwicklung)
- [Technische Entscheidungen](#technische-entscheidungen)

---

## Features

### Deal-Filter
- **Wörter ausblenden** mit mächtiger Ausdrucks-Syntax: AND, NOT, Wildcards, exakte Phrasen
- **Wortgrenzenerkennung** — "apple" trifft "Apple Watch" aber nicht "pineapple"
- **Whitelist** — Wörter die einen Deal niemals ausblenden (z.B. "lego", "kindle")
- **Kalte Deals** — alle Deals unter 0° automatisch ausblenden
- **Eigene Cold-Votes** — selbst cold-gevotete Deals verstecken
- **Mindestrabatt** — nur Deals ab X% Rabatt anzeigen
- **Maximaler Preis** — Deals über einem Preis-Limit ausblenden
- **Händler blocken** — nach Name oder ID, direkt aus dem Deal-Kontext
- **User blocken** — Deals bestimmter Poster nie sehen
- **Händlernamen im Titel prüfen** — blockt auch wenn der Name im Titel steht

### Preis-Tier-System
- **Tier A** (≤ X €) — immer sichtbar, volle Helligkeit
- **Tier B** (X–Y €) — gedimmt/transparent, bei Hover voll sichtbar
- **Tier C** (> Y €) — komplett ausgeblendet
- Stufengrenzen per Slider einstellbar (50 €-Schritte bis 2000 €)

### UI
- **✕-Button** auf jeder Deal-Karte — Deal sofort und dauerhaft ausblenden
- **⚙-Button** — Settings-Modal direkt aus dem Deal-Kontext öffnen
- **Dark Mode** vollständig unterstützt via CSS Custom Properties
- **Debug-Modus** — zeigt den Ausblendungsgrund direkt auf dem Deal-Badge

### KI-Export (Exporter)
- Auf Deal-Detailseiten: Kommentare per GraphQL API laden
- Formatierter Markdown-Export für KI-Prompts (z.B. ChatGPT-Analyse)

### Deal Collector
- Auf Listing-Seiten: alle sichtbaren Deals als Markdown-Liste exportieren
- Nützlich für schnelle Übersichten oder externe Verarbeitung

### Entwickler-Features
- **Error-Log** im Settings-Modal (hinter Debug-Flag): alle `Logger.error()`-Aufrufe der aktuellen Session als durchsuchbare `<textarea>`
- **Schema-Versionierung** — Settings werden sauber migriert wenn Keys sich ändern
- **safeInit()** Error Boundary — optionale Features können abstürzen ohne den Filter zu beeinträchtigen

---

## Installation

### Als Browser Extension (empfohlen)

Kein Node.js, kein Build-Schritt. Fertige ZIPs werden automatisch bei jedem Release gebaut.

1. Zur [Releases-Seite](https://github.com/grapefruit89/mydealz-Managergpt/releases/latest) gehen
2. Unter **Assets** → `mydealz-manager-ext.zip` herunterladen
3. ZIP entpacken (normales Entpacken reicht)
4. Chrome/Edge/Brave öffnen: `chrome://extensions`
5. **Entwicklermodus** aktivieren (Toggle oben rechts)
6. **"Entpackte Erweiterung laden"** → den entpackten Ordner auswählen
7. Auf mydealz.de gehen — fertig ✓

> **Für Entwickler:** Wer den Quellcode selbst bauen will: `node build.js` (kein npm install nötig).

### Als Tampermonkey-Userscript

1. [Tampermonkey](https://www.tampermonkey.net/) installieren
2. `dist/userscript.js` aus dem Release-ZIP in Tampermonkey importieren

Das Userscript verwendet GM_setValue/GM_getValue statt chrome.storage — der Build ersetzt den Storage-Layer automatisch per Shim.

---

## Benutzung

### Settings öffnen
- Klick auf den **⚙-Button** der auf jedem Deal erscheint (bei Hover sichtbar)
- Oder über das **Extension-Popup** in der Browser-Toolbar

### Deal manuell ausblenden
- **✕-Button** auf dem Deal anklicken — der Deal wird sofort ausgeblendet und die ID persistiert

### Debug-Modus
Settings → "Debug-Modus" aktivieren → auf jedem ausgeblendeten Deal erscheint ein grünes Badge mit dem Grund (z.B. "Wort: apple", "Preis: Tier C", "Cold-Vote")

---

## Filtersyntax

Jeder Eintrag im Feld "Wörter ausblenden" ist ein eigenständiger Ausdruck. Mehrere Einträge sind durch Komma getrennt.

| Syntax | Bedeutung | Beispiel |
|--------|-----------|---------|
| `wort` | Wortgrenze: trifft "Apple" aber nicht "pineapple" | `apple` |
| `wort1 wort2` | AND: beide Wörter müssen vorkommen | `apple watch` |
| `+wort` | explizites AND (identisch) | `+apple +iphone` |
| `-wort` | NOT: Deal wird NICHT ausgeblendet wenn Wort fehlt | `apple -zubehör` |
| `*wort*` | Wildcard: Substring-Match | `*pro`, `*case*` |
| `"exakte phrase"` | Muss exakt so vorkommen (Groß/Kleinschreibung egal) | `"passend für"` |

**Wortgrenzen-Details:** Unicode-aware, kennt deutsche Umlaute (ä/ö/ü/ß). "zubehör" trifft "Apple Zubehör" aber nicht "Fahrradzubehör".

**Prüffelder:** Titel + Beschreibung des Deals (kombinierter Suchtext).

**Whitelist** hat Vorrang — ein Whitelist-Wort hebt alle Ausblend-Regeln auf.

---

## Preis-Tier-System

```
0 €          Tier A Max        Tier B Max       ∞
|────────────────|──────────────────|─────────────|
     🟢 A              🟡 B               🔴 C
  immer sichtbar      gedimmt         ausgeblendet
```

- Tier A-Grenze: 50 €–950 € (Slider, 50 €-Schritte)
- Tier B-Grenze: Tier A + 50 € bis 2000 € (Slider, 50 €-Schritte)
- Deals ohne Preis (Gratis-Deals, kein Preisfeld) → immer sichtbar
- Das Tier-System ist ein Master-Toggle und kann deaktiviert werden

---

## Projektstruktur

```
mydealz-manager-ext/
│
├── manifest.json              # MV3 Extension-Manifest
├── background.js              # Service Worker (Tab-Sync per chrome.tabs.query)
├── build.js                   # Concatenation-Bundler (kein npm nötig)
├── .gitignore
│
├── popup/
│   ├── popup.html             # Extension-Toolbar-Popup
│   └── popup.js               # Popup-Logik (KEYS/DEFAULTS aus MdmSchema)
│
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
├── dist/                      # Build-Output (nicht committet)
│   ├── content.js             # Gebündeltes Content Script (~142 KB)
│   ├── userscript.js          # Tampermonkey-Build (mit GM-Shim)
│   ├── settings-schema.js     # Settings-Schema für popup.html (Shared-Bundle)
│   └── content.css            # Minimales CSS (Styles leben in JS)

├── src/
│   │
│   ├── content.js             # Entry Point: Bootstrap, Observer, processDeals()
│   ├── _template.js           # Vorlage für neue Module (IIFE + module.exports Guard)
│   │
│   ├── core/                  # Infrastruktur — keine Feature-Logik
│   │   ├── logger.js          # Logger mit _history, getHistory(), clearHistory()
│   │   ├── storage.js         # chrome.storage.local Wrapper (StorageApi)
│   │   ├── settings-schema.js # SSOT: Keys/Defaults/UI-Zugehörigkeit/Reset-Regeln
│   │   ├── settings-store.js  # Settings-Cache, Getter/Setter, Schema-Migration
│   │   ├── deal-parser.js     # DOM/State → DealData (synchron, netzfrei)
│   │   ├── graphql-client.js  # Verifizierte GQL-Shapes + Retry + 200+HTML-Erkennung
│   │   └── settings-modal.js  # Settings-Modal: CSS, HTML, Speichern, Error-Log
│   │
│   └── features/              # Optionale Feature-Module (laufen durch safeInit)
│       ├── deal-filter-engine.js  # Pure Filterbewertung: evaluate(deal, settings)
│       ├── deal-filter-ui.js      # CSS-Vars, ✕/⚙-Buttons, ghost/hidden States
│       ├── exporter.js            # Kommentar-Export als KI-Markdown (Detailseiten)
│       └── collector.js           # Deal-Liste als Markdown exportieren (Listings)

└── docs/
    ├── BLUEPRINT.md           # Spec: Zielarchitektur + Datenmodell
    ├── LEARNINGS.md           # Learnings + Sprint-Status (immer aktuell halten!)
    ├── ARCHITECTURE_BRIEF.md  # Brief für externe Architektur-Reviews
    ├── werkzeuge.md           # Pepper-Netzwerk-Status + Werkzeug-Links (Quelle: Original-Repo)
    ├── ROADMAP.md             # Features + Ideen-Liste mit Quellen (SSOT)
    ├── SANDBOX.md             # Konvention für Experimente
    ├── error-handling-plan.md # Plan: safeInit/Error-Boundary
    └── adr-001-build-system.md  # ADR: Warum build.js statt ES-Module

tests/                          # Zero-Dep-Testsuite: node tests/run-tests.js
├── run-tests.js
├── harness.js
└── *.test.js
```

---

## Architektur

### Ladereihenfolge (build.js MODULE_ORDER)

```
core/logger.js          → immer zuerst (alle Module nutzen Logger)
core/storage.js         → chrome.storage Wrapper
core/settings-schema.js → SSOT für Keys/Defaults (VOR settings-store)
core/settings-store.js  → Settings laden, cachen, migrieren
core/deal-parser.js     → DOM lesen
core/graphql-client.js  → API-Zugriff
core/settings-modal.js  → UI-Schicht für Settings
features/deal-filter-engine.js  → pure Filterlogik
features/deal-filter-ui.js      → Deal-Karten UI
features/exporter.js                   → Detailseiten-Feature
features/collector.js                  → Listing-Feature
content.js                             → Entry Point (zuletzt)
```

### Module-Kommunikation

Alle Module sind IIFEs die globale Variablen exponieren (`Logger`, `SettingsStore`, `DealParser`, etc.). Kein Import/Export — das Content Script läuft als einzelnes konkateniertes Script im Seiten-Kontext.

```
content.js
  ↓ await SettingsStore.init()          # Settings laden + Migration
  ↓ safeInit(() => Exporter.init())     # Optionale Features
  ↓ safeInit(() => Collector.init())
  ↓ UiController.init({...})            # Core UI — kein safeInit
  ↓ processDeals()                      # Ersten Pass starten
  ↓ _startObserver()                    # MutationObserver aktivieren
```

### Error Boundary (safeInit)

```js
safeInit('Exporter', () => Exporter.init());
//  ↑ kapselt optionale Features in try/catch
//  ↑ Absturz wird geloggt (Logger.error → _history)
//  ↑ Core-Features (Filter, UI) laufen unberührt weiter
```

### Performance

- **requestIdleCallback Chunking:** processDeals() verarbeitet Deals in Idle-Slots, gibt nach 2ms Remaining zurück und setzt im nächsten Slot fort
- **_processGen Generationszähler:** Wenn Settings gespeichert werden, bekommt der neue processDeals()-Aufruf eine neue ID — veraltete Chunks brechen ab
- **Smart MutationObserver:** Feuert nur wenn `article[data-t="thread"]` tatsächlich hinzugefügt wurden (kein reprocess bei Hover-Effekten, Ads, Tooltips)
- **120ms Debounce** auf dem Observer gegen Scroll-Bursts

---

## Build-System

```bash
node build.js
```

Kein npm, keine node_modules, keine Abhängigkeiten. Produziert:

| Datei | Inhalt |
|-------|--------|
| `dist/content.js` | Alles konkateniert, in IIFE gewrappt (~142 KB) |
| `dist/userscript.js` | Wie content.js, aber mit GM_*-Shim statt chrome.storage |
| `dist/settings-schema.js` | Settings-Schema für popup.html (Shared-Bundle) |
| `dist/content.css` | Placeholder (Styles leben in JS) |

`build.js` macht zwei Dinge:
1. Dateien in `MODULE_ORDER` lesen und konkatenieren
2. `if (typeof module !== 'undefined') module.exports = ...` Zeilen herausfiltern (damit Node.js-Tests möglich sind, ohne dass der Browser `module` kennen muss)

Warum kein ES-Module-Setup? → Siehe [`docs/adr-001-build-system.md`](docs/adr-001-build-system.md)

---

## Entwicklung

### Neues Core-Modul anlegen

1. Datei nach `src/core/mein-modul.js` kopieren (Vorlage: `src/_template.js`)
2. IIFE-Pattern beibehalten: `const MeinModul = (() => { ... return { ... }; })();`
3. `module.exports`-Guard ans Ende: `if (typeof module !== 'undefined') module.exports = { MeinModul };`
4. In `build.js` → `MODULE_ORDER` an der richtigen Stelle eintragen (vor den Modulen die es nutzen)
5. `node build.js` ausführen

### Neues Feature-Modul anlegen

Wie Core, aber nach `src/features/mein-feature.js`. Namenskonvention: Präfix statt Ordner bei Mehrdatei-Features (z. B. `deal-filter-engine.js` + `deal-filter-ui.js`). In `content.js` dann:
```js
if (typeof MeinFeature !== 'undefined') safeInit('MeinFeature', () => MeinFeature.init());
```

### Experimentelles Feature (Sandbox)

Konvention siehe [`docs/SANDBOX.md`](docs/SANDBOX.md): experimenteller Code liegt in `src/` mit Dateiname `x-experiment.js` o. ä. und wird **nicht** in `MODULE_ORDER` eingetragen — er landet nie im Build. Perfekt für riskante Ideen ohne Auswirkung auf den Filter.

### Tests laufen

```bash
node tests/run-tests.js        # alle Suiten
node tests/filter-engine.test.js  # einzelne Suite
```

### Settings erweitern

1. In `src/core/settings-store.js`:
   - Key zu `STORAGE_KEYS` hinzufügen
   - Default zu `DEFAULTS` hinzufügen
   - Getter + Setter hinzufügen
2. In `src/core/settings-modal.js` → `_buildHTML()`: UI-Element hinzufügen
3. In `src/core/settings-modal.js` → `_save()`: Wert auslesen und via Setter speichern
4. `MDM_SCHEMA_VERSION` in `settings-store.js` hochzählen + Migration in `_migrate()` eintragen

### Debug

In der Browser-Konsole auf mydealz.de:
```js
localStorage.setItem('mdm_debug_override', '1'); location.reload();
// → Debug-Modus aktiv ohne Settings-Modal
```

Oder in Settings → "Debug-Modus" aktivieren → ausgeblendete Deals zeigen den Grund.  
Fehler-Log erscheint unten im Settings-Modal (nur bei aktivem Debug und wenn Fehler aufgetreten sind).

---

## Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Build-System | Eigenes `build.js` (Concatenation) | MV3 Content Scripts unterstützen kein `type=module`; externer Bundler überdimensioniert für 15 Dateien. Details: [ADR 001](docs/adr-001-build-system.md) |
| CSS | CSS Custom Properties (`--mdm-*`) in `@layer mdm` | Cascade-Isolation gegen mydealz-eigene Styles; kein Shadow DOM nötig |
| Storage | `chrome.storage.local` | Überlebt Seiten-Reloads, synchronisiert zwischen Tabs via Background Worker |
| DOM-Selektion | `data-t`-Attribute bevorzugt | Stabile Analytics-Attribute, überleben CSS-Framework-Updates |
| Farben | Hex + CSS Custom Properties | FUTURE: Migration auf `oklch()` + `light-dark()` geplant, sobald ES-Module-Migration abgeschlossen |

---

## Autoren

- **Flo** (9jS2PL5T) — Original-Userscript-Autor
- **Moritz Baumeister** ([grapefruit89](https://github.com/grapefruit89)) — Komplettumbau als MV3 Extension

---

## Lizenz

Private Repository. Keine öffentliche Lizenz.
