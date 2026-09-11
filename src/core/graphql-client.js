/**
 * graphql-client.js
 * GraphQL access layer for mydealz / preisjaeger.at — VERIFIED SHAPES ONLY.
 *
 * Quelle: /home/moritz/repos/MydealzExporter/data_insights.md + content/listing.js
 * (live verifiziert am 2026-09-09 gegen mydealz.de, eingeloggte Session nötig —
 * anonyme Queries antworten mit { message: "Whiiiiiiieeee" }).
 *
 * Verifizierte Grundregeln (nicht mehr raten!):
 *   - Thread:  thread(threadId: { eq: <id> })  + 24-Feld-Inventar (THREAD_FIELDS)
 *   - Batching: Alias-Trick `t<id>: thread(...)`, 30 Threads pro Request
 *   - Kommentare: comments(filter: CommentFilter) mit threadId { eq }
 *   - Replies: Composite-Key mainCommentId + threadId (ohne threadId antwortet
 *     die API still gar nicht!), 30 Parents pro Request via Aliase
 *   - repliesPreview: Root-Kommentare enthalten die meisten Replies bereits —
 *     oft braucht es gar keine Extra-Calls
 *   - Throttling: mydealz liefert gelegentlich HTTP 200 + HTML statt JSON —
 *     wird als erkannter Fehler geworfen, nie als SyntaxError
 *
 * Persisted query hashes are NOT used — dynamic POST queries only.
 */

const GraphQLClient = (() => {
  const GQL_ENDPOINT = '/graphql';

  // ── Robustheit (Muster PepperDealsScraper, verifiziert im MydealzExporter) ──
  const RETRY_STATUS        = new Set([408, 429, 500, 502, 503, 504]); // nur transiente Fehler
  const RETRY_MAX_ATTEMPTS  = 2;      // zusätzlich zum ersten Versuch
  const RETRY_BASE_DELAY_MS = 800;    // exponentiell: 800 → 1600 ms
  const BATCH_CHUNK_SIZE    = 30;     // Aliase pro Request (Threads UND Replies)
  const PAUSE_BETWEEN_BATCHES_MS = 400; // Höflichkeitspause zwischen Chunks (300–700-Band)

  function _pause(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── CSRF token (Meta-Tag → xsrf_t-Cookie mit Unquoting) ─────────────────────
  // Wichtig: der Cookie-Wert ist oft URI-kodiert UND in Quotes — ohne Unquote
  // wird der Token still ungültig.

  function _getCsrfToken() {
    // 1. Meta tag (most reliable)
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta?.content) return meta.content;

    // 2. Cookie fallback
    const m = document.cookie?.match(/xsrf_t=([^;]+)/);
    if (!m) return null;
    let val = decodeURIComponent(m[1]);
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    return val;
  }

  // ── Core fetch mit Retry/Backoff ────────────────────────────────────────────

  /**
   * Fetch mit Pepper-Retry-Politik:
   *   - nur transiente Fehler wiederholen (408/429/5xx, Netzwerkfehler)
   *   - 403/404 sofort werfen (Session weg / nicht gefunden — Retrying hilft nie)
   *   - Retry-After-Header schlägt eigenes Backoff
   */
  async function _fetchWithRetry(bodyObj) {
    const options = {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type':     'application/json',
        'X-CSRF-TOKEN':     _getCsrfToken() ?? '',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify(bodyObj),
    };

    let lastRes = null;
    let lastErr = null;

    for (let attempt = 0; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        let delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        // Server-Hinweis schlägt Eigen-Backoff
        const retryAfter = parseInt(lastRes?.headers?.get('Retry-After') || '', 10);
        if (retryAfter > 0) delay = Math.max(delay, retryAfter * 1000);
        if (typeof Logger !== 'undefined') {
          Logger.warn('GraphQLClient', `Retry ${attempt}/${RETRY_MAX_ATTEMPTS} in ${Math.round(delay / 1000)}s`);
        }
        await _pause(delay);
      }

      let res;
      try {
        res = await fetch(GQL_ENDPOINT, options);
      } catch (err) {
        lastErr = err; // Netzwerkfehler → Retry
        continue;
      }
      lastRes = res;

      if (res.ok) break;
      if (RETRY_STATUS.has(res.status) && attempt < RETRY_MAX_ATTEMPTS) continue;
      throw new Error(`[MDM GQL] HTTP ${res.status} ${res.statusText}`);
    }

    if (!lastRes || !lastRes.ok) {
      throw lastErr || new Error('[MDM GQL] Fetch fehlgeschlagen');
    }

    // ── Throttle-Erkennung: mydealz liefert bei Drosselung 200 + HTML ──────────
    const contentType = lastRes.headers.get('content-type') ?? '';
    const text = await lastRes.text();
    if (!contentType.includes('json') && !text.trimStart().startsWith('{')) {
      throw new Error('[MDM GQL] Rate-Limit vermutet: Server lieferte HTML statt JSON (HTTP 200)');
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('[MDM GQL] Antwort war kein gültiges JSON (Drosselung oder Deploy?)');
    }
    return json;
  }

  /**
   * Execute a GraphQL query via POST.
   * @param {string} queryStr    – GraphQL query string
   * @param {Object} variables   – variables object
   * @returns {Promise<Object>}  – parsed { data, errors }
   */
  async function query(queryStr, variables = {}) {
    const json = await _fetchWithRetry({ query: queryStr, variables });
    if (json.errors?.length) {
      // GQL-Fehler sind oft "Hinweise" (ein ungültiges Alias leert nur dessen Antwort)
      if (typeof Logger !== 'undefined') {
        Logger.warn('GraphQLClient', `GQL errors: ${json.errors.map(e => e.message ?? JSON.stringify(e)).join(' | ')}`);
      }
    }
    return json;
  }

  // ── Thread-Batch (verifiziert: Alias-Trick, 30 Threads pro Request) ─────────
  // Alle Feldnamen live verifiziert (MydealzExporter THREAD_FIELDS, 2026-09-09).

  const THREAD_FIELDS = `
    title
    price
    displayPrice
    nextBestPrice
    priceOff
    priceDiscount
    description
    url
    shareableLink
    temperature
    commentCount
    isExpired
    publishedAt
    createdAt
    user { username userId }
    merchant { merchantId merchantName }
    mainImage { uid path }
    mainGroup { threadGroupId threadGroupName threadGroupUrlName }
    groupsPath { threadGroupId threadGroupName threadGroupUrlName }
    shipping { isFree price }
    updatedAt
    voucherCode
    temperatureLevel
    type
    selectedLocations { isNational }
  `.trim();
  // ACHTUNG (live verifiziert 2026-09-11): `keywordNames` wirft
  // "Internal server error" und leert DAMIT das GESAMTE Alias-Ergebnis
  // (methodik.md §1: ein abgelehntes Feld killt den ganzen Batch).
  // Nicht wieder einbauen — falls nötig, in einen separaten Einzel-Query.

  /**
   * Holt Threads per Alias-Batching (30er-Chunks, Höflichkeitspausen).
   * @param {string[]|number[]} ids        – Thread-IDs
   * @param {Object} [opts]
   * @param {number} [opts.chunkSize]      – Aliase pro Request (default 30)
   * @param {Function} [opts.onProgress]   – (done, total, label) callback
   * @returns {Promise<Object[]>} – normalisierte Thread-Objekte; fehlende IDs
   *                                kommen NICHT im Ergebnis vor.
   */
  async function fetchThreadBatch(ids, { chunkSize = BATCH_CHUNK_SIZE, onProgress } = {}) {
    if (!ids?.length) return [];
    const out = [];
    const totalChunks = Math.ceil(ids.length / chunkSize);

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const chunkNum = Math.floor(i / chunkSize) + 1;

      if (totalChunks > 1) onProgress?.(i, ids.length, `Batch ${chunkNum}/${totalChunks}…`);

      const aliases = chunk
        .map(id => `t${id}: thread(threadId: { eq: ${id} }) { ${THREAD_FIELDS} }`)
        .join('\n');

      const json = await query(`query { ${aliases} }`);

      for (const id of chunk) {
        const d = json.data?.[`t${id}`];
        if (!d) continue; // nicht gefunden / gelöscht → überspringen
        out.push(_normalizeGqlThread(d, String(id)));
      }

      if (i + chunkSize < ids.length) await _pause(PAUSE_BETWEEN_BATCHES_MS);
    }
    return out;
  }

  /**
   * Normalisiert ein verifiziertes GQL-Thread-Objekt in ein einheitliches Feldset.
   * Feldprinzip: alle Felder existieren, fehlende Werte sind null.
   */
  function _normalizeGqlThread(d, id) {
    // Rabatt % aus GQL-Feld oder aus Preis-Delta berechnen (Export-Muster)
    let discountPct = d.priceDiscount;
    if (discountPct == null && d.nextBestPrice && d.price != null && d.nextBestPrice > d.price) {
      discountPct = Math.round((d.nextBestPrice - d.price) / d.nextBestPrice * 100);
    }

    const iso = ts => (ts ? new Date(ts * 1000).toISOString() : null);

    return {
      id:             String(id),
      // d.url ist oft relativ — absolutisieren. Fallback: ID-only URL
      // (live verifiziert 2026-09-11: https://mydealz.de/<id> → 301 auf die
      // echte Detailseite; /deals/<id> OHNE Slug wäre die "Ups"-Seite).
      url:            _absolute(d.url) || `${location.origin}/${id}`,
      shareLink:      d.shareableLink || '',
      title:          d.title || '',
      description:    _htmlToText(d.description),
      descriptionHtml:d.description || '',
      price:          d.price ?? null,
      displayPrice:   d.displayPrice || null,
      originalPrice:  d.nextBestPrice ?? null,
      priceOff:       d.priceOff ?? null,
      discountPct,    // signed: positiv = Ersparnis in %, null = unbekannt
      shippingFree:   d.shipping?.isFree ?? null,
      shippingPrice:  d.shipping?.price ?? null,
      temperature:    d.temperature ?? null,
      temperatureLevel: d.temperatureLevel ?? null,
      commentCount:   d.commentCount ?? null,
      isExpired:      d.isExpired ?? false,
      voucherCode:    d.voucherCode || null,
      type:           d.type ?? null,
      username:       d.user?.username || '',
      userId:         d.user?.userId ?? '',
      merchantName:   d.merchant?.merchantName || '',
      merchantId:     d.merchant?.merchantId ? String(d.merchant.merchantId) : '',
      imageUrl:       _buildImageUrl(d.mainImage),
      publishedAt:    iso(d.publishedAt),
      createdAt:      iso(d.createdAt),
      updatedAt:      iso(d.updatedAt),
      group:          d.mainGroup?.threadGroupName || null,
      groupPath:      (d.groupsPath ?? []).map(g => g.threadGroupName).filter(Boolean),
      _source: 'graphql',
    };
  }

  function _buildImageUrl(mainImage) {
    if (!mainImage?.uid || !mainImage?.path) return null;
    // Pepper-CDN-Muster: static.<domain>/{path}/{uid}/fs/895x577/qt/65/{uid}
    // (mydealz.de live verifiziert 2026-09-11; hotukdeals.com/dealabs.com/pepper.pl/
    //  nl.pepper.com nutzen dieselbe Engine — gleiche static-Host-Annahme)
    return `https://static.${location.hostname}/${mainImage.path}/${mainImage.uid}/fs/895x577/qt/65/${mainImage.uid}`;
  }

  /** Relativ-URL (z. B. "/deals/foo-123") zu absoluter URL machen; '' bei leeren Werten. */
  function _absolute(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : `${location.origin}${url}`;
  }

  function _htmlToText(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const text = tmp.innerText ?? tmp.textContent ?? '';
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  // ── Kommentar-Queries (verifiziert, inkl. repliesPreview) ───────────────────
  // Composite-Key-Pflicht: replies NUR mit mainCommentId UND threadId.

  const COMMENT_FIELDS = `
    commentId mainCommentId threadId
    preparedHtmlContent createdAt createdAtTs
    deletedBy { username }
    replyCount
    user { username userId }
    reactionCounts { type count }
  `.trim();

  const Q_COMMENTS = `
    query($filter: CommentFilter!, $limit: Int, $page: Int) {
      comments(filter: $filter, limit: $limit, page: $page) {
        items { ${COMMENT_FIELDS} repliesPreview { ${COMMENT_FIELDS} } }
        pagination { last count current }
      }
    }
  `;

  /**
   * Fetch one page of top-level comments for a thread.
   * items[].repliesPreview enthält die Replies bereits — parseReplyTree()
   * baut daraus den kompletten Baum ohne Extra-Calls.
   * @param {string|number} threadId
   * @param {number} page    – 1-based
   * @param {number} limit
   */
  async function fetchComments(threadId, page = 1, limit = 100) {
    const variables = {
      filter: {
        threadId: { eq: String(threadId) },
        order:    { direction: 'Ascending' },
      },
      limit,
      page,
    };
    const result = await query(Q_COMMENTS, variables);
    return result?.data?.comments ?? null;
  }

  /**
   * Fetch all comment pages for a thread (politeness pauses between pages).
   * @param {string|number} threadId
   * @param {Function}      onProgress – optional (page, lastPage) callback
   */
  async function fetchAllComments(threadId, onProgress) {
    const all = [];
    let page  = 1;
    let last  = 1;

    do {
      const batch = await fetchComments(threadId, page);
      if (!batch) break;
      all.push(...(batch.items ?? []));
      last = batch.pagination?.last ?? page;
      onProgress?.(page, last);
      page++;
      if (page <= last) await _pause(PAUSE_BETWEEN_BATCHES_MS);
    } while (page <= last);

    return all;
  }

  /**
   * Batched Reply-Fetch: bis zu 30 Parents per Request via Alias-Trick.
   * WICHTIG (mydealz-Absonderheit): ohne threadId im Filter liefert der
   * Endpunkt still nichts — der Composite-Key mainCommentId + threadId ist
   * Pflicht (data_insights.md §1).
   * @param {string|number} threadId
   * @param {string[]|number[]} parentIds
   * @param {Object} [opts]
   * @returns {Promise<Object>} – Map parentId → replies[]
   */
  async function fetchRepliesBatch(threadId, parentIds, { chunkSize = BATCH_CHUNK_SIZE, onProgress } = {}) {
    if (!parentIds?.length) return {};
    const result = {};
    const chunks = [];
    for (let i = 0; i < parentIds.length; i += chunkSize) chunks.push(parentIds.slice(i, i + chunkSize));

    for (let c = 0; c < chunks.length; c++) {
      const aliases = chunks[c].map(pid =>
        `r${pid}: comments(filter: { threadId: { eq: ${String(threadId)} }, mainCommentId: ${pid} }, limit: 100) {
           items { ${COMMENT_FIELDS} }
         }`
      ).join('\n');

      const json = await query(`query { ${aliases} }`);
      const data = json.data || {};
      for (const pid of chunks[c]) {
        result[pid] = (data[`r${pid}`]?.items || []);
      }

      onProgress?.(Math.min((c + 1) * chunkSize, parentIds.length), parentIds.length);
      if (c < chunks.length - 1) await _pause(PAUSE_BETWEEN_BATCHES_MS);
    }
    return result;
  }

  /**
   * Fetch replies to a single top-level comment.
   * @param {string} mainCommentId
   * @param {string|number} threadId
   */
  async function fetchReplies(mainCommentId, threadId) {
    const map = await fetchRepliesBatch(threadId, [mainCommentId]);
    return map[mainCommentId] ?? [];
  }

  /**
   * Normalise a comment item to a simpler shape.
   */
  function normaliseComment(item) {
    return {
      id:        item.commentId,
      parentId:  item.mainCommentId || null,
      user:      item.user?.username ?? 'unknown',
      userId:    item.user?.userId ?? '',
      deletedBy: item.deletedBy?.username ?? null,
      // createdAtTs is a unix timestamp; convert to ISO date string
      date:      item.createdAtTs
                   ? new Date(item.createdAtTs * 1000).toISOString().split('T')[0]
                   : (item.createdAt ?? ''),
      // preparedHtmlContent is HTML; strip tags for plain-text access
      textHtml:  item.preparedHtmlContent ?? '',
      text:      (item.preparedHtmlContent ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      votes:     item.voteScore ?? 0,
      replyCount:item.replyCount ?? 0,
      replies:   [],
    };
  }

  /**
   * Kommentar-ID → vollständige Thread-URL (inkl. #comment-/#reply-Anker).
   * Verifizierte Query (live 2026-09-11, Quelle: mydealz-Diskussion „Neue
   * Link-Struktur von Mydealz", Thread 2462696) — löst das alt-Format
   * `/comments/permalink/<id>` auf das neue Format auf:
   *   { url: "https://…/deals/<slug>-<id>#comment-<commentId>", commentId }
   * Anwendungsfall: Permalink-Übersetzung (alte Link-Sammlungen reparieren),
   * verdeckte-Deals-Liste via Kommentar-IDs.
   * @param {string|number} commentId
   * @returns {Promise<{url: string, commentId: string}|null>}
   */
  async function fetchCommentUrl(commentId) {
    const result = await query(
      'query getComment($id: ID!) { comment(id: $id) { url commentId } }',
      { id: String(commentId) },
    );
    return result?.data?.comment ?? null;
  }

  return {
    query,
    fetchThreadBatch,
    fetchComments,
    fetchAllComments,
    fetchRepliesBatch,
    fetchReplies,
    fetchCommentUrl,
    normaliseComment,
    getCsrfToken: _getCsrfToken,
  };
})();

if (typeof module !== 'undefined') module.exports = { GraphQLClient };
