# tests/ — Zero-Dependency Testsuite

> Wie das Projekt getestet wird — ohne npm, ohne Browser, ohne Config.
> Run: `node tests/run-tests.js` (oder einzeln: `node tests/<name>.test.js`)

## Warum so?

MV3-Content-Scripts erlauben kein ES-Modules, daher konkateniert `build.js`
die IIFE-Module zu einer Datei. Die Tests tun exakt dasselbe: Dateien
konkatenieren (wie `build.js`), `module.exports`-Guards strippen, gemeinsam
`eval`-en — exakt die Browser-Runtime-Semantik, in Node mit gemockten
`chrome`/`document`/`fetch`-Stubs. Siehe `docs/adr-001-build-system.md` und
`docs/ARCHITECTURE_BRIEF.md` §6 („Node Test Harness").

## Suiten und was sie abdecken

| Suite | Prüft | Kern-Assertions |
|---|---|---|
| `filter-engine.test.js` | Filter-Engine (pure) | Umlaute, Word-Boundaries, AND/NOT, Wildcard-Glob (`*pro`=endet auf / `pro*`=beginnt mit / `*pro*`=enthält), Phrasen, Whitelist-Override, Cent-Arithmetik (Float-Fehlfilter), Tier-Grenzen, Händlername-im-Titel |
| `settings-store.test.js` | SettingsStore + MdmSchema-SSOT | Defaults, Migration v1, Persistenz via StorageApi, **Reset schont hiddenDeals + schemaVersion**, Schema-Konsistenz, popup.js leitet KEYS ab (kein Duplikat) |
| `collector.test.js` | Collector-Pipeline End-to-End | IDs (DOM) → GQL-Alias-Batch → Normalisierung (merchant/Preise/discountPct/HTML-Strip/ISO-Zeit) → Markdown |
| `exporter.test.js` | AI-Exporter End-to-End | OP-Badge, Permalinks (`#comment-`/`#reply-`), Reaction-Score-Formel, **repliesPreview spart Requests (2 statt 3 GQL-Calls)**, kein Preview-Duplikat nach Batch |

## Mocks (gemockte Platform-Objekte, siehe je Suite `setup()`)

- `chrome.storage.local` — in-memory Store (settings-store.test)
- `fetch` → `/graphql`-Antworten in **verifiziertem GQL-Shape** + AJAX-Seiten; Request-Zähler für Rate-Limit-Beweise (exporter.test)
- `document`/`window`/`DOMParser`/`indexedDB` — minimal, mit `innerText`-Getter (HTML→Text)

## Neue Tests schreiben

1. Datei `tests/<modul>.test.js` anlegen
2. `require('./harness.js')` → `loadBundle([...dateien], { setup, expose: [...] })`
   — Dateien in **Bundler-Reihenfolge** listen (wie `MODULE_ORDER` in `build.js`)
3. Suite endet mit `PASSED`; Runner (`run-tests.js`) findet sie automatisch
4. Nach jedem Umbau: `node build.js && node tests/run-tests.js` (Build parst nicht selbst — siehe `docs/LEARNINGS.md` §10 Prozess-Lektion)

## Was die Tests NICHT abdecken (echter Browser nötig)

- UI-Injektion (Buttons, Modal, Ghost-Rendering) — manuell: `dist/` in `chrome://extensions` laden
- Rate-Limits/Throttling gegen die echte API (bewusst nur Live-geprüft, nicht automatisiert)
- Fremdsprachige TLD-Detailseiten (Pattern verifiziert, Buttons nicht geklickt)
