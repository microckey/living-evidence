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

The claims/ledger/approval contract is genre-independent. Next engines behind
the same format: clinical-trial re-analysis, forecasting scorecards that grade
themselves as outcomes arrive, and policy dashboards. And because a Living
Evidence document is a static folder, an "arXiv overlay" of cross-examinable
meta-analyses needs no platform at all — just authors.

**Try it live:** ⟨deploy URL⟩ · **Code (MIT):** ⟨repo URL⟩

---

## 3-minute video script

Target 2:45–2:55. Screen recording of the live site + ChatGPT built-in browser;
voiceover in English. ⟨Re-time after a dry run.⟩

**[0:00–0:20] The problem (screen: any PDF paper, then an AI chat citing it)**
> "When an AI reads a document, it reads the words — and guesses at the numbers.
> We built documents that fight back. This is Living Evidence: documents your AI
> can cross-examine."

**[0:20–0:45] Meet the exemplar (screen: index.html, scroll slowly)**
> "This is a real meta-analysis — the Pygmalion effect, nineteen classic
> experiments on whether teacher expectations raise children's IQ. Every number
> here is computed in the browser from the study data embedded in the page. The
> highlighted sentences are claims — each with a deterministic check behind it.
> And in a WebMCP browser, my AI just got twelve tools to interrogate all of it."

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
> itself. And this isn't one page: it's a format. Spec, runtime, template — MIT,
> zero dependencies, static hosting. Anyone can publish a document that can be
> cross-examined. The web's documents just learned to answer for themselves."

---

## Submission checklist (from Devpost rules)

- [ ] Live URL reachable via ChatGPT built-in browser / Chrome with WebMCP
- [ ] Public repo with open-source license (MIT file present ✓)
- [ ] Text description (above)
- [ ] Demo video < 3 min, public YouTube, WITH AUDIO
- [ ] Re-read official rules on the Devpost page before submitting
      (multiple entries? team bonus? eligibility fields)
