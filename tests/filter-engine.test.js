/**
 * tests/filter-engine.test.js
 * Filter-Engine: Ausdrucksmatcher (Umlaute, Wildcards, Phrasen, AND/NOT)
 * und Cent-Integer-Arithmetik (Preis ×100).
 * Run: node tests/filter-engine.test.js
 */

const { loadBundle, assert, src } = require('./harness.js');

const { DealFilterEngine } = loadBundle([src('features', 'deal-filter-engine.js')], {
  expose: ['DealFilterEngine'],
});

const base = { id: '1', title: '', description: '' };
const s = {
  mdm_hiddenDeals: {}, mdm_whitelistWords: [], mdm_excludeWords: [],
  mdm_blockedUsers: [], mdm_excludeMerchantsData: {},
};

console.log('filter-engine.test.js — Ausdrucks-Matcher');

// ── Word-Boundary ─────────────────────────────────────────────────────────────
{
  const st = { ...s, mdm_excludeWords: ['apple'] };
  assert(DealFilterEngine.evaluate({ ...base, title: 'Apple Watch 46mm' }, st).hide, '"apple" trifft "Apple Watch"');
  assert(!DealFilterEngine.evaluate({ ...base, title: 'pineapple pizza' }, st).hide, '"apple" trifft NICHT "pineapple" (Wortgrenze)');
}

// ── Umlaute ──────────────────────────────────────────────────────────────────
{
  const st = { ...s, mdm_excludeWords: ['zubehör'] };
  assert(DealFilterEngine.evaluate({ ...base, title: 'Apple Zubehör günstig' }, st).hide, '"zubehör" trifft "Apple Zubehör" (Umlaut, case-insensitive)');
  assert(!DealFilterEngine.evaluate({ ...base, title: 'Fahrradzubehör sale' }, st).hide, '"zubehör" trifft NICHT "Fahrradzubehör"');
}

// ── AND (Leerzeichen) ────────────────────────────────────────────────────────
{
  const st = { ...s, mdm_excludeWords: ['apple zubehör'] };
  assert(DealFilterEngine.evaluate({ ...base, title: 'Apple Watch Zubehör' }, st).hide, '"apple zubehör" = AND → trifft');
  assert(!DealFilterEngine.evaluate({ ...base, title: 'Apple Watch Armband' }, st).hide, '"apple zubehör" = AND → trifft nicht (nur apple)');
}

// ── NOT-Prefix ───────────────────────────────────────────────────────────────
{
  const st = { ...s, mdm_excludeWords: ['apple -zubehör'] };
  assert(!DealFilterEngine.evaluate({ ...base, title: 'Apple Watch Zubehör' }, st).hide, '"apple -zubehör": Zubehör im Titel → sichtbar (Ausnahme)');
  assert(DealFilterEngine.evaluate({ ...base, title: 'Apple iPhone case' }, st).hide, '"apple -zubehör": apple ohne zubehör → hidden');
}

// ── Wildcard-Glob-Semantik ───────────────────────────────────────────────────
{
  const endPat = { ...s, mdm_excludeWords: ['*pro'] };   // endet auf "pro"
  assert(DealFilterEngine.evaluate({ ...base, title: 'iPad Pro 2026' }, endPat).hide, '"*pro": Wort endet auf pro');
  assert(DealFilterEngine.evaluate({ ...base, title: 'macpro deal' }, endPat).hide, '"*pro": macpro');
  assert(!DealFilterEngine.evaluate({ ...base, title: 'Profi-Werkzeug' }, endPat).hide, '"*pro" trifft NICHT "Profi" (kein Wort-Ende)');

  const startPat = { ...s, mdm_excludeWords: ['pro*'] }; // beginnt mit "pro"
  assert(DealFilterEngine.evaluate({ ...base, title: 'Profi-Werkzeug' }, startPat).hide, '"pro*": Profi beginnt mit pro');
  assert(!DealFilterEngine.evaluate({ ...base, title: 'macpro deal' }, startPat).hide, '"pro*" trifft NICHT macpro (kein Wortanfang)');

  const containsPat = { ...s, mdm_excludeWords: ['*case*'] }; // enthält
  assert(DealFilterEngine.evaluate({ ...base, title: 'aircase holder' }, containsPat).hide, '"*case*" = enthält (auch mitten im Wort)');
}

// ── Exakte Phrase ────────────────────────────────────────────────────────────
{
  const st = { ...s, mdm_excludeWords: ['"passend für"'] };
  assert(DealFilterEngine.evaluate({ ...base, title: 'Case passend für iPhone 16' }, st).hide, '"passend für" Phrase trifft');
  assert(!DealFilterEngine.evaluate({ ...base, title: 'passendes für-Set' }, st).hide, 'Phrase: "passendes für" ≠ "passend für"');
}

// ── Whitelist-Override ───────────────────────────────────────────────────────
{
  const st = { ...s, mdm_excludeWords: ['apple'], mdm_whitelistWords: ['iphone'] };
  assert(!DealFilterEngine.evaluate({ ...base, title: 'Apple iPhone 16' }, st).hide, 'Whitelist-Treffer übersteuert Ausschluss');
}

console.log('filter-engine.test.js — Cent-Arithmetik');

// ── Float-Klassiker ──────────────────────────────────────────────────────────
assert(!DealFilterEngine.evaluate({ ...base, price: 19.99 }, { ...s, mdm_maxPrice: 19.99 }).hide,
  '19.99€ bei Max 19.99€ bleibt sichtbar (Float-Grenzfall)');

const artefakt = parseFloat('16,66'.replace(',', '.'));
assert(!DealFilterEngine.evaluate({ ...base, price: artefakt }, { ...s, mdm_maxPrice: 16.66 }).hide,
  'parseFloat-Artefakt 16.659999 vs 16.66 bleibt sichtbar');
assert(DealFilterEngine.evaluate({ ...base, price: artefakt }, { ...s, mdm_maxPrice: 16.65 }).hide === true,
  'parseFloat-Artefakt 16.659999 über Max 16.65 wird ausgeblendet');

assert(!DealFilterEngine.evaluate({ ...base, price: 0.3 }, { ...s, mdm_maxPrice: 0.1 + 0.2 }).hide,
  '0.3€ bei Max (0.1+0.2) bleibt sichtbar');
assert(!DealFilterEngine.evaluate({ ...base, price: 0.1 + 0.2 }, { ...s, mdm_maxPrice: 0.3 }).hide,
  '0.30000000000004€ (Float-Artefakt) wird durch Cent-Rundung korrekt zu 0.3 → sichtbar');

// ── Tier-Grenzen ─────────────────────────────────────────────────────────────
const tierS = { ...s, mdm_tierEnabled: true, mdm_tierAMax: 100, mdm_tierBMax: 600 };
assert(DealFilterEngine.evaluate({ ...base, price: 100 }, tierS).tier === 'A', '100€ exakt = Tier A');
assert(DealFilterEngine.evaluate({ ...base, price: 600 }, tierS).ghost === true, '600€ exakt = Tier B (ghost)');
assert(DealFilterEngine.evaluate({ ...base, price: 600.01 }, tierS).hide === true, '600.01€ = Tier C');
assert(DealFilterEngine.evaluate({ ...base, price: 99.995 }, tierS).tier === 'A', '99.995€ (Float-Artefakt) = Tier A');

// ── Händlernamen auch im Titel (Checkbox-Versprechen) ────────────────────────
{
  const st = {
    ...s,
    mdm_hideMatchingMerchantNames: true,
    mdm_excludeMerchantsData: { '15': { id: '15', name: 'MediaMarkt' } },
  };
  assert(DealFilterEngine.evaluate({ ...base, title: 'MediaMarkt Sale iPhone', merchantName: '' }, st).hide,
    'gesperrter Händlername im Titel → hidden');
  assert(DealFilterEngine.evaluate({ ...base, title: 'iPhone 16', merchantName: 'MediaMarkt Online' }, st).hide,
    'gesperrter Händlername im Händler-Feld → hidden');
  assert(!DealFilterEngine.evaluate({ ...base, title: 'iPhone 16', merchantName: 'Amazon' }, st).hide,
    'kein Treffer → sichtbar');
}

// ── NSFW-Hide (Quelle: Sammlung Thread 2035404 / Kommentar 46038487) ─────────
assert(!DealFilterEngine.evaluate({ ...base, isNsfw: true }, s).hide, 'NSFW-Deal ohne Setting bleibt sichtbar');
assert(DealFilterEngine.evaluate({ ...base, isNsfw: true }, { ...s, mdm_hideNsfw: true }).hide,
  'NSFW-Deal mit hideNsfw → hidden');
assert(!DealFilterEngine.evaluate({ ...base, isNsfw: false }, { ...s, mdm_hideNsfw: true }).hide,
  'normaler Deal mit hideNsfw bleibt sichtbar');

// ── Mindest-Rabatt (Canon: discountPct POSITIV = Ersparnis, DealNormalizer) ──
assert(!DealFilterEngine.evaluate({ ...base, discountPct: 40 }, { ...s, mdm_minDiscount: 30 }).hide,
  'Rabatt 40% ≥ Minimum 30% → sichtbar');
assert(DealFilterEngine.evaluate({ ...base, discountPct: 12 }, { ...s, mdm_minDiscount: 30 }).hide,
  'Rabatt 12% < Minimum 30% → hidden');
assert(DealFilterEngine.evaluate({ ...base, discountPct: -5 }, { ...s, mdm_minDiscount: 30 }).hide,
  'Preis-Markup (discountPct negativ) < Minimum → hidden');
assert(!DealFilterEngine.evaluate({ ...base, discountPct: null }, s).hide,
  'kein minDiscount gesetzt → Rabatt egal');

console.log('filter-engine.test.js PASSED');
