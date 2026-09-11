# Architecture Brief — mydealz Manager (MV3 Extension)

> **Purpose of this document:** This is a request for architecture-level thinking.
> It is deliberately written at a high level of intent, not at the level of
> individual functions. The audience is a strong reasoning model (e.g. Claude
> Sonnet). **Do NOT write code.** The expected output is an architecture
> proposal: boundaries, data flow, patterns, risks, and a migration path.

---

## 1. The One-Paragraph Vision

A browser extension (Chrome MV3) that runs on mydealz.de and preisjaeger.at
(deal platforms of the Pepper/Atolls network). The core idea is a clean
pipeline:

```
mydealz.de  ──GraphQL (primary)──▶  normalised DealData  ──▶  independent,
            ──DOM/SSR-state (fallback)─┘                    fault-isolated
                                                            feature modules
                                                            (filter, dim,
                                                            export, collect…)
```

One stable **data layer** talks to the page. Everything else is a **feature
module** that receives normalised deal objects, makes an independent decision
(hide / dim / annotate / export), and can crash without affecting any other
module or the core.

## 2. Product Context (what the extension does)

- Filter deals by word expressions (AND / NOT / wildcard / exact phrase,
  word-boundary aware incl. German umlauts), whitelist override
- Block merchants (by ID) and users, hide own cold votes, hide cold deals
- Max price / min discount thresholds
- Three-tier price dimming (A = full, B = dimmed, C = hidden), slider ranges
- Manual per-deal hide (✕ button) and context settings (⚙ button)
- AI-oriented exports: comment threads as markdown (detail pages), deal
  collections as markdown (listing pages)
- Settings via in-page modal + toolbar popup; all state local (chrome.storage)

## 3. Platform Facts (verified against the live site)

- Pages are Next.js SSR with `window.__INITIAL_STATE__` containing thread data;
  dynamically appended cards (infinite scroll) may not be in it
- A GraphQL endpoint exists (`/graphql`, POST, CSRF token from meta/cookie,
  Pepper-specific headers). Introspection is disabled; query names must be
  guessed and **can change on deploys** (persisted-query hashes are not stable)
- DOM carries stable analytics attributes (`data-t="thread"`,
  `data-t="threadLink"`, `data-t="merchantLink"`) plus semantic classes
  (`cept-*`) and fragile design classes (prices, badges, line-through)
- Content scripts: no ES modules, single script context, MV3 service worker

## 4. Current State (honest summary)

~4.000 LOC, 13 files, no npm dependencies, custom concatenation bundler
(`build.js`) with fixed module order, IIFE modules exposing globals. Layers
today:

- **Infra:** logger, storage wrapper, settings store (cached, schema-versioned,
  migrated), settings modal (page UI)
- **Data:** deal parser (SSR state → DOM), GraphQL client (query/retry/429)
- **Features:** deal-filter (pure engine + UI layer), AI exporter, collector
- **Entry:** content.js — idle-chunked processing, generation counter, smart
  MutationObserver (only reacts to new deal articles), `safeInit()` error
  boundary for optional features

Known architectural weaknesses (self-diagnosed, fix or work around in your
proposal):

- Settings surface is split: page modal and toolbar popup each render/save a
  different subset; key/default constants are duplicated in two places (drift
  risk); one setting is currently unreachable via UI
- Toolbar popup talks to `chrome.storage` directly, bypassing the data layer
- Data layer is "half built": parser is solid on SSR state + DOM, but the
  GraphQL access is only a best-guess query that is unused; features that need
  structured data (exporter, collector) each define their own ad-hoc queries
- Parser returns slightly different field completeness per source
  (state/DOM), so downstream feature code must know which path produced the
  object — a leaky abstraction
- No tests exist; engine logic is pure in principle but only runnable by
  copy-paste into a browser console

## 5. Constraints (non-negotiable)

1. **Fault isolation:** any feature may throw at init or at runtime; the
   filter core and the UI must keep working. Core itself must be minimal and
   battle-proven.
2. **Local-only:** no data ever leaves the browser except calls to the site's
   own GraphQL endpoint. No analytics, no third parties.
3. **Performance:** listing pages can hold 100+ deals; synchronous per-deal
   evaluation must stay cheap (idle-chunked, no per-deal network calls in the
   render path).
4. **No build/tooling complexity:** concatenation build with IIFE modules is
   the current choice (ADR exists). Proposals may challenge this, but must
   justify a migration cost/benefit — MV3 forbids `type=module` in content
   scripts.
5. **Schema evolution:** users accumulate filter lists over months; settings
   storage needs a trustworthy versioning/migration story.
6. **Two surfaces:** content script (page logic) and service worker/popup
   (cross-tab sync, stats). Keep their responsibilities crisp.

## 6. What We Want From You

A **design document** (markdown, prose + diagrams allowed, NO code) covering:

1. **Target architecture** — layer/module boundaries, ownership of data flow,
   naming of the patterns you choose (and why they fit better than
   alternatives).
2. **Data acquisition strategy** — how GraphQL should become the primary
   source (query design, deploy-resilience, caching, rate limits, when to fall
   back to DOM/SSR state), and how "one deal, one normalised shape" is
   guaranteed regardless of source.
3. **Feature module contract** — the minimal interface every feature
   implements, how features register, how results compose (one deal → N
   independent verdicts), and how a crashed feature is degraded, not dropped.
4. **Settings architecture** — single source of truth for keys/defaults,
   schema migrations, how page-modal and popup share it without duplication.
5. **Error & observability model** — error boundaries, logging, a debug mode
   that explains every hide/dim decision.
6. **Testability** — how to make the pure parts testable in plain Node
   without a browser, given the IIFE/concatenation reality (or a better
   alternative).
7. **Migration path** — incremental steps from the current codebase to the
   target architecture, each step leaving the extension usable. Explicitly
   ordered, smallest-risk first.
8. **Risk register** — the top 5 architectural risks with early-warning
   signals.

Be opinionated. Prefer a small number of strong, simple decisions over an
exhaustive framework. If something in the current codebase is already good,
say so and keep it.
