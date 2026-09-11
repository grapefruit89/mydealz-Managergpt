/**
 * comment-normalizer.test.js
 * CommentData-Contract: OP-Badge, Permalinks (#comment/#reply), Reaction-Score,
 * Markdown-Link-Erhalt, gelöschte Kommentare, Baum-Formatter + Counter.
 * Run: node tests/comment-normalizer.test.js
 */

const { loadBundle, assert, src, moduleOrder } = require('./harness.js');

const { CommentNormalizer } = loadBundle(moduleOrder(), {
  expose: ['CommentNormalizer'],
  setup() {
    global.window = { location: { origin: 'https://www.mydealz.de', pathname: '/deals/test-deal-123/' } };
    global.location = global.window.location;
    global.DOMParser = class {
      parseFromString(html) {
        // Minimal-DOM: <a> → [text](url), <br> → ' ', Rest Tags raus
        let s = html
          .replace(/<a [^>]*href="(?!javascript:|data:)([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
                   (_, href, label) => ` [${label.trim() || 'Link'}](${href}) `)
          .replace(/<a [^>]*href="(javascript:|data:)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, ' [$2] ')
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<[^>]+>/g, ' ');
        return { body: { textContent: s }, querySelectorAll: () => [] };
      }
    };
  },
});

(async () => {
  console.log('comment-normalizer.test.js — CommentData-Contract');

  const op = 'opUser';

  // 1. Hauptkommentar: OP-Badge, Permalink, Score, Markdown-Link
  const c1 = CommentNormalizer.transform(
    { commentId: 'c1', user: { username: 'opUser' }, preparedHtmlContent: 'hi <a href="https://x.de">link</a>',
      reactionCounts: [{ type: 'LIKE', count: 1 }, { type: 'HELPFUL', count: 2 }], replyCount: 2, createdAtTs: 1725148800 },
    op);
  assert(c1.user === 'opUser [OP]', 'OP-Badge gesetzt');
  assert(c1.permalink === 'https://www.mydealz.de/deals/test-deal-123/#comment-c1', 'Hauptkommentar-Permalink #comment-<id>');
  assert(c1.reactions.score === 14, 'Score: helpful×3 + replies×3 + like×2 = 2*3+2*3+1*2 = 14');
  assert(c1.text.includes('[link](https://x.de)'), 'Markdown-Link-Erhalt im Text');
  assert(c1.date === '2024-09-01', 'createdAtTs (unix) → ISO-Datum');

  // 2. Reply-Permalink
  const r = CommentNormalizer.transform(
    { commentId: 'r7', mainCommentId: 'c1', user: { username: 'userX' }, preparedHtmlContent: 're', reactionCounts: [], createdAtTs: 1725148800 }, op);
  assert(r.permalink === 'https://www.mydealz.de/deals/test-deal-123/#reply-r7', 'Antwort-Permalink #reply-<id>');

  // 3. Gelöschter Kommentar (kein user)
  const del = CommentNormalizer.transform({ commentId: 'x9' }, op);
  assert(del.user === '[Gelöscht]' && del.text.includes('entfernt'), 'Gelöschter Kommentar → Platzhalter-CommentData');
  assert(del.reactions.score === 0 && del.replies.length === 0, 'Gelöscht: null-Sicher (score 0, keine Replies)');

  // 4. Baum: Formatter + Counter
  const tree = [ { ...c1, replies: [ { ...r, replies: [] }, { ...del, replies: [] } ] } ];
  const md = CommentNormalizer.formatComments(tree);
  assert(md.includes('opUser [OP]') && md.includes('-- Antworten --'), 'Formatter: OP + Reply-Baum');
  assert(CommentNormalizer.countTree(tree) === 3, 'countTree: 1 Root + 2 Replies = 3');

  console.log('comment-normalizer.test.js PASSED');
})().catch(e => { console.error(e.message); process.exit(1); });
