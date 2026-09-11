/**
 * deal-filter-engine.js
 * Pure evaluation logic — no DOM writes, no storage access.
 *
 * Rückgabe: { hide, ghost, tier, reason }
 *
 * ── Filtersyntax (pro Eintrag in excludeWords) ─────────────────────────────
 *
 *   "apple"           Ganzes Wort "apple" (nicht "pineapple")
 *   "apple zubehör"   apple UND zubehör müssen beide vorkommen (AND)
 *   "+apple +iphone"  explizit AND (identisch zu "apple iphone")
 *   "-apple"          Deal wird NICHT ausgeblendet wenn apple vorkommt (Ausnahme)
 *   "apple -zubehör"  apple kommt vor UND zubehör kommt NICHT vor
 *   "*pro"            Wildcard: alles was MIT "pro" ENDEN (macpro, ipadpro — nicht "Profi")
 *   "pro*"            Wildcard: alles was mit "pro" BEGINNEN ("Profi" ja, "macpro" nein)
 *   "apple *zubehör*" apple (Wortgrenze) + beliebiger String mit "zubehör"
 *   '"passend für"'   Exakte Phrase (Anführungszeichen)
 *
 * Prüffelder: Titel + Beschreibung (combined searchText)
 *
 * Wortgrenzenerkennung: Unicode-aware (kennt Umlaute ä/ö/ü/ß).
 *   "apple" trifft "Apple Watch" aber NICHT "pineapple"
 *   "zubehör" trifft "Apple Zubehör" aber NICHT "Fahrradzubehör"
 *
 * Tier-Logik (läuft NACH allen anderen Filtern):
 *   Tier A: Preis <= tierAMax           -> immer sichtbar
 *   Tier B: tierAMax < Preis <= tierBMax -> gedimmt (ghost)
 *   Tier C: Preis > tierBMax            -> ausgeblendet
 */

const DealFilterEngine = (() => {

  // ── Reguläre Ausdrucks-Helfer ─────────────────────────────────────────────

  // Alle Buchstaben-Zeichen inkl. deutsche Umlaute
  const WORD_CHARS = 'a-zA-ZäöüÄÖÜß0-9';

  function _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Erstellt einen Word-Boundary-Regex für ein Wort (Unicode-aware).
   * Berücksichtigt Umlaute als Wortzeichen.
   */
  function _wordRegex(word) {
    const esc = _escapeRegex(word);
    return new RegExp(
      `(?<![${WORD_CHARS}])${esc}(?![${WORD_CHARS}])`,
      'i'
    );
  }

  /**
   * Prüft ob ein einzelnes Pattern im Text vorkommt.
   * Wildcard-Glob-Semantik:
   *   *foo  → Wort ENDET auf "foo"   (macpro, iPad Pro — nicht "Profi")
   *   foo*  → Wort BEGINNT mit "foo" ("Profi" ja, "macpro" nein)
   *   *foo* → enthält "foo"          (auch mitten im Wort)
   * Phrase (enthält Leerzeichen) → Substring-Match.
   * Sonst → Word-Boundary-Match.
   */
  function _matchesPattern(pattern, text) {
    if (pattern.includes('*')) {
      // Glob-zu-Regex: * → [\s\S]*
      const base = _escapeRegex(pattern).replace(/\\\*/g, '[\\s\\S]*');
      const lead  = pattern.startsWith('*');
      const trail = pattern.endsWith('*');
      if (lead && trail) return new RegExp(base, 'i').test(text);                      // *foo* = enthält
      if (lead)          return new RegExp(base + `(?![${WORD_CHARS}])`, 'i').test(text); // *foo = endet auf
      if (trail)         return new RegExp(`(?<![${WORD_CHARS}])` + base, 'i').test(text); // foo* = beginnt mit
      // Sterne nur mittig (app*le): wie *foo* behandeln
      return new RegExp(base, 'i').test(text);
    }
    if (pattern.includes(' ')) {
      // Exakte Phrase (Leerzeichen im Term → Substring)
      return text.toLowerCase().includes(pattern.toLowerCase());
    }
    // Normales Wort → Word-Boundary
    return _wordRegex(pattern).test(text);
  }

  /**
   * Parst einen Filter-Ausdruck und prüft ihn gegen searchText.
   *
   * Jeder Token im Ausdruck kann sein:
   *   - kein Prefix oder "+": muss im Text vorkommen (require)
   *   - "-":                  darf NICHT im Text vorkommen (exclude)
   *
   * Alle Tokens werden per AND verknüpft.
   * Leerer Ausdruck → trifft nie zu (safe default).
   *
   * @param {string} expr       Filter-Ausdruck
   * @param {string} searchText Titel + Beschreibung kombiniert (lowercase ok)
   * @returns {boolean} true = Ausdruck passt → Deal ausblenden
   */
  function _matchesExpression(expr, searchText) {
    // Tokenizer: erkennt "quoted phrases", +word, -word, *wild*, normalword
    const TOKEN_RE = /([+\-])?(?:"([^"]+)"|(\S+))/g;
    let match;
    let hasTokens = false;

    while ((match = TOKEN_RE.exec(expr)) !== null) {
      const [, prefix, quoted, word] = match;
      const term = (quoted ?? word ?? '').trim();
      if (!term) continue;
      hasTokens = true;

      const shouldExclude = prefix === '-';
      const occurs = _matchesPattern(term, searchText);

      // require: muss vorkommen
      if (!shouldExclude && !occurs) return false;
      // exclude: darf nicht vorkommen
      if (shouldExclude && occurs)  return false;
    }

    return hasTokens; // leerer Ausdruck trifft nie zu
  }

  // ── Hilfsrückgaben ────────────────────────────────────────────────────────

  const hidden  = (reason) => ({ hide: true,  ghost: false, tier: null, reason });
  const visible = (tier, reason = '') => ({ hide: false, ghost: false, tier, reason });
  const ghosted = (reason) => ({ hide: false, ghost: true,  tier: 'B', reason });

  // ── Cent-Integer-Arithmetik ───────────────────────────────────────────────
  //
  // Preisvergleiche laufen IMMER in Cent-Integern, nie in Euro-Floats:
  //   0.1 + 0.2 !== 0.3, und parseFloat("16,66") → 16.659999... — solche
  //   Floats schlagen bei direktem Vergleich fehl ("19.99 > Max 19.99").
  // Math.round(v * 100) macht den Vergleich exakt; negative Werte sind
  // zwar keine realen Preise, werden aber korrekt gerundet (Safety).

  function _cents(euro) {
    return Math.round(euro * 100);
  }

  // ── Haupt-Evaluierung ─────────────────────────────────────────────────────

  /**
   * @param {Object} deal     - DealData von DealParser.parse()
   * @param {Object} settings - SettingsStore.settings snapshot
   * @returns {{ hide: boolean, ghost: boolean, tier: string|null, reason: string }}
   */
  function evaluate(deal, settings) {

    // Kombinierter Suchtext: Titel + Beschreibung
    // Leerzeichen trennt damit Wörter nicht über Feldgrenzen hinweg matchen
    const titleLower = (deal.title ?? '').toLowerCase();
    const descLower  = (deal.description ?? '').toLowerCase();
    const searchText = titleLower + ' ' + descLower;

    // 1. Manuell ausgeblendet
    if (deal.id && settings.mdm_hiddenDeals?.[deal.id]) {
      return hidden('manuell ausgeblendet');
    }

    // 2. Whitelist-Override (bypassen alle anderen Filterregeln)
    const whitelistWords = settings.mdm_whitelistWords ?? [];
    if (whitelistWords.length > 0) {
      const isWhitelisted = whitelistWords.some(w => {
        if (!w) return false;
        return _matchesExpression(w, searchText);
      });
      if (isWhitelisted) return visible('A', 'Whitelist-Treffer');
    }

    // 3. Ausschlusswörter — jetzt mit Ausdrucks-Syntax und Word-Boundary
    //    Jeder Eintrag ist ein eigenständiger Ausdruck.
    //    "apple zubehör" blendet nur Deals aus die BEIDE Wörter enthalten.
    const excludeWords = settings.mdm_excludeWords ?? [];
    for (const expr of excludeWords) {
      if (!expr) continue;
      if (_matchesExpression(expr, searchText)) {
        return hidden(`Filterausdruck: "${expr}"`);
      }
    }

    // 4. Geblockte User
    const blockedUsers = settings.mdm_blockedUsers ?? [];
    const username = (deal.username ?? '').toLowerCase();
    for (const u of blockedUsers) {
      if (!u) continue;
      if (username === u.toLowerCase()) return hidden(`User geblockt: "${u}"`);
    }

    // 5. Gesperrte Händler (nach ID)
    const excludedMerchants = settings.mdm_excludeMerchantsData ?? {};
    if (deal.merchantId && excludedMerchants[deal.merchantId]) {
      return hidden(`Händler gesperrt: ${deal.merchantId}`);
    }

    // 6. Gesperrte Händler (nach Name, fuzzy im Händler-Feld UND Titel)
    //    (Checkbox-Versprechen: "Händlernamen auch im Titel prüfen")
    if (settings.mdm_hideMatchingMerchantNames) {
      const merchantNameLower = (deal.merchantName ?? '').toLowerCase();
      const titleLowerMerchant = titleLower; // Deal-Titel (bereits lowercased)
      for (const [, m] of Object.entries(excludedMerchants)) {
        if (!m.name) continue;
        const nameLower = m.name.toLowerCase();
        if (merchantNameLower.includes(nameLower) || titleLowerMerchant.includes(nameLower)) {
          return hidden(`Händlername gesperrt: "${m.name}"`);
        }
      }
    }

    // 7. Maximaler Preis (Cent-Integer-Vergleich)
    const maxPrice = settings.mdm_maxPrice;
    if (maxPrice != null && deal.price != null) {
      if (_cents(deal.price) > _cents(maxPrice)) return hidden(`${deal.price}€ > Max ${maxPrice}€`);
    }

    // 8. Kalte Deals ausblenden
    if (settings.mdm_hideColdDeals && deal.temperature != null) {
      if (deal.temperature < 0) return hidden(`Kalt (${deal.temperature}°)`);
    }

    // 9. Selbst cold-gevotete Deals
    if (settings.mdm_hideOwnColdVotes && deal.userVote === 'cold') {
      return hidden('Selbst cold-gevotet');
    }

    // 10. NSFW-gegraute Deals ausblenden
    //     Quelle: Community-Sammlung Thread 2035404, Kommentar 46038487
    //     (uBlock-Lösung dort; hier als sauberes Setting im Deal-Parser)
    if (settings.mdm_hideNsfw && deal.isNsfw) {
      return hidden('NSFW (Bilder ausgegraut)');
    }

    // 11. Mindest-Rabatt in %
    const minDiscount = settings.mdm_minDiscount;
    if (minDiscount != null && minDiscount > 0) {
      if (deal.discountPct == null) {
        return hidden(`Kein Rabatt (mind. ${minDiscount}% gefordert)`);
      }
      const savingPct = -deal.discountPct; // discountPct ist negativ für Ersparnis
      if (savingPct < minDiscount) {
        return hidden(`Rabatt ${savingPct}% < Minimum ${minDiscount}%`);
      }
    }

    // 12. Preis-Tier-System (läuft nach allen anderen Filtern, Cent-Integer-Vergleich)
    //     Kein Preis → Tier A (sichtbar lassen)
    if (settings.mdm_tierEnabled && deal.price != null) {
      const aMax = _cents(settings.mdm_tierAMax ?? 100);
      const bMax = _cents(settings.mdm_tierBMax ?? 600);
      const p    = _cents(deal.price);
      const aEuro = settings.mdm_tierAMax ?? 100;
      const bEuro = settings.mdm_tierBMax ?? 600;

      if (p <= aMax)      return visible('A', `Tier A (≤${aEuro}€)`);
      else if (p <= bMax) return ghosted(`Tier B (${aEuro}–${bEuro}€, aktuell ${deal.price}€)`);
      else                return hidden(`Tier C (>${bEuro}€, aktuell ${deal.price}€)`);
    }

    return visible(null);
  }

  // Exportiere auch den Ausdrucks-Matcher für Tests und externe Nutzung
  return { evaluate, matchesExpression: _matchesExpression };

})();

if (typeof module !== 'undefined') module.exports = { DealFilterEngine };
