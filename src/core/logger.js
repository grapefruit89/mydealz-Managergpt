/**
 * logger.js
 * Zentrale Logging-Klasse fuer den mydealz Manager.
 *
 * Kultur:
 *   - [MDM] Prefix auf allen Ausgaben => leicht in DevTools filterbar
 *   - debug()  nur wenn mdm_debugEnabled === true (kein Produktions-Laerm)
 *   - info()   wichtige Lebenszyklus-Events (Start, Settings geladen, ...)
 *   - warn()   unerwartetes aber handhabbares Verhalten (API-Diskrepanz, Fallback aktiviert)
 *   - error()  echter Fehler, Deal wurde nicht verarbeitet oder Feature kaputt
 *
 * Verwendung:
 *   Logger.debug('DealParser', 'ID gefunden:', id);
 *   Logger.warn('Exporter', 'Kommentar-Diskrepanz: erwartet ' + expected + ', abgerufen ' + actual);
 *   Logger.error('GraphQL', 'Query fehlgeschlagen', err);
 *
 * Debug-Modus aktivieren:
 *   Einstellungen -> Debug-Logging -> Haken  (setzt mdm_debugEnabled = true)
 *   Oder direkt in DevTools Console: localStorage.setItem('mdm_debug_override', '1')
 *
 * Error-History:
 *   Logger.getHistory()    => Array aller error()-Eintraege seit Seitenstart
 *   Logger.clearHistory()  => History leeren (z.B. per "Logs loeschen"-Button im Modal)
 *   Wird im Settings-Modal als textarea angezeigt wenn debug === true && Fehler vorhanden.
 */

const Logger = (() => {

  const PREFIX = '[MDM]';

  // Fehler-Protokoll — haelt alle error()-Aufrufe im Arbeitsspeicher
  // (wird nicht persistiert; nach Seiten-Reload leer)
  const _history = [];

  // Debug-Override via DevTools ohne Settings-Modal oeffnen zu muessen
  function _isDebug() {
    try {
      if (localStorage.getItem('mdm_debug_override') === '1') return true;
    } catch { /* storage blocked */ }
    // Pruefe SettingsStore falls bereits initialisiert
    try {
      return SettingsStore?.settings?.mdm_debugEnabled === true;
    } catch {
      return false;
    }
  }

  /**
   * Debug -- nur bei aktivem Debug-Flag.
   * @param {string} module  Kurzname des Moduls (z.B. 'DealParser', 'Exporter')
   * @param {...*}   args    Beliebige Werte (werden an console.debug weitergereicht)
   */
  function debug(module, ...args) {
    if (!_isDebug()) return;
    console.debug(PREFIX, '[' + module + ']', ...args);
  }

  /**
   * Info -- Lebenszyklus-Events, immer sichtbar.
   */
  function info(module, ...args) {
    console.info(PREFIX, '[' + module + ']', ...args);
  }

  /**
   * Warn -- Unerwartetes Verhalten, kein Absturz aber bemerkenswert.
   * Beispiele: API-Diskrepanz, Selektor nicht gefunden, Fallback aktiviert.
   */
  function warn(module, ...args) {
    console.warn(PREFIX, '[' + module + ']', ...args);
  }

  /**
   * Error -- Echter Fehler, Feature beeintraechtigt.
   * Pusht automatisch in _history (sichtbar im Settings-Modal wenn debug aktiv).
   * @param {string} module
   * @param {string} message  Beschreibender Text
   * @param {Error}  [err]    Optionales Error-Objekt (Stack wird ausgegeben)
   */
  function error(module, message, err) {
    // History-Eintrag anlegen (max. 50 Eintraege, aelteste zuerst entfernen)
    const entry = {
      time:    new Date(),
      module:  String(module),
      message: String(message),
      stack:   (err instanceof Error) ? (err.stack ?? err.message) : (err !== undefined ? String(err) : null),
    };
    _history.push(entry);
    if (_history.length > 50) _history.shift();

    // Konsole
    if (err instanceof Error) {
      console.error(PREFIX, '[' + module + ']', message, '\n', err.stack ?? err.message);
    } else {
      console.error(PREFIX, '[' + module + ']', message, ...(err !== undefined ? [err] : []));
    }
  }

  /**
   * group() -- Zusammengehoerige Log-Ausgaben in einer Gruppe (collapsed).
   * Nur bei aktivem Debug-Flag.
   */
  function group(module, label, fn) {
    if (!_isDebug()) { fn?.(); return; }
    console.groupCollapsed(PREFIX, '[' + module + ']', label);
    try { fn?.(); } finally { console.groupEnd(); }
  }

  /** Gibt alle gespeicherten error()-Eintraege zurueck (aeltester zuerst). */
  function getHistory() {
    return _history.slice(); // Kopie, keine Referenz
  }

  /** Leert die Error-History (z.B. nach "Logs loeschen"-Klick im Modal). */
  function clearHistory() {
    _history.length = 0;
  }

  return { debug, info, warn, error, group, getHistory, clearHistory };

})();

if (typeof module !== 'undefined') module.exports = { Logger };
