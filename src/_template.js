/**
 * [ModuleName].js
 * Kurzbeschreibung was dieses Modul tut (1 Satz).
 *
 * Aktiviert auf: [z.B. alle Seiten / nur Detail-Seiten / nur Listing-Seiten]
 *
 * Depends on: [Komma-separierte Liste, z.B. SettingsStore, DealParser]
 * Exports:    [Globaler Name, z.B. MyModule]
 */

// ── Konstanten ────────────────────────────────────────────────────────────────

// const MY_CONST = 'value';

// ── Haupt-Export ─────────────────────────────────────────────────────────────

const MyModule = (() => {

  // Private Zustand
  // let _state = null;

  /**
   * Initialisiert das Modul. Wird von content.js aufgerufen.
   */
  function init() {
    // Guard: nur auf relevanten Seiten aktivieren
    // if (!location.pathname.startsWith('/deals/')) return;

    // Setup ...
  }

  // ── Private Hilfsfunktionen ───────────────────────────────────────────────

  // function _helper() { ... }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    init,
    // weitere öffentliche Methoden ...
  };
})();

// Guard für Node-Tests / Userscript-Build — wird von build.js stripModuleExports() entfernt
if (typeof module !== 'undefined') module.exports = { MyModule };
