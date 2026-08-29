# M2-lite implementation spec (frozen by Fable, 2026-08-30)

Scope = DESIGN.md v3 §8 item 3: a **read-only evidence-map page** over the
existing exemplar content (1 estimand cell, 6 claims, 19 records). Explicit
non-goals (from DESIGN v3 / Codex adjudication): NO `propose_edge`, NO dossier
scores, NO numeric power/sample-size output, NO persistence, NO backend, NO
new literature content. Honesty labels are part of the spec, not decoration.

Suites after completion (all green, run from repo root):
`node verify/stats.test.mjs && node verify/rules.test.mjs && node verify/e2e.mjs
&& node verify/workspace.e2e.mjs && node verify/atlas.e2e.mjs`
Playwright at /Users/hirokisugimoto/tennis-checker/node_modules/playwright;
127.0.0.1; port 8501 (secondary servers 850x).

## 0. Shared claims extraction (prerequisite)

Move the 6 claim objects (id/rule/test ASTs) out of index.html's inline boot
script into a new module `data/pygmalion-claims.js`:
`export const CLAIMS = [...]` — byte-identical ASTs. index.html imports it
(`import { CLAIMS } from './data/pygmalion-claims.js'`) and passes
`claims: CLAIMS`. No behavior change; e2e.mjs must stay green untouched
(if an assertion hard-codes something this breaks, fix the page, not the test).
Claim STATEMENTS for atlas display: the atlas needs each claim's sentence
without scraping index.html's prose. Add a `statement` field to each entry in
data/pygmalion-claims.js containing the same sentence as the prose span
(document mode ignores it — statementOf() prefers the DOM span; verify that).

## 1. `lib/atlas.js` (new module)

`export function initAtlas(config)` where config =
`{ dataset, claims, mounts?: {map, panel, ledger, status, console} }`.
Reuses: meta-stats.js (synthesis), meta-plots.js (forestPlot for the cell
panel), claim-rules.js (evaluateRules for claim verdicts), and the ledger /
status-banner / tool-console patterns from living-evidence.js — but atlas is
its own small runtime (~read-only), do NOT try to bolt a third mode onto
initLivingEvidence. Copy the small helpers you need (h(), fmt()) rather than
exporting new surface from living-evidence.js.

### 1.1 Graph model (assembled at boot, deterministic)

Nodes:
- `cell:teacher-expectancy-iq` — the one estimand cell. Label: "Teacher
  expectancy → pupil IQ (experimentally induced; group-administered &
  individual IQ tests; k=19)". Carries live REML synthesis (computed at boot
  and on `synthesize`).
- `construct:teacher-expectancy` (X), `construct:pupil-iq` (Y).
- `doc:pygmalion-exemplar` — the exemplar document (links to index.html).
- `claim:<id>` × 6 — from config.claims; verdict state starts 'untested',
  updated live by evaluate_claim.
- `rec:<id>` × 19 — evidence records.
- `gap:coverage-weeks`, `gap:replication`, `gap:verification` — COMPUTED at
  boot (see 1.3), never hard-coded values.

Edges (typed, all rendered): doc—asserts→claim ×6; claim—about→cell ×6;
rec—evidence→cell ×19; cell—measures→construct ×2; gap—about→cell ×3;
`weeks` moderator edge: a labelled edge `moderates (candidate)` from a small
`mod:weeks` node to the cell — label MUST include "(candidate)" per DESIGN
§5's hedging (study-level, provisional).

### 1.2 Map rendering (SVG, deterministic layout, no libraries)

viewBox ≈ 1000×640, `.le-figure-svg`-style theming (CSS vars only —
--le-ink/-accent/-muted/-good/-bad/-warn/-card/-border). Layout zones:
constructs top-center; document far left; cell dead center (largest node);
claims on an upper arc between document and constructs; records on a lower
fan/arc (dot radius ∝ sqrt(1/vi) normalized, fill by weeks band: ≤1 →
--le-accent, 2–7 → --le-warn, ≥17 → --le-muted; legend on the map); mod:weeks
small node lower-left of cell; gaps right column as dashed-border rounded
rects. Edges thin (--le-border), gap edges dashed. Every node gets
`data-node="<id>"`, `tabindex="0"`, `role="button"`, `aria-label` (DESIGN §6:
WebMCP is not accessibility — the DOM must carry it). Click (or Enter) →
`selectNode(id)`. Selection: selected node gets an accent stroke ring; all
other nodes+edges get opacity dimmed (CSS class on the svg root, not per-node
style churn).

### 1.3 Computed gaps (live, from the dataset — the load-bearing honesty)

- **coverage**: sort unique `weeks` values; find the largest interior gap
  between consecutive observed values; report
  `{empty_band: [lo+1, hi-1], between_observed: [lo, hi]}` — on the shipped
  data this MUST come out as band 8–16 between observed 7 and 17, but the
  numbers must be computed, and the atlas e2e proves it by recomputing from
  data/raudenbush1985.js independently. Card text frames it per DESIGN §5:
  the capped-linear model predicts ≈0 everywhere ≥ ~3 weeks (compute the
  zero-crossing −intercept/slope from a live metaRegression fit, display to
  1 decimal); the band is where that extrapolation is untested; a study there
  is model criticism.
- **replication**: count of records carrying a pre-registration link — the
  schema has no such field, so the computation is `records.filter(r =>
  r.prereg).length === 0` → "0 of 19 records carry a pre-registered
  replication link". Honest framing: this is a property of the record schema
  and corpus, not proof none exists in the world.
- **verification**: count of records with a data manifest → 0 of 19; card
  says records sit below R2 ("no per-record data manifest — see SPEC record
  ladder; rungs unassigned in v0.1").

### 1.4 Study brief (coverage gap only — NO numbers that don't exist)

`get_study_brief {gap_id}` (only 'gap:coverage-weeks' yields a full brief;
others return a short "no brief for this gap type in M2-lite" object).
Brief = two lists, rendered as a card in the panel AND returned structured:
- `filled_by_atlas`: target cell (8–16 weeks prior contact), rationale
  (model-criticism, zero-crossing value), design_implication ("equivalence /
  precision design — the model predicts ≈ 0 in this band; a superiority test
  is the wrong shape"), current_estimates (live REML pooled + ≤1-week
  subgroup fit, each labelled "selection-biased optimistic bound"), tau2, I2.
- `unresolved_inputs` (names + one-line why): SESOI / equivalence margin δ;
  unit of randomization + ICC/design effect; allocation ratio; expected
  attrition; α and target power; IQ instrument + tester blinding;
  pre-registration venue.
- `explicit_note`: "No sample size is computed: the unresolved inputs above
  do not exist yet, and a pooled τ² is not an outcome variance." (DESIGN §4.5)

### 1.5 Tools (WebMCP + console, all read-only annotations except the two renderers)

Registered via the same document.modelContext pattern (registerTool with
title/description/inputSchema/additionalProperties:false; execute returns
objects; degraded/absent status like M1). Tool list (8):
1. `atlas_overview` (read) — what this page is, node/edge counts, the one
   cell's current synthesis, honesty labels (single-literature demo;
   read-only; no scores), tool guidance.
2. `get_cell {cell_id?}` (read) — synthesis (live REML via engine), k,
   heterogeneity, claims attached, records count by weeks band.
3. `list_claims` (read) — id, statement, rule, machine_check AST, verdict
   state.
4. `evaluate_claim {claim_id}` — evaluateRules against the live engine;
   updates the claim node's badge on the map (✓/✗/△ glyph + color), opens
   the claim in the panel, ledger entry. Verdicts on shipped data must match
   the exemplar (c-textbook challenged, c-bias nuanced, rest supported).
5. `get_gaps` (read) — the three computed gap objects.
6. `get_study_brief {gap_id}` — brief per 1.4; renders the card in the panel;
   ledger entry.
7. `focus_node {node_id}` — selectNode(id) + panel render; returns the node's
   detail object; ledger entry (kind 'navigation'). This is the shared-surface
   tool: the agent's exploration is visible on the human's map.
8. `synthesize {method?: REML|DL|FE, exclude?: [rec ids]}` — cell-level refit
   via the engine; updates the cell panel (forest plot + numbers) and the
   cell node's displayed estimate; ledger entry. Excluding below k=2 errors.
Plus the ledger (structured envelope, same fields as M1; actor attribution via
invokeTool opts; boot entry actor 'system') and the human tool console (same
component pattern; console calls pass actor 'human'). Pure reads (1,2,3,5)
not ledgered.

### 1.6 Panel

`#atlas-panel` renders the selected object: cell → synthesis card + forest
plot (meta-plots forestPlot, studyRows pattern); claim → statement, rule,
AST summary, verdict badge, an "Evaluate" button (human path); record →
author/year/weeks/setting/tester/n/yi/vi + provenance string; gap → card per
1.3/1.4 with a "Study brief" button for coverage; construct/doc/mod → short
description + links.

## 2. `atlas.html` (new page)

Same visual language as index/workspace (tokens, serif body, max-width wider:
~64rem to fit the map). Sections: header (title "Living Evidence Atlas —
mini", status banner, standfirst: one literature, read-only, what the Atlas
direction is, link to DESIGN.md §7 + the two sibling pages); an
**honesty box**: "This is the Atlas *direction* at demo scale: one
literature, computed live, read-only. No dossier scores, no numeric power,
record verification rungs unassigned."; the map (`#atlas-map`) with legend;
detail panel (`#atlas-panel`, starts with "select a node or let your agent
drive"); ledger; tool console; footer. Boot: import DATASET,
CLAIMS, initAtlas.

## 3. `verify/atlas.e2e.mjs`

Real browser, ~10 blocks:
1. Load clean (zero pageerrors), 8 tools exposed, status absent-not-active,
   45+ nodes rendered (2+1+6+19+3+1+1 = 33 nodes, count exactly 33
   `[data-node]` elements), edges present.
2. `get_gaps`: coverage band equals an INDEPENDENT recomputation done in
   node from data/raudenbush1985.js (import it, compute largest interior
   weeks gap in the test itself → assert deep equality); replication and
   verification both 0-of-19.
3. `synthesize {}` matches metaAnalyze REML from node import to 1e-9 on
   estimate/ci/tau2; `synthesize {exclude:['s04']}` matches node
   recomputation on the 18-record subset; ledger entries carry envelope
   fields + digests.
4. `evaluate_claim` for all 6 → exemplar verdicts (challenged/nuanced/4×
   supported); map badge glyphs appear (count 6), panel shows last claim.
5. `focus_node {node_id:'rec:s10'}` → selection ring on that node, dimmed
   class on svg root, panel shows Maxwell 1970 values; unknown node id errors
   helpfully.
6. `get_study_brief {gap_id:'gap:coverage-weeks'}` → structured card:
   `unresolved_inputs.length >= 6`, NO numeric sample size anywhere in the
   returned object (assert /sample size|n =/i absent from JSON except the
   explicit_note), zero-crossing ≈ 2.6 (assert within [2.4, 2.8]);
   brief for 'gap:replication' returns the no-brief object.
7. Console lists 8 tools; a console-driven evaluate logs actor 'human'.
8. Pure reads leave no ledger rows.
9. Keyboard: focus a node element, press Enter → selection happens (a11y).
10. Screenshots: `verify/_snap_atlas.png` (after evaluating 2-3 claims +
    selecting the coverage gap) and a dark-mode variant; eyeball both.

## 4. Out of scope (do not build)

propose_edge / any mutation of the graph; dossier/fragility scores; numeric
power or sample sizes; persistence; cross-literature content; search;
force-directed layout libraries; changes to workspace.html or the M1 tool
surface (index.html changes ONLY per §0).
