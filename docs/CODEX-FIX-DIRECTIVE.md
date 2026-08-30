# Codex implementation-review fixes — adjudicated directive (Fable, 2026-08-30)

Source: Codex packet review of the agent-visible tool surface (27 must-fix /
8 nice-to-have). Fable adjudication: adopted below as C1–C29; REJECTED (with
reasons, do not implement): renaming verdict values (breaks tests/UI; scope
field added instead), renaming propose_study fields n1i/n2i/setting (metadat
conventions; descriptions clarified instead), full output-schema
standardization and band_id record keys (post-deadline work), slimming
get_document_overview (risk), batch evaluate_claims (marginal).

All suites must be green after; update test assertions that encode the old
texts/counts — keep coverage, never delete checks.

## Both runtimes (lib/living-evidence.js AND lib/atlas.js)

- **C1 verdict scope.** `evaluate_claim` and `list_claims` responses gain
  `verdict_scope: 'authored statistical rule only — not an independent
  judgment of truth, validity, or bias'`. Overview `rules_of_engagement`
  gains a matching sentence. Verdict names unchanged.
- **C2 recompute guidance.** Replace the "Never recompute or estimate these
  numbers yourself — call tools." sentence (both overviews) with: "Use tool
  results when reporting page state. Independent calculations are welcome as
  checks — label them external and do not silently substitute them for the
  page's result."
- **C3 validation scoping.** Wherever overview text claims metafor
  validation, append: "this checks numerical reproduction against the
  reference implementation, not the data or model assumptions."
- **C11 FE honesty.** run_meta_analysis / synthesize descriptions: "method:
  REML or DL random-effects, or FE common-effect (FE assumes one common
  effect; tau2 is null by model assumption, not estimated as zero). p is a
  two-sided test of the pooled effect against zero."
- **C30 audit log description** (both get_audit_log tools): note the digest
  is "a non-cryptographic FNV-1a checksum for detecting accidental payload
  changes, not tamper evidence", and the ledger is session-local.
- **C29 orientation (nice).** Both overviews gain `suite_context` (one line
  each: exemplar = populated cross-examination; workspace = authoring in the
  fixed SMD template; atlas = map/gap inspection) and `suggested_flow` (an
  array of 4-5 tool-call steps for a five-minute visit; exemplar: overview →
  evaluate c-textbook → evaluate c-moderator → leave_one_out → funnel_check;
  atlas: overview → list_nodes → evaluate a claim → synthesize excluding one
  record → get_gaps → get_study_brief coverage).

## Claims (data/pygmalion-claims.js + index.html prose + rules)

- **C4 c-textbook rule** append: "Passing would not establish generalized
  intelligence gains, uniform benefit, or transportability beyond these
  experiments."
- **C5 c-overall rule** append: "This is a heuristic smallness check
  (|SMD| < 0.2 is Cohen's convention, not a domain-defined SESOI), not an
  equivalence test."
- **C6 c-moderator (three parts).** (a) statement — module field AND the
  index.html prose span, kept identical: "explains essentially all" → "is
  associated, under the fitted capped-linear model, with essentially all".
  (b) AST gains a branch BEFORE the default: when moderator.p lt 0.05 AND
  moderator.b ge 0 → challenged, reason "slope is statistically significant
  but nonnegative ({moderator.b}, p = {moderator.p}) — contrary to the
  claimed negative association"; default reason becomes "the required
  negative association was not detected (slope {moderator.b}, p =
  {moderator.p})". (c) rule text: describe R² as "a boundary-clipped
  proportional reduction in estimated τ², with no uncertainty interval;
  association, not causation."
- **C7 c-window rule** append: "A within-subgroup test in a post-hoc subset;
  it does not by itself establish a difference from the >1-week subgroup —
  subgroup_analysis's between-group test addresses that."
- **C8 c-robust rule** append: "Checks significance-status stability only."
  leave_one_out description (living-evidence.js) append: "It reports
  estimate changes and p<.05-status flips only — not stability of magnitude,
  moderators, heterogeneity, or bias diagnostics."
- **C9 funnel reframe.** funnel_check title → 'Small-study asymmetry check';
  description → "Small-study asymmetry diagnostics: render a funnel plot and
  run Egger's regression test. Asymmetry can have causes other than
  publication bias, and a non-significant result (especially at k≈19) is not
  evidence of absence of bias." c-bias rule text presents the bands as
  explicit strength-of-evidence labels: "supported (p ≥ 0.10: no detected
  asymmetry), nuanced (0.05 ≤ p < 0.10: borderline signal — a distinct
  strength-of-evidence label, not a pass), challenged (p < 0.05: asymmetry
  detected)."
- **C10 cumulative_meta description** → "Retrospective cumulative
  meta-analysis in publication-year order: prefixes of the CURRENT corpus.
  It does not reconstruct which evidence was actually available or
  discoverable at each historical date. RENDERS the step plot."

## Workspace (lib/living-evidence.js)

- **C12 propose_study schema+response.** Schema: year {type:integer,
  minimum:1900, maximum:2100}; vi {exclusiveMinimum:0}; weeks {minimum:0};
  n1i/n2i {type:integer, minimum:1} with descriptions "expectancy-group /
  control-group sample size"; yi description gains the direction convention
  "SMD; positive = higher measured IQ in the expectancy group than control";
  setting description "IQ test administration setting (group|indiv)";
  source/quote {minLength:1}; NEW optional field derivation {type:'string',
  description:'how yi/vi were derived when not directly reported'} stored in
  provenance. Response ALWAYS includes possible_duplicate_of (null when
  none). Description notes record_hash is a non-cryptographic checksum.
  Runtime validation updated to match schema (integer checks etc.).
- **C13 add_claim schema.** Replace the loose test:{type:'object'} with the
  full closed schema mirroring validateTest: analysis {enum: the six
  registry names}, args {type:'object'}, optional focus {collection,
  match_field, match_substring, all strings, required, additionalProperties
  false}, verdicts {array, minItems:2, items {when {array of {path:string,
  op:{enum:[lt,le,gt,ge,eq,ne,abs_lt,abs_ge]}, value:{}}}, default:boolean,
  verdict:{enum:[supported,challenged,nuanced]}, reason:string,
  additionalProperties:false}}, additionalProperties:false throughout.
  Description: "copy an existing claim's machine_check from list_claims as a
  template."
- **C14 set_hypothesis schema** {minLength:1, maxLength:500}; handler
  rejects blank-after-trim explicitly.
- **C15 workspace orientation.** Workspace-mode get_document_overview gains
  `workflow`: ordered steps [set_hypothesis → propose_study per record
  (source + verbatim quote) → "a human clicks Approve on each card — there
  is NO agent approval tool; k changes only after approval; ≥2 approved
  records are needed before synthesis" → add_claim → evaluate_claim →
  export_document], plus one sentence: "This page is the authoring surface;
  the exemplar page is the fastest cross-examination demo." propose_study's
  pending message appends "call get_document_overview again after the human
  approves."
- **C16 export_document contract.** New schema field include_html {type:
  'boolean', description:'return the full HTML in the response (large);
  default false'}. Default response {filename, bytes, download_started:
  true, content_digest}; include_html:true adds html. Update
  workspace.e2e.mjs: the export-loading step passes include_html:true; add
  an assertion that the default response omits html and has
  download_started + content_digest.

## Atlas (lib/atlas.js)

- **C17 immutability wording.** atlas_overview: replace the READ-ONLY claim
  with "EVIDENCE-IMMUTABLE: no tool adds, removes, or persists records,
  edges, or claims. evaluate_claim, synthesize, get_study_brief and
  focus_node change ephemeral page/UI state and append session-ledger
  entries. Page state is per-page and per-session; nothing propagates to the
  exemplar or workspace pages."
- **C18 state relationship.** synthesize description: "changes only the
  displayed synthesis (cell node + panel)"; evaluate_claim description:
  "always reruns the claim's stored AST over the FULL record set — it does
  not inherit synthesize's exclusions."
- **C19 list_nodes (new read tool, unledgered).** Returns every node id
  grouped by type with labels; records include {record_id, node_id, author,
  year, weeks, yi, vi}. Update tool-count assertions (8 → 10 with C20) and
  the console options count.
- **C20 get_audit_log (new read tool, unledgered)** mirroring M1's envelope
  return.
- **C21 id normalization.** focus_node accepts both 'rec:s10' and 's10'
  (and analogous claim:/gap:/mod: forms); evaluate_claim accepts 'c-window'
  or 'claim:c-window'; synthesize exclude accepts bare or 'rec:'-prefixed
  ids. Responses include both bare and node ids where applicable. get_cell
  schema: cell_id {const:'cell:teacher-expectancy-iq'} with description.
- **C22 brief availability.** get_study_brief: title → 'Prospective
  study-design brief'; schema gap_id {enum: the three gap ids} + description
  "only gaps whose get_gaps entry has brief_available:true compile —
  currently gap:coverage-weeks"; non-available gaps return {available:false,
  reason} (not an error).
- **C23 coverage-gap corrected texts.** Compute pred3 = intercept + 3·slope
  live (≈ −0.064). statement → "Observed weeks are <sorted list>; none fall
  in <band>. Under x = min(weeks, 3), the fitted line crosses zero near
  <zc> weeks and predicts approximately SMD <pred3> for every raw value
  ≥ 3." ranked_by → "raw-moderator coverage gap; no confidence or priority
  ranking is inferred — because all weeks ≥ 3 map to x = 3, this band has no
  distinct fitted prediction under the current model." Brief rationale → "A
  pre-registered study in this band would add raw-week coverage and could
  assess the authored cap-at-3 against prespecified uncapped or nonlinear
  alternatives, while also estimating the effect in the band." get_gaps note
  → "Observed values, estimates and derived gap bounds are computed from the
  current records under authored gap definitions and model specifications;
  changing either can change the result."
- **C24 replication gap honesty.** count_with_prereg → null;
  assessment_status:'not_collected'; card/map label → "Preregistration
  linkage unknown"; statement → "Preregistration linkage was not assessed
  for these records — the record schema cannot represent it. No inference
  about the existence of preregistered replications is available."
- **C25 verification gap.** statement → "No shipped record carries a
  per-record source quote, approval event, or data manifest. Ladder rungs
  are unassigned; if R2 requires a manifest, no record can currently be
  certified as R2 or higher." Card defines R2 in one clause ("R2 =
  recomputable from an attached data manifest").
- **C26 brief neutrality.** design_implication → "The Atlas cannot choose
  the test. If the question is practical equivalence, define a margin δ and
  plan an equivalence analysis; if the question is any positive effect, a
  superiority test answers that different question — under the current
  model the predicted effect in this band is ≈ <pred3>." current_estimates
  interpretations → "descriptive estimate from the current corpus; the
  corpus's selection process is uncharacterized, so this is neither a bound
  nor a justified planning value" (pooled) / "post-hoc subgroup estimate
  from the same corpus; not independent validation and not a justified
  planning value" (subgroup). unresolved_inputs: "loses pupils" → "may lose
  pupils"; the preregistration line → "Preregistration strengthens a
  confirmatory model test by separating prediction from observed results; an
  unregistered result remains informative but exploratory." Missing inputs
  are "not present in this Atlas or its corpus", never "do not exist".
- **C27 relation_type note.** get_cell keeps relation_type:'causal' but
  adds relation_type_note: "causal estimand — contrast of assigned
  expectancy induction vs no induction; causal validity depends on the
  original randomization, clustering, attrition and outcome-measurement
  assumptions." effect_measure description gains the SMD direction
  convention (as C12).
- **C28 (nice) analysis guards.** subgroup_analysis description: "for
  weeks, omit split_at to use 1 or provide another threshold; split_at is
  rejected for setting/tester" + runtime rejection. meta_regression: cap
  must be > 0 and is only accepted for moderator 'weeks' (runtime error
  otherwise) + description.

## Tests

Update assertions encoding old texts/counts across verify/*.mjs (atlas tool
count, console counts, gap fields incl. count_with_prereg null, brief text
regexes, export contract, c-moderator AST fixtures in rules.test.mjs and the
new branch — add a fixture where the slope is positive-significant proving
the new branch fires, statement-equality in atlas block 0 with the new
c-moderator sentence, e2e's claim-count/AST checks). All five suites green.
