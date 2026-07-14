/**
 * collector.js
 * Deal Collector — exportiert Deal-Listings (Suche/Händler/Kategorie) als Markdown.
 *
 * Aktiviert auf: /search, /search/deals, /gruppe/*, /deals, /neu, /gutscheine
 * Exportiert:    Titel, Preis, °C, Händler, Datum, URL, Beschreibung
 *
 * ── Daten-Strategie ────────────────────────────────────────────────────────────
 *   1. window.__INITIAL_STATE__  → Seite 1 kostenlos, keine Requests nötig
 *   2. GraphQL POST              → Weitere Seiten per Pagination
 *   3. DOM CSS Selektoren        → Fallback (nur aktuelle Seitenansicht)
 *
 * ── Seiten-Typen ───────────────────────────────────────────────────────────────
 *   merchant:  /search/deals?merchant-id=15   → threads(filter: merchantId)
 *   search:    /search?q=apple                → search(query: "apple")
 *   group:     /gruppe/gaming                 → threads(filter: groupSlug)
 *   general:   /deals, /neu, /trending        → threads() unfiltered
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
   * Liest Deals aus window.__INITIAL_STATE__ (Seite 1 ist immer da).
   * Gibt normalisierte Deal-Objekte zurück.
   */
  function _fromInitialState() {
    try {
      const state = window.__INITIAL_STATE__;
      if (!state?.entities?.threads) return [];

      // Feed IDs oder Search-Ergebnis-IDs aus dem State extrahieren
      const threadIds =
        state.feeds?.main?.ids ||           // Feed-Seiten (/deals, /neu)
        state.search?.results?.ids ||       // Suchergebnisse
        state.listing?.threads?.ids ||      // Listing-Seiten
        Object.keys(state.entities.threads); // Fallback: alle threads

      return threadIds
        .map(id => state.entities.threads[id])
        .filter(Boolean)
        .map(_normalizeThread);
    } catch (e) {
      console.warn('[MDM Collector] __INITIAL_STATE__ parse failed:', e.message);
      return [];
    }
  }

  /**
   * Normalisiert ein Thread-Objekt (aus GQL oder State) in ein einheitliches Format.
   */
  function _normalizeThread(t) {
    if (!t) return null;
    const id = t.threadId ?? t.id ?? '';
    const slug = t.slug ?? '';
    const urlPath = t.urlPath ?? (slug ? `/deals/${slug}` : '');

    return {
      id:          String(id),
      title:       t.title ?? '',
      price:       _parsePrice(t.price ?? t.nextBestPrice ?? null),
      originalPrice: _parsePrice(t.nextBestPrice ?? null),
      temperature: typeof t.temperature === 'number' ? t.temperature : null,
      merchant:    t.merchant?.merchantName ?? t.merchantName ?? '',
      merchantId:  String(t.merchant?.merchantId ?? t.merchantId ?? ''),
      username:    t.user?.username ?? t.username ?? '',
      publishedAt: t.publishedAt ?? t.createdAt ?? '',
      isExpired:   !!(t.isExpired ?? t.expired),
      description: _stripHtml(t.description ?? t.preparedDescription ?? ''),
      url:         urlPath ? `https://www.mydealz.de${urlPath}` : '',
      commentCount: t.commentCount ?? 0,
    };
  }

  function _parsePrice(raw) {
    if (raw == null) return null;
    if (typeof raw === 'number') return raw;
    const n = parseFloat(String(raw).replace(',', '.').replace(/[^\d.]/g, ''));
    return isNaN(n) ? null : n;
  }

  function _stripHtml(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Holt eine Seite Deals per GraphQL.
   * Versucht je nach Kontext verschiedene Query-Varianten.
   */
  async function _fetchGqlPage(context, page, limit) {
    // Für Textsuche: search()-Query
    if (context.type === 'search') {
      return await _fetchSearchPage(context.query, page, limit);
    }
    // Für Händler/Gruppe/Allgemein: threads()-Query mit Filter
    return await _fetchThreadsPage(context, page, limit);
  }

  // GraphQL: threads(filter, limit, page) — für Händler, Gruppen, Feed
  const Q_THREADS = `
    query threads($filter: ThreadsFilter, $limit: Int, $page: Int) {
      threads(filter: $filter, limit: $limit, page: $page) {
        items {
          threadId
          title
          price
          temperature
          status
          isExpired
          publishedAt
          slug
          urlPath
          description
          commentCount
          merchant { merchantId merchantName }
          user { username }
        }
        pagination { last total }
      }
    }
  `;

  // GraphQL: search(query, limit, page) — für Textsuche
  const Q_SEARCH = `
    query searchThreads($query: String!, $limit: Int, $page: Int) {
      search(query: $query, limit: $limit, page: $page) {
        items {
          threadId
          title
          price
          temperature
          status
          isExpired
          publishedAt
          slug
          urlPath
          description
          commentCount
          merchant { merchantId merchantName }
          user { username }
        }
        pagination { last total }
      }
    }
  `;

  async function _fetchThreadsPage(context, page, limit) {
    const filter = {};
    if (context.type === 'merchant' && context.merchantId) {
      filter.merchantId = { eq: context.merchantId };
    }
    if (context.type === 'group' && context.slug) {
      filter.slug = { eq: context.slug };
    }

    try {
      const result = await GraphQLClient.query(Q_THREADS, { filter, limit, page });
      const data = result?.data?.threads;
      if (!data) return null;
      return {
        items: (data.items ?? []).map(_normalizeThread).filter(Boolean),
        lastPage: data.pagination?.last ?? page,
        total: data.pagination?.total ?? null,
      };
    } catch (e) {
      console.warn('[MDM Collector] threads GQL failed:', e.message);
      return null;
    }
  }

  async function _fetchSearchPage(searchQuery, page, limit) {
    try {
      const result = await GraphQLClient.query(Q_SEARCH, { query: searchQuery, limit, page });
      const data = result?.data?.search;
      if (!data) return null;
      return {
        items: (data.items ?? []).map(_normalizeThread).filter(Boolean),
        lastPage: data.pagination?.last ?? page,
        total: data.pagination?.total ?? null,
      };
    } catch (e) {
      console.warn('[MDM Collector] search GQL failed:', e.message);
      return null;
    }
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
        merchant:    d.merchantName ?? '',
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
   * Sammelt Deals von der aktuellen Seite.
   * @param {Object} opts
   * @param {number} opts.limit       – max. Deals (default 100)
   * @param {Function} opts.onProgress – (loaded, total) callback
   * @returns {Promise<{deals: Object[], context: Object, total: number}>}
   */
  async function collect({ limit = DEFAULT_LIMIT, onProgress } = {}) {
    const context = _getContext();
    const deals = [];
    let total = 0;

    // 1. Seite 1 aus __INITIAL_STATE__ (kostenlos)
    const stateDeals = _fromInitialState();
    if (stateDeals.length > 0) {
      deals.push(...stateDeals.slice(0, limit));
      total = stateDeals.length; // Schätzung
      onProgress?.(deals.length, limit);
    }

    // 2. Wenn wir noch mehr brauchen und GQL verfügbar: weitere Seiten laden
    if (deals.length < limit && typeof GraphQLClient !== 'undefined') {
      const pageLimit = Math.min(limit, 100); // GQL max 100 per request
      let page = deals.length > 0 ? 2 : 1;   // Seite 1 schon aus State?
      let lastPage = 99;

      // Seite 1 überspringen wenn wir schon State-Daten haben
      if (deals.length === 0) {
        const firstPage = await _fetchGqlPage(context, 1, pageLimit);
        if (firstPage) {
          deals.push(...firstPage.items.slice(0, limit - deals.length));
          lastPage = firstPage.lastPage;
          total = firstPage.total ?? deals.length;
          onProgress?.(deals.length, Math.min(limit, total));
          page = 2;
        }
      }

      while (deals.length < limit && page <= lastPage) {
        const batch = await _fetchGqlPage(context, page, pageLimit);
        if (!batch || batch.items.length === 0) break;
        deals.push(...batch.items.slice(0, limit - deals.length));
        lastPage = batch.lastPage;
        total = batch.total ?? total;
        onProgress?.(deals.length, Math.min(limit, total));
        page++;
      }
    }

    // 3. DOM-Fallback wenn weder State noch GQL Daten lieferten
    if (deals.length === 0) {
      const domDeals = _fromDom();
      deals.push(...domDeals);
      total = domDeals.length;
      onProgress?.(deals.length, deals.length);
    }

    return { deals, context, total };
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
        `| ${title}${expired} | ${priceStr} | ${tempStr} | ${d.merchant} | ${d.username} | ${dateStr} | ${link} |`
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
        lines.push(`*${d.merchant} · @${d.username} · ${d.temperature != null ? d.temperature + '°' : ''}*`);
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
   */
  function _isListingPage() {
    const path = location.pathname;
    return (
      path.startsWith('/search') ||
      path.startsWith('/gruppe/') ||
      path === '/deals' ||
      path === '/neu' ||
      path === '/trending' ||
      path.startsWith('/gutscheine')
    );
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
        onProgress: (loaded, max) => {
          overlay.textContent = `📋 ${loaded} von ${max} Deals geladen…`;
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
      btn.title = `Deals als Markdown exportieren (${DEFAULT_LIMIT} Deals · Shift+Klick = ${MAX_LIMIT})`;
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
      btn.title = `Deals exportieren (${DEFAULT_LIMIT} Deals · Shift+Klick = ${MAX_LIMIT})`;
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
