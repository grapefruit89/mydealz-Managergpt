# Architektur-Plan: Error Handling & Sandbox Isolation

Um experimentelle Sandbox-Features gefahrlos testen zu können, ohne dass ein einziger Tippfehler die gesamte Extension lahmlegt, brauchen wir ein robustes **Error Boundary System** (Fehlerabfang-Schicht) und eine echte **Error Log Engine**.

## User Review Required
> [!IMPORTANT]
> Hier sind die Architektur-Entscheidungen für das Error Handling. Bitte prüfen, ob diese Struktur deinen Vorstellungen von einem "Safe Space" für neue Features entspricht!

## 1. Die "SafeLoad" Error Boundary (Der Airbag)
Aktuell werden Features in `content.js` einfach aufgerufen (z.B. `Exporter.init()`). Wenn dort ein Fehler passiert, stirbt der gesamte JavaScript-Thread und der Deal-Filter funktioniert nicht mehr.

**Lösung:** Wir führen einen `FeatureLoader` ein.
Anstatt Features direkt zu starten, kapseln wir sie in einen universellen `try...catch` Block.

*Beispielhafte Umsetzung in `content.js` oder einer neuen `core/feature-loader.js`:*
```javascript
function safeInit(featureName, initFn) {
  try {
    initFn();
    Logger.info(featureName, 'Erfolgreich geladen');
  } catch (error) {
    Logger.error(featureName, 'Kritischer Absturz beim Laden', error);
    // Der Fehler ist gefangen! Der restliche Code (Filter, UI) läuft normal weiter.
  }
}

// Aufruf:
if (typeof Exporter !== 'undefined') safeInit('AI Export', Exporter.init);
```

## 2. Error Log Engine (Das Flugschreiber-System)
Aktuell schreibt `logger.js` Fehler nur in die unsichtbare Entwickler-Konsole (`console.error`).
Wir erweitern `logger.js` zu einer echten Engine, die Fehler im Gedächtnis behält.

**Anpassungen in `core/logger.js`:**
1. Füge ein internes Array hinzu: `const _errorLog = [];`
2. Die Funktion `Logger.error()` pusht jeden Fehler in dieses Array:
   `_errorLog.push({ time: new Date(), module, message, stack: err?.stack });`
3. Exportiere zwei neue Funktionen: `Logger.getErrors()` und `Logger.clearErrors()`.

*(Optional für später: Wir könnten Fehler sogar über den `SettingsStore` in den `chrome.storage` speichern, damit sie einen Tab-Reload überleben).*

## 3. Error UI im Settings-Modal (Das Dashboard)
Wir müssen Fehler für dich (oder den User) sichtbar machen, ohne dass man die DevTools öffnen muss.

**Anpassungen in `core/settings-modal.js`:**
1. Wir fügen im Modal ganz unten einen neuen Bereich "⚠️ Error Logs" hinzu.
2. Dieser Bereich wird **nur eingeblendet**, wenn `Logger.getErrors().length > 0` ist.
3. Dort gibt es eine Textarea, die den Stacktrace (Fehlertext) anzeigt, und einen Button "Logs löschen".

## 4. Sandbox-Regeln (Der Spielplatz)
Ein neues Feature im Ordner `src/sandbox/my-test-feature.js` muss sich ab sofort an nur zwei Regeln halten:
1. Es kapselt seine eigene Logik sauber.
2. Es wird in `content.js` **ausschließlich** über `safeInit('Sandbox: MyFeature', MyFeature.init)` aufgerufen.

Dadurch können experimentelle KI-Features, die noch Bugs enthalten, einfach abstürzen (sie tauchen dann im Settings-Modal als Fehler auf), aber das Ausblenden von Deals und andere Features funktionieren zu 100% weiter.

---

### Nächste Schritte
Soll ich dir (als Architekt) die genauen **Blueprints (Code-Schnipsel)** für diese 3 Dateien (`logger.js`, `content.js`, `settings-modal.js`) schreiben, damit dein Bauarbeiter sie wieder blind implementieren kann?
