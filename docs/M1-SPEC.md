# M1 implementation spec (frozen by Fable, 2026-08-29)

Scope = DESIGN.md v3 §8 item 2: thin workspace + v0.1 hardening. Two phases,
sequential (both touch `lib/living-evidence.js`). Tests must be green after
each phase: `node verify/stats.test.mjs && node verify/rules.test.mjs &&
node verify/e2e.mjs` (+ `node verify/workspace.e2e.mjs` after Phase B).
Playwright: absolute path `/Users/hirokisugimoto/tennis-checker/node_modules/playwright`,
serve `python3 -m http.server 8501 --bind 127.0.0.1`, URLs use 127.0.0.1.

## Phase A — v0.1 hardening + declarative claim rules

### A1. New pure module `lib/claim-rules.js` (no DOM — node-testable)

```js
export function fnv1a(str)            // 32-bit FNV-1a, 8-hex-char string
export function resolvePath(obj, path) // 'moderator.p', 'f.estimate', 'flips_significance.length'
export function fmtTemplate(tpl, ctx) // '{estimate}' → fmt(resolvePath(ctx,'estimate')); numbers via 3-4 sig fmt, arrays join ', '
export function evaluateRules(test, runAnalysis)
// test = { analysis, args, focus?, verdicts }
//   focus = { collection, match_field, match_substring }
//   verdicts = ordered [{ when?: Cond[], default?: true, verdict, reason }]
//   Cond = { path, op: 'lt'|'le'|'gt'|'ge'|'eq'|'ne'|'abs_lt'|'abs_ge', value }
// runAnalysis(analysis, args) -> result object (injected; in the page it calls
// the analyses registry). evaluateRules computes ctx = {...result},
// plus ctx.f = first element of result[collection] where
// String(el[match_field]).includes(match_substring) (error if focus given and no match).
// Walks verdicts in order; a verdict with `when` matches iff ALL conds hold;
// the last entry must have default:true (validate at registration: throw otherwise).
// Returns { verdict, reason: fmtTemplate(reason, ctx), evidence: result }.
```

Rules of the language: no code strings, no eval; unknown op / unresolvable
path → throw with a message naming the claim id.

### A2. `lib/living-evidence.js` hardening

1. **Claims are data.** `config.claims[i] = {id, statement?, rule, test}` (no
   `check` functions anywhere). `evaluateClaim` uses
   `evaluateRules(claim.test, (name, args) => analyses[name](args))`.
   `list_claims` returns `{id, statement, rule, machine_check: claim.test,
   status, stale, evaluated_version, evidence_version}`.
2. **evidence_version.** `state.evidenceVersion = 1`; increment on every
   approval. `claimStatus` entries store `{verdict, run, evaluated_version}`.
   `stale = evaluated_version < evidenceVersion`. Badge CSS class
   `le-chip-stale` driven by this (replace the current approval-loop DOM
   hack). `evaluate_claim` response includes all four fields.
3. **Ledger envelope.** Entry = `{run, time, actor: 'human'|'agent'|'system',
   kind, tool, inputs, summary, evidence_version, result_digest}` where
   `result_digest = fnv1a(JSON.stringify(result))` for analysis/claim/
   proposal/approval events. Boot entry actor = `'system'` (it is currently
   'human' — that was dishonest). Pure read tools (`get_document_overview`,
   `list_claims`, `get_studies`, `get_audit_log`) are NOT ledgered; update
   the overview `rules_of_engagement` to say exactly that ("analysis,
   verdict and mutation calls are ledgered; pure reads are not").
   DOM row rendering unchanged (run/actor/summary) + `title` attr shows
   digest & inputs JSON.
4. **Actor attribution.** `invokeTool(name, args, opts = {actor:'agent'})`;
   the Tool console passes `{actor:'human'}`; WebMCP execute passes
   `{actor:'agent'}`; approval buttons stay 'human'. `api.invokeTool`
   keeps backward-compatible signature (3rd arg optional).
5. **propose_study hardening.** `source` AND `quote` both required (clear
   error naming the missing field). `record_hash = fnv1a(JSON.stringify(
   {author, year, weeks, setting, tester, n1i, n2i, yi, vi}))` computed at
   proposal; response includes it; the approved record carries
   `provenance: {source, quote, proposed_at, approved_at, record_hash}`
   (replaces the current provenance string for approved records; base
   records keep their string). Approval ledger entry includes the hash.
   Dedupe: keep exact (author, year, yi) rejection; additionally, when
   author+year matches an existing/pending record but yi differs, do NOT
   reject — include `possible_duplicate_of: <id>` in the response.
6. **Registration status.** `state.agent.active` only when ALL tools
   registered; partial → `{active: false, status: 'degraded',
   failed: [names...]}`; zero → status 'absent'. Banner text covers all
   three states (degraded lists the failed tools).

### A3. `index.html`

Convert all 6 claims to the AST (behavior identical; verdicts on the shipped
data must remain: c-textbook challenged, c-bias nuanced, others supported):

- c-textbook: overall{method:'REML'} → [{when:[{path:'significant',op:'eq',value:true},{path:'estimate',op:'gt',value:0}], verdict:'supported', reason:'pooled SMD {estimate}, p = {p} < 0.05'}, {default:true, verdict:'challenged', reason:'pooled SMD {estimate} [{ci_lower}, {ci_upper}], p = {p} — the general claim is not supported across the full evidence base'}]
- c-overall: overall → supported iff significant eq false AND estimate abs_lt 0.2; challenged iff significant eq true; default nuanced
- c-moderator: metareg{moderator:'weeks',cap:3} → supported iff moderator.b lt 0 AND moderator.p lt 0.05 AND R2_percent ge 90; nuanced iff moderator.b lt 0 AND moderator.p lt 0.05; default challenged
- c-window: subgroup{split_field:'weeks',split_at:1} + focus{collection:'groups',match_field:'group',match_substring:'≤ 1'} → supported iff f.estimate gt 0 AND f.significant eq true; default challenged
- c-robust: loo{} → supported iff flips_significance.length eq 0; default challenged
- c-bias: funnel{} → supported iff p ge 0.10; nuanced iff p ge 0.05; default challenged

Keep each claim's `rule` string as-is from the current file.

### A4. Tests

- New `verify/rules.test.mjs` (node, no DOM): fnv1a stability; resolvePath
  incl. `.length` and missing-path throw; fmtTemplate numbers/arrays;
  evaluateRules with a stubbed runAnalysis covering: ordered matching, focus
  selection + no-match throw, every op, default fallthrough, missing-default
  validation. Also: each of the 6 index.html ASTs evaluated against a stub
  returning canned fixture results must yield the expected verdicts (copy
  the ASTs into the test as fixtures — they are data now; drift between
  test fixtures and index.html is checked in e2e anyway).
- `verify/e2e.mjs` updates: audit entries now structured (assert
  `entries.every(e => 'actor' in e && 'evidence_version' in e)`, boot entry
  actor 'system', a human console action logs actor 'human' — drive one call
  through the console UI or invokeTool with {actor:'human'}); staleness
  machine-readable (after approval, `list_claims` shows stale:true for
  evaluated claims; after re-evaluate, stale:false); propose_study without
  quote rejected; response carries record_hash; approved record provenance
  object present via get_studies. Keep every existing green assertion
  (adapt, don't delete coverage). package.json test script: add rules test.

## Phase B — workspace mode + export

### B1. `lib/living-evidence.js` additions (guarded by `config.mode`)

- `config.mode: 'document' (default) | 'workspace'`; `config.storageKey`.
- Workspace differences:
  - dataset may start empty; `refreshHeadline` with k<2 renders a
    placeholder ("evidence base empty — agents can propose studies; you
    approve them") and skips the fit (bound stats show '—'); everything
    that needs k>=2 throws its normal error through tools.
  - Claims render into `#le-claims-list` (each: statement span with
    data-claim id + badge), not prose spans.
  - Extra tools (workspace mode only):
    - `set_hypothesis {text}` (required, 1..500 chars) → updates state +
      `#le-hypothesis` text + ledger (mutation).
    - `add_claim {id?, statement, rule, test}` → validates test via a
      dry-run against a null analysis executor? NO — validate shape only
      (verdicts non-empty, last default, conds well-formed ops, analysis
      name in registry, focus shape); id auto `wc01…` if absent; duplicate
      id rejected; renders list item; ledger.
    - `export_document {}` → returns `{filename, bytes, html}` and triggers
      a browser download (Blob + anchor). See B3.
  - Persistence: serialize `{v:1, title, hypothesis, approved, pending,
    claims, claimStatus: [[id,{verdict,run,evaluated_version}]...],
    ledger: state.audit, evidenceVersion, runCounter}` to
    localStorage[storageKey] on every mutation (approval, reject, proposal,
    claim add, hypothesis change, evaluation); restore on init BEFORE first
    render (re-render ledger rows from stored entries; re-apply badges).
    Wrap all storage access in try/catch (private mode). A "Reset
    workspace" button in the page header clears the key after a confirm().
- Keep document mode byte-behavior identical where possible; all Phase A
  tests stay green.

### B2. `workspace.html` (new page)

Same visual language as index.html (reuse lib CSS + similar inline styles).
Sections: header (title "Living Evidence Workspace", status banner);
hypothesis block (`#le-hypothesis` display + the reset button); how-it-works
box (2 columns: human = approve/curate/export, agent = get_document_overview
first, propose with quote+source, add_claim, evaluate); evidence (main
figure + bound stats line); pending proposals; claims list
(`#le-claims-list`); Reader's Workbench; audit ledger; tool console;
footer (link to index.html exemplar + repo). Boot:
`initLivingEvidence({mode:'workspace', storageKey:'le-workspace-v1',
title:'Living Evidence Workspace', hypothesis:'(not set — use
set_hypothesis)', dataset:{id:'workspace', label:'Your evidence base',
effect_measure:'SMD', fields:{…same as exemplar…}, studies:[]},
subgroupFields/moderators same as exemplar, claims:[]})`.

### B3. Export (the recursion made literal)

`export_document` builds a SELF-CONTAINED single-file living document:

1. Fetch same-origin text of `lib/living-evidence.css`,
   `lib/meta-stats.js`, `lib/meta-plots.js`, `lib/claim-rules.js`,
   `lib/living-evidence.js`.
2. Transform each JS source: strip import statements (regex over the full
   source: `/^import\s[^;]*?;\s*$/gm` AND the multi-line form
   `/^import\s*\{[\s\S]*?\}\s*from\s*'[^']*';\s*$/gm`), then replace
   `/^export\s+(function|const)/gm` → `$1`. Concatenate in order:
   meta-stats, meta-plots, claim-rules, living-evidence.
3. Emit HTML: doctype; head (charset, viewport, title = workspace title,
   inline `<style>` = the CSS + minimal article styles); body = article
   skeleton: h1 title; hypothesis paragraph; a claims section where each
   claim statement is a `.le-claim` span with `data-claim`; evidence
   section with `#le-main-figure` + bound stat line (`data-le-bind` spans);
   provenance appendix `<details>` table (author/year/yi/vi/weeks/source/
   quote per record); `#le-workbench`, `#le-pending` (inside
   `#pending-section`), `#le-ledger`, `#le-console`, `#le-status`; footer
   "Exported from Living Evidence Workspace, <ISO date>". Then one
   `<script type="module">` containing the concatenated runtime + a boot
   block: `const DATASET = <JSON of approved records incl. provenance>;
   initLivingEvidence({mode:'document', title, hypothesis, dataset,
   claims: <JSON ASTs>, subgroupFields, moderators});`
4. Filename: `living-evidence-export-<yyyymmdd-hhmm>.html`. Ledger the
   export (mutation-kind event, digest of html).

The exported file must work from file:// or any static host with NO network
access and NO reference to the workspace origin.

### B4. `verify/workspace.e2e.mjs` (new)

Full loop, real browser:
1. fresh profile → workspace.html → status banner ok, k placeholder shown.
2. set_hypothesis; propose_study missing quote → error; three real
   Raudenbush rows (s10 Maxwell, s17 Rosenthal&Jacobson, s08 Claiborn —
   copy exact yi/vi/weeks from data/raudenbush1985.js, quote strings like
   'd = 0.80, weeks = 1 (Raudenbush 1984, Table 1)') proposed with
   source+quote → three cards → approve all three via buttons →
   evidenceVersion 4? (starts 1, +1 per approval → 4), k=3, forest renders.
3. run_meta_analysis works on k=3 (assert finite estimate; REML on those 3
   rows — compute expected via node in the test by importing meta-stats
   and assert equality to 1e-9).
4. add_claim (supported-shaped: overall estimate gt 0 … pick conds that
   hold for the 3 chosen records; verify verdict + badge in claims list;
   then approve nothing further so stale stays false).
5. reload page → hypothesis, k=3, claims, badges, ledger all restored;
   evidence_version preserved.
6. export_document → write result.html to verify/_export_test.html (from
   node side), serve, open in second page → window.LivingEvidence exists,
   tools.length 12+ (document mode set), k=3, evaluate the exported claim →
   same verdict; assert NO network requests to /lib/ (page.on('request')
   collector — only the document request itself). Delete the temp export
   file at the end (leave nothing untracked beyond gitignore).
7. Reset button clears storage (click, confirm dialog accepted → reload →
   empty state).

### Non-goals for M1 (do not build)

Autonomous collection, log_search/screen_source tools, generic (non-SMD)
schemas, ontology editing, dossier scores, numeric power output, backend
anything.
