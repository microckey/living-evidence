# Codex review of DESIGN.md v2

> Generated 2026-08-29 via `codex exec` (read-only sandbox), reviewing commit ccdcabf.
> Adjudication by Fable in DESIGN.md v3 §10 and AGENT_SYNC.md.

Verdict: **approve the Atlas as a vision, reject §8 as an execution plan in its current form.** The cell ontology is not yet identity-stable, the look counter is not a statistical guardrail, and contradiction currently conflates semantic opposition with empirical incompatibility. More urgently, the shipped runtime supports less reuse than the draft claims: it has no real-runtime WebMCP verification, durable/structured ledger, R2 records, generic approval schema, persistence, or serializable claim model. Secure v0.1 deployment and real-agent interoperability first, build only a sharply reduced M1, and cut full M2 now.

## Q1 — Cells

No. `(X→Y, P, M, C)` is neither sufficiently specified nor safely atomic. `C` is unbounded, but so are `P` and `M`; arbitrary subdivision can make heterogeneity disappear by construction. The tuple also omits comparator, relation type, outcome horizon, and effect scale, so it does not uniquely identify an estimand. An arrow also implies causality even when the evidence may only support association. [DESIGN.md:31–43](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/DESIGN.md:31)

Use an immutable **estimand cell** with:

- relation type: causal, associational, predictive;
- intervention/exposure and comparator;
- outcome construct and assessment horizon;
- target population;
- target effect scale.

Keep instrument, setting, design details, and candidate moderators as record attributes by default. Promote one to a child cell only when it changes the claim’s truth conditions or a prespecified transport decision—not merely because a post-hoc subgroup differs. Always preserve the broader parent synthesis.

`M` must distinguish instrument from effect measure. Different instruments may be harmonizable measurements of one construct, while different effect scales may target different estimands. Harmonization belongs in the analysis spec, consistent with the existing `(spec, result)` rule. [DESIGN.md:56–60](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/DESIGN.md:56)

Mint IDs from canonical, schema-versioned definitions. Any boundary change, split, or merge creates a new ID and lineage; §2 currently specifies merges but not splits. Restrict coverage-gap generation to a finite, registered set of moderator dimensions, or an unbounded `C` produces infinitely many empty cells.

## Q2 — Sequential guardrail

No. An n-th-look counter is audit metadata, not a statistical guardrail. It does nothing to control repeated-testing error.

The shipped counter is not reusable as claimed:

- `runCounter` counts every ledger event globally, not evidence updates per claim/spec. [living-evidence.js:38–75](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:38)
- It resets on reload because all state is session-local. [SPEC.md:255–261](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/SPEC.md:255)
- Approval immediately recomputes ordinary nominal p-values and confidence intervals. [living-evidence.js:236–249](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:236)
- The engine uses nominal two-sided z inference and `p < 0.05`. [meta-stats.js:283–300](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/meta-stats.js:283)

For the hackathon:

1. Count looks per immutable `(claim_id, analysis_spec_hash, evidence_version_hash)`, incrementing only for new evidence versions.
2. After an update, show the new estimate and nominal interval as **“unadjusted repeated look N / exploratory”**, without issuing a fresh binary verdict.
3. If a binary verdict is essential, preregister a real spending rule. Even a conservative `αₜ = α/[t(t+1)]` is statistically meaningful and controls total spend by the union bound.

TSA and Bayesian analysis are not the only valid options; alpha spending, always-valid tests, and confidence sequences also qualify. Bayesian reporting is not automatically safe if posterior probabilities are repeatedly dichotomized. Until a real method exists, remove “sequentially guarded” from [DESIGN.md:121–128](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/DESIGN.md:121) and [DESIGN.md:192–193](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/DESIGN.md:192).

## Q3 — Contradiction operationalization

No. Non-overlap of two 95% intervals is not the right default: it is more conservative than testing their difference, ignores covariance, and cannot apply to qualitative R0 claims. Pairwise Q is not more general.

Separate two objects:

- **Semantic contradiction:** two structured claim predicates cannot both be true under the same estimand and scope.
- **Evidence incompatibility:** their supporting estimates differ beyond uncertainty and a meaningful compatibility margin.

For quantitative comparisons, use a covariance-aware contrast:

`Δ = θ₁ − θ₂`, with `SE(Δ) = sqrt(v₁ + v₂ − 2cov₁₂)`.

Given a domain-defined compatibility margin `δ`:

- incompatible if the simultaneous CI is wholly above `+δ` or below `−δ`;
- compatible if wholly inside `[-δ,+δ]`;
- otherwise indeterminate.

Use 95% only as a default for one prespecified comparison. Adjust automatically scanned pairs within a cell/spec family, and apply the sequential rule across evidence versions. If no defensible `δ` exists, call the result a “statistical difference,” not a contradiction.

With two independent estimates, pairwise Q is essentially the same inverse-variance contrast test. It fails with shared samples, shared controls, repeated outcomes, or dependent estimates. The shipped engine only has an omnibus heterogeneity Q and a subgroup Q; it has no claim-level compatibility primitive. [meta-stats.js:249–258](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/meta-stats.js:249) [meta-stats.js:324–351](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/meta-stats.js:324)

## Q4 — WebMCP boundary

The shared-surface criterion is sound, but §6 treats WebMCP as too much of the application boundary.

Use WebMCP as the **co-present agent adapter**: bounded commands whose effects render into the page. Do not make it responsible for canonical storage, identity, authorization, durable audit, crawling, extraction, long-running synthesis, or artifact generation.

Concretely:

- Keep document interrogation, proposal, visible claim evaluation, and bounded map actions in WebMCP.
- Split the M1 row: search, retrieval, PDF parsing, extraction, persistence, and export are ordinary browser/backend work; quote comparison, proposal, and approval are shared-surface actions.
- Keep client-side synthesis only for the seeded SMD demo. The engine accepts independent `yi/vi` rows, not general corpus-scale evidence. [meta-stats.js:265–300](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/meta-stats.js:265)
- Give publications a static, versioned machine-readable manifest/API sidecar. An Atlas cannot efficiently index arbitrary sites by launching each page and invoking its page-local WebMCP tools.
- Remove the claim that WebMCP makes a canvas accessible. It provides an agent interface, not keyboard, screen-reader, focus, or human accessibility. Supply a DOM/table/ARIA representation independently. [DESIGN.md:179–184](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/DESIGN.md:179)

At scale, the Atlas UI’s WebMCP tools may front the same backend API, but canonical mutation and audit must remain backend-enforced.

## Q5 — Schedule

No. The tripwires are internally contradictory and too late.

The design says deployment and real-agent testing come first, before M1, but schedules them for September 2 after M1 and M2. [DESIGN.md:227–234](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/DESIGN.md:227) [DESIGN.md:256–259](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/DESIGN.md:256)

Public HTTPS, GitHub, ChatGPT desktop testing, video/upload, and submission review remain user-gated. [AGENT_SYNC.md:89–100](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/AGENT_SYNC.md:89) The existing E2E explicitly verifies that WebMCP is absent and drives `window.LivingEvidence.invokeTool`; it does not test registration, discovery, serialization, or an agent invocation. [verify/e2e.mjs:32–49](/Users/hirokisugimoto/Downloads/money/living-evidence/verify/e2e.mjs:32)

M1’s 1.5–2-day estimate is optimistic. Current state is entirely in memory, and proposal validation/cards are hard-coded to SMD, weeks, setting, and tester. [living-evidence.js:37–47](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:37) [living-evidence.js:218–294](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:218) Generic schemas, persistence, collection audit, export generation, migrations, and tests are new code.

Recommended cut:

1. **By 2026-08-30 noon JST:** deploy v0.1 and perform one actual ChatGPT discovery and invocation. Book the user-gated test explicitly. If it fails or cannot happen, freeze new feature work and fix/submit v0.1.
2. **Kill full M2 now**, not conditionally on an August 31 miss.
3. Thin M1 to the existing SMD genre: quote-required proposal → comparison → approval → localStorage restoration → synthesis → export through one fixed template. Cut autonomous collection, PRISMA tooling, arbitrary schemas, ontology editing, and generic claims.
4. Permit an **M2-lite** only after M1 is frozen and a video dry run passes: a read-only graph over the existing six claims and 19 records. No neighboring-literature research, `propose_edge`, dossier score, or numeric power result.
5. Freeze code EOD August 31 JST; September 1 for QA and rehearsal; September 2 for final deployment, real-agent regression, recording, upload, and submission; September 3 JST is contingency. Define every “EOD” timezone.

## Q6 — Gaming and governance

The cheapest attack is **favorable-probe flooding**. An actor can rerun favorable specifications thousands of times, make epsilon-level parameter variations, and satisfy every probe class with harmless exclusions or vacuous subgroup splits. The proposed “fraction of ledgered specs whose estimate crosses zero” then approaches zero even though robustness has not improved. [DESIGN.md:98–102](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/DESIGN.md:98)

Fix it by:

- content-hashing canonical specifications;
- clustering substantively equivalent probes, not only byte-identical calls;
- measuring coverage against a finite, versioned, cell-specific challenge battery;
- keeping uncontrolled exploratory probes visible but non-scoring;
- reporting distributions by model family and decision dimension instead of one scalar;
- requiring independent provenance before probes, edges, or records improve centrality or close gaps.

A second cheap attack is contradiction farming: publish weak opposing assertions, then use their edges to inflate gap rank and centrality.

Per-cell OSS-maintainer governance does not survive motivated actors by itself. Unlike source code, there is no external build/test criterion deciding construct identity, admissibility, or canonical synthesis, and forks do not resolve which branch feeds Atlas rankings.

Minimum governance requires separate contributor/reviewer/maintainer roles, conflict disclosures, two independent approvals for consequential decisions, immutable and reversible decision events, an appeal path, competing analysis views, and exclusion of self-authored or unreviewed edges from centrality. For the hackathon, do not ship a scored dossier economy or imply governance is solved.

## Q7 — Legacy beachhead

Yes, narrowly: **open systematic-review datasets are the right technical bootstrap**, but only as provisional secondary-source extractions, not authoritative evidence.

Review tables inherit their review’s inclusion criteria, transformations, extraction errors, omitted outcomes, cutoff date, duplicate samples, and dependence structure. The Atlas needs a provenance chain:

`primary study → report → extracted result → review table → Atlas record`.

Entry criteria should require:

- openly licensed, machine-readable study-level tables;
- protocol/search history and stable primary-study identifiers;
- explicit outcome, timepoint, comparison, and transformation metadata;
- one independent effect per sample/cell, or covariance information;
- a source-tier field distinguishing review-derived from primary-verified records.

Human approval of a review row must not silently imply primary-source verification or R2 status. Deduplicate by study/sample, arms, outcome, horizon, and comparison—not the shipped author/year/effect heuristic. [living-evidence.js:276–278](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:276)

For this deadline, use the existing metadat/Raudenbush corpus. Do not discover, license, extract, and validate neighboring review data during the final delivery window.

## Q8 — Silent assumptions that break at scale

The design assumes a trusted, independent, standardized, discoverable corpus operated by cooperative actors. Each assumption fails:

- **Independent effects:** real papers contain repeated outcomes, timepoints, shared controls, multiple reports, clustered designs, and duplicate cohorts. The shipped engine uses diagonal `yi/vi` weights. Add `study_id`, `sample_id`, result hierarchy, covariance/cluster metadata, and multilevel or robust-variance methods. [meta-stats.js:190–199](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/meta-stats.js:190)
- **Federated discovery:** page-local WebMCP is not a cross-origin indexing protocol. Require versioned manifests, discovery metadata, pagination, stable cursors, and server-readable artifacts.
- **Preservation:** permanent content-hash resolution conflicts with “the Atlas never hosts papers.” Hashes do not preserve vanished bytes. Archive permissible manifests/snapshots or integrate a preservation service. [DESIGN.md:50–54](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/DESIGN.md:50) [DESIGN.md:205–207](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/DESIGN.md:205)
- **Trusted ledger and approval:** local/session state is mutable, actor identities are unauthenticated, and a DOM click is only UI-gated—not proof a human approved it.
- **Complete collection:** an empty cell may indicate paywalls, failed extraction, language bias, or an incomplete search rather than a scientific gap. Gap computation must carry collection-frame coverage and an explicit `unknown/not-searched` state.
- **Bounded compute and payloads:** `get_studies` returns the entire evidence base, and REML repeatedly scans/refines over all records. Add pagination, cached version-keyed results, jobs, and incremental invalidation. [living-evidence.js:357–365](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:357) [meta-stats.js:211–233](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/meta-stats.js:211)
- **Passive source material:** external HTML/PDFs introduce prompt injection, malicious content, poisoned metadata, and unsafe provenance URLs. Ingestion needs isolated parsing, hashes, content limits, and untrusted-content handling.
- **Human throughput:** construct merges, harmonization, extraction checks, retractions, and rival specs create an unbounded moderation queue. The design needs assignment, quorum, appeal, inactivity, and fork semantics before “per-cell maintainers” can scale.

## Additional findings

- **[must-fix] “R2 papers — SHIPPED” is false under the new ladder.** Rungs apply to evidence records, not documents. R2 is cumulative over R1, but the exemplar records have no per-record quote, approval event, raw summary inputs, or record-level manifest; the runtime assigns only `"original evidence base"`. The engine reproduces the pooled synthesis from entered `yi/vi`, not those study-level numbers from source data. Relabel [DESIGN.md:181](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/DESIGN.md:181) as: **“Executable living-document surface shipped; synthesis recomputable; Atlas record rungs unassigned.”** [data/raudenbush1985.js:1–21](/Users/hirokisugimoto/Downloads/money/living-evidence/data/raudenbush1985.js:1) [living-evidence.js:37–40](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:37)

- **[must-fix] WebMCP is implemented, not end-to-end verified.** Registration code exists, but the test deliberately exercises the no-WebMCP fallback. Use “implementation shipped; real-runtime interoperability pending.” [living-evidence.js:478–505](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:478) [verify/e2e.mjs:40–49](/Users/hirokisugimoto/Downloads/money/living-evidence/verify/e2e.mjs:40)

- **[must-fix] The audit contract is currently inaccurate.** Read tools do not call `ledger`; human console analyses are recorded as `agent`; events contain prose summaries rather than arguments, results, spec IDs, code versions, or evidence hashes; and the mutable array is exposed through public state. Either narrow “every call” to qualifying analytic/mutation events or log reads explicitly, and introduce a structured invocation envelope with actor, inputs, result hash, spec hash, and evidence version. [living-evidence.js:59–75](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:59) [living-evidence.js:329–365](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:329) [living-evidence.js:541–570](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:541)

- **[must-fix] Staleness is visual but not machine-readable.** Approval adds a CSS class to existing badges, but `state.claimStatus` remains the old verdict and `list_claims` still returns it without a stale flag. Store `evidence_version`, `evaluated_version`, and `stale` in claim state and tool responses. [living-evidence.js:245–249](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:245) [living-evidence.js:313–323](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:313)

- **[must-fix] Quote-backed approval is only an interaction idea, not shipped provenance machinery.** `quote` is optional, `source` is an unchecked string, and approved records returned by `get_studies` omit the approval event and quote. M1 should require a source locator and quote, preserve extractor/reviewer/time/transformation metadata, and bind approval to the exact record hash. [living-evidence.js:266–294](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:266)

- **[must-fix] The dossier must be keyed by spec and evidence version, not only cell.** Bind every probe and fragility result to `(cell_id, synthesis_spec_hash, evidence_version_hash)`. Replace “crosses zero” with the estimand’s declared null/reference value—ratio measures use 1—and define whether fragility concerns point-estimate sign changes, interval inclusion, or decision changes.

- **[must-fix] Generic M1 export has no serialization model.** Current claims are arbitrary JavaScript closures, which cannot safely be persisted and exported as data. For the deadline, use a small declarative rule enum/AST interpreted by the runtime and export only one fixed living-meta-analysis template. [index.html:229–307](/Users/hirokisugimoto/Downloads/money/living-evidence/index.html:229)

- **[must-fix] “Moderator explains/resolves the contradiction” overstates the evidence.** The displayed 100% is a clipped proportional reduction in an estimated τ² that lands on the boundary, with no uncertainty. Say: **“weeks is a candidate moderator that accounts for the observed heterogeneity under the capped-linear model.”** Keep resolution provisional until preregistered or within-study interaction evidence exists. [meta-stats.js:373–385](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/meta-stats.js:373)

- **[must-fix] Cut numeric power from M2.** A defensible study brief needs SESOI/equivalence margin, unit of randomization, ICC/design effect, allocation, attrition, alpha, and target power. Pooled τ² is not the outcome variance or ICC needed to power a new experiment. Output a structured list of unresolved design inputs, or use a validated precomputed illustration with explicit assumptions.

- **[must-fix] “PRISMA-grade” cannot mean self-reported `log_search` calls.** Capture provider, exact query, timestamp, result-set IDs/hashes, deduplication, source snapshots, screening decisions, reviewer identity, and exclusions. Otherwise call it a collection activity log.

- **[must-fix] Resolve approval status before work starts.** DESIGN says M1 is approved, while AGENT_SYNC says the user decision is pending. [DESIGN.md:7–8](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/DESIGN.md:7) [AGENT_SYNC.md:55](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/AGENT_SYNC.md:55)

- **[nice-to-have] Broaden statistical goldens before claiming Atlas-general reuse.** Current strong goldens cover REML and one meta-regression on one dataset; DL, fixed effect, subgroup, and Egger checks are mostly sanity tests. Add small-`k`, zero-heterogeneity, extreme-variance, boundary, prediction-interval, and dependent-effect cases. [stats.test.mjs:32–87](/Users/hirokisugimoto/Downloads/money/living-evidence/verify/stats.test.mjs:32)

- **[nice-to-have] Treat partial registration as degraded, not active.** One registered tool out of twelve currently sets `active: true`. Require all critical tools or display which registrations failed. [living-evidence.js:486–505](/Users/hirokisugimoto/Downloads/money/living-evidence/lib/living-evidence.js:486)