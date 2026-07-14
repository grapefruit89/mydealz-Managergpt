/**
 * settings-modal.js
 * Settings Modal -- oeffnet, rendert und speichert die Extension-Einstellungen.
 * Enthaelt alle CSS-Regeln fuer Overlay und Modal-Box.
 *
 * Depends on: SettingsStore, Logger
 * Exports:    SettingsModal
 */

const MODAL_ID   = 'mdm-settings-modal';
const OVERLAY_ID = 'mdm-settings-overlay';

function injectModalStyles() {
  if (document.getElementById('mdm-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'mdm-modal-styles';
  style.textContent = [
    '@layer mdm {',

    '  /* -- Modal Overlay ------------------------------------------------- */',
    '  #' + OVERLAY_ID + ' {',
    '    position: fixed;',
    '    inset: 0;',
    '    background: rgba(0,0,0,0.45);',
    '    backdrop-filter: blur(2px);',
    '    z-index: 2147483638;',
    '    display: flex;',
    '    align-items: center;',
    '    justify-content: center;',
    '    transition: opacity 0.2s ease;',
    '  }',
    '  @starting-style { #' + OVERLAY_ID + ' { opacity: 0; } }',

    '  /* -- Settings Modal ------------------------------------------------ */',
    '  #' + MODAL_ID + ' {',
    '    background: var(--mdm-surface);',
    '    border-radius: 12px;',
    '    box-shadow: var(--mdm-shadow);',
    '    border: 1px solid var(--mdm-border);',
    '    padding: 24px;',
    '    width: 540px;',
    '    max-width: 95vw;',
    '    max-height: 88vh;',
    '    overflow-y: auto;',
    '    z-index: 2147483640;',
    '    font-family: var(--mdm-font);',
    '    font-size: 14px;',
    '    color: var(--mdm-text);',
    '    transition: transform 0.2s ease, opacity 0.2s ease;',
    '  }',
    '  @starting-style { #' + MODAL_ID + ' { transform: translateY(12px); opacity: 0; } }',

    '  #' + MODAL_ID + ' h2 {',
    '    margin: 0 0 20px;',
    '    font-size: 17px;',
    '    font-weight: 700;',
    '    display: flex;',
    '    align-items: center;',
    '    gap: 8px;',
    '    color: var(--mdm-text);',
    '  }',

    '  #' + MODAL_ID + ' .mdm-section { margin-bottom: 16px; }',

    '  #' + MODAL_ID + ' label {',
    '    display: block;',
    '    font-weight: 600;',
    '    font-size: 13px;',
    '    margin-bottom: 5px;',
    '    color: var(--mdm-text);',
    '  }',

    '  #' + MODAL_ID + ' input[type="text"],',
    '  #' + MODAL_ID + ' input[type="number"],',
    '  #' + MODAL_ID + ' textarea {',
    '    width: 100%;',
    '    box-sizing: border-box;',
    '    border: 1px solid var(--mdm-border);',
    '    border-radius: var(--mdm-radius);',
    '    padding: 7px 10px;',
    '    font-size: 13px;',
    '    font-family: var(--mdm-font);',
    '    background: var(--mdm-surface-2);',
    '    color: var(--mdm-text);',
    '    transition: border-color 0.15s;',
    '  }',

    '  #' + MODAL_ID + ' input:focus, #' + MODAL_ID + ' textarea:focus {',
    '    outline: none;',
    '    border-color: var(--mdm-accent);',
    '    box-shadow: 0 0 0 3px var(--mdm-accent-dim);',
    '  }',

    '  #' + MODAL_ID + ' .mdm-checkbox-row {',
    '    display: flex;',
    '    align-items: center;',
    '    gap: 8px;',
    '    margin-bottom: 7px;',
    '    font-size: 13px;',
    '    color: var(--mdm-text);',
    '  }',

    '  #' + MODAL_ID + ' .mdm-tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }',

    '  #' + MODAL_ID + ' .mdm-tag {',
    '    display: inline-flex;',
    '    align-items: center;',
    '    gap: 4px;',
    '    background: var(--mdm-surface-2);',
    '    border: 1px solid var(--mdm-border);',
    '    border-radius: 20px;',
    '    padding: 3px 10px;',
    '    font-size: 12px;',
    '    cursor: pointer;',
    '    color: var(--mdm-text);',
    '    transition: background 0.12s, border-color 0.12s;',
    '  }',
    '  #' + MODAL_ID + ' .mdm-tag:hover {',
    '    background: color-mix(in srgb, var(--mdm-danger) 12%, var(--mdm-surface));',
    '    border-color: var(--mdm-danger);',
    '    color: var(--mdm-danger);',
    '  }',

    '  #' + MODAL_ID + ' .mdm-btn-row {',
    '    display: flex;',
    '    gap: 8px;',
    '    margin-top: 22px;',
    '    justify-content: flex-end;',
    '    flex-wrap: wrap;',
    '  }',

    '  #' + MODAL_ID + ' button {',
    '    all: unset;',
    '    box-sizing: border-box;',
    '    border-radius: var(--mdm-radius);',
    '    cursor: pointer;',
    '    font-size: 13px;',
    '    font-family: var(--mdm-font);',
    '    font-weight: 600;',
    '    padding: 8px 18px;',
    '    transition: background 0.12s, transform 0.1s;',
    '  }',
    '  #' + MODAL_ID + ' button:active { transform: scale(0.97); }',

    '  #' + MODAL_ID + ' .mdm-btn-save { background: var(--mdm-accent); color: #fff; }',
    '  #' + MODAL_ID + ' .mdm-btn-save:hover { background: color-mix(in srgb, var(--mdm-accent) 85%, #000); }',

    '  #' + MODAL_ID + ' .mdm-btn-cancel {',
    '    background: var(--mdm-surface-2);',
    '    color: var(--mdm-text);',
    '    border: 1px solid var(--mdm-border);',
    '  }',
    '  #' + MODAL_ID + ' .mdm-btn-cancel:hover { background: var(--mdm-border); }',

    '  #' + MODAL_ID + ' .mdm-btn-reset {',
    '    background: transparent;',
    '    color: var(--mdm-text-muted);',
    '    border: 1px solid var(--mdm-border);',
    '    margin-right: auto;',
    '    font-weight: 400;',
    '  }',
    '  #' + MODAL_ID + ' .mdm-btn-reset:hover { color: var(--mdm-danger); border-color: var(--mdm-danger); }',

    '  #' + MODAL_ID + ' .mdm-tier-bar {',
    '    height: 18px;',
    '    border-radius: 4px;',
    '    margin: 10px 0 4px;',
    '    transition: background 0.2s ease;',
    '  }',
    '  #' + MODAL_ID + ' .mdm-tier-labels {',
    '    display: flex;',
    '    justify-content: space-between;',
    '    font-size: 10px;',
    '    color: var(--mdm-text-muted);',
    '    margin-bottom: 10px;',
    '  }',
    '  #' + MODAL_ID + ' .mdm-tier-config {',
    '    padding: 10px 0 0;',
    '    border-top: 1px solid var(--mdm-border);',
    '    margin-top: 10px;',
    '  }',

    '  #' + MODAL_ID + ' input[type="range"] {',
    '    width: 100%;',
    '    height: 4px;',
    '    -webkit-appearance: none;',
    '    appearance: none;',
    '    background: var(--mdm-border);',
    '    border-radius: 2px;',
    '    outline: none;',
    '    margin: 6px 0 2px;',
    '    cursor: pointer;',
    '  }',
    '  #' + MODAL_ID + ' input[type="range"]::-webkit-slider-thumb {',
    '    -webkit-appearance: none;',
    '    width: 16px;',
    '    height: 16px;',
    '    border-radius: 50%;',
    '    background: var(--mdm-accent);',
    '    cursor: pointer;',
    '    border: 2px solid var(--mdm-surface);',
    '    box-shadow: 0 0 0 1px var(--mdm-accent);',
    '  }',

    '  #' + MODAL_ID + ' .mdm-tier-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }',
    '  #' + MODAL_ID + ' .mdm-tier-pill { display: inline-block; width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }',
    '  #' + MODAL_ID + ' .mdm-tier-pill--a { background: #4ade80; }',
    '  #' + MODAL_ID + ' .mdm-tier-pill--b { background: #facc15; }',
    '  #' + MODAL_ID + ' .mdm-tier-pill--c { background: #f87171; }',

    '  /* -- Error Log (nur bei debug && Fehler vorhanden) -------------------- */',
    '  #' + MODAL_ID + ' .mdm-error-log {',
    '    margin-top: 16px;',
    '    border: 1px solid var(--mdm-danger);',
    '    border-radius: var(--mdm-radius);',
    '    padding: 12px;',
    '    background: color-mix(in srgb, var(--mdm-danger) 8%, var(--mdm-surface));',
    '  }',
    '  #' + MODAL_ID + ' .mdm-error-log-header {',
    '    font-size: 12px;',
    '    font-weight: 700;',
    '    color: var(--mdm-danger);',
    '    margin-bottom: 8px;',
    '    display: flex;',
    '    justify-content: space-between;',
    '    align-items: center;',
    '  }',
    '  #' + MODAL_ID + ' .mdm-error-log textarea {',
    '    font-family: ui-monospace, monospace;',
    '    font-size: 11px;',
    '    min-height: 100px;',
    '    resize: vertical;',
    '    border-color: color-mix(in srgb, var(--mdm-danger) 40%, var(--mdm-border));',
    '  }',
    '  #' + MODAL_ID + ' .mdm-btn-clear-log {',
    '    all: unset;',
    '    box-sizing: border-box;',
    '    font-size: 11px;',
    '    font-weight: 400;',
    '    padding: 3px 8px;',
    '    color: var(--mdm-danger);',
    '    border: 1px solid var(--mdm-danger);',
    '    border-radius: 4px;',
    '    cursor: pointer;',
    '    background: transparent;',
    '  }',
    '  #' + MODAL_ID + ' .mdm-btn-clear-log:hover {',
    '    background: color-mix(in srgb, var(--mdm-danger) 12%, var(--mdm-surface));',
    '  }',

    '} /* end @layer mdm (modal) */',
  ].join('\n');
  document.head.appendChild(style);
}

const SettingsModal = (() => {

  /**
   * Oeffnet das Settings-Modal.
   * @param {Object|null} contextDeal  -- Deal-Kontext fuer "Aktueller Haendler"-Button (optional)
   * @param {Function}    getSettings  -- () => aktuelles Settings-Objekt
   */
  function open(contextDeal, getSettings) {
    if (document.getElementById(OVERLAY_ID)) return; // schon offen
    injectModalStyles();

    const settings = getSettings?.() ?? {};

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.innerHTML = _buildHTML(settings, contextDeal);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Schliessen per Overlay-Klick
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) close();
    });

    // Buttons verdrahten
    modal.querySelector('#mdm-btn-save')?.addEventListener('click', function() { _save(modal, contextDeal); });
    modal.querySelector('#mdm-btn-cancel')?.addEventListener('click', close);
    modal.querySelector('#mdm-btn-reset')?.addEventListener('click', async function() {
      if (confirm('Alle Einstellungen zuruecksetzen?')) {
        await SettingsStore.reset();
        close();
        window.__mdm_app?.reprocess?.();
      }
    });

    // Error-Log: "Logs loeschen" Button
    modal.querySelector('#mdm-clear-errors')?.addEventListener('click', function() {
      if (typeof Logger !== 'undefined') Logger.clearHistory();
      modal.querySelector('.mdm-error-log')?.remove();
    });

    // Tag-Entfernung per Klick
    modal.addEventListener('click', function(e) {
      const tag = e.target.closest('.mdm-tag');
      if (tag) tag.remove();
    });

    // -- Preis-Tier-Slider ---------------------------------------------------
    const tierCheck  = modal.querySelector('#mdm-tier-enabled');
    const tierConfig = modal.querySelector('#mdm-tier-config');
    const sliderA    = modal.querySelector('#mdm-tier-a-max');
    const sliderB    = modal.querySelector('#mdm-tier-b-max');
    const dispA      = modal.querySelector('#mdm-a-display');
    const dispB      = modal.querySelector('#mdm-b-display');
    const tierBar    = modal.querySelector('#mdm-tier-bar');

    function _syncTierUI() {
      const a = parseInt(sliderA.value, 10);
      const b = parseInt(sliderB.value, 10);
      // B-Minimum immer > A
      sliderB.min = a + 50;
      if (b <= a) {
        sliderB.value = a + 50;
      }
      const bSafe = parseInt(sliderB.value, 10);
      dispA.textContent = a;
      dispB.textContent = bSafe;
      if (tierBar) tierBar.style.background = _tierGradient(a, bSafe);
    }

    tierCheck?.addEventListener('change', function() {
      tierConfig.style.display = tierCheck.checked ? '' : 'none';
    });
    sliderA?.addEventListener('input', _syncTierUI);
    sliderB?.addEventListener('input', _syncTierUI);

    // Escape-Taste schliesst Modal
    const onKey = function(e) {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  function close() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  // Berechnet den CSS linear-gradient fuer die Tier-Bar (0-2000EUR Skala)
  function _tierGradient(aMax, bMax) {
    const total = 2000;
    const a = Math.min((aMax / total) * 100, 99).toFixed(1);
    const b = Math.min((bMax / total) * 100, 99.5).toFixed(1);
    return 'linear-gradient(to right, #4ade80 0%, #4ade80 ' + a + '%, #facc15 ' + a + '%, #facc15 ' + b + '%, #f87171 ' + b + '%, #f87171 100%)';
  }

  // Escaped HTML-Sonderzeichen fuer Attribute
  function _esc(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // Escaped Text fuer textarea-Inhalt (nur < und &)
  function _escText(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function _splitCSV(str) {
    return str.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  }

  function _buildHTML(s, deal) {
    const excludeWords    = (s.mdm_excludeWords ?? []).join(', ');
    const whitelistWords  = (s.mdm_whitelistWords ?? []).join(', ');
    const blockedUsers    = (s.mdm_blockedUsers ?? []).join(', ');
    const merchantEntries = Object.values(s.mdm_excludeMerchantsData ?? {});
    const maxPrice        = s.mdm_maxPrice ?? '';
    const tierEnabled     = s.mdm_tierEnabled ?? false;
    const tierAMax        = s.mdm_tierAMax ?? 100;
    const tierBMax        = s.mdm_tierBMax ?? 600;

    const merchantTags = merchantEntries.map(function(m) {
      return '<span class="mdm-tag" data-merchant-id="' + _esc(String(m.id)) + '" title="Klicken zum Entfernen">' + _esc(m.name || m.id) + ' ✕</span>';
    }).join('');

    const currentMerchantBtn = (deal?.merchantId && deal?.merchantName)
      ? '<button type="button" id="mdm-add-current-merchant" style="margin-top:6px;background:#f5f5f5;border:1px solid #ccc;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">+ Aktueller Händler: ' + _esc(deal.merchantName) + '</button>'
      : '';

    const currentUserBtn = deal?.username
      ? '<button type="button" id="mdm-add-current-user" style="margin-top:6px;background:#f5f5f5;border:1px solid #ccc;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">+ Aktueller User: ' + _esc(deal.username) + '</button>'
      : '';

    // -- Error-Log-Sektion (nur bei debug === true && Fehler vorhanden) ------
    const errors = (typeof Logger !== 'undefined') ? Logger.getHistory() : [];
    let errorLogHtml = '';
    if (s.mdm_debugEnabled && errors.length > 0) {
      const logText = errors.map(function(e) {
        const time = e.time instanceof Date ? e.time.toLocaleTimeString() : '?';
        const line = '[' + time + '] [' + e.module + '] ' + e.message;
        return line + (e.stack ? '\n' + e.stack : '');
      }).join('\n\n');
      errorLogHtml = [
        '<div class="mdm-section mdm-error-log">',
        '  <div class="mdm-error-log-header">',
        '    <span>⚠️ Fehler-Log (' + errors.length + ')</span>',
        '    <button type="button" id="mdm-clear-errors" class="mdm-btn-clear-log">Logs löschen</button>',
        '  </div>',
        '  <textarea readonly>' + _escText(logText) + '</textarea>',
        '</div>',
      ].join('\n');
    }

    return [
      '<h2>mydealz Manager – Einstellungen</h2>',

      '<div class="mdm-section">',
      '  <label for="mdm-exclude-words">Wörter ausblenden (kommagetrennt)</label>',
      '  <input type="text" id="mdm-exclude-words" value="' + _esc(excludeWords) + '"',
      '         placeholder="gaming, apple -zubehör, apple &quot;passend für&quot;, samsung, *case*">',
      '  <div style="font-size:11px;color:var(--mdm-text-muted);margin-top:4px;line-height:1.5">',
      '    Jeder Eintrag ist ein Ausdruck: Leerzeichen = AND &nbsp;&middot;&nbsp;',
      '    <code>-wort</code> = NOT &nbsp;&middot;&nbsp; <code>*wildcard*</code> &nbsp;&middot;&nbsp;',
      '    <code>&quot;exakte phrase&quot;</code> &nbsp;&middot;&nbsp;',
      '    Wortgrenzen-Match: "apple" trifft nicht "pineapple"',
      '  </div>',
      '</div>',

      '<div class="mdm-section">',
      '  <label for="mdm-whitelist-words">Whitelist (Wörter die nie versteckt werden)</label>',
      '  <input type="text" id="mdm-whitelist-words" value="' + _esc(whitelistWords) + '"',
      '         placeholder="lego, kindle, ...">',
      '</div>',

      '<div class="mdm-section">',
      '  <label>Händler ausblenden</label>',
      '  <div class="mdm-tag-list" id="mdm-merchant-tags">' + merchantTags + '</div>',
      '  ' + currentMerchantBtn,
      '</div>',

      '<div class="mdm-section">',
      '  <label for="mdm-blocked-users">User blocken (kommagetrennt)</label>',
      '  <input type="text" id="mdm-blocked-users" value="' + _esc(blockedUsers) + '"',
      '         placeholder="username1, username2, ...">',
      '  ' + currentUserBtn,
      '</div>',

      '<div class="mdm-section">',
      '  <label for="mdm-max-price">Maximaler Preis (€, leer = kein Limit)</label>',
      '  <input type="number" id="mdm-max-price" value="' + _esc(String(maxPrice)) + '" min="0" step="0.01" placeholder="z.B. 50">',
      '</div>',

      '<div class="mdm-section">',
      '  <div class="mdm-checkbox-row">',
      '    <input type="checkbox" id="mdm-hide-cold"' + (s.mdm_hideColdDeals ? ' checked' : '') + '>',
      '    <label for="mdm-hide-cold" style="margin:0;font-weight:400">Kalte Deals (&lt; 0°) ausblenden</label>',
      '  </div>',
      '  <div class="mdm-checkbox-row">',
      '    <input type="checkbox" id="mdm-hide-merchant-names"' + (s.mdm_hideMatchingMerchantNames ? ' checked' : '') + '>',
      '    <label for="mdm-hide-merchant-names" style="margin:0;font-weight:400">Händlernamen auch im Titel prüfen</label>',
      '  </div>',
      '  <div class="mdm-checkbox-row">',
      '    <input type="checkbox" id="mdm-debug"' + (s.mdm_debugEnabled ? ' checked' : '') + '>',
      '    <label for="mdm-debug" style="margin:0;font-weight:400">Debug-Modus (Grund für Ausblendung anzeigen)</label>',
      '  </div>',
      '</div>',

      '<!-- -- Preis-Tiers -------------------------------------------------- -->',
      '<div class="mdm-section">',
      '  <div class="mdm-checkbox-row">',
      '    <input type="checkbox" id="mdm-tier-enabled"' + (tierEnabled ? ' checked' : '') + '>',
      '    <label for="mdm-tier-enabled" style="margin:0;font-weight:600">Preis-Tiers aktivieren</label>',
      '  </div>',
      '  <div class="mdm-tier-config" id="mdm-tier-config" style="' + (tierEnabled ? '' : 'display:none') + '">',
      '    <div class="mdm-tier-bar" id="mdm-tier-bar" style="background: ' + _tierGradient(tierAMax, tierBMax) + '"></div>',
      '    <div class="mdm-tier-labels">',
      '      <span>🟢 A — immer sichtbar</span>',
      '      <span>🟡 B — gedimmt</span>',
      '      <span>🔴 C — ausgeblendet</span>',
      '    </div>',
      '    <div class="mdm-tier-row">',
      '      <span class="mdm-tier-pill mdm-tier-pill--a"></span>',
      '      <label style="font-size:12px;flex:1;margin:0">Tier A bis: <strong id="mdm-a-display">' + tierAMax + '</strong>€</label>',
      '    </div>',
      '    <input type="range" id="mdm-tier-a-max" min="50" max="950" step="50" value="' + tierAMax + '">',
      '    <div class="mdm-tier-row" style="margin-top:10px">',
      '      <span class="mdm-tier-pill mdm-tier-pill--b"></span>',
      '      <label style="font-size:12px;flex:1;margin:0">',
      '        Tier B bis: <strong id="mdm-b-display">' + tierBMax + '</strong>€',
      '        <span style="color:var(--mdm-text-muted)">(darüber → Tier C, ausgeblendet)</span>',
      '      </label>',
      '    </div>',
      '    <input type="range" id="mdm-tier-b-max" min="' + Math.min(tierAMax + 50, 2000) + '" max="2000" step="50" value="' + tierBMax + '">',
      '  </div>',
      '</div>',

      errorLogHtml,

      '<div class="mdm-btn-row">',
      '  <button class="mdm-btn-reset" id="mdm-btn-reset">Zurücksetzen</button>',
      '  <button class="mdm-btn-cancel" id="mdm-btn-cancel">Abbrechen</button>',
      '  <button class="mdm-btn-save" id="mdm-btn-save">Speichern &amp; anwenden</button>',
      '</div>',
    ].join('\n');
  }

  async function _save(modal, contextDeal) {
    const excludeWords   = _splitCSV(modal.querySelector('#mdm-exclude-words')?.value ?? '');
    const whitelistWords = _splitCSV(modal.querySelector('#mdm-whitelist-words')?.value ?? '');
    const blockedUsers   = _splitCSV(modal.querySelector('#mdm-blocked-users')?.value ?? '');
    const maxPriceRaw    = modal.querySelector('#mdm-max-price')?.value ?? '';
    const maxPrice       = maxPriceRaw !== '' ? parseFloat(maxPriceRaw) : null;
    const hideCold       = modal.querySelector('#mdm-hide-cold')?.checked ?? false;
    const hideMerchantNames = modal.querySelector('#mdm-hide-merchant-names')?.checked ?? false;
    const debug          = modal.querySelector('#mdm-debug')?.checked ?? false;

    // Merchant-Tags (verbleibende nach Nutzer-Entfernung)
    const merchantTagEls = modal.querySelectorAll('#mdm-merchant-tags .mdm-tag');
    const merchantsObj   = {};
    merchantTagEls.forEach(function(tag) {
      const id   = tag.dataset.merchantId;
      const name = tag.textContent.replace(' ✕', '').trim();
      if (id) merchantsObj[id] = { id: id, name: name };
    });

    // "Aktueller Haendler" hinzufuegen wenn Button noch da
    const addMerchant = modal.querySelector('#mdm-add-current-merchant');
    if (addMerchant && contextDeal?.merchantId) {
      merchantsObj[contextDeal.merchantId] = {
        id:   contextDeal.merchantId,
        name: contextDeal.merchantName,
      };
    }
    const addUser = modal.querySelector('#mdm-add-current-user');
    if (addUser && contextDeal?.username) {
      if (!blockedUsers.includes(contextDeal.username)) {
        blockedUsers.push(contextDeal.username);
      }
    }

    // Tier-Einstellungen
    const tierEnabled = modal.querySelector('#mdm-tier-enabled')?.checked ?? false;
    const tierAMaxRaw = modal.querySelector('#mdm-tier-a-max')?.value;
    const tierBMaxRaw = modal.querySelector('#mdm-tier-b-max')?.value;
    const tierAMax    = tierAMaxRaw ? parseInt(tierAMaxRaw, 10) : 100;
    const tierBMax    = tierBMaxRaw ? parseInt(tierBMaxRaw, 10) : 600;

    // Persistieren
    await SettingsStore.setExcludeWords(excludeWords);
    await SettingsStore.setWhitelistWords(whitelistWords);
    await SettingsStore.setBlockedUsers(blockedUsers);
    await SettingsStore.setExcludeMerchants(merchantsObj);
    await SettingsStore.setMaxPrice(isNaN(maxPrice) ? null : maxPrice);
    await SettingsStore.setHideColdDeals(hideCold);
    await SettingsStore.setHideMerchantNames(hideMerchantNames);
    await SettingsStore.setDebugEnabled(debug);
    await SettingsStore.setTierEnabled(tierEnabled);
    await SettingsStore.setTierAMax(tierAMax);
    await SettingsStore.setTierBMax(tierBMax);

    close();
    window.__mdm_app?.reprocess?.();
  }

  return { open: open, close: close };
})();

if (typeof module !== 'undefined') module.exports = { SettingsModal };
