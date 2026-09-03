# Living Evidence Atlas — design document

> Historical design record. The implemented v0.2 contract and current trust
> boundaries are in [`SPEC.md`](SPEC.md); where this document describes v0.1 or
> planned milestones, it is not the source of truth for the shipped product.

Status: **v3** — v2 was reviewed by Codex/GPT-5.6 Sol
([full review](DESIGN-REVIEW-CODEX.md); verdict: *"approve the Atlas as a
vision, reject §8 as an execution plan in its current form"*). v3 adopts that
review nearly wholesale; §10 records the adjudication. Nothing here is
implemented unless marked SHIPPED. Shipped: the v0.1 format/exemplar
(**executable living-document surface shipped; WebMCP registration implemented
but not yet verified against a real agent runtime; Atlas record rungs
unassigned**). M1 is **pending the owner's GO** on the thinned scope in §8.

## 1. Goal

Accelerate science, and make its convergence on truth more reliable. Not by
having machines find truth — disowned throughout this repo — but by making the
three expensive activities of scientific self-correction cheap, continuous,
and auditable: **verification** (does the evidence say what the paper says?),
**comparison** (what does it say jointly, and where does it disagree?), and
**gap discovery** (what is missing, and what should be measured next?).

The loop to close: read → verify → synthesize → surface disagreement →
identify gaps → compile the next study → absorb its results.

## 2. Ontology: estimand cells, claims, and the map

The Atlas is an **evidence graph**. Its atomic addressable unit is the
**estimand cell** — not "(X→Y, P, M, C)", which under-specifies the estimand
and lets arbitrary subdivision make heterogeneity vanish by construction. A
cell is minted from a canonical, schema-versioned definition of:

- **relation type** — causal / associational / predictive (an arrow is not
  allowed to smuggle causality into associational evidence);
- **intervention or exposure, and its comparator**;
- **outcome construct and assessment horizon**;
- **target population**;
- **target effect scale**.

Instrument, setting, design details, and candidate moderators are **record
attributes**, not cell coordinates. A moderator is promoted to a child cell
only when it changes the claim's truth conditions or a pre-specified
transport decision — never merely because a post-hoc subgroup differs — and
the parent synthesis is always preserved. Instrument is distinguished from
effect scale: different instruments may be harmonizable measurements of one
construct (harmonization lives in the analysis spec), while different effect
scales may target different estimands.

**Identity under revision.** Merges **and splits** mint new ids with
`derived-from` edges; superseded ids permanently resolve to their last
synthesis, content-hash-pinned. Citability survives ontology revision by
construction.

**Claims** are directional assertions over a cell, made by documents. Two
papers can assert opposite things about one cell. Heterogeneity lives inside
cells; `contradicts` links claims.

**A synthesis is always a (spec, result) pair** — estimator, moderator set,
harmonization choices named; spread across registered alternative specs
exposable. No cell "has a number".

**Contradiction, operationalized.** Two objects, kept separate:

- **Semantic contradiction** — two structured claim predicates cannot both be
  true under the same estimand and scope.
- **Evidence incompatibility** — a covariance-aware contrast
  `Δ = θ₁ − θ₂`, `SE(Δ) = √(v₁ + v₂ − 2cov₁₂)`, judged against a
  domain-defined compatibility margin δ: *incompatible* if the CI for Δ lies
  wholly outside ±δ, *compatible* if wholly inside, else *indeterminate*.
  Where no defensible δ exists, the system reports a "statistical
  difference", never a contradiction. Significance-status disagreement is
  **never** a contradiction (it is how the literature manufactures fake
  ones). Automatically scanned pairs get multiplicity adjustment; repeated
  evaluation across evidence versions falls under §4's sequential rules.

Resolution paths (open list, all progress): (a) a **candidate moderator**
accounts for the incompatibility — observational, provisional, exposed to
ecological bias until within-study interaction evidence exists; (b) a
**methods audit** sinks one side or both; (c) **dissolution by synthesis** —
it was noise or a significance artifact all along (arguably the actual
Pygmalion history); (d) **construct unmerge**; (e) it **persists** → Gap (§5).

## 3. Two verification ladders

Both ladders measure **verifiability of the arithmetic and robustness of the
analysis — never design validity, never data authenticity.**

**Record ladder** (per evidence record; cumulative):

| Rung | Meaning |
|---|---|
| **R0** | text assertion (legacy paper, unreviewed LLM extraction) |
| **R1** | R0 + structured extraction with source locator and provenance quote, human-approved, approval bound to the record's content hash |
| **R2** | R1 + data manifest present; a deterministic engine reproduces the number from it |

The shipped exemplar's records are honest about this: they carry the pooled
synthesis reproducibly, but per-record quotes/approval events/manifests do
not exist yet — **record rungs are unassigned in v0.1**.

**Cell dossier** (recorded facts, never a score): probe results keyed by
`(cell_id, synthesis_spec_hash, evidence_version_hash)`, with a computed
fragility summary defined against the estimand's **declared null/reference
value** (1 for ratio measures) and an explicit fragility type (sign change /
interval inclusion / decision change). Probe **coverage** is measured against
a finite, versioned, cell-specific challenge battery; uncontrolled
exploratory probes stay visible but non-scoring (§9). Replication status:
*attempted, outcome attached* — the outcome enters the synthesis as evidence;
it never decorates the cell as a trust rank.

Core metric: mass migration of the legacy corpus up the record ladder, plus
challenge-battery coverage on high-traffic cells.

## 4. The loop (five verbs)

1. **Ingest** — LLM pipelines *propose* claims/evidence records with source
   locators and quotes (both required); humans approve against the quote,
   approval bound to the record hash. Collection is logged — provider, exact
   query, timestamp, result-set hashes, screening decisions with reasons.
   Until reviewer identity, deduplication and snapshots exist this is called
   a **collection activity log**, not "PRISMA-grade".
2. **Integrate** — cells re-synthesize as evidence arrives, under honest
   sequential semantics: looks are counted per
   `(cell_id, spec_hash, evidence_version_hash)`; each update is displayed as
   *"unadjusted repeated look N — exploratory"* with **no fresh binary
   verdict**; a binary verdict requires a pre-registered spending rule (even
   conservative `α_t = α/[t(t+1)]` controls total spend) or always-valid
   confidence sequences. Repeatedly dichotomized posteriors are not a safe
   substitute. (v2 called a look counter a "guardrail"; Codex correctly
   demoted it to audit metadata.)
3. **Interrogate** — humans + agents rerun, exclude, subgroup, multiverse;
   every probe lands in the dossier with its parameters and spec hash.
4. **Illuminate** — the map computes Gaps (§5), ranked within type, over a
   **finite registered set of moderator dimensions** (an unbounded condition
   space generates infinitely many empty cells).
5. **Instigate** — top gaps compile into **study briefs**. A defensible brief
   needs SESOI/equivalence margin, randomization unit, ICC/design effect,
   allocation, attrition, α and target power — inputs a pooled τ² does not
   supply. So a brief is a **structured list of the design inputs, with the
   ones the Atlas can supply filled in** (current estimates as optimistic
   bounds, bias-corrected where possible — never naive pooled effects, which
   are winner's-curse traps) **and the unresolved ones named**. Coverage-gap
   briefs target the model's prediction in the empty cell — typically an
   equivalence/precision design, not superiority.

## 5. Gaps — computed absence, typed

All gap computation carries **collection-frame coverage**: an empty cell may
mean paywalls, failed extraction, language bias, or an incomplete search.
`unknown / not-searched` is an explicit state, distinct from "measured and
absent".

- **Estimation gap**: CI too wide / τ² high and unexplained. Ranked by
  expected information gain given current estimates and uncertainty (a
  Bayesian layer would sharpen this).
- **Coverage gap**: empty cells along registered moderator dimensions.
  Ranked by **model-criticism leverage** — a fitted model is often most
  confident exactly where it has never been tested. *Shipped-data example:
  the 19 Pygmalion studies sample prior contact at 0–7 and 17–24 weeks; the
  fitted capped-linear model (slope −0.157, cap 3) predicts a dead effect
  everywhere ≥ ~2.6 weeks, and the 3–7-week studies sit near zero — weeks is
  a* candidate *moderator accounting for observed heterogeneity* under that
  model *(the displayed R² = 100% is a clipped boundary estimate with no
  uncertainty attached). The untouched 8–16-week band is where the flat-tail
  extrapolation and the cap-at-3 functional form have never met data: a
  study there is model criticism, not effect-hunting.*
- **Contradiction gap**: an operationally-defined incompatibility (§2) with
  no accepted resolution.
- **Verification gap**: high-centrality claims whose records sit at R0/R1.
- **Replication gap**: cells with zero pre-registered replications.
- **Measurement gap**: constructs measured by a single instrument or lab
  tradition.

Centrality feeds ranking and is therefore a Goodhart target: only edges with
independent provenance count toward it (§9).

## 6. Where WebMCP belongs

WebMCP is the **co-present agent adapter**: bounded commands whose effects
render into the page a human is looking at. It is not the application
boundary — canonical storage, identity, authorization, durable audit,
crawling, extraction, long-running synthesis and artifact generation are
ordinary backend/page work.

| Surface | Interface | Why |
|---|---|---|
| Living documents | **WebMCP** (implementation SHIPPED; real-runtime interop pending) | reader + reader's agent on one page |
| Workspace: quote-vs-record comparison, proposal, approval | **WebMCP** (M1) | the approval gate is a human-on-the-page act. The agent's own searching/reading happens in the agent; persistence and export are page code, not tools |
| Atlas map UI: explore, interrogate, gap panel | **WebMCP** | human and agent interrogate the same live map, probes render where the human looks |
| Corpus indexing, ingestion pipelines, enclave reruns, bulk sweeps | **server APIs / MCP** | no human co-present |

Two doors, one service: at scale the map UI's WebMCP tools front the same
backend as the bulk API; canonical mutation and audit are backend-enforced.
Discovery is not WebMCP's job either — an Atlas cannot index the web by
launching pages and calling their tools; compliant publications therefore
ship a **static, versioned, machine-readable manifest sidecar** alongside
their page tools. And WebMCP is an agent interface, not accessibility: map
pages supply a DOM/ARIA representation independently.

## 7. Architecture (static-first, in adoption order)

- **Layer 0 — documents.** SHIPPED (v0.1), with the three named deltas that
  block the recursion: claims are closures, not introspectable data (M1
  replaces them with a small declarative rule AST); the ledger is
  session-scoped prose, not a structured invocation envelope (actor, inputs,
  spec hash, evidence version, result hash); no stable versioning. Plus the
  manifest sidecar (§6).
- **Layer 1 — workspace.** M1 (§8). Static + localStorage. Exports Layer-0
  documents through one fixed template.
- **Layer 2 — Atlas.** An index over documents living anywhere (it owns only
  the derived layer: graph, ledgers, gap objects, syntheses). Preservation is
  honest: content hashes do not preserve vanished bytes — the Atlas archives
  permissible manifests/snapshots or integrates a preservation service.
  Verb correspondence into the SPEC v0.2 family: `get_claim` ≈
  `inspect_claim` at corpus scope; `synthesize` ≈ `rerun_claim` at cell
  scope; `propose_edge` = the propose→approve pattern generalized;
  `get_contradictions`/`get_gaps` = new corpus-scoped reads.

**The recursion is the target invariant, not a shipped fact**: a workspace is
a private Atlas of one hypothesis; a document is a published workspace.
Closing Layer 0's three deltas is what makes Layers 1–2 possible.

Known scale assumptions that must be engineered, not assumed (Codex Q8):
dependent effects (multilevel/robust-variance methods; `study_id`/`sample_id`
and covariance metadata — the shipped engine assumes independent yi/vi
rows); authenticated actors and server-enforced approval (a DOM click is
UI-gating, not proof); pagination/caching/jobs for corpus-scale reads;
isolated, injection-aware ingestion of untrusted PDFs/HTML; and human
moderation throughput (assignment, quorum, appeal, fork semantics) before
"per-cell maintainers" can scale.

## 8. Hackathon cut (deadline 2026-09-03 13:00 PDT = 09-04 05:00 JST)

Adopted from the Codex review with one adjustment (M2-lite retained as a
stretch, unchanged in substance). **All times JST.**

1. **First, before any M1 code — by 08-30 noon: deploy v0.1 and perform one
   real ChatGPT-desktop tool discovery + invocation.** Both are user-gated
   (hosting auth, ChatGPT desktop) — they are booked with the owner, not
   assumed. If the real runtime surfaces breakage, all feature work freezes;
   fixing and submitting a working v0.1 outranks everything.
2. **M1 — thin workspace, existing SMD genre only**: quote-**required**
   proposal → quote-vs-record comparison UI → approval bound to record hash →
   localStorage persistence/restore → synthesis → **export via one fixed
   living-meta-analysis template**, with claims as a declarative rule AST
   (the serialization model export needs). Includes the v0.1 hardening that
   M1 depends on: machine-readable staleness (`evidence_version` /
   `evaluated_version` / `stale` in state and tool responses), the structured
   ledger envelope, honest actor attribution, upgraded dedupe keys, and
   degraded-registration status. **Cut from M1**: autonomous collection,
   PRISMA tooling (a collection activity log only if time permits), generic
   schemas, ontology editing.
3. **M2 full Mini-Atlas: killed now** (not conditionally). **M2-lite** only
   after M1 is frozen and a video dry-run passes: a read-only graph page
   over the existing 6 claims + 19 records. No `propose_edge`, no dossier
   scores, no numeric power output (a study-brief card lists design inputs,
   filled and unresolved, per §4.5).
4. **Code freeze EOD 08-31. 09-01 QA + video rehearsal. 09-02 final deploy +
   real-agent regression + recording + upload + submission. 09-03 is
   contingency only.**

Degradation story at each level stays honest: without M2-lite — "format +
workspace demonstrating Ingest/Integrate/Interrogate, Atlas as labeled
design"; without M1 — "v0.1 as the smallest complete loop".

## 9. Risks and non-goals

- **Not a truth machine** (standing): bad designs rerun faithfully;
  fabricated data may rerun cleanly; a wrong model reruns precisely wrong.
- **Cheapest attacks, per review**: *favorable-probe flooding* (epsilon-
  variation probes farm coverage; countered by canonical spec hashing,
  clustering of substantively equivalent probes, finite versioned challenge
  batteries, exploratory-probes-non-scoring, distributions instead of scalar
  fragility) and *contradiction farming* (weak opposing assertions inflate
  gap rank; countered by independent-provenance requirements on
  centrality-feeding edges). **No scored dossier economy ships at the
  hackathon**, and the docs must not imply governance is solved.
- **Governance minimums** before per-cell maintainership can be claimed:
  contributor/reviewer/maintainer role separation, conflict disclosures, two
  independent approvals for consequential decisions, immutable + reversible
  decision events, an appeal path, competing analysis views, self-authored
  edges excluded from centrality.
- **Construct identity** remains the hard ontology problem; §2's estimand
  cells, promotion rule, and unmerge path are the current answer.
- **Sequential inference** (§4.2) and **harmonization ledgering** (SPEC
  §v0.2) are standing statistical exposures.
- **Extraction rubber-stamping**: quote-vs-record comparison must be the
  approval UI's path of least resistance, and approving a review-table row
  must never silently imply primary-source verification (source-tier field:
  review-derived vs primary-verified).
- **Legacy beachhead** (Codex Q7, adopted): open systematic-review datasets
  are the bootstrap, ingested as *provisional secondary-source extractions*
  with the full provenance chain (primary study → report → extracted result
  → review table → Atlas record) — for this deadline, the existing
  metadat/Raudenbush corpus only.
- **Access**: the Atlas inherits, not solves, the open-access problem.

## 10. Adjudication of the Codex review (v2 → v3)

**Adopted wholesale**: estimand-cell ontology with promotion rule and split
semantics (Q1); look-counter demoted, no-fresh-verdict display semantics +
spending-rule requirement (Q2); semantic/evidence contradiction split with
Δ-contrast and margin δ (Q3); WebMCP as co-present adapter, manifest
sidecar, accessibility clause removed (Q4); schedule cut — deploy+real-agent
test by 08-30 noon, M2 killed to M2-lite stretch, M1 thinned, freeze 08-31
(Q5); probe-flooding/contradiction-farming mitigations and governance
minimums, no scored dossier at hackathon (Q6); systematic-review beachhead
with provenance chain and source tiers (Q7); scale assumptions named (Q8);
all 12 additional findings including: "R2 SHIPPED" relabeled, WebMCP
"implemented, not verified", audit-contract inaccuracies and staleness made
M1 hardening items, quote/source required, declarative rule AST for export,
moderator-resolution language hedged, numeric power cut from briefs,
"PRISMA-grade" renamed, approval-status contradiction resolved (M1 = pending
owner GO).

**Adjusted, not adopted verbatim**: M2-lite is retained as a post-freeze
stretch rather than deleted outright — same substance as Codex's own
recommendation 4, kept explicit so the video's Atlas beat has a defined
shape if, and only if, the gates pass.

**Open**: per-domain defaults for the compatibility margin δ; how estimand-
cell granularity behaves on a corpus larger than one literature; whether the
challenge-battery concept survives contact with real probe distributions.
