/**
 * settings-store.js
 * Loads and saves all filter settings via the StorageApi wrapper (storage.js).
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

// Aktuelle Schema-Version — single source of truth ist settings-schema.js
const MDM_SCHEMA_VERSION = MdmSchema.version;

// Keys + Defaults kommen aus dem Schema (eine Quelle, keine Duplikate)
const STORAGE_KEYS = MdmSchema.KEYS;

const DEFAULTS = MdmSchema.DEFAULTS;

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

    await StorageApi.setMany(updates);

    if (typeof Logger !== 'undefined') {
      Logger.info('SettingsStore', `Schema migriert: v${storedVersion} → v${MDM_SCHEMA_VERSION}`);
    }
  }

  /** Load all settings from storage into the in-memory cache. */
  async function init() {
    const raw = await StorageApi.getWithDefaults(DEFAULTS);
    _cache = raw;
    await _migrate();
    return _cache;
  }

  // NOTE: `settings` ist ein Getter auf dem Rückgabeobjekt unten
  // (`get settings() { return _cache ?? {}; }`). Diese Convenience-Getter
  // greifen über _requireCache() zu und werfen bewusst, wenn init() noch
  // nicht gelaufen ist.
  // ── Convenience getters (all synchronous after init) ──────────────────────

  function _requireCache() {
    if (!_cache) throw new Error('[MDM] SettingsStore not initialised – call await SettingsStore.init() first');
    return _cache;
  }

  function getHiddenDeals()         { return _requireCache()[STORAGE_KEYS.hiddenDeals]; }
  function getExcludeWords()        { return _requireCache()[STORAGE_KEYS.excludeWords]; }
  function getExcludeMerchants()    { return _requireCache()[STORAGE_KEYS.excludeMerchantsData]; }
  function getBlockedUsers()        { return _requireCache()[STORAGE_KEYS.blockedUsers]; }
  function getWhitelistWords()      { return _requireCache()[STORAGE_KEYS.whitelistWords]; }
  function getHideColdDeals()       { return _requireCache()[STORAGE_KEYS.hideColdDeals]; }
  function getMaxPrice()            { return _requireCache()[STORAGE_KEYS.maxPrice]; }
  function getMinDiscount()         { return _requireCache()[STORAGE_KEYS.minDiscount]; }
  function getHideOwnColdVotes()    { return _requireCache()[STORAGE_KEYS.hideOwnColdVotes]; }
  function getHideMerchantNames()   { return _requireCache()[STORAGE_KEYS.hideMatchingMerchantNames]; }
  function getDebugEnabled()        { return _requireCache()[STORAGE_KEYS.debugEnabled]; }
  function getTierEnabled()         { return _requireCache()[STORAGE_KEYS.tierEnabled]; }
  function getTierAMax()            { return _requireCache()[STORAGE_KEYS.tierAMax]; }
  function getTierBMax()            { return _requireCache()[STORAGE_KEYS.tierBMax]; }

  // ── Mutators (persist to storage + update cache) ─────────────────────────

  async function hideDeals(dealId) {
    const map = { ..._cache[STORAGE_KEYS.hiddenDeals], [dealId]: true };
    _cache[STORAGE_KEYS.hiddenDeals] = map;
    await StorageApi.set(STORAGE_KEYS.hiddenDeals, map);
  }

  async function unhideDeal(dealId) {
    const map = { ..._cache[STORAGE_KEYS.hiddenDeals] };
    delete map[dealId];
    _cache[STORAGE_KEYS.hiddenDeals] = map;
    await StorageApi.set(STORAGE_KEYS.hiddenDeals, map);
  }

  async function setExcludeWords(words) {
    _cache[STORAGE_KEYS.excludeWords] = words;
    await StorageApi.set(STORAGE_KEYS.excludeWords, words);
  }

  async function setExcludeMerchants(merchantsObj) {
    _cache[STORAGE_KEYS.excludeMerchantsData] = merchantsObj;
    await StorageApi.set(STORAGE_KEYS.excludeMerchantsData, merchantsObj);
  }

  async function addExcludeMerchant(id, name) {
    const map = { ..._cache[STORAGE_KEYS.excludeMerchantsData], [id]: { id, name } };
    _cache[STORAGE_KEYS.excludeMerchantsData] = map;
    await StorageApi.set(STORAGE_KEYS.excludeMerchantsData, map);
  }

  async function removeExcludeMerchant(id) {
    const map = { ..._cache[STORAGE_KEYS.excludeMerchantsData] };
    delete map[id];
    _cache[STORAGE_KEYS.excludeMerchantsData] = map;
    await StorageApi.set(STORAGE_KEYS.excludeMerchantsData, map);
  }

  async function setBlockedUsers(users) {
    _cache[STORAGE_KEYS.blockedUsers] = users;
    await StorageApi.set(STORAGE_KEYS.blockedUsers, users);
  }

  async function setWhitelistWords(words) {
    _cache[STORAGE_KEYS.whitelistWords] = words;
    await StorageApi.set(STORAGE_KEYS.whitelistWords, words);
  }

  async function setHideColdDeals(val) {
    _cache[STORAGE_KEYS.hideColdDeals] = val;
    await StorageApi.set(STORAGE_KEYS.hideColdDeals, val);
  }

  async function setMaxPrice(val) {
    _cache[STORAGE_KEYS.maxPrice] = val;
    await StorageApi.set(STORAGE_KEYS.maxPrice, val);
  }

  async function setMinDiscount(val) {
    _cache[STORAGE_KEYS.minDiscount] = val;
    await StorageApi.set(STORAGE_KEYS.minDiscount, val);
  }

  async function setHideOwnColdVotes(val) {
    _cache[STORAGE_KEYS.hideOwnColdVotes] = val;
    await StorageApi.set(STORAGE_KEYS.hideOwnColdVotes, val);
  }

  async function setHideMerchantNames(val) {
    _cache[STORAGE_KEYS.hideMatchingMerchantNames] = val;
    await StorageApi.set(STORAGE_KEYS.hideMatchingMerchantNames, val);
  }

  async function setHideNsfw(val) {
    _cache[STORAGE_KEYS.hideNsfw] = val;
    await StorageApi.set(STORAGE_KEYS.hideNsfw, val);
  }

  async function setStripMerchantTitle(val) {
    _cache[STORAGE_KEYS.stripMerchantTitle] = val;
    await StorageApi.set(STORAGE_KEYS.stripMerchantTitle, val);
  }

  async function setRememberSort(val) {
    _cache[STORAGE_KEYS.rememberSort] = val;
    await StorageApi.set(STORAGE_KEYS.rememberSort, val);
  }

  /**
   * Sortier-Gedächtnis: Key "<pathname>|<selectName>" → gewählter Wert.
   * Wird von features/sort-memory.js geschrieben und beim Seitenbesuch gelesen.
   */
  async function setLastSort(key, value) {
    const map = { ..._cache[STORAGE_KEYS.lastSortState], [key]: value };
    _cache[STORAGE_KEYS.lastSortState] = map;
    await StorageApi.set(STORAGE_KEYS.lastSortState, map);
  }

  async function setDebugEnabled(val) {
    _cache[STORAGE_KEYS.debugEnabled] = val;
    await StorageApi.set(STORAGE_KEYS.debugEnabled, val);
  }

  async function setTierEnabled(val) {
    _cache[STORAGE_KEYS.tierEnabled] = val;
    await StorageApi.set(STORAGE_KEYS.tierEnabled, val);
  }

  async function setTierAMax(val) {
    _cache[STORAGE_KEYS.tierAMax] = val;
    await StorageApi.set(STORAGE_KEYS.tierAMax, val);
  }

  async function setTierBMax(val) {
    _cache[STORAGE_KEYS.tierBMax] = val;
    await StorageApi.set(STORAGE_KEYS.tierBMax, val);
  }

  /**
   * Wipe alle SETTINGS auf Defaults.
   *
   * Bewusst NICHT zurückgesetzt (Nutzer-Daten, identisch zum Popup-Verhalten):
   *   - hiddenDeals   — manuell ausgeblendete Deals des Users
   *   - schemaVersion — bleibt stehen, damit keine Re-Migration läuft
   */
  async function reset() {
    const keep = {};
    for (const def of MdmSchema.ENTRIES) {
      if (def.resetKeep && _cache?.[def.key] !== undefined) keep[def.key] = _cache[def.key];
    }
    _cache = { ...DEFAULTS, ...keep };
    await StorageApi.setMany(_cache);
  }

  /** Export all settings as a plain JSON-serialisable object. */
  function exportAll() {
    return JSON.parse(JSON.stringify(_cache));
  }

  /** Import settings from a previously exported object. */
  async function importAll(data) {
    const merged = { ...DEFAULTS, ...data };
    _cache = merged;
    await StorageApi.setMany(merged);
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
