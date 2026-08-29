# Living Evidence — format specification (v0.1)

**One sentence:** a Living Evidence document is a web page whose claims can be
cross-examined — by the reader, and by the reader's AI agent — because the page
carries its own data, its own analysis code, and a WebMCP tool contract over both.

## Why

Interactive/executable papers (Jupyter, Distill, eLife ERA, Quarto) made figures
rerunnable **for human hands**: sliders and Run buttons, bounded by whatever UI the
author thought to build. Meanwhile the fastest-growing readership of documents is
machines — and an AI agent reading those same pages still just scrapes prose and
hallucinates the numbers.

Living Evidence targets the machine reader. The document exposes **typed tools**
(via [WebMCP](https://webmachinelearning.github.io/webmcp/)) instead of buttons, so
an agent can compose analyses the author never scripted — *"does the publication-bias
claim survive if you drop the two outliers?"* — and every result renders back into
the page where the human is reading.

## The three layers

1. **Human layer** — ordinary prose, figures, references. Fully readable with no
   agent and no JavaScript beyond first render.
2. **Agent layer** — WebMCP tools registered on `document.modelContext`. The
   complete analytical surface of the document, machine-callable with JSON schemas.
3. **Shared layer** — everything the agent does materializes in the document:
   figures render into the *Reader's Workbench*, claims receive verdict badges,
   and an append-only *audit ledger* records every analysis, verdict and
   mutation with its actor (`AGENT` / `HUMAN` / `SYSTEM`; pure reads are not
   ledgered — the overview tool says so).

## Non-negotiable design rules

1. **The page computes, the agent judges.** Every statistic is produced by
   deterministic page code. Tool descriptions must instruct agents to cite numbers
   from tools, never to recompute them. (LLM arithmetic is the failure mode this
   format exists to eliminate.)
2. **Nothing invisible.** Every tool call appends a visible ledger entry. Analysis
   tools also render a figure. An agent cannot probe the document without the
   human seeing the probe.
3. **Humans own the evidence base.** Agents may *propose* changes
   (`propose_study`); inclusion happens only through an explicit human approval
   control rendered in the page. Approved records carry provenance.
4. **Claims are addressable and machine-checkable.** A claim is a highlighted span
   with an id and a deterministic rule. `evaluate_claim` runs the rule and badges
   the claim `supported` / `challenged` / `nuanced` — including against the
   document's own thesis. A Living Evidence document must be *able to lose*.
5. **The tool surface is human-operable.** The Tool console exposes the same
   tools, schemas and effects to readers without an agent. No hidden agent-only
   capability.

## Document anatomy

```html
<link rel="stylesheet" href="lib/living-evidence.css">

<div  id="le-status"></div>        <!-- agent-interface status banner -->
<span class="le-claim" data-claim="c-overall">…a testable sentence…</span>
<span data-le-bind="estimate"></span>  <!-- live-bound statistics in prose -->
<div  id="le-main-figure"></div>   <!-- headline figure, re-renders on evidence change -->
<div  id="le-workbench"></div>     <!-- agent/console analyses render here -->
<div  id="le-pending"></div>       <!-- human approval cards -->
<ol   id="le-ledger"></ol>         <!-- append-only audit ledger -->
<div  id="le-console"></div>       <!-- human-operable tool console -->

<script type="module">
  import { initLivingEvidence } from './lib/living-evidence.js';
  initLivingEvidence({ title, hypothesis, dataset, claims, moderators, subgroupFields });
</script>
```

`data-le-bind` keys: `k`, `estimate`, `ci`, `p`, `I2`, `tau2`, `Q`, `Q_p` — kept in
sync with the current evidence base (REML fit).

### Dataset

```js
dataset: {
  id, label,
  effect_measure: 'SMD',
  fields: { yi: '…', vi: '…', /* moderator descriptions */ },
  studies: [{ id, author, year, yi, vi, ...moderators }],
}
```

### Claims

A claim's machine check is **data, not code** — a declarative rule AST
interpreted by `lib/claim-rules.js`. `check()` functions are rejected at boot
(they would be un-auditable and un-exportable):

```js
claims: [{
  id: 'c-overall',                       // /^[A-Za-z0-9_-]{1,40}$/
  rule: 'Human-readable statement of the deterministic check.',
  test: {
    analysis: 'overall',                 // overall | metareg | subgroup | loo | funnel | cumulative
    args: { method: 'REML' },
    // optional focus: pick one element of a result collection into ctx.f
    // focus: { collection: 'groups', match_field: 'group', match_substring: '≤ 1' },
    verdicts: [                          // ordered; first match wins; last MUST be the default
      { when: [{ path: 'significant', op: 'eq', value: false },
               { path: 'estimate', op: 'abs_lt', value: 0.2 }],
        verdict: 'supported', reason: 'pooled SMD {estimate}, p = {p}' },
      { default: true, verdict: 'challenged', reason: 'pooled SMD {estimate}, p = {p}' },
    ],
  },
}]
```

Condition ops: `lt le gt ge eq ne abs_lt abs_ge`; paths are dotted
(`moderator.p`, `f.estimate`, `flips_significance.length`); `{path}`
placeholders in `reason` interpolate from the analysis result. Running a
claim's test renders its figure and ledger entries like any analysis. When
the evidence base changes, existing verdicts become **stale** — machine-
readably: `list_claims`/`evaluate_claim` carry `stale`, `evaluated_version`
and `evidence_version`, and the badge is struck through until re-evaluated.

## Tool contract (v0.1)

| Tool | Kind | Effect on page |
|---|---|---|
| `get_document_overview` | read | — (orientation: claims, evidence state, rules of engagement) |
| `list_claims` | read | — |
| `get_studies` | read | — |
| `run_meta_analysis` | analysis | forest plot + ledger |
| `leave_one_out` | analysis | sensitivity plot + ledger |
| `subgroup_analysis` | analysis | subgroup forest + ledger |
| `meta_regression` | analysis | bubble plot + ledger |
| `funnel_check` | analysis | funnel plot + Egger test + ledger |
| `cumulative_meta` | analysis | accumulation plot + ledger |
| `evaluate_claim` | verdict | claim badge + analysis figure + ledger |
| `propose_study` | proposal | approval card (pending) + ledger |
| `get_audit_log` | read | — |

Registration follows the W3C draft: `document.modelContext.registerTool({name,
title, description, inputSchema, annotations, execute})`; `execute` returns a plain
object (the runtime serializes it). All schemas set `additionalProperties: false`.
Read-only tools set `annotations.readOnlyHint`. Partial registration is reported
as a **degraded** status (never `active`) with the failed tool names listed.

**M1 hardening deltas** (implemented; supersede anything above that conflicts):
ledger entries are structured envelopes `{run, time, actor, kind, tool, inputs,
summary, evidence_version, result_digest}` (digest = FNV-1a of the deterministic
result payload); pure reads are not ledgered; `propose_study` requires **both**
`source` and `quote`, computes a `record_hash` at proposal time, and binds the
human approval to it (approved records carry a structured `provenance` object);
same author+year with a different effect is accepted but flagged
`possible_duplicate_of`.

### Workspace mode (M1)

`initLivingEvidence({mode: 'workspace', storageKey, …})` boots the same runtime
as an **empty, persistent, exportable** evidence base: state (records, pending
proposals, claims, verdicts, ledger, evidence version) round-trips through
`localStorage`; three additional tools appear — `set_hypothesis`,
`add_claim` (declarative test AST only, validated at the tool boundary), and
`export_document`, which compiles the workspace into a **self-contained
single-file Living Evidence document** (data + engine + figures + tools inlined;
runs from `file://` with zero network access). Claims render as a list rather
than prose spans. A workspace is a private document under construction; its
export is the published form — the format's recursion, implemented.

## Scope and versioning

v0.1 ships one document genre — the **living meta-analysis** — with a
dependency-free statistics engine (REML/DL random effects, subgroups,
meta-regression, leave-one-out, Egger, cumulative) validated against R `metafor`
reference output. The format concepts (claims, ledger, approval gate, workbench)
are genre-independent; later versions can carry other engines (trial re-analysis,
forecasting scorecards, policy dashboards) behind the same contract.

In v0.1, a Living Evidence document is static hosting only — no backend, no
accounts, no platform; anyone can publish one anywhere HTML can be served.
Static hosting is a property of the v0.1 implementation, not of the tool
contract; the section below sketches where the contract could generalize.

## v0.2 direction — toward an executable layer for science

**Status: none of this section is implemented.** v0.1 (everything above) is the
shipped artifact and the only thing this repository can be judged on. What follows
is a direction — a design sketch recorded so the v0.1 contract can be read as the
first member of a family rather than a one-off. Verb names, schemas and semantics
below are provisional and expected to change.

### Motivation

The generalization target is a minimal common protocol under which every compliant
publication — a journal article, a university page, a lone researcher's site, a
data-journalism piece — presents the same surface to a visiting agent. Such a
publication carries seven things: narrative, claims, data, methods, code,
provenance, and tools. HTML standardized the *display* of documents; the object
here is a standard for *operating on claims*, with WebMCP as the transport and
interface layer. Nothing in it is publisher-specific: a document is compliant
because it exposes the verbs, not because of who published it or where. Working
name for the endgame: **an executable layer for science**.

### Verb sketch

```
list_claims()
inspect_claim(claim_id)
get_evidence(claim_id)
get_analysis_spec(claim_id)
rerun_claim(claim_id, parameters)
get_effect_estimate(claim_id, parameters)
get_data_manifest()
get_reproducibility_status()
```

Correspondence with the v0.1 tool contract (the table above):

| v0.2 verb | v0.1 today |
|---|---|
| `list_claims` | `list_claims` — already exists under the same name in v0.1 |
| `inspect_claim` + `rerun_claim` under the document's own rule | `evaluate_claim` |
| `rerun_claim(claim_id, parameters)` | embryonic: `run_meta_analysis {method, exclude}`, `subgroup_analysis {split_field, split_at}`, `meta_regression {moderator, cap}` |
| `get_evidence` / `get_data_manifest` | `get_studies {include_pending}` |
| `get_reproducibility_status` / provenance | direction; `get_audit_log` is the session-scoped precursor |

v0.1 is the smallest complete loop of this design, hand-built for one document
genre. v0.2 would generalize the verbs across genres; the genre-specific engine
stays behind them.

### Parameterized reruns

The load-bearing verb is `rerun_claim`. Today, aggregating a literature means
harvesting whatever numbers papers happened to report; a question the authors did
not compute — say, restricting to participants aged ≥ 65 — is usually unanswerable
after publication. If each paper exposes `rerun_claim(claim_id, {subset:
'age>=65'})`, an agent can pose that question to each compliant publication in turn
and synthesize the returned aggregates. Analyses nobody performed at publication
time become addressable retroactively, across a literature.

### Within-study interactions vs. ecological bias

Cross-study re-analysis under matched conditions can surface structure no single
paper reports — e.g. that effects concentrate in younger samples. Detecting that
by regressing study-level aggregates on study-level means (meta-regression as
practiced today) is exposed to **ecological bias**: a study-level association need
not hold within studies. Per-paper reruns of the *interaction* inside each study,
synthesized afterwards, are a strictly stronger inference for the same question.
The protocol is therefore not only a new-capability story; it addresses a known
error mode of current aggregate synthesis.

### Interface, not compute location

Arbitrary subgroup reruns generally require individual participant data, which
frequently cannot be published (consent, ethics, GDPR). The design response is to
send the computation to the data rather than the reverse: a publication exposes
`rerun_claim()` and never a `get_raw_data()`. Only aggregates cross the boundary.

Two implementations sit behind one contract:

- **shareable data** — everything runs client-side in the page, as in v0.1;
- **restricted data** — the tool's `execute()` proxies to a governed enclave that
  holds the data and returns aggregates only.

WebMCP standardizes the interface, not the compute location. Restricted-data mode
relaxes two v0.1 properties at once — static hosting, and the opening definition's
"the page carries its own data" clause; both are implementation properties, not
contract properties.

### Multiplicity and the audit ledger

Allowing agents to run arbitrary re-analyses across dozens of papers is a
false-discovery factory unless the design accounts for it. The v0.1 mechanisms are
the intended answer, applied at ecosystem scale:

- every query lands in an append-only, visible ledger, so multiplicity becomes
  **countable and correctable** rather than self-reported;
- `get_analysis_spec` distinguishes **confirmatory** reruns (parameters matching
  the pre-registered spec) from **exploratory** ones (post-hoc, and marked as such
  in the ledger);
- adversarial probing becomes an asset rather than a threat: a claim that has
  survived N recorded cross-examinations carries a form of credibility that an
  unprobed claim cannot. This is design rule 4 — *a document must be able to
  lose* — read at the scale of a literature.

### Workspace recursion, and the harmonization caveat

A hypothesis-centered research workspace whose nodes are papers (executable or
PDF-only), datasets and the researcher's own analyses has the same data structure
as a Living Evidence document: claims, evidence, ledger, provenance. It is simply
private and dynamic, and a matured map can publish as a living review — personal
research notes and publications sharing one format.

The caveat: "rerun A and D under the same conditions" conceals variable
harmonization (`age` vs. `age_group`, differing outcome scales — the problem
common data models such as OMOP and CDISC exist to address). Agents can perform
the mapping, but **the mapping must itself be logged and auditable**, or
cross-paper reruns fail silently. Any v0.2 that skips this is unsound.

### Versioning and citation stability

Living documents break citation unless versioned. The rule: what is living is the
evidence base; every cited state is immutable. This implies content-hash-pinned
document versions, with the pinning and its provenance reachable through the
protocol (`get_reproducibility_status`). v0.1 has no such versioning — its ledger
is session-scoped and its evidence base resets on reload.

### Cold start

Three adoption paths: (1) new publications
authored in the format (the `template.html` path that exists today); (2) retrofits
of high-value literatures, where systematic-review organizations already hold
extracted study-level data; (3) LLM-extracted, human-approved retrofits — the
v0.1 `propose_study` propose→approve flow generalized from studies to papers.

### Non-goals

This is auditability infrastructure, not a truth machine. Specifically, the
protocol does **not**:

- improve experimental design — a badly designed study reruns faithfully;
- detect fabricated data, which may rerun cleanly;
- correct model misspecification — a wrong model reruns precisely wrong;
- adjudicate claims. The page computes; the agent judges; humans decide.

What it does is collapse the cost of verification, comparison and re-analysis, and
add deterrence: fragile, analysis-choice-dependent results live under the
expectation that someone's agent will eventually probe them, and multiverse-style
robustness checks become cheap. Any speedup in science is a consequence of cheap
auditing, not of machines finding truth.
