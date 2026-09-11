/**
 * permalink-tools.js
 * Permalink-Übersetzer: alte Kommentar-URLs (…/comments/permalink/<id>)
 * über GraphQL auf die neue Deal-URL auflösen.
 *
 * Quelle: mydealz-Diskussion „Neue Link-Struktur von Mydealz" (Thread 2462696)
 * — das Problem (tote externe Link-Sammlungen) und die verifizierte Query
 * `comment(id: $id) { url }` (live 2026-09-11, siehe graphql-client.js
 * fetchCommentUrl()).
 *
 * Ablauf: Popup sendet { type: 'MDM_TRANSLATE_PERMALINKS', ids: [...] } →
 * background.js relayt an alle mydealz-Tabs → das ERSTE antwortende Tab
 * löst auf (Höflichkeitspausen 400ms, Deckel 50 IDs) und antwortet.
 *
 * Depends on: GraphQLClient
 * Exports:    PermalinkTools
 */

const PermalinkTools = (() => {

  const MAX_IDS = 50;
  const PAUSE_MS = 400;

  function init() {
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
      if (msg?.type !== 'MDM_TRANSLATE_PERMALINKS' || !Array.isArray(msg.ids)) return false;

      (async function() {
        const results = [];
        const ids = msg.ids.slice(0, MAX_IDS);
        for (const id of ids) {
          try {
            const r = await GraphQLClient.fetchCommentUrl(id);
            results.push(r ? { id: String(id), url: r.url } : { id: String(id), error: 'kein Treffer' });
          } catch (e) {
            results.push({ id: String(id), error: String(e?.message ?? e).slice(0, 120) });
          }
          if (results.length < ids.length) {
            await new Promise(res => setTimeout(res, PAUSE_MS)); // Höflichkeitspause
          }
        }
        sendResponse({ results });
      })();

      return true; // asynchrone sendResponse
    });
  }

  return { init };

})();

if (typeof module !== 'undefined') module.exports = { PermalinkTools };
