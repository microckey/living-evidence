# Living Evidence

**Documents your AI can cross-examine.**

Living Evidence is a web-native document format for the age of machine readers:
the page carries its **prose for humans**, its **data and analysis code**, and a
**[WebMCP](https://webmachinelearning.github.io/webmcp/) tool contract** that lets
the reader's own AI agent rerun, stress-test, and extend every analysis — with
every result rendered back into the page the human is reading.

The exemplar document is a **living meta-analysis of the Pygmalion effect**
(*Do teacher expectations raise students' IQ?* — 19 classic experiments,
Raudenbush 1984): [`index.html`](index.html).

## The problem

When an AI reads a paper or a data report today, it scrapes prose and then
*guesses at the arithmetic*. Executable-paper projects (Jupyter, Distill, eLife
ERA, Quarto) attacked reproducibility **for human hands** — sliders and Run
buttons, bounded by whatever UI the author scripted. The machine reader got
nothing: there has never been a way for a visiting agent to *operate* a document.

WebMCP changes that. A page can now hand typed tools to whatever agent the reader
brings. Living Evidence uses this to make documents that can be **interrogated
instead of trusted**:

- Ask your agent *“does the publication-bias claim actually hold?”* — it calls
  `evaluate_claim`, the deterministic check runs **in the page**, the claim gets a
  visible ✓/✗/△ badge, and the funnel plot renders into the article.
- Ask *“what happens without the two weakest studies?”* — the agent composes
  `run_meta_analysis {exclude: […]}`, an analysis the author never scripted a
  button for.
- Tell it about a **new replication published after this document** — the agent
  files `propose_study`, and nothing enters the evidence base until the human
  clicks **Approve** on the card the page renders.

Three design rules make this trustworthy rather than merely automated:

1. **The page computes, the agent judges.** Every number comes from deterministic
   page code (validated against R's `metafor`) — never from LLM arithmetic.
2. **Nothing invisible.** Every tool call appends to a visible audit ledger;
   analyses render figures into the Reader's Workbench.
3. **Humans own the evidence base.** Agents propose; humans approve.

## Try it

**With an agent (the real thing)**

- **ChatGPT desktop app** — open the live document in the built-in browser
  (WebMCP tools are discovered automatically; see “Site tools” in the address
  bar), then ask: *“Cross-examine this document’s claims.”*
- **Chrome with WebMCP** — see Chrome’s
  [WebMCP docs](https://developer.chrome.com/docs/ai/webmcp) for current
  availability (origin trial / flags).

**Without an agent** — everything an agent could do is human-operable from the
document’s **Tool console** (same tools, same schemas, same ledger). Open the
page, expand “Tool console”, run `evaluate_claim` on `c-bias`.

**Locally**

```bash
python3 -m http.server 8501 --bind 127.0.0.1   # from the repo root
# then open http://127.0.0.1:8501/
```

## What’s in the box

| Path | What it is |
|---|---|
| `index.html` | The exemplar living meta-analysis (Pygmalion effect, 19 studies) |
| `lib/living-evidence.js` | Format runtime: WebMCP registration, 12-tool contract, ledger, claim badges, approval queue, tool console |
| `lib/meta-stats.js` | Dependency-free meta-analysis engine: REML/DL random effects, fixed effects, subgroups, meta-regression, leave-one-out, Egger’s test, cumulative MA |
| `lib/meta-plots.js` | Theme-aware SVG forest / funnel / sensitivity / bubble plots |
| `lib/living-evidence.css` | Component styles (light/dark) |
| `data/raudenbush1985.js` | Study-level data, transcribed from the open [metadat](https://wviechtb.github.io/metadat/reference/dat.raudenbush1985.html) distribution |
| `template.html` | Minimal authoring skeleton with synthetic demo data |
| `docs/SPEC.md` | Format specification v0.1 |
| `verify/` | Test suites (see below) |

## Validation

- **Statistical goldens** (`verify/stats.test.mjs`): the engine reproduces the
  published `metafor` reference output for this dataset to published precision —
  pooled REML SMD 0.0837 (SE 0.0516), 95% CI [−0.0175, 0.1849], τ² 0.0188,
  I² 41.86%, Q(18) 35.83; moderator model intercept 0.407, slope −0.157, R² 100%.
- **Real-browser E2E** (`verify/e2e.mjs`, Playwright): drives the public tool
  contract end-to-end — all 12 tools, claim verdicts of all three kinds,
  proposal validation/duplicate rejection, the human approval flow (k 19→20,
  stale-badge invalidation), ledger integrity, zero page errors.

```bash
node verify/stats.test.mjs
node verify/e2e.mjs
```

## Publishing your own

A Living Evidence document is **static hosting only** — no backend, no accounts,
no platform. Copy `template.html` + `lib/`, embed your study table, mark your
claims, deploy the folder anywhere HTML can be served. See
[`docs/SPEC.md`](docs/SPEC.md).

## The bigger picture

2010s: paper + PDF. 2020s: paper + executable code and data. 2026+: paper +
executable code and data + **machine-addressable claims and agent tools**.

eLife's Executable Research Articles proved the middle step was publishable — and
showed why it stayed niche: supply without demand. Authoring cost was real, and
human readers almost never rerun anything. Machine readers rerun constantly.
**For an agent, reading is rerunning** — agents are the demand side executable
publishing has been waiting for.

Where that points — a **direction this repo is aiming at, not software that
exists** — is an *executable layer for science*: a minimal common protocol under
which a Nature paper, a university page and a lone researcher's site all look
identical to an agent, so a question nobody computed at publication time (*“does
this effect survive restricting to age ≥ 65?”*) becomes askable retroactively
across an entire literature. The v0.2 verb sketch:

`list_claims() · inspect_claim() · get_evidence() · get_analysis_spec() · rerun_claim() · get_effect_estimate() · get_data_manifest() · get_reproducibility_status()`

None of that is shipped. What ships here is v0.1 — the smallest complete loop of
that idea, hand-built for one document genre. And the ceiling is worth stating
plainly: this is **auditability infrastructure, not a truth machine**. WebMCP does
not improve experimental design — a bad design reruns faithfully, a wrong model
reruns precisely wrong. It collapses the cost of verification, comparison and
re-analysis; science gets faster as a consequence of cheap auditing, not because
machines find truth. Full direction: the v0.2 section of
[`docs/SPEC.md`](docs/SPEC.md).

## License & data

Code: MIT. Exemplar prose: CC BY 4.0. Study-level data are published statistics
from Raudenbush (1984) / Raudenbush & Bryk (1985), transcribed via the open
metadat distribution; original works © their authors.
