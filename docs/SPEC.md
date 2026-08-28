# Living Evidence — format specification (v0.1)

**One sentence:** a Living Evidence document is a web page whose claims can be
cross-examined — by the reader, and by the reader's AI agent — because the page
carries its own data, its own analysis code, and a WebMCP tool contract over both.

## Why

Interactive/executable papers (Jupyter, Distill, eLife ERA, Quarto) made figures
re-runnable **for human hands**: sliders and Run buttons, bounded by whatever UI the
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
   and an append-only *audit ledger* records every call with its actor
   (`AGENT` / `HUMAN`).

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

```js
claims: [{
  id: 'c-overall',
  rule: 'Human-readable statement of the deterministic check.',
  check(analyses) {
    const fit = analyses.overall({ method: 'REML' });
    return { verdict: 'supported' | 'challenged' | 'nuanced', reason: '…', evidence: fit };
  },
}]
```

`check` receives the internal analysis registry, so evaluating a claim also renders
its figure and ledger entries. When the evidence base changes (a proposal is
approved), existing verdict badges are marked **stale** until re-evaluated.

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
Read-only tools set `annotations.readOnlyHint`.

## Scope and versioning

v0.1 ships one document genre — the **living meta-analysis** — with a
dependency-free statistics engine (REML/DL random effects, subgroups,
meta-regression, leave-one-out, Egger, cumulative) validated against R `metafor`
reference output. The format concepts (claims, ledger, approval gate, workbench)
are genre-independent; later versions can carry other engines (trial re-analysis,
forecasting scorecards, policy dashboards) behind the same contract.

A Living Evidence document is static hosting only — no backend, no accounts, no
platform. Anyone can publish one anywhere HTML can be served.
