/**
 * collector.js
 * Deal Collector — exportiert Deal-Listings (Suche/Händler/Kategorie) als Markdown.
 *
 * Aktiviert auf: /search, /search/deals, /gruppe/*, /deals, /neu, /gutscheine
 * Exportiert:    Titel, Preis, °C, Händler, Datum, URL, Beschreibung
 *
 * ── Daten-Strategie (verifiziert live 2026-09-11, Muster MydealzExporter) ──────
 *   1. Thread-IDs aus sichtbaren DOM-Artikeln (article[id^="thread_"])
 *      — Listing-States tragen KEINE Thread-Daten (live gescannt /deals,
 *        /new, /search: kein feeds/entities/search im __INITIAL_STATE__,
 *        keine JSON-Scripts, kein data-vue3 im Initial-HTML)
 *   2. Optional: max. 2 Folgeseiten via AJAX-Endpunkt
 *      (?page=N&ajax=true&layout=horizontal → 276 data-vue3-Payloads, live ✓)
 *   3. Vollständige Daten per GQL-Alias-Batch (thread(threadId: { eq }), live ✓)
 *   4. Fallback ohne GQL: DOM-Parse (DealParser)
 *
 *   Keine best-guess Pagination-Queries mehr: thread()/threads()/search()
 *   Pagination-Formen waren unverifiziert; der AJAX-Endpunkt + Alias-Batch
 *   ist live getestet (siehe /home/moritz/repos/MydealzExporter/data_insights.md).
 */

const Collector = (() => {

  const COLLECTOR_BTN_ID = 'mdm-collector-btn';
  const COLLECTOR_OVERLAY_ID = 'mdm-collector-overlay';

  // Maximale Seiten-Limit Einstellung (in 100er Schritten, default 1 Seite = 100 Deals)
  const DEFAULT_LIMIT = 100;
  const MAX_LIMIT = 500;

  // ── Seiten-Kontext erkennen ────────────────────────────────────────────────

  function _getContext() {
    const url = new URL(location.href);
    const params = url.searchParams;
    const path = url.pathname;

    // Händler-Seite: /search/deals?merchant-id=X
    const merchantId = params.get('merchant-id');
    if (merchantId) {
      // Händler-Name aus DOM lesen (h1 oder Seitentitel)
      const nameEl = document.querySelector('h1, .platform-page-header__title');
      const name = nameEl?.textContent?.trim() || `Händler #${merchantId}`;
      return { type: 'merchant', merchantId, label: name };
    }

    // Textsuche: /search?q=X oder /search/deals?q=X
    const searchQ = params.get('q');
    if (searchQ) {
      return { type: 'search', query: searchQ, label: `Suche: "${searchQ}"` };
    }

    // Gruppen/Kategorie: /gruppe/gaming
    const groupMatch = path.match(/\/gruppe\/([^/]+)/);
    if (groupMatch) {
      const slug = groupMatch[1];
      const nameEl = document.querySelector('h1, .platform-page-header__title');
      const name = nameEl?.textContent?.trim() || slug;
      return { type: 'group', slug, label: name };
    }

    // Gutscheine
    if (path.includes('/gutscheine')) {
      return { type: 'vouchers', label: 'Gutscheine' };
    }

    // Allgemeiner Feed (/deals, /neu, /trending, /)
    return { type: 'general', label: 'mydealz Deals' };
  }

  // ── Datenquellen ───────────────────────────────────────────────────────────

  /**
   * Liest Deals aus window.__INITIAL_STATE__.
   * Verifiziert (2026-09-11 live): Listing-States enthalten KEINE Thread-Daten —
   * auf Detailseiten existiert nur `threadDetail` (ein Deal, nicht eine Liste).
   * Der Collector läuft nur auf Listings → dieser Fallback liefert bewusst []
   * und collect() fällt direkt auf den DOM-Pfad (_fromDom).
   */
  function _fromInitialState() {
    return [];
  }

  /**
   * Normalisiert ein Thread-Objekt (GQL-Batch ODER State) in ein einheitliches Format.
   * Prinzip „one deal, one shape": alle Felder existieren, fehlende sind null.
   */

  // ── ID-Sammlung (verifiziertes Muster aus MydealzExporter listing.js) ──────

  // Bewusst knapp gedeckelt: max. 2 Extraseiten + Pause — kein Ban-Risiko.
  const MAX_EXTRA_PAGES      = 2;
  const EXTRA_PAGE_PAUSE_MS  = 700;

  /** Thread-IDs aus sichtbaren DOM-Artikeln.
   *  Verifiziert (2026-09-11 live): Listing-States (__INITIAL_STATE__ auf /deals,
   *  /new, /search) enthalten KEINE Thread-Daten — IDs kommen ausschließlich
   *  aus dem DOM + AJAX-Folgeseiten (data-vue3). */
  function _getVisibleIds() {
    return [...document.querySelectorAll('article[id^="thread_"]')]
      .map(el => el.id.replace('thread_', ''))
      .filter(id => /^\d+$/.test(id));
  }

  /** Thread-IDs aus dem State: gibt es auf Listings nicht (live verifiziert
   *  2026-09-11) — die Funktion bleibt als Ehrlichkeits-Anker und liefert []. */
  function _idsFromState() {
    return [];
  }

  /**
   * Vue3-Thread-Payloads aus HTML parsen — nur die threadIds.
   * mydealz bettet die Thread-Daten in data-vue3-Attributen ein
   * (props.thread.threadId) — Initial-HTML wie AJAX-Antworten.
   */
  function _parseVue3ThreadIds(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = [];
    for (const el of doc.querySelectorAll('[data-vue3]')) {
      try {
        const data = JSON.parse(el.getAttribute('data-vue3'));
        const t = data?.props?.thread;
        if (t?.threadId && /^\d+$/.test(String(t.threadId))) out.push(String(t.threadId));
      } catch { /* defektes Payload überspringen */ }
    }
    return out;
  }

  /**
   * Folgeseite via AJAX-Endpunkt: ?page=N&ajax=true&layout=horizontal
   * liefert ein JSON-Objekt { data: { content: "<html>" } } (oder HTML direkt).
   * Hier werden NUR IDs gesammelt — die Deals kommen aus dem GQL-Batch.
   */
  async function _fetchExtraPageIds(pageNum) {
    const sp = new URLSearchParams(window.location.search);
    sp.delete('ajax');
    sp.delete('layout');
    sp.set('page', String(pageNum));
    sp.set('ajax', 'true');
    sp.set('layout', 'horizontal');

    const res = await fetch(window.location.pathname + '?' + sp.toString(), {
      headers: { 'x-requested-with': 'XMLHttpRequest' },
    });

    const text = await res.text();
    let html = text;
    if (text.trimStart().startsWith('{')) {
      try { html = JSON.parse(text)?.data?.content ?? ''; } catch { /* HTML-Fallback */ }
    }
    return _parseVue3ThreadIds(html);
  }

  /**
   * Alle sammelbaren IDs: State + sichtbare Seite + max. MAX_EXTRA_PAGES
   * AJAX-Folgeseiten, dedupliziert, auf limit gekappt.
   */
  async function _collectAllIds(limit, onProgress) {
    const all = [...new Set([..._idsFromState(), ..._getVisibleIds()])];
    const sp = new URLSearchParams(window.location.search);
    const pageFrom = parseInt(sp.get('page') || '1', 10) || 1;

    for (let i = 1; i <= MAX_EXTRA_PAGES && all.length < limit; i++) {
      onProgress?.(all.length, limit, `⏳ Seite ${pageFrom + i}…`);
      const ids = await _fetchExtraPageIds(pageFrom + i);
      if (!ids.length) break;                       // Ende der Liste
      const before = all.length;
      for (const id of ids) if (!all.includes(id)) all.push(id);
      if (all.length === before) break;             // keine neuen IDs → fertig
      if (i < MAX_EXTRA_PAGES) await new Promise(r => setTimeout(r, EXTRA_PAGE_PAUSE_MS));
    }
    return all.slice(0, limit);
  }

  /**
   * DOM-Fallback: liest aktuelle article-Elemente.
   * Nutzt DealParser.parse() für einheitliche Daten.
   */
  function _fromDom() {
    const articles = DealParser.findAll();
    return articles.map(el => {
      const d = DealParser.parse(el);
      return {
        id:          d.id ?? '',
        title:       d.title ?? '',
        price:       d.price,
        originalPrice: null,
        temperature: d.temperature,
        merchantName: d.merchantName ?? '',
        merchantId:  d.merchantId ?? '',
        username:    d.username ?? '',
        publishedAt: '',
        isExpired:   false,
        description: d.description ?? '',
        url:         el.querySelector('a[href*="/deals/"]')?.href ?? '',
        commentCount: 0,
      };
    });
  }

  // ── Haupt-Collect-Funktion ─────────────────────────────────────────────────

  /**
   * Sammelt Deals von der aktuellen Seite (verifizierte Pipeline).
   *
   *   1. IDs: State + sichtbares DOM + max. 2 AJAX-Folgeseiten
   *   2. Daten: GQL-Alias-Batch (verifizierte THREAD_FIELDS, volle Beschreibung)
   *   3. Fallbacks: __INITIAL_STATE__-Objekte → DOM-Parse (DealParser)
   *
   * @param {Object} opts
   * @param {number} opts.limit       – max. Deals (default 100)
   * @param {Function} opts.onProgress – (loaded, total, label) callback
   * @returns {Promise<{deals: Object[], context: Object, total: number}>}
   */
  async function collect({ limit = DEFAULT_LIMIT, onProgress } = {}) {
    const context = _getContext();
    let deals = [];

    // 1. IDs sammeln und per verifiziertem GQL-Batch anreichern
    if (typeof GraphQLClient !== 'undefined') {
      try {
        const ids = await _collectAllIds(limit, onProgress);
        if (ids.length) {
          const threads = await GraphQLClient.fetchThreadBatch(ids, {
            onProgress: (done, total, label) => onProgress?.(done, total, label ?? '📋 Sammle Deals…'),
          });
          // fetchThreadBatch liefert bereits kanonische Objekte (DealNormalizer)
          deals = threads.filter(Boolean);
        }
      } catch (e) {
        console.warn('[MDM Collector] GQL-Batch failed:', e.message);
      }
    }

    // 2. Fallback-Quelle: __INITIAL_STATE__-Objekte (kein Netz)
    if (deals.length === 0) {
      deals = _fromInitialState().slice(0, limit);
    }

    // 3. Letzter Fallback: DOM-Parse (DealParser, nur sichtbare Seite)
    if (deals.length === 0) {
      deals = _fromDom();
    }

    return { deals, context, total: deals.length };
  }

  // ── Markdown-Export ────────────────────────────────────────────────────────

  /**
   * Konvertiert gesammelte Deals in ein Markdown-Dokument.
   * Format ist für AI-Weiterverarbeitung optimiert.
   */
  function toMarkdown(deals, context, total) {
    const date = new Date().toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const lines = [];

    // Header
    lines.push(`# ${context.label} — mydealz Deal-Export`);
    lines.push(`**Datum:** ${date}  **Quelle:** ${location.href}  **Deals:** ${deals.length} von ${total}`);
    lines.push('');

    // Tabellenheader
    lines.push('| Titel | Preis | Temp. | Händler | User | Datum | Link |');
    lines.push('|-------|------:|------:|---------|------|-------|------|');

    for (const d of deals) {
      const priceStr = d.price != null ? `${d.price.toFixed(2).replace('.', ',')} €` : '—';
      const tempStr  = d.temperature != null ? `${d.temperature}°` : '—';
      const dateStr  = d.publishedAt
        ? new Date(d.publishedAt * 1000 || d.publishedAt).toLocaleDateString('de-DE')
        : '—';
      const expired  = d.isExpired ? ' ~~(abg.)~~' : '';
      const title    = d.title.replace(/\|/g, '\\|').substring(0, 80);
      const link     = d.url ? `[↗](${d.url})` : '—';

      lines.push(
        `| ${title}${expired} | ${priceStr} | ${tempStr} | ${d.merchantName} | ${d.username} | ${dateStr} | ${link} |`
      );
    }

    // Beschreibungs-Sektion (für AI-Kontext, optional)
    const withDesc = deals.filter(d => d.description && d.description.length > 10);
    if (withDesc.length > 0) {
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push('## Deal-Beschreibungen');
      lines.push('');
      for (const d of withDesc) {
        const priceStr = d.price != null ? ` · ${d.price.toFixed(2).replace('.', ',')} €` : '';
        lines.push(`### ${d.title}${priceStr}`);
        lines.push(`*${d.merchantName} · @${d.username} · ${d.temperature != null ? d.temperature + '°' : ''}*`);
        lines.push('');
        lines.push(d.description.substring(0, 300) + (d.description.length > 300 ? '…' : ''));
        if (d.url) lines.push(`🔗 ${d.url}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // ── UI: Button + Progress-Overlay ─────────────────────────────────────────

  /**
   * Gibt true zurück wenn die aktuelle Seite eine Listing-Seite ist.
   * DETEKTOR statt Pfad-Liste: die Listing-Pfade sind pro Land lokalisiert
   * (mydealz /deals,/hot,/new · dealabs /bons-plans · pepper.pl /nowe ·
   *  nl.pepper.com /nieuw · hotukdeals /deals,/hot,/new,/hottest) — live
   * verifiziert 2026-09-11. Überall identisch: Threads im DOM. Detailseiten
   * haben KEINE Artikel-Karten (verifiziert), daher articles>0 && kein threadDetail.
   */
  function _isListingPage() {
    if (window.__INITIAL_STATE__?.threadDetail) return false;   // Detailseite
    return document.querySelectorAll('article[id^="thread_"]').length > 0;
  }

  /**
   * Zeigt Progress-Overlay während dem Export.
   */
  function _showOverlay(text) {
    let el = document.getElementById(COLLECTOR_OVERLAY_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = COLLECTOR_OVERLAY_ID;
      el.style.cssText = `
        position: fixed; bottom: 80px; right: 24px; z-index: 999999;
        background: var(--color-background, #1a1a2e);
        color: var(--color-primary, #fff);
        border: 1px solid var(--color-border, #333);
        border-radius: 8px; padding: 10px 16px;
        font: 13px/1.4 system-ui, sans-serif;
        box-shadow: 0 4px 20px rgba(0,0,0,.4);
        max-width: 280px;
      `;
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.display = 'block';
    return el;
  }

  function _hideOverlay() {
    const el = document.getElementById(COLLECTOR_OVERLAY_ID);
    if (el) el.style.display = 'none';
  }

  /**
   * Startet den Export und triggert Download.
   */
  async function _runExport(limit) {
    const btn = document.getElementById(COLLECTOR_BTN_ID);
    if (btn) btn.disabled = true;

    const overlay = _showOverlay('📋 Sammle Deals…');

    try {
      const { deals, context, total } = await collect({
        limit,
        onProgress: (loaded, max, label) => {
          overlay.textContent = label ?? `📋 ${loaded} von ${max} Deals geladen…`;
        },
      });

      if (deals.length === 0) {
        overlay.textContent = '⚠️ Keine Deals gefunden.';
        setTimeout(_hideOverlay, 3000);
        return;
      }

      overlay.textContent = `✅ ${deals.length} Deals — exportiere…`;

      const md = toMarkdown(deals, context, total);
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeLabel = context.label.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '').trim().replace(/\s+/g, '_');
      a.download = `mydealz_${safeLabel}_${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);

      overlay.textContent = `✅ ${deals.length} Deals exportiert!`;
      setTimeout(_hideOverlay, 2500);

    } catch (e) {
      console.error('[MDM Collector] Export failed:', e);
      overlay.textContent = `❌ Fehler: ${e.message}`;
      setTimeout(_hideOverlay, 4000);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /**
   * Findet das Element das den Deal-Count anzeigt ("177 Deals").
   * Versucht mehrere Selektoren in Reihenfolge.
   * Gibt { anchor, mode } zurück: anchor = Elternelement für Injection, mode = wie injizieren.
   */
  function _findCountAnchor() {
    // Verschiedene mydealz-Seitentypen haben unterschiedliche Count-Container.
    // Wir suchen nach dem Element das die Anzahl enthält und bauen daneben.
    const candidates = [
      // Suche/Händler-Seiten: z.B. "177 Deals" steht in einem .stream-item--header
      '[data-t="thread-list-header"]',
      '.stream-item--header',
      '.threadListPage-threadListHeader',
      // Listing-Seiten: Überschrift mit Anzahl
      '.listing-heading',
      '.stream-header',
      // Allgemeinere Selektoren
      '[class*="threadList"][class*="header"]',
      '[class*="listingHeader"]',
    ];

    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return { anchor: el, mode: 'append' };
    }

    // Fallback: Suche nach einem Element das typisch "X Deals" als Text enthält
    // und eine Geschwister-/Container-Beziehung hat die sich für Append eignet.
    const allText = document.querySelectorAll('h1, h2, [class*="count"], [class*="Count"], [class*="result"]');
    for (const el of allText) {
      if (/\d+\s*(Deals?|Ergebnisse)/i.test(el.textContent)) {
        return { anchor: el.parentElement ?? el, mode: 'append' };
      }
    }

    return null;
  }

  /**
   * Injiziert den Collector-Button auf Listing-Seiten.
   * Position: neben dem Deal-Count ("177 Deals") oben im Feed.
   * Fallback: floating FAB bottom-right wenn kein Count-Element gefunden.
   * Wird von content.js aufgerufen.
   */
  function init() {
    if (!_isListingPage()) return;
    if (document.getElementById(COLLECTOR_BTN_ID)) return; // Idempotenz-Guard: Button bereits im DOM

    const btn = document.createElement('button');
    btn.id = COLLECTOR_BTN_ID;

    const countAnchor = _findCountAnchor();

    if (countAnchor) {
      // ── Button 2: kompakter Inline-Button neben dem Deal-Count ──────────────
      btn.innerHTML = '📋 Exportieren';
      btn.title = `Deals als Markdown exportieren (${DEFAULT_LIMIT} Deals · Shift+Klick = ${MAX_LIMIT} · max. ${MAX_EXTRA_PAGES} Folgeseiten via AJAX)`;
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-left: 12px;
        padding: 4px 10px;
        background: transparent;
        color: var(--color-brandGreen, #4ade80);
        border: 1px solid var(--color-brandGreen, #4ade80);
        border-radius: 6px;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        vertical-align: middle;
        transition: background 0.15s ease;
        white-space: nowrap;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(74, 222, 128, 0.1)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
      });

      // Anchor-Element auf flex setzen damit der Button inline daneben sitzt
      const anchor = countAnchor.anchor;
      const currentDisplay = getComputedStyle(anchor).display;
      if (currentDisplay === 'block' || currentDisplay === '') {
        anchor.style.display = 'flex';
        anchor.style.alignItems = 'center';
        anchor.style.flexWrap = 'wrap';
        anchor.style.gap = '8px';
      }
      anchor.appendChild(btn);

    } else {
      // ── Fallback: floating FAB bottom-right ─────────────────────────────────
      btn.innerHTML = '📋';
      btn.title = `Deals exportieren (${DEFAULT_LIMIT} Deals · Shift+Klick = ${MAX_LIMIT} · max. ${MAX_EXTRA_PAGES} Folgeseiten via AJAX)`;
      btn.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 99999;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--color-brandGreen, #4ade80);
        color: #000;
        border: none;
        cursor: pointer;
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 12px rgba(0,0,0,.4);
        transition: transform 0.15s ease;
      `;
      btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.1)'; });
      btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
      document.body.appendChild(btn);
    }

    btn.addEventListener('click', (e) => {
      const limit = e.shiftKey ? MAX_LIMIT : DEFAULT_LIMIT;
      _runExport(limit);
    });

    // Progress-Overlay für Button 2 direkt unter dem Button
    if (countAnchor) {
      console.log('[MDM Collector] Button 2 (inline) injiziert auf', location.pathname);
    } else {
      console.log('[MDM Collector] Button FAB (fallback) injiziert auf', location.pathname);
    }
  }

  return { init, collect, toMarkdown };

})();

if (typeof module !== 'undefined') module.exports = { Collector };
