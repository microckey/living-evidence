# Living Evidence Atlas — design document

Status: **DRAFT v2, for review** (review requested from Codex / GPT-5.6 Sol —
questions in §10, request block in AGENT_SYNC.md). v2 incorporates an internal
adversarial review round (3 reviewers, 17 must-fix findings applied; the v1→v2
changes are themselves an argument for the design's central thesis). Nothing in
this document is implemented unless marked SHIPPED. Shipped artifacts: the v0.1
format/exemplar. Approved to build: the workspace (M1).

## 1. Goal

Accelerate science, and make its convergence on truth more reliable. Not by
having machines find truth — that claim is disowned throughout this repo — but
by making the three expensive activities of scientific self-correction cheap,
continuous, and auditable:

1. **verification** (does the evidence say what the paper says?),
2. **comparison** (what does the evidence say jointly, and where does it disagree?),
3. **gap discovery** (what is missing, and what should be measured next?).

The system must close the full loop: read → verify → synthesize → surface
disagreement → identify gaps → compile the next study → absorb its results.
A platform that only reads and summarizes is not this system.

## 2. Ontology: cells, claims, and the map

A "knowledge map of papers" reproduces the citation graph — which already
exists and answers no scientific question. The Atlas is an **evidence graph**
with two distinct load-bearing objects:

- **Cell** — the atomic addressable unit: *(construct pair X→Y, population P,
  measure M, conditions C)*. A cell carries the evidence records that fall in
  it and their synthesis. Heterogeneity lives **inside** cells.
- **Claim** — a *directional assertion over a cell* ("X improves Y in P"),
  made by documents. Two papers can assert opposite things about one cell;
  `contradicts` is an edge **between claims**, never a synonym for
  within-cell heterogeneity.

Other nodes: **Construct** (X and Y themselves — needed because the same
construct hides under different names and measures: the jingle-jangle
problem), **Evidence record** (one study-level result with effect size,
variance, moderators, provenance), **Document** (legacy PDF or living
document), **Dataset / Method**, and **Gap** (§5).

**Edges** — `asserts`, `supports`, `contradicts`, `replicates`, `moderates`,
`measures-same-construct-as`, `derived-from`. Every edge carries provenance
(author assertion / LLM extraction / human approval / machine recomputation)
and a timestamp. An edge without provenance cannot exist.

**Identity under revision.** Construct merges and cell re-parameterizations
are proposals requiring approval (§9). A merge mints a **new** id with
`derived-from` edges to both parents; superseded ids permanently resolve to
their last pre-merge synthesis, content-hash-pinned (SPEC's versioning rule).
Citability survives ontology revision by construction.

**A synthesis is always a (spec, result) pair.** A cell does not "have a
number"; it has results under named analysis specs (estimator, moderator set,
harmonization choices), with the spread across registered alternative specs
exposable. Reifying one analytic path as *the* value would rebuild the
single-number pathology this project exists to dismantle.

**Contradiction is the engine.** An unexplained `contradicts` edge between
claims is the highest-value object in the map — but only under an operational
definition: interval-level incompatibility at a stated level (or a pairwise
heterogeneity test), **never** mere significance-status disagreement, which is
how the literature manufactures pseudo-contradictions. Known resolution paths
(list open, all of them progress):

- (a) a **moderator** explains it — observational and provisional knowledge
  (study-level moderation is exposed to ecological bias; SPEC §v0.2 — the
  within-study interaction rerun is the stronger follow-up);
- (b) a **methods audit** sinks one side — or both;
- (c) **dissolution by synthesis** — the "contradiction" was a
  significance-artifact or sampling noise all along (arguably the actual
  Pygmalion history);
- (d) **construct unmerge** — the edge was an artifact of a wrong
  `measures-same-construct-as` merge;
- (e) it **persists** → it becomes a Gap and compiles into a study brief (§5).

## 3. Two verification ladders

v1 of this document used one ladder and it was wrong twice (records and cells
are different objects; "attached replication" ranked outcome-agnostic trust).
There are two, and both measure **verifiability of the arithmetic and
robustness of the analysis — never validity of the design, and never
authenticity of the data.**

**Record ladder** (per evidence record; rungs are cumulative):

| Rung | Meaning |
|---|---|
| **R0** | text assertion (legacy paper, unreviewed LLM extraction) |
| **R1** | R0 + structured extraction with provenance quote, human-approved |
| **R2** | R1 + data manifest present; a deterministic engine reproduces the number |

**Cell dossier** (per cell; recorded facts, not a rank):

- **Probe coverage** — which probe classes (exclusion, subgroup, estimator
  swap, multiverse) have been run, with what parameters, all ledgered; plus a
  **computed fragility summary** (e.g. fraction of ledgered specs whose
  estimate crosses zero). "Probed, with results ledgered" — not "survived":
  survival language invites verification-washing (§9).
- **Replication status** — pre-registered replication *attempted, outcome
  attached*; the outcome enters the synthesis as evidence. A failed
  replication updates the cell; it does not decorate it.

The Atlas's core metric is **mass migration of the legacy corpus up the record
ladder plus probe-coverage growth on high-traffic cells** — not node count.
A 1985 PDF enters at R0 and can climb to R1 today, to R2 only if data exist,
never by magic. The map renders these states visually, so the difference
between "cited 4,000 times" and "recomputed even once" becomes visible.

## 4. The loop (five verbs)

1. **Ingest** — LLM pipelines read papers (legacy or new) and *propose*
   claims/evidence records with provenance quotes; humans approve (the
   pattern of the shipped propose→approve flow — the code generalizes it with
   schema-generic approval cards and persistence, which v0.1 does not have).
   Collection itself is ledgered: search queries, screening decisions with
   reasons — PRISMA-grade trails for agent-performed collection.
2. **Integrate** — cells re-synthesize as approved evidence arrives, under
   **pre-specified update rules with sequential correction**. Continuous
   re-synthesis with repeated significance verdicts is a known false-positive
   generator (the living-systematic-review literature's answer: trial
   sequential analysis / alpha-spending, or posterior reporting without
   repeated dichotomous verdicts). Minimum viable guardrail, consistent with
   the shipped design: every post-update re-verdict carries an *n-th-look*
   counter in the ledger. Flagged open problem (§10).
3. **Interrogate** — humans + their agents rerun, exclude, subgroup,
   multiverse; every probe lands in the cell's ledger with its parameters;
   the dossier's probe coverage and fragility summary grow.
4. **Illuminate** — the map computes Gaps (§5) and ranks them within type.
5. **Instigate** — top gaps compile into **study briefs**: draft protocols
   with design, target cell, and sample sizes powered against a
   **smallest-effect-of-interest or bias-corrected estimate** — never the
   naive pooled effect, which is upward-biased by selection (winner's curse:
   powering on it systematically underpowers the very replications the system
   instigates, whose failures then pollute the map as pseudo-contradictions).
   For coverage gaps the brief targets the model's prediction in the empty
   cell — often ≈0, i.e. an **equivalence/precision design**, not a
   superiority test. A lab picks a brief up; results enter as a living
   document; the loop closes.

## 5. Gaps — computed absence, typed

- **Estimation gap**: CI too wide / τ² high and unexplained by known
  moderators. Ranked by expected information gain given the current pooled
  estimate and its uncertainty (a Bayesian layer would sharpen this).
- **Coverage gap**: empty moderator cells. Ranked NOT by within-model
  information gain — a fitted model is often most confident exactly where it
  has never been tested — but by **model-criticism leverage**: how strongly
  the empty cell bears on the model's untested assumptions, e.g. disagreement
  across the multiverse of plausible functional forms. *Real example from the
  shipped exemplar: the 19 Pygmalion studies sample prior contact at 0–7 and
  17–24 weeks; the fitted capped-linear model (slope −0.157, cap 3) already
  predicts a dead effect everywhere ≥ ~2.6 weeks, and studies at 3, 5 and 7
  weeks sit near zero — so the untouched 8–16 band is where the model's
  flat-tail extrapolation and its cap-at-3 functional form have never met
  data. A study there is model criticism, not effect-hunting.*
- **Contradiction gap**: an operationally-defined `contradicts` edge (§2)
  with no accepted resolution.
- **Verification gap**: high-centrality claims whose records sit at R0/R1 —
  heavily cited, never recomputed. The reproducibility crisis as a map layer.
- **Replication gap**: cells with zero pre-registered replications.
- **Measurement gap**: constructs measured by a single instrument or lab
  tradition — the jingle-jangle exposure rendered queryable.

Ranking weights include claim centrality — which is therefore a Goodhart
target (§9): the edges feeding centrality carry provenance precisely so that
manufactured centrality is inspectable.

## 6. Where WebMCP is the right tool — and where it is not

WebMCP's unique property is the **shared live surface**: a human and their
agent operating the same page, every agent action visible on it. That is the
placement criterion. Bulk compute has no shared surface and belongs
server-side.

| Layer | Interface | Why |
|---|---|---|
| Living documents (R2 papers) | **WebMCP** (SHIPPED) | reader + reader's agent on one page; zero-infra publishing |
| Personal workspace (collect → approve → synthesize → export) | **WebMCP** (M1) | the approval gate *is* a human-on-the-page act |
| Atlas map UI (explore, interrogate, gap panel) | **WebMCP** | the human and agent interrogate the same live map — probes render where the human looks; as a bonus, a canvas map has no DOM to scrape, so the tool contract doubles as the map's accessible/programmatic interface |
| Corpus-scale sweeps, ingestion pipelines, enclave reruns | **server MCP / APIs** | no human co-present on a surface; efficiency wins |

Two doors, one service: at scale the Atlas UI's WebMCP tools front the same
backend as the bulk API — WebMCP wherever a human is co-present on the
surface, the server API where none is. This is SPEC v0.2's own principle
("WebMCP standardizes the interface, not the compute location") applied to
the platform itself.

Pains → what solves them: synthesis latency/staleness → living cells with
sequentially-guarded updates; un-citable AI research → ladders + ledgers at
every stage, collection included; claim-level search doesn't exist → the
evidence graph; invisible contradictions → operational contradiction objects;
research waste and file-drawer → typed gaps and public study briefs (an
unfilled, registered gap is visible).

## 7. Architecture (static-first, in adoption order)

- **Layer 0 — documents.** SHIPPED (v0.1). Static, WebMCP, anywhere.
- **Layer 1 — workspace.** M1. Static + localStorage. Personal evidence
  maps; exports Layer-0 documents. Adds collection-audit tools
  (`log_search`, `screen_source`).
- **Layer 2 — Atlas.** An *index over documents that live anywhere* — the
  Atlas indexes papers, never hosts them, though it does own the **derived
  layer** (the graph, ledgers, gap objects, syntheses). v-demo: a static
  page over a seeded JSON evidence graph, WebMCP-driven; reads
  (`search_claims`, `get_claim`, `get_contradictions`, `get_gaps`) are
  static-servable, `synthesize` runs live on the shipped engine, and
  `propose_edge` is session-local in the demo — at v-real it requires
  backend + identity. Verb correspondence into the SPEC v0.2 family:
  `get_claim` ≈ `inspect_claim` at corpus scope; `synthesize` ≈ `rerun_claim`
  at cell scope; `propose_edge` = the propose→approve pattern generalized
  from studies to edges; `get_contradictions`/`get_gaps` are new
  corpus-scoped reads extending the family.

**The recursion is the target invariant, not a shipped fact**: a workspace is
a private Atlas of one hypothesis; a document is a published workspace. v0.1
documents fall short of it in three specific ways — claims are code, not
introspectable data (no `get_analysis_spec`); the ledger is session-scoped;
there is no stable versioning. Closing exactly those three gaps is what makes
Layers 1–2 possible.

## 8. Hackathon cut (deadline 2026-09-03 13:00 PDT)

**Submission target** = the loop demonstrated end-to-end at small scale,
honestly labeled. Sequencing rule: **deploy + real-agent test of shipped
v0.1 comes first** — it is the plan's riskiest unknown (the WebMCP
registration path has never been exercised by a real agent runtime; the E2E
suite drives the public JS contract), it is user-gated (accounts, ChatGPT
desktop), and a runtime incompatibility discovered on day 4 would invalidate
everything downstream. If the real runtime surfaces breakage, fixing v0.1
outranks starting M1.

1. **v0.1 exemplar** — SHIPPED; deploy + real-agent test pending (user-gated).
2. **M1 Workspace**: collect (agent-extracted, quote-backed, human-approved,
   search/screening ledgered) → synthesize → test own claims → **export a
   living document** (closes the §7 recursion; the workspace's strongest
   judge-facing moment). Honest estimate: the propose→approve *pattern*
   generalizes; the *code* is largely new (schema-generic approval cards +
   a localStorage persistence layer v0.1 lacks). ~1.5–2 days.
3. **M2 Mini-Atlas**: static evidence-map page seeded with the
   teacher-expectancy literature plus **at most 2–3 neighboring claims taken
   from one published systematic review's extracted data table, cited inside
   the seed JSON** (provenance rendered on the node; no loosely-sourced seed
   content in a repo whose pitch is provenance). Shows: ladder-colored
   records, one operationally-defined contradiction dissolved by synthesis +
   moderated by weeks, and a Gap panel whose 8–16-week coverage gap and
   equivalence-design study brief are computed live on the page — powered by
   a **small power module written in M2** on top of the shipped engine's
   distribution functions and pooled τ² outputs (the shipped engine has no
   power routine; this is new code, ~100 lines). ~1.5 days.
4. SPEC/DESIGN as the ambition layer; every unbuilt thing labeled.

**Tripwires and kill order** (deploy + video are the floor, and both are
user-gated — schedule them early, not last): M1 must be demo-able by EOD
8/31 or M2 is killed unstarted; M2 feature-freezes EOD 9/1; 9/2 is deploy +
real-agent test + video; 9/3 is buffer only. Kill order: **M2 Mini-Atlas →
M1 collection ledger → M1 export** (export dies last — it carries the
recursion). The submission story degrades honestly at each step: without M2,
"format + workspace demonstrating Ingest/Integrate/Interrogate, with the
Atlas and gap layer as labeled design"; without M1, "v0.1 as the smallest
complete loop". §8 must remain safe to paste into Devpost at any kill level.

## 9. Risks and non-goals

- **Not a truth machine** (standing): bad designs rerun faithfully;
  fabricated data may rerun cleanly; a wrong model reruns precisely wrong.
  The ladders measure verifiability and robustness, never design validity or
  data authenticity (§3).
- **Construct identity is the hard ontology problem.** Wrong merges corrupt
  synthesis silently. Mitigations: constructs are provenance-carrying nodes;
  merges are approval-gated proposals with §2's id semantics; the map can
  always be viewed unmerged; contradiction resolution path (d) exists.
- **Sequential inference** (§4.2) is a real statistical exposure, not
  bookkeeping; unguarded living updates inflate false positives.
- **Harmonization must be ledgered** (standing, SPEC §v0.2) or cross-paper
  reruns fail silently.
- **Gaming at platform scale**: claim spam, verification-washing (trivial
  probes to farm coverage), Goodhart on centrality-fed gap ranking and on
  badges, citation-ring analogues. Mitigations sketched: probes carry
  parameters in the ledger (trivial probes are visible); probe *coverage*
  requires diverse probe classes; replication status requires
  pre-registration links and attaches outcomes; centrality-feeding edges are
  provenance-inspectable. Governance follows the OSS-maintainer model per
  cell rather than central editorial control. This section is thin — flagged
  for review.
- **Extraction rubber-stamping**: if humans approve without checking quotes,
  R1 degrades to R0 with better typography. UI must make quote-vs-record
  comparison the path of least resistance.
- **Access**: paywalled full text limits ingestion to abstracts/OA; the
  Atlas inherits, not solves, the open-access problem.

## 10. Review questions (for Codex / GPT-5.6 Sol)

v2 already adopted: cell/claim split (was Q1), two-ladder split (was Q2),
model-criticism ranking for coverage gaps (was Q3), deploy-first sequencing.
Remaining questions:

1. **Cells**: does (X→Y, P, M, C) work as an id-stable atomic unit, or does
   C (conditions) make cells unboundedly fine-grained? Where would you draw
   the granularity line in practice?
2. **Sequential guardrail**: is the n-th-look ledger counter a defensible
   MVP for living synthesis, or is anything short of TSA/Bayesian reporting
   irresponsible to ship even as a demo?
3. **Contradiction operationalization**: is interval-level incompatibility
   the right default test, and at what level? Does pairwise Q generalize
   better?
4. **WebMCP boundary** (§6): anything still claimed for WebMCP that a server
   API serves better, or vice versa?
5. **Schedule** (§8): are the tripwires realistic given the user-gated
   dependencies? What would you cut that we haven't?
6. **Gaming** (§9): cheapest attack on the dossier/probe-coverage economy?
   Does per-cell OSS-maintainer governance survive motivated actors?
7. **Legacy beachhead**: is "systematic reviews first" (pre-extracted data
   tables) the right retrofit entry point?
8. What is the design silently assuming that breaks at scale?
