/**
 * prompt-levels.js
 * SSOT für die Prompt-Stufen des AI-Exporters (Muster: settings-schema.js).
 *
 * Warum: exporter.js und sidepanel/sidepanel.js hatten die Level-Namen/Labels
 * per Hand kopiert — Drift-Fund (Claude-Review 2026-09-11, Fund 2): Exporter
 * liefert `DETAILED`, das Panel kannte nur `LONG` → Tab zeigte den rohen Key.
 * Keys + Labels leben jetzt HIER; die gen()-Funktionen bleiben im Exporter
 * (Textbau braucht meta/comments — kein UI-Code).
 *
 * Wird gebaut in: content-Bundle (IIFE) und dist/settings-schema.js
 * (Popup/SidePanel-Shared, siehe buildPopupShared in build.js).
 */

const MdmPromptLevels = (() => {

  const LEVELS = ['RAW', 'SHORT', 'MEDIUM', 'DETAILED'];

  const LABELS = {
    RAW:      '🧱 Rohdaten',
    SHORT:    '⚡ Kurz',
    MEDIUM:   '📝 Mittel',
    DETAILED: '📚 Lang',
  };

  return { LEVELS, LABELS };

})();

if (typeof module !== 'undefined') module.exports = { MdmPromptLevels };
