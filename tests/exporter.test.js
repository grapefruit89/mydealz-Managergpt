/**
 * tests/exporter.test.js
 * AI-Exporter End-to-End: repliesPreview gratis übernehmen, Alias-Batch nur
 * für Lücken (P4-11), Permalinks + Reaction-Score (P4-10).
 * Run: node tests/exporter.test.js
 */

const { loadBundle, assert, src, moduleOrder } = require('./harness.js');

const gqlCalls = []; // zählt /graphql-Requests

const { GraphQLClient, Exporter, ExportPayload, PromptBuilder } = loadBundle(moduleOrder(), {
  expose: ['GraphQLClient', 'Exporter', 'ExportPayload', 'PromptBuilder'],
  setup() {
    global.window = {
      location: { href: 'https://www.mydealz.de/deals/test-deal-123/', origin: 'https://www.mydealz.de', pathname: '/deals/test-deal-123/' },
      __INITIAL_STATE__: {
        threadDetail: {
          threadId: 123, title: 'Test Deal', price: '19,99€', temperature: 42,
          commentCount: 5, isExpired: false, createdAt: '2026-09-01',
          merchant: { merchantName: 'MediaMarkt' }, user: { username: 'opUser' },
        },
      },
      open() {
        // Fake-Exportfenster: 'out'-Element wird von _openUi gefüllt
        return {
          close() {},
          document: {
            title: '',
            head: { innerHTML: '' },
            body: { innerHTML: '', appendChild() {}, removeChild() {} },
            querySelectorAll: () => [],
            createElement: () => ({ style: {}, value: '', textContent: '', className: '', appendChild() {}, removeChild() {}, classList: { add() {}, remove() {} } }),
            getElementById(id) {
              if (id === 'out') return _out;
              return { style: {}, value: '', textContent: '', className: '', appendChild() {}, classList: { add() {}, remove() {} } };
            },
          },
        };
      },
    };
    global.location = global.window.location;
    const _out = { style: {}, value: '' };
    global.__getOut = () => _out;

    global.document = {
      createElement: () => ({
        style: {}, appendChild() {}, addEventListener() {}, removeChild() {},
        innerHTML: '',
        get innerText() { return this.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); },
        get textContent() { return this.innerText; },
      }),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      body: { appendChild() {}, removeChild() {} },
    };
    global.DOMParser = class {
      // Fake, der das macht was _cleanHtml erwartet: <a>→[label](href), <br>→Leerzeichen, Tags raus
      parseFromString(html) {
        const text = html
          .replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, label) => ` [${(label || 'Link').trim() || 'Link'}](${href}) `)
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<[^>]+>/g, '');
        return { querySelectorAll: () => ({ forEach() {} }), body: { textContent: text } };
      }
    };
    global.alert = () => {};
    global.localStorage = { getItem: () => null };

    // Fake IndexedDB: get → null (kein Cache), put/delete → Erfolg
    const fakeReq = () => ({ onsuccess: null, onerror: null, result: null });
    global.indexedDB = {
      open() {
        const req = fakeReq();
        req.result = {
          objectStoreNames: { contains: () => true },
          transaction: () => ({
            objectStore: () => ({
              get: () => { const r = fakeReq(); setTimeout(() => r.onsuccess?.(), 0); return r; },
              put: () => { const r = fakeReq(); setTimeout(() => r.onsuccess?.(), 0); return r; },
              delete: () => { const r = fakeReq(); setTimeout(() => r.onsuccess?.(), 0); return r; },
            }),
          }),
        };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      },
    };

    // ── fetch-Stub mit Zähler ─────────────────────────────────────────────────
    const t = 1725148800;
    global.fetch = async (url, opts = {}) => {
      if (!url.includes('/graphql')) {
        return { ok: true, headers: { get: () => 'application/json' }, text: async () => '' };
      }
      gqlCalls.push(JSON.parse(opts.body).query);
      const q = gqlCalls[gqlCalls.length - 1];
      const json = q.includes('$filter')
        ? { // Root-Seite: 3 Root-Kommentare
            data: { comments: {
              items: [
                { commentId: 'c1', replyCount: 2, preparedHtmlContent: 'Root eins mit <a href="https://x.de">Link</a>',
                  reactionCounts: [{ type: 'LIKE', count: 1 }, { type: 'HELPFUL', count: 2 }],
                  createdAtTs: t, user: { username: 'opUser' },
                  repliesPreview: [
                    { commentId: 'r1', mainCommentId: 'c1', preparedHtmlContent: 'Antwort eins', reactionCounts: [], createdAtTs: t + 1, user: { username: 'userA' } },
                    { commentId: 'r2', mainCommentId: 'c1', preparedHtmlContent: 'Antwort zwei', reactionCounts: [{ type: 'FUNNY', count: 5 }], createdAtTs: t + 2, user: { username: 'userB' } },
                  ] },
                { commentId: 'c2', replyCount: 3, preparedHtmlContent: 'Root zwei',
                  reactionCounts: [], createdAtTs: t + 3, user: { username: 'userC' },
                  repliesPreview: [ { commentId: 'r3', mainCommentId: 'c2', preparedHtmlContent: 'Preview-Reply', reactionCounts: [], createdAtTs: t + 3, user: { username: 'userD' } } ] },
                { commentId: 'c3', replyCount: 0, preparedHtmlContent: 'Root drei',
                  reactionCounts: [], createdAtTs: t + 4, user: { username: 'userE' }, repliesPreview: [] },
              ],
              pagination: { last: 1, count: 5, current: 1 },
            } },
          }
        : { // Alias-Batch für Parent c2 (3 komplette Replies)
            data: { rc2: { items: [
              { commentId: 'r3', mainCommentId: 'c2', preparedHtmlContent: 'Preview-Reply', reactionCounts: [], createdAtTs: t + 3, user: { username: 'userD' } },
              { commentId: 'r4', mainCommentId: 'c2', preparedHtmlContent: 'Batch-Reply vier', reactionCounts: [{ type: 'HELPFUL', count: 1 }], createdAtTs: t + 4, user: { username: 'userF' } },
              { commentId: 'r5', mainCommentId: 'c2', preparedHtmlContent: 'Batch-Reply fünf', reactionCounts: [], createdAtTs: t + 5, user: { username: 'userG' } },
            ] } },
          };
      return {
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(json),
      };
    };
  },
});

(async () => {
  console.log('exporter.test.js — repliesPreview + Alias-Batch + Permalinks + Score');

  const gqlCallsBefore = () => gqlCalls.length;

  // Transform/Score/Permalink-Unit-Checks: siehe comment-normalizer.test.js

  // End-to-End über _run (Cache leer → frischer Fetch)
  const btn = { disabled: false, textContent: '' };
  await Exporter._test._run(btn);
  assert(btn.disabled === false, 'Button wieder aktiviert nach Export');

  // Request-Ersparnis (Kern von P4-11):
  //   alt:  1 Root + 2 Parent-Requests (c1, c2) = 3
  //   neu:  1 Root + 1 Alias-Batch (c2)        = 2
  assert(gqlCallsBefore() === 2, `genau 2 GQL-Requests (root + 1 Batch), waren ${gqlCallsBefore()}`);
  assert(gqlCalls[1].includes('rc2:'), 'Batch-Query zielt nur auf Parent c2 (Alias rc2 — echte IDs numerisch: r<id>)');

  // Markdown-Verifikation
  const md = global.__getOut().value;
  assert(md.includes('opUser [OP]'), 'Markdown: OP-Badge');
  assert(md.includes('#comment-c1'), 'Markdown: Root-Permalink');
  console.log('MARKDOWN >>', md.substring(0, 900).replace(/\n/g, ' ⏎ '));
  console.log('MARKDOWN-2 >>', md.substring(900, 1800).replace(/\n/g, ' ⏎ '));
  assert(md.includes('#reply-r4'), 'Markdown: Reply-Permalink aus Batch');
  assert(md.includes('Batch-Reply vier'), 'Markdown: fehlende Replies nachgeladen');
  assert(md.includes('Preview-Reply'), 'Markdown: Reply aus Batch (ersetzt Preview, keine Duplikate)');
  assert((md.match(/Preview-Reply/g) || []).length === 1, 'keine Duplikate (Batch ersetzt Preview)');
  assert(md.includes('⭐ 14'), 'Markdown: Reaction-Score sichtbar');
  assert(md.includes('😄 5'), 'Markdown: Funny-Reaktion');

  // ExportPayload-Contract (P2.7): Chat-Basis, Schema-Marker + Stats
  const p = ExportPayload.create('123', { Titel: 'T' }, [{ id: 'c1', replies: [{ id: 'r1', replies: [] }] }]);
  assert(ExportPayload.isValid(p), 'ExportPayload: isValid (schema mdm-export@1)');
  assert(p.stats.total === 2, 'ExportPayload: rekursive Kommentarzahl');
  assert(p.threadId === '123' && p.comments.length === 1, 'ExportPayload: threadId + comments');
  assert(PromptBuilder.build('SHORT', { Titel: 'T' }, []).includes('# Context'), 'PromptBuilder: pure Stufe bauen');
  assert(Object.keys(PromptBuilder.buildAll({ Titel: 'T' }, [])).length === 4, 'PromptBuilder: alle 4 Stufen aus SSOT');

  console.log('exporter.test.js PASSED');
})().catch(e => { console.error(e.message); process.exit(1); });
