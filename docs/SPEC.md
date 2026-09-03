# Living Evidence format v0.2

Status: implemented prototype, 2026-09-04.

## Purpose

A Living Evidence document is a human-readable web document that also exposes a
typed WebMCP contract over the same embedded evidence and deterministic analysis
runtime. It supports inspection and reproducible reruns; it is not a truth,
quality, peer-review, or authorship oracle.

## Required trust boundaries

1. The page computes registered analyses; an agent may interpret but must not
   silently substitute its own arithmetic for a page result.
2. External claim outcomes are `not_run`, `passed`, `failed`, and
   `inconclusive`. Legacy internal codes `untested`, `supported`, `challenged`,
   and `nuanced` remain for v0.1 clients. Every response states that an outcome
   is only the result of a document-registered rule.
3. Agents may propose evidence. Only an explicit human UI action may approve or
   reject it. Approval accepts the supplied extraction into the local evidence
   base; it does not verify its source, derivation, design, or risk of bias.
4. Pure reads are not ledgered. Analyses, registered-rule evaluations,
   proposals, human decisions, receipts, imports and exports are ledgered.
5. Missing provenance and quality assessment must be represented as missing,
   never inferred from a citation label or successful numerical rerun.

## Scientific state

`get_data_manifest` returns a SHA-256-addressed state containing:

- document title and hypothesis;
- dataset id/label, aggregate effect measure and field meanings;
- SMD variant/detail, contrast direction and collection frame;
- effect-size records and experiment cluster ids;
- record provenance, design, outcome, timepoint and risk-of-bias state;
- imported package registry and per-record decisions;
- registered claims and declarative rule ASTs;
- model, subgroup/moderator options and dependence disclosure.

The exemplar has 19 effect-size records from 18 experiments. Its historical
row-wise fit treats the two records sharing `pellegrini-hicks-1972` as
independent; covariance, multilevel modeling and robust variance estimation are
not implemented. Every analysis result repeats record/experiment counts and the
dependence warning.

## Provenance contract

Each record can carry:

`source`, `source_url`, `doi`, `source_locator`, `quote`, `derivation`,
`study_design`, `outcome`, `timepoint`, `experiment_id`, `record_role`, exact SMD
definition and direction, source/import hashes, and explicit verification flags.

An assessed risk-of-bias record requires instrument/version, assessor, calendar
date, source, overall rationale, and domain judgments with rationales. Runtime
validation checks structure, dates, vocabulary, duplicate domain names and the
all-not-applicable case. It deliberately does not apply an instrument-specific
overall-judgment algorithm. The UI labels supplied assessments unverified.

## Interchange

`living-evidence-smd-package/1` supports UTF-8 CSV, JSON, Quarto and Jupyter.
Parsing is local and inert: it does not execute cells, evaluate formulas, follow
URLs or upload content. Unknown fields and JSON numeric strings are rejected.
CSV accepts numeric strings only under strict JSON-number syntax. One package is
validated completely before any proposal is staged; each row then receives an
independent human decision. Package claims are ignored until explicitly added.

v1 accepts at most one record per `experiment_id`. Files are capped at 1 MiB and
100 records. See `docs/IMPORTING.md` and the published JSON Schema.

## Audit and receipts

Main/workspace audit entries use canonical JSON and SHA-256:

`run, time, actor, kind, tool, inputs, summary, evidence_version,
result_digest, result_payload, result_payload_status, previous_entry_hash,
entry_hash`.

Bounded scientific result preimages are stored and rehashed during chain
verification. Exact exported HTML is intentionally omitted from the ledger;
its detached receipt carries the byte hash. The chain detects changes relative
to a known head but is not, by itself, an identity or trusted timestamp.

A v1 receipt is an exact-schema ECDSA-P256-SHA256 object. It signs the scientific
state hash, evidence version, runtime/artifact hashes when applicable, audit head
and covered run, signer scope, assurance limits and note. Public JWK identity is
the RFC-7638-style SHA-256 thumbprint of `{crv,kty,x,y}`. Private JWK material,
unknown fields, duplicate JSON keys and non-canonical encodings are rejected.

An export contains:

- self-contained data, styles, analysis/runtime code and WebMCP tools;
- a non-executable canonical scientific-state block;
- an embedded signed state/runtime receipt;
- a separately returned/downloadable detached receipt for the exact HTML bytes.

The external verifier recomputes the exact artifact hash, embedded science hash,
runtime component hash, both signatures and their linkage. The in-page verifier
does not claim to verify its own containing bytes. Signing keys are non-extractable
and page-load-local, so they rotate on reload; fingerprint continuity requires an
external publishing identity or registry.

## Tool surfaces

Document (15):

`get_document_overview`, `list_claims`, `get_data_manifest`, `get_studies`,
`run_meta_analysis`, `leave_one_out`, `subgroup_analysis`, `meta_regression`,
`funnel_check`, `cumulative_meta`, `evaluate_claim`, `propose_study`,
`get_audit_log`, `get_reproducibility_status`,
`create_reproducibility_receipt`.

Workspace adds three (18 total): `set_hypothesis`, `add_claim`,
`export_document`.

Atlas exposes 10 read/inspection tools. Evidence Board exposes 11 tools but is an
experimental, unverified conversation-ingestion appendix and is not scientific
evidence for the exemplar.

## Benchmark and claims of performance

The frozen PDF and WebMCP page share a specified three-task protocol. Results are
scored locally. With zero recorded runs, the implementation must display a
neutral state and make no claim of improved accuracy, speed or error rate. One
hand-authored corpus does not demonstrate generalization.

## Out of scope in v0.2

- primary-source extraction verification;
- instrument-specific risk-of-bias automation;
- dependent-effect covariance, multilevel or robust-variance models;
- outcome harmonization and participant-level analysis;
- multiplicity correction or sequential-inference guarantees;
- durable server archive, trusted timestamp, author identity or shared key
  management;
- demonstrated benchmark superiority, cross-publisher interoperability or
  adoption across independent scientific corpora.
