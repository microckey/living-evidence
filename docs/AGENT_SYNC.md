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

## Status (2026-08-29 M1 COMPLETE — CURRENT)

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
