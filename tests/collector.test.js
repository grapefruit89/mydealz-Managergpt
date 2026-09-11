/**
 * tests/collector.test.js
 * Collector-Pipeline End-to-End: IDs → GQL-Alias-Batch → Normalisierung → Markdown.
 * Run: node tests/collector.test.js
 */

const { loadBundle, assert, src } = require('./harness.js');

const state = { entities: { threads: { '2810000': {} } }, feeds: { main: { ids: ['2810000'] } } };

const { GraphQLClient, Collector } = loadBundle([
  src('core', 'settings-schema.js'),
  src('core', 'storage.js'),
  src('core', 'logger.js'),
  src('core', 'graphql-client.js'),
  src('features', 'collector.js'),
], {
  expose: ['GraphQLClient', 'Collector'],
  setup() {
    global.window = { location: { href: 'https://www.mydealz.de/deals', pathname: '/deals', search: '?page=1' }, __INITIAL_STATE__: state };
    global.location = global.window.location;
    global.document = {
      createElement: () => ({
        style: {}, appendChild: () => {}, addEventListener: () => {},
        innerHTML: '',
        get innerText() { return this.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); },
        get textContent() { return this.innerText; },
      }),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: (sel) => {
        // Verifizierte ID-Quelle: sichtbare Artikel (Listing-States haben keine Threads)
        if (sel === 'article[id^="thread_"]') return [{ id: 'thread_2810000' }];
        return [];
      },
      body: { appendChild: () => {} },
    };
    global.DOMParser = class { parseFromString() { return { querySelectorAll: () => [] }; } };

    // fetch-Stub: /graphql → verifizierter GQL-Batch-Antwort-Shape; AJAX-Seite → leer
    global.fetch = async (url) => {
      if (url.includes('/graphql')) {
        return {
          ok: true, status: 200,
          headers: { get: () => 'application/json' },
          text: async () => JSON.stringify({
            data: {
              t2810000: {
                title: 'Batch-Deal', price: 35.9, displayPrice: '35,90€', nextBestPrice: 59.99,
                priceDiscount: null, temperature: 231, commentCount: 34, isExpired: false,
                publishedAt: 1725148800, description: '<b>HTML</b> Beschreibung',
                url: '/deals/batch-deal-2810000',
                user: { username: 'poster1', userId: '7' },
                merchant: { merchantName: 'MediaMarkt', merchantId: 15 },
                mainImage: { uid: 'abc123', path: 'images/threads/28' },
                shipping: { isFree: true, price: 0 },
              },
            },
          }),
        };
      }
      return { ok: true, headers: { get: () => 'application/json' }, text: async () => '<html></html>' };
    };
  },
});

(async () => {
  console.log('collector.test.js — Pipeline');

  assert(typeof GraphQLClient.fetchThreadBatch === 'function', 'Client: fetchThreadBatch vorhanden');
  assert(typeof GraphQLClient.fetchRepliesBatch === 'function', 'Client: fetchRepliesBatch vorhanden');
  assert(GraphQLClient.getCsrfToken() === null || typeof GraphQLClient.getCsrfToken() === 'string', 'CSRF-Token-Leser wirft nicht');

  const { deals, total } = await Collector.collect({ limit: 100, onProgress: () => {} });
  assert(deals.length === 1, 'Pipeline: 1 Deal aus GQL-Batch');
  const d = deals[0];
  assert(d.merchant === 'MediaMarkt', 'merchant korrekt normalisiert');
  assert(d.price === 35.9 && d.originalPrice === 59.99, 'Preise normalisiert');
  assert(d.discountPct === 40, 'discountPct aus Preis-Delta berechnet (59.99→35.9)');
  assert(d.description === 'HTML Beschreibung', 'Beschreibung HTML→Plaintext gestrippt');
  assert(d.publishedAt === '2024-09-01T00:00:00.000Z', 'unix-publishedAt → ISO');
  assert(d.shippingFree === true, 'shippingFree übernommen');

  const md = Collector.toMarkdown(deals, { label: 'Test' }, total);
  assert(md.includes('35,90 €') && md.includes('MediaMarkt'), 'Markdown: Preis + Händler');
  assert(md.includes('HTML Beschreibung'), 'Markdown: Beschreibung gestrippt');

  console.log('collector.test.js PASSED');
})().catch(e => { console.error(e.message); process.exit(1); });
