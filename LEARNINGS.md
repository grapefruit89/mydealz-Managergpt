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

**Aktion:** `Utils.parseNumber()` (noch zu schreiben) sollte optional Cents zurückgeben,
oder Preisvergleiche intern mit `Math.round(price * 100)` absichern.

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

## 8. Deal Collector — GQL-Port-Potential ⭐

Das ist der interessanteste Kandidat für eine GQL-Migration.

### Was es aktuell macht (DOM-basiert):
- Scannen alle `article[id^="thread_"]` auf der Seite
- Extrahiert: ID, Titel, URL, Temperatur, Preis, Autor, Kommentaranzahl, Beschreibung, Status
- Speichert in `localStorage` (max 500 Deals, max 10 Seiten)
- Infinite Scroll über IntersectionObserver
- Export als JSON mit AI-optimierten Metadaten + Statistiken

### GQL-Port-Idee: `src/modules/collector.js`

Statt DOM-Scraping ein GQL-Query der strukturierte Daten direkt zurückgibt:

```graphql
# Hypothetisch — Query-Name muss live verifiziert werden
query threads($filter: ThreadFilter, $limit: Int, $page: Int) {
  threads(filter: $filter, limit: $limit, page: $page) {
    items {
      threadId
      title
      price
      priceOriginal    # → Geizfaktor berechenbar!
      temperature
      status           # ACTIVE | EXPIRED
      threadType       # DEAL | VOUCHER
      publishedAt
      commentCount
      merchant { merchantId merchantName }
      user { username }
      mainImage { path }
    }
    pagination { last total }
  }
}
```

**Vorteile gegenüber DOM:**
- Keine Infinite-Scroll-Simulation nötig
- `priceOriginal` direkt verfügbar → Geizfaktor berechenbar
- Bis zu `limit: 100` Deals pro Request
- Kein Layout-abhängiger Selektor

**Statistiken aus gesammelten Deals (wie Deal Collector Export):**
```js
// Avg/Min/Max Temperatur, Preis, Verteilung nach Status
// → für AI-Analyse der Kategorie ideal
```

**Unbekannte:** Query-Name `threads` ist ein Guess (kein Introspection möglich).
Muss live verifiziert werden. Alternativ: `search(query: "", ...)` könnte auch alle Deals einer
Kategorie zurückgeben.

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

| Prio | Was | Wo |
|---|---|---|
| 🔴 hoch | `vote-temp--hot` in deal-parser.js ergänzen | deal-parser.js |
| 🔴 hoch | `utils.js` schreiben (parseFilterExpression, normalizeText, parseNumber) | neu |
| 🟠 mittel | `mdm_minSavings` Filter (Geizfaktor in €) | settings-store + filter-engine |
| 🟠 mittel | Ausgeblendete Deals Liste im Popup (via GQL fetchThreads) | popup.js |
| 🟡 niedrig | Ghost-Modus (opacity statt display:none) | ui-controller.js |
| 🟡 niedrig | `collector.js` — GQL-basierter Deal-Collector (Query-Name verifizieren) | neu |
| 🟡 niedrig | Breadcrumb in Exporter-Metadata | exporter.js |
