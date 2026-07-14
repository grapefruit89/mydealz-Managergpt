/**
 * graphql-client.js
 * Thin GraphQL client for mydealz / preisjaeger.at.
 *
 * Auth: reads x-xsrf-token from the page's CSRF meta tag or cookie.
 *
 * Key queries (confirmed working):
 *   - comments(filter, limit, page)
 *   - replies (via mainCommentId filter)
 *   - search threads (dynamic POST to /graphql)
 *
 * Persisted query hashes change on each deploy — do NOT hardcode them.
 * Use dynamic POST queries for reliability.
 */

const GraphQLClient = (() => {
  const GQL_ENDPOINT  = '/graphql';
  const REQUEST_TYPE  = 'application/vnd.pepper.v1+json';
  const PEPPER_TXN    = 'threads.show.deal';
  const MAX_RETRIES   = 3;
  const RETRY_BASE_MS = 1000;

  // ── CSRF token ──────────────────────────────────────────────────────────────

  function _getCsrfToken() {
    // 1. Meta tag (most reliable)
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content');

    // 2. Cookie fallback
    const m = document.cookie.match(/xsrf_t=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);

    return null;
  }

  // ── Core fetch ──────────────────────────────────────────────────────────────

  /**
   * Execute a GraphQL query via POST.
   * @param {string} query       – GraphQL query string
   * @param {Object} variables   – variables object
   * @returns {Promise<Object>}  – parsed { data, errors }
   */
  async function query(queryStr, variables = {}) {
    const token = _getCsrfToken();
    const headers = {
      'Content-Type':   'application/json',
      'x-request-type': REQUEST_TYPE,
      'x-pepper-txn':   PEPPER_TXN,
    };
    if (token) headers['x-xsrf-token'] = token;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(GQL_ENDPOINT, {
        method:      'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({ query: queryStr, variables }),
      });

      // Rate-limit: honour Retry-After header, then retry
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After'), 10) || (attempt * 2);
        console.warn(`[MDM GQL] Rate-limited. Warte ${retryAfter}s (Versuch ${attempt}/${MAX_RETRIES})…`);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        if (attempt === MAX_RETRIES) throw new Error('[MDM GQL] Rate-limit: maximale Wiederholungen erreicht');
        continue;
      }

      if (!response.ok) {
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_BASE_MS * attempt));
          continue;
        }
        throw new Error(`[MDM GQL] HTTP ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      if (json.errors?.length) {
        console.warn('[MDM GQL] GraphQL errors:', json.errors);
      }
      return json;
    }
  }

  // ── Comment queries (tested & working) ─────────────────────────────────────

  // Note: preparedHtmlContent (HTML) and createdAtTs (unix timestamp) are confirmed
  // working field names from the mydealz GraphQL API (verified in MyDealz_01_Deep_State_AI_Exporter).
  const Q_COMMENTS = `
    query comments($filter: CommentFilter!, $limit: Int, $page: Int) {
      comments(filter: $filter, limit: $limit, page: $page) {
        items {
          commentId
          replyCount
          preparedHtmlContent
          createdAtTs
          voteScore
          user {
            username
            bestBadge { level { name } }
          }
          reactionCounts { type count }
        }
        pagination { last }
      }
    }
  `;

  const Q_REPLIES = `
    query comments($filter: CommentFilter!, $limit: Int) {
      comments(filter: $filter, limit: $limit) {
        items {
          commentId
          parentCommentId
          preparedHtmlContent
          createdAtTs
          voteScore
          user { username }
          reactionCounts { type count }
        }
      }
    }
  `;

  /**
   * Fetch one page of top-level comments for a thread.
   * @param {string|number} threadId
   * @param {number} page    – 1-based
   * @param {number} limit
   */
  async function fetchComments(threadId, page = 1, limit = 50) {
    const variables = {
      filter: {
        threadId: { eq: String(threadId) },
        order:    { direction: 'Ascending' },
      },
      limit,
      page,
    };
    const result = await query(Q_COMMENTS, variables);
    return result?.data?.comments;
  }

  /**
   * Fetch all comment pages for a thread.
   * @param {string|number} threadId
   * @param {Function}      onProgress – optional (currentPage, totalPages) callback
   */
  async function fetchAllComments(threadId, onProgress) {
    const all   = [];
    let   page  = 1;
    let   total = 1;

    do {
      const batch = await fetchComments(threadId, page);
      if (!batch) break;
      all.push(...(batch.items ?? []));
      total = batch.pagination?.last ?? page;
      onProgress?.(page, total);
      page++;
    } while (page <= total);

    return all;
  }

  /**
   * Fetch replies to a specific top-level comment.
   * @param {string} mainCommentId
   * @param {string|number} threadId
   */
  async function fetchReplies(mainCommentId, threadId) {
    const variables = {
      filter: {
        mainCommentId,
        threadId: { eq: String(threadId) },
      },
      limit: 200,
    };
    const result = await query(Q_REPLIES, variables);
    return result?.data?.comments?.items ?? [];
  }

  // ── Thread / Deal Detail query ──────────────────────────────────────────────
  //
  // PRIMARY DATA SOURCE STRATEGY (as requested):
  //   1. window.__INITIAL_STATE__  → free, already on page, most stable
  //   2. GraphQL POST              → this query, best-effort (query name guessed)
  //   3. DOM CSS selectors         → last resort fallback
  //
  // The query name "thread" is inferred from the pepper platform schema pattern.
  // It should survive deploys since GQL schema fields are much more stable than
  // CSS class names. Introspection is disabled, so we can't auto-discover names.

  const Q_THREAD = `
    query thread($id: ID!) {
      thread(id: $id) {
        threadId
        title
        price
        temperature
        status
        publishedAt
        merchant {
          merchantId
          merchantName
        }
        user {
          userId
          username
          imageUrls
        }
        mainImage {
          path
          width
          height
        }
        commentCount
        voteCount
        isExpired
        threadType
      }
    }
  `;

  /**
   * Fetch full deal data for a single thread by ID via GraphQL.
   * Falls back to null if the query name doesn't match the server schema.
   * @param {string|number} threadId
   * @returns {Promise<Object|null>}
   */
  async function fetchThread(threadId) {
    try {
      const result = await query(Q_THREAD, { id: String(threadId) });
      return result?.data?.thread ?? null;
    } catch (e) {
      console.warn(`[MDM GQL] fetchThread(${threadId}) failed:`, e.message);
      return null;
    }
  }

  /**
   * Fetch multiple threads by IDs. Batches via Promise.all.
   * @param {Array<string|number>} ids
   * @returns {Promise<Object[]>} – array of thread objects (nulls filtered)
   */
  async function fetchThreads(ids) {
    const results = await Promise.all(ids.map(fetchThread));
    return results.filter(Boolean);
  }

  // ── Thread search query ─────────────────────────────────────────────────────

  const Q_SEARCH_THREADS = `
    query searchThreads($query: String!, $limit: Int, $page: Int, $order: ThreadOrder) {
      search(query: $query, limit: $limit, page: $page, order: $order) {
        items {
          threadId
          title
          price
          temperature
          merchant { merchantId merchantName }
          user { username }
          status
          publishedAt
        }
        pagination { last total }
      }
    }
  `;

  /**
   * Search threads (best-effort – query name/fields may differ per deploy).
   * Falls back gracefully if query isn't supported.
   */
  async function searchThreads(searchQuery, { limit = 20, page = 1 } = {}) {
    try {
      const result = await query(Q_SEARCH_THREADS, { query: searchQuery, limit, page });
      return result?.data?.search;
    } catch (e) {
      console.warn('[MDM GQL] searchThreads not available:', e.message);
      return null;
    }
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  /**
   * Normalise a comment item to a simpler shape.
   */
  function normaliseComment(item) {
    return {
      id:        item.commentId,
      user:      item.user?.username ?? 'unknown',
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

  return {
    query,
    fetchThread,
    fetchThreads,
    fetchComments,
    fetchAllComments,
    fetchReplies,
    searchThreads,
    normaliseComment,
    getCsrfToken: _getCsrfToken,
  };
})();

if (typeof module !== 'undefined') module.exports = { GraphQLClient };
