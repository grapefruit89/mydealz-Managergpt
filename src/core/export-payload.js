/**
 * export-payload.js
 * SSOT für den ExportPayload-Contract (Muster: settings-schema.js).
 *
 * Quelle: Claude-Review-Fund 3 (2026-09-11): „bespoke payloads re-derive
 * shapes per consumer" — Konsumierende sind (a) SidePanel-Dashboard,
 * (b) Markdown-/Prompt-Export, (c) LLM-Chat (ROADMAP §2.14). Der Contract
 * wird VOR dem Chat festgenagelt, damit der Chat keinen dritten Eigenbau
 * der Datenstruktur braucht.
 *
 * ExportPayload-Canon (v1):
 *   schema      'mdm-export@1'          (Versionsmarker für Migrationen)
 *   threadId    string
 *   meta        { Titel, OP, KommentarAnzahl, DealInfo{Status,Preis,Händler,
 *               Temperatur,Alter}, OPText, Statistik{Total,Erwartet,Diskrepanz} }
 *   comments    CommentData[]           (Reply-Baum, siehe comment-normalizer.js)
 *   stats       { total }               (rekursive Kommentarzahl)
 *   generatedAt number  (Date.now())
 *
 * Persistenz: Cache (IndexedDB) speichert { timestamp, meta, comments } —
 * das bleibt Layout-stabil; create() fügt schema/threadId/generatedAt hinzu.
 */

const ExportPayload = (() => {

  const SCHEMA = 'mdm-export@1';

  /**
   * @param {string} threadId
   * @param {Object} meta      – Exporter-Meta (DealInfo/Statistik verifiziert)
   * @param {Object[]} comments – CommentData-Baum
   * @returns {Object} ExportPayload
   */
  function create(threadId, meta, comments) {
    return {
      schema: SCHEMA,
      threadId: String(threadId ?? ''),
      meta,
      comments,
      stats: { total: CommentNormalizer.countTree(comments) },
      generatedAt: Date.now(),
    };
  }

  /** Struktur-Validierung (Popup/SidePanel/Chat prüfen gegen diesen Schwell). */
  function isValid(p) {
    return !!p
      && typeof p === 'object'
      && p.schema === SCHEMA
      && Array.isArray(p.comments)
      && !!p.meta;
  }

  return { SCHEMA, create, isValid };

})();

if (typeof module !== 'undefined') module.exports = { ExportPayload };
