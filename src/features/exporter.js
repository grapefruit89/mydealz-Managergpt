/**
 * exporter.js
 * AI Export feature for mydealz Manager.
 *
 * Activates on deal detail pages (/deals/*, /diskussion/*, /gutscheine/*).
 * Collects all comments (with nested replies) + deal metadata,
 * caches them in IndexedDB for 1 hour, then opens a popup export window.
 *
 * ── Reply-Strategie (verifiziert, MydealzExporter-Erkenntnis) ────────────────
 *   1. repliesPreview aus dem Root-Objekt (gratis — meiste Replies dabei)
 *   2. Nur Parents mit verdeckten Replies (preview < replyCount) via
 *      30er-Alias-Batch nachladen (GraphQLClient.fetchRepliesBatch)
 *   3. Batch-Fehler → graceful degradation auf die Preview-Replies
 *
 * Dependencies (must be loaded before this module):
 *   - Logger         (logger.js)
 *   - GraphQLClient  (graphql-client.js)
 */

const Exporter = (() => {

  // ── Page detection ─────────────────────────────────────────────────────────

  /**
   * DETEKTOR statt Pfad-Regex: Detailseiten tragen `threadDetail` im
   * __INITIAL_STATE__ (live verifiziert 2026-09-11 auf mydealz UND den
   * fremdsprachigen TLDs). Der alte Pfad-Regex /(deals|diskussion|gutscheine)/
   * war deutsch — auf dealabs (/bons-plans-3410724), hotukdeals (/deals-…, aber
   * /offers-Varianten) und Co. hätte er Detailseiten verfehlt.
   */
  function _isDetailPage() {
    return !!window.__INITIAL_STATE__?.threadDetail?.threadId;
  }

  function _getThreadId() {
    // 1. __INITIAL_STATE__ (most reliable — identisch zu _isDetailPage)
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

  // ── GQL: verifizierte Shapes aus graphql-client.js ──────────────────────────
  // Q_COMMENTS im Client enthält bereits repliesPreview — die meisten Replies
  // sind gratis im Root-Objekt enthalten (MydealzExporter-Erkenntnis). Fehlende
  // (tiefe/verdeckte) Replies laden wir per 30er-Alias-Batch nach — 1 Request
  // pro 30 Parents statt 1 Request pro Parent.

  // ── Comment-Transform + Prompt-Texte: SSOT-Module ─────────────────────────
  // CommentNormalizer (CommentData-Contract), PromptBuilder (pure) und
  // ExportPayload (Contract) leben in src/core/ — der Exporter ist jetzt
  // nur noch Orchestrierung (GQL + Cache) + dünne UI (Export-Split).

  // ── Metadata extraction (detail page) ─────────────────────────────────────
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
    // GraphQLClient.fetchComments: verifizierte Query inkl. repliesPreview,
    // Pagination { last count current } — siehe graphql-client.js
    return await GraphQLClient.fetchComments(threadId, page, 100);
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

  // ── Status helper (Button + SidePanel synchron) ─────────────────────────────

  function _pushStatus(text) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'MDM_EXPORT_STATUS', text }).catch(() => {});
    }
  }

  function _setStatus(btn, text) {
    if (btn) btn.textContent = text;
    _pushStatus(text);
  }

  // ── Export UI (SidePanel first, popup window als Fallback) ─────────────────

  /**
   * Zeigt das Export-Ergebnis im SidePanel (Sidebar neben dem Deal).
   * Quelle: Chrome-API-Review (ROADMAP §2.13) + User-Wunsch „Dashboard als
   * Sidebar statt Extra-Fenster". Das Panel wird beim Button-Klick geöffnet
   * (frische User-Gesture, background: MDM_EXPORT_OPEN); die Export-Daten
   * landen nach der Sammel-Phase über chrome.storage.session im Panel.
   * Läuft SidePanel nicht (Userscript-Build, alte Engine) → altes Popup-Fenster.
   */
  async function _showResult(meta, comments, onRefresh) {
    let opened = false;
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        opened = (await chrome.runtime.sendMessage({ type: 'MDM_EXPORT_OPEN' }))?.opened ?? false;
      } catch { opened = false; }
    }
    if (!opened) { _openUi(meta, comments, onRefresh); return; }

    // Prompt-Texte vorgenerieren (SidePanel ist Extension-Seite und kennt
    // den Content-Bundle-Code nicht). RAW bei Mega-Threads weglassen,
    // damit chrome.storage.session (10 MB Quota) nicht ans Limit läuft.
    const promptTexts = PromptBuilder.buildAll(meta, comments);
    if (promptTexts.RAW && promptTexts.RAW.length > 900_000) delete promptTexts.RAW;

    // ExportPayload-Contract: Kommentare wandern mit (Chat-Basis, §2.14)
    const exportPayload = ExportPayload.create(threadId, meta, comments);
    const payloadJson = JSON.stringify(exportPayload);

    const payload = {
      schema: exportPayload.schema,
      threadId: exportPayload.threadId,
      meta,
      promptTexts,
      generatedAt: exportPayload.generatedAt,
      hasRefresh: !!onRefresh,
      // Kommentare für den Chat — bei Mega-Threads aus Quota-Gründen weglassen
      comments: payloadJson.length < 2_000_000 ? comments : null,
      stats: exportPayload.stats,
    };
    chrome.runtime.sendMessage({ type: 'MDM_EXPORT_DATA', payload }).catch(() => {});
  }

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
    MdmPromptLevels.LEVELS.forEach(key => {
      const btn = d.createElement('button');
      btn.className = `tab ${key === currentLevel ? 'active' : ''}`;
      btn.textContent = MdmPromptLevels.LABELS[key];
      btn.onclick = () => {
        d.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentLevel = key;
        out.value = PromptBuilder.build(key, meta, comments);
      };
      tabContainer.appendChild(btn);
    });

    out.value = PromptBuilder.build(currentLevel, meta, comments);

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
      if (btn) alert('[MDM Exporter] Export läuft bereits…');
      return;
    }

    const threadId = _getThreadId();
    if (!threadId) { alert('[MDM Exporter] Thread-ID konnte nicht ermittelt werden.'); return; }

    _running = true;
    if (btn) btn.disabled = true;
    const origText = btn?.textContent ?? '🧠 AI Export';

    try {
      // 1. Cache check
      if (!forceRefresh) {
        const cached = await Cache.get(threadId);
        if (cached) {
          Logger.debug('Exporter', 'Aus Cache geladen (Thread', threadId + ')');
          cached.meta._fromCache = true;
          cached.meta._cacheTime = cached.timestamp;
          _showResult(cached.meta, cached.comments, () => _run(btn, true));
          return;
        }
      } else {
        await Cache.remove(threadId);
      }

      // 2. Metadata
      _setStatus(btn, '⏳ Metadaten…');
      const meta = _getMetadata(threadId);
      const opUsername = meta.OP;

      // 3. First comment page (to get total pages)
      _setStatus(btn, '⏳ Kommentare…');
      const firstPage = await _fetchRootPage(threadId, 1);
      if (!firstPage) throw new Error('Kommentar-API nicht erreichbar (Rate Limit?)');

      const totalPages = firstPage.pagination?.last ?? 1;
      let count = 0;

      /**
       * Verarbeitet eine Root-Seite:
       *   1. Replies aus repliesPreview übernehmen (gratis, im Root-Objekt)
       *   2. Nur Parents mit verdeckten Replies (preview.length < replyCount)
       *      sammeln → 30er-Alias-Batch-Nachladen (1 Request pro 30 Parents)
       *   3. Bei Batch-Fehler: graceful degradation auf die Preview-Replies
       */
      async function processItems(items) {
        const nodes       = [];
        const nodeByParent = new Map();   // commentId → node (für fehlende Replies)
        const needFetch   = [];

        for (const item of items) {
          const node    = CommentNormalizer.transform(item, opUsername);
          const preview = item.repliesPreview ?? [];
          const missing = item.replyCount > 0 && preview.length < item.replyCount;

          if (!missing) {
            // Preview deckt alles ab → komplett übernehmen, kein Request
            for (const r of preview) {
              node.replies.push(CommentNormalizer.transform(r, opUsername));
              count++;
            }
          } else {
            needFetch.push(item.commentId);
            nodeByParent.set(item.commentId, { node, preview });
          }

          count++;
          _setStatus(btn, `⏳ ${count}/${meta.KommentarAnzahl || '?'}`);
          nodes.push(node);
        }

        if (needFetch.length > 0) {
          try {
            const map = await GraphQLClient.fetchRepliesBatch(threadId, needFetch, {
              onProgress: (done, total) => {
                _setStatus(btn, `⏳ Replies ${done}/${total} (Batch)…`);
              },
            });
            for (const [pid, { node, preview }] of nodeByParent) {
              const fetched = map[pid] ?? [];
              if (fetched.length > 0) {
                // Komplettliste aus Batch ersetzt die Teil-Preview (keine Duplikate)
                for (const r of fetched) {
                  node.replies.push(CommentNormalizer.transform(r, opUsername));
                  count++;
                }
              } else {
                // API lieferte leer → Preview bleibt beste verfügbare Quelle
                Logger.warn('Exporter', `Reply-Batch leer für Parent ${pid} — nutze repliesPreview (${preview.length})`);
                for (const r of preview) {
                  node.replies.push(CommentNormalizer.transform(r, opUsername));
                  count++;
                }
              }
            }
            _setStatus(btn, `⏳ ${count}/${meta.KommentarAnzahl || '?'}`);
          } catch (e) {
            // Batch fehlgeschlagen → Preview-Replies behalten statt ganze Seite zu werfen
            Logger.warn('Exporter', `Reply-Batch fehlgeschlagen (${e.message}) — nutze repliesPreview als Fallback`);
            for (const [, { node, preview }] of nodeByParent) {
              for (const r of preview) {
                node.replies.push(CommentNormalizer.transform(r, opUsername));
                count++;
              }
            }
          }
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
      _showResult(meta, allComments, () => _run(btn, true));

    } catch (e) {
      Logger.error('Exporter', 'Export fehlgeschlagen', e);
      alert('[MDM Exporter] Fehler: ' + e.message);
    } finally {
      _running = false;
      if (btn) btn.disabled  = false;
      if (btn) btn.textContent = origText;
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
      Logger.debug('Exporter', 'Button 2 (inline, neben Zum Deal) injiziert');

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
      Logger.debug('Exporter', 'Button FAB (fallback) injiziert');
    }
  }

  // ── Public init ────────────────────────────────────────────────────────────

  let _initialized = false;

  function init() {
    if (_initialized) return;      // verhindert doppelte DOMContentLoaded-Registrierung
    if (!_isDetailPage()) return;
    _initialized = true;

    // SidePanel-„🔄 Neu laden“ → Cache verwerfen + Export erneut
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
      chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
        if (msg?.type === 'MDM_EXPORT_REDO') {
          _run(null, true);
          sendResponse({ ok: true });
          return false;
        }
        return false;
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _injectButton);
    } else {
      _injectButton();
    }
  }

  return { init, _test: { _run } };

})();

if (typeof module !== 'undefined') module.exports = { Exporter };
