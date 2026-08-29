# Devpost submission draft + video script

Status: DRAFT written overnight 2026-08-29 (Claude). User to review, personalize,
and paste at submission time. Placeholders marked ⟨…⟩.

---

## Devpost text

**Project name:** Living Evidence

**Tagline:** Documents your AI can cross-examine.

### Inspiration

When an AI reads a paper, a data report, or a meta-analysis today, it scrapes
prose — and then guesses at the arithmetic. The "executable papers" movement
(Jupyter, Distill, eLife's Executable Research Articles) attacked this for
*human* readers: sliders, Run buttons, notebooks. But the fastest-growing
readership of documents is machines, and for them nothing changed.

That movement's high-water mark, eLife's ERA, proved the supply side: narrative
+ code + data + in-browser re-execution, published for real. It stayed niche
because the demand side was missing — authoring costs something, and human
readers almost never rerun anything. Machine readers rerun constantly. **For an agent, reading is
rerunning.** Agents are the demand side that executable publishing has been
waiting for.

WebMCP finally gives a document a way to hand **typed tools** to whatever agent
the reader brings. We asked: what should a scientific document look like when its
primary readers include AI agents? Our answer: a document that can be
**interrogated instead of trusted**.

### What it does

Living Evidence is a document **format** (spec + dependency-free runtime +
authoring template) and one full **exemplar**: a living meta-analysis of the
Pygmalion effect — *Do teacher expectations raise students' IQ?* — carrying all
19 classic experiments as data, not citations.

Open it with your agent (ChatGPT's built-in browser, or Chrome with WebMCP) and:

- **Claims are addressable and machine-checkable.** Ask your agent to test the
  textbook claim that "raising expectations makes children smarter" — it calls
  `evaluate_claim`, a deterministic check runs *in the page*, and a ✗ challenged
  badge appears in the prose, live. (The claim that survives is stranger: the
  effect exists only in the narrow window before teachers know their pupils.)
- **Analyses the author never scripted.** "Re-run it without the two outliers"
  becomes `run_meta_analysis {exclude: [...]}` — forest plots, leave-one-out,
  subgroups, meta-regression, funnel/Egger diagnostics all render into the
  document's Reader's Workbench as your agent works.
- **The document never goes stale.** Your agent can `propose_study` (a
  replication published after the document was written). The page validates it,
  renders an approval card, and **nothing enters the evidence base until the
  human clicks Approve** — then the forest plot re-renders and old verdict
  badges are marked stale until re-tested.
- **Nothing is invisible.** Every tool call — agent's or human's — lands in an
  append-only audit ledger on the page. A Tool console exposes the identical
  tool surface to humans, so nothing an agent can do is hidden from you.

Three design rules make it trustworthy: **the page computes, the agent judges**
(no LLM arithmetic — the embedded stats engine is validated against R's
`metafor` reference output to published precision); **everything renders back
into the shared page**; **humans own the evidence base**.

### How we built it

Vanilla JS, zero dependencies, static hosting only. `document.modelContext`
registration per the W3C draft (12 tools, JSON-schema'd,
`additionalProperties:false`, read-only annotations). A from-scratch
meta-analysis engine (REML/DerSimonian-Laird random effects, mixed-effects
meta-regression, subgroup Q-tests, leave-one-out, Egger's test, cumulative MA)
golden-tested against published metafor output; theme-aware SVG figure
renderers; a Playwright E2E suite (52 checks) that drives the full tool
contract including the human approval flow.

### Challenges & what we learned

- Getting the statistics *provably* right without dependencies — the REML
  profile-likelihood estimator is validated to 4 decimal places against the
  published reference analysis of the same dataset.
- Designing the trust boundary: which verbs belong to the agent (analyze,
  evaluate, propose) and which must stay human (approve). The propose→approve
  flow, stale-badge invalidation, and the visible ledger came out of that.
- The document must be able to *lose*: one of our own claims comes back
  △ nuanced (Egger's test p = 0.057) when cross-examined. A format for honest
  documents has to demonstrate honesty against itself.

### What's next

What ships today is **v0.1**: one genre (the living meta-analysis), hand-built,
but the smallest *complete* loop — addressable claims, deterministic checks,
agent-composed re-analysis, a visible ledger, a human approval gate. Everything
below is **v0.2: a direction, not shipped software.**

**A minimal common protocol.** Generalize the contract to eight verbs any
compliant publication would answer: `list_claims`, `inspect_claim`,
`get_evidence`, `get_analysis_spec`, `rerun_claim`, `get_effect_estimate`,
`get_data_manifest`, `get_reproducibility_status`. v0.1 already carries their
embryos — `evaluate_claim` is `inspect_claim` + `rerun_claim` under the
document's own rule; `run_meta_analysis {method, exclude}` is `rerun_claim`
with parameters, for one genre. If a Nature paper, a university page, a lone
researcher's site and a data-journalism piece all look *identical* to an agent,
then questions nobody computed at publication time become askable
retroactively, across an entire literature: *"does this effect survive
restricting to age ≥ 65?"* — asked of every paper, one `rerun_claim` at a time.
And because each paper reruns the interaction inside its own data, the synthesis
sidesteps the ecological bias that today's study-level meta-regression suffers —
the protocol tightens existing practice, not just extends it.
Sensitive data never has to move: a document exposes `rerun_claim`, never
`get_raw_data`, so the computation goes to the data and only aggregates come
back. HTML standardized *displaying* documents; this would standardize
*operating on* their claims, with WebMCP as the interface layer.

**The workspace.** A researcher's hypothesis-centered Evidence Map — papers,
datasets, and their own reruns as nodes — is itself a Living Evidence document:
private and dynamic, publishable as a living review once it matures. And in
agent-mediated work, papers that can *answer* get used, cited and weighted more
than papers that can only be read. That market pressure, not a mandate, is the
realistic adoption engine.

**Peer review inverts.** "Show Figure 3 without the outliers" stops being a
letter to the authors and becomes `rerun_claim("claim-7", {exclude_outliers:
true})` — ten seconds, in the reviewer's own agent. Authors run the same battery
before submitting (v0.1's claim checks, used as self-audit). Review stops being
the first audit and becomes a check on an audit record.

**What it is not.** Not a truth machine. WebMCP does not improve a bad
experimental design; a wrong model reruns precisely wrong, and fabricated data
may rerun cleanly. This is **auditability infrastructure**: it collapses the
cost of verification, comparison and re-analysis, makes multiplicity countable
in a ledger instead of self-reported, and leaves fragile, choice-dependent
claims living under the expectation that someone's agent will eventually probe
them. It lowers the price of honesty and raises the risk of dishonesty. Science
gets faster as a *consequence* of cheap auditing — not because machines find
truth.

The near work is unglamorous and already unblocked: the claims/ledger/approval
contract is genre-independent, so other engines can sit behind the same format
(clinical-trial re-analysis, forecasting scorecards that grade themselves as
outcomes arrive, policy dashboards), and because a Living Evidence document is
just a static folder, an "arXiv overlay" of cross-examinable documents needs no
platform at all — just authors. This is not a new PDF; it is the first page of
an executable layer for science.

**Try it live:** ⟨deploy URL⟩ · **Code (MIT):** ⟨repo URL⟩

---

## 3-minute video script

Target 2:45–2:55. Screen recording of the live site + ChatGPT built-in browser;
voiceover in English. ⟨Re-time after a dry run.⟩

**[0:00–0:20] The problem (screen: any PDF paper, then an AI chat citing it)**
> "When an AI reads a document, it reads the words — and guesses at the numbers.
> The fastest-growing readership of documents is machines, and almost nobody
> writes for them. So we did. This is Living Evidence: documents your AI can
> cross-examine."

**[0:20–0:45] Meet the exemplar (screen: index.html, scroll slowly)**
> "This is a real meta-analysis — the Pygmalion effect, nineteen classic
> experiments on whether teacher expectations raise children's IQ. Every number
> here is computed in the browser from the study data embedded in the page. The
> highlighted sentences are claims — each with a deterministic check behind it.
> And in a WebMCP browser, the machine reader gets twelve typed tools to
> interrogate all of it."

**[0:45–1:20] Cross-examination (screen: ChatGPT built-in browser side-by-side)**
> Type: *"Cross-examine this document's claims."*
> "Watch the page. The agent tests the textbook claim — the one from every
> psychology course — and it comes back CHALLENGED, right there in the prose:
> pooled across all nineteen studies, the effect isn't significant. But the
> moderator claim comes back SUPPORTED: the effect appears only when teachers had
> known their pupils for less than a week. The story doesn't collapse — it turns."

**[1:20–1:45] The document can lose (screen: c-bias claim)**
> Type: *"How solid is the publication-bias claim?"*
> "NUANCED — Egger's test p = 0.057. The document's own wording overstates the
> evidence, and its own check says so. A format for honest documents has to be
> able to lose an argument about itself."

**[1:45–2:20] The living part (screen: propose_study → approval card)**
> Type: *"A new ⟨2026⟩ replication reports d = ⟨…⟩ — add it to the evidence base."*
> "The agent files the proposal. But look — nothing changes yet. The page asks
> ME. One click: the evidence base goes from nineteen studies to twenty, the
> forest plot re-renders, and every earlier verdict is marked stale until it's
> re-tested. Agents propose. Humans decide. ⟨On-screen label: demo uses a
> clearly-marked hypothetical replication.⟩"

**[2:20–2:45] Zoom out (screen: audit ledger, then template.html + SPEC)**
> "Every question left a trace — a visible, append-only ledger on the document
> itself. And this isn't one page: it's a format — MIT, zero dependencies,
> static hosting. Human readers almost never rerun anything; agents rerun
> constantly — for an agent, reading is rerunning. This is not a new PDF. It's
> the first page of an executable layer for science."

---

## Submission checklist (from Devpost rules)

- [ ] Live URL reachable via ChatGPT built-in browser / Chrome with WebMCP
- [ ] Public repo with open-source license (MIT file present ✓)
- [ ] Text description (above)
- [ ] Demo video < 3 min, public YouTube, WITH AUDIO
- [ ] Re-read official rules on the Devpost page before submitting
      (multiple entries? team bonus? eligibility fields)
