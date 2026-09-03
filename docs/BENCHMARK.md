# PDF vs WebMCP comparison protocol

This is a small, reproducible A/B harness, not a performance claim. Until runs
are collected, Living Evidence says only **"No runs recorded."** A single run is
descriptive and does not establish general model performance.

## Frozen artifacts

- PDF condition: [`benchmark-baseline.pdf`](benchmark-baseline.pdf)
- WebMCP condition: the exemplar at `index.html`
- Dataset: `metadat::dat.raudenbush1985`, 18 experiments represented by 19
  effect-size records
- Baseline version: `2026-09-04.v1`
- PDF SHA-256: `9ef53847f62ab86adb322876c21a7a0b008baa19f2425f32004819ccfa82eb49`

The PDF carries the same data table and methods context but no executable tools.
Its hash is shown in the page and verified by the test suite.

## Common prompt

Use this exact prompt in both conditions:

```text
Using only the supplied evidence artifact (do not search the web), return exactly one JSON object and no prose.

1. Fit the full 19-record dataset with a random-effects meta-analysis using REML. Return k, estimate, ci_lower, ci_upper, and p.
2. Refit the same model after excluding record s04. Return k, estimate, ci_lower, ci_upper, p, and excluded: ["s04"].
3. Run Egger's regression test on the full dataset. Return egger_p and apply this registered rule: passed if p >= 0.10, failed if p < 0.05, otherwise inconclusive.

Required shape:
{"overall":{"k":0,"estimate":0,"ci_lower":0,"ci_upper":0,"p":0},"exclude_s04":{"k":0,"estimate":0,"ci_lower":0,"ci_upper":0,"p":0,"excluded":["s04"]},"bias":{"egger_p":0,"rule_outcome":"passed|failed|inconclusive"}}
```

## Procedure

1. Use the same agent model, settings, and available ordinary tools for both
   conditions. Start a fresh session for each condition.
2. Alternate which condition goes first across replicate pairs.
3. For the PDF condition, attach only the frozen PDF. For the WebMCP condition,
   open only the exemplar page and let the agent discover its WebMCP tools.
4. Paste the common prompt unchanged. Paste each raw JSON answer into the local
   scoring fields on the exemplar page.
5. Record latency and token use separately only when the host exposes comparable
   measurements. The page does not infer them.

## Scoring

The scorer checks 13 fields. `k`, the exclusion list, and `rule_outcome` require
exact matches. Meta-analysis numerics use absolute tolerance 0.0005; the Egger p
value uses 0.000005. Invalid JSON is a parse failure, not a zero score. Results
remain in memory and are not added to the scientific audit ledger.

The reference answers come from this repository's tested JavaScript engine.
Therefore the harness tests whether an agent executes the document-defined tasks;
it is not an independent validation of the statistical engine, dataset extraction,
model assumptions, or scientific truth.

## What this cannot establish

- A handful of runs cannot support a population-level accuracy claim.
- This one dataset cannot establish generality across research domains.
- Correct arithmetic cannot compensate for unverified primary-source extraction
  or an absent risk-of-bias assessment.
- An authored rule outcome is not a scientific truth verdict.
