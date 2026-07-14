/**
 * popup.js
 * Settings popup for the mydealz Manager extension.
 * Reads from and writes to chrome.storage.local directly.
 */

// Muss mit settings-store.js STORAGE_KEYS + DEFAULTS synchron bleiben!
const KEYS = {
  hiddenDeals:              'mdm_hiddenDeals',
  excludeWords:             'mdm_excludeWords',
  excludeMerchantsData:     'mdm_excludeMerchantsData',
  blockedUsers:             'mdm_blockedUsers',
  whitelistWords:           'mdm_whitelistWords',
  hideColdDeals:            'mdm_hideColdDeals',
  maxPrice:                 'mdm_maxPrice',
  minDiscount:              'mdm_minDiscount',
  hideOwnColdVotes:         'mdm_hideOwnColdVotes',
  hideMatchingMerchantNames:'mdm_hideMatchingMerchantNames',
  debugEnabled:             'mdm_debugEnabled',
  // Tier-System (UI im Page-Modal; hier nur für reset/export vollständig)
  tierEnabled:              'mdm_tierEnabled',
  tierAMax:                 'mdm_tierAMax',
  tierBMax:                 'mdm_tierBMax',
};

const DEFAULTS = {
  [KEYS.hiddenDeals]:               {},
  [KEYS.excludeWords]:              [],
  [KEYS.excludeMerchantsData]:      {},
  [KEYS.blockedUsers]:              [],
  [KEYS.whitelistWords]:            [],
  [KEYS.hideColdDeals]:             false,
  [KEYS.maxPrice]:                  null,
  [KEYS.minDiscount]:               null,
  [KEYS.hideOwnColdVotes]:          false,
  [KEYS.hideMatchingMerchantNames]: false,
  [KEYS.debugEnabled]:              false,
  [KEYS.tierEnabled]:               false,
  [KEYS.tierAMax]:                  100,
  [KEYS.tierBMax]:                  600,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitCSV(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function joinCSV(arr) {
  return (arr ?? []).join(', ');
}

// ── Merchant tag rendering ────────────────────────────────────────────────────

function renderMerchantTags(merchants) {
  const container = document.getElementById('merchant-tags');
  const noMsg     = document.getElementById('no-merchants');
  container.innerHTML = '';

  const entries = Object.values(merchants ?? {});
  noMsg.style.display = entries.length ? 'none' : 'block';

  for (const m of entries) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.dataset.id = m.id;
    tag.innerHTML = `${esc(m.name || m.id)} <span class="x">✕</span>`;
    tag.querySelector('.x').addEventListener('click', async () => {
      const raw = await chrome.storage.local.get({ [KEYS.excludeMerchantsData]: {} });
      const map = { ...raw[KEYS.excludeMerchantsData] };
      delete map[m.id];
      await chrome.storage.local.set({ [KEYS.excludeMerchantsData]: map });
      tag.remove();
      if (!container.querySelectorAll('.tag').length) {
        noMsg.style.display = 'block';
      }
      triggerReprocess();
    });
    container.appendChild(tag);
  }
}

function esc(str) {
  return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
  const s = await chrome.storage.local.get(DEFAULTS);

  // Stats
  document.getElementById('stat-hidden').textContent    = Object.keys(s[KEYS.hiddenDeals] ?? {}).length;
  document.getElementById('stat-merchants').textContent = Object.keys(s[KEYS.excludeMerchantsData] ?? {}).length;
  document.getElementById('stat-words').textContent     = (s[KEYS.excludeWords] ?? []).length;

  // Fields
  document.getElementById('exclude-words').value   = joinCSV(s[KEYS.excludeWords]);
  document.getElementById('whitelist-words').value = joinCSV(s[KEYS.whitelistWords]);
  document.getElementById('blocked-users').value   = joinCSV(s[KEYS.blockedUsers]);
  document.getElementById('max-price').value        = s[KEYS.maxPrice] ?? '';
  document.getElementById('min-discount').value     = s[KEYS.minDiscount] ?? '';
  document.getElementById('hide-cold').checked      = !!s[KEYS.hideColdDeals];
  document.getElementById('hide-own-cold').checked  = !!s[KEYS.hideOwnColdVotes];
  document.getElementById('hide-merchant-names').checked = !!s[KEYS.hideMatchingMerchantNames];
  document.getElementById('debug-mode').checked     = !!s[KEYS.debugEnabled];

  renderMerchantTags(s[KEYS.excludeMerchantsData]);
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function save() {
  const maxPriceRaw = document.getElementById('max-price').value;
  const maxPrice    = maxPriceRaw !== '' ? parseFloat(maxPriceRaw) : null;

  const minDiscountRaw = document.getElementById('min-discount').value;
  const minDiscount    = minDiscountRaw !== '' ? parseFloat(minDiscountRaw) : null;

  const patch = {
    [KEYS.excludeWords]:              splitCSV(document.getElementById('exclude-words').value),
    [KEYS.whitelistWords]:            splitCSV(document.getElementById('whitelist-words').value),
    [KEYS.blockedUsers]:              splitCSV(document.getElementById('blocked-users').value),
    [KEYS.maxPrice]:                  isNaN(maxPrice) ? null : maxPrice,
    [KEYS.minDiscount]:               isNaN(minDiscount) ? null : minDiscount,
    [KEYS.hideColdDeals]:             document.getElementById('hide-cold').checked,
    [KEYS.hideOwnColdVotes]:          document.getElementById('hide-own-cold').checked,
    [KEYS.hideMatchingMerchantNames]: document.getElementById('hide-merchant-names').checked,
    [KEYS.debugEnabled]:              document.getElementById('debug-mode').checked,
  };

  await chrome.storage.local.set(patch);
  showSaved();
  triggerReprocess();
}

// ── Reset ─────────────────────────────────────────────────────────────────────

async function reset() {
  if (!confirm('Alle Einstellungen zurücksetzen?\n(Ausgeblendete Deals bleiben erhalten)')) return;
  const keep = await chrome.storage.local.get({ [KEYS.hiddenDeals]: {} });
  await chrome.storage.local.set({ ...DEFAULTS, [KEYS.hiddenDeals]: keep[KEYS.hiddenDeals] });
  load();
  triggerReprocess();
}

// ── Export ────────────────────────────────────────────────────────────────────

async function exportSettings() {
  const s = await chrome.storage.local.get(DEFAULTS);
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mydealz-manager-settings-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showSaved() {
  const msg = document.getElementById('saved-msg');
  msg.style.display = 'block';
  setTimeout(() => { msg.style.display = 'none'; }, 1500);
}

function triggerReprocess() {
  // Relay via background.js → alle offenen mydealz-Tabs (nicht nur den aktiven)
  chrome.runtime.sendMessage({ type: 'MDM_REPROCESS' }).catch(() => {});
}

// ── Wire up ───────────────────────────────────────────────────────────────────

document.getElementById('btn-save').addEventListener('click', save);
document.getElementById('btn-reset').addEventListener('click', reset);
document.getElementById('btn-export').addEventListener('click', exportSettings);

load();
