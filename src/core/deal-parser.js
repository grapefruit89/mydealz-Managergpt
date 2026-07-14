/**
 * deal-parser.js
 * Extracts structured data from a deal <article> element.
 *
 * Verified against live mydealz.de HTML (July 2026, article#thread_2806177).
 *
 * Strategy (most stable → least stable):
 *   1. window.__INITIAL_STATE__ — SSR JSON, immune to CSS renames
 *   2. data-t attributes        — analytics tracking attrs, very stable
 *   3. cept-* / js-* classes   — semantic classes, moderately stable
 *   4. structural CSS classes   — design classes, breaks on redesigns
 *
 * Returned DealData shape: see BLUEPRINT.md §2
 */

// ── Confirmed selectors (from live HTML, July 2026) ───────────────────────────
const SEL = {
  // Article detection
  deal:         'article[data-t="thread"]',
  dealFallback: 'article.thread--deal, article.thread--voucher, article[class*="thread--"]',

  // Title — data-t is stable (analytics system)
  titleLink:    '[data-t="threadLink"]',
  titleAlt:     '.cept-tt, .js-thread-title',

  // Merchant — data-t stable
  merchant:     '[data-t="merchantLink"]',

  // Comments link
  commentsLink: '[data-t="commentsLink"]',

  // External deal link (tracked redirect)
  dealLink:     '[data-t="dealLink"]',

  // Price — thread-price is a cept-style semantic class, relatively stable
  price: [
    '.thread-price',
    '.threadItemCard-price',
    '.cept-price',
  ],

  // Original (crossed-out) price — mehrere Fallbacks von stabil → fragil:
  //   del           = semantisches HTML (zukunftssicher)
  //   lineThrough   = mydealz-Designklasse (bekannt, aber umbenennbar)
  //   [class*=...]  = fängt Umbenennungen wie "text--lineThrough2" ab
  priceOrigSelectors: [
    'del',
    '.text--lineThrough',
    '[class*="lineThrough"]',
    '[class*="original-price"]',
    '[class*="crossed"]',
  ],

  // Discount badge — mehrere Fallbacks:
  //   textBadge--*  = bekannte mydealz-Klassen
  //   [class*=...]  = fängt Varianten wie textBadge--orange ab
  //   Keine [class*="discount"] weil zu breit (trifft auch andere Elemente)
  discountSelectors: [
    '.textBadge--green',
    '.textBadge--red',
    '[class*="textBadge"]',
    '[class*="savingBadge"]',
    '[class*="saving-badge"]',
  ],

  // Temperature — cept-vote-temp is semantic, stable
  tempWrap:   '.cept-vote-temp',                      // has title="... 1809°..."
  tempValue:  '.cept-vote-temp .overflow--wrap-off',  // text = "1809°"
  isHot:      '.vote-temp--burn, .vote-temp--hot',    // burn = sehr heiß, hot = heiß (beide >0°)
  isWarm:     '.vote-temp--warm',                     // ✅ confirmed: moderate positive temp

  // Own vote detection — mode-selected = user has voted
  downVoteBtn:  '.vote-button--mode-down',            // down-vote button
  upVoteBtn:    '.vote-button--mode-up',              // up-vote button
  // cold-voted:  downVoteBtn has .vote-button--mode-selected AND title="Abstimmung rückgängig..."
  // hot-voted:   upVoteBtn   has .vote-button--mode-selected

  // User avatar — alt="Robert_Chi's Profilbild" pattern
  avatar: 'img[alt*="Profilbild"]',

  // Deal image
  image: '.threadListCard-image img, .imgFrame-img, img.thread-image',

  // Description (short text, hidden on mobile)
  description: '.userHtml-content .overflow--wrap-break',

  // Status chip
  statusChip: '.chip--variant-outlined',

  // Flags
  expired: '.thread--expired',
  voucher: '.thread--voucher',
};

// ── __INITIAL_STATE__ cache ───────────────────────────────────────────────────

let _stateCache = null;

function _getInitialState() {
  if (_stateCache !== null) return _stateCache;
  try {
    const s = window.__INITIAL_STATE__;
    _stateCache = (s && typeof s === 'object') ? s : false;
  } catch { _stateCache = false; }
  return _stateCache;
}

function _threadFromState(dealId) {
  const s = _getInitialState();
  if (!s || !dealId) return null;

  // Probe all known paths
  const candidates = [
    s?.thread,
    s?.threads?.[dealId],
    s?.dealList?.threads?.[dealId],
    s?.listing?.threads?.[dealId],
    s?.search?.threads?.[dealId],
  ];
  for (const t of candidates) {
    if (t && String(t.threadId ?? t.id) === String(dealId)) return t;
  }

  // Linear scan fallback
  for (const map of [s?.threads, s?.dealList?.threads, s?.listing?.threads, s?.search?.threads]) {
    if (map?.[dealId]) return map[dealId];
  }
  return null;
}

// ── Parse helpers ─────────────────────────────────────────────────────────────

function _price(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (t === 'gratis' || t === 'kostenlos' || t === 'free') return 0;
  const v = parseFloat(t.replace(/[^\d,.]/g, '').replace(',', '.'));
  return isNaN(v) ? null : v;
}

function _temp(text) {
  if (!text) return null;
  // Extract number from "1809°" or from "Derzeit bewertet mit 1809°..."
  const m = text.match(/([-\d]+)°/);
  return m ? parseInt(m[1], 10) : null;
}

function _discountPct(el) {
  if (!el) return null;
  // "-58% " or "+38%" — parse to signed integer
  const raw = el.textContent?.trim() ?? '';
  const m = raw.match(/([-+]?\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function _userVote(el) {
  const downBtn = el.querySelector('.vote-button--mode-down');
  const upBtn   = el.querySelector('.vote-button--mode-up');
  if (downBtn?.classList.contains('vote-button--mode-selected')) return 'cold';
  if (upBtn?.classList.contains('vote-button--mode-selected'))   return 'hot';
  return null; // no own vote
}

function _dealId(el) {
  // 1. data-t-d JSON attribute — most reliable
  try {
    const raw = el.dataset?.tD;
    if (raw) return String(JSON.parse(raw).id);
  } catch { /* fall through */ }
  // 2. id="thread_2806177"
  const idAttr = el.id;
  if (idAttr?.startsWith('thread_')) return idAttr.split('_')[1];
  return null;
}

function _idFromHref(href) {
  return href?.match(/-(\d+)(?:[?#].*)?$/)?.[1] ?? null;
}

function _merchantId(href) {
  return href?.match(/merchant-id=(\d+)/)?.[1] ?? null;
}

function _first(root, ...sels) {
  for (const s of sels.flat()) {
    const el = root.querySelector(s);
    if (el) return el;
  }
  return null;
}

function _comments(el) {
  const link = el.querySelector(SEL.commentsLink);
  if (!link) return 0;
  // Text is "<svg>... 34" — take last whitespace-separated token
  const parts = link.textContent?.trim().split(/\s+/);
  return parseInt(parts?.[parts.length - 1]) || 0;
}

function _userId(src) {
  return src?.match(/users\/raw\/default\/(\d+)_/)?.[1] ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

const DealParser = {
  /**
   * Parse a single deal article element.
   * Returns synchronously (prefers __INITIAL_STATE__ → DOM).
   * For async GQL enrichment, call parseAsync() instead.
   * @param {HTMLElement} el
   * @returns {Object} DealData (see BLUEPRINT.md §2)
   */
  parse(el) {
    const dealId = _dealId(el);

    // 1. Try __INITIAL_STATE__ first (free, already on page)
    const state = _threadFromState(dealId);
    if (state) return _fromState(state, el, dealId);

    // 2. Fallback: DOM selectors
    return _fromDom(el, dealId);
  },

  /**
   * Async version: tries __INITIAL_STATE__ → GraphQL → DOM.
   * Use this when high data accuracy is needed (e.g. for filter evaluation on
   * pages where __INITIAL_STATE__ is incomplete, like dynamically-loaded cards).
   *
   * @param {HTMLElement} el
   * @returns {Promise<Object>} DealData
   */
  async parseAsync(el) {
    const dealId = _dealId(el);

    // 1. __INITIAL_STATE__
    const state = _threadFromState(dealId);
    if (state) return _fromState(state, el, dealId);

    // 2. GraphQL — primary structured data source (query name best-guess)
    if (dealId && typeof GraphQLClient !== 'undefined') {
      try {
        const gqlThread = await GraphQLClient.fetchThread(dealId);
        if (gqlThread) return _fromGQL(gqlThread, el, dealId);
      } catch { /* fall through */ }
    }

    // 3. DOM selectors — last resort
    return _fromDom(el, dealId);
  },

  /** All deal article elements in the current document. */
  findAll() {
    const primary = document.querySelectorAll(SEL.deal);
    if (primary.length) return Array.from(primary);
    return Array.from(document.querySelectorAll(SEL.dealFallback));
  },

  /** Call after SPA navigation to reset the __INITIAL_STATE__ cache. */
  resetStateCache() { _stateCache = null; },

  SEL,
};

// ── Extract from __INITIAL_STATE__ ───────────────────────────────────────────

function _fromState(t, el, dealId) {
  const id          = dealId ?? String(t.threadId ?? t.id ?? '');
  const merchantId  = String(t.merchant?.merchantId ?? t.merchantId ?? '');
  const merchantName= t.merchant?.merchantName ?? t.merchantName ?? '';
  const username    = t.user?.username ?? t.submitter?.username ?? '';
  const userId      = String(t.user?.userId ?? '');
  const priceRaw     = t.price ?? t.mainPrice;
  const price        = priceRaw != null ? parseFloat(priceRaw) : null;
  // nextBestPrice = Vergleichspreis / durchgestrichener Originalpreis im State
  const priceOrigRaw = t.nextBestPrice ?? t.originalPrice ?? null;
  const priceOrigState = priceOrigRaw != null ? parseFloat(priceOrigRaw) : null;
  const temperature = t.temperature != null ? parseFloat(t.temperature) : null;
  const isExpired   = !!(t.status === 'expired' || t.expired);
  const isVoucher   = !!(t.type === 'voucher');

  // Prefer DOM for href / image since state URLs might be relative
  const titleEl = el.querySelector(SEL.titleLink) ?? el.querySelector(SEL.titleAlt);
  const href    = titleEl?.href ?? '';

  return {
    id,
    href,
    externalHref: el.querySelector(SEL.dealLink)?.href ?? '',
    title:        t.title ?? t.threadTitle ?? titleEl?.title ?? titleEl?.textContent?.trim() ?? '',
    description:  el.querySelector(SEL.description)?.textContent?.trim() ?? '',
    price:        isNaN(price) ? null : price,
    priceOrig:    (!isNaN(priceOrigState) && priceOrigState != null) ? priceOrigState : null,
    discount:     null,
    shipping:     null,
    temperature:  isNaN(temperature) ? null : temperature,
    isHot:        temperature != null && temperature > 0,
    isCold:       temperature != null && temperature < 0,
    merchantId,
    merchantName,
    username,
    userId,
    userAvatarUrl:'',
    imageUrl:     el.querySelector(SEL.image)?.src ?? '',
    imageAlt:     el.querySelector(SEL.image)?.alt ?? '',
    commentCount: _comments(el),
    isExpired,
    isVoucher,
    statusText:   el.querySelector(SEL.statusChip)?.textContent?.trim() ?? '',
    element: el,
    _source: 'state',
  };
}

// ── Extract from GraphQL response ────────────────────────────────────────────
// Maps the thread object returned by GraphQLClient.fetchThread() to DealData.
// Field names are best-guesses from the pepper platform schema — update if GQL
// returns different names (log the raw response to console with debugEnabled).

function _fromGQL(t, el, dealId) {
  const id          = dealId ?? String(t.threadId ?? t.id ?? '');
  const merchantId  = String(t.merchant?.merchantId ?? '');
  const merchantName= t.merchant?.merchantName ?? '';
  const username    = t.user?.username ?? '';
  const userId      = String(t.user?.userId ?? '');
  const priceRaw    = t.price;
  const price       = priceRaw != null ? parseFloat(priceRaw) : null;
  const temperature = t.temperature != null ? parseFloat(t.temperature) : null;
  const isExpired   = !!(t.status === 'expired' || t.isExpired);
  const isVoucher   = !!(t.threadType === 'voucher');

  // DOM still used for fields GQL doesn't expose:
  const titleEl     = el.querySelector(SEL.titleLink) ?? el.querySelector(SEL.titleAlt);
  const href        = titleEl?.href ?? '';
  const discountEl  = _first(el, ...SEL.discountSelectors);
  const discountPct = _discountPct(discountEl);
  const userVote    = _userVote(el);

  // Image URL from GQL mainImage or DOM fallback
  const imageUrl = t.mainImage?.path
    ? `https://static.mydealz.de${t.mainImage.path}`
    : (el.querySelector(SEL.image)?.src ?? '');

  return {
    id,
    href,
    externalHref: el.querySelector(SEL.dealLink)?.href ?? '',
    title:        t.title ?? titleEl?.title ?? '',
    description:  el.querySelector(SEL.description)?.textContent?.trim() ?? '',
    price:        isNaN(price) ? null : price,
    priceOrig:    null,  // not in GQL thread query
    discount:     discountEl?.textContent?.trim() ?? null,
    discountPct,
    shipping:     null,  // not in GQL thread query
    temperature:  isNaN(temperature) ? null : temperature,
    isHot:        temperature != null && temperature > 0,
    isWarm:       false, // can't determine without DOM class
    isCold:       temperature != null && temperature < 0,
    userVote,
    merchantId,
    merchantName,
    username,
    userId,
    userAvatarUrl:t.user?.imageUrls?.['60x60'] ?? '',
    imageUrl,
    imageAlt:     el.querySelector(SEL.image)?.alt ?? t.title ?? '',
    commentCount: t.commentCount ?? _comments(el),
    isExpired,
    isVoucher,
    statusText:   el.querySelector(SEL.statusChip)?.textContent?.trim() ?? '',
    element: el,
    _source: 'graphql',
  };
}

// ── Extract from DOM ──────────────────────────────────────────────────────────

function _fromDom(el, dealId) {
  // Title
  const titleEl  = _first(el, SEL.titleLink, SEL.titleAlt);
  const title    = titleEl?.title || titleEl?.textContent?.trim() ?? '';
  const href     = titleEl?.href ?? '';
  const id       = dealId ?? _idFromHref(href);

  // Price
  const priceEl   = _first(el, ...SEL.price);
  const price     = _price(priceEl?.textContent);
  const origEl    = _first(el, ...SEL.priceOrigSelectors);
  const priceOrig = _price(origEl?.textContent);
  const discountEl  = _first(el, ...SEL.discountSelectors);
  const discountPct = _discountPct(discountEl); // e.g. -58 (negative = saving)
  const discount    = discountEl?.textContent?.trim() || null; // raw string "-58%"

  // Temperature — try .overflow--wrap-off text first, then title attribute
  const tempValueEl = el.querySelector(SEL.tempValue);
  const tempWrapEl  = el.querySelector(SEL.tempWrap);
  const temperature = _temp(tempValueEl?.textContent) ?? _temp(tempWrapEl?.title);
  const isHot  = !!el.querySelector(SEL.isHot);
  const isWarm = !!el.querySelector(SEL.isWarm);

  // Own vote — vote-button--mode-selected marks user's own vote
  const userVote = _userVote(el); // 'hot' | 'cold' | null

  // Merchant
  const merchantEl  = el.querySelector(SEL.merchant);
  const merchantId  = _merchantId(merchantEl?.href) ?? '';
  const merchantName= merchantEl?.textContent?.trim() ?? '';

  // User
  const avatarEl    = el.querySelector(SEL.avatar);
  const username    = avatarEl?.alt?.replace(/'s Profilbild$/, '').trim() ?? '';
  const userId      = _userId(avatarEl?.src) ?? '';

  // Image
  const imageEl = el.querySelector(SEL.image);

  // Shipping — truck icon sibling text
  let shipping = null;
  const truckSvg = el.querySelector('.icon--truck');
  if (truckSvg) {
    const truckParent = truckSvg.closest('span, div');
    const raw = truckParent?.textContent?.replace('inkl.', '').trim() ?? '';
    const v = _price(raw);
    shipping = v; // 0 = kostenlos, null = unbekannt, number = Betrag
  }

  return {
    id,
    href,
    externalHref: el.querySelector(SEL.dealLink)?.href ?? '',
    title,
    description:  el.querySelector(SEL.description)?.textContent?.trim() ?? '',
    price,
    priceOrig,
    discount,           // raw string "-58% "
    discountPct,        // signed integer: -58 means 58% saving, +10 means 10% markup
    shipping,
    temperature,
    isHot:        temperature != null ? temperature > 0 : isHot,
    isWarm,
    isCold:       temperature != null && temperature < 0,
    userVote,           // 'hot' | 'cold' | null
    merchantId,
    merchantName,
    username,
    userId,
    userAvatarUrl:avatarEl?.src ?? '',
    imageUrl:     imageEl?.src ?? '',
    imageAlt:     imageEl?.alt ?? '',
    commentCount: _comments(el),
    isExpired:    el.classList.contains('thread--expired') || !!el.querySelector(SEL.expired),
    isVoucher:    el.classList.contains('thread--voucher'),
    statusText:   el.querySelector(SEL.statusChip)?.textContent?.trim() ?? '',
    element: el,
    _source: 'dom',
  };
}

if (typeof module !== 'undefined') module.exports = { DealParser, SEL };
