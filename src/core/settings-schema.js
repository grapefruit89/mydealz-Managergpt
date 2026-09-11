/**
 * settings-schema.js
 * SINGLE SOURCE OF TRUTH für alle Settings: Keys, Defaults, Typen, Labels,
 * UI-Zugehörigkeit (Page-Modal / Toolbar-Popup) und Reset-Verhalten.
 *
 * Vorher waren STORAGE_KEYS + DEFAULTS in settings-store.js UND popup.js
 * dupliziert (Drift-Risiko: popup kannte schemaVersion nicht, minDiscount
 * fehlte im Modal). Jetzt leitet jede Oberfläche ihre Keys/Defaults von
 * HIER ab.
 *
 * Spielregeln:
 *   1. Neues Setting? → Hier Eintrag hinzufügen, sonst nirgendwo.
 *   2. `storage: true`  → Key lebt in chrome.storage.local
 *   3. `modal`/`popup`  → Oberfläche zeigt ein Control (oder nicht)
 *   4. `resetKeep`      → überlebt SettingsStore.reset() (Nutzerdaten!)
 *   5. Key-Umbenennung  → MDM_SCHEMA_VERSION hochzählen + Migration in
 *                          settings-store.js _migrate() ergänzen
 *
 * Wird gebaut von: content-Bundle (IIFE), Userscript-Bundle, und als
 * eigenes dist/settings-schema.js für popup.html (classic script).
 */

const MdmSchema = (() => {

  const SCHEMA_VERSION = 1;

  // ── Definitions ─────────────────────────────────────────────────────────────
  //   name      – Kurzname (wird zu 'mdm_' + key als Storage-Key)
  //   type      – bool | number | numberOrNull | stringList | map | list | internal
  //   modal/popup – UI-Sichtbarkeit (true/false)
  //   resetKeep – true = Nutzer-Daten, überlebt reset()

  const ENTRIES = [
    // Nutzer-Zustand (kein Setting im eigentlichen Sinn)
    { name: 'hiddenDeals',       key: 'mdm_hiddenDeals',       type: 'map',        default: {},      modal: false, popup: false, resetKeep: true },

    // Filterlisten
    { name: 'excludeWords',      key: 'mdm_excludeWords',      type: 'list',       default: [],      modal: true,  popup: true  },
    { name: 'excludeMerchantsData', key: 'mdm_excludeMerchantsData', type: 'map',    default: {},      modal: true,  popup: true  },
    { name: 'blockedUsers',      key: 'mdm_blockedUsers',      type: 'list',       default: [],      modal: true,  popup: true  },
    { name: 'whitelistWords',    key: 'mdm_whitelistWords',    type: 'list',       default: [],      modal: true,  popup: true  },

    // Preis / Temperatur
    { name: 'hideColdDeals',     key: 'mdm_hideColdDeals',     type: 'bool',       default: false,   modal: true,  popup: true  },
    { name: 'maxPrice',          key: 'mdm_maxPrice',          type: 'numberOrNull', default: null,  modal: true,  popup: true  },
    { name: 'minDiscount',       key: 'mdm_minDiscount',       type: 'numberOrNull', default: null,  modal: true,  popup: true  }, // Mindest-Rabatt in %
    { name: 'hideOwnColdVotes',  key: 'mdm_hideOwnColdVotes',  type: 'bool',       default: false,   modal: true,  popup: true  },
    { name: 'hideMatchingMerchantNames', key: 'mdm_hideMatchingMerchantNames', type: 'bool', default: false, modal: true, popup: true },
    { name: 'hideNsfw',          key: 'mdm_hideNsfw',          type: 'bool',       default: false,   modal: true,  popup: true  },
    { name: 'stripMerchantTitle', key: 'mdm_stripMerchantTitle', type: 'bool',     default: false,   modal: true,  popup: true  },
    { name: 'rememberSort',      key: 'mdm_rememberSort',      type: 'bool',       default: false,   modal: true,  popup: true  },
    // Sortier-Gedächtnis (Nutzerzustand): Key = "<pathname>|<selectName>" → Wert
    { name: 'lastSortState',     key: 'mdm_lastSortState',     type: 'map',        default: {},      modal: false, popup: false, resetKeep: true },

    // Preis-Tier-System (Page-Modal mit Slidern; Popup bewusst ohne Tier-UI)
    { name: 'tierEnabled',       key: 'mdm_tierEnabled',       type: 'bool',       default: false,   modal: true,  popup: false },
    { name: 'tierAMax',          key: 'mdm_tierAMax',          type: 'number',     default: 100,     modal: true,  popup: false },
    { name: 'tierBMax',          key: 'mdm_tierBMax',          type: 'number',     default: 600,     modal: true,  popup: false },

    // Debug
    { name: 'debugEnabled',      key: 'mdm_debugEnabled',      type: 'bool',       default: false,   modal: true,  popup: true  },

    // Intern (nie in UI, resetKeep: Version überlebt Reset)
    { name: 'schemaVersion',     key: 'mdm_schemaVersion',     type: 'internal',   default: 0,       modal: false, popup: false, resetKeep: true },

    // Entwickleroptionen (Freischaltung: 5× Klick auf die Version im Popup)
    { name: 'devMode',           key: 'mdm_devMode',           type: 'bool',       default: false,   modal: false, popup: false },
    // Gemini-API-Key (Chat-Experiment, tests/sandbox-chat/); Nutzerdaten → resetKeep
    { name: 'geminiKey',         key: 'mdm_geminiKey',         type: 'internal',   default: '',      modal: false, popup: false, resetKeep: true },
  ];

  // ── Derived helpers ─────────────────────────────────────────────────────────

  const KEYS = {};
  const DEFAULTS = {};
  for (const def of ENTRIES) {
    KEYS[def.name] = def.key;
    DEFAULTS[def.key] = def.default;
  }

  function get(name) {
    return ENTRIES.find(d => d.name === name) ?? null;
  }

  return {
    version: SCHEMA_VERSION,
    ENTRIES,
    KEYS,        // { hiddenDeals: 'mdm_hiddenDeals', ... }
    DEFAULTS,    // { 'mdm_hiddenDeals': {}, ... }
    get,
  };
})();

if (typeof module !== 'undefined') module.exports = { MdmSchema };
