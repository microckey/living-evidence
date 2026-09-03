# Importing evidence without inventing provenance

The Workspace accepts one deliberately narrow interchange:
`living-evidence-smd-package/1`. It is for aggregate standardized-mean-
difference records, not participant-level data and not every scientific design.

Open `workspace.html`, choose a `.csv`, `.json`, `.qmd`, or `.ipynb` file under
**Import an evidence package**, and review the resulting cards. The file stays in
the browser. Parsing never executes notebook cells, evaluates formulas, follows
URLs, or adds records automatically.

For a first walkthrough, use **Try 3 synthetic sample records** in an empty
workspace, or download [the complete sample CSV](examples/synthetic-evidence.csv).
These numbers are invented for learning the interface, not research evidence.
The button stages three cards but approves none; approve individually and the
forest plot appears after the second approval. Pending cards block export.
The sample shortcut refuses nonempty workspaces to avoid silently mixing demo
records with research. Export anything you need before choosing to reset.

## CSV contract

Required UTF-8 headers:

```text
id,author,year,yi,vi,weeks,source,quote,source_locator,derivation,
study_design,outcome,timepoint,experiment_id,risk_of_bias_status,
smd_variant,effect_direction,collection_frame
```

Useful optional headers:

```text
setting,tester,n1i,n2i,source_url,doi,record_role,
risk_of_bias_instrument,risk_of_bias_assessor,risk_of_bias_date,
risk_of_bias_source,risk_of_bias_overall_rationale,
risk_of_bias_domains_json,smd_variant_detail
```

The three dataset fields (`smd_variant`, `effect_direction`, and
`collection_frame`) repeat identically on every CSV row. This makes the contrast,
sign, SMD definition, and eligibility frame travel with a stand-alone CSV. A
number without its exact locator, source text, derivation, design, outcome and
timepoint is rejected instead of being repaired by an agent. `doi` is optional
because not every source has one; omit it rather than inventing one.

v1 deliberately accepts only one independent effect per `experiment_id`.
Dependent outcomes or timepoints need a covariance-aware/RVE workflow and are
rejected rather than silently double-counted. Use a dot decimal separator. Files
are limited to 1 MiB and 100 records; larger reviews need a reviewed batch
pipeline and durable storage.

When `risk_of_bias_status` is assessed (`low`, `some_concerns`, or `high`), the
instrument/version, assessor, assessment date, source, overall rationale, and a
JSON array of domain judgments with rationales are all required. The runtime
checks structural completeness and duplicate domain names; it does not run an
instrument-specific aggregation algorithm or independently validate the supplied
assessment. Use `not_assessed` with no assessment details when that work has not
been done.

## metafor / R

After `metafor::escalc()`, explicitly map the computed columns and join your
extraction sheet containing the source text. Never guess that `sei` is `vi`;
when appropriate, calculate `vi = sei^2` and say so in `derivation`.

```r
out <- transform(escalc_result,
  id = record_id, author = slab, source = citation, quote = source_quote,
  source_locator = table_locator,
  derivation = "metafor::escalc(measure='SMDH'); yi/vi from script commit ...",
  study_design = design, outcome = outcome_name, timepoint = outcome_timepoint,
  experiment_id = experiment_id, risk_of_bias_status = rob_status,
  smd_variant = "Hedges_g",
  effect_direction = "positive = intervention higher than control",
  collection_frame = "Protocol DOI/URL and search dates ...")
write.csv(out[c("id","author","year","yi","vi","weeks","source","quote",
                "source_locator","doi","derivation","study_design","outcome",
                "timepoint","experiment_id","risk_of_bias_status","smd_variant",
                "effect_direction","collection_frame")],
          "evidence.csv", row.names = FALSE, fileEncoding = "UTF-8")
```

## Quarto

Prefer writing an adjacent JSON package from an R/Python cell and listing it in
Quarto `resources`. For direct Workspace import, one fenced block is accepted:

````markdown
```{living-evidence}
{"schema_version":"living-evidence-smd-package/1","studies":[...]}
```
````

No other rendered prose or code block is scraped.

## Jupyter

Put the same JSON object in notebook `metadata.living_evidence`, or place the raw
JSON in one cell tagged `living-evidence-manifest`. The importer reads notebook
JSON only. It does not execute cells or trust HTML output.

## Command-line conversion

```bash
node scripts/convert-evidence.mjs evidence.csv evidence.json
```

The converter hashes the exact input bytes and rejects malformed UTF-8. The
browser does the same before parsing a selected file. Imported strings are
always rendered as text. Prompt-like quotes and spreadsheet formulas remain
evidence text; they are never instructions or executable expressions.

## JSON dataset contract

JSON, Quarto and Jupyter packages put the repeated CSV metadata into one required
`dataset` object:

```json
{
  "schema_version": "living-evidence-smd-package/1",
  "dataset": {
    "id": "review-2026",
    "label": "Review title",
    "effect_measure": "SMD",
    "smd_variant": "Hedges_g",
    "effect_direction": "positive = intervention higher than control",
    "collection_frame": "Protocol, databases and search dates"
  },
  "studies": []
}
```

The runtime validates the same constraints as
[`schemas/evidence-package-v1.schema.json`](../schemas/evidence-package-v1.schema.json):
unknown fields, JSON numeric strings, booleans masquerading as numbers, malformed
artifact hashes and incompatible effect definitions are rejected rather than
coerced.

Package validation is atomic, but it is not publication verification. Every row
becomes a separate human review card; package `claims` are never registered
automatically. The source-artifact SHA-256 identifies the exact bytes selected on
this device, but is not an archive, trusted timestamp, DOI, or proof of authorship.
