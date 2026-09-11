# ROADMAP — mydealz Manager

> Stand: 2026-09-11. Diese Datei ist die SSOT für: **Was ist drin, was geplant, woher kommt die Idee.**
> Jede Idee braucht eine Quelle (Original-Script, User-Feedback, Live-Erkenntnis, Architektur-Entwurf).
> Status: ✅ erledigt · 🔨 in Arbeit · 📋 Idee · ⛔ bewusst nicht geplant

---

## 1. Implementiert (mit Verifikationsquelle)

| Feature | Quelle der Idee | Verifiziert |
|---|---|---|
| Wortfilter mit Ausdruckssyntax (AND / NOT / Wildcard-Glob / Phrase, Umlaute, Word-Boundaries) | Original-Userscript „Wortfilter" (1.x–1.12.9.2) | `tests/filter-engine.test.js` |
| Whitelist-Override, User-Block, Händler-Block (ID + Name/Titel) | Original-Userscript | Tests + live 2026-09-11 |
| Max-Preis (Cent-exakt), Min-Rabatt %, Cold-Hide, eigene Cold-Votes | Original-Userscript + Flo-Basisscript | Tests (Cent-Arithmetik) |
| Preis-Tier-System A/B/C (Slider, Ghost B) | Original „Teure Deals kleiner anzeigen - Beta" + Ghost-Modus (LEARNINGS §4) | Tests |
| Manuell ausblenden (✕), Debug-Badges mit Grund | Original + eigener Ansatz | UI |
| Settings-SSOT (`settings-schema.js`), Popup + Modal aus einer Quelle, Reset schont Nutzerdaten | Sonnet-Architektur-Review (`docs/ARCHITECTURE_BRIEF.md`) | `tests/settings-store.test.js` |
| Settings-Export **+ Import** (JSON, Schema-Validierung) | Original (Backup/Restore) | popup.js |
| AI-Exporter: Kommentare mit `repliesPreview`-Gratis-Baum + 30er-Alias-Batch, Permalinks `#comment-/​#reply-`, Reaction-Score, OP-Badge, IndexedDB-Cache 1h, 4 Prompt-Vorlagen | MydealzExporter (verifizierte Queries) + `data_insights.md` | `tests/exporter.test.js` (Request-Zähler: 2 statt 3 GQL-Calls) |
| Collector: IDs → GQL-Alias-Batch → MD, 2 AJAX-Extrapages, Ban-Schutz (Pausen/Deckel) | MydealzExporter + live-verifizierte Pipeline | `tests/collector.test.js` |
| GraphQL-Client: verifizierte Shapes, Retry-Politik (nur transiente), 200+HTML-Throttle-Erkennung, CSRF-Cookie-Unquote, `keywordNames`-Bombe entschärft | `MydealzExporter/data_insights.md` + Live-Audit 2026-09-11 | Live-Checks (GQL 200 auf 8 Domains) |
| Netzwerk-Abdeckung: 8 Pepper/Atolls-Domains (DE/AT/UK/FR/PL/NL/ES/SE), Detektor statt Pfad-Listen | Original Werkzeuge-Sammlung → `docs/werkzeuge.md` | Live 2026-09-11 |
| Fehlerisolation: `safeInit`-Boundary, Generationszähler, Idle-Chunking, Smart-MutationObserver | eigener Designansatz (`docs/error-handling-plan.md`) | `content.js` |
| NSFW-Hide, Händlernamen-aus-Titel, Filterwort-Vorschläge, Sortier-Gedächtnis, Permalink-Übersetzer | Sammlungs-Thread 2035404 + Original-Funktionsübersicht (Details §2.2/§2.10/§2.12) | Tests (Engine-NSFW) + Live-Selektor-Checks; E2E-Klick im Browser noch offen |

## 2. Ideen-Liste (mit Quelle, nach ROI sortiert)

### 🔴 2.1 Lokal eingeschränkte Deals farblich absetzen ⭐ NEU
- **Quelle:** mydealz-Feedback-Thread von DCMedien: `https://www.mydealz.de/feedback/stark-eingeschrankte-lokale-angebote-farblich-absetzen-2837807`
  (Idee: MediaMarkt×Lieferando-/US-CA-Store-/Stadt-Deals beim Scrollen farblich erkennen, statt zu lesen)
- **Kontext:** Community antwortete, mydealz/Atolls wird das **niemals** einbauen (nicht geschäftsfördernd, zu aufwändig, Design-Gründe) — typischer Fall „Extension macht das, wo die Plattform nicht kann". HELPFUL-Reaction auf diese Einschätzung.
- **Umsetzungs-Skizze:** Wir haben das Datenfeld bereits im verifizierten GQL-Inventar: `selectedLocations { isNational }` → `isNational === false` = lokal eingeschränkt. Rendering als 4. Zustand im Tier-/Deal-UI-System (z. B. dezenter Balken + 📍-Badge statt Farbe, da Farbkodierung laut Feedback-Kritik mehrdeutig pro Land). Anreicherung über den bestehenden GQL-Batch (kein Extra-Request).
- **Aufwand:** M — UI-Zustand im `deal-filter-ui.js`-System + 1 GQL-Feld-Roherfassung; Engine-Idee: „local"-Verdict in der Verdict-Aggregators-Idee (2.4) beigelegt.
- **Risiko:** `selectedLocations` kann `null` sein (beobachtet bei nicht-lokalen Deals) → fehlender Wert = kein Marker, null-sicher.

### 🟠 2.2 Permalink-Übersetzer — alte `/comments/permalink/<id>`-Links reparieren ⭐ ✅ ERLEDIGT
- **Quelle:** mydealz-Diskussion „Neue Link-Struktur von Mydealz" (FoodFighter, Thread `https://www.mydealz.de/diskussion/neue-link-struktur-von-mydealz-2462696#comments`): mydealz hat die Kommentar-Permalinks geändert (alt `/comments/permalink/<id>` → neu `<deal-url>#comment-<id>`); externe Link-Sammlungen (z. B. GitHub-Repo Futro S740) sind dadurch tot, und ohne Deal-Name kann man nicht suchen-und-ersetzen.
- **Datenbasis:** `comment(id: $id) { url }` — von uns **live verifiziert 2026-09-11** und als `GraphQLClient.fetchCommentUrl()` eingebaut. Kommentar-ID rein → komplette neue Deal-URL mit Anker raus.
- **Implementiert 2026-09-11:** Popup-Werkzeug (Textfeld → IDs extrahieren → `MDM_TRANSLATE_PERMALINKS` → background-Relay → erster antwortender mydealz-Tab löst mit `permalink-tools.js` auf, 400ms-Pausen, Deckel 50 IDs → alt→neu-Liste + Kopieren). E2E-Klick im echten Browser noch offen (Extension dort nicht geladen).

### 🟠 2.3 Pure-Core-Extraktion + VM-Test-Harness vertiefen (Sonnet-Schritt 5)
- **Quelle:** `docs/ARCHITECTURE_BRIEF.md` §6.2; liegt durch `tests/harness.js` faktisch vor. Rest: Verdict-Aggregator und Normalizer mitsamen.
- ROI: schützt 2.3/2.4/2.5.

### 🟠 2.4 Feature-Registry + Verdict-Aggregator (Sonnet-Schritt 2)
- **Quelle:** `docs/ARCHITECTURE_BRIEF.md` §3 (Verträge, Verdicts, Prezedenz, Circuit-Semantik).
- Filter wird „critical feature", Verhalten unverändert; MDM_safeInit wächst weiter.

### 🟠 2.5 DealData-Normalizer (Sonnet-Schritt 3): Feld-Merge über Quellen, alle Felder immer
- **Quelle:** `docs/ARCHITECTURE_BRIEF.md` §2.4. Auf 2.2 aufbauend.

### 🟡 2.6 Geizfaktor — Mindestersparnis in € (statt nur %)
- **Quelle:** Original-Script „Geizfaktor" (LEARNINGS §3). Datenfelder jetzt via GQL (`nextBestPrice`/`priceOff` live verifiziert).
- Neues Setting `mdm_minSavings` im Schema.

### 🟡 2.7 Verdeckte-Deals-Liste im Popup (mit Wiederherstellen)
- **Quelle:** Original-Script „Deals anhand Händler ID ausblenden" (LEARNINGS §5). `fetchThreadBatch()` (GQL, verifiziert) existiert bereits — Integration fehlt.
- Auf anderen Pepper-TLDs: via `shareableLink` (`/share-deal/<id>`, live verifiziert) TLD-neutral.

### 🟡 2.8 Passives GQL-Capture (Sonnet-Schritt 4, MAIN-World-Bridge)
- **Quelle:** `docs/ARCHITECTURE_BRIEF.md` §2.1 — Deploy-stabile Datenquelle für den Filter, letzter Architektur-Baustein.

### 🟡 2.10 Lücken-Abgleich: Community-Sammlung „Starten statt warten" (Thread 2035404)
- **Quelle:** `https://www.mydealz.de/diskussion/sammlung-mydealz-auch-ohne-app-nutzen-2035404` (GelöschterUser928835; alle Lösungen dort sind uBlock-CSS-Selektoren/Bookmarklets — wir können dieselben Features sauber mit Settings/GQL bauen). Abgleich 2026-09-11.
- **✅ Bereits gevotete Deals ausblenden** — Quelle: Kommentar 37373606 (`##.vote-box > .button-…`-Selektor). Unser Ansatz: Vote-Button-Zustand im Deal-Parser erkennen (`aria-pressed`/`button--active`-Klasse — Muster noch live zu verifizieren).
- **🟡 Deal-Updates/Slogan-Filter** — Quelle: Kommentar 42120131 („ENDET HEUTE", „Deal verlängert"…). Deckt sich mit dem Original-„Verkaufs-Slogans"-Filter (LEARNINGS §3); keyword-basiert, Deckel auf `slogans`-Key im Schema.
- **✅ NSFW-gegraute Deals ausblenden** — Quelle: Kommentar 46038487 (Selektor `span.text--color-white.height--all-full.width--all-12`). Implementiert 2026-09-11: Parser-Flag `isNsfw` + Engine-Regel 10 + Modal/Popup-Schalter. Live-nachweis noch offen (kein NSFW-Deal im Test-Viewport).
- **✅ Sortierpräferenz speichern** — Quelle: Original-Solo-Tool „Letzte Sortierung speichern" (Port auf SettingsStore). Implementiert 2026-09-11: `features/sort-memory.js` (opt-in `mdm_rememberSort`); live verifiziert: Listings nutzen `<select name="time_frame">` (popular/recent, JS-Navigation), Suche `form[action*="/search"]` + hidden `sortBy`-Input wie im Original.
- **🟠 Kommentar-Volltextsuche im Thread** — Quelle: Bookmarklet, Kommentar 47602663. Wir laden bereits ALLE Kommentare (Exporter, verifiziert) → Suchfeld über die geladenen Kommentare ist Aufwand S.
- **🟡 Kommentar-Wortfilter** (Kommentare mit Begriff im Lesemodus dimmen) — Quelle: 37583247. Aufwand M, niedrigere Prio (Filterprofil ≠ Lese-UX).
- **🔵 Kalendereinträge aus Vorab-Deals** — Quelle: Sammlung 05.09.2024. `startDate`/`endsAt` liegen im verifizierten GQL-Inventar → .ics-Link aus Deal-Daten ist billig.
- **⭐ Bonus bestätigt:** „Alte Kommentarverlinkungen korrigieren" (Quelle: 37929861, seit 2022 beschworen!) = unsere 2.2 mit echter API statt Bookmarklet; „kurzen Deal-Link teilen" (37403719) = `shareableLink` (2.7); „Deals oberhalb xx€ UND Ersparnis unter 10€" (45649505) = Geizfaktor 2.6; „letzte Kommentare eines Users im Volltext" = Exporter-Fähigkeit; „Erhaltene Reactions anzeigen" = Reaction-Score.

### 🔵 2.11 Kleinkram (Quelle: LEARNINGS/ADR-Reviews)
- Breadcrumb in Exporter-Metadaten (LEARNINGS §7)
- Ghost-Modus pro Filter (nicht nur Tier B) — Quelle: Original „Ghost"-Scripts
- History/Undo im Filter (Quelle: DIN-BriefNEO-Draft-Manager-Muster)

### 🔵 2.12 Lücken aus Flos Funktionsübersicht (Original-Repo) — Abgleich 2026-09-11
- **🟡 Filter einzeln an-/abschaltbar** — Original versprach „alle Filter einzeln an-/abschaltbar"; bei uns sind Wort-/Händler-/User-/Whitelist-Regeln derzeit nur global aktiv. Lösung: `mdm_disabledFilters`-Liste im Schema, Engine überspringt disabled Keys (M).
- **🟡 Banner/Widgets/Share-Buttons ausblenden** (Optik-Gruppe) — reines DOM-Cleanup, Quelle: Original-Script 1.x.
- **✅ Händlernamen aus Deal-Titel entfernen** — Quelle: Original „Händlernamen aus Titel entfernen" (Funktionsübersicht). Implementiert 2026-09-11: `UiController.stripMerchant()` mit Original-Titel-Cache (`el.dataset.mdmOrigTitle`) — Filter-Matching läuft bewusst gegen den UNANGETASTETEN Titel, Abschalten restauriert.
- **✅ Filterwort-Vorschläge aus Deal-Titeln** — Quelle: Original-Extras (Funktionsübersicht). Implementiert 2026-09-11: Chips im Settings-Modal (häufigste Tokens ≥3×, ≥4 Zeichen, Stopwörter raus, Klick → Ausblend-Liste).
- **🔵 Sortierpräferenz speichern** („Neueste zuerst") — Quelle: Solo Tools „Letzte Sortierung speichern" (`/tmp/opencode/mydealz-Manager/Solo Tools/`); Checkbox im Sortiermenü + Storage (S).

### 🔵 2.13 Chrome-Extension-APIs zur Aufwertung (Quelle: `https://developer.chrome.com/docs/extensions/reference/api`, gesichtet 2026-09-11)
- **🟡 `contextMenus`** (keine Extra-Permission): Rechtsklick auf markierte Permalinks → „Mit mydealz Manager auflösen" (2.2, dann ohne Popup-Umweg); Rechtsklick auf Deal-Karte → „Deal verdecken"/„Händler blocken".
- **🟡 `commands`** (keine Permission): Tastenkürzel — Alt+S Settings-Modal, Alt+C Collector, Alt+E Exporter.
- **🟡 `chrome.action.setBadgeText`** (keine Permission): Badge zeigt Anzahl verdeckter Deals des aktiven Tabs (Content meldet nach `processDeals()`, background setzt Badge).
- **🟡 `chrome.storage.sync`** (Permission „storage" ist schon da): Einstellungen geräteübergreifend synchronisieren. Quota beachten: 8 KB/Item, 100 KB gesamt — Settings-JSON passt; `hiddenDeals`-Map muss wegen Item-Limits getrimmt werden. Stufenidee: Sync opt-in Checkbox.
- **✅ `sidePanel`** (Permission `sidePanel`): Exporter-Dashboard als Sidebar statt Extra-Fenster. Implementiert 2026-09-11: Klick auf 🧠 AI Export öffnet das Panel sofort (User-Gesture-Anforderung von `sidePanel.open` erfüllt), Export-Daten über `chrome.storage.session` (MDM_EXPORT_STATUS/DATA), „🔄" via MDM_EXPORT_REDO-Relay. Fallback: altes Popup-Fenster (Userscript-Build). Dateien: `sidepanel/`.
- **📋 §2.14 Chat-Anbindung im SidePanel (Deal-Chat à la YouTube-KI-Apps)** — Quelle: User-Analyse 2026-09-11 (YouTube-KI-Extensions-Pipeline „Video→Text→LLM"), verallgemeinert auf mydealz:

  **Stufe 1 — „Vom Deal zum Text" (✅ bereits gebaut):**
  YouTube-Transkript ≙ unser Kommentar-Export: alle Kommentare inkl. Replies via GQL (verifizierte Queries), strukturiert mit commentId/Permalink/Autor/Reactions/Score, plus Deal-Meta. Bereits im SidePanel (`mdm_export_payload`) — kein Whisper-Äquivalent nötig, mydealz hat keinen „Audio-Track".
  - Belegkultur als Superkraft: Permalinks (`#comment-<id>`) = unsere „Zeitstempel" — jede Chat-Antwort kann auf konkrete Kommentare verlinken.

  **Stufe 2 — „Vom Text zur Antwort", drei Stufen:**
  - **A (Klein, zuerst):** Alle-in-den-Prompt wie das Export-UI heute — Kontextgröße im Panel anzeigen (Kommentarzahl → geschätzte Tokens), Chat-History mit wiederholtem Kontext. Trigger-Kette: Chrome On-Device `window.ai` → Gemini-Key (Popup) → Fehlermeldung; KEIN Backend (local-only, §3).
  - **B (Map-Reduce, verifizierte Basis):** Threads >250 relevante Kommentare → Batches à 40 einzeln zusammenfassen, Zusammenfassungen als Kontext (Muster aus MydealzExporter, dort implementiert). Für Chat: Zusammenfassung + Volltext der Top-N-Score-Kommentare als Kontext.
  - **C (RAG-Lite, später):** Frage-gesteuerte lokale Retrieval-Stufe OHNE Vektor-DB: Volltext-Match + Autor/Score/Reaction-Filter selektieren die Top-N-Chunks aus den bereits geladenen Kommentaren (IndexedDB-Cache vorhanden). Echte Embeddings nur opt-in mit Cloud-Key (Kosten + Datenschutz-Trade-off dokumentieren).
  - Grenzen analog YouTube-Apps: Halluzinations-Guard „nur aus dem Kontext antworten + Permalink zitieren", Kontext-Limit-Handling via A→B→C-Fallstrick.

  UI: Chat-Sektion ersetzt den Stub in `sidepanel/` (Messages-Liste, Streaming, Kontextgröße-Badge). Aufwand A: S–M, B: M, C: M–L.
- **🟠 `notifications`**: „Collector fertig (N Deals exportiert)" / Throttle-Warnung bei 429.
- **🟠 `omnibox`**: Keyword `md` → „md iphone 17" startet mydealz-Suche direkt (öffnet nur eine URL, keine Datenfreigabe).
- **🔵 `cookies`-Permission (optional):** GQL direkt aus background (CSRF via Cookie statt Content-Script-Relay) — macht den Permalink-Übersetzer unabhängig vom offenen Tab; Permission-Abwägung: neuentstehende Warnung vs. Komfort.
- **🔵 `browser.*`-Namespace (ab Chrome 148):** offizieller Cross-Browser-Standard (Firefox-freundlich). Wenn Web-Store-Release geplant, Migration `chrome.*` → `browser.*` evaluieren (Transition-Guide).
- **⛔ bewusst NICHT:** `alarms` (Roadmap ⛔ kein Auto-Retrigger/Crawler), `declarativeNetRequest` (Optik-Cleanup bleibt DOM), `downloads` (Blob-Download reicht).

- **✅ `action.openPopup()` (Chrome 127)** — Quelle: What's-New-Review 2026-09-11 (`https://developer.chrome.com/docs/extensions/whats-new`). Implementiert: „Permalinks auflösen" erscheint jetzt auf **allen** Seiten; auf mydealz inline, auf externen Seiten (GitHub/Foren — der eigentliche Use-Case) via `chrome.storage.session`-Handoff ins Popup (`mdm_popup_handoff`), das die Übersetzung automatisch ausführt.
- **🔵 `contextMenus` `"tab"`-Kontext (Chrome 150)** — Idee: Rechtsklick auf mehrere markierte Tabs → „Deals dieser Tabs sammeln" (Multi-Tab-Collector-Batch). Aufwand M, Status offen.
- **🔵 Structured-Clone-Messaging (Chrome 148, opt-in)** — könnte den `storage.session`-Hop des Exporters ersetzen (direkte Messaging-Übergabe); erst evaluieren, wenn Chat-Datenströme größer werden (§2.14).
- **🔵 API-Key-Hygiene** — Quelle: What's-New-Video „How to keep API keys safe". Für `mdm_geminiKey` (§2.14): `storage.session` statt `local` evaluieren (nicht auf Disk; Trade-off: Key überlebt Browser-Neustart nicht).
- **🔵 Web-Store-Phase (Blog-Updates 2026):** Publisher-Rollen jetzt kostenlos, Appeals direkt im Dashboard, Private-Publishing an externe Orgs — für den geplanten Web-Store-Release notiert.
- **kein Nutzwert:** `sidePanel.getLayout()` (RTL, irrelevant), `browser.publicSuffix` (153; unsere Domain-Liste ist statisch), `alarms`-Namenslimit (keine alarms), `userScripts`/DevTools-APIs (nicht im Einsatz), `StorageArea.getKeys()` (minimal).

## 3. Bewusst nicht geplant ⛔

- **Remote-Telemetrie** — local-only Prinzip (`ARCHITECTURE_BRIEF` §5.2)
- **Externe Bundler/Frameworks** — MV3-Constraint + ADR-001
- **Nicht-Pepper-Plattformen** (slickdeals/ozbargain…) — eigene Engines, siehe `docs/werkzeuge.md`
- **Auto-Retrigger auf fremde API-Raten** — Exporter bleibt Ein-Klick, kein Crawler (methodik §6 Deckel)
- **Editor-/Font-/Schrift-Kosmetik, PN-Export, Voting-Power-Manipulation, eigene-Deals-Updates** — Quelle: Sammlungs-Thread 2035404, aber außerhalb unseres Daten-/Filter-Scopes (Voting-Power ist serverseitig, Schrift-Kosmetik = CSS-Thema der uBlock-Lösungen dort)
