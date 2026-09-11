/**
 * sidepanel.js — Exporter-Dashboard als SidePanel (Sidebar neben dem Deal).
 *
 * Quelle: Chrome-API-Review 2026-09-11 (docs/ROADMAP.md §2.13) + User-Wunsch
 * „Dashboard als Sidebar statt Extra-Fenster" inkl. geplanter Chat-Sektion
 * (§2.14).
 *
 * Datenfluss:
 *   Export-Button (Deal-Seite) → background öffnet Panel (User-Gesture)
 *   → Content sammelt Kommentare (Status via MDM_EXPORT_STATUS)
 *   → fertige Prompt-Texte via MDM_EXPORT_DATA → chrome.storage.session
 *   → onChanged hier → Render. „🔄" → MDM_EXPORT_REDO → Content-Tab.
 */

const out       = document.getElementById('out');
const tabsEl    = document.getElementById('tabs');
const controls  = document.getElementById('controls');
const metaBar   = document.getElementById('meta-bar');
const toastEl   = document.getElementById('toast');
const btnCopy   = document.getElementById('btnCopy');
const btnMd     = document.getElementById('btnMd');
const btnRefresh = document.getElementById('btnRefresh');

let _payload   = null;   // { meta, promptTexts, generatedAt, hasRefresh }
let _level     = 'MEDIUM';
let _base      = '';

const AI_LINKS = [
  { name: 'ChatGPT',    url: 'https://chatgpt.com/' },
  { name: 'Claude',     url: 'https://claude.ai/' },
  { name: 'Gemini',     url: 'https://gemini.google.com/' },
  { name: 'Perplexity', url: 'https://www.perplexity.ai/' },
];

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ── AI-Links einmalig ─────────────────────────────────────────────────────────
for (const a of AI_LINKS) {
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = a.name;
  b.addEventListener('click', () => window.open(a.url));
  document.getElementById('ai-links').appendChild(b);
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderMeta(meta) {
  const cached = meta._fromCache
    ? ` <span class="cached">⚡ Cache ${new Date(meta._cacheTime).toLocaleTimeString('de-DE')}</span>`
    : '';
  const di = meta.DealInfo ?? {};
  metaBar.innerHTML =
    `<b>Deal:</b> ${(meta.Titel ?? '').substring(0, 60)}<br>` +
    `<b>Status:</b> ${di.Status ?? '?'} · <b>Preis:</b> ${di.Preis ?? '?'} · ` +
    `<b>Händler:</b> ${di['Händler'] ?? '?'} · <b>Temp:</b> ${di.Temperatur ?? '?'} · ` +
    `<b>Kommentare:</b> ${meta.Statistik?.Total ?? '?'} ` +
    `${meta.Statistik?.Diskrepanz ? `(±${meta.Statistik.Diskrepanz})` : ''}` +
    (cached ? `<span class="cached"> · ⚡ Cache</span>` : '');
}

function renderTabs() {
  tabsEl.innerHTML = '';
  Object.keys(_payload.promptTexts).forEach(key => {
    const btn = document.createElement('button');
    btn.className = `tab ${key === _level ? 'active' : ''}`;
    btn.textContent = _PROMPT_LABELS[key] ?? key;
    btn.addEventListener('click', () => {
      _level = key;
      tabsEl.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      out.value = _payload.promptTexts[key] ?? '';
    });
    tabsEl.appendChild(btn);
  });
}

function render() {
  if (!_payload) return;
  renderMeta(_payload.meta);
  renderTabs();
  controls.hidden = false;
  btnCopy.disabled = false;
  btnMd.disabled = false;
  btnRefresh.hidden = !_payload.hasRefresh;
  out.value = _payload.promptTexts[_level] ?? Object.values(_payload.promptTexts)[0] ?? '';
  const safe = (_payload.meta.Titel ?? 'mydealz').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  _base = `${new Date(_payload.generatedAt).toISOString().split('T')[0]}_${safe}_mydealz`;
}

// ── Prompt-Labels (Kopie der Content-Bundle-Keys) ────────────────────────────
// LOKALE KOPIE — driften mit exporter.js (BUG-Beweis Claude-Review);
// mittel-/langfristig als SSOT-Modul core/prompt-levels.js (ROADMAP §2.5-Muster)
const _PROMPT_LABELS = {
  RAW: '🧱 Rohdaten',
  SHORT: '⚡ Kurz',
  MEDIUM: '📝 Mittel',
  DETAILED: '📚 Lang',
};

// ── Aktionen ──────────────────────────────────────────────────────────────────

btnCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(out.value);
    toast('✅ Kopiert!');
  } catch {
    toast('⚠️ Clipboard verweigert');
  }
});

btnMd.addEventListener('click', () => {
  if (!_payload) return;
  const blob = new Blob([out.value], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${_base}.md` });
  a.click();
  URL.revokeObjectURL(url);
});

btnRefresh.addEventListener('click', () => {
  if (!confirm('Cache löschen und Daten neu laden?')) return;
  chrome.runtime.sendMessage({ type: 'MDM_EXPORT_REDO' }).catch(() => {});
});

// ── Storage-Anbindung ─────────────────────────────────────────────────────────

chrome.storage.session.get(['mdm_export_payload', 'mdm_export_status'], (s) => {
  if (s.mdm_export_payload) { _payload = s.mdm_export_payload; render(); }
  if (s.mdm_export_status?.text) { out.value = s.mdm_export_status.text; out.placeholder = ''; }
});

chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.mdm_export_status) {
    const text = changes.mdm_export_status.newValue?.text ?? '';
    if (text && !_payload) out.value = text; // Fortschritt anzeigen bis Daten da sind
  }
  if (changes.mdm_export_payload) {
    _payload = changes.mdm_export_payload.newValue ?? null;
    _level = 'MEDIUM';
    render();
  }
});
