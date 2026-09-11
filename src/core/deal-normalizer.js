/**
 * deal-normalizer.js
 * SSOT für die Thread-Normalisierung aus GraphQL-Daten (Muster: settings-schema.js).
 *
 * Quelle: Claude-Review-Fund 5 (2026-09-11) — drei Thread-Normalizer mit
 * Feld-Drift: discountPct↔priceOff-Logik doppelt, `merchant` (Collector-MD)
 * vs. `merchantName` (GQL/Parser), Unix↔ISO-Zeitstempel, und der Collector
 * normalisierte bereits-normalisierte Objekte ein ZWEITES Mal.
 *
 * Canon (2026-09-11 festgelegt):
 *   - merchantName (nicht `merchant`) — identisch zu DealData (deal-parser)
 *   - discountPct: POSITIV = Ersparnis in % (GQL-Convention; der DOM-Parser
 *     liefert jetzt ebenfalls positiv — Preis-Markup ist negativ)
 *   - publishedAt/createdAt/updatedAt: ISO-Strings (Unix-Sekunden werden
 *     an dieser EINEN Stelle konvertiert)
 *   - Preise: Floats in €, Vergleiche laufen im Filter-Engine in Cent-Integern
 *
 * GQL-Rohfelder live verifiziert (MydealzExporter THREAD_FIELDS 2026-09-09;
 * URL-Fallbacks 2026-09-11, siehe docs/LEARNINGS.md §10).
 */

const DealNormalizer = (() => {

  /** Unix-Sekunden → ISO-String; null bei fehlendem Wert. */
  function _iso(ts) {
    return ts ? new Date(ts * 1000).toISOString() : null;
  }

  /** Relativ-URL ("/deals/foo-123") → absolut; '' bei leeren Werten. */
  function absolute(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : `${location.origin}${url}`;
  }

  /** HTML → Plaintext (innerText bevorzugt, Regex-Fallback für Engines ohne DOM). */
  function htmlToText(html) {
    if (!html) return '';
    let text = '';
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      text = tmp.innerText ?? tmp.textContent ?? '';
    } catch {
      text = String(html);
    }
    if (!text || /<[a-z][\s\S]*>/i.test(text)) {
      text = String(html).replace(/<[^>]+>/g, ' ');
    }
    return text.replace(/\s+/g, ' ').replace(/\n{2,}/g, '\n\n').trim();
  }

  /** Bild-URL aus dem mainImage-Payload (Pepper-CDN-Muster). */
  function buildImageUrl(mainImage) {
    if (!mainImage?.uid || !mainImage?.path) return null;
    // static.<domain>/{path}/{uid}/fs/895x577/qt/65/{uid}
    // (mydealz.de live verifiziert 2026-09-11; Fremd-TLDs: gleiche Engine-Annahme)
    return `https://static.${location.hostname}/${mainImage.path}/${mainImage.uid}/fs/895x577/qt/65/${mainImage.uid}`;
  }

  /**
   * GQL-Thread-Rohobjekt → kanonisches Thread-Objekt.
   * Konsumenten: graphql-client.fetchThreadBatch, collector.collect().
   *
   * @param {Object} d  – GQL thread-Feld (Alias-Antwort)
   * @param {string} id – Thread-ID (aus dem Alias-Key)
   * @returns {Object|null} null bei fehlender ID (leerer Alias etc.)
   */
  function normalizeThread(d, id) {
    if (!d) return null;
    const threadId = String(id ?? d.threadId ?? d.id ?? '');
    if (!threadId) return null;

    // Rabatt % aus GQL-Feld oder aus Preis-Delta berechnen (Export-Muster);
    // Canon: POSITIV = Ersparnis
    let discountPct = d.priceDiscount ?? d.discountPct ?? null;
    if (discountPct == null && d.nextBestPrice && d.price != null && d.nextBestPrice > d.price) {
      discountPct = Math.round((d.nextBestPrice - d.price) / d.nextBestPrice * 100);
    }

    return {
      id: threadId,
      // d.url ist oft relativ — absolutisieren. Fallback: ID-only URL
      // (live verifiziert 2026-09-11: https://mydealz.de/<id> → 301 auf die
      // echte Detailseite; /deals/<id> OHNE Slug wäre die "Ups"-Seite).
      url:            absolute(d.url) || `${location.origin}/${threadId}`,
      shareLink:      d.shareableLink || '',
      title:          d.title || '',
      description:    htmlToText(d.description),
      descriptionHtml: d.description || '',
      price:          d.price ?? null,
      displayPrice:   d.displayPrice || null,
      originalPrice:  d.nextBestPrice ?? null,
      priceOff:       d.priceOff ?? null,
      discountPct,
      shippingFree:   d.shipping?.isFree ?? d.shippingFree ?? null,
      shippingPrice:  d.shipping?.price ?? null,
      temperature:    typeof d.temperature === 'number' ? d.temperature : null,
      temperatureLevel: d.temperatureLevel ?? null,
      commentCount:   d.commentCount ?? null,
      isExpired:      !!(d.isExpired ?? d.expired),
      voucherCode:    d.voucherCode || null,
      type:           d.type ?? null,
      username:       d.user?.username || d.username || '',
      userId:         d.user?.userId ? String(d.user.userId) : String(d.userId ?? ''),
      merchantName:   d.merchant?.merchantName || d.merchantName || '',
      merchantId:     d.merchant?.merchantId ? String(d.merchant.merchantId) : String(d.merchantId ?? ''),
      imageUrl:       buildImageUrl(d.mainImage),
      publishedAt:    _iso(d.publishedAt) ?? (typeof d.publishedAt === 'string' ? d.publishedAt : null),
      createdAt:      _iso(d.createdAt) ?? null,
      updatedAt:      _iso(d.updatedAt) ?? null,
      group:          d.mainGroup?.threadGroupName || null,
      groupPath:      (d.groupsPath ?? []).map(g => g.threadGroupName).filter(Boolean),
      _source: 'graphql',
    };
  }

  return {
    normalizeThread,
    absolute,
    htmlToText,
    buildImageUrl,
  };

})();

if (typeof module !== 'undefined') module.exports = { DealNormalizer };
