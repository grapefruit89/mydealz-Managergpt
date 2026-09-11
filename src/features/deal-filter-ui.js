/**
 * deal-filter-ui.js
 * Deal-Karten UI: CSS-Variablen, Ausblenden, Ghost-Mode, ✕/⚙ Buttons.
 *
 * Injiziert auf jede Deal-Karte:
 *   - ✕  (mdm-hide-btn)     — Deal sofort ausblenden + persistieren
 *   - ⚙  (mdm-settings-btn) — Settings-Modal öffnen (via SettingsModal.open)
 *
 * Sichtbarkeit:
 *   - setHidden(el, true)  — display:none (Tier C / manuell / Filter)
 *   - setGhost(el, true)   — gedimmt 32%, Hover stellt volle Sichtbarkeit her (Tier B)
 *
 * Depends on: SettingsModal
 * Exports:    DealUI, CSS_CLASSES
 */

// ── Klassen-Konstanten ────────────────────────────────────────────────────────

const CSS_CLASSES = {
  hideBtn:    'mdm-hide-btn',
  settingsBtn:'mdm-settings-btn',
  hiddenDeal: 'mdm-hidden',
  ghostDeal:  'mdm-ghost',
  debugBadge: 'mdm-debug-badge',
  btnGroup:   'mdm-btn-group',
};

// ── Deal-Karten CSS ───────────────────────────────────────────────────────────

function injectDealStyles() {
  if (document.getElementById('mdm-deal-styles')) return;
  const style = document.createElement('style');
  style.id = 'mdm-deal-styles';
  style.textContent = `

    /* ── CSS Custom Properties (MDM-Namespace) ──────────────────────────────
       mydealz Pepper-Platform-Vars als Fallback, eigene Werte als Basis.
       FUTURE: Farben auf oklch()-Farbraum + natives light-dark() migrieren.
         Beispiel: --mdm-accent: oklch(45% 0.2 264);
         Voraussetzung: ES-Module-Migration abschliessen,
         siehe docs/adr-001-build-system.md                                  */
    :root {
      --mdm-accent:      #1a56db;
      --mdm-accent-dim:  color-mix(in srgb, var(--mdm-accent) 85%, transparent);
      --mdm-danger:      #e8173a;
      --mdm-surface:     #ffffff;
      --mdm-surface-2:   #f5f5f5;
      --mdm-border:      #e0e0e0;
      --mdm-text:        #1a1a1a;
      --mdm-text-muted:  #6b7280;
      --mdm-radius:      6px;
      --mdm-shadow:      0 4px 24px rgba(0,0,0,0.18);
      --mdm-font:        -apple-system, system-ui, sans-serif;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --mdm-surface:    #1e1e1e;
        --mdm-surface-2:  #2a2a2a;
        --mdm-border:     #3a3a3a;
        --mdm-text:       #e8e8e8;
        --mdm-text-muted: #9ca3af;
        --mdm-shadow:     0 4px 24px rgba(0,0,0,0.5);
      }
    }

    @layer mdm {

      .${CSS_CLASSES.hiddenDeal} { display: none !important; }

      /* Ghost-Mode (Tier B) — gedimmt, Hover stellt Sichtbarkeit her */
      .${CSS_CLASSES.ghostDeal} {
        opacity: 0.32;
        filter: grayscale(30%) saturate(60%);
        transition: opacity 0.25s ease, filter 0.25s ease;
      }
      .${CSS_CLASSES.ghostDeal}:hover,
      .${CSS_CLASSES.ghostDeal}:focus-within {
        opacity: 1;
        filter: none;
      }
      .${CSS_CLASSES.ghostDeal}:hover .${CSS_CLASSES.btnGroup},
      .${CSS_CLASSES.ghostDeal}:focus-within .${CSS_CLASSES.btnGroup} {
        opacity: 1;
      }

      /* Deal-Artikel brauchen position:relative für absolute Buttons */
      article[data-t="thread"] { position: relative; }

      /* Button-Gruppe oben rechts — erst bei Hover sichtbar */
      .${CSS_CLASSES.btnGroup} {
        position: absolute;
        top: 6px;
        right: 6px;
        display: flex;
        gap: 3px;
        z-index: 10;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      article[data-t="thread"]:hover .${CSS_CLASSES.btnGroup},
      article[data-t="thread"]:focus-within .${CSS_CLASSES.btnGroup} {
        opacity: 1;
      }

      /* Basis-Style für ✕ und ⚙ Buttons */
      .${CSS_CLASSES.hideBtn},
      .${CSS_CLASSES.settingsBtn} {
        all: unset;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: var(--mdm-radius);
        cursor: pointer;
        font-size: 12px;
        font-family: var(--mdm-font);
        font-weight: 700;
        line-height: 1;
        transition: background 0.12s ease, transform 0.1s ease;
        background: color-mix(in srgb, var(--mdm-surface) 90%, transparent);
        backdrop-filter: blur(4px);
        border: 1px solid var(--mdm-border);
        color: var(--mdm-text-muted);
      }
      .${CSS_CLASSES.hideBtn}:hover {
        background: var(--mdm-danger);
        border-color: var(--mdm-danger);
        color: #fff;
        transform: scale(1.1);
      }
      .${CSS_CLASSES.settingsBtn}:hover {
        background: var(--mdm-accent);
        border-color: var(--mdm-accent);
        color: #fff;
        transform: scale(1.1);
      }

      /* Debug-Badge — zeigt Ausblend-Grund */
      .${CSS_CLASSES.debugBadge} {
        position: absolute;
        bottom: 2px;
        left: 2px;
        background: rgba(0,0,0,0.72);
        color: #4ade80;
        font-size: 10px;
        font-family: ui-monospace, monospace;
        padding: 1px 5px;
        border-radius: 3px;
        pointer-events: none;
        z-index: 9;
        max-width: 60%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

    } /* end @layer mdm (deal-ui) */
  `;
  document.head.appendChild(style);
}

// ── DealUI ────────────────────────────────────────────────────────────────────

const DealUI = (() => {
  let _onHide      = null;  // async (dealData) => void
  let _getSettings = null;  // () => settings object

  /**
   * Initialisiert DealUI mit Callbacks.
   * @param {Function} onHide      – wird beim ✕-Klick aufgerufen; empfängt dealData
   * @param {Function} getSettings – gibt aktuellen Settings-Snapshot zurück
   */
  function init({ onHide, onSettings, getSettings }) {
    _onHide      = onHide;
    _getSettings = getSettings;
    injectDealStyles();
  }

  /**
   * Injiziert ✕ / ⚙ Buttons in einen Deal-Artikel (idempotent).
   */
  function injectButtons(el, dealData) {
    if (el.querySelector(`.${CSS_CLASSES.btnGroup}`)) return;

    const group = document.createElement('div');
    group.className = CSS_CLASSES.btnGroup;

    const hideBtn = document.createElement('button');
    hideBtn.className = CSS_CLASSES.hideBtn;
    hideBtn.title = 'Deal ausblenden';
    hideBtn.textContent = '✕'; // ✕
    hideBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (_onHide) await _onHide(dealData);
    });

    const settingsBtn = document.createElement('button');
    settingsBtn.className = CSS_CLASSES.settingsBtn;
    settingsBtn.title = 'Einstellungen';
    settingsBtn.textContent = '⚙'; // ⚙
    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      SettingsModal.open(dealData, _getSettings);
    });

    group.appendChild(hideBtn);
    group.appendChild(settingsBtn);
    el.appendChild(group);
  }

  /**
   * Setzt oder entfernt den Debug-Badge (zeigt Ausblend-Grund).
   */
  function setDebugBadge(el, text) {
    let badge = el.querySelector(`.${CSS_CLASSES.debugBadge}`);
    if (!text) { badge?.remove(); return; }
    if (!badge) {
      badge = document.createElement('div');
      badge.className = CSS_CLASSES.debugBadge;
      el.appendChild(badge);
    }
    badge.textContent = text;
  }

  /** Blendet Deal aus/ein — Tier C, manuell, oder Filter. */
  function setHidden(el, hidden) {
    el.classList.toggle(CSS_CLASSES.hiddenDeal, hidden);
    if (hidden) el.classList.remove(CSS_CLASSES.ghostDeal);
  }

  /** Ghost-Modus (Tier B) — gedimmt aber sichtbar. */
  function setGhost(el, isGhost) {
    el.classList.toggle(CSS_CLASSES.ghostDeal, isGhost);
  }

  /**
   * Händlernamen aus Deal-Titel entfernen (Setting mdm_stripMerchantTitle).
   * Quelle: Original-Script 1.x „Händlernamen aus Titel entfernen".
   *
   * Reversibel: der unangetastete Titel wird VOR der ersten Mutation in
   * `el.dataset.mdmOrigTitle` gecacht — DealParser liest dieses Attribut
   * bevorzugt, damit (a) das Filter-Matching vom Strip unbeeinflusst bleibt
   * (blockierter Händler matcht weiter im Original-Titel) und (b) das
   * Abschalten des Settings den Original-Titel restauriert.
   */
  function stripMerchant(el, deal, settings) {
    const titleEl = el.querySelector('[data-t="threadLink"]')
                 ?? el.querySelector('.cept-tt, .js-thread-title');
    if (!titleEl) return;

    // Original sichern (einmalig, vor jeder Mutation)
    if (el.dataset.mdmOrigTitle === undefined) {
      el.dataset.mdmOrigTitle = titleEl.textContent.trim();
    }

    if (!settings.mdm_stripMerchantTitle) {
      // Restore, falls vorher gestrippt wurde
      if (el.dataset.mdmStripped === '1') {
        titleEl.textContent = el.dataset.mdmOrigTitle;
        delete el.dataset.mdmStripped;
      }
      return;
    }

    const merchant = (deal.merchantName ?? '').trim();
    if (merchant.length < 3) return;

    // Händlername (Wortgrenzen, case-insensitive) + unmittelbare Trenner
    // ("Name: ", "Name | ", "[Name] ", "bei Name ") aus dem Titel entfernen
    const esc = merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      '(?<![a-zA-ZäöüÄÖÜß0-9])' + esc + '(?![a-zA-ZäöüÄÖÜß0-9])\\s*[:|\\-]?\\s*', 'i'
    );
    const orig = el.dataset.mdmOrigTitle;
    const stripped = orig.replace(re, '').trim();
    if (stripped && stripped !== orig) {
      titleEl.textContent = stripped;
      el.dataset.mdmStripped = '1';
    }
  }

  return {
    init,
    injectButtons,
    setHidden,
    setGhost,
    stripMerchant,
    setDebugBadge,
    CSS_CLASSES,
  };
})();

// Rückwärtskompatibilitäts-Alias — content.js nutzt UiController
const UiController = DealUI;

if (typeof module !== 'undefined') module.exports = { DealUI, UiController, CSS_CLASSES };
