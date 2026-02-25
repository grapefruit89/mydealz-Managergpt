<!--
@file README.md
@description Projektübersicht und Entwicklerdokumentation für mydealz Manager.
@quick-nav Installation, Features, Build-Prozess, Repository-Struktur.
-->

# mydealz Manager

Ein Userscript zur Verwaltung und Filterung von Deals auf mydealz.de und preisjaeger.at.

## Installation

Installiere das Script über [Greasyfork](https://greasyfork.org/de/scripts/522038-der-mydealz-manager-deine-pers%C3%B6nliche-deal-zentrale).

Voraussetzung: [Tampermonkey](https://www.tampermonkey.net/) oder eine ähnliche Userscript-Erweiterung.

## Funktionen

### Filter
- **Wortfilter**: Blende Deals basierend auf Schlüsselwörtern aus. Unterstützt Wildcards (`*`) für flexible Teilabgleiche
- **Händlerfilter**: Blockiere Deals von bestimmten Händlern
- **Benutzerfilter**: Blende Deals von bestimmten Benutzern aus
- **Preisfilter**: Setze eine Obergrenze für Deal-Preise
- **Temperaturfilter**: Blende Deals unter 0° automatisch aus

### Verwaltung
- **Schnelles Ausblenden**: Klick auf das [X]-Symbol bei einem Deal zum sofortigen Ausblenden
- **Zentrale Einstellungen**: Verwaltung aller Filter über das Zahnrad-Icon
- **Backup & Restore**: Exportiere und importiere deine Filterlisten als JSON-Datei
- **Sortierungsspeicher**: Speichere deine bevorzugten Sortierungseinstellungen

### UI-Optimierungen
- **Share-Buttons ausblenden**: Minimiere die Benutzeroberfläche
- **Händlernamen-Entfernung**: Entferne automatisch Händlernamen aus Deal-Titeln

## Verwendung

1. Öffne mydealz.de oder preisjaeger.at
2. Klicke auf das Zahnrad-Icon bei einem beliebigen Deal, um das Einstellungsmenü zu öffnen
3. Konfiguriere deine Filter nach Bedarf
4. Verwende das [X]-Symbol, um einzelne Deals schnell auszublenden

## Kompatibilität

- mydealz.de
- preisjaeger.at
- Desktop und Mobile

## Lizenz

MIT

## Diskussion

[Diskussionsthread auf mydealz](https://www.mydealz.de/diskussion/tampermonkey-script-fur-mydealz-2299700)


## Repository-Cleanup

- Historische und deprecated Inhalte wurden aus dem Root in `archive/legacy/` verschoben.
- Aktive Entwicklung findet nur noch in `src/parts/` statt; erzeugt wird ausschließlich `dist/mydealz-manager.user.js`.
- Relevante Projektdateien enthalten jetzt kompakte Metadaten-Header (oder `_meta` in JSON), damit Zweck und Zuständigkeit sofort sichtbar sind.

## Entwicklungsstruktur (neu)

Für eine wartbare Weiterentwicklung ist das Userscript jetzt in Build-Teile aufgeteilt und wird anschließend wieder zu **einer einzigen Datei** zusammengesetzt.

```text
src/
  parts/
    00-metadata.js      # Tampermonkey Header (@name, @match, @grant, ...)
    10-main.js          # Vollständige App-Logik (IIFE, Klassen, Observer, UI, Filter)
dist/
  mydealz-manager.user.js  # Fertiges Userscript (für Installation/Test)
build.js                    # Node.js Build-Skript (concat + output)
```

### Build ausführen

1. Stelle sicher, dass Node.js installiert ist.
2. Im Repository ausführen:

```bash
npm run build
```

Alternativ direkt:

```bash
node build.js
```

Das erzeugt/aktualisiert:
- `dist/mydealz-manager.user.js`
