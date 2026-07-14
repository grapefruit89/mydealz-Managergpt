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

1. Repository klonen oder als ZIP herunterladen
2. Build ausführen:
   ```bash
   node build.js
   ```
3. In Chrome/Edge/Brave öffnen: `chrome://extensions`
4. **Entwicklermodus** aktivieren (oben rechts)
5. **Entpackte Erweiterung laden** → den Projektordner auswählen (nicht `dist/`, sondern den Root)
6. Auf mydealz.de gehen — die Extension läuft sofort

> **Hinweis:** Icons (`icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`) müssen vorhanden sein. Platzhalter reichen für den Test.

### Als Tampermonkey-Userscript

1. [Tampermonkey](https://www.tampermonkey.net/) installieren
2. `node build.js` ausführen
3. `dist/userscript.js` in Tampermonkey importieren (oder den Inhalt in ein neues Script kopieren)

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
│   └── popup.js               # Popup-Logik (liest/schreibt chrome.storage direkt)
│
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
├── dist/                      # Build-Output (nicht committet)
│   ├── content.js             # Gebündeltes Content Script (~131 KB)
│   ├── userscript.js          # Tampermonkey-Build (mit GM-Shim)
│   └── content.css            # Minimales CSS (Styles leben in JS)
│
├── src/
│   │
│   ├── content.js             # Entry Point: Bootstrap, Observer, processDeals()
│   │
│   ├── core/                  # Infrastruktur — keine Feature-Logik
│   │   ├── logger.js          # Logger mit _history, getHistory(), clearHistory()
│   │   ├── storage.js         # chrome.storage.local Wrapper
│   │   ├── settings-store.js  # Settings-Cache, Getter/Setter, Schema-Migration
│   │   ├── deal-parser.js     # DOM → DealData-Objekt (data-t Selektoren)
│   │   ├── graphql-client.js  # GQL-Fetch mit Retry und 429-Handling
│   │   └── settings-modal.js  # Settings-Modal: CSS, HTML, Speichern, Error-Log
│   │
│   ├── features/              # Optionale Feature-Module (laufen durch safeInit)
│   │   ├── deal-filter/
│   │   │   ├── filter-engine.js   # Pure Filterbewertung: evaluate(deal, settings)
│   │   │   └── deal-ui.js         # CSS-Vars, ✕/⚙-Buttons, ghost/hidden States
│   │   │
│   │   ├── ai-export/
│   │   │   └── exporter.js        # Kommentar-Export als KI-Markdown (Detailseiten)
│   │   │
│   │   └── collector/
│   │       └── collector.js       # Deal-Liste als Markdown exportieren (Listings)
│   │
│   ├── sandbox/               # Experimenteller Code — nie in MODULE_ORDER
│   │   └── SANDBOX.md         # Spielregeln für Sandbox-Features
│   │
│   └── _template/
│       └── MODULE_TEMPLATE.js # Vorlage für neue Module (IIFE + module.exports Guard)
│
└── docs/
    └── adr/
        └── 001-build-system.md  # ADR: Warum build.js statt ES-Module
```

---

## Architektur

### Ladereihenfolge (build.js MODULE_ORDER)

```
core/logger.js          → immer zuerst (alle Module nutzen Logger)
core/storage.js         → chrome.storage Wrapper
core/settings-store.js  → Settings laden, cachen, migrieren
core/deal-parser.js     → DOM lesen
core/graphql-client.js  → API-Zugriff
core/settings-modal.js  → UI-Schicht für Settings
features/deal-filter/filter-engine.js  → pure Filterlogik
features/deal-filter/deal-ui.js        → Deal-Karten UI
features/ai-export/exporter.js         → Detailseiten-Feature
features/collector/collector.js        → Listing-Feature
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
| `dist/content.js` | Alles konkateniert, in IIFE gewrappt (~131 KB) |
| `dist/userscript.js` | Wie content.js, aber mit GM_*-Shim statt chrome.storage |
| `dist/content.css` | Placeholder (Styles leben in JS) |

`build.js` macht zwei Dinge:
1. Dateien in `MODULE_ORDER` lesen und konkatenieren
2. `if (typeof module !== 'undefined') module.exports = ...` Zeilen herausfiltern (damit Node.js-Tests möglich sind, ohne dass der Browser `module` kennen muss)

Warum kein ES-Module-Setup? → Siehe [`docs/adr/001-build-system.md`](docs/adr/001-build-system.md)

---

## Entwicklung

### Neues Core-Modul anlegen

1. Datei nach `src/core/mein-modul.js` kopieren (Vorlage: `src/_template/MODULE_TEMPLATE.js`)
2. IIFE-Pattern beibehalten: `const MeinModul = (() => { ... return { ... }; })();`
3. `module.exports`-Guard ans Ende: `if (typeof module !== 'undefined') module.exports = { MeinModul };`
4. In `build.js` → `MODULE_ORDER` an der richtigen Stelle eintragen (vor den Modulen die es nutzen)
5. `node build.js` ausführen

### Neues Feature-Modul anlegen

Wie Core, aber nach `src/features/mein-feature/mein-feature.js`. In `content.js` dann:
```js
if (typeof MeinFeature !== 'undefined') safeInit('MeinFeature', () => MeinFeature.init());
```

### Experimentelles Feature (Sandbox)

Code nach `src/sandbox/mein-experiment.js` — dieser Ordner ist **nicht** in `MODULE_ORDER` und landet nie im Build. Perfekt für riskante Ideen ohne Auswirkung auf den Filter.

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
| Build-System | Eigenes `build.js` (Concatenation) | MV3 Content Scripts unterstützen kein `type=module`; externer Bundler überdimensioniert für 15 Dateien. Details: [ADR 001](docs/adr/001-build-system.md) |
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
