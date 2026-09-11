# 🧰 Werkzeug- & Netzwerk-Sammlung

> Quelle: `/home/moritz/repos/mydealz-Manager` → `Werkzeuge/readme.md` (Flo, 9jS2PL5T).
> Übernommen am 2026-09-11: tote Links entfernt, Pepper-Domains live verifiziert
> (Artikel-Markup `article[data-t="thread"]` + `.cept-vote-temp` = identische Engine).
> Diese Datei ist Quelle/Info/Reminder — die Netzwerk-Domains sind zugleich in
> `manifest.json` (host_permissions + content_scripts) und `background.js`
> (MDM_HOSTNAMES) verdrahtet.

---

## 🛠️ Markdown-Werkzeuge
🔗 [markdown-it.github.io](https://markdown-it.github.io/)
🔗 [dillinger.io](https://dillinger.io/)
📚 [GitHub-Dokumentation](https://docs.github.com/de/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax)

## ⚙️ Web Tech (analysieren wie die Webseite funktioniert)
🔍 [MyDealz auf Built With](https://builtwith.com/?https%3a%2f%2fwww.mydealz.de%2f)

## 📘 README der anderen myDealz-Projekte (Flo)
🔗 [andere myDealz Projekte](https://github.com/9jS2PL5T/mydealz-Manager/tree/main/andere%20myDealz%20Projekte)

## 🧩 Regular Expressions
🧠 [Regulex](https://jex.im/regulex/#!flags=&re=%5E(a%7Cb)*%3F%24)
🤖 [regex.ai](https://regex.ai/)
💾 [Regex AI (Github)](https://huqedato.github.io/RegexAI/)

## 🖥️ JavaScript in der Entwicklerkonsole
🧭 [Chrome Developer-Tools Übersicht](https://kulturbanause.de/blog/die-chrome-entwicklertools-devtools-fuer-designer-und-einsteiger/#h-uberblick-und-aufbau-der-chrome-developer-tools)
📋 [Console – Übersicht](https://developer.chrome.com/docs/devtools/console)

## 🌐 Pepper-Netzwerk (Atolls-Gruppe, ehem. Global Savings Group) — Erweiterung aktiv

Alle Domains live verifiziert am **2026-09-11**: identische Engine
(`article[data-t="thread"]`, `.cept-vote-temp`) **und** unsere GraphQL-Schnittstelle
feuert dort live (Thread-Batch + Kommentare = 200, echte Daten).

| Land | Domain | Status |
|---|---|---|
| 🇩🇪 Deutschland | [mydealz.de](https://www.mydealz.de) | ✅ aktiv (Referenz) |
| 🇦🇹 Österreich | [preisjaeger.at](https://www.preisjaeger.at) | ✅ aktiv |
| 🇬🇧 UK | [hotukdeals.com](https://www.hotukdeals.com) | ✅ aktiv — GQL ✓ (Thread 4979202: 200) |
| 🇫🇷 Frankreich | [dealabs.com](https://www.dealabs.com) | ✅ aktiv — GQL ✓ (Thread 3410724: 200) |
| 🇵🇱 Polen | [pepper.pl](https://www.pepper.pl) | ✅ aktiv — GQL ✓ (Thread 1349127: 200, 63 Kommentare) |
| 🇳🇱 Niederlande | [nl.pepper.com](https://nl.pepper.com) | ✅ aktiv — GQL ✓ (Thread 418482: 200) |
| 🇪🇸 Spanien | [chollometro.com](https://www.chollometro.com) | ✅ aktiv — GQL ✓ (Thread 2002211: 200) |
| 🇸🇪 Schweden | [pepperdeals.se](https://www.pepperdeals.se) | ✅ aktiv — GQL ✓ (Thread 18459: 200) |

**Wichtig (TLD-Pfade):** die Listing-/Detail-PFADE sind pro Land lokalisiert —
deshalb arbeitet der Collector mit dem Artikel-Detektor (`article[id^="thread_"] > 0`)
und der Exporter mit `threadDetail` im State statt mit Pfad-Regexen:
`/deals,/hot,/new` (DE/UK/SE) · `/bons-plans` (FR) · `/nowe` (PL) · `/nieuw` (NL) ·
`/`-Mix (ES, FR, PL, NL). `/deals` ist auf FR/PL/NL die LEERE Seite!

### ⚰️ Tote bzw. inkompatible Seiten (Stand 2026-09-11 — Erinnerung, nicht löschen-vergessen)

| Land | Domain | Befund (live geprüft) |
|---|---|---|
| 🇮🇹 Italien | pepper.it | 🚫 geschlossen („ha chiuso i battenti", 14.08.2025) |
| 🇷🇺 Russland | pepper.ru | 🚫 lebt, aber ohne Pepper-Engine (keine Artikel-Threads) |
| 🇰🇷 Südkorea | pepper.co.kr | 🚫 redirectet auf nl.pepper.com |
| 🇦🇷 Argentinien | buenosdeals.com | 🚫 redirectet auf nl.pepper.com |
| 🇪🇸 Spanien | pepper.com/es | 🚫 redirectet auf nl.pepper.com |
| 🇸🇬 Singapur | pelando.sg | 🚫 offline (Ladefehler) |
| 🇲🇽 Mexiko | promosdescuentos.com | 🚫 offline (Ladefehler) |
| 🇧🇷 Brasilien | pelando.com.br | ⚠️ lebt, aber eigene Plattform-Engine (kein Pepper) |
| 🇮🇳 Indien | desidime.com | ⚠️ lebt, aber eigene Plattform-Engine (kein Pepper) |

## 🏢 Weitere Atolls-Marken (Gruppe, aber KEINE Community-Engine)

Zugehörig zur Atolls-Gruppe, aber ohne `data-t`/`cept-`/GraphQL-Deal-Engine —
Filter/Exporter greifen dort nicht. Reminder für zukünftige Engines:

| Marke | Typ | Live-Befund 2026-09-11 |
|---|---|---|
| [iGraal](https://www.igraal.com) (FR/DE/ES/IT) | Cashback | kein Pepper-Markup |
| [Shoop](https://www.shoop.de) (DE) | Cashback | kein Pepper-Markup |
| [CupoNation](https://www.cuponation.de) (20+ Länder) | Gutscheine | — |
| [Coupons.com](https://www.coupons.com) (US) | Gutscheine/Cashback | — |
| [kortingscode.nl](https://www.kortingscode.nl) (NL) | Gutscheine | kein Pepper-Markup |

## 📝 Entfernte tote Links (Original-README)
- ~~afaik.de „Regex: Einführung in reguläre Ausdrücke"~~ → 404
- ~~alle Domain-Links der toten/inaktiven Pepper-Seiten oben~~
