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
