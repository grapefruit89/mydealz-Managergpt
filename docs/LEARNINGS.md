# Learnings aus den alten Scripts

Analyse von 5 historischen Userscripts (ca. 2024). Viele DOM-Selektoren sind broken,
aber die **Logik und Ideen** sind wertvoll. Diese Datei hält fest was erhalten bleibt.

---

## 1. Neu bestätigte DOM-Selektoren

Ergänzungen zur BLUEPRINT.md — aus dem Deal Collector (v3.1.4):

| Selektor | Zweck | Status |
|---|---|---|
| `article[id^="thread_"]` | Alle Deal-Artikel (ID-Präfix `thread_`) | ✅ stabil, `data-t` bevorzugen |
| `button[data-t="temperature"]` | Temperatur-Button (besser als `.cept-vote-temp`) | ✅ `data-t` → sehr stabil |
| `ul[data-t="breadcrumbs"] a span` | Breadcrumb-Navigation | ✅ stabil |
| `a[data-t="commentsLink"]` | Kommentar-Zähler + Link | ✅ bestätigt durch Mo's HTML |
| `button[data-t="moreReplies"]` | "Mehr Antworten"-Button (DOM-Ansatz) | ⚠️ vermutlich noch da, aber GQL besser |
| `.thread--expired` | Abgelaufener Deal | ✅ stabil (Klasse am article) |

### Temperaturstufen (vollständig)

Das Deal Collector-Script zeigt, dass es **4 Stufen** gibt, nicht nur 2:

```
vote-temp--burn  → sehr heiß  (Feuer-Icon, > ca. 1000°)
vote-temp--hot   → heiß       (bisher nicht in BLUEPRINT!)
vote-temp--warm  → warm       (positiv, unter hot-Schwelle)
vote-temp--cold  → kalt       (negativ) — alternativ: kein warm/hot/burn
```

**Aktion:** `SEL.isHot` in deal-parser.js auf `'.vote-temp--burn, .vote-temp--hot'` erweitern,
oder `isHot` und `isBurn` als separate Felder führen.

### Veraltete Selektoren (broken, nicht verwenden)

```
.mute--text.text--lineThrough   → alter Originalpreis-Selektor (2024)
.commentList-item[data-id]      → alter Kommentar-Selektor
ol.commentList.commentList--anchored → alter Kommentarlisten-Container
nav[role="navigation"] .comments-pagi-page → alte Paginierung
```

---

## 2. Preis als Integer (Cent-Arithmetik)

Der Deal Collector speichert Preise als **Ganzzahl in Cent**, nicht als Float.

```js
// Alt (Deal Collector) — parseEuroToCents()
"1.234,56 €" → 123456
"99,99€"     → 9999

function parseEuroToCents(txt) {
  const clean = txt.replace(/\s/g, '').replace('€','').replace(/\./g,'').replace(',','.');
  const n = parseFloat(clean);
  return isFinite(n) ? Math.round(n * 100) : null;
}
```

**Warum das wichtig ist:** Float-Vergleiche (`29.99 > 30`) können durch Rundungsfehler brechen.
Mit Cent-Integer ist `< 3000` (= 30,00 €) immer korrekt.

**Aktion:** ~~Preisvergleiche intern mit `Math.round(price * 100)` absichern~~ ✅ **Erledigt (2026-09-11):**
`filter-engine.js` vergleicht in `_cents()` (Maximalpreis + Tier-System). Test: `/tmp/opencode/smoke-cents.js`.

---

## 3. Geizfaktor — Mindestersparniss in € (nicht %)

Das allererste Script (Jan 2024) hatte einen Filter den wir noch nicht haben:

```js
const Geizfaktor = 6; // mind. 6 € Ersparnis nötig
// savings = originalPrice - reducedPrice
// if (savings < Geizfaktor) → ausblenden
```

Das ist **anders als `minDiscount` (%)**: Es filtert nach absolutem Sparbetrag in Euro.
Beispiel: 100 € → 95 € = 5 % Rabatt, aber nur 5 € gespart → würde bei Geizfaktor=6 gefiltert.

**GQL-Port:** `priceOriginal` und `price` aus dem Thread-Objekt → `savings = priceOriginal - price`.

**Aktion:** Neues Setting `mdm_minSavings` (number|null, in €) in settings-store.js,
Filterregel #11 in deal-filter-engine.js.

---

## 4. Ghost-Modus (teilweise sichtbar statt komplett ausgeblendet)

Beide Preis-Highlight-Scripts hatten einen "Ghost"-Modus:

```js
// Statt display:none → opacity + Hintergrundfarbe
article.style = `background-color: rgba(255, 34, 34, 0.1); opacity: 0.5;`;
// Konstante Geizfaktorvisible = 'yes' → sichtbar (aber ausgegraut)
// Konstante Geizfaktorvisible = 'none' → komplett ausgeblendet
```

**Idee für Extension:** Pro Filter oder global ein Toggle "Ausblenden vs. Abdunkeln".
Abgedunkelte Deals sind im Feed sichtbar aber klar markiert — weniger brutal als `display:none`.

**GQL-Port:** Nur UI-Logik, kein API-Aufruf nötig. CSS-Klasse statt `display:none`.

---

## 5. Liste ausgeblendeter Deals (Hidden Deals Modal)

Das "Mydealz Deals ausblenden"-Script (Basics0119) hatte eine Funktion die wir nicht haben:

```js
// Modal zeigt alle manuell ausgeblendeten Deals als Liste mit Links
function showHiddenDeals() {
  // iteriert hiddenDeals[], findet article per getElementById, zeigt Titel + Link
}
```

**Problem mit DOM-Ansatz:** Funktioniert nur solange die Artikel noch im DOM sind (aktuelle Seite).
**Besser mit GQL:** IDs aus `chrome.storage.local` → `fetchThreads(ids)` → Titel + URL anzeigen.

**Aktion:** Im Settings-Modal oder Extension-Popup: Tab "Ausgeblendet (N)" mit GQL-fetch der
gespeicherten IDs → Titel + direktlink + "Wiederherstellen"-Button.

---

## 6. IntersectionObserver für Infinite Scroll

Der Deal Collector hat einen eleganten Ansatz für Infinite Scroll:

```js
// Beobachtet immer das LETZTE article-Element im Feed
const articles = [...document.querySelectorAll("article[id^='thread_']")];
const lastArticle = articles[articles.length - 1];
intersectionObserver.observe(lastArticle);

// Wenn sichtbar → scroll nach unten → neue Artikel laden
// Dann: watchLastArticle() neu aufrufen → neues letztes Element beobachten
```

**Außerdem:** `visibilitychange`-Event — IO pausieren wenn Tab im Hintergrund.

**Relevanz für Extension:** Unser MutationObserver läuft immer, auch im Hintergrund.
Der IO-Ansatz ist effizienter für Feeds mit Infinite Scroll.

**Aktion:** Optional — aktueller 120ms-Debounce-Observer ist solide genug für Filterung.
IO wäre nur relevant wenn wir selbst Scroll-Behavior triggern wollen.

---

## 7. Breadcrumb-Extraktion

```js
// Stabile data-t Selektoren für Breadcrumbs
ul[data-t="breadcrumbs"] a span
// → gibt Kategoriepfad: "Elektronik > Smartphones"
```

**Verwendung im Exporter:** In `_getMetadata()` für den Exporter-Export nützlich —
zeigt aus welcher Kategorie die Deals kommen.

**GQL-Port:** Kategorie-Info ist auch im `__INITIAL_STATE__` verfügbar,
Breadcrumb aus DOM als Fallback.

---

## 8. Deal Collector — GQL-Port ✅ ERLEDIGT, mit anderem Muster als gedacht

Das war der interessanteste Kandidat für eine GQL-Migration — er ist **2026-09-11 erledigt**,
aber NICHT mit der untenstehenden best-guess Pagination-Query (die war nie verifiziert und
ist jetzt entfernt), sondern mit der **verifizierten Pipeline aus dem MydealzExporter**:

1. IDs aus `article[id^="thread_"]` + `__INITIAL_STATE__` + max. 2 AJAX-Folgeseiten
   (`?page=N&ajax=true&layout=horizontal` → `data-vue3`-Payloads)
2. Daten per **GQL-Alias-Batch**: `t<id>: thread(threadId: { eq: <id> })`, 30 IDs/Request
3. Normalize → Markdown-Export

### Alte best-guess-Query (ARCHIVIERT — so nicht verwenden!)

```graphql
# Hypothetisch — Query-Name war ein Guess (kein Introspection möglich)
query threads($filter: ThreadFilter, $limit: Int, $page: Int) {
  threads(filter: $filter, limit: $limit, page: $page) { ... }
}
```

**Verifiziert statt geraten (MydealzExporter, live getestet 2026-09-09):**
- `thread(threadId: { eq: N })` mit 24-Feld-Inventar (`THREAD_FIELDS` in graphql-client.js)
- Alias-Batching: 30 Threads pro Request, 400 ms Pause
- `data-vue3`-Attribute: Thread-IDs + outbound-Link ohne Netzwerk-Call
- AJAX-Folgeseiten deckeln: 2 Extraseiten, 700 ms Pause — kein Ban-Risiko
- Anonyme GQL-Queries scheitern mit `{message:"Whiiiiiiieeee"}` — Session nötig

**Statistiken aus gesammelten Deals (wie Deal Collector Export):**
```js
// Avg/Min/Max Temperatur, Preis, Verteilung nach Status
// → für AI-Analyse der Kategorie ideal
```

---

## 9. Kommentare laden — DOM vs GQL Vergleich

Das "Isoliertes Load All Comments"-Script verdeutlicht warum GQL besser ist:

| | DOM-Ansatz (alt) | GQL-Ansatz (neu) |
|---|---|---|
| Methode | Klickt `button[data-t="moreReplies"]` | POST /graphql |
| Antworten | Klickt Buttons sequenziell | `mainCommentId` Filter |
| Seiten | Navigiert via "Nächste Seite"-Button | `page` Parameter |
| Stabilität | Bricht bei jedem CSS-Umbau | Unabhängig vom DOM |
| Geschwindigkeit | Langsam (2s pro Seitenwechsel) | Schnell (parallel möglich) |
| Reaktionen | Nicht verfügbar im DOM | `reactionCounts { type count }` |

**Fazit:** Unser GQL-Ansatz im Exporter ist der richtige Weg. Das alte Script kann archiviert werden.

---

## Priorisierte Aktionen

| Prio | Was | Wo | Status |
|---|---|---|---|
| 🔴 hoch | ~~`vote-temp--hot` in deal-parser.js ergänzen~~ | deal-parser.js | ✅ erledigt (`SEL.isHot: '.vote-temp--burn, .vote-temp--hot'`) |
| 🔴 hoch | ~~`utils.js` schreiben~~ | neu | ✅ bewusst entschieden: Logik lebt in `filter-engine.js` (`matchesExpression` ist für Tests exportiert); keine extra utils.js |
| 🟠 mittel | `mdm_minSavings` Filter (Geizfaktor in €) | settings-schema + filter-engine | ⬜ offen — `nextBestPrice`/`priceOff` sind jetzt via GQL verfügbar |
| 🟠 mittel | Ausgeblendete Deals Liste im Popup (via GQL) | popup.js | ⬜ offen — `fetchThreadBatch()` (verifiziert!) existiert jetzt, Nutzung fehlt noch |
| 🟡 niedrig | ~~Ghost-Modus (opacity statt display:none)~~ | ui-controller.js | ✅ erledigt (Tier B = ghost) |
| 🟡 niedrig | ~~`collector.js` — GQL-basierter Deal-Collector~~ | neu | ✅ erledigt (Alias-Batch + AJAX-Pagination, siehe §8) |
| 🟡 niedrig | Breadcrumb in Exporter-Metadata | exporter.js | ⬜ offen |
| 🟡 niedrig | Settings-Import-UI (Restore) im Popup | popup.js | ⬜ offen — `importAll()` existiert, kein UI |

---

## 10. Sprint-Erkenntnisse 2026-09-11 (Umbau-Sprint)

Referenzen: `/home/moritz/repos/mydealz-Managergpt/docs/ARCHITECTURE_BRIEF.md` (Zielarchitektur),
`/home/moritz/repos/MydealzExporter/data_insights.md` (GQL-Grundlagenforschung).

### Verified GraphQL (aus MydealzExporter übernommen — nicht mehr raten!)
- **Permalink-Struktur (offiziell):** alt `/comments/permalink/<id>` → neu `<deal-url>#comment-<id>` bzw. `#reply-<id>` — **unser `_permalink()` liefert exakt das neue Format** (Quelle: mydealz-Diskussion „Neue Link-Struktur von Mydealz", Thread 2462696, 2024-11)
- **`comment(id: $id) { url }` — verifiziert live 2026-09-11:** Kommentar-ID → vollständige Thread-URL mit Anker (200, Quelle: Bookmarklet im Thread 2462696). Neue Client-Capability `fetchCommentUrl()` — Anwendungsfall: alte Link-Sammlungen reparieren (das Problem, um das der Thread kreist)
- **Sortier-UI — verifiziert live 2026-09-11:** Listings steuern „Beliebteste/Neueste" über `<select name="time_frame">` (JS-Navigation, kein GET-Redirect, `?time_frame=recent` als URL-Param wirkt NICHT, keine Links/Formulare). Suche: `form[action*="/search"]` existiert → hidden `input[name="sortBy"]` beim Submit (Port des Solo-Tools) — Implementation `features/sort-memory.js`
- **Thread-Batch:** `t<id>: thread(threadId: { eq: <id> })`, 30er-Alias-Chunks (graphql-client.js `fetchThreadBatch`) — **live verifiziert 2026-09-11: 200, 2 Aliase, 0 Errors, alle Felder belegt**
- **⚠️ `keywordNames` ist GIFT (live 2026-09-11):** Feld wirft "Internal server error" und leert das GESAMTE Alias-Ergebnis (methodik.md §1). Bewusst aus THREAD_FIELDS entfernt — nicht wieder einbauen
- **URL-Realität (live):** GQL `url` kommt absolut; Fallback ist `/<id>` (301 auf echte Seite). `/deals/<id>` OHNE Slug = "Ups"-410-Seite — NIE als Link ausgeben
- **Kommentare:** `comments(filter: CommentFilter)` + `repliesPreview` — live 200, pagination {last:22, count:110}; die meisten Replies stecken schon im Root-Objekt
- **Replies-Pflicht:** Composite-Key `mainCommentId` **UND** `threadId` — ohne threadId antwortet die API still nichts
- **CSRF:** `meta[name="csrf-token"]` existiert NICHT mehr (live) — Cookie-Fallback (`xsrf_t`) mit URI-Decode + Quote-Unquote ist der reale Weg und läuft (GQL 200 mit Cookie-Session, ohne Meta-Tag)
- **Throttle-Falle:** HTTP 200 + HTML statt JSON bei Drosselung → Client wirft klaren Fehler statt SyntaxError
- **Retry-Politik:** nur 408/429/5xx/Netz retryen, 403/404 sofort; `Retry-After` schlägt Eigen-Backoff
- **Session-Pflicht:** anonyme GQL-Queries → `{message:"Whiiiiiiieeee"}`

### Verified DOM (live 2026-09-11, Listing /deals + /new + /search)
- Alle `data-t`-Selektoren leben: `article[data-t="thread"]` (30×), `threadLink`/`merchantLink`/`commentsLink`/`dealLink` ✓
- `.thread-price` (28×), `.text--lineThrough` (34×), `[class*="textBadge"]` (25×), `.cept-vote-temp` + `.overflow--wrap-off` ✓
- **`vote-temp--warm` bestätigt** (27× auf /new; burn 1×, hot 2×) — 4-Stufen-Kette burn/hot/warm/cold aus §1 bestätigt
- **⚠️ Listing-States tragen KEINE Thread-Daten:** `__INITIAL_STATE__` auf /deals, /new, /search enthält kein feeds/entities/search/thread-Daten (~22 KB Gesamt-State, kein __NEXT_DATA__, keine JSON-Scripts, kein data-vue3 im Initial-HTML). Thread-Daten im State gibt es NUR als `threadDetail` auf Detailseiten (verifiziert: price/temperature/user/merchant/shipping/groupsPath/temperatureLevel/type). deal-parser + collector sind entsprechend bereinigt (keine geratenen Pfade mehr)
- **AJAX-Folgeseiten:** `?page=N&ajax=true&layout=horizontal` → JSON {data:{content}}, 30 Artikel, 276 data-vue3-Payloads mit `props.thread.threadId` (live ✓)

### Architektur-Umbau (Stand 2026-09-11)
- **`src/core/settings-schema.js`** ist jetzt SSOT für Keys/Defaults/UI-Zugehörigkeit; `settings-store.js` und `popup.js` leiten davon ab (vorher: dreifach-Duplikat)
- **`storage.js`-Wrapper** ist wirklich die Datenschicht (settings-store spricht nur noch über `StorageApi`; Userscript-Bundle lädt storage.js mit GM-Shim)
- **deal-parser** ist bewusst synchron + netzfrei (toter `parseAsync`/`_fromGQL` entfernt); GraphQL läuft nur über graphql-client.js
- **`_fromState` enrichment:** discountPct/userVote/discount/isWarm werden aus DOM ergänzt — vorher wären minDiscount/hideOwnColdVotes alle State-Deals ausgeblendet haben
- **Collector** nutzt die verifizierte Pipeline (IDs → GQL-Batch → normalize → MD) statt best-guess Pagination
- **Preisvergleiche** laufen in Cent-Integern (`filter-engine.js` `_cents()`)

### Prozess-Lektion (niemals wieder!)
- **`node build.js` parst das Bundle NICHT** — zwei echte Syntaxfehler (ungültiges `function get settings()`, `a || b ?? c`) haben überlebt, weil niemand `node --check` auf jede Quelldatei lief. Workflow-Regel: **nach jedem Umbau `node --check` über alle Dateien + Smoke-Tests**, bevor der Build als "fertig" gilt.
- Smoke-Tests leben in `/tmp/opencode/smoke-*.js` (gemockte chrome/DOM-Umgebung, Konkatenations-Strategie wie build.js) — Ziel: ins Repo überführen (`tests/`).

### Offene Fragen / nächste Schritte
- Feature-Registry + Verdict-Aggregator (Sonnet-Entwurf Schritt 2) — siehe `docs/ARCHITECTURE_BRIEF.md`
- DealData-Normalizer (Schritt 3): Feld-Merge über Quellen, alle Felder existieren immer
- Passives GQL-Capture (Schritt 4) — MAIN-World-Bridge, komplexester Baustein, zuletzt
