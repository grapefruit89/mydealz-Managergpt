/**
 * background.js – MV3 Service Worker
 *
 * Responsibilities:
 *   - MDM_REPROCESS: empfängt vom Popup, sendet an ALLE offenen mydealz/preisjaeger Tabs
 *   - (Future) alarm-based tasks
 */

const MDM_HOSTNAMES = ['www.mydealz.de', 'www.preisjaeger.at'];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'MDM_REPROCESS') return false;

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
});
