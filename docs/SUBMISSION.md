# WebMCP Challenge submission draft

Status: technically updated for v0.2 on 2026-09-04. Add the final public video URL
and re-check the current Devpost rules before submission.

## Project

**Name:** Living Evidence

**Tagline:** Documents your AI can cross-examine.

**Live:** <https://living-evidence.doralemon.chatgpt.site/>

**Public mirror:** <https://microckey.github.io/living-evidence/>
**Code:** <https://github.com/microckey/living-evidence> (MIT)

## Inspiration

AI agents increasingly read scientific documents, but most pages give them prose
and force them to guess at the arithmetic. Executable papers made computation
available to motivated human readers; WebMCP lets the document hand typed,
bounded operations to any visiting agent. We asked what a paper should become
when reading can include rerunning.

## What it does

Living Evidence is an implemented document-format prototype plus four surfaces:

- A 15-tool meta-analysis exemplar lets an agent inspect records and provenance,
  rerun models and sensitivity checks, and execute deterministic registered claim
  rules. Outcomes appear in the prose as **rule passed / failed / inconclusive**.
  They are explicitly not truth, validity, bias, or evidence-quality ratings.
- An 18-tool workspace imports strict CSV/JSON/Quarto/Jupyter evidence packages
  locally. Every row carries source, quote, locator, derivation, design,
  outcome/timepoint, experiment id, estimand and explicit risk-of-bias state.
  Nothing enters an analysis until a human approves its full review card.
- `export_document` creates one offline HTML file with data, runtime and tools.
  A SHA-256 chain records scientific actions and bounded result preimages.
  ECDSA receipts cover canonical science, runtime, an audit prefix and—through a
  detached receipt—the exact artifact bytes. An external CLI checks both
  signatures and recomputes all embedded hashes.
- A 10-tool Atlas computes coverage gaps over the same corpus. The 11-tool
  Evidence Board is deliberately labeled an **experimental, unverified
  conversation-ingestion appendix**, not evidence for the scientific result.
- A frozen PDF-vs-WebMCP protocol makes the performance hypothesis measurable.
  No runs are recorded yet, so the page makes no superiority claim.

The exemplar reproduces a historical Pygmalion synthesis with **19 effect-size
records representing 18 experiments**. It openly reports that two records share
an experiment and their covariance is not modeled. It also reports the current
provenance ceiling: 0/19 primary reports checked, 0/19 derivations independently
checked, and 0/19 structured risk-of-bias assessments supplied.

## How we built it

The core is dependency-free browser JavaScript: REML/DL random effects,
fixed/common effects, subgroups, meta-regression, leave-one-record-out,
Egger diagnostics and cumulative analysis; SVG renderers; declarative claim-rule
ASTs; strict evidence-package and receipt validators; canonical JSON, SHA-256 and
Web Crypto P-256. The Sites app is a thin route adapter over the same static
documents. Unit and real-browser suites cover all four surfaces, human approval,
reload persistence, hostile imports, cryptographic receipts, exact-byte export,
HTTP and `file://` boot, and zero-network self-containment.

Selected numeric outputs reproduce checked R `metafor` fixture values. That
tests this implementation's arithmetic for one dataset; it does not validate the
transcription, model assumptions or scientific conclusion.

## What we learned

The difficult part was not exposing more actions. It was making the limits of
each action machine-readable:

- a registered rule can pass without its claim being true;
- a human can accept an extraction without independently verifying it;
- a hash can detect changed bytes without proving authorship or preservation;
- a reproducible calculation can still use a wrong model;
- a coverage gap in one collected corpus is not proof that no study exists.

That boundary is the product. The agent gets useful leverage while the page
retains the right to say “not assessed,” “unverified,” or “not measured.”

## Why WebMCP matters

The credible near-term value is lower friction for deterministic checking. A
reader can ask for a model excluding specified records, inspect a claim's exact
rule, or compare an updated evidence version without copying a table into a new
tool. The computation stays with the document, and the output appears in the
same shared page for the human to inspect.

This prototype does **not** yet prove that WebMCP makes scientific work faster or
more accurate. The next milestone is a preregistered benchmark across independent
documents and agent models, plus primary-source checking, covariance-aware
methods, instrument-specific risk-of-bias profiles, durable archives and
externally anchored publishing keys.

## Three-minute demo script

Target encoded cut: 2:40–2:50, with audio.

**0:00–0:20 — Problem**

> “When an AI reads a paper, it receives words and often guesses at the
> arithmetic. Living Evidence is a document that hands the reader's agent typed
> tools over the data and deterministic code inside the page.”

**0:20–0:48 — Exemplar and honest scope**

> “This Pygmalion exemplar contains 19 effect-size records from 18 experiments.
> It shows every record's current provenance gaps and warns that the historical
> row-wise fit does not model one shared-experiment covariance.”

Type: `Inspect the data manifest, then cross-examine every registered claim.`

> “The badges say rule passed, failed or inconclusive. They do not say true or
> false. The page can lose an argument about its own wording.”

**0:48–1:16 — Agent-composed rerun**

Type: `Re-run REML without s04 and s10 and explain the dependence warning.`

> “The agent composes a rerun the author did not need to prebuild as a button.
> The exact result and figure return to the shared page and enter its SHA-256
> audit chain.”

**1:16–1:48 — Human gate**

Use this complete synthetic proposal (or pre-stage it):

```json
{
  "author":"Demo et al.","year":2026,"yi":0.10,"vi":0.04,"weeks":2,
  "source":"Synthetic video-demo data note; not a publication",
  "source_url":"https://example.invalid/demo","source_locator":"Demo note, row 1",
  "quote":"Synthetic demo: Hedges g 0.10, variance 0.04, two weeks prior contact.",
  "derivation":"Synthetic values supplied directly; no calculation",
  "study_design":"synthetic parallel demonstration","outcome":"demo IQ score",
  "timepoint":"post-demo","experiment_id":"demo-2026-01",
  "record_role":"single synthetic experiment estimate","smd_variant":"Hedges_g",
  "effect_direction":"positive = higher score in expectancy group than control",
  "collection_frame":"Synthetic video demonstration only",
  "risk_of_bias_status":"not_assessed"
}
```

> “The agent can only propose. The full traceability card appears, and the
> evidence remains unchanged until I approve. Approval updates the version and
> marks older rule outcomes stale; it does not pretend this synthetic source was
> verified.”

**1:48–2:15 — Workspace and export**

> “The workspace accepts strict CSV, JSON, Quarto or Jupyter packages locally.
> Every row is reviewed. Export produces an offline document plus a detached
> exact-byte receipt; the external verifier checks the artifact, embedded science,
> runtime and both signatures.”

**2:15–2:34 — Benchmark and Atlas**

> “The Atlas computes a coverage lead from this corpus. The comparison panel
> starts at zero runs and says so: we built a falsifiable PDF-versus-WebMCP test,
> not a marketing result.”

**2:34–2:47 — Close**

> “For an agent, reading can be rerunning. Living Evidence is not a truth
> machine; it is a concrete, testable step toward cheaper scientific auditing.”

## Final checklist

- [ ] Live Sites URL loads and exposes Site tools
- [ ] GitHub mirror and MIT repository are public
- [ ] Video is public, has audio, and encoded duration is under 3:00
- [ ] Devpost description uses “18 experiments / 19 records” and “15 / 18 tools”
- [ ] No claim of benchmark superiority or cross-corpus generalization
- [ ] Board described only as an experimental appendix
- [ ] Re-read current official rules, eligibility and judging criteria
- [ ] Add final video URL and submit before the displayed deadline
