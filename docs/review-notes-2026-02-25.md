<!--
@file docs/review-notes-2026-02-25.md
@description Technische Prüfung der zuletzt umgesetzten Repo-/Userscript-Änderungen inkl. Bewertung der gemeldeten Punkte.
-->

# Review Notes (2026-02-25)

## Kurzfazit
Die meisten gemeldeten Probleme beziehen sich auf eine ältere Codebasis und sind im aktuellen Stand (`src/parts/10-main.js`) nicht mehr vorhanden.

## Punkt-für-Punkt Bewertung

1. **`GM_addStyle` / Grants**
   - `GM_addStyle` ist im Header vorhanden und wird verwendet.
   - `GM_notification` wird im aktuellen Code nicht verwendet, daher kein zusätzlicher Grant nötig.

2. **XSS / `innerHTML`**
   - Im Settings-Modal wird zwar `innerHTML` genutzt, aber ohne direkte Interpolation von Nutzerdaten.
   - Nutzerdaten werden danach sicher über `.value` / `.checked` gesetzt.

3. **Observer / Performance**
   - Es gibt nur einen debounced `MutationObserver` in der App-Klasse.
   - Keine doppelten globalen Observer und keine der genannten `vue3Recheck*`-Strukturen.

4. **Filter-Regex / Wildcards**
   - Parser verwirft leere/pure-Wildcard-Tokens (`*`, `***`), um Match-All zu verhindern.

5. **Init/Restore Doppelpfade**
   - Doppeltes `init()`-Pattern und die genannten Legacy-Restore-Pfade sind in der aktuellen Architektur nicht vorhanden.

## Zusätzliche kleine Optimierung
- In `processDeals()` wird die Settings-Signatur (`JSON.stringify`) jetzt nur einmal pro Lauf berechnet statt pro Deal-Eintrag.
