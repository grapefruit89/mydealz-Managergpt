/**
 * storage.js
 * Async chrome.storage.local wrapper.
 * Drop-in replacement for Tampermonkey's GM_getValue / GM_setValue / GM_deleteValue.
 *
 * All methods return Promises so callers must await them (or .then()).
 */

const StorageApi = (() => {
  /**
   * Read one or more keys from storage.
   * @param {string|string[]} keys
   * @param {*} [defaultValue]  – used when key is a single string
   * @returns {Promise<*>}
   */
  async function get(keys, defaultValue = null) {
    if (typeof keys === 'string') {
      const result = await chrome.storage.local.get({ [keys]: defaultValue });
      return result[keys];
    }
    // Array of keys – return plain object
    const defaults = Object.fromEntries(keys.map(k => [k, null]));
    return chrome.storage.local.get(defaults);
  }

  /**
   * Write one key-value pair.
   * @param {string} key
   * @param {*} value
   * @returns {Promise<void>}
   */
  async function set(key, value) {
    return chrome.storage.local.set({ [key]: value });
  }

  /**
   * Write multiple key-value pairs at once.
   * @param {Object} obj
   * @returns {Promise<void>}
   */
  async function setMany(obj) {
    return chrome.storage.local.set(obj);
  }

  /**
   * Delete one or more keys.
   * @param {string|string[]} keys
   * @returns {Promise<void>}
   */
  async function remove(keys) {
    return chrome.storage.local.remove(keys);
  }

  /**
   * Clear all extension storage (use with care).
   * @returns {Promise<void>}
   */
  async function clear() {
    return chrome.storage.local.clear();
  }

  return { get, set, setMany, remove, clear };
})();

// Make available as ES module export AND as plain global (for the bundled build)
if (typeof module !== 'undefined') module.exports = StorageApi;
