# AGENT_SYNC — living-evidence

> Protocol: read this file IN FULL before touching the repo; append/update the
> Status, Decisions and Open questions sections before stopping work. Newest
> entries first inside each section.

## Project

WebMCP Challenge 2026 entry (https://webmcp.devpost.com/ — deadline
**2026-09-03 13:00 PDT** = 2026-09-04 05:00 JST; winners 9/23).
Concept: **Living Evidence — documents your AI can cross-examine.**
Format (spec + runtime + template) plus one exemplar: a living meta-analysis of
the Pygmalion effect (Raudenbush 1985 dataset, 19 studies).

Judging criteria targeted: WebMCP Leverage / Execution / Potential Impact /
Creativity & Ambition. Positioning: NOT "executable papers again" — executable
papers served human hands; this serves the machine reader (+ human approval gates).
Say "cross-examine", show ✗ challenged badge on the textbook claim in every demo.

## Status (2026-09-01 Board in submission + Codex round 2 — CURRENT)

- **Board included in the submission** (user decision): README + SUBMISSION
  updated (board paragraph/bullet, video re-cut to 9 beats targeting ≤2:50
  with a complete synthetic demo prompt and jump-cut/pre-stage directions).
- **Codex packet review #2** (4-page runtime dump + README + SUBMISSION;
  verdict "not submission-ready yet") — adjudicated and applied:
  - Board runtime (Sonnet, D1-D13): get_discoveries →
    **get_board_diagnostics** with literal bucket names + inspectable
    objects; tally_status → 4-state **evidence_edge_state**
    (none|support_only|contradiction_only|mixed — the 3-state design could
    not classify contradiction-only claims); topic + e-1995 rewritten to
    attribute figures to the conversation; **ed35/ed43 REMOVED** (their
    'contradicts h-selection' contradicted their own rationales — the
    refuted target 'selection as sole explanation' is asserted by no node;
    seed now 41 edges, every supports/contradicts edge carries a rationale);
    propose_node discriminated oneOf (evidence branch requires
    value/year/kind/cited_as/quote); suggested_flow fixed (was impossible as
    written); honesty/ledger contract corrected ('active edges = preloaded
    seed + human-approved additions'; set_topic mutates without approval —
    said so); suite_context on all four pages; duplicate edges rejected;
    verification labels on ALL evidence. Fault injection re-proven red.
  - Docs (Fable): construct fixes (non-working wives, conversation-reported,
    'Japan's highest' attributed not asserted); Atlas collection-frame
    limits everywhere ('none of these nineteen records' — a coverage lead,
    not nonexistence proof); moderator 'only' scoped to the corpus +
    authored-model caveat; hash → drift-detecting checksum; per-page tool
    counts (12/15/10/11); README design rules matched to the shipped ledger
    contract; absolutes softened (kept the manifesto lines: 'For an agent,
    reading is rerunning', 'first page of an executable layer').
  - board.html static prose synced to the new vocabulary (Fable).
- Suites: six, all green (board now 136 checks), independently re-run.
- REJECTED from Codex round (recorded): renaming the `tests` edge type to
  `would_test` (diagnostic rename covers the honesty; edge rename ripples);
  splitting evidence `kind` into source_form × analysis_type (post-deadline);
  full removal of rhetorical spine from the pitch.

## Status (2026-08-31 Evidence Board)

- **board.html + lib/board.js + data/housewife-board-seed.js shipped** per
  docs/BOARD-SPEC.md (frozen by Fable; built by Sonnet in 2 stages per the
  user's new hierarchy: Sonnet implements, Fable orchestrates/reviews).
  The Evidence Map (DESIGN v3 §7 Layer 1) generalized beyond the SMD genre:
  hypotheses/claims/evidence/mechanisms/questions + typed-edge validity
  matrix, propose→approve for nodes AND edges, computed discoveries
  (contested/unsupported/single-source/untested — explicitly bookkeeping,
  not truth), localStorage persistence, 11 WebMCP tools born compliant with
  the Codex-round conventions. Seed = the owner's ChatGPT research
  conversation on 東京の専業主婦率 (40 nodes / 43 edges, verbatim quotes,
  every evidence node labeled 'unverified — extracted from a conversation').
- **Spec contradiction caught by the build**: §6 named five
  evidence→hypothesis edges the §1 matrix forbade; Sonnet correctly obeyed
  the matrix and flagged it. Fable RULING (recorded in BOARD-SPEC §1):
  matrix extended (supports/contradicts allow evidence→hypothesis), the five
  edges restored — e-1995 directly contradicting h-selection is the board's
  most instructive structure.
- Review round (Fable×3) highlights, all applied by Sonnet (B1-B12):
  edge-endpoint trimming (lines were striking through node labels);
  restore-path validation for PENDING items (tampered snapshot could plant a
  quote-less evidence node via one Approve); **golden per-claim tally map
  transcribed from the spec as literals** — reviewer proved the old
  "independent" recomputation shared the seed module and stayed green under
  a flipped seed edge; the golden now goes red on the same injection
  (proven). Golden seed values pinned (e-mukyo 26.4/7.3 etc., e-kyuyo's
  canonical no-verbatim-quote placeholder).
- Accepted deviations (recorded): pending items show a pointer note in the
  detail panel instead of duplicate approve buttons; long 'tests' edges can
  cross an unrelated intermediate node (one case: q-causal over e-jilpt16 —
  dotted, still readable; path routing is out of v1 scope). Map height is
  computed (830) not the spec's ≈760.
- Suites: stats / rules 104 / e2e / workspace / atlas / board — six suites
  all green, independently re-run by Fable.
- OPEN: whether board.html enters the Devpost submission (user decision);
  README/SUBMISSION do not mention the board yet.

## Status (2026-08-30 Codex implementation review — fixes applied)

- **docs/CODEX-FIX-DIRECTIVE.md (frozen, Fable-adjudicated) implemented in full,
  C1–C30.** Scope: the agent-visible tool surface — lib/living-evidence.js,
  lib/atlas.js, data/pygmalion-claims.js, the c-moderator prose span in
  index.html, and the five verify suites. REJECTED items in the directive's
  header were NOT implemented. All five suites green afterwards
  (stats 38 / rules 104 / e2e 132 / workspace 142 / atlas 169 — every suite gained
  assertions, none lost any).
- **The one real behaviour bug: c-moderator's AST.** Its default branch narrated
  a cause ("moderator not significant") for every non-supported case, so a slope
  that was significant and POSITIVE (contradicting the claim outright) was
  reported as a failure to detect anything. A branch for
  `p < 0.05 AND b ≥ 0` now precedes the default; the default's reason is
  "the required negative association was not detected". Red-then-green proven
  against the old AST: fixture (b = 0.21, p = 0.001) printed "moderator not
  significant (slope 0.21, p = 0.001)".
- Other load-bearing changes: verdicts now ship `verdict_scope` ("authored
  statistical rule only — not an independent judgment of truth, validity, or
  bias") in both runtimes; "Never recompute … call tools" replaced by "label
  independent calculations external, do not silently substitute them"; metafor
  validation scoped to numerical reproduction; export_document returns a receipt
  ({filename, bytes, download_started, content_digest}) and only ships the HTML
  under `include_html: true`; atlas gained `list_nodes` and `get_audit_log`
  (8 → 10 tools, atlas.html's "eight tools" line updated with them) and accepts
  bare ids ('s10' ≡ 'rec:s10', 'c-window' ≡ 'claim:c-window'); the replication
  gap reports `count_with_prereg: null` + `assessment_status: 'not_collected'`
  instead of a fake measured 0; the coverage gap quotes the model's single
  prediction for the whole band (pred3 = intercept + 3·slope ≈ −0.0644, computed
  live and re-derived node-side in the e2e).
- **Memos (single observation each — playbook candidates, see "propose" below):**
  - A verdict/decision rule whose DEFAULT branch names a *cause* mislabels every
    case it did not enumerate. Enumerate the sign × significance quadrants (or
    whatever the equivalent partition is) and keep the default's wording purely
    negative ("X was not detected"), never explanatory.
  - Tool results that can be megabytes (file exports, full documents) should
    return a receipt by default and gate the payload behind an explicit flag;
    the human already has the file, and the agent's context is the scarce thing.
  - A field the schema cannot represent must be `null` + an explicit
    `assessment_status`, never `0`. "0 of 19 carry X" reads as measured-and-absent.
  - Runtime validation must mirror the declared inputSchema (integer/minimum
    checks): a schema the handler does not enforce is documentation, not a
    contract.
  - No `~/.claude/playbooks/` file covers agent-facing tool-surface design.
    PROPOSAL for the user: a new `agent-facing-tool-surfaces.md` playbook to hold
    the four memos above once a second project confirms them.

## Status (2026-08-30 M2-lite — earlier today)

- **M2-lite (atlas.html) implemented per docs/M2LITE-SPEC.md** (frozen by
  Fable): read-only evidence map — 33 nodes (1 estimand cell, 2 constructs,
  1 doc, 6 claims, 19 records colored by weeks band, mod:weeks "(candidate)",
  3 COMPUTED gaps), 8 WebMCP tools, M1-parity ledger/console/status. The
  coverage gap (8–16 weeks) and zero-crossing (≈2.6wk) are computed live from
  the data — e2e proves it against an independent node-side recomputation
  (fault-injecting [9,15] goes red). Study brief lists filled + unresolved
  design inputs, NO numeric sample size (DESIGN §4.5), e2e-enforced.
- Claims extracted to data/pygmalion-claims.js (shared by index.html + atlas;
  byte-identical ASTs; e2e.mjs green unmodified).
- Adversarial round (Fable×3): verdict "approve with wording fixes" — all
  numbers matched reviewers' independent recomputation; must-fixes were 4
  honesty sentences ("no band typed in" false universal; "dot area ∝
  precision" with an affine floor; metafor-validation overclaim on new
  surfaces; bare R²=100% missing the clipped-boundary caveat), 3 behaviors
  (p<0.0005 rendered "p = 0" → pFmt '< 0.001'; ledger scrollIntoView hijacked
  the page scroll ~545px per map click → scoped to the ledger box IN BOTH
  atlas.js and living-evidence.js; cell aria-label omitted synthesis
  k/exclusions), 2 test blind spots (brief estimates and glyph↔verdict
  pairing were unasserted — both proven red-then-green). Fixes applied by
  Opus; Fable re-verified.
- **Decision (spec deviation, recorded)**: human map clicks/Enter are
  ledgered as focus_node navigation rows (spec §1.2 letter said unledgered
  selectNode) — kept because the page's own ledger caption promises
  "anything that changes what is on screen is ledgered"; internally
  consistent and e2e-asserted.
- **Note**: the ledger-scroll fix touched lib/living-evidence.js post-M1 (one
  line, same bug); all M1 suites re-run green.
- Docs updated by Fable: SUBMISSION (atlas beat [2:20–2:40], Devpost map
  bullet; video re-timed to end 2:55), README (atlas row + Explore-the-map).

## Status (2026-08-29 M1 COMPLETE)

- **M1 shipped and green** (4 suites: stats / rules 93 / e2e 110 / workspace
  e2e 126; independently re-run by Fable after every agent hand-off).
  Built per docs/M1-SPEC.md in two Opus phases + one Fable adversarial review
  round (3 reviewers) + one Opus fix round:
  - Phase A: claims are declarative rule ASTs (lib/claim-rules.js; check()
    functions now a boot error), machine-readable staleness via
    evidenceVersion, structured ledger envelope (actor/inputs/evidence_version/
    FNV-1a result_digest; boot=system; pure reads not ledgered), actor
    attribution through invokeTool opts, propose_study requires source+quote
    with record_hash binding + possible_duplicate_of, degraded registration
    status.
  - Phase B: workspace mode (workspace.html, 15 tools: +set_hypothesis,
    add_claim, export_document), localStorage persistence w/ corrupt-snapshot
    resilience, Reset button, and **single-file self-contained export**
    (import-stripping concat of the 4 lib modules; runs from file:// with
    zero network — e2e-proven; XSS/`</script>` breakout payload-tested clean).
  - Review round: 2 must-fix (async export mis-attributed actor — fixed by
    capturing actor pre-await, red→green proven; SPEC.md contradicted the
    shipped claims contract — rewritten) + 8 polish applied (restore-path
    claim-id guard proved LOAD-BEARING: unguarded snapshot id killed boot;
    favicon data-URI → zero-request export proof; pending-card restore
    coverage; file:// check; closed-form FE oracle).
  - Docs updated: SPEC.md (AST grammar, actor triple, M1 deltas, workspace
    mode section), README (workspace row + Build-your-own section).
- **Lesson (memo, playbook candidate — observed once)**: in a tool registry
  where one tool is async and the rest sync, restoring ambient context
  (currentActor) in a synchronous finally silently mis-attributes the async
  tool's late ledger writes. Capture ambient context synchronously at async
  entry, before the first await.
- NEXT (per DESIGN v3 §8, all JST): deploy + ONE real ChatGPT
  discovery/invocation (user-gated, was due 8/30 noon) → freeze EOD 8/31 →
  9/1 QA+rehearsal → 9/2 deploy/regression/video/submit. M2-lite only after
  freeze + video dry-run. SUBMISSION.md video script needs a workspace/export
  beat added (~20-30s) — not yet done.

## Status (2026-08-29 Codex review round)

- Codex review executed via `codex exec` (read-only sandbox) → saved to
  docs/DESIGN-REVIEW-CODEX.md. Verdict: vision approved, §8 execution plan
  rejected. DESIGN.md v3 adopts it nearly wholesale (adjudication in v3 §10).
- Plan of record is now v3 §8 (all JST): deploy v0.1 + ONE real ChatGPT
  discovery/invocation by 08-30 noon (user-gated — blocking) → M1 thin
  workspace (SMD genre only, quote-required, declarative rule AST, includes
  v0.1 hardening backlog) → M2 full KILLED, M2-lite read-only graph as
  post-freeze stretch → code freeze EOD 08-31 → 09-01 QA/rehearsal → 09-02
  deploy+regression+video+submit → 09-03 contingency.
- v0.1 hardening backlog (from Codex, folded into M1): machine-readable
  staleness in state+tool responses; structured ledger envelope (actor,
  inputs, spec hash, evidence version, result hash); console actions
  attributed to human; reads logged or contract narrowed; quote+source
  required in propose_study; dedupe key beyond author/year/yi; partial
  registration reported as degraded, not active.
- AWAITING USER: hosting auth for deploy, ChatGPT desktop test session, and
  GO on thinned M1.

## ★ REVIEW REQUEST FOR CODEX (GPT-5.6 Sol) — 2026-08-29 (FULFILLED — see status above)

Codex: please review `docs/DESIGN.md` (DRAFT v2) — the full design for
"Living Evidence Atlas" (claim-graph platform layer above the shipped v0.1
format). Focus on the 8 numbered questions in its §10; answer them directly,
plus anything else you'd attack. Context files: docs/SPEC.md (v0.1 contract +
v0.2 verb sketch), README.md, lib/living-evidence.js + lib/meta-stats.js
(ground truth for any "shipped" claim — grep before trusting reuse claims).
v2 already survived an internal adversarial round (17 must-fix applied, see
git log); don't re-litigate what §10's preamble says was adopted unless you
think the adoption itself is wrong. Write your review into this file under a
"## Codex review (DESIGN v2)" section, or as docs/DESIGN-REVIEW-CODEX.md.
Deadline pressure is real (submission 9/3 13:00 PDT): §8 schedule realism is
a first-class review target, not an afterthought.

## Status (2026-08-29 Atlas design round)

- docs/DESIGN.md v2 written (Fable) — full Atlas design: cell/claim ontology,
  two verification ladders (record R0-R2 + cell dossier with probe
  coverage/fragility), 5-verb loop w/ sequential-inference guardrail, typed
  gaps (coverage gap = model-criticism leverage, NOT within-model VoI),
  WebMCP boundary table (shared-surface criterion), layered architecture,
  hackathon cut with tripwires (M1 demo-able EOD 8/31 else M2 dead; freeze
  9/1; 9/2 deploy+test+video; kill order M2→collection ledger→export).
- v1 was torn up by 3 Fable adversarial reviewers (17 must-fix): flagship
  8-16-week gap example misread our own cap=3 model (effect dies at ~2.6wk;
  band is untested extrapolation — reworded), VoI ranking contradicted the
  flagship example, contradiction trichotomy not exhaustive + needs
  operational definition, claim node conflated cell vs assertion, single
  ladder mixed record/claim semantics + outcome-agnostic L4, sequential
  inference unguarded, winner's-curse in study-brief powering, false "power
  from shipped engine" reuse claim (no power code exists — new M2 module),
  §6 canvas-invisibility justification unsound, recursion overclaimed vs
  actual v0.1 data structures (claims are closures, ledger session-scoped,
  no versioning), protocol-family verb mismatch. All applied in v2.
- User decision pending after Codex review: proceed M1/M2 per §8.

## Status (2026-08-29 vision documentation pass)

- Vision pass DONE (Fable orchestration + Opus×3 drafters + Fable×3 adversarial
  reviewers, then Fable applied fixes): README gained "The bigger picture", SPEC
  gained "v0.2 direction — toward an executable layer for science" (8-verb
  sketch + v0.1 correspondence table, membrane/enclave, ledger-multiplicity,
  workspace recursion + harmonization caveat, versioning, cold start, non-goals
  — all explicitly UNIMPLEMENTED), SUBMISSION Inspiration/What's-next/video
  rewritten around the why-now argument ("for an agent, reading is rerunning").
  Canon = scratchpad vision-brief.md (13 sections), distilled from the owner's
  two vision messages; key vocabulary: executable layer for science,
  auditability infrastructure (NOT truth machine), survived-N-cross-examinations.
  Review must-fixes applied: overpacked video closer trimmed; "fabricated data
  reruns faithfully" corrected to "may rerun cleanly" (canon hedges this).
  v0.1-shipped vs v0.2-direction boundary is stated in all three files — keep it.

## Status (2026-08-29 overnight build)

DONE:
- `lib/meta-stats.js` — engine; goldens vs published metafor output all green
  (REML 0.0837/τ²0.0188/I²41.86; moderator 0.407/−0.157/R²100%; Egger p=0.0574).
- `lib/living-evidence.js` — runtime: 12 WebMCP tools, audit ledger, claim
  badges (supported/challenged/nuanced + stale-on-evidence-change), propose→human
  approve flow, tool console fallback, status banner.
- `lib/meta-plots.js` — SVG forest/LOO/funnel/bubble, light+dark.
- `index.html` — exemplar article (English), 6 claims (c-textbook challenged,
  c-bias nuanced via Egger 0.0574, others supported). Eyeballed light+dark, OK.
- `template.html`, `docs/SPEC.md`, `README.md`, `CLAUDE.md`.
- Tests: `verify/stats.test.mjs` (39 asserts) + `verify/e2e.mjs` (52 checks,
  real Chromium) — all green. Fault-injection spot-checks done (corrupted-data
  goldens, invalid/duplicate proposals).

NOT DONE (needs user or daytime):
- Deploy to public HTTPS (Cloudflare Pages or Netlify — sponsor bonus points;
  needs account/auth → user).
- GitHub repo creation + push (footer/README already point to
  github.com/microckey/living-evidence — create with that name or update links).
- Real test in ChatGPT desktop built-in browser (needs user's ChatGPT desktop;
  tools discovered automatically, check "Site tools" in address bar) and/or
  Chrome with WebMCP (origin trial/flag).
- 3-min demo video (public YouTube, with audio) + Devpost submission text.
- Devpost rules to double-check at submission: one-vs-multiple submissions
  allowed?, open-source license visible in repo (MIT file present? -> add
  LICENSE file), team size bonus.

## Demo script sketch (for the video)

1. Open the page cold: "this article's numbers are computed, not typeset".
2. Agent: get_document_overview → list_claims (all untested).
3. "Test the textbook claim" → ✗ challenged badge appears in the prose live.
4. "How solid is the no-publication-bias claim?" → △ nuanced (Egger p=0.057).
5. "What explains the contradictions?" → meta_regression weeks → R²=100% line.
6. propose_study (a post-1984 replication) → approval card → human clicks
   Approve → k 19→20, forest re-renders, old badges go stale → re-evaluate.
7. Close on the ledger: "every question left a trace on the document itself".

## Decisions

- 2026-08-29: `execute` returns plain objects (WebMCP runtime serializes to JSON)
  — per W3C draft + ChatGPT docs example. Do NOT pre-stringify.
- 2026-08-29: entry point `document.modelContext` w/ harmless navigator fallback;
  schemas all `additionalProperties:false`; tools carry `title` for Site-tools UI.
- 2026-08-29: exemplar topic = teacher expectancy (Raudenbush 1985 via metadat):
  public data, famous effect, and the story turns under cross-examination
  (overall n.s. → ≤1-week subgroup significant; moderator explains 100%).
- 2026-08-29: claim c-bias intentionally worded stronger than the evidence
  ("no signs of publication bias") so the deterministic check yields NUANCED —
  the document can lose against its own checks; that's the format's honesty pitch.
- 2026-08-29: verdicts are three-valued (supported/challenged/nuanced); evidence-
  base changes mark existing badges stale rather than deleting them.
- 2026-08-29: e2e drives `window.LivingEvidence.invokeTool` (documented public
  API = same surface WebMCP wraps); Playwright from ~/tennis-checker, port 8501,
  127.0.0.1, GPU-pinned rasterizer flags.

## Open questions (for the user)

- Deploy target: Cloudflare Pages vs Netlify (both sponsor-credited)? Custom domain?
- Demo's propose_study: keep clearly-labeled hypothetical replication, or dig up
  a real post-1984 expectancy experiment with published d? (Honest default:
  hypothetical, labeled as such on screen.)
- Team: solo entry, or add teammates (prize bonus for multi-member teams)?
- Second submission (Devpost may allow multiple): none planned; the veggie/faces
  ideas were set aside.

## Next steps (suggested order)

1. User: create GitHub repo (public, MIT) + push; deploy static site; test in
   ChatGPT desktop browser — fix anything the real agent runtime surfaces.
2. Record video following the demo script; write Devpost text (README is the base).
3. Submit before 9/3 13:00 PDT; keep a buffer day.
