/**
 * content.js
 * Main entry point for the mydealz Manager browser extension.
 *
 * Lifecycle:
 *   1. SettingsStore.init()            - Settings aus chrome.storage laden (+ Migration)
 *   2. safeInit() fuer optionale Features - Exporter, Collector, Sandbox-Features
 *   3. UiController.init()             - CSS injizieren, Callbacks verdrahten
 *   4. processDeals()                  - Deals verarbeiten (requestIdleCallback, gechunkt)
 *   5. MutationObserver                - nur triggern wenn neue deal-Artikel im DOM
 *
 * Architektur-Prinzipien:
 *   - safeInit()   => optionale Features duerfen abstuerzen, Core laeuft weiter
 *   - _processGen  => Generationszaehler verhindert veraltete Idle-Callbacks nach reprocess()
 *   - Idle-Chunking => processDeals blockiert den Main Thread nicht
 *   - Smart Observer => kein reprocess() wenn nur Ads/Tooltips sich aendern
 *
 * Exposed globally as window.__mdm_app so modal reset can call reprocess().
 */

// -- safeInit - Error Boundary fuer optionale Features ---------------------------
//
// Core-Features (DealUI, SettingsStore) laufen NICHT durch safeInit.
// Optionale Features (Exporter, Collector, Sandbox) laufen durch safeInit:
// => ein Absturz beim Init wird geloggt, der Rest der Extension laeuft normal.

function safeInit(featureName, initFn) {
  try {
    initFn();
    return true;
  } catch (err) {
    const msg = '[MDM] ' + featureName + ' konnte nicht geladen werden';
    if (typeof Logger !== 'undefined') {
      Logger.error('safeInit', featureName, err);
    } else {
      console.error(msg, err);
    }
    return false;
  }
}

// -- App -----------------------------------------------------------------------

const MyDealzManagerApp = (() => {
  let _observer      = null;
  let _debounceTimer = null;
  // Generationszaehler: jeder processDeals()-Aufruf bekommt eine eindeutige ID.
  // Veraltete Idle-Callbacks (von einem frueheren Aufruf) erkennen das und brechen ab.
  let _processGen    = 0;

  const DEBOUNCE_MS  = 120;
  const IDLE_TIMEOUT = 500; // ms bis requestIdleCallback auch bei Auslastung laeuft

  /** One-time setup: Settings laden, Features starten, ersten Pass machen. */
  async function start() {
    try {
      await SettingsStore.init();
      _log('Settings geladen');
    } catch (e) {
      console.error('[MDM] Settings konnten nicht geladen werden:', e);
      return; // ohne Settings laeuft gar nichts - harter Abbruch
    }

    // -- Optionale Features - abstuerzen erlaubt ---------------------------------
    if (typeof Exporter  !== 'undefined') safeInit('Exporter',  () => Exporter.init());
    if (typeof Collector !== 'undefined') safeInit('Collector', () => Collector.init());

    // -- Core - muss funktionieren -----------------------------------------------
    UiController.init({
      onHide:      _handleHide,
      onSettings:  null,
      getSettings: () => SettingsStore.settings,
    });

    window.__mdm_app = { reprocess };

    processDeals();
    _startObserver();
  }

  /**
   * Verarbeitet alle Deal-Artikel im DOM, gechunkt ueber requestIdleCallback.
   *
   * Warum gechunkt?
   *   Bei 100+ Deals blockiert ein synchroner Loop den Main Thread spuerbar
   *   (~5-15ms pro Deal durch DOM-Reads). requestIdleCallback gibt die Kontrolle
   *   nach jedem Slice zurueck und laesst Scroll/Animationen fluessig bleiben.
   *
   * Warum _processGen?
   *   Wenn reprocess() waehrend eines laufenden Chunks aufgerufen wird (z.B. User
   *   speichert Settings), bekommt der neue Aufruf eine neue Generation-ID.
   *   Der alte Idle-Callback sieht das, bricht ab und rauemt nicht weiter auf.
   */
  function processDeals() {
    const gen      = ++_processGen;
    const articles = DealParser.findAll();
    const settings = SettingsStore.settings;
    const debug    = settings.mdm_debugEnabled;

    _log('processDeals gen=' + gen + ': ' + articles.length + ' Deals');

    let i = 0;

    function _chunk(deadline) {
      if (_processGen !== gen) return; // neuerer Aufruf hat uebernommen => stopp

      while (i < articles.length) {
        // Zeitbudget aufgebraucht (ausser beim Timeout-Pflichtlauf)?
        if (deadline.timeRemaining() < 2 && !deadline.didTimeout) break;
        _processDeal(articles[i++], settings, debug);
      }

      if (i < articles.length) {
        // Noch nicht fertig => naechsten Idle-Slot anfordern
        _scheduleChunk(_chunk);
      }
    }

    _scheduleChunk(_chunk);
  }

  function _scheduleChunk(fn) {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(fn, { timeout: IDLE_TIMEOUT });
    } else {
      // Fallback: setTimeout(0) gibt zumindest den Call Stack frei
      setTimeout(function() { fn({ timeRemaining: function() { return Infinity; }, didTimeout: true }); }, 0);
    }
  }

  /** Verarbeitet einen einzelnen Deal-Artikel. */
  function _processDeal(el, settings, debug) {
    const deal              = DealParser.parse(el);
    const result            = DealFilterEngine.evaluate(deal, settings);
    const hide              = result.hide;
    const ghost             = result.ghost;
    const reason            = result.reason;

    UiController.setHidden(el, hide);
    UiController.setGhost(el, !hide && !!ghost);

    if (debug) {
      UiController.setDebugBadge(el, hide ? reason : ghost ? reason : null);
    }

    if (!hide) {
      UiController.injectButtons(el, deal);
    }
  }

  /** Re-process nach Settings-Aenderung oder SPA-Navigation. */
  function reprocess() {
    DealParser.resetStateCache();
    processDeals();
  }

  /** X-Button Handler: Deal persistieren + sofort ausblenden. */
  async function _handleHide(dealData) {
    if (!dealData.id) return;
    await SettingsStore.hideDeals(dealData.id);
    UiController.setHidden(dealData.element, true);
    _log('Deal ausgeblendet: ' + dealData.id + ' - ' + dealData.title);
  }

  /**
   * MutationObserver - reagiert NUR auf neue Deal-Artikel.
   *
   * Frueher: jede DOM-Aenderung (Ads laden, Tooltips, Hover-Effekte) hat
   * processDeals() getriggert. Jetzt: nur wenn article[data-t="thread"]
   * tatsaechlich hinzugekommen sind (Infinite Scroll, SPA-Navigation).
   */
  function _startObserver() {
    if (_observer) return;

    _observer = new MutationObserver(function(mutations) {
      var hasNewDeals = mutations.some(function(m) {
        return Array.from(m.addedNodes).some(function(n) {
          return n.nodeType === 1 && (
            (n.matches && n.matches('article[data-t="thread"]')) ||
            (n.querySelector && n.querySelector('article[data-t="thread"]'))
          );
        });
      });

      if (!hasNewDeals) return;

      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(processDeals, DEBOUNCE_MS);
    });

    _observer.observe(document.body, { childList: true, subtree: true });
  }

  function _log() {
    if (SettingsStore.settings && SettingsStore.settings.mdm_debugEnabled) {
      var args = Array.from(arguments);
      args.unshift('[MDM]');
      console.log.apply(console, args);
    }
  }

  return { start: start, processDeals: processDeals, reprocess: reprocess };
})();

// -- Message listener (Popup => Content Script) ---------------------------------

chrome.runtime.onMessage.addListener(function(msg) {
  if (msg && msg.type === 'MDM_REPROCESS') {
    MyDealzManagerApp.reprocess();
  }
});

// -- Bootstrap -----------------------------------------------------------------

(function bootstrap() {
  if (window.__mdm_loaded) return;
  window.__mdm_loaded = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { MyDealzManagerApp.start(); });
  } else {
    MyDealzManagerApp.start();
  }
})();
