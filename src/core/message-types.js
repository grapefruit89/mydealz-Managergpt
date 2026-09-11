/**
 * message-types.js
 * Registry aller chrome.runtime-Nachrichten (Muster: settings-schema.js).
 *
 * Warum: Claude-Review-Fund 3 (2026-09-11) — 2 von 8 Message-Typen hatten
 * keinen Empfänger („Feature fault silently"). Diese Datei ist die
 * Sender/Empfänger-Karte: welche Datei sendet welchen Typ, welche horcht.
 * tests/message-audit.test.js prüft: Jede `type: '…'`-Literal im Repo ist
 * registriert, und jeder registrierte Typ hat ≥1 Handler-Datei.
 *
 * Call-Sites verwenden (noch) String-Literale — das Audit-Test schlägt an,
 * wenn eine Literal umbenannt wird, ohne die Registry zu pflegen (Rename-
 * Safety ohne typed Router, siehe ROADMAP §4 P1.1).
 */

const MessageTypes = (() => {

  /**
   * type → { senders: [Dateien], handlers: [Dateien], note }
   * Datei-Angaben = Audit-Anker (der Test sucht diese Strings in den Dateien).
   */
  const TYPES = {
    // Popup → background → alle Pepper-Tabs (Settings geändert)
    MDM_REPROCESS: {
      senders: ['popup/popup.js'],
      handlers: ['background.js'],
    },
    // Popup → background (Relay) → erster antwortender mydealz-Tab
    MDM_TRANSLATE_PERMALINKS: {
      senders: ['popup/popup.js'],
      handlers: ['src/features/permalink-tools.js'],
      note: 'background reicht msg unverändert weiter (kein Literal im Relay)',
    },
    // background (Rechtsklick auf mydealz-Seite) → Content: Auswahl inline auflösen
    MDM_TRANSLATE_SELECTION: {
      senders: ['background.js'],
      handlers: ['src/features/permalink-tools.js'],
    },
    // background (Rechtsklick „Händler blocken") → Content: Link validieren + blocken
    MDM_BLOCK_FROM_LINK: {
      senders: ['background.js'],
      handlers: ['src/content.js'],
    },
    // background (Rechtsklick „Deal verdecken") → Content: Link validieren + hide
    MDM_HIDE_FROM_LINK: {
      senders: ['background.js'],
      handlers: ['src/content.js'],
    },
    // Content (processDeals fertig) → background: Badge-Count am Icon
    MDM_BADGE: {
      senders: ['src/content.js'],
      handlers: ['background.js'],
    },
    // Content (Export-Button-Klick, User-Gesture) → background: SidePanel öffnen
    MDM_EXPORT_OPEN: {
      senders: ['src/features/exporter.js'],
      handlers: ['background.js'],
    },
    // Content → background → storage.session: Fortschrittstext fürs Panel
    MDM_EXPORT_STATUS: {
      senders: ['src/features/exporter.js'],
      handlers: ['background.js'],
    },
    // Content → background → storage.session: fertige Export-Payload
    MDM_EXPORT_DATA: {
      senders: ['src/features/exporter.js'],
      handlers: ['background.js'],
    },
    // SidePanel („🔄") → background → Content-Tab: Export erneut ausführen
    MDM_EXPORT_REDO: {
      senders: ['sidepanel/sidepanel.js'],
      handlers: ['background.js', 'src/features/exporter.js'],
    },
  };

  return { TYPES };

})();

if (typeof module !== 'undefined') module.exports = { MessageTypes };
