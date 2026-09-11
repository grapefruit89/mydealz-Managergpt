/**
 * comment-normalizer.js
 * SSOT für die Kommentar-Normalisierung (CommentData-Contract).
 *
 * Quelle: Claude/DeepSeek-Reviews 2026-09-11 (Fund 3/7): exporter.js war ein
 * zweiter Core — Transform/Score/Permalink/Formatierung lagen in der
 * Orchestrierung. Dritter Konsument (LLM-Chat, ROADMAP §2.14) steht an,
 * deshalb Contract VOR dem Chat.
 *
 * CommentData-Canon (v1):
 *   id        string   commentId
 *   user      string   Label inkl. "[OP]"-Badge
 *   text      string   Plaintext mit Markdown-Link-Erhalt (cleanHtml)
 *   date      string   ISO-Datum (createdAtTs verifiziert, Fallback createdAt)
 *   reactions { like, helpful, funny, score }  – score = helpful×3 + replies×3 + like×2 + funny
 *   permalink string   #comment-<id> / #reply-<id> (verifizierte Formate, Sammlung 2035404)
 *   replies   CommentData[]
 * Gelöschte/gefilterte Kommentare: user "[Gelöscht]", text-Platzhalter.
 */

const CommentNormalizer = (() => {

  /** HTML → Plaintext mit Markdown-Link-Erhalt ("[label](url)"). */
  function cleanHtml(html) {
    if (!html) return '';
    let body = html;
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('a').forEach(a => {
        const href  = a.getAttribute('href');
        const label = a.textContent.trim() || 'Link';
        if (href && !href.startsWith('javascript:') && !href.startsWith('data:')) {
          a.replaceWith(` [${label}](${href}) `);
        } else {
          a.replaceWith(` [${label}] `);
        }
      });
      doc.querySelectorAll('br').forEach(br => br.replaceWith(' '));
      body = doc.body.textContent;
    } catch {
      // Fallback (Node/Test ohne DOMParser): Tags raus, Links grob erhalten
      body = html.replace(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, ' [$2]($1) ')
                 .replace(/<br\s*\/?>/gi, ' ')
                 .replace(/<[^>]+>/g, ' ');
    }
    return body.replace(/\s+/g, ' ').trim();
  }

  /**
   * Reaction-Score (Muster MydealzExporter-Dashboard):
   * helpful×3 + replies×3 + like×2 + funny — gewichtet "echte Antworten"
   * höher als Memes und Beifall. warning signal: viel funny + wenig helpful.
   */
  function score(item, replyCount) {
    let like = 0, helpful = 0, funny = 0;
    (item.reactionCounts ?? []).forEach(r => {
      if (r.type === 'LIKE')    like    = r.count;
      if (r.type === 'HELPFUL') helpful = r.count;
      if (r.type === 'FUNNY')   funny   = r.count;
    });
    return {
      like, helpful, funny,
      score: helpful * 3 + (replyCount ?? item.replyCount ?? 0) * 3 + like * 2 + funny,
    };
  }

  /**
   * Kommentar-Permalink (verifizierte mydealz-Formate, Sammlung 2035404):
   *   Hauptkommentar → ...#comment-<id>
   *   Antwort        → ...#reply-<id>
   */
  function permalink(item) {
    if (!item?.commentId) return '';
    const base = location.origin + location.pathname;
    return item.mainCommentId
      ? `${base}#reply-${item.commentId}`
      : `${base}#comment-${item.commentId}`;
  }

  /**
   * GQL-Kommentar-Rohobjekt → CommentData.
   * @param {Object} item       – GQL comment-Feld (verifiziertes COMMENT_FIELDS-Set)
   * @param {string} opUsername – OP-Erkennung für das [OP]-Badge
   * @returns {Object} CommentData
   */
  function transform(item, opUsername) {
    if (!item || !item.user) {
      return {
        id: item?.commentId ?? 'unknown',
        user: '[Gelöscht]',
        text: '[Dieser Kommentar wurde entfernt]',
        date: 'N/A',
        reactions: { like: 0, helpful: 0, funny: 0, score: 0 },
        permalink: permalink(item),
        replies: [],
      };
    }

    let userLabel = item.user.username ?? 'Unbekannt';
    if (opUsername && userLabel === opUsername) userLabel += ' [OP]';

    const reactions = score(item);

    // createdAtTs (unix) ist verifiziert; Fallback auf createdAt-String
    let date;
    if (item.createdAtTs) {
      date = new Date(item.createdAtTs * 1000).toISOString().split('T')[0];
    } else if (item.createdAt) {
      date = new Date(item.createdAt).toISOString().split('T')[0];
    } else {
      date = 'N/A';
    }

    return {
      id:        item.commentId,
      user:      userLabel,
      text:      cleanHtml(item.preparedHtmlContent),
      date,
      reactions: { like: reactions.like, helpful: reactions.helpful, funny: reactions.funny, score: reactions.score },
      permalink: permalink(item),
      replies:   [],
    };
  }

  /**
   * Recursiver Markdown-Formatter (Reply-Baum, Reaction-Score als KI-Signal).
   * Konsumiert: Prompt-Builder, zukünftiger Chat-Kontext.
   */
  function formatComments(comments, level = 0) {
    const indent = '  '.repeat(level);
    return comments.map(c => {
      const parts = [];
      if (c.reactions.like    > 0) parts.push(`👍 ${c.reactions.like}`);
      if (c.reactions.helpful > 0) parts.push(`✅ ${c.reactions.helpful}`);
      if (c.reactions.funny   > 0) parts.push(`😄 ${c.reactions.funny}`);
      if (c.reactions.score   > 0) parts.push(`⭐ ${c.reactions.score}`);
      const reactionStr = parts.length > 0 ? ` [${parts.join(' | ')}]` : '';
      const linkStr = c.permalink ? ` [↗](${c.permalink})` : '';

      const header = `${indent}👤 **${c.user}** [${c.date}]${reactionStr}${linkStr}`;
      const body   = `${indent}${c.text.replace(/\n/g, `\n${indent}`)}`;
      let out      = `${header}\n${body}`;

      if (c.replies?.length > 0) {
        out += `\n${indent}-- Antworten --\n${formatComments(c.replies, level + 1)}`;
      }
      return out;
    }).join('\n\n' + indent);
  }

  /** Zählt alle Kommentare inkl. Replies (Statistik-Kachel). */
  function countTree(comments) {
    let n = 0;
    (comments ?? []).forEach(c => { n += 1 + countTree(c.replies); });
    return n;
  }

  return { transform, score, permalink, formatComments, cleanHtml, countTree };

})();

if (typeof module !== 'undefined') module.exports = { CommentNormalizer };
