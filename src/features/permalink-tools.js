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

  /** Kleines Inline-Toast im Seitenkontext (kein Notifications-Permission). */
  function toast(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;background:#1e1e1e;color:#e8e8e8;'
      + 'padding:10px 14px;border-radius:8px;font:13px/1.4 -apple-system,system-ui,sans-serif;'
      + 'box-shadow:0 4px 24px rgba(0,0,0,0.35);max-width:70vw;';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  /**
   * Kommentar-/Permalink-IDs aus Freitext extrahieren (Rechtsklick-Auswahl
   * und Popup nutzen denselben Parser): /comments/permalink/<id>,
   * #comment-<id>, #reply-<id> oder nacktes c<id>.
   */
  function extractIds(text) {
    const ids = new Set();
    for (const m of (text ?? '').matchAll(
      /comments\/permalink\/(\d+)|#(?:comment|reply)-(\d{6,})|[\s"'=(]c(\d{6,})[\s)"',.;]/g
    )) {
      const id = m[1] ?? m[2] ?? m[3];
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }

  async function resolveIds(ids) {
    const results = [];
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
    return results;
  }

  function init() {
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
      if (msg?.type !== 'MDM_TRANSLATE_PERMALINKS' && msg?.type !== 'MDM_TRANSLATE_SELECTION') return false;

      (async function() {
        const ids = msg.type === 'MDM_TRANSLATE_SELECTION'
          ? extractIds(msg.text).slice(0, MAX_IDS)
          : (msg.ids ?? []).slice(0, MAX_IDS);
        if (msg.type === 'MDM_TRANSLATE_SELECTION') {
          if (!ids.length) { toast('mydealz Manager: keine Kommentar-IDs in der Markierung gefunden'); return; }
          const results = await resolveIds(ids);
          const lines = results.map(r =>
            r.url ? `https://www.mydealz.de/comments/permalink/${r.id} → ${r.url}`
                  : `https://www.mydealz.de/comments/permalink/${r.id} → FEHLER (${r.error})`);
          try {
            await navigator.clipboard.writeText(lines.join('\n'));
            toast(`mydealz Manager: ${results.filter(r => r.url).length}/${results.length} Permalinks aufgelöst & kopiert`);
          } catch {
            toast('mydealz Manager: Auflösen fehlgeschlagen (Clipboard verweigert)');
          }
          return;
        }
        // Popup-Relay: Ergebnisse an background/popup zurückgeben
        sendResponse({ results: await resolveIds(ids) });
      })();

      return true; // asynchrone sendResponse
    });
  }

  return { init, toast, extractIds };

})();

if (typeof module !== 'undefined') module.exports = { PermalinkTools };
