# mydealz Manager – Technische Blaupause
> Stand: Juli 2026 | Verifiziert mit Live-HTML von mydealz.de

---

## 1. Deal-Karte: Anatomie des `<article>`-Elements

### 1.1 Das Root-Element

```html
<article
  id="thread_2806177"
  class="thread cept-thread-item thread--newCard thread--shadow thread--type-list
         imgFrame-container--scale thread--deal"
  data-t="thread"
  data-t-d='{"id":2806177}'
  data-ocular='{"thread_ids":2806177}'
  data-history='{"endpoint":"https://www.mydealz.de","replace":true,"data":{"scrollTo":"#thread_2806177","offset":70}}'
>
```

| Attribut | Wert | Zweck |
|---|---|---|
| `id` | `"thread_2806177"` | Deal-ID: split auf `_`, zweiter Teil |
| `data-t` | `"thread"` | Stabile Analytics-Kennung – **bester Artikel-Selektor** |
| `data-t-d` | `'{"id":2806177}'` | **JSON mit Deal-ID** – zuverlässigster ID-Zugriff |
| `data-ocular` | `'{"thread_ids":2806177}'` | Tracking-System, enthält ebenfalls die ID |
| `class` enthält `thread--deal` | — | Typ: normaler Deal |
| `class` enthält `thread--voucher` | — | Typ: Gutschein |
| `class` enthält `thread--expired` | — | Status: abgelaufen |
| `class` enthält `thread--newCard` | — | Neues Card-Layout (aktuell) |

**Empfohlener Selektor für alle Deals:**
```js
document.querySelectorAll('article[data-t="thread"]')
```

**Deal-ID lesen (zuverlässigste Methode):**
```js
const dealId = JSON.parse(el.dataset.tD).id;
// Fallback:
const dealId = el.id.split('_')[1];
```

---

### 1.2 Temperatursystem

```html
<button class="cept-vote-temp vote-temp vote-temp--burn size--all-m space--mh-1"
        title="Derzeit bewertet mit 1809°. Dein Vote verändert die Temperatur!">
  <span class="overflow--wrap-off">1809°</span>
</button>
```

| Feld | Selektor / Attribut | Beispielwert | Hinweis |
|---|---|---|---|
| Temperaturwert | `.cept-vote-temp .overflow--wrap-off` | `"1809°"` | Parse: `parseInt(text)` |
| Temperatur exakt | `.cept-vote-temp[title]` | `"Derzeit bewertet mit 1809°..."` | Regex: `/(\d+)°/` |
| Heißer Deal | `.vote-temp--burn` vorhanden | — | temp hoch (z.B. 1809°, 3620°) |
| Warmer Deal | `.vote-temp--warm` vorhanden | — | temp moderat (z.B. 69°) ✅ bestätigt |
| Kalter Deal | `.vote-temp--freeze` vorhanden | — | temp < 0 (Klasse unbestätigt) |
| Down-Vote Button | `.vote-button--mode-down` | — | User hat NICHT cold-gevotet |
| **Cold-voted (eigener Vote!)** | `.vote-button--mode-down.vote-button--mode-selected` | — | ✅ User hat cold-gevotet |
| **Hot-voted (eigener Vote!)** | `.vote-button--mode-up.vote-button--mode-selected` | — | User hat hot-gevotet |
| Titel bei eigenem Vote | `[title="Abstimmung rückgängig machen"]` | — | statt "Nicht überzeugt?" |

**Temperatur-Klassen (bestätigt):**
```
vote-temp--burn  = heiß      (hohe positive Temperatur)
vote-temp--warm  = warm      (moderate positive Temperatur)
vote-temp--[?]   = kalt      (negative Temperatur, Klasse noch unbekannt)
```

**Eigenen Vote erkennen:**
```js
const downBtn = el.querySelector('.vote-button--mode-down');
const upBtn   = el.querySelector('.vote-button--mode-up');
const userVote =
  downBtn?.classList.contains('vote-button--mode-selected') ? 'cold' :
  upBtn?.classList.contains('vote-button--mode-selected')   ? 'hot'  : null;
// null = kein eigener Vote
```

**Parsing:**
```js
const tempEl = el.querySelector('.cept-vote-temp .overflow--wrap-off');
const temperature = parseFloat(tempEl?.textContent?.replace('°','')) ?? null;
// Alt: aus title-Attribut (noch robuster):
const titleStr = el.querySelector('.cept-vote-temp')?.title ?? '';
const temperature = parseInt(titleStr.match(/(\d+)°/)?.[1]) ?? null;
```

---

### 1.3 Preissystem

```html
<span class="text--b size--all-xl thread-price size--fromW3-xxl">39,65€</span>
<span class="color--text-NeutralSecondary text--lineThrough space--ml-1 size--all-m">94,99€</span>
<div class="textBadge textBadge--green size--all-s">-58%</div>
```

| Feld | Selektor | Beispielwert | Hinweis |
|---|---|---|---|
| Aktueller Preis | `.thread-price` | `"39,65€"` | Primär |
| Aktueller Preis (alt) | `.threadItemCard-price` | — | älteres Layout |
| Aktueller Preis (alt) | `.cept-price` | — | weiterer Fallback |
| Originalpreis | `.text--lineThrough` | `"94,99€"` | Durchgestrichen |
| Rabatt-Badge | `.textBadge--green` | `"-58% "` | grün = Ersparnis (trailing space!) |
| Rabatt-Badge negativ | `.textBadge--red` | `"+38% "` | rot = Preiserhöhung |
| Rabatt als Zahl | parse aus Badge-Text | `58` | `parseInt(text.replace(/[^-\d]/g,''))` |
| Gratis-Deal | Text = `"GRATIS"` oder `"Kostenlos"` | — | Preis = 0 |

**Discount parsen (für Min-Discount-Filter):**
```js
const badgeEl = el.querySelector('.textBadge--green, .textBadge--red');
const discountText = badgeEl?.textContent?.trim() ?? '';        // "-38% "
const discountPct  = parseInt(discountText.replace(/[^-\d]/g,'')); // -38
const discountAbs  = Math.abs(discountPct);                     // 38 (als Absolutwert)
// Positiv = Ersparnis, Negativ = Aufschlag
```
| Versandkosten | `.icon--truck` Elternelement | `"5,75€"` | nach `inkl.` Text |
| Versandkostenfrei | Text = `"Kostenlos"` im Truck-Bereich | — | Versand = 0 |

**Parsing:**
```js
function parsePrice(el) {
  const raw = el?.textContent?.trim() ?? '';
  if (/gratis|kostenlos/i.test(raw)) return 0;
  return parseFloat(raw.replace(/[^\d,]/g,'').replace(',','.')) || null;
}
const priceEl = el.querySelector('.thread-price, .threadItemCard-price, .cept-price');
const price = parsePrice(priceEl);

const origPriceEl = el.querySelector('.text--lineThrough');
const origPrice = parsePrice(origPriceEl);

const discountEl = el.querySelector('.textBadge--green, .textBadge--red');
const discount = discountEl?.textContent?.trim() ?? null; // "-58%"
```

---

### 1.4 Titel

```html
<a class="cept-tt thread-link linkPlain thread-title--list js-thread-title"
   title="Fußball Trikots im Sale..."
   href="https://www.mydealz.de/deals/fussball-trikots-im-sale-...-2806177"
   data-t="threadLink">
  Fußball Trikots im Sale...
</a>
```

| Feld | Selektor / Attribut | Wert |
|---|---|---|
| Titeltext | `[data-t="threadLink"]` → `.textContent` | vollständiger Titel |
| Titel (alt) | `[data-t="threadLink"][title]` | `title` Attribut (identisch) |
| Deal-URL | `[data-t="threadLink"][href]` | `https://www.mydealz.de/deals/...-2806177` |
| Deal-ID aus URL | Regex auf href: `/-(\d+)$/` | `"2806177"` |

**Empfohlen:**
```js
const titleEl = el.querySelector('[data-t="threadLink"]');
const title  = titleEl?.title || titleEl?.textContent?.trim() ?? '';
const href   = titleEl?.href ?? '';
const dealId = href.match(/-(\d+)(?:[?#].*)?$/)?.[1] ?? null;
```

---

### 1.5 Händler (Merchant)

```html
<a href="/search/deals?merchant-id=456"
   class="link text--b color--text-AccentBrand color--text-NeutralPrimary"
   data-t="merchantLink">
  Lounge by Zalando
</a>
```

| Feld | Selektor / Attribut | Wert |
|---|---|---|
| Händler-Name | `[data-t="merchantLink"]` → text | `"Lounge by Zalando"` |
| Händler-ID | `[data-t="merchantLink"][href]` → Regex | `456` |
| Händler-URL | `href` auf Link | `/search/deals?merchant-id=456` |
| Alle Deals dieses Händlers | `https://www.mydealz.de/search/deals?merchant-id={id}` | — |

**Parsing:**
```js
const merchantEl = el.querySelector('[data-t="merchantLink"]');
const merchantName = merchantEl?.textContent?.trim() ?? '';
const merchantId   = merchantEl?.href?.match(/merchant-id=(\d+)/)?.[1] ?? null;
```

---

### 1.6 User / Autor

```html
<img src="https://static.mydealz.de/users/raw/default/2395471_6/fi/60x60/qt/45/2395471_6.jpg"
     alt="Robert_Chi's Profilbild">
<span class="overflow--ellipsis size--all-xs size--fromW3-s">Veröffentlicht von Robert_Chi</span>
```

| Feld | Selektor / Attribut | Wert | Parsing |
|---|---|---|---|
| Benutzername | Avatar `[alt]` | `"Robert_Chi's Profilbild"` | Entferne `"'s Profilbild"` |
| Benutzername | Text nach `"Veröffentlicht von "` | `"Robert_Chi"` | — |
| User-ID | Avatar `[src]` | `2395471` | Regex: `/users\/raw\/default\/(\d+)_/` |
| Avatar-URL 60px | `[src]` | `https://static.mydealz.de/users/raw/default/2395471_6/fi/60x60/qt/45/2395471_6.jpg` | — |

**Parsing:**
```js
const avatarImg = el.querySelector('img[alt*="Profilbild"]');
const username  = avatarImg?.alt?.replace(/'s Profilbild$/, '').trim() ?? '';
const userId    = avatarImg?.src?.match(/users\/raw\/default\/(\d+)_/)?.[1] ?? null;
```

---

### 1.7 Kommentare & Footer-Aktionen

```html
<a href="/deals/...-2806177#comments"
   class="button button--type-text 2806177"
   data-t="commentsLink">
  <svg class="icon--comment">...</svg> 34
</a>

<button data-t="shareBtn">...</button>
<button data-t="addBookmark">...</button>

<a href="https://www.mydealz.de/visit/homehighlights/2806177"
   data-t="dealLink"
   data-t-click="ocular,fb"
   rel="nofollow noopener">
  Zum Deal →
</a>
```

| Feld | Selektor | Wert | Hinweis |
|---|---|---|---|
| Kommentaranzahl | `[data-t="commentsLink"]` → text (Zahl) | `"34"` | Strip Icon-Text |
| Kommentar-URL | `[data-t="commentsLink"][href]` | `.../deals/...-2806177#comments` | — |
| Externer Deal-Link | `[data-t="dealLink"][href]` | `mydealz.de/visit/.../2806177` | Tracking-URL |
| Share-Button | `[data-t="shareBtn"]` | — | — |
| Bookmark-Button | `[data-t="addBookmark"]` | — | — |

**Kommentaranzahl:**
```js
const commentsEl = el.querySelector('[data-t="commentsLink"]');
const comments   = parseInt(commentsEl?.textContent?.trim()?.split(/\s+/)?.pop()) || 0;
```

---

### 1.8 Deal-Bild (CDN)

```html
<img src="https://static.mydealz.de/threads/raw/4LP9K/2806177_1/re/202x202/qt/70/2806177_1.jpg"
     srcset="https://static.mydealz.de/threads/raw/4LP9K/2806177_1/re/404x404/qt/50/2806177_1.jpg 2x"
     alt="Fußball Trikots...">
```

**URL-Pattern:**
```
https://static.mydealz.de/threads/raw/{hash}/{dealId}_{imgIndex}/re/{width}x{height}/qt/{quality}/{dealId}_{imgIndex}.jpg
```

| Teil | Beispiel | Bedeutung |
|---|---|---|
| `{hash}` | `4LP9K` | CDN-Hash, ändert sich bei Bildupdate |
| `{dealId}` | `2806177` | Deal-ID |
| `{imgIndex}` | `1` | Bild-Nummer (1 = Hauptbild) |
| `{width}x{height}` | `202x202` | Auflösung |
| `{quality}` | `70` | JPEG-Qualität (0-100) |

**Verfügbare Größen:**
- `202x202` (Listing-Thumbnail)
- `404x404` (Retina Listing, `srcset 2x`)
- `768x768` (Detail-Seite)

**User-Avatar Pattern:**
```
https://static.mydealz.de/users/raw/default/{userId}_{version}/fi/{width}x{height}/qt/{quality}/{userId}_{version}.jpg
```

---

### 1.9 Status-Chip / Update-Info

```html
<span class="chip chip--type-default chip--variant-outlined">
  <span class="size--all-s">
    <span class="flex">
      <svg class="icon icon--update">...</svg>
      Aktualisiert vor 2 Std.
    </span>
  </span>
</span>
```

| Feld | Selektor | Wert | Hinweis |
|---|---|---|---|
| Status-Text | `.chip--variant-outlined` → text | `"Aktualisiert vor 2 Std."` | Enthält relative Zeit |
| Update-Status | `.icon--update` vorhanden | — | Zeigt dass Deal aktualisiert wurde |
| Neuer Deal | kein Chip oder anderes Icon | — | — |
| Abgelaufen | `.thread--expired` auf article | — | CSS-Klasse am Artikel |

---

### 1.10 Beschreibung (Kurztext)

```html
<div class="userHtml userHtml-content">
  <div class="overflow--wrap-break width--all-12 size--all-s space--t-2
              color--text-TranslucentSecondary hide--toW3"
       data-handler="lightbox-xhr emoticon-preview">
    Bei Zalando Lounge sind aktuell verschiedene Trikots im Sale...
  </div>
</div>
```

| Feld | Selektor | Hinweis |
|---|---|---|
| Beschreibungstext | `.userHtml-content .overflow--wrap-break` | Kurztext, abgeschnitten |
| `hide--toW3` | Klasse | Auf Mobil versteckt |
| `data-handler="lightbox-xhr"` | Attribut | Lightbox/Volltext per XHR |

---

## 2. Vollständige Feldliste – DealData Objekt

```js
{
  // ── Identifikation ──────────────────────────────────────────────────────
  id:           "2806177",    // string, aus data-t-d JSON oder URL
  href:         "https://www.mydealz.de/deals/fussball-trikots-...-2806177",
  externalHref: "https://www.mydealz.de/visit/homehighlights/2806177",

  // ── Inhalt ───────────────────────────────────────────────────────────────
  title:        "Fußball Trikots im Sale...",
  description:  "Bei Zalando Lounge sind aktuell...",  // Kurztext

  // ── Preise ───────────────────────────────────────────────────────────────
  price:        39.65,     // number | null (0 = gratis)
  priceOrig:    94.99,     // number | null  (Originalpreis, durchgestrichen)
  discount:     "-58%",    // string | null
  shipping:     5.75,      // number | null (0 = kostenlos)

  // ── Bewertung ─────────────────────────────────────────────────────────────
  temperature:  1809,      // number | null
  isHot:        true,      // bool (temp > 0 && .vote-temp--burn)
  isCold:       false,     // bool (temp < 0)

  // ── Händler ──────────────────────────────────────────────────────────────
  merchantId:   "456",     // string | null
  merchantName: "Lounge by Zalando",

  // ── Autor ────────────────────────────────────────────────────────────────
  username:     "Robert_Chi",
  userId:       "2395471",   // aus Avatar-URL extrahiert
  userAvatarUrl:"https://static.mydealz.de/users/raw/default/2395471_6/...",

  // ── Bilder ───────────────────────────────────────────────────────────────
  imageUrl:     "https://static.mydealz.de/threads/raw/4LP9K/2806177_1/re/202x202/...",
  imageAlt:     "Fußball Trikots...",

  // ── Engagement ───────────────────────────────────────────────────────────
  commentCount: 34,       // number

  // ── Status ───────────────────────────────────────────────────────────────
  isExpired:    false,    // bool (.thread--expired auf article)
  isVoucher:    false,    // bool (.thread--voucher)
  statusText:   "Aktualisiert vor 2 Std.",  // string aus Status-Chip

  // ── Metadaten ─────────────────────────────────────────────────────────────
  element:      HTMLElement,  // Referenz auf das <article>
  _source:      "state" | "dom",  // woher die Daten kommen
}
```

---

## 3. CSS-Selektoren: Priorisierte Selector-Kette

### Empfohlen (stabil, `data-t` Attribute vom Tracking-System):

| Feld | Primär (stable) | Fallback |
|---|---|---|
| Alle Deals | `article[data-t="thread"]` | `article.thread--deal, article.thread--voucher` |
| Deal-ID | `el.dataset.tD` → JSON | `el.id.split('_')[1]` |
| Titel | `[data-t="threadLink"][title]` | `.cept-tt`, `.js-thread-title` |
| Merchant | `[data-t="merchantLink"]` | `a[href*="merchant-id="]` |
| Kommentarlink | `[data-t="commentsLink"]` | `a[href*="#comments"]` |
| Deal-Link | `[data-t="dealLink"]` | `a[rel="nofollow"][target="_blank"]` |
| Preis | `.thread-price` | `.threadItemCard-price`, `.cept-price` |
| Temperatur | `.cept-vote-temp .overflow--wrap-off` | `.cept-vote-temp[title]` |
| Abgelaufen | `article.thread--expired` | `[class*="expired"]` |
| Gutschein | `article.thread--voucher` | — |

### Fragil (CSS-Klassen die sich ändern können):

| Feld | Selektor | Risiko |
|---|---|---|
| Originalpreis | `.text--lineThrough` | Design-Klasse, hoch |
| Rabatt-Badge | `.textBadge--green` | Design-Klasse, hoch |
| Beschreibung | `.userHtml-content .overflow--wrap-break` | Layout-Klasse, hoch |
| Status-Chip | `.chip--variant-outlined` | Design-Klasse, mittel |
| Versand | `.icon--truck` Elternelement | Icon-Klasse, mittel |

---

## 4. GraphQL API

### 4.1 Endpoint & Auth

```
POST https://www.mydealz.de/graphql
Content-Type: application/json
x-request-type: application/vnd.pepper.v1+json
x-xsrf-token: {token}
```

**CSRF-Token holen:**
```js
// Option 1: Meta-Tag (bevorzugt)
document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

// Option 2: Cookie
document.cookie.match(/xsrf_t=([^;]+)/)?.[1];
```

### 4.2 Persisted Queries (GET)

```
GET https://www.mydealz.de/graphql/h/{hash}/{version}
```

| Hash | Version | Seite | Status |
|---|---|---|---|
| `48507f02a6d290783afdd8f387d37204b013713650f2aaa515d8c543879f90bf` | `60` | `/deals` Listing, `/search` | Bestätigt live |
| `e742344751f7ca76beef0759f15d8b4ebb1d767458b18bb4b9bb04bf0e31040a` | — | Deal-Detail `/deals/...` | Bestätigt live |

**Achtung:** Hashes ändern sich bei jedem Deploy. Nicht hart kodieren!

### 4.3 Comments Query (bestätigt funktional)

```graphql
query comments($filter: CommentFilter!, $limit: Int, $page: Int) {
  comments(filter: $filter, limit: $limit, page: $page) {
    items {
      commentId
      replyCount
      content
      createdAt
      voteScore
      user {
        username
        bestBadge { level { name } }
      }
      reactionCounts { type count }
    }
    pagination { last }
  }
}
```

**Variablen (Top-Level Kommentare):**
```json
{
  "filter": {
    "threadId": { "eq": "2806177" },
    "order": { "direction": "Ascending" }
  },
  "limit": 50,
  "page": 1
}
```

**Variablen (Antworten auf Kommentar):**
```json
{
  "filter": {
    "mainCommentId": "12345",
    "threadId": { "eq": "2806177" }
  },
  "limit": 200
}
```

### 4.4 Vollständiges Comment-Objekt (aus `export_full.json` verifiziert)

```js
{
  commentId:         "string",
  mainCommentId:     "string | null",   // null wenn Top-Level
  threadId:          "string",
  url:               "string",
  content:           "string",           // HTML-Content
  preparedHtmlContent: "string",
  createdAt:         "ISO timestamp",
  createdAtTs:       number,             // Unix timestamp
  voteScore:         number,
  isReply:           boolean,
  isPinned:          boolean,
  replyCount:        number,
  deletable:         boolean,
  source:            "string",
  status:            "active | deleted",
  repliesPreview:    [],                 // erste paar Antworten
  user: {
    userId:          "string",
    username:        "string",
    imageUrls:       { "60x60": "url", ... },
    bestBadge: {
      level: { name: "string" }
    }
  },
  reactionCounts: [
    { type: "string", count: number }
  ]
}
```

### 4.5 Dynamic POST für Suche

```graphql
query searchThreads($query: String!, $limit: Int, $page: Int) {
  search(query: $query, limit: $limit, page: $page) {
    items {
      threadId
      title
      price
      temperature
      merchant { merchantId merchantName }
      user { username }
      status
      publishedAt
    }
    pagination { last total }
  }
}
```

**Hinweis:** Introspection ist server-seitig deaktiviert. Query-Namen müssen geraten/getestet werden.

---

## 5. `window.__INITIAL_STATE__` (SSR)

Auf jeder Seite in `<script>window.__INITIAL_STATE__ = {...};</script>` eingebettet.
**Stabilster Datenpfad** — überlebt CSS-Klassen-Umbenennung komplett.

### 5.1 Bekannte Pfade

| Seite | Pfad zum Thread-Objekt |
|---|---|
| Deal-Detail | `__INITIAL_STATE__.thread` |
| Listing `/deals` | `__INITIAL_STATE__.threads[dealId]` oder `__INITIAL_STATE__.dealList.threads[dealId]` |
| Suche | `__INITIAL_STATE__.search.threads[dealId]` |
| Kategorie-Seite | `__INITIAL_STATE__.listing.threads[dealId]` |

### 5.2 Thread-Objekt (geschätzte Struktur, da Introspection deaktiviert)

```js
{
  threadId:     2806177,
  id:           2806177,
  title:        "Fußball Trikots...",
  price:        "39.65",           // String oder Number je nach Endpoint
  mainPrice:    "39.65",           // Alternativfeld
  temperature:  1809,
  status:       "active",          // "active" | "expired"
  expired:      false,
  publishedAt:  "ISO timestamp",
  merchant: {
    merchantId:   456,
    merchantName: "Lounge by Zalando",
  },
  user: {
    username: "Robert_Chi",
    userId:   2395471,
  },
  submitter: {                     // Alternativfeld je nach Query
    username: "Robert_Chi",
  }
}
```

---

## 6. URL-Patterns

| URL | Muster | Beispiel |
|---|---|---|
| Deal-Detail | `/deals/{slug}-{id}` | `/deals/fussball-trikots-...-2806177` |
| Händler-Deals | `/search/deals?merchant-id={id}` | `/search/deals?merchant-id=456` |
| Suche | `/search?q={query}` | `/search?q=iphone` |
| Kategorie | `/gruppe/{slug}` | `/gruppe/e-scooter` |
| Kommentar-Anker | `/deals/{slug}-{id}#comments` | — |
| Ext. Link (tracked) | `/visit/{context}/{id}` | `/visit/homehighlights/2806177` |
| Deal-Bild CDN | `static.mydealz.de/threads/raw/{hash}/{id}_{n}/re/{w}x{h}/qt/{q}/{id}_{n}.jpg` | — |
| User-Avatar CDN | `static.mydealz.de/users/raw/default/{userId}_{v}/fi/{w}x{h}/qt/{q}/{userId}_{v}.jpg` | — |
| Preisjaeger | alles identisch auf `preisjaeger.at` | — |

### 6.1 Deal-ID aus URL extrahieren

```js
// Aus beliebiger mydealz-URL:
function dealIdFromUrl(url) {
  return url.match(/-(\d+)(?:[?#].*)?$/)?.[1] ?? null;
}
// Beispiele:
dealIdFromUrl("/deals/fussball-trikots-...-2806177")   // → "2806177"
dealIdFromUrl("/deals/fussball-trikots-...-2806177#comments") // → "2806177"
```

---

## 7. Vollständige Selector-Kette für `deal-parser.js`

```js
// Robuste Selector-Kette (absteigend nach Stabilität):
const SELECTORS = {

  // Artikel-Erkennung
  deal:         'article[data-t="thread"]',
  dealFallback: 'article.thread--deal, article.thread--voucher, article[class*="thread"]',

  // Deal-ID (Attribut → kein DOM nötig)
  dataId:       '[data-t-d]',            // JSON.parse(el.dataset.tD).id

  // Titel
  titleLink:    '[data-t="threadLink"]',  // .title Attr oder .textContent
  titleLinkAlt: '.cept-tt, .js-thread-title',

  // Preis (in Prioritätsreihenfolge)
  price: [
    '.thread-price',
    '.threadItemCard-price',
    '.cept-price',
    '[class*="thread"][class*="price"]',
  ],
  priceOrig:    '.text--lineThrough',
  discount:     '.textBadge--green, .textBadge--red',

  // Temperatur
  tempValue:    '.cept-vote-temp .overflow--wrap-off',
  tempButton:   '.cept-vote-temp',        // .title Attribut als Fallback
  isHot:        '.vote-temp--burn',

  // Händler
  merchant:     '[data-t="merchantLink"]', // .textContent = Name, .href = ID

  // User
  avatarImg:    'img[alt*="Profilbild"]',  // .alt → Name, .src → UserID
  
  // Kommentare
  commentsLink: '[data-t="commentsLink"]', // parseInt(text.trim().split(/\s+/).pop())
  
  // Externes Link
  dealLink:     '[data-t="dealLink"]',

  // Status
  expired:      'article.thread--expired',
  voucher:      'article.thread--voucher',

  // Beschreibung
  description:  '.userHtml-content .overflow--wrap-break',

  // Bild
  dealImage:    '.threadListCard-image img, .imgFrame-img',
};
```

---

## 8. Changelog / Bekannte Fallstricke

| Datum | Problem | Lösung |
|---|---|---|
| 2026-07 | `/deals/neue-deals` gibt 404 | Korrekte URL: `/deals` |
| 2026-07 | Persisted Query Hash ändert sich bei Deploy | Immer dynamic POST verwenden |
| laufend | CSS-Klassenamen ändern sich | `data-t` Attribute statt Klassen bevorzugen |
| laufend | `__INITIAL_STATE__` Pfad variiert je nach Seite | Alle bekannten Pfade proben |
| laufend | Introspection deaktiviert | Query-Namen manuell testen |
