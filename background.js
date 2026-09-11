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

// ── Kontextmenüs (Permission "contextMenus") ─────────────────────────────────
// Quelle: Chrome-Extension-API-Review 2026-09-11 (docs/ROADMAP.md §2.13).
// Nur auf den Pepper-Domains sichtbar; auf externen Seiten (GitHub/Foren)
// bleibt das Popup der Weg — dort laufen die Content-Scripts nicht.
chrome.runtime.onInstalled.addListener(() => {
  // onInstalled feuert auch bei Extension-Updates — alte Menüs erst weg,
  // sonst create()-Duplicate-ID-Fehler (Claude-Review-Fund 6)
  chrome.contextMenus.removeAll(() => {
  // „Permalinks auflösen“ auf ALLEN Seiten (Quelle: What's-New-Review 2026-09-11
  // — action.openPopup(), Chrome 127): auf mydealz-Domains wird inline aufgelöst,
  // auf externen Seiten (GitHub/Foren — der eigentliche Use-Case!) übernimmt
  // das Popup via Selection-Handoff.
  chrome.contextMenus.create({
    id: 'mdm-translate-selection',
    title: 'mydealz Manager: Permalinks auflösen',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'mdm-block-merchant',
    title: 'mydealz Manager: Händler blocken',
    contexts: ['link'],
    documentUrlPatterns: MDM_HOSTNAMES.map(h => 'https://' + h + '/*'),
  });
  chrome.contextMenus.create({
    id: 'mdm-hide-deal',
    title: 'mydealz Manager: Deal verdecken',
    contexts: ['link'],
    documentUrlPatterns: MDM_HOSTNAMES.map(h => 'https://' + h + '/*'),
  });
  }); // removeAll-Callback
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'mdm-translate-selection') {
    const isMydealzTab = tab?.id && (() => {
      try { return MDM_HOSTNAMES.includes(new URL(tab.url || '').hostname); }
      catch { return false; }
    })();
    if (isMydealzTab) {
      chrome.tabs.sendMessage(tab.id, { type: 'MDM_TRANSLATE_SELECTION', text: info.selectionText ?? '' })
        .catch(() => {});
      return;
    }
    // Externe Seite: Auswahl ans Popup durchreichen + Popup öffnen
    // (openPopup braucht eine frische User-Gesture — der Menü-Klick ist eine)
    chrome.storage.session
      .set({ mdm_popup_handoff: { text: info.selectionText ?? '', at: Date.now() } })
      .then(() => chrome.action.openPopup())
      .catch(() => {});
    return;
  }
  if (!tab?.id) return;
  // Blocken/Verdecken: beide Items sitzen auf Links — der Content-Script-
  // Handler validiert die Link-URL selbst (merchant-id= → Händler,
  // -<id>-Pattern → Deal) und zeigt sonst einen Inline-Hinweis.
  if (info.menuItemId === 'mdm-block-merchant') {
    chrome.tabs.sendMessage(tab.id, { type: 'MDM_BLOCK_FROM_LINK', href: info.linkUrl ?? '' })
      .catch(() => {});
  }
  if (info.menuItemId === 'mdm-hide-deal') {
    chrome.tabs.sendMessage(tab.id, { type: 'MDM_HIDE_FROM_LINK', href: info.linkUrl ?? '' })
      .catch(() => {});
  }
});

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

  // Badge: Content-Script meldet nach jedem processDeals() die Anzahl der
  // verdeckten Deals seines Tabs (sender.tab ist nur aus Content-Scripts
  // belegt — daher ohne "tabs"-Permission möglich).
  if (msg.type === 'MDM_BADGE') {
    if (sender?.tab?.id) {
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.count > 0 ? String(msg.count) : '' });
      chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#e8173a' });
    }
    return false;
  }

  // ── SidePanel (Exporter-Dashboard als Sidebar) ──────────────────────────────
  // Quelle: Chrome-API-Review 2026-09-11 (docs/ROADMAP.md §2.13). Klick auf den
  // Export-Button im Content-Script = User-Gesture → sidePanel.open() muss
  // SOFORT passieren (Chrome verlangt eine frische Geste). Export-Daten
  // wandern später über chrome.storage.session ins Panel.
  if (msg.type === 'MDM_EXPORT_OPEN') {
    if (!sender?.tab?.id) { sendResponse({ opened: false }); return false; }
    const tabId = sender.tab.id;
    chrome.sidePanel.open({ tabId })
      .then(() => chrome.storage.session.set({ mdm_export_tab: { tabId, openedAt: Date.now() } }))
      .then(() => sendResponse({ opened: true }))
      .catch(() => sendResponse({ opened: false }));
    return true; // asynchrone sendResponse
  }

  if (msg.type === 'MDM_EXPORT_STATUS') {
    chrome.storage.session.set({ mdm_export_status: { text: msg.text, at: Date.now() } })
      .catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'MDM_EXPORT_DATA') {
    chrome.storage.session.set({ mdm_export_payload: msg.payload, mdm_export_status: { text: '', at: Date.now() } })
      .catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  // SidePanel-„🔄 Neu laden“: Relay an das Tab, das den Export gestartet hat
  if (msg.type === 'MDM_EXPORT_REDO') {
    chrome.storage.session.get('mdm_export_tab', (s) => {
      const tabId = s.mdm_export_tab?.tabId;
      if (tabId) chrome.tabs.sendMessage(tabId, { type: 'MDM_EXPORT_REDO' }).catch(() => {});
    });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
