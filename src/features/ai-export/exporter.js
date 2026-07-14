/**
 * exporter.js
 * AI Export feature for mydealz Manager.
 *
 * Activates on deal detail pages (/deals/*, /diskussion/*, /gutscheine/*).
 * Collects all comments (with nested replies) + deal metadata,
 * caches them in IndexedDB for 1 hour, then opens a popup export window.
 *
 * Dependencies (must be loaded before this module):
 *   - GraphQLClient  (graphql-client.js)
 */

const Exporter = (() => {

  // ── Page detection ─────────────────────────────────────────────────────────

  function _isDetailPage() {
    return /\/(deals|diskussion|gutscheine)\//.test(location.pathname);
  }

  function _getThreadId() {
    // 1. __INITIAL_STATE__ (most reliable)
    const store = window.__INITIAL_STATE__;
    if (store?.threadDetail?.threadId) return String(store.threadDetail.threadId);
    // 2. URL pattern: /deals/title-12345 or /deals/12345
    const m = location.pathname.match(/-(\d+)(?:\/|$)/) || location.pathname.match(/\/(\d+)(?:\/|$)/);
    return m ? m[1] : null;
  }

  // ── IndexedDB cache (1-hour TTL) ───────────────────────────────────────────

  const Cache = (() => {
    const DB_NAME   = 'MdmExportCache_v1';
    const STORE     = 'threads';
    const TTL_MS    = 60 * 60 * 1000; // 1 hour

    function _open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'threadId' });
          }
        };
      });
    }

    async function get(threadId) {
      try {
        const db = await _open();
        return new Promise((resolve, reject) => {
          const tx  = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(threadId);
          req.onsuccess = () => {
            const d = req.result;
            resolve(d && (Date.now() - d.timestamp < TTL_MS) ? d : null);
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) { console.warn('[MDM Exporter] Cache read error:', e); return null; }
    }

    async function set(threadId, meta, comments) {
      try {
        const db = await _open();
        return new Promise((resolve, reject) => {
          const tx  = db.transaction(STORE, 'readwrite');
          const req = tx.objectStore(STORE).put({ threadId, meta, comments, timestamp: Date.now() });
          req.onsuccess = () => resolve();
          req.onerror  = () => reject(req.error);
        });
      } catch (e) { console.warn('[MDM Exporter] Cache write error:', e); }
    }

    async function remove(threadId) {
      try {
        const db = await _open();
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(threadId);
      } catch (e) { /* ignore */ }
    }

    return { get, set, remove };
  })();

  // ── GQL queries (use preparedHtmlContent + createdAtTs) ───────────────────

  const _Q_COMMENT_FIELDS = `
    commentId
    replyCount
    preparedHtmlContent
    reactionCounts { type count }
    createdAtTs
    user { username }
  `;

  const _Q_ROOT = `
    query comments($filter: CommentFilter!, $limit: Int, $page: Int) {
      comments(filter: $filter, limit: $limit, page: $page) {
        items { ${_Q_COMMENT_FIELDS} }
        pagination { current last }
      }
    }
  `;

  const _Q_REPLIES = `
    query comments($filter: CommentFilter!, $limit: Int) {
      comments(filter: $filter, limit: $limit) {
        items { ${_Q_COMMENT_FIELDS} }
      }
    }
  `;

  // ── HTML → plain text + Markdown links ────────────────────────────────────

  function _cleanHtml(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Convert <a href="…">text</a> → [text](url)
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
    return doc.body.textContent.replace(/\s+/g, ' ').trim();
  }

  // ── Comment transform ──────────────────────────────────────────────────────

  function _transformComment(item, opUsername) {
    if (!item || !item.user) {
      return {
        id: item?.commentId ?? 'unknown',
        user: '[Gelöscht]',
        text: '[Dieser Kommentar wurde entfernt]',
        date: 'N/A',
        reactions: { like: 0, helpful: 0, funny: 0 },
        replies: [],
      };
    }

    let like = 0, helpful = 0, funny = 0;
    (item.reactionCounts ?? []).forEach(r => {
      if (r.type === 'LIKE')    like    = r.count;
      if (r.type === 'HELPFUL') helpful = r.count;
      if (r.type === 'FUNNY')   funny   = r.count;
    });

    let userLabel = item.user.username ?? 'Unbekannt';
    if (opUsername && userLabel === opUsername) userLabel += ' [OP]';

    return {
      id:        item.commentId,
      user:      userLabel,
      text:      _cleanHtml(item.preparedHtmlContent),
      date:      new Date((item.createdAtTs ?? 0) * 1000).toISOString().split('T')[0],
      reactions: { like, helpful, funny },
      replies:   [],
    };
  }

  // ── Markdown formatter (recursive, nested) ─────────────────────────────────

  function _formatComments(comments, level = 0) {
    const indent = '  '.repeat(level);
    return comments.map(c => {
      // Reaction string
      const parts = [];
      if (c.reactions.like    > 0) parts.push(`👍 ${c.reactions.like}`);
      if (c.reactions.helpful > 0) parts.push(`✅ ${c.reactions.helpful}`);
      if (c.reactions.funny   > 0) parts.push(`😄 ${c.reactions.funny}`);
      const reactionStr = parts.length > 0 ? ` [${parts.join(' | ')}]` : '';

      const header = `${indent}👤 **${c.user}** [${c.date}]${reactionStr}`;
      const body   = `${indent}${c.text.replace(/\n/g, `\n${indent}`)}`;
      let out      = `${header}\n${body}`;

      if (c.replies?.length > 0) {
        out += `\n${indent}-- Antworten --\n${_formatComments(c.replies, level + 1)}`;
      }
      return out;
    }).join('\n\n' + indent);
  }

  // ── Prompt level presets ───────────────────────────────────────────────────

  const _PROMPT_LEVELS = {
    RAW: {
      label: '🧱 Rohdaten',
      gen: (meta, comments) => JSON.stringify({ meta, comments }, null, 2),
    },
    SHORT: {
      label: '⚡ Kurz',
      gen: (meta, comments) =>
        `# Context\n${JSON.stringify(meta, null, 2)}\n\n# Comments\n${_formatComments(comments)}`,
    },
    MEDIUM: {
      label: '💡 Standard',
      gen: (meta, comments) =>
        `# Role: Community Sentiment Analyst\n\n# Metadata\n${JSON.stringify(meta, null, 2)}\n\n# Thread (Nested)\n${_formatComments(comments)}\n\n# Task\nAnalysiere Sentiment und extrahiere Schlüsselfakten.`,
    },
    DETAILED: {
      label: '🧐 Ausführlich',
      gen: (meta, comments) =>
        `# Role: UX Researcher\n\n# Metadata\n${JSON.stringify(meta, null, 2)}\n\n# Thread\n${_formatComments(comments)}\n\n# Protocol\nAnalysiere Interaktionen zwischen Haupt- und Antwortkommentaren.`,
    },
  };

  // ── Metadata extraction (detail page) ─────────────────────────────────────

  function _getMetadata(threadId) {
    const store   = window.__INITIAL_STATE__ ?? {};
    const details = store.threadDetail ?? store.data?.thread ?? {};

    let title    = details.title    ?? document.querySelector('h1.thread-title')?.innerText ?? document.title;
    let merchant = details.merchant?.merchantName;
    if (!merchant) {
      const el = document.querySelector('a[data-t="merchantLink"]');
      merchant = el?.innerText?.trim() ?? 'N/A';
    }

    let op = details.user?.username;
    if (!op) {
      const opEl = document.querySelector('.thread-user span:first-child, .thread-user-name span:first-child');
      op = opEl?.innerText?.trim() ?? 'Unbekannt';
    }

    const price    = details.price       ?? document.querySelector('.thread-price')?.innerText ?? 'N/A';
    const temp     = details.temperature ?? document.querySelector('.vote-temp')?.innerText    ?? 'N/A';
    const count    = details.commentCount ?? 0;
    const expired  = details.isExpired   ?? document.querySelector('.thread--expired') !== null;
    const status   = expired ? 'Abgelaufen ❌' : 'Aktiv ✅';

    // Date — details.createdAt may be ISO string or unix timestamp
    let createdDate;
    if (details.createdAt) {
      const v = details.createdAt;
      createdDate = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
    } else {
      createdDate = new Date();
    }
    const diffDays = Math.ceil((Date.now() - createdDate) / 86_400_000);

    // Strip [Merchant] prefix from title
    if (merchant && merchant !== 'N/A') {
      title = title.replace(new RegExp(`^\\[${merchant}\\]\\s*`, 'i'), '');
    }

    return {
      threadId,
      Titel: title.trim(),
      URL:   location.href,
      OP:    op,
      DealInfo: {
        Preis:      price,
        Händler:    merchant,
        Temperatur: String(temp) + '°',
        Status:     status,
        Erstellt:   createdDate.toLocaleDateString('de-DE'),
        Alter:      `${diffDays} Tage`,
      },
      KommentarAnzahl: count,
      ExportDatum: new Date().toLocaleString('de-DE'),
    };
  }

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  async function _fetchRootPage(threadId, page) {
    const result = await GraphQLClient.query(_Q_ROOT, {
      filter: {
        threadId: { eq: String(threadId) },
        order:    { direction: 'Ascending' },
      },
      limit: 100,
      page,
    });
    return result?.data?.comments ?? null;
  }

  async function _fetchReplies(mainCommentId, threadId) {
    const result = await GraphQLClient.query(_Q_REPLIES, {
      filter: {
        mainCommentId,
        threadId: { eq: String(threadId) },
      },
      limit: 100,
    });
    return result?.data?.comments?.items ?? [];
  }

  // ── Download helper ────────────────────────────────────────────────────────

  function _download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Export UI (popup window) ───────────────────────────────────────────────

  function _openUi(meta, comments, onRefresh) {
    const w = window.open('', '_blank', 'width=1040,height=820');
    if (!w) { alert('[MDM Exporter] Popup wurde vom Browser blockiert.'); return; }

    w.document.title = 'mydealz AI Export';

    const css = `
      :root {
        --bg: #F8FAFC; --surface: #FFFFFF; --border: #E2E8F0;
        --primary: #0F172A; --accent: #2563EB; --text: #1E293B;
        --muted: #64748B;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: 'Inter', system-ui, sans-serif;
        background: var(--bg); height: 100vh; overflow: hidden;
        display: flex; flex-direction: column;
      }
      .header {
        flex: 0 0 auto; padding: 12px 20px;
        background: var(--surface); border-bottom: 1px solid var(--border);
        display: flex; justify-content: space-between; align-items: center;
      }
      .header h2 { font-size: 15px; color: var(--text); display: flex; align-items: center; gap: 8px; }
      .badge { background: #EEF2FF; color: #4F46E5; padding: 2px 8px; border-radius: 4px; font-size: 11px; }

      .meta-bar {
        flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 8px 24px;
        padding: 10px 20px; background: #F1F5F9; border-bottom: 1px solid var(--border);
        font-size: 12px; color: var(--muted);
      }
      .meta-item b { color: #334155; font-weight: 600; margin-right: 3px; }
      .meta-item.cached { color: #059669; }

      .controls {
        flex: 0 0 auto; padding: 14px 20px;
        background: var(--surface); border-bottom: 1px solid var(--border);
        display: flex; flex-direction: column; gap: 12px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      }
      .label { font-size: 10px; text-transform: uppercase; color: #94A3B8; font-weight: 700; margin-bottom: 5px; }
      .tabs, .btn-row { display: flex; gap: 6px; flex-wrap: wrap; }
      .tab {
        padding: 5px 11px; border-radius: 6px; border: 1px solid #CBD5E1;
        cursor: pointer; background: white; color: var(--muted);
        font-size: 12px; font-weight: 500;
      }
      .tab.active { background: #F1F5F9; border-color: var(--primary); color: var(--primary); font-weight: 600; }
      .btn {
        padding: 5px 11px; border-radius: 6px; border: 1px solid var(--border);
        background: white; color: #475569; font-size: 12px;
        cursor: pointer; display: flex; align-items: center; gap: 5px;
      }
      .btn:hover { background: #F8FAFC; }
      .btn-primary { background: var(--primary); color: white; border-color: var(--primary); }
      .btn-primary:hover { background: #1E293B; }
      .action-row { display: flex; gap: 32px; flex-wrap: wrap; }

      .main { flex: 1; display: flex; flex-direction: column; min-height: 0; }
      textarea {
        flex: 1; width: 100%; resize: none; border: none; padding: 18px 20px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px;
        background: #FAFAFA; color: #334155; outline: none;
      }
      .toast {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(16px);
        background: rgba(15,23,42,.9); color: white; padding: 8px 18px;
        border-radius: 20px; font-size: 13px; opacity: 0;
        transition: all .25s; pointer-events: none; z-index: 999;
      }
      .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    `;

    const AI_LINKS = [
      { name: 'ChatGPT',    url: 'https://chatgpt.com/' },
      { name: 'Claude',     url: 'https://claude.ai/' },
      { name: 'Gemini',     url: 'https://gemini.google.com/' },
      { name: 'Perplexity', url: 'https://www.perplexity.ai/' },
    ];

    const cacheNote = meta._fromCache
      ? `<div class="meta-item cached">⚡ Cache (${new Date(meta._cacheTime).toLocaleTimeString('de-DE')})</div>`
      : '';

    w.document.head.innerHTML = `<style>${css}</style>`;
    w.document.body.innerHTML = `
      <div class="header">
        <h2>💎 mydealz AI Exporter <span class="badge">v2.0</span></h2>
      </div>
      <div class="meta-bar">
        <div class="meta-item"><b>Deal:</b> ${meta.Titel.substring(0, 40)}…</div>
        <div class="meta-item"><b>Status:</b> ${meta.DealInfo.Status}</div>
        <div class="meta-item"><b>Alter:</b> ${meta.DealInfo.Alter}</div>
        <div class="meta-item"><b>Preis:</b> ${meta.DealInfo.Preis}</div>
        <div class="meta-item"><b>Händler:</b> ${meta.DealInfo.Händler}</div>
        <div class="meta-item"><b>Temp:</b> ${meta.DealInfo.Temperatur}</div>
        <div class="meta-item"><b>Kommentare:</b> ${meta.Statistik?.Total ?? '?'}</div>
        ${cacheNote}
      </div>
      <div class="controls">
        <div>
          <div class="label">Prompt-Vorlage</div>
          <div class="tabs" id="tabs"></div>
        </div>
        <div class="action-row">
          <div>
            <div class="label">Exportieren</div>
            <div class="btn-row">
              <button class="btn btn-primary" id="btnCopy">📋 Kopieren</button>
              <button class="btn" id="btnMd">💾 .MD</button>
              <button class="btn" id="btnRefresh" title="Cache löschen + Neu laden">🔄</button>
            </div>
          </div>
          <div>
            <div class="label">Direkt öffnen</div>
            <div class="btn-row">
              ${AI_LINKS.map(a => `<button class="btn" onclick="window.open('${a.url}')">${a.name}</button>`).join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="main"><textarea id="out" readonly></textarea></div>
      <div id="toast" class="toast"></div>
    `;

    const d   = w.document;
    const out = d.getElementById('out');

    let currentLevel = 'MEDIUM';

    // Build tabs
    const tabContainer = d.getElementById('tabs');
    Object.keys(_PROMPT_LEVELS).forEach(key => {
      const btn = d.createElement('button');
      btn.className = `tab ${key === currentLevel ? 'active' : ''}`;
      btn.textContent = _PROMPT_LEVELS[key].label;
      btn.onclick = () => {
        d.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentLevel = key;
        out.value = _PROMPT_LEVELS[key].gen(meta, comments);
      };
      tabContainer.appendChild(btn);
    });

    out.value = _PROMPT_LEVELS[currentLevel].gen(meta, comments);

    // Toast helper
    const toast    = d.getElementById('toast');
    const showToast = (msg) => {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    };

    // File basename
    const safe = meta.Titel.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const date = new Date().toISOString().split('T')[0];
    const base = `${date}_${safe}_mydealz`;

    d.getElementById('btnCopy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(out.value);
        showToast('✅ In Zwischenablage kopiert!');
      } catch {
        const ta = Object.assign(d.createElement('textarea'), { value: out.value });
        ta.style.cssText = 'position:fixed;left:-9999px';
        d.body.appendChild(ta); ta.select(); d.execCommand('copy'); d.body.removeChild(ta);
        showToast('✅ Kopiert (Fallback)!');
      }
    };
    d.getElementById('btnMd').onclick = () =>
      _download(`${base}.md`, out.value, 'text/markdown');
    d.getElementById('btnRefresh').onclick = async () => {
      if (confirm('Cache löschen und Daten neu laden?')) {
        w.close();
        onRefresh?.();
      }
    };
  }

  // ── Main export orchestration ──────────────────────────────────────────────

  let _running = false;

  async function _run(btn, forceRefresh = false) {
    if (_running) {
      alert('[MDM Exporter] Export läuft bereits…');
      return;
    }

    const threadId = _getThreadId();
    if (!threadId) { alert('[MDM Exporter] Thread-ID konnte nicht ermittelt werden.'); return; }

    _running = true;
    btn.disabled = true;
    const origText = btn.textContent;

    try {
      // 1. Cache check
      if (!forceRefresh) {
        const cached = await Cache.get(threadId);
        if (cached) {
          Logger.debug('Exporter', 'Aus Cache geladen (Thread', threadId + ')');
          cached.meta._fromCache = true;
          cached.meta._cacheTime = cached.timestamp;
          _openUi(cached.meta, cached.comments, () => _run(btn, true));
          return;
        }
      } else {
        await Cache.remove(threadId);
      }

      // 2. Metadata
      btn.textContent = '⏳ Metadaten…';
      const meta = _getMetadata(threadId);
      const opUsername = meta.OP;

      // 3. First comment page (to get total pages)
      btn.textContent = '⏳ Kommentare…';
      const firstPage = await _fetchRootPage(threadId, 1);
      if (!firstPage) throw new Error('Kommentar-API nicht erreichbar (Rate Limit?)');

      const totalPages = firstPage.pagination?.last ?? 1;
      let count = 0;

      async function processItems(items) {
        const nodes = [];
        for (const item of items) {
          const node = _transformComment(item, opUsername);
          count++;
          const progress = `${count}/${meta.KommentarAnzahl || '?'}`;
          btn.textContent = `⏳ ${progress}`;

          if (item.replyCount > 0) {
            const replies = await _fetchReplies(item.commentId, threadId);
            for (const r of replies) {
              node.replies.push(_transformComment(r, opUsername));
              count++;
              btn.textContent = `⏳ ${count}/${meta.KommentarAnzahl || '?'}`;
            }
          }
          nodes.push(node);
        }
        return nodes;
      }

      const allComments = [...await processItems(firstPage.items)];

      for (let p = 2; p <= totalPages; p++) {
        await new Promise(r => setTimeout(r, 150)); // polite delay
        const page = await _fetchRootPage(threadId, p);
        if (page) allComments.push(...await processItems(page.items));
      }

      meta.Statistik = { Total: count };

      // ── Kommentar-Verifikation ───────────────────────────────────────────────
      // Vergleicht: Seitenanzeige (KommentarAnzahl aus __INITIAL_STATE__)
      //             vs. tatsächlich via GQL abgerufene Kommentare (inkl. Replies)
      // Toleranz: ±1 (race condition möglich wenn gerade jemand kommentiert)
      const expectedCount = parseInt(meta.KommentarAnzahl) || 0;
      if (expectedCount > 0) {
        const diff = count - expectedCount;
        if (Math.abs(diff) > 1) {
          Logger.warn(
            'Exporter',
            `Kommentar-Diskrepanz für Thread ${threadId}: ` +
            `Seite zeigt ${expectedCount}, GQL lieferte ${count} ` +
            `(${diff > 0 ? '+' : ''}${diff}). ` +
            `Mögliche Ursachen: gelöschte Kommentare, Paginierungsfehler, ` +
            `geänderter GQL-Feldname (preparedHtmlContent / createdAtTs).`
          );
        } else {
          Logger.debug('Exporter', `Kommentar-Check ✓ ${count}/${expectedCount}`);
        }
        meta.Statistik.Erwartet   = expectedCount;
        meta.Statistik.Diskrepanz = diff; // 0 = perfekt, positiv = mehr, negativ = weniger
      }

      // 4. Cache
      await Cache.set(threadId, meta, allComments);

      // 5. Open UI
      _openUi(meta, allComments, () => _run(btn, true));

    } catch (e) {
      Logger.error('Exporter', 'Export fehlgeschlagen', e);
      alert('[MDM Exporter] Fehler: ' + e.message);
    } finally {
      _running = false;
      btn.disabled  = false;
      btn.textContent = origText;
    }
  }

  // ── Button injection — neben "Zum Deal" im Deal-Header ────────────────────

  /**
   * Sucht den "Zum Deal"-Container (verschiedene Selektoren für mydealz-Varianten).
   * Gibt das Elternelement zurück, in das der Button eingefügt werden soll.
   */
  function _findDealButtonAnchor() {
    // "Zum Deal"-Link hat immer href="/visit/dealshot/<id>"
    const zumDealLink = document.querySelector(
      'a[href*="/visit/dealshot/"], a[href*="visit/thread/"]'
    );
    if (zumDealLink) return zumDealLink.parentElement;

    // Fallback: Preis-Zeile im Deal-Header
    const priceRow = document.querySelector(
      '[class*="price"], [data-t="thread-price"], .threadDetailPage-price'
    );
    if (priceRow) return priceRow.parentElement;

    // Letzter Fallback: irgendein Deal-Header
    const header = document.querySelector(
      '[class*="threadDetail"][class*="header"], [class*="dealHeader"], .thread-header'
    );
    return header ?? null;
  }

  function _injectButton() {
    if (document.getElementById('mdm-export-btn')) return;

    const btn = document.createElement('button');
    btn.id          = 'mdm-export-btn';
    btn.textContent = '🧠 AI Export';
    btn.onclick      = () => _run(btn);

    const anchor = _findDealButtonAnchor();

    if (anchor) {
      // ── Button 2: inline neben "Zum Deal" ─────────────────────────────────
      Object.assign(btn.style, {
        display:      'inline-flex',
        alignItems:   'center',
        gap:          '5px',
        padding:      '5px 12px',
        background:   'transparent',
        color:        'var(--color-brandGreen, #4ade80)',
        border:       '1px solid var(--color-brandGreen, #4ade80)',
        borderRadius: '6px',
        cursor:       'pointer',
        fontSize:     '12px',
        fontFamily:   'inherit',
        marginLeft:   '8px',
        verticalAlign:'middle',
        transition:   'background 0.15s ease',
      });
      btn.onmouseenter = () => { btn.style.background = 'rgba(74,222,128,0.1)'; };
      btn.onmouseleave = () => { btn.style.background = 'transparent'; };

      // flex auf Elternelement damit der Button sauber neben "Zum Deal" sitzt
      const cs = getComputedStyle(anchor);
      if (cs.display !== 'flex' && cs.display !== 'inline-flex') {
        anchor.style.display    = 'flex';
        anchor.style.alignItems = 'center';
        anchor.style.flexWrap   = 'wrap';
        anchor.style.gap        = '8px';
      }
      anchor.appendChild(btn);
      Logger.log('Exporter', 'Button 2 (inline, neben Zum Deal) injiziert');

    } else {
      // ── Fallback: floating (falls kein Anchor gefunden) ───────────────────
      Object.assign(btn.style, {
        position:     'fixed',
        bottom:       '20px',
        right:        '20px',
        zIndex:       '99999',
        padding:      '8px 14px',
        background:   'var(--color-brandGreen, #4ade80)',
        color:        '#000',
        border:       'none',
        borderRadius: '8px',
        cursor:       'pointer',
        fontSize:     '12px',
        fontFamily:   'inherit',
      });
      document.body.appendChild(btn);
      Logger.log('Exporter', 'Button FAB (fallback) injiziert');
    }
  }

  // ── Public init ────────────────────────────────────────────────────────────

  let _initialized = false;

  function init() {
    if (_initialized) return;      // verhindert doppelte DOMContentLoaded-Registrierung
    if (!_isDetailPage()) return;
    _initialized = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _injectButton);
    } else {
      _injectButton();
    }
  }

  return { init };

})();

if (typeof module !== 'undefined') module.exports = { Exporter };
