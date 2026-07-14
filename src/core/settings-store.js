/**
 * settings-store.js
 * Loads and saves all filter settings to chrome.storage.local.
 * Replaces the synchronous GM_getValue pattern with an async init() approach:
 *   await SettingsStore.init();
 *   SettingsStore.settings.hideColdDeals  // now safe to read synchronously
 *
 * Schema-Versionierung:
 *   MDM_SCHEMA_VERSION wird in chrome.storage als 'mdm_schemaVersion' gespeichert.
 *   Beim init() wird _migrate() aufgerufen — sie vergleicht gespeicherte vs.
 *   aktuelle Version und führt nötige Anpassungen durch. So können umbenannte
 *   oder entfernte Keys sauber bereinigt werden, ohne Nutzerdaten zu verlieren.
 *
 *   Version 1 — initiales Schema (aktuelle Keyset)
 */

// Aktuelle Schema-Version — bei Änderungen an STORAGE_KEYS erhöhen
const MDM_SCHEMA_VERSION = 1;

const STORAGE_KEYS = {
  hiddenDeals:              'mdm_hiddenDeals',
  excludeWords:             'mdm_excludeWords',
  excludeMerchantsData:     'mdm_excludeMerchantsData',
  blockedUsers:             'mdm_blockedUsers',
  whitelistWords:           'mdm_whitelistWords',
  hideColdDeals:            'mdm_hideColdDeals',
  maxPrice:                 'mdm_maxPrice',
  minDiscount:              'mdm_minDiscount',              // NEU: Mindest-Rabatt in %
  hideOwnColdVotes:         'mdm_hideOwnColdVotes',        // NEU: selbst cold-gevotete Deals
  hideMatchingMerchantNames:'mdm_hideMatchingMerchantNames',
  debugEnabled:             'mdm_debugEnabled',
  // Preis-Tier-System
  tierEnabled:              'mdm_tierEnabled',             // master toggle
  tierAMax:                 'mdm_tierAMax',               // ≤ X€ → Tier A (immer sichtbar)
  tierBMax:                 'mdm_tierBMax',               // ≤ Y€ → Tier B (gedimmt); > Y€ → Tier C (ausgeblendet)
  // Schema-Versionierung (immer als letztes)
  schemaVersion:            'mdm_schemaVersion',
};

const DEFAULTS = {
  [STORAGE_KEYS.hiddenDeals]:               {},   // { [dealId]: true }
  [STORAGE_KEYS.excludeWords]:              [],   // string[]
  [STORAGE_KEYS.excludeMerchantsData]:      {},   // { [merchantId]: { name, id } }
  [STORAGE_KEYS.blockedUsers]:              [],   // string[]
  [STORAGE_KEYS.whitelistWords]:            [],   // string[]  (bypass hide for these)
  [STORAGE_KEYS.hideColdDeals]:             false,
  [STORAGE_KEYS.maxPrice]:                  null, // number|null
  [STORAGE_KEYS.minDiscount]:               null, // number|null  (z.B. 20 = mind. 20% Rabatt)
  [STORAGE_KEYS.hideOwnColdVotes]:          false, // true = selbst cold-gevotete Deals verstecken
  [STORAGE_KEYS.hideMatchingMerchantNames]: false,
  [STORAGE_KEYS.debugEnabled]:              false,
  [STORAGE_KEYS.tierEnabled]:              false,
  [STORAGE_KEYS.tierAMax]:                 100,   // in €, 50€-Schritte
  [STORAGE_KEYS.tierBMax]:                 600,   // in €, 50€-Schritte
  [STORAGE_KEYS.schemaVersion]:            0,     // 0 = Pre-Versioning-Installation
};

const SettingsStore = (() => {
  // Internal cache – populated after init()
  let _cache = null;

  /**
   * Migriert veraltete Settings auf das aktuelle Schema.
   *
   * Aufgerufen aus init(), nachdem _cache befüllt wurde.
   * Jede Migration läuft einmalig (geprüft über gespeicherte schemaVersion).
   *
   * Wie neue Migrationen hinzufügen:
   *   1. MDM_SCHEMA_VERSION hochzählen
   *   2. In _migrate() neuen if-Block ergänzen:
   *      if (storedVersion < 2) { ... }
   */
  async function _migrate() {
    const storedVersion = _cache[STORAGE_KEYS.schemaVersion] ?? 0;
    if (storedVersion >= MDM_SCHEMA_VERSION) return; // nichts zu tun

    const updates = {};

    // ── Migration v0 → v1 ────────────────────────────────────────────────────
    // Erstes Schema: keine strukturellen Änderungen nötig.
    // Zukünftige Migrationen hier eintragen:
    //
    // if (storedVersion < 2) {
    //   // z.B. alten Key umbenennen:
    //   if (_cache['mdm_oldKey'] !== undefined) {
    //     updates['mdm_newKey'] = _cache['mdm_oldKey'];
    //     updates['mdm_oldKey'] = undefined; // wird von chrome.storage.remove() bereinigt
    //   }
    // }

    // Schema-Version auf aktuellen Stand setzen
    updates[STORAGE_KEYS.schemaVersion] = MDM_SCHEMA_VERSION;
    _cache[STORAGE_KEYS.schemaVersion]  = MDM_SCHEMA_VERSION;

    await chrome.storage.local.set(updates);

    if (typeof Logger !== 'undefined') {
      Logger.info('SettingsStore', `Schema migriert: v${storedVersion} → v${MDM_SCHEMA_VERSION}`);
    }
  }

  /** Load all settings from storage into the in-memory cache. */
  async function init() {
    const raw = await chrome.storage.local.get(DEFAULTS);
    _cache = raw;
    await _migrate();
    return _cache;
  }

  /** Return current in-memory settings (init() must have been called). */
  function get settings() {
    if (!_cache) throw new Error('[MDM] SettingsStore not initialised – call await SettingsStore.init() first');
    return _cache;
  }

  // ── Convenience getters (all synchronous after init) ──────────────────────

  function getHiddenDeals()         { return _cache[STORAGE_KEYS.hiddenDeals]; }
  function getExcludeWords()        { return _cache[STORAGE_KEYS.excludeWords]; }
  function getExcludeMerchants()    { return _cache[STORAGE_KEYS.excludeMerchantsData]; }
  function getBlockedUsers()        { return _cache[STORAGE_KEYS.blockedUsers]; }
  function getWhitelistWords()      { return _cache[STORAGE_KEYS.whitelistWords]; }
  function getHideColdDeals()       { return _cache[STORAGE_KEYS.hideColdDeals]; }
  function getMaxPrice()            { return _cache[STORAGE_KEYS.maxPrice]; }
  function getMinDiscount()         { return _cache[STORAGE_KEYS.minDiscount]; }
  function getHideOwnColdVotes()    { return _cache[STORAGE_KEYS.hideOwnColdVotes]; }
  function getHideMerchantNames()   { return _cache[STORAGE_KEYS.hideMatchingMerchantNames]; }
  function getDebugEnabled()        { return _cache[STORAGE_KEYS.debugEnabled]; }
  function getTierEnabled()         { return _cache[STORAGE_KEYS.tierEnabled]; }
  function getTierAMax()            { return _cache[STORAGE_KEYS.tierAMax]; }
  function getTierBMax()            { return _cache[STORAGE_KEYS.tierBMax]; }

  // ── Mutators (persist to storage + update cache) ─────────────────────────

  async function hideDeals(dealId) {
    const map = { ..._cache[STORAGE_KEYS.hiddenDeals], [dealId]: true };
    _cache[STORAGE_KEYS.hiddenDeals] = map;
    await chrome.storage.local.set({ [STORAGE_KEYS.hiddenDeals]: map });
  }

  async function unhideDeal(dealId) {
    const map = { ..._cache[STORAGE_KEYS.hiddenDeals] };
    delete map[dealId];
    _cache[STORAGE_KEYS.hiddenDeals] = map;
    await chrome.storage.local.set({ [STORAGE_KEYS.hiddenDeals]: map });
  }

  async function setExcludeWords(words) {
    _cache[STORAGE_KEYS.excludeWords] = words;
    await chrome.storage.local.set({ [STORAGE_KEYS.excludeWords]: words });
  }

  async function setExcludeMerchants(merchantsObj) {
    _cache[STORAGE_KEYS.excludeMerchantsData] = merchantsObj;
    await chrome.storage.local.set({ [STORAGE_KEYS.excludeMerchantsData]: merchantsObj });
  }

  async function addExcludeMerchant(id, name) {
    const map = { ..._cache[STORAGE_KEYS.excludeMerchantsData], [id]: { id, name } };
    _cache[STORAGE_KEYS.excludeMerchantsData] = map;
    await chrome.storage.local.set({ [STORAGE_KEYS.excludeMerchantsData]: map });
  }

  async function removeExcludeMerchant(id) {
    const map = { ..._cache[STORAGE_KEYS.excludeMerchantsData] };
    delete map[id];
    _cache[STORAGE_KEYS.excludeMerchantsData] = map;
    await chrome.storage.local.set({ [STORAGE_KEYS.excludeMerchantsData]: map });
  }

  async function setBlockedUsers(users) {
    _cache[STORAGE_KEYS.blockedUsers] = users;
    await chrome.storage.local.set({ [STORAGE_KEYS.blockedUsers]: users });
  }

  async function setWhitelistWords(words) {
    _cache[STORAGE_KEYS.whitelistWords] = words;
    await chrome.storage.local.set({ [STORAGE_KEYS.whitelistWords]: words });
  }

  async function setHideColdDeals(val) {
    _cache[STORAGE_KEYS.hideColdDeals] = val;
    await chrome.storage.local.set({ [STORAGE_KEYS.hideColdDeals]: val });
  }

  async function setMaxPrice(val) {
    _cache[STORAGE_KEYS.maxPrice] = val;
    await chrome.storage.local.set({ [STORAGE_KEYS.maxPrice]: val });
  }

  async function setMinDiscount(val) {
    _cache[STORAGE_KEYS.minDiscount] = val;
    await chrome.storage.local.set({ [STORAGE_KEYS.minDiscount]: val });
  }

  async function setHideOwnColdVotes(val) {
    _cache[STORAGE_KEYS.hideOwnColdVotes] = val;
    await chrome.storage.local.set({ [STORAGE_KEYS.hideOwnColdVotes]: val });
  }

  async function setHideMerchantNames(val) {
    _cache[STORAGE_KEYS.hideMatchingMerchantNames] = val;
    await chrome.storage.local.set({ [STORAGE_KEYS.hideMatchingMerchantNames]: val });
  }

  async function setDebugEnabled(val) {
    _cache[STORAGE_KEYS.debugEnabled] = val;
    await chrome.storage.local.set({ [STORAGE_KEYS.debugEnabled]: val });
  }

  async function setTierEnabled(val) {
    _cache[STORAGE_KEYS.tierEnabled] = val;
    await chrome.storage.local.set({ [STORAGE_KEYS.tierEnabled]: val });
  }

  async function setTierAMax(val) {
    _cache[STORAGE_KEYS.tierAMax] = val;
    await chrome.storage.local.set({ [STORAGE_KEYS.tierAMax]: val });
  }

  async function setTierBMax(val) {
    _cache[STORAGE_KEYS.tierBMax] = val;
    await chrome.storage.local.set({ [STORAGE_KEYS.tierBMax]: val });
  }

  /** Wipe all settings back to defaults. */
  async function reset() {
    _cache = { ...DEFAULTS };
    await chrome.storage.local.set(DEFAULTS);
  }

  /** Export all settings as a plain JSON-serialisable object. */
  function exportAll() {
    return JSON.parse(JSON.stringify(_cache));
  }

  /** Import settings from a previously exported object. */
  async function importAll(data) {
    const merged = { ...DEFAULTS, ...data };
    _cache = merged;
    await chrome.storage.local.set(merged);
  }

  return {
    KEYS: STORAGE_KEYS,
    init,
    get settings() { return _cache ?? {}; },
    // getters
    getHiddenDeals, getExcludeWords, getExcludeMerchants, getBlockedUsers,
    getWhitelistWords, getHideColdDeals, getMaxPrice, getMinDiscount,
    getHideOwnColdVotes, getHideMerchantNames, getDebugEnabled,
    getTierEnabled, getTierAMax, getTierBMax,
    // mutators
    hideDeals, unhideDeal,
    setExcludeWords, setExcludeMerchants, addExcludeMerchant, removeExcludeMerchant,
    setBlockedUsers, setWhitelistWords, setHideColdDeals, setMaxPrice,
    setMinDiscount, setHideOwnColdVotes, setHideMerchantNames, setDebugEnabled,
    setTierEnabled, setTierAMax, setTierBMax,
    reset, exportAll, importAll,
  };
})();

if (typeof module !== 'undefined') module.exports = { SettingsStore, STORAGE_KEYS };
