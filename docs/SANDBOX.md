# Sandbox

Hier liegt experimenteller Code, der **nicht** ins Build übernommen wird.

Dateien in diesem Ordner erscheinen absichtlich **nicht** in `MODULE_ORDER` von `build.js`.
Erst wenn ein Feature production-ready ist, wird es nach `features/<name>/` verschoben
und in `MODULE_ORDER` eingetragen.

Typische Kandidaten:
- Prototypen für neue Features
- A/B-Varianten von bestehenden Modulen
- Ideen die noch nicht spruchreif sind
