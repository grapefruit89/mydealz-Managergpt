/**
 * @file src/parts/10-main.js
 * @description Hauptlogik des Userscripts (Config, Storage, Filterengine, UI, Observer, Bootstrap).
 * @entrypoint MyDealzManagerApp.start()
 */

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // 1) Konfiguration & Konstanten
  // ---------------------------------------------------------------------------
  const CONFIG = {
    selectors: {
      deal: "article.thread--deal, article.thread--voucher",
      title: ".thread-title",
      titleAnchor: ".thread-title a",
      merchantLink: 'a[data-t="merchantLink"], a[href*="merchant-id="]',
      username: '.threadMetaAuthor a, [data-t="usernameLink"]',
      priceCandidates: [
        ".thread-price",
        ".threadItemCard-price",
        ".cept-price",
        '[class*="price"]',
      ],
      temperatureCandidates: [
        ".cept-vote-temp .overflow--wrap-off",
        ".cept-vote-temp",
        '[class*="temperature"]',
      ],
      actionArea: ".cept-threadActions, .thread-item__actions, .thread-footer",
      subNavFilter: ".subNavMenu-list",
    },
    storageKeys: {
      hiddenDeals: "hiddenDeals",
      excludeWords: "excludeWords",
      excludeMerchantsData: "excludeMerchantsData",
      blockedUsers: "blockedUsers",
      whitelistWords: "whitelistWords",
      hideColdDeals: "hideColdDeals",
      maxPrice: "maxPrice",
      hideMatchingMerchantNames: "hideMatchingMerchantNames",
      debugEnabled: "debugEnabled",
    },
    css: {
      modalZIndex: 2147483640,
      buttonClass: "mdm-hide-btn",
      settingsClass: "mdm-settings-btn",
      hiddenByScriptClass: "mdm-hidden",
    },
    observerDebounceMs: 120,
  };

  // ---------------------------------------------------------------------------
  // 2) Hilfsfunktionen (Utilities)
  // ---------------------------------------------------------------------------
  class Logger {
    constructor(enabled = false) {
      this.enabled = Boolean(enabled);
      this.prefix = "[mydealz-manager]";
    }

    debug(...args) {
      if (this.enabled) console.debug(this.prefix, ...args);
    }

    info(...args) {
      console.info(this.prefix, ...args);
    }

    warn(...args) {
      console.warn(this.prefix, ...args);
    }

    error(...args) {
      console.error(this.prefix, ...args);
    }
  }

  const Utils = {
    debounce(fn, wait) {
      let timerId;
      return (...args) => {
        clearTimeout(timerId);
        timerId = window.setTimeout(() => fn(...args), wait);
      };
    },

    escapeRegExp(value) {
      return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    },

    normalizeText(value) {
      return (value ?? "")
        .toString()
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    },

    toStringArray(value) {
      if (!Array.isArray(value)) return [];
      return value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean);
    },

    parseNumber(text) {
      if (!text) return null;
      const normalized = text
        .replace(/\u00a0/g, " ")
        .replace(/[^\d.,-]/g, "")
        .replace(/\.(?=.*\.)/g, "")
        .replace(",", ".");
      const parsed = Number.parseFloat(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    },

    wildcardToRegex(pattern) {
      const escaped = pattern
        .split("*")
        .map((part) => Utils.escapeRegExp(part))
        .join(".*");
      return new RegExp(escaped, "i");
    },

    parseFilterExpression(rawFilter) {
      const expression = Utils.normalizeText(rawFilter);
      if (!expression) return null;

      const sanitizeToken = (token) => {
        const normalized = Utils.normalizeText(token).replace(/\s+/g, " ").trim();
        if (!normalized) return null;
        // Verhindert, dass reine Wildcards wie "*" oder "***" alles matchen
        if (normalized.replace(/\*/g, "").trim().length === 0) return null;
        return normalized;
      };

      const negativeParts = expression
        .split(/\s+-/)
        .map((part) => part.trim())
        .filter(Boolean);

      const includeRaw = negativeParts.shift() ?? "";
      const exclude = negativeParts
        .map((part) => part.replace(/^-/, "").trim())
        .map(sanitizeToken)
        .filter(Boolean);
      const include = includeRaw
        .split(/\s*\+\s*/)
        .map(sanitizeToken)
        .filter(Boolean);

      // Ungültiger Filterausdruck => ignorieren statt broad match
      if (include.length === 0) return null;

      return {
        raw: expression,
        include,
        exclude,
        includeRegex: include.map((token) => Utils.wildcardToRegex(token)),
        excludeRegex: exclude.map((token) => Utils.wildcardToRegex(token)),
      };
    },
  };

  // ---------------------------------------------------------------------------
  // 3) API-Interaktionen (GM_*)
  // ---------------------------------------------------------------------------
  class StorageApi {
    constructor(logger) {
      this.logger = logger;
    }

    get(key, fallback) {
      try {
        return GM_getValue(key, fallback);
      } catch (error) {
        this.logger.error(`Fehler beim Lesen von ${key}`, error);
        return fallback;
      }
    }

    set(key, value) {
      try {
        GM_setValue(key, value);
      } catch (error) {
        this.logger.error(`Fehler beim Schreiben von ${key}`, error);
      }
    }

    remove(key) {
      try {
        GM_deleteValue(key);
      } catch (error) {
        this.logger.error(`Fehler beim Löschen von ${key}`, error);
      }
    }
  }

  class SettingsStore {
    constructor(storageApi) {
      this.storageApi = storageApi;
      this.settings = this.load();
    }

    load() {
      const hideColdDeals = Boolean(this.storageApi.get(CONFIG.storageKeys.hideColdDeals, false));
      const maxPrice = Number(this.storageApi.get(CONFIG.storageKeys.maxPrice, 0)) || 0;
      const debugEnabled = Boolean(this.storageApi.get(CONFIG.storageKeys.debugEnabled, false));
      const hideMatchingMerchantNames = Boolean(
        this.storageApi.get(CONFIG.storageKeys.hideMatchingMerchantNames, false)
      );

      const excludeWords = Utils.toStringArray(this.storageApi.get(CONFIG.storageKeys.excludeWords, []));
      const whitelistWords = Utils.toStringArray(this.storageApi.get(CONFIG.storageKeys.whitelistWords, []));
      const blockedUsers = Utils.toStringArray(this.storageApi.get(CONFIG.storageKeys.blockedUsers, []));

      const rawMerchants = this.storageApi.get(CONFIG.storageKeys.excludeMerchantsData, []);
      const excludeMerchantsData = Array.isArray(rawMerchants)
        ? rawMerchants
            .filter((entry) => entry && typeof entry.id !== "undefined")
            .map((entry) => ({
              id: String(entry.id).trim(),
              name: String(entry.name ?? entry.id).trim(),
            }))
            .filter((entry) => entry.id)
        : [];

      const hiddenDeals = Utils.toStringArray(this.storageApi.get(CONFIG.storageKeys.hiddenDeals, []));

      return {
        hideColdDeals,
        maxPrice,
        debugEnabled,
        hideMatchingMerchantNames,
        excludeWords,
        whitelistWords,
        blockedUsers,
        excludeMerchantsData,
        hiddenDeals,
      };
    }

    save() {
      const s = this.settings;
      this.storageApi.set(CONFIG.storageKeys.hideColdDeals, s.hideColdDeals);
      this.storageApi.set(CONFIG.storageKeys.maxPrice, s.maxPrice);
      this.storageApi.set(CONFIG.storageKeys.debugEnabled, s.debugEnabled);
      this.storageApi.set(CONFIG.storageKeys.hideMatchingMerchantNames, s.hideMatchingMerchantNames);
      this.storageApi.set(CONFIG.storageKeys.excludeWords, s.excludeWords);
      this.storageApi.set(CONFIG.storageKeys.whitelistWords, s.whitelistWords);
      this.storageApi.set(CONFIG.storageKeys.blockedUsers, s.blockedUsers);
      this.storageApi.set(CONFIG.storageKeys.excludeMerchantsData, s.excludeMerchantsData);
      this.storageApi.set(CONFIG.storageKeys.hiddenDeals, s.hiddenDeals);
    }
  }

  // ---------------------------------------------------------------------------
  // 4) Kern-Logik & Event-Handler
  // ---------------------------------------------------------------------------
  class DealFilterEngine {
    constructor(settingsStore, logger) {
      this.settingsStore = settingsStore;
      this.logger = logger;
      this.compiledWordFilters = [];
      this.compiledWhitelistFilters = [];
      this.refreshCompiledFilters();
    }

    refreshCompiledFilters() {
      const { excludeWords, whitelistWords } = this.settingsStore.settings;
      this.compiledWordFilters = excludeWords
        .map((entry) => Utils.parseFilterExpression(entry))
        .filter(Boolean);
      this.compiledWhitelistFilters = whitelistWords
        .map((entry) => Utils.parseFilterExpression(entry))
        .filter(Boolean);
    }

    evaluate(dealData) {
      const settings = this.settingsStore.settings;
      const normalizedTitle = Utils.normalizeText(dealData.displayTitle || dealData.title);
      const normalizedUser = Utils.normalizeText(dealData.username);

      if (settings.hiddenDeals.includes(dealData.id)) {
        return { hide: true, reason: "manuell ausgeblendet" };
      }

      if (settings.hideColdDeals && Number.isFinite(dealData.temperature) && dealData.temperature < 0) {
        return { hide: true, reason: "kalter Deal" };
      }

      if (settings.maxPrice > 0 && Number.isFinite(dealData.price) && dealData.price > settings.maxPrice) {
        return { hide: true, reason: `Preis > ${settings.maxPrice}` };
      }

      if (normalizedUser && settings.blockedUsers.includes(normalizedUser)) {
        return { hide: true, reason: "blockierter Nutzer" };
      }

      const merchantBlocked =
        dealData.merchantId &&
        settings.excludeMerchantsData.some((merchant) => merchant.id === String(dealData.merchantId));
      if (merchantBlocked) {
        return { hide: true, reason: "Händler blockiert" };
      }

      if (this.matchesAnyFilter(this.compiledWhitelistFilters, normalizedTitle)) {
        return { hide: false, reason: "Whitelist" };
      }

      if (this.matchesAnyFilter(this.compiledWordFilters, normalizedTitle)) {
        return { hide: true, reason: "Wortfilter" };
      }

      return { hide: false, reason: "sichtbar" };
    }

    matchesAnyFilter(filters, normalizedTitle) {
      return filters.some((filter) => {
        const includesAll = filter.includeRegex.every((regex) => regex.test(normalizedTitle));
        if (!includesAll) return false;
        const excludesMatch = filter.excludeRegex.some((regex) => regex.test(normalizedTitle));
        return !excludesMatch;
      });
    }
  }

  class DealParser {
    static extractDealId(article) {
      return (
        article.getAttribute("id") ||
        article.dataset.threadId ||
        article.querySelector('a[href*="/deals/"]')?.getAttribute("href") ||
        `deal-${Math.random().toString(36).slice(2)}`
      );
    }

    static extractMerchantData(article) {
      const merchantLink = article.querySelector(CONFIG.selectors.merchantLink);
      const merchantName = merchantLink?.textContent?.trim() ?? "";
      const href = merchantLink?.getAttribute("href") ?? "";
      const merchantId = href.match(/merchant-id=(\d+)/)?.[1] ?? "";
      return { merchantId, merchantName };
    }

    static extractPrice(article) {
      for (const selector of CONFIG.selectors.priceCandidates) {
        const node = article.querySelector(selector);
        const parsed = Utils.parseNumber(node?.textContent ?? "");
        if (parsed !== null) return parsed;
      }
      return null;
    }

    static extractTemperature(article) {
      for (const selector of CONFIG.selectors.temperatureCandidates) {
        const node = article.querySelector(selector);
        const parsed = Utils.parseNumber(node?.textContent ?? "");
        if (parsed !== null) return parsed;
      }
      return null;
    }

    static extractUsername(article) {
      return article.querySelector(CONFIG.selectors.username)?.textContent?.trim() ?? "";
    }

    static extractTitle(article) {
      const titleNode = article.querySelector(CONFIG.selectors.titleAnchor);
      return titleNode?.getAttribute("title") || titleNode?.textContent || article.querySelector(CONFIG.selectors.title)?.textContent || "";
    }
  }

  // ---------------------------------------------------------------------------
  // 5) UI-Komponenten & CSS-Injektion
  // ---------------------------------------------------------------------------
  class UiController {
    constructor(app, logger) {
      this.app = app;
      this.logger = logger;
      this.modal = null;
      this.modalCleanupFns = [];
      this.installBaseStyles();
    }

    installBaseStyles() {
      const cssText = `
        .${CONFIG.css.hiddenByScriptClass} { display: none !important; }
        .${CONFIG.css.buttonClass}, .${CONFIG.css.settingsClass} {
          border: 1px solid rgba(128, 128, 128, .5);
          background: rgba(255,255,255,.92);
          color: #1f1f1f;
          border-radius: 4px;
          cursor: pointer;
          width: 22px;
          height: 22px;
          font-size: 13px;
          margin-left: 6px;
        }
        .mdm-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.45);
          z-index: ${CONFIG.css.modalZIndex}; display: grid; place-items: center;
        }
        .mdm-modal {
          width: min(820px, 95vw); max-height: 90vh; overflow: auto;
          background: #fff; color: #222; border-radius: 8px; padding: 16px;
        }
        .mdm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .mdm-grid label { display: block; font-weight: 600; margin-bottom: 4px; }
        .mdm-grid textarea, .mdm-grid input[type="text"], .mdm-grid input[type="number"] {
          width: 100%; min-height: 40px; padding: 8px; box-sizing: border-box;
        }
      `;

      if (typeof GM_addStyle === "function") {
        GM_addStyle(cssText);
      } else {
        const style = document.createElement("style");
        style.textContent = cssText;
        document.head.append(style);
      }
    }

    attachDealButtons(article, dealId) {
      if (article.querySelector(`.${CONFIG.css.buttonClass}`)) return;

      const actionArea = article.querySelector(CONFIG.selectors.actionArea) || article.querySelector(CONFIG.selectors.title);
      if (!actionArea) return;

      const hideButton = document.createElement("button");
      hideButton.className = CONFIG.css.buttonClass;
      hideButton.type = "button";
      hideButton.title = "Deal ausblenden";
      hideButton.textContent = "✕";
      hideButton.addEventListener(
        "click",
        () => {
          this.app.hideDealById(dealId);
          this.app.processDeals();
        }
      );

      const settingsButton = document.createElement("button");
      settingsButton.className = CONFIG.css.settingsClass;
      settingsButton.type = "button";
      settingsButton.title = "Filter-Einstellungen";
      settingsButton.textContent = "⚙";
      settingsButton.addEventListener("click", () => this.openSettings());

      actionArea.append(hideButton, settingsButton);
    }

    openSettings() {
      this.closeSettings();
      const s = this.app.settingsStore.settings;
      const overlay = document.createElement("div");
      overlay.className = "mdm-modal-overlay";

      overlay.innerHTML = `
        <div class="mdm-modal" role="dialog" aria-modal="true">
          <h3>mydealz Manager – Einstellungen</h3>
          <div class="mdm-grid">
            <div>
              <label>Wortfilter (pro Zeile, unterstützt *, + und -)</label>
              <textarea id="mdm-exclude-words"></textarea>
            </div>
            <div>
              <label>Whitelist-Wörter (pro Zeile)</label>
              <textarea id="mdm-whitelist-words"></textarea>
            </div>
            <div>
              <label>Händler (pro Zeile: ID|Name)</label>
              <textarea id="mdm-merchant-list"></textarea>
            </div>
            <div>
              <label>Blockierte Nutzer (pro Zeile)</label>
              <textarea id="mdm-user-list"></textarea>
            </div>
            <div>
              <label>Maximalpreis (€)</label>
              <input id="mdm-max-price" type="number" min="0" step="0.01">
            </div>
            <div>
              <label><input id="mdm-hide-cold" type="checkbox"> Kalte Deals (< 0°) ausblenden</label>
              <label><input id="mdm-hide-merchant-in-title" type="checkbox"> Händlernamen im Titel entfernen</label>
              <label><input id="mdm-debug" type="checkbox"> Debug-Logging aktivieren</label>
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
            <button id="mdm-save">Speichern</button>
            <button id="mdm-export">Backup exportieren</button>
            <button id="mdm-import">Backup importieren</button>
            <button id="mdm-reset-hidden">Manuell ausgeblendete Deals zurücksetzen</button>
            <button id="mdm-close">Schließen</button>
          </div>
          <input id="mdm-import-file" type="file" accept="application/json" style="display:none;">
        </div>
      `;

      // Sichere Wertzuweisung (keine Interpolation in innerHTML)
      overlay.querySelector("#mdm-exclude-words").value = s.excludeWords.join("\n");
      overlay.querySelector("#mdm-whitelist-words").value = s.whitelistWords.join("\n");
      overlay.querySelector("#mdm-merchant-list").value = s.excludeMerchantsData
        .map((m) => `${m.id}|${m.name}`)
        .join("\n");
      overlay.querySelector("#mdm-user-list").value = s.blockedUsers.join("\n");
      overlay.querySelector("#mdm-max-price").value = s.maxPrice || "";
      overlay.querySelector("#mdm-hide-cold").checked = Boolean(s.hideColdDeals);
      overlay.querySelector("#mdm-hide-merchant-in-title").checked = Boolean(s.hideMatchingMerchantNames);
      overlay.querySelector("#mdm-debug").checked = Boolean(s.debugEnabled);

      const bind = (element, eventName, handler) => {
        if (!element) return;
        element.addEventListener(eventName, handler);
        this.modalCleanupFns.push(() => element.removeEventListener(eventName, handler));
      };

      bind(overlay, "click", (event) => {
        if (event.target === overlay) this.closeSettings();
      });

      bind(overlay.querySelector("#mdm-close"), "click", () => this.closeSettings());
      bind(overlay.querySelector("#mdm-save"), "click", () => this.saveFromSettings());
      bind(overlay.querySelector("#mdm-export"), "click", () => this.exportSettings());
      bind(overlay.querySelector("#mdm-import"), "click", () => {
        overlay.querySelector("#mdm-import-file")?.click();
      });
      bind(overlay.querySelector("#mdm-reset-hidden"), "click", () => {
        this.app.settingsStore.settings.hiddenDeals = [];
        this.app.settingsStore.save();
        this.app.processDeals();
      });

      bind(overlay.querySelector("#mdm-import-file"), "change", async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await this.importSettings(file);
      });

      document.body.append(overlay);
      this.modal = overlay;
    }

    closeSettings() {
      this.modalCleanupFns.forEach((cleanup) => cleanup());
      this.modalCleanupFns = [];
      if (this.modal?.isConnected) this.modal.remove();
      this.modal = null;
    }

    saveFromSettings() {
      if (!this.modal) return;

      const readList = (selector) =>
        this.modal
          .querySelector(selector)
          ?.value.split("\n")
          .map((line) => line.trim())
          .filter(Boolean) ?? [];

      const merchantLines = readList("#mdm-merchant-list");
      const merchants = merchantLines.map((line) => {
        const [id, name] = line.split("|");
        return { id: String(id ?? "").trim(), name: String(name ?? id ?? "").trim() };
      }).filter((entry) => entry.id);

      const settings = this.app.settingsStore.settings;
      settings.excludeWords = readList("#mdm-exclude-words");
      settings.whitelistWords = readList("#mdm-whitelist-words");
      settings.excludeMerchantsData = merchants;
      settings.blockedUsers = readList("#mdm-user-list").map((name) => Utils.normalizeText(name));
      settings.maxPrice = Number(this.modal.querySelector("#mdm-max-price")?.value) || 0;
      settings.hideColdDeals = Boolean(this.modal.querySelector("#mdm-hide-cold")?.checked);
      settings.hideMatchingMerchantNames = Boolean(
        this.modal.querySelector("#mdm-hide-merchant-in-title")?.checked
      );
      settings.debugEnabled = Boolean(this.modal.querySelector("#mdm-debug")?.checked);

      this.app.settingsStore.save();
      this.app.logger.enabled = settings.debugEnabled;
      this.app.filterEngine.refreshCompiledFilters();
      this.app.processDeals();
      this.logger.info("Einstellungen gespeichert.");
      this.closeSettings();
    }

    exportSettings() {
      const data = JSON.stringify(this.app.settingsStore.settings, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mydealz-manager-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    async importSettings(file) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        this.app.settingsStore.settings = {
          ...this.app.settingsStore.settings,
          ...parsed,
        };
        this.app.settingsStore.save();
        this.app.filterEngine.refreshCompiledFilters();
        this.app.processDeals();
        this.closeSettings();
      } catch (error) {
        this.logger.error("Backup konnte nicht importiert werden", error);
      }
    }

    destroy() {
      this.closeSettings();
    }
  }

  class MyDealzManagerApp {
    constructor() {
      this.logger = new Logger(Boolean(GM_getValue(CONFIG.storageKeys.debugEnabled, false)));
      this.storageApi = new StorageApi(this.logger);
      this.settingsStore = new SettingsStore(this.storageApi);
      this.filterEngine = new DealFilterEngine(this.settingsStore, this.logger);
      this.ui = new UiController(this, this.logger);
      this.dealCache = new WeakMap();
      this.observer = null;
      this.menuCommandId = null;
      this.boundProcessDeals = Utils.debounce(() => this.processDeals(), CONFIG.observerDebounceMs);
    }

    start() {
      this.registerMenuCommand();
      this.installMutationObserver();
      this.injectMaxPriceIntoNativeFilterMenu();
      this.processDeals();
      this.logger.info("Initialisierung abgeschlossen");
    }

    registerMenuCommand() {
      if (typeof GM_registerMenuCommand !== "function") return;
      this.menuCommandId = GM_registerMenuCommand("mydealz Manager öffnen", () => this.ui.openSettings());
    }

    installMutationObserver() {
      if (this.observer) this.observer.disconnect();

      this.observer = new MutationObserver((mutations) => {
        if (!mutations.length) return;
        this.boundProcessDeals();
        this.injectMaxPriceIntoNativeFilterMenu();
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    hideDealById(dealId) {
      const settings = this.settingsStore.settings;
      if (!settings.hiddenDeals.includes(dealId)) {
        settings.hiddenDeals.push(dealId);
        this.settingsStore.save();
      }
    }

    injectMaxPriceIntoNativeFilterMenu() {
      const menu = document.querySelector(CONFIG.selectors.subNavFilter);
      if (!menu || menu.querySelector("#mdm-inline-max-price")) return;

      const wrapper = document.createElement("li");
      wrapper.style.marginTop = "8px";
      wrapper.innerHTML = `
        <label style="display:flex;align-items:center;gap:6px;">
          Max. Preis:
          <input id="mdm-inline-max-price" type="number" min="0" step="0.01" style="width:90px;">
        </label>
      `;
      menu.append(wrapper);

      const input = wrapper.querySelector("#mdm-inline-max-price");
      input.value = this.settingsStore.settings.maxPrice || "";
      input.addEventListener("change", () => {
        this.settingsStore.settings.maxPrice = Number(input.value) || 0;
        this.settingsStore.save();
        this.processDeals();
      });
    }

    getDisplayTitle(article, baseTitle, merchantName) {
      const titleNode = article.querySelector(CONFIG.selectors.titleAnchor);
      if (!titleNode) return baseTitle;

      if (!titleNode.dataset.mdmOriginalTitle) {
        titleNode.dataset.mdmOriginalTitle = baseTitle;
      }

      const original = titleNode.dataset.mdmOriginalTitle;
      if (!this.settingsStore.settings.hideMatchingMerchantNames || !merchantName) {
        titleNode.textContent = original;
        return original;
      }

      const merchantPattern = new RegExp(`\\b${Utils.escapeRegExp(merchantName)}\\b`, "ig");
      const cleaned = original.replace(merchantPattern, "").replace(/\s{2,}/g, " ").trim();
      titleNode.textContent = cleaned || original;
      return cleaned || original;
    }

    processDeals() {
      const deals = document.querySelectorAll(CONFIG.selectors.deal);
      const settingsSignature = JSON.stringify(this.settingsStore.settings);

      deals.forEach((article) => {
        try {
          const dealId = DealParser.extractDealId(article);
          const { merchantId, merchantName } = DealParser.extractMerchantData(article);
          const title = DealParser.extractTitle(article);
          const displayTitle = this.getDisplayTitle(article, title, merchantName);
          const price = DealParser.extractPrice(article);
          const temperature = DealParser.extractTemperature(article);
          const username = DealParser.extractUsername(article);

          const dealData = {
            id: dealId,
            title,
            displayTitle,
            merchantId,
            merchantName,
            price,
            temperature,
            username,
          };

          const previous = this.dealCache.get(article);
          const fingerprint = JSON.stringify({
            title: displayTitle,
            price,
            temperature,
            merchantId,
            username,
          });

          if (previous?.fingerprint === fingerprint && previous?.settingsVersion === settingsSignature) {
            this.ui.attachDealButtons(article, dealId);
            return;
          }

          const result = this.filterEngine.evaluate(dealData);
          article.classList.toggle(CONFIG.css.hiddenByScriptClass, result.hide);
          this.ui.attachDealButtons(article, dealId);
          this.dealCache.set(article, {
            fingerprint,
            settingsVersion: settingsSignature,
            result,
          });

          this.logger.debug(dealId, result.reason, dealData);
        } catch (error) {
          this.logger.error("Fehler beim Verarbeiten eines Deals", error);
        }
      });
    }

    destroy() {
      this.observer?.disconnect();
      if (this.menuCommandId && typeof GM_unregisterMenuCommand === "function") {
        GM_unregisterMenuCommand(this.menuCommandId);
      }
      this.ui.destroy();
    }
  }

  const app = new MyDealzManagerApp();
  app.start();

  window.addEventListener("beforeunload", () => app.destroy(), { once: true });
})();
