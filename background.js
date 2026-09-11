/**
 * background.js – MV3 Service Worker
 *
 * Responsibilities:
 *   - MDM_REPROCESS: empfängt vom Popup, sendet an ALLE offenen Tabs der
 *     Pepper-Netzwerk-Domains (live verifiziert 2026-09-11, siehe docs/werkzeuge.md)
 *   - (Future) alarm-based tasks
 */

const MDM_HOSTNAMES = [
  'www.mydealz.de',
  'www.preisjaeger.at',
  'www.hotukdeals.com',
  'www.dealabs.com',
  'www.pepper.pl',
  'nl.pepper.com',
  'www.chollometro.com',
  'www.pepperdeals.se',
];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'MDM_REPROCESS') {
    // Alle Tabs auf mydealz/preisjaeger finden und Reprocess triggern
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        try {
          const hostname = tab.url ? new URL(tab.url).hostname : '';
          if (MDM_HOSTNAMES.includes(hostname)) {
            chrome.tabs.sendMessage(tab.id, { type: 'MDM_REPROCESS' }).catch(() => {});
          }
        } catch {
          // ungültige URL überspringen
        }
      }
    });
    return false;
  }

  // Permalink-Übersetzer: Popup → erster antwortender mydealz-Tab löst via
  // GraphQLClient.fetchCommentUrl() auf (Quelle: mydealz-Diskussion 2462696).
  if (msg.type === 'MDM_TRANSLATE_PERMALINKS') {
    chrome.tabs.query({}, (tabs) => {
      const targets = tabs.filter(tab => {
        try { return MDM_HOSTNAMES.includes(new URL(tab.url || '').hostname); }
        catch { return false; }
      });
      if (!targets.length) { sendResponse({}); return; }
      let answered = false;
      for (const tab of targets) {
        chrome.tabs.sendMessage(tab.id, msg)
          .then(res => {
            if (!answered && res?.results?.length) {
              answered = true;
              sendResponse(res);
            }
          })
          .catch(() => { /* Tab ohne Content-Script — nächster Kandidat */ });
      }
    });
    return true; // asynchrone sendResponse
  }

  return false;
});
