/**
 * popup.js
 * Settings popup for the mydealz Manager extension.
 *
 * Schlank gehalten: KEYS/DEFAULTS kommen aus MdmSchema (SSOT, siehe
 * src/core/settings-schema.js). Der Rest ist dünne chrome.storage-Glue-Logik —
 * UI-Bedienung (Schalter, Toast) läuft nativ über HTML/CSS (switch, popover).
 */

// Keys + Defaults aus dem Schema (single source of truth: src/core/settings-schema.js)
// popup.html lädt dist/settings-schema.js VOR diesem Script.
const KEYS = MdmSchema.KEYS;
const DEFAULTS = MdmSchema.DEFAULTS;

// ── Helpers ───────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function splitCSV(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function joinCSV(arr) {
  return (arr ?? []).join(', ');
}

/** Natives Popover-Toast (Top-Layer); Fallback für ältere Engines. */
function toast(msg) {
  const el = $('saved-msg');
  el.textContent = msg;
  if (typeof el.showPopover === 'function') {
    el.showPopover();
  } else {
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 1500);
  }
}

function triggerReprocess() {
  // Relay via background.js → alle offenen mydealz-Tabs (nicht nur den aktiven)
  chrome.runtime.sendMessage({ type: 'MDM_REPROCESS' }).catch(() => {});
}

// ── Merchant tag rendering ────────────────────────────────────────────────────

function renderMerchantTags(merchants) {
  const container = $('merchant-tags');
  const noMsg     = $('no-merchants');
  container.innerHTML = '';

  const entries = Object.values(merchants ?? {});
  noMsg.hidden = entries.length > 0;

  for (const m of entries) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.dataset.id = m.id;
    tag.textContent = m.name || m.id;
    const x = document.createElement('span');
    x.className = 'x';
    x.textContent = '✕';
    x.addEventListener('click', async () => {
      const raw = await chrome.storage.local.get({ [KEYS.excludeMerchantsData]: {} });
      const map = { ...raw[KEYS.excludeMerchantsData] };
      delete map[m.id];
      await chrome.storage.local.set({ [KEYS.excludeMerchantsData]: map });
      tag.remove();
      if (!container.querySelectorAll('.tag').length) noMsg.hidden = false;
      triggerReprocess();
    });
    tag.appendChild(x);
    container.appendChild(tag);
  }
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
  const s = await chrome.storage.local.get(DEFAULTS);

  $('stat-hidden').textContent    = Object.keys(s[KEYS.hiddenDeals] ?? {}).length;
  $('stat-merchants').textContent = Object.keys(s[KEYS.excludeMerchantsData] ?? {}).length;
  $('stat-words').textContent     = (s[KEYS.excludeWords] ?? []).length;

  $('exclude-words').value   = joinCSV(s[KEYS.excludeWords]);
  $('whitelist-words').value = joinCSV(s[KEYS.whitelistWords]);
  $('blocked-users').value   = joinCSV(s[KEYS.blockedUsers]);
  $('max-price').value       = s[KEYS.maxPrice] ?? '';
  $('min-discount').value    = s[KEYS.minDiscount] ?? '';
  $('hide-cold').checked            = !!s[KEYS.hideColdDeals];
  $('hide-own-cold').checked        = !!s[KEYS.hideOwnColdVotes];
  $('hide-merchant-names').checked  = !!s[KEYS.hideMatchingMerchantNames];
  $('hide-nsfw').checked            = !!s[KEYS.hideNsfw];
  $('strip-merchant-title').checked = !!s[KEYS.stripMerchantTitle];
  $('remember-sort').checked        = !!s[KEYS.rememberSort];
  $('debug-mode').checked           = !!s[KEYS.debugEnabled];

  renderMerchantTags(s[KEYS.excludeMerchantsData]);
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function save() {
  const maxPriceRaw  = $('max-price').value;
  const minDiscRaw   = $('min-discount').value;
  const maxPrice     = maxPriceRaw !== '' ? parseFloat(maxPriceRaw) : null;
  const minDiscount  = minDiscRaw !== '' ? parseFloat(minDiscRaw) : null;

  const patch = {
    [KEYS.excludeWords]:              splitCSV($('exclude-words').value),
    [KEYS.whitelistWords]:            splitCSV($('whitelist-words').value),
    [KEYS.blockedUsers]:              splitCSV($('blocked-users').value),
    [KEYS.maxPrice]:                  isNaN(maxPrice) ? null : maxPrice,
    [KEYS.minDiscount]:               isNaN(minDiscount) ? null : minDiscount,
    [KEYS.hideColdDeals]:             $('hide-cold').checked,
    [KEYS.hideOwnColdVotes]:          $('hide-own-cold').checked,
    [KEYS.hideMatchingMerchantNames]: $('hide-merchant-names').checked,
    [KEYS.hideNsfw]:                  $('hide-nsfw').checked,
    [KEYS.stripMerchantTitle]:        $('strip-merchant-title').checked,
    [KEYS.rememberSort]:              $('remember-sort').checked,
    [KEYS.debugEnabled]:              $('debug-mode').checked,
  };

  await chrome.storage.local.set(patch);
  toast('✓ Gespeichert!');
  triggerReprocess();
}

// ── Reset ─────────────────────────────────────────────────────────────────────

async function reset() {
  if (!confirm('Alle Einstellungen zurücksetzen?\n(Ausgeblendete Deals bleiben erhalten)')) return;
  const keep = await chrome.storage.local.get({ [KEYS.hiddenDeals]: {} });
  await chrome.storage.local.set({ ...DEFAULTS, [KEYS.hiddenDeals]: keep[KEYS.hiddenDeals] });
load();

// ── Selection-Handoff aus Kontextmenü (externe Seiten) ───────────────────────
// Quelle: What's-New-Review 2026-09-11 (action.openPopup, Chrome 127).
// Rechtsklick auf einer fremden Seite (GitHub, Foren) → Auswahl landet hier
// und der Übersetzer läuft direkt los.
(async () => {
  try {
    const s = await chrome.storage.session.get('mdm_popup_handoff');
    const handoff = s?.mdm_popup_handoff;
    if (!handoff?.text) return;
    await chrome.storage.session.remove('mdm_popup_handoff');
    if (!extractPermalinkIds(handoff.text).length) return; // nur Anzeige, kein Toast
    $('pl-input').value = handoff.text;
    translatePermalinks();
  } catch { /* session evtl. nicht verfügbar — ignoriert */ }
})();
  triggerReprocess();
}

// ── Export / Import ───────────────────────────────────────────────────────────

async function exportSettings() {
  const s = await chrome.storage.local.get(DEFAULTS);
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mydealz-manager-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importSettings(file) {
  try {
    const text  = await file.text();
    const data  = JSON.parse(text);

    // Nur Schema-Keys akzeptieren, unbekannte/ungültige Keys verwerfen
    const patch = {};
    for (const def of MdmSchema.ENTRIES) {
      if (def.key in data) patch[def.key] = data[def.key];
    }
    if (Object.keys(patch).length === 0) {
      toast('⚠️ Keine bekannten Einstellungen in der Datei');
      return;
    }
    await chrome.storage.local.set(patch);
    await load();
    toast(`✓ ${Object.keys(patch).length} Einstellungen importiert`);
    triggerReprocess();
  } catch (e) {
    toast('⚠️ Import fehlgeschlagen: ungültige JSON-Datei');
  }
}

// ── Wire up ───────────────────────────────────────────────────────────────────

// ── Permalink-Übersetzer ──────────────────────────────────────────────────────
// Quelle: mydealz-Diskussion „Neue Link-Struktur von Mydealz" (Thread 2462696).
// Alte /comments/permalink/<id>-URLs werden über GQL comment(id){url} auf die
// neue Deal-URL aufgelöst — über ein offenes mydealz-Tab (relayt via background).

function extractPermalinkIds(text) {
  const ids = new Set();
  for (const m of (text ?? '').matchAll(/comments\/permalink\/(\d+)|[\s"'=(]c(\d{6,})[\s)"',.;]|#(?:comment|reply)-(\d{6,})/g)) {
    const id = m[1] ?? m[2] ?? m[3];
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

async function translatePermalinks() {
  const input  = $('pl-input');
  const output = $('pl-output');
  const copy   = $('btn-pl-copy');
  const note   = $('pl-note');
  const ids    = extractPermalinkIds(input.value);
  note.hidden  = false;

  if (!ids.length) {
    note.textContent = 'Keine Kommentar-IDs gefunden (Erwartet: /comments/permalink/<id>)';
    output.hidden = true; copy.hidden = true;
    return;
  }

  $('btn-permalinks').disabled = true;
  note.textContent = `Löse ${ids.length} IDs auf … (Höflichkeitspausen aktiv)`;

  const response = await chrome.runtime.sendMessage({ type: 'MDM_TRANSLATE_PERMALINKS', ids }).catch(e => null);
  $('btn-permalinks').disabled = false;

  if (!response?.results?.length) {
    note.textContent = 'Auflösen fehlgeschlagen — bitte ein offenes mydealz.de-Tab sicherstellen.';
    return;
  }

  const lines = [];
  for (const r of response.results) {
    lines.push(r.url ? `https://www.mydealz.de/comments/permalink/${r.id} → ${r.url}` : `https://www.mydealz.de/comments/permalink/${r.id} → FEHLER (${r.error})`);
  }
  output.value = lines.join('\n');
  output.hidden = false;
  copy.hidden = false;
  const ok = response.results.filter(r => r.url).length;
  note.textContent = `${ok}/${response.results.length} aufgelöst`;
}

function copyPermalinks() {
  navigator.clipboard.writeText($('pl-output').value);
  toast('✓ Kopiert!');
}

$('btn-permalinks').addEventListener('click', translatePermalinks);
$('btn-pl-copy').addEventListener('click', copyPermalinks);

$('btn-save').addEventListener('click', save);
$('btn-reset').addEventListener('click', reset);
$('btn-export').addEventListener('click', exportSettings);
$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) importSettings(file);
  e.target.value = ''; // gleicher Import kann erneut ausgelöst werden
});

load();
