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
*human* readers: sliders, Run buttons, notebooks. But more and more of a
document's readers are machines, and for them nothing changed.

That movement's high-water mark, eLife's ERA, proved the supply side: narrative
+ code + data + in-browser re-execution, published for real. It stayed niche
because the demand side was missing — authoring costs something, and human
readers rarely rerun anything. Machine readers rerun constantly. **For an agent, reading is
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

Four pages ship: the exemplar document, the authoring workspace, a read-only
literature Atlas, and the Evidence Board (12 / 15 / 10 / 11 WebMCP tools
respectively, each JSON-schema'd with read-only annotations where they apply).
Open them with your agent (ChatGPT's built-in browser, or Chrome with WebMCP)
and:

- **Claims are addressable and machine-checkable.** Ask your agent to test the
  textbook claim that "raising expectations makes children smarter" — it calls
  `evaluate_claim`, a deterministic check runs *in the page*, and a ✗ challenged
  badge appears in the prose, live. (The claim that survives is stranger: in
  these nineteen experiments the effect shows up only where teachers barely
  knew their pupils — a study-level association under an authored model, not
  a proven causal window; the document says exactly that about itself.)
- **Analyses the author never scripted.** "Re-run it without the two outliers"
  becomes `run_meta_analysis {exclude: [...]}` — forest plots, leave-one-out,
  subgroups, meta-regression, funnel/Egger diagnostics all render into the
  document's Reader's Workbench as your agent works.
- **The document never goes stale.** Your agent can `propose_study` (a
  replication published after the document was written). The page validates it,
  renders an approval card, and **nothing enters the evidence base until the
  human clicks Approve** — then the forest plot re-renders and old verdict
  badges are marked stale until re-tested.
- **Nothing is invisible.** Every analysis, verdict and mutation — agent's or
  human's — lands in an append-only, structured audit ledger on the page. A
  Tool console exposes the identical tool surface to humans, so nothing an
  agent can do is hidden from you.
- **Reading compiles into publishing.** The companion **workspace** is an
  empty document of the same format: your agent proposes studies from papers
  you give it (source + verbatim quote required; each approval pinned to a
  drift-detecting checksum of the record), you approve each one, claims get
  declarative machine checks — and
  `export_document` compiles the whole thing into a single self-contained
  HTML file: a living document anyone else can cross-examine, no server
  required.
- **The map computes what's missing.** The **mini-Atlas** indexes the
  exemplar's literature as a live evidence map — the estimand cell, six
  machine-checkable claims, nineteen records, and **gaps computed from the
  data itself**: none of the nineteen records samples the 8–16-week band of
  prior teacher–pupil contact (the collection frame is honestly marked
  unknown/not-searched — a coverage lead, not proof no such study exists),
  surfaced live with a study-brief card that lists the design inputs an
  experiment would need — filled where the evidence can fill them, named as
  unresolved where it can't, and deliberately computing **no** sample size
  from inputs that don't exist. Your agent explores it through tools; every
  probe lights up on the map you're looking at.
- **It isn't just meta-analysis.** The **Evidence Board** takes a real, messy
  ChatGPT research conversation (a conversation-reported figure putting
  Tokyo's rate of non-working wives among school-age families at Japan's
  highest) and restructures it into the format: two hypotheses, eight
  claims, twenty-three evidence extracts — every one carrying a verbatim
  conversation excerpt, its cited-source label, and an explicit *"not
  independently verified"* mark — plus the three questions that conversation
  left open. The board's diagnostics report graph structure: which claims
  carry **mixed** support-and-contradiction edges, which have **no evidence
  edges**, which rest on a **single citation label** (bookkeeping over
  active edges, explicitly not truth adjudication). Agents extend it through
  the same propose→approve gate the exemplar and workspace use. The
  conversation you had yesterday becomes a structured, provenance-carrying
  map today.

Three design rules make it trustworthy: **the page computes, the agent judges**
(no LLM arithmetic — the embedded stats engine is validated against R's
`metafor` reference output to published precision); **everything renders back
into the shared page**; **humans own the evidence base**.

### How we built it

Vanilla JS, zero dependencies, static hosting only. `document.modelContext`
registration per the W3C draft (12 exemplar / 15 workspace / 10 Atlas / 11
Board tools, JSON-schema'd, `additionalProperties:false`, read-only
annotations where they apply). A from-scratch
meta-analysis engine (REML/DerSimonian-Laird random effects, mixed-effects
meta-regression, subgroup Q-tests, leave-one-out, Egger's test, cumulative MA)
golden-tested against published metafor output; theme-aware SVG figure
renderers; claims expressed as a declarative rule AST (no code, no eval —
auditable and exportable); and six unit/real-browser Playwright suites
(650+ checks) driving the full tool contract: cross-examination, the human
approval flow, persistence, the exported document re-tested standalone with
zero network access, and golden data transcribed from the specs so that even
a tampered seed fails red. Every build round was adversarially reviewed by a
second frontier model before merging.

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

What ships today is **v0.1**: a complete living-meta-analysis loop, plus an
Evidence Board adaptation of the same provenance, diagnostics, ledger and
human-approval principles to a second genre (the Atlas is read-only) — still
the smallest *complete* loop — addressable claims, deterministic checks,
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

Target: **final encoded cut ≤ 2:50** (hard platform limit 3:00). Narration
below is ≈330 words ≈ 2:22 at 140 wpm, leaving ~28s of real interaction time —
pre-stage every page in tabs, jump-cut tool latency, and confirm pace with a
timed dry run before recording. Screen recording of the live site + ChatGPT
built-in browser; voiceover in English.

**[0:00–0:18] The problem (screen: any PDF paper, then an AI chat citing it)**
> "When an AI reads a document, it reads the words — and guesses at the
> numbers. More and more of a document's readers are machines, and almost
> nobody writes for them. So we did. This is Living Evidence: documents your
> AI can cross-examine."

**[0:18–0:40] Meet the exemplar (screen: index.html, scroll slowly)**
> "This is a real meta-analysis of the Pygmalion effect: nineteen experiments
> on whether teacher expectations raise children's IQ. Every number is
> computed in-browser from study data embedded in the page. Highlighted
> sentences are claims with deterministic checks — and a WebMCP browser hands
> the agent twelve typed tools to interrogate them."

**[0:40–1:02] Cross-examination (screen: ChatGPT built-in browser side-by-side)**
> Type: *"Cross-examine this document's claims."*
> "The agent tests the textbook claim — CHALLENGED, right in the prose:
> pooled across nineteen studies, the effect isn't significant. But one claim
> survives: in these studies the effect shows up only where teachers barely
> knew their pupils. The story doesn't collapse — it turns."

**[1:02–1:20] The document can lose (screen: c-bias claim)**
> Type: *"How solid is the publication-bias claim?"*
> "NUANCED — Egger's test p = 0.057. The document's own wording overstates
> the evidence, and its own check says so. An honest format has to be able to
> lose an argument about itself."

**[1:20–1:42] The living part (screen: propose_study → approval card)**
> Type: *"Propose this synthetic demo record: author 'Demo et al.', year 2026,
> yi 0.10, vi 0.04, weeks 2, source 'Hypothetical video-demo data note, not a
> publication', quote 'Synthetic demo: SMD 0.10, variance 0.04, two weeks of
> prior contact.'"*
> "The agent files it — nothing changes yet. The page asks ME. One click:
> nineteen studies become twenty, the forest plot re-renders, every earlier
> verdict goes stale until re-tested. Agents propose. Humans decide."

**[1:42–2:00] Build your own (screen: workspace.html, empty → populated → export)**
> "The workspace starts empty. My agent proposes studies, each with a verbatim
> quote; I approve every record. One click compiles it into a single
> self-contained file anyone can cross-examine. Reading compiles into
> publishing."

**[2:00–2:18] Board a conversation (screen: board.html — map, then diagnostics panel)**
> "And it isn't just meta-analysis. This ChatGPT research thread is now a
> board: hypotheses, claims, twenty-three quoted extracts — all marked
> unverified — and the questions the conversation left open. One call reports
> the edge patterns: what's mixed, what's unsupported. Structure, not truth."

**[2:18–2:33] The map (screen: atlas.html — the coverage gap lights up)**
> "The atlas maps the exemplar's records and computes the gap: among these
> nineteen, weeks eight to sixteen are empty — a coverage lead, not proof.
> The brief lists the missing design inputs and refuses a fake sample size."

**[2:33–2:47] Zoom out (screen: audit ledger, then SPEC)**
> "Everything ledgered. MIT, zero dependencies, static hosting. For an agent,
> reading is rerunning. This is the first page of an executable layer for
> science."

---

## Submission checklist (from Devpost rules)

- [ ] Live URL reachable via ChatGPT built-in browser / Chrome with WebMCP
- [ ] Public repo with open-source license (MIT file present ✓)
- [ ] Text description (above)
- [ ] Demo video < 3 min, public YouTube, WITH AUDIO
- [ ] Re-read official rules on the Devpost page before submitting
      (multiple entries? team bonus? eligibility fields)
- [ ] Resolve EVERY ⟨…⟩ placeholder (live URL incl. a direct /board.html
      link, repo URL, replication figures in the video beat) — grep the
      final text for ⟨ before pasting
- [ ] Confirm the ENCODED video file is under 3:00 (not just the script)
