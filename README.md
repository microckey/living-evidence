# Living Evidence

**Documents your AI can cross-examine.**

Living Evidence is a WebMCP-native scientific document prototype. The same page
contains prose for humans, aggregate effect-size records, deterministic analysis
code, registered claim rules, and typed tools for a reader's agent. Tool-driven
analyses render back into the page and scientific actions enter a visible audit
ledger.

- Sites deployment: <https://living-evidence.doralemon.chatgpt.site/>
- Public mirror: <https://microckey.github.io/living-evidence/>
- Source: <https://github.com/microckey/living-evidence>

## What ships in v0.2

| Surface | Purpose | WebMCP tools |
|---|---|---:|
| `index.html` | Pygmalion meta-analysis exemplar | 15 |
| `workspace.html` | Import, human review, analysis and self-contained export | 18 |
| `atlas.html` | Read-only map of the exemplar and its coverage gaps | 10 |
| `board.html` | Experimental, unverified conversation-ingestion appendix | 11 |

The exemplar reproduces the historical row-wise analysis of **19 effect-size
records representing 18 experiments**. Two Pellegrini & Hicks condition records
share one experiment id; their within-experiment covariance is not modeled, so
inferential uncertainty may be understated. New imports are restricted to one
independent SMD record per experiment rather than silently repeating that
limitation.

Key capabilities:

- Registered claim rules report `passed`, `failed`, `inconclusive`, or
  `not_run`. These are outputs of author-defined rules—not scientific truth,
  validity, risk of bias, or evidence quality.
- Every record can carry DOI/URL, source locator, quote, derivation, design,
  outcome, timepoint, experiment id, estimand, import hashes, and structured
  risk-of-bias details. Missingness is explicit.
- CSV, strict JSON, Quarto and Jupyter packages are parsed locally without
  executing cells or following URLs. The whole package validates atomically;
  every record still requires a separate human approval.
- The main document and workspace use a reload-persistent SHA-256 audit chain.
  Bounded scientific result preimages are stored so their digests can be
  recomputed. Human approval accepts a supplied extraction; it does not verify
  the paper or assessment.
- ECDSA P-256 receipts sign a scientific-state hash and a covered audit prefix.
  Export returns a detached receipt for the exact HTML bytes and embeds a
  separately signed state receipt. The external verifier checks exact bytes,
  embedded science, runtime components, both signatures, and their linkage.
  Keys are non-extractable, self-generated per page load, and rotate on reload;
  pin a fingerprint elsewhere before treating a signature as authorship.
- A frozen PDF-vs-WebMCP benchmark and local scorer are included. **No runs are
  recorded, so this project makes no superiority claim.**

## Scientific status

The included corpus is intentionally honest about its gaps:

- primary reports checked: **0/19**;
- effect-size derivations independently checked: **0/19**;
- structured risk-of-bias assessments supplied: **0/19**;
- benchmark comparisons completed: **0**;
- independent corpora demonstrating generalization: **0**.

Selected numerical outputs reproduce the checked R `metafor` fixture to the
tested precision. That is software verification of a narrow calculation—not
validation of the transcription, model assumptions, causal interpretation, or
scientific conclusion.

## Try it

Open the exemplar with a WebMCP-capable browser and ask:

> Cross-examine this document's claims. Begin with `get_document_overview`,
> inspect the manifest, then run the registered rules and explain their scope.

Without an agent, use the page's Tool console. To author a document, open the
workspace and follow `docs/IMPORTING.md`; export is blocked while any proposal
still awaits human review.

## Verify locally

```bash
pnpm test
pnpm e2e
pnpm e2e:workspace
pnpm e2e:atlas
pnpm e2e:board
pnpm build
```

Verify an exported document and detached receipt:

```bash
node scripts/verify-receipt.mjs export.html.receipt.json export.html
```

Use `--signature-only` only when deliberately performing a partial check without
the artifact. The verifier rejects duplicate JSON keys, unknown receipt fields,
non-canonical Base64url signatures, private JWK material, and missing artifact
bytes for an artifact receipt.

## Format files

- `lib/living-evidence.js` — document/workspace runtime and WebMCP contract
- `lib/evidence-package.js` — strict local interchange parser
- `lib/integrity.js` — canonical JSON, SHA-256 and receipt validation
- `schemas/evidence-package-v1.schema.json` — producer schema
- `docs/SPEC.md` — v0.2 contract and trust boundaries
- `docs/BENCHMARK.md` / `docs/benchmark-baseline.pdf` — comparison protocol
- `template.html` — minimal synthetic authoring skeleton

## Vision, without the hype

The hypothesis is that machine-addressable claims and deterministic reruns can
reduce friction in scientific checking. This prototype demonstrates that loop in
one aggregate-SMD document; it does not yet demonstrate faster or more accurate
science. A bad design can rerun faithfully, a wrong model can rerun precisely,
and fabricated data can hash cleanly. The next credible milestone is measured
performance across independently authored corpora with primary-source checks,
instrument-specific risk-of-bias workflows, covariance-aware models, and durable
externally anchored releases.

Code is MIT. Exemplar prose is CC BY 4.0. Source statistics remain © their
original authors.
