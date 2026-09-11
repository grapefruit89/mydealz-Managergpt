/**
 * tests/settings-store.test.js
 * SettingsStore + MdmSchema (SSOT) mit gemocktem chrome.storage.local.
 * Run: node tests/settings-store.test.js
 */

const { loadBundle, assert, src } = require('./harness.js');

const store = {}; // simuliert chrome.storage.local

const { StorageApi, SettingsStore, MdmSchema } = loadBundle([
  src('core', 'settings-schema.js'),
  src('core', 'storage.js'),
  src('core', 'settings-store.js'),
], {
  expose: ['StorageApi', 'SettingsStore', 'MdmSchema'],
  setup() {
    global.chrome = {
      storage: {
        local: {
          async get(defaults) {
            const out = {};
            for (const [k, d] of Object.entries(defaults)) out[k] = (k in store) ? store[k] : d;
            return out;
          },
          async set(obj) { Object.assign(store, obj); },
          async remove(keys) { for (const k of [].concat(keys)) delete store[k]; },
          async clear() { for (const k of Object.keys(store)) delete store[k]; },
        },
      },
    };
  },
});

(async () => {
  console.log('settings-store.test.js — Schema + Store');

  await SettingsStore.init();
  assert(SettingsStore.getTierAMax() === 100, 'Default tierAMax = 100 nach init');
  assert((await StorageApi.get('mdm_schemaVersion')) === 1, 'Migration schrieb schemaVersion=1');

  await SettingsStore.setMaxPrice(50);
  assert(SettingsStore.getMaxPrice() === 50, 'setMaxPrice(50) → getMaxPrice() = 50');
  assert((await StorageApi.get('mdm_maxPrice')) === 50, 'setMaxPrice persistiert über StorageApi');

  await SettingsStore.hideDeals('123');
  assert(SettingsStore.getHiddenDeals()['123'] === true, 'hideDeals(123) cached + persistiert');

  await SettingsStore.addExcludeMerchant('42', 'Amazon');
  assert(SettingsStore.getExcludeMerchants()['42'].name === 'Amazon', 'addExcludeMerchant');

  // Reset-Nutzerdatenschutz: hiddenDeals + schemaVersion überleben
  await SettingsStore.reset();
  assert(SettingsStore.getMaxPrice() === null, 'reset() stellt maxPrice=null wieder her');

  await SettingsStore.hideDeals('999');
  assert((await StorageApi.get('mdm_schemaVersion')) === 1, 'schemaVersion=1 vor reset');
  await SettingsStore.reset();
  assert(SettingsStore.getHiddenDeals()['999'] === true, 'reset() erhält manuell ausgeblendete Deals');
  assert((await StorageApi.get('mdm_schemaVersion')) === 1, 'reset() setzt schemaVersion NICHT auf 0');

  // Schema-Konsistenz
  const names = new Set(MdmSchema.ENTRIES.map(d => d.name));
  assert(names.size === MdmSchema.ENTRIES.length, 'Schema: Namen eindeutig');
  assert(Object.keys(MdmSchema.DEFAULTS).length === MdmSchema.ENTRIES.length, 'Schema: DEFAULTS vollständig');
  for (const def of MdmSchema.ENTRIES) {
    assert(def.key === 'mdm_' + def.name, `Schema-Key-Muster: ${def.key}`);
  }
  // Kein Duplikat der KEYS/DEFAULTS in popup.js (SSOT-Regel)
  const fs = require('fs');
  const popup = fs.readFileSync(require('path').join(__dirname, '..', 'popup', 'popup.js'), 'utf8');
  assert(!/const KEYS = \{/.test(popup), 'popup.js leitet KEYS aus MdmSchema ab (kein Duplikat)');
  assert(/MdmSchema\.KEYS/.test(popup), 'popup.js referenziert MdmSchema.KEYS');

  assert(typeof SettingsStore.settings === 'object', 'settings-Getter liefert Cache-Objekt');

  console.log('settings-store.test.js PASSED');
})().catch(e => { console.error(e.message); process.exit(1); });
