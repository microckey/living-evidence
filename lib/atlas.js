// atlas.js — the Living Evidence Atlas, at demo scale (M2-lite).
//
// An EVIDENCE-IMMUTABLE map over exactly one estimand cell: the 19 Pygmalion
// records and the 6 claims the exemplar document asserts about them. It is the
// Atlas *direction* (DESIGN.md §7 layer 2) shown at a scale that can be computed
// honestly in a browser tab, not a corpus-scale index.
//
// What "honest" costs here, concretely:
//   - No tool adds, removes or persists records, edges or claims. There is no
//     propose_edge, no persistence, no backend. Evidence-immutable is a property,
//     not a promise: no tool below writes to the record set. Several tools DO
//     change ephemeral page state (which node is selected, which synthesis the
//     cell displays) and append session-ledger rows — that is the shared surface,
//     and it dies with the tab.
//   - Gaps are COMPUTED from the dataset at boot (§1.3 of the M2-lite spec), never
//     typed in. The coverage band comes out of the observed `weeks` values; if the
//     data changed, the band would change with it. verify/atlas.e2e.mjs recomputes
//     it independently in node and asserts equality — that test is the reason the
//     numbers here can be believed.
//   - A study brief lists design inputs, filled and unresolved. It computes NO
//     sample size, because the inputs that would justify one do not exist and a
//     pooled tau^2 is not an outcome variance (DESIGN §4.5).
//   - The `weeks` moderator edge is labelled "moderates (candidate)": study-level,
//     observational, provisional (DESIGN §5).
//   - WebMCP is an agent adapter, not accessibility (DESIGN §6). Every node is a
//     focusable DOM element with role and aria-label; the map is operable with a
//     keyboard whether or not an agent is present.
//
// This is its own small runtime rather than a third mode of initLivingEvidence():
// the document runtime owns an evidence base that can change under human approval,
// and bolting a read-only graph onto it would blur exactly the boundary this page
// exists to demonstrate. Shared code is imported (statistics, plots, rule engine);
// the two helpers below (h, fmt) are copied deliberately.

import { metaAnalyze, leaveOneOut, subgroupAnalysis, metaRegression, eggerTest } from './meta-stats.js';
import { forestPlot } from './meta-plots.js';
import { fnv1a, evaluateRules, validateTest } from './claim-rules.js';

const $ = (sel) => document.querySelector(sel);
const NS = 'http://www.w3.org/2000/svg';

/** The evidence base of a read-only map cannot change, so every ledger entry is
 *  stamped with the same evidence version. The field stays in the envelope: an
 *  atlas ledger row has to be diffable against a document's. */
const EVIDENCE_VERSION = 1;

function h(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c) n.appendChild(c);
  return n;
}

function fmt(x, d = 3) { return typeof x === 'number' ? x.toFixed(d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : String(x); }

/** A p-value below the printed precision must never render as "0" — fmt() would
 *  turn 0.000106 into "0", which reads as an exact zero probability. Below half
 *  the last printable digit the honest string is a bound, not a number. */
function pFmt(x, d = 3) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return fmt(x, d);
  const floor = 10 ** -d;
  return x > 0 && x < floor / 2 ? `< ${floor.toFixed(d)}` : fmt(x, d);
}

/** "p = 0.105" but "p < 0.001": the relation symbol belongs to the value, so the
 *  call sites cannot emit "p = < 0.001". */
function pRel(x, d = 3, name = 'p') {
  const s = pFmt(x, d);
  return s.startsWith('<') ? `${name} ${s}` : `${name} = ${s}`;
}

function sv(name, attrs = {}, children = []) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const c of children) if (c) n.appendChild(c);
  return n;
}

function svText(str, x, y, attrs = {}) {
  const { size = 10, anchor = 'middle', cls = 'atlas-t', weight = null, halo = false } = attrs;
  const el = sv('text', {
    x, y, 'font-size': size, 'text-anchor': anchor, class: cls,
    ...(weight ? { 'font-weight': weight } : {}),
    ...(halo ? { 'paint-order': 'stroke', stroke: 'var(--le-card)', 'stroke-width': 3, 'stroke-linejoin': 'round' } : {}),
  });
  el.textContent = str;
  return el;
}

// ---------------------------------------------------------------- layout
// Deterministic hand-placed layout. Every coordinate is a constant: the same
// dataset always draws the same map, and a screenshot diff means something.

const VIEW = { w: 1000, h: 640 };
const CELL = { x: 452, y: 322, w: 236, h: 86 };
const CONSTRUCTS = {
  'construct:teacher-expectancy': { x: 300, y: 44, w: 210, h: 38 },
  'construct:pupil-iq': { x: 604, y: 44, w: 210, h: 38 },
};
const DOC = { x: 76, y: 322, w: 116, h: 54 };
const CLAIM_BOX = { w: 106, h: 26 };
// upper arc, document (lower left) → constructs (top): hand-spaced so the pills
// stair-step instead of colliding where a constant-angle arc would flatten out.
const CLAIM_XY = [[206, 318], [214, 268], [236, 219], [270, 172], [315, 129], [368, 95]];
const MOD = { x: 140, y: 406, w: 118, h: 30 };
const GAP_BOX = { w: 214, h: 74 };
const GAP_XY = [[866, 150], [866, 270], [866, 390]];
// lower fan: records ordered by weeks of prior contact, left → right
const FAN = { cx: 452, cy: 330, r: 235, a0: 158, a1: 22 };
const LEGEND = { x: 24, y: 446 };

// Fill comes from a CSS class per band, not from a fill attribute: a presentation
// attribute loses to the .atlas-shape rule, and colours must stay in the token
// system anyway (--le-accent / --le-warn / --le-muted, light and dark).
const WEEK_BANDS = [
  { id: 'w0_1', label: '≤ 1 week', test: (w) => w <= 1 },
  { id: 'w2_7', label: '2–7 weeks', test: (w) => w >= 2 && w <= 7 },
  { id: 'w17plus', label: '≥ 17 weeks', test: (w) => w >= 17 },
];
function bandOf(weeks) {
  // The three bands above are an AUTHORED display choice, not a computed one, and
  // they do not tile the number line. A record that falls outside all of them would
  // be worth seeing, so it gets its own (currently unused) colour rather than
  // silently a default one — and a label that describes the legend, not the
  // separately-computed coverage gap, which the bands are not derived from.
  return WEEK_BANDS.find((b) => b.test(weeks))
    || { id: 'unobserved', label: 'outside the legend bands', test: () => true };
}

/** Every node-id prefix the map uses, in the order a bare id is tried against them.
 *  An agent that has seen record ids in get_cell should not have to learn that the
 *  map calls the same record "rec:s10" before it can point at it. */
const ID_PREFIXES = ['rec:', 'claim:', 'gap:', 'mod:', 'construct:', 'doc:', 'cell:'];

/** What a verdict IS, said in the response that carries it (same wording as the
 *  document runtime: the two surfaces must not describe their badges differently). */
const VERDICT_SCOPE = 'authored statistical rule only — not an independent judgment of truth, validity, or bias';

const CELL_ID = 'cell:teacher-expectancy-iq';
const CELL_LABEL = 'Teacher expectancy → pupil IQ (experimentally induced; group-administered & individual IQ tests; k=19)';

export function initAtlas(config) {
  if (!config || !config.dataset || !Array.isArray(config.dataset.studies)) {
    throw new Error('initAtlas needs { dataset, claims }');
  }
  const dataset = config.dataset;
  const records = dataset.studies.map((r) => ({ ...r }));
  const claims = (config.claims || []).map((c) => {
    if (!c || !c.id) throw new Error('every entry of config.claims needs an id');
    validateTest(c.test, `claim ${c.id}`);
    return c;
  });

  const mounts = {
    map: $(config.mounts?.map || '#atlas-map'),
    panel: $(config.mounts?.panel || '#atlas-panel'),
    ledger: $(config.mounts?.ledger || '#atlas-ledger'),
    status: $(config.mounts?.status || '#atlas-status'),
    console: $(config.mounts?.console || '#atlas-console'),
  };

  // The panel's authored "nothing selected yet" prose, captured before anything
  // renders over it, so deselecting can put the page back exactly as it booted
  // rather than inventing a second placeholder string in JS.
  const panelPlaceholder = mounts.panel ? [...mounts.panel.childNodes].map((n) => n.cloneNode(true)) : [];

  const state = {
    selected: null,
    runCounter: 0,
    audit: [],
    claimStatus: new Map(), // claim id -> {verdict, reason, run}
    synthesis: null,        // {method, exclude, fit}
    lastBrief: null,
    agent: { active: false, status: 'absent', detail: 'not initialized' },
  };

  // ------------------------------------------------------------ statistics
  // Read-only analyses over a fixed record set. Same shapes as the document
  // runtime's `analyses` registry, because the SAME claim ASTs run against both:
  // a claim whose verdict depended on which page asked would be worthless.

  const included = (exclude = []) => {
    const ex = new Set(exclude);
    return records.filter((r) => !ex.has(r.id));
  };

  const analyses = {
    overall({ method = 'REML', exclude = [] } = {}) {
      const studies = included(exclude);
      if (studies.length < 2) throw new Error('fewer than 2 records after exclusions');
      return { ...metaAnalyze(studies, { method }), excluded: exclude };
    },
    loo() { return leaveOneOut(records, { method: 'REML' }); },
    subgroup({ split_field, split_at = null } = {}) {
      const allowed = { weeks: { type: 'numeric', default_split: 1 }, setting: { type: 'categorical' }, tester: { type: 'categorical' } };
      if (!(split_field in allowed)) throw new Error(`split_field must be one of: ${Object.keys(allowed).join(', ')}`);
      const spec = allowed[split_field];
      // Same guard as the document runtime: a threshold on a categorical field is
      // silently ignored by the labeller, which is worse than an error.
      if (spec.type !== 'numeric' && split_at !== null && split_at !== undefined) {
        throw new Error(`split_at is only meaningful for numeric fields; ${split_field} is categorical and splits by value — omit split_at`);
      }
      const labelOf = spec.type === 'numeric'
        ? ((at) => (r) => (r[split_field] <= at ? `${split_field} ≤ ${at}` : `${split_field} > ${at}`))(split_at === null ? spec.default_split : split_at)
        : (r) => `${split_field} = ${r[split_field]}`;
      return subgroupAnalysis(records, labelOf, { method: 'REML' });
    },
    metareg({ moderator, cap = null } = {}) {
      const allowed = ['weeks', 'year'];
      if (!allowed.includes(moderator)) throw new Error(`moderator must be one of: ${allowed.join(', ')}`);
      if (cap !== null && cap !== undefined) {
        if (!Number.isFinite(cap) || cap <= 0) throw new Error(`cap must be a number > 0 (got ${cap})`);
        if (moderator !== 'weeks') throw new Error(`cap is only accepted for moderator "weeks" (the published min(weeks, 3) model); drop cap to regress on ${moderator} untruncated`);
      }
      const xOf = (r) => (cap === null || cap === undefined ? r[moderator] : Math.min(r[moderator], cap));
      return metaRegression(records, xOf);
    },
    funnel() { return eggerTest(records); },
  };

  function runAnalysisByName(name, args) {
    const fn = analyses[name];
    if (typeof fn !== 'function') throw new Error(`unknown analysis "${name}" — available: ${Object.keys(analyses).join(', ')}`);
    return fn(args || {});
  }

  /** The cell's current (spec, result) pair. A cell never "has a number" — it has
   *  a synthesis under a named spec, which is what gets displayed and returned. */
  function synthesisOf(method = 'REML', exclude = []) {
    const fit = analyses.overall({ method, exclude });
    return {
      spec: { estimator: method, model: fit.model, excluded: [...exclude], moderators: 'none (intercept-only)' },
      k: fit.k,
      estimate: fit.estimate, ci: [fit.ci_lower, fit.ci_upper], se: fit.se, p: fit.p,
      tau2: fit.tau2, I2: fit.I2, Q: fit.Q, Q_df: fit.Q_df, Q_p: fit.Q_p,
      significant: fit.significant,
      fit,
    };
  }

  function currentSynthesis() {
    if (!state.synthesis) state.synthesis = synthesisOf('REML', []);
    return state.synthesis;
  }

  const cappedWeeksFit = () => analyses.metareg({ moderator: 'weeks', cap: 3 });

  function bandCounts() {
    const out = {};
    for (const b of WEEK_BANDS) out[b.label] = records.filter((r) => b.test(r.weeks)).length;
    return out;
  }

  // ------------------------------------------------------------------ gaps
  // §1.3: computed absence, typed. NOTHING below is a literal from the spec —
  // every number is derived from `records` (or from a live model fit), which is
  // what makes the gap cards worth reading at all.

  function coverageGap() {
    const observed = [...new Set(records.map((r) => r.weeks))].sort((a, b) => a - b);
    let widest = null;
    for (let i = 0; i < observed.length - 1; i++) {
      const span = observed[i + 1] - observed[i];
      // strict > keeps the FIRST widest span when two tie — deterministic order
      if (!widest || span > widest.span) widest = { lo: observed[i], hi: observed[i + 1], span };
    }
    const hasBand = !!widest && widest.span >= 2;
    const band = hasBand ? [widest.lo + 1, widest.hi - 1] : null;
    const reg = cappedWeeksFit();
    // where the fitted capped-linear model crosses zero: -intercept / slope
    const zero = reg.moderator.b === 0 ? null : -reg.intercept.b / reg.moderator.b;
    const zeroCrossing = zero === null ? null : Math.round(zero * 10) / 10;
    // With no interior band there is no band to sit inside: the count is 0, not
    // every record. (Reporting records.length here read as "all 19 are in the gap".)
    const inBand = hasBand ? records.filter((r) => r.weeks >= band[0] && r.weeks <= band[1]).length : 0;
    // The model's prediction for the whole band, computed rather than described:
    // under x = min(weeks, 3) EVERY raw value ≥ 3 maps to the same x, so the fitted
    // line has exactly ONE prediction for the entire empty band (and for everything
    // beyond it). Saying "predicts ≈ 0 out there" without this number hid the fact
    // that the band has no distinct prediction to test at all.
    const pred3 = Math.round((reg.intercept.b + 3 * reg.moderator.b) * 1e4) / 1e4;
    return {
      id: 'gap:coverage-weeks',
      type: 'coverage',
      dimension: 'weeks of prior teacher–pupil contact',
      title: hasBand ? `Coverage gap — prior contact ${band[0]}–${band[1]} weeks` : 'Coverage gap — none on this dimension',
      observed_values: observed,
      between_observed: hasBand ? [widest.lo, widest.hi] : null,
      empty_band: band,
      records_in_band: inBand,
      model: {
        form: 'capped linear, x = min(weeks, 3), mixed-effects REML',
        intercept: reg.intercept.b,
        slope_per_week: reg.moderator.b,
        zero_crossing_weeks: zeroCrossing,
        predicted_smd_at_x3: pred3,
        R2_percent: reg.R2_percent,
        caveat: 'R² here is a clipped boundary estimate with no uncertainty attached; the cap-at-3 functional form is an authored choice, not a fitted one.',
      },
      statement: hasBand
        ? `Observed weeks are ${observed.join(', ')}; none fall in ${band[0]}–${band[1]}. Under x = min(weeks, 3), ${zeroCrossing === null ? 'the fitted line has a flat slope and never crosses zero' : `the fitted line crosses zero near ${zeroCrossing} weeks`} and predicts approximately SMD ${pred3} for every raw value ≥ 3.`
        : 'No interior gap of two or more weeks exists in the observed values.',
      ranked_by: 'raw-moderator coverage gap; no confidence or priority ranking is inferred — because all weeks ≥ 3 map to x = 3, this band has no distinct fitted prediction under the current model.',
      collection_frame: 'unknown / not-searched. This corpus is one 1984 synthesis; an empty band may mean no such experiment was run, or that this collection never looked. That is not the same as "measured and absent".',
      brief_available: hasBand,
    };
  }

  function replicationGap() {
    // The record schema has no pre-registration field at all — so the honest count is
    // NOT zero, it is absent. Reporting 0 made an unmeasured property look measured
    // and empty; null plus an assessment_status says what actually happened.
    return {
      id: 'gap:replication',
      type: 'replication',
      title: 'Replication gap — preregistration linkage unknown',
      count_with_prereg: null,
      assessment_status: 'not_collected',
      total_records: records.length,
      statement: 'Preregistration linkage was not assessed for these records — the record schema cannot represent it. No inference about the existence of preregistered replications is available.',
      honest_framing: 'This is a property of THIS corpus and of the record schema (which has no pre-registration field), not evidence that no pre-registered replication of the Pygmalion design exists in the world. Pre-registration also postdates every record here.',
      ranked_by: 'not ranked in M2-lite — one cell, nothing to rank against',
      collection_frame: 'unknown / not-searched',
      brief_available: false,
    };
  }

  function verificationGap() {
    const withManifest = records.filter((r) => r.data_manifest).length;
    return {
      id: 'gap:verification',
      type: 'verification',
      title: 'Verification gap — no per-record data manifests',
      count_with_manifest: withManifest,
      total_records: records.length,
      statement: 'No shipped record carries a per-record source quote, approval event, or data manifest. Ladder rungs are unassigned; if R2 requires a manifest, no record can currently be certified as R2 or higher.',
      honest_framing: 'R2 = recomputable from an attached data manifest. Record rungs are unassigned in v0.1: the pooled synthesis is reproducible from the yi/vi table, but per-record quotes, approval events and data manifests do not exist for these transcribed rows. The ladder measures verifiability of the arithmetic — never design validity, never data authenticity.',
      ranked_by: 'not ranked in M2-lite',
      collection_frame: 'measured and absent — the shipped records are fully enumerated here',
      brief_available: false,
    };
  }

  const GAPS = [coverageGap(), replicationGap(), verificationGap()];
  const gapById = (id) => GAPS.find((g) => g.id === id) || null;

  // ------------------------------------------------------------ study brief
  // §1.4 / DESIGN §4.5. A brief is a structured list of the design inputs: the
  // ones the Atlas can supply, filled in and labelled for what they are, and the
  // ones it cannot, named. No sample size is computed, on purpose.

  const UNRESOLVED_INPUTS = [
    { name: 'SESOI / equivalence margin δ', why: 'the band is an equivalence question, and nothing in the corpus defines how small an IQ effect counts as none.' },
    { name: 'unit of randomization + ICC / design effect', why: 'expectancy inductions randomize pupils inside classrooms; the clustering that implies is not recorded per record.' },
    { name: 'allocation ratio', why: 'the shipped records range from balanced to roughly 1:5 expectancy:control, so no ratio can be inferred as intended design.' },
    { name: 'expected attrition', why: 'a school-year follow-up may lose pupils; the corpus reports no attrition figures.' },
    { name: 'α and target power', why: 'both are policy choices about acceptable error rates, not properties of the evidence.' },
    { name: 'IQ instrument and tester blinding', why: 'the corpus mixes group-administered and individual tests, aware and blind testers — an authored harmonization decision, not a computed one.' },
    { name: 'pre-registration venue and analysis plan', why: 'Preregistration strengthens a confirmatory model test by separating prediction from observed results; an unregistered result remains informative but exploratory.' },
  ];

  const NO_SAMPLE_SIZE_NOTE = 'No sample size is computed: the unresolved inputs above are not present in this Atlas or its corpus, and a pooled τ² is not an outcome variance.';

  function studyBrief(gapId) {
    const gap = gapById(gapId);
    if (!gap) throw new Error(`unknown gap id: ${gapId}. Call get_gaps for the three computed gaps.`);
    if (gap.id !== 'gap:coverage-weeks' || !gap.brief_available) {
      // Not an error: "this gap does not compile into a study design" is an answer,
      // and an agent should be able to ask about any of the three without a throw.
      return {
        gap_id: gap.id,
        gap_type: gap.type,
        available: false,
        brief: null,
        reason: 'no brief for this gap type in M2-lite',
        note: 'Only the coverage gap compiles into a study brief here: it is the one gap whose filling is a study design. A replication or verification gap is filled by ingestion and record work, which this evidence-immutable page does not do.',
      };
    }
    const pooled = synthesisOf('REML', []);
    const sub = analyses.subgroup({ split_field: 'weeks', split_at: 1 });
    const early = sub.groups.find((g) => String(g.group).includes('≤ 1'));
    const band = gap.empty_band;
    return {
      gap_id: gap.id,
      gap_type: gap.type,
      available: true,
      target: `${CELL_ID}, restricted to ${band[0]}–${band[1]} weeks of prior teacher–pupil contact`,
      filled_by_atlas: {
        target_cell: {
          cell_id: CELL_ID,
          label: CELL_LABEL,
          // copies: a caller must not be able to reach back into GAPS through a brief
          moderator_window: { dimension: gap.dimension, band: [...band], between_observed: gap.between_observed ? [...gap.between_observed] : null },
        },
        rationale: `A pre-registered study in this band would add raw-week coverage and could assess the authored cap-at-3 against prespecified uncapped or nonlinear alternatives, while also estimating the effect in the band.`,
        // The Atlas states what each test shape answers; it does not pick one. Naming
        // the fitted prediction for the band is the fact a designer needs — under
        // x = min(weeks, 3) it is the SAME number for every raw value ≥ 3.
        design_implication: `The Atlas cannot choose the test. If the question is practical equivalence, define a margin δ and plan an equivalence analysis; if the question is any positive effect, a superiority test answers that different question — under the current model the predicted effect in this band is ≈ ${gap.model.predicted_smd_at_x3}.`,
        current_estimates: [
          {
            label: `pooled REML over all ${pooled.k} records`,
            estimate: pooled.estimate, ci: pooled.ci, p: pooled.p, k: pooled.k,
            interpretation: 'descriptive estimate from the current corpus; the corpus’s selection process is uncharacterized, so this is neither a bound nor a justified planning value',
          },
          {
            label: '≤ 1 week of prior contact, REML subgroup',
            estimate: early ? early.estimate : null,
            ci: early ? [early.ci_lower, early.ci_upper] : null,
            p: early ? early.p : null,
            k: early ? early.k : 0,
            interpretation: 'post-hoc subgroup estimate from the same corpus; not independent validation and not a justified planning value',
          },
        ],
        tau2: pooled.tau2,
        I2: pooled.I2,
        heterogeneity_note: 'τ² and I² describe spread ACROSS these studies. Neither is the outcome variance a design calculation needs.',
      },
      unresolved_inputs: UNRESOLVED_INPUTS.map((u) => ({ ...u })),
      explicit_note: NO_SAMPLE_SIZE_NOTE,
    };
  }

  // ----------------------------------------------------------------- graph
  // Assembled once, deterministically. Node ids are the addresses the tools take.

  const sortedRecords = [...records].sort((a, b) => (a.weeks - b.weeks) || String(a.id).localeCompare(String(b.id)));
  const precisions = records.map((r) => 1 / r.vi);
  const maxPrecision = Math.max(...precisions);
  const dotR = (r) => 4.5 + 7.5 * Math.sqrt((1 / r.vi) / maxPrecision);

  const claimVerdict = (id) => state.claimStatus.get(id)?.verdict || 'untested';

  function cellAria() {
    const s = currentSynthesis();
    // A screen-reader user must hear the same caveats a sighted one reads off the
    // node: which records the number is over, and which were left out.
    const ex = s.spec.excluded.length ? `, excluding ${s.spec.excluded.join(', ')}` : '';
    return `Estimand cell. ${CELL_LABEL}. Current synthesis: ${s.spec.model}, pooled ${fmt(s.estimate)}, 95% CI ${fmt(s.ci[0])} to ${fmt(s.ci[1])}, p ${pFmt(s.p)}, I² ${fmt(s.I2, 1)}%, k ${s.k}${ex}.`;
  }

  const nodes = [];
  const nodeById = new Map();
  function addNode(n) { nodes.push(n); nodeById.set(n.id, n); return n; }

  // --- the one cell
  addNode({
    id: CELL_ID, type: 'cell', label: CELL_LABEL,
    shape: 'rect', ...CELL,
    aria: cellAria,
    detail: () => {
      const s = currentSynthesis();
      return {
        node_id: CELL_ID, type: 'cell', label: CELL_LABEL,
        relation_type: 'causal',
        // "causal" names the estimand, not a certificate. What makes it causal is the
        // assigned contrast; what could break it is listed in the same breath.
        relation_type_note: 'causal estimand — contrast of assigned expectancy induction vs no induction; causal validity depends on the original randomization, clustering, attrition and outcome-measurement assumptions.',
        exposure: 'teacher expectancy induced by false test feedback about randomly chosen pupils',
        outcome: 'pupil IQ, group-administered and individual instruments, end-of-year assessment horizon',
        population: 'school pupils in randomized expectancy-induction experiments (US, 1966–1974)',
        effect_scale: 'standardized mean difference (Hedges-type d); positive = higher measured IQ in the expectancy group than control',
        k: records.length,
        synthesis: { spec: structuredClone(s.spec), estimate: s.estimate, ci: s.ci, p: s.p, tau2: s.tau2, I2: s.I2, Q: s.Q, Q_df: s.Q_df, Q_p: s.Q_p },
        claims_attached: claims.map((c) => ({ id: c.id, verdict: claimVerdict(c.id) })),
        records_by_weeks_band: bandCounts(),
        candidate_moderators: ['weeks (prior contact) — candidate, study-level, provisional'],
        note: 'A cell never "has a number": it has a synthesis under a named spec. Re-fit it with synthesize.',
      };
    },
  });

  // --- constructs
  const CONSTRUCT_META = {
    'construct:teacher-expectancy': {
      label: 'Teacher expectancy (induced exposure)', role: 'exposure', lines: ['Teacher expectancy', 'induced exposure · X'],
      description: 'The teacher’s belief about a pupil’s expected intellectual growth, manipulated experimentally by giving teachers false test feedback about randomly selected pupils.',
      measured_by: 'not measured directly in these records — manipulation success is assumed by design, which is itself a limitation of the corpus',
    },
    'construct:pupil-iq': {
      label: 'Pupil IQ (outcome construct)', role: 'outcome', lines: ['Pupil IQ', 'outcome construct · Y'],
      description: 'Measured general intelligence at the end of the school year.',
      measured_by: 'group-administered and individually administered IQ tests, aware and blind testers — a single construct only under an authored harmonization decision (measurement gap, not scored in M2-lite)',
    },
  };
  for (const [id, geom] of Object.entries(CONSTRUCTS)) {
    const meta = CONSTRUCT_META[id];
    addNode({
      id, type: 'construct', label: meta.label, shape: 'rect', ...geom, lines: meta.lines,
      aria: () => `Construct: ${meta.label}. ${meta.role} of the estimand cell.`,
      detail: () => ({ node_id: id, type: 'construct', label: meta.label, role: meta.role, description: meta.description, measured_by: meta.measured_by, cell: CELL_ID }),
    });
  }

  // --- the exemplar document
  addNode({
    id: 'doc:pygmalion-exemplar', type: 'document', label: 'Pygmalion exemplar document',
    shape: 'rect', ...DOC, lines: ['Pygmalion', 'exemplar', 'document'],
    href: 'index.html',
    aria: () => `Document: the Pygmalion exemplar living meta-analysis. Asserts ${claims.length} claims about this cell.`,
    detail: () => ({
      node_id: 'doc:pygmalion-exemplar', type: 'document',
      title: 'Do Teacher Expectations Raise Students’ IQ? — a living meta-analysis',
      href: 'index.html',
      format: 'Living Evidence v0.1',
      asserts: claims.map((c) => c.id),
      note: 'The claims on this map are the document’s own claims, imported from the same module the document boots from (data/pygmalion-claims.js) — the map’s rules cannot drift from the document’s (one shared module), and the test suite holds the displayed sentences to the same text.',
    }),
  });

  // --- claims
  claims.forEach((c, i) => {
    const [x, y] = CLAIM_XY[i] || CLAIM_XY[CLAIM_XY.length - 1];
    addNode({
      id: `claim:${c.id}`, type: 'claim', claim: c, label: c.statement || c.id,
      shape: 'rect', x, y, w: CLAIM_BOX.w, h: CLAIM_BOX.h,
      aria: () => {
        const st = state.claimStatus.get(c.id);
        return `Claim ${c.id}: ${c.statement || c.id}. Verdict: ${st ? st.verdict : 'untested'}.`;
      },
      detail: () => {
        const st = state.claimStatus.get(c.id);
        return {
          node_id: `claim:${c.id}`, type: 'claim', claim_id: c.id,
          // a COPY of the AST: a caller that edits what it was handed must not be
          // able to rewrite the rule the next evaluation runs
          statement: c.statement || c.id, rule: c.rule, machine_check: structuredClone(c.test),
          analysis: c.test.analysis, asserted_by: 'doc:pygmalion-exemplar', about: CELL_ID,
          verdict: st ? st.verdict : 'untested',
          reason: st ? st.reason : null,
          run: st ? st.run : null,
        };
      },
    });
  });

  // --- records
  const fanStep = (FAN.a1 - FAN.a0) / (sortedRecords.length - 1 || 1);
  sortedRecords.forEach((r, i) => {
    const a = ((FAN.a0 + fanStep * i) * Math.PI) / 180;
    const x = FAN.cx + FAN.r * Math.cos(a);
    const y = FAN.cy + FAN.r * Math.sin(a);
    const band = bandOf(r.weeks);
    addNode({
      id: `rec:${r.id}`, type: 'record', record: r, label: `${r.author} (${r.year})`,
      shape: 'circle', x, y, r: dotR(r), angle: a, band,
      labelX: FAN.cx + (FAN.r + 17) * Math.cos(a), labelY: FAN.cy + (FAN.r + 17) * Math.sin(a) + 3,
      aria: () => `Evidence record ${r.id}: ${r.author} ${r.year}, ${r.weeks} week${r.weeks === 1 ? '' : 's'} of prior contact, standardized mean difference ${r.yi}, sampling variance ${r.vi}, ${r.setting === 'indiv' ? 'individual' : 'group'} testing, ${r.tester} tester.`,
      detail: () => ({
        node_id: `rec:${r.id}`, type: 'record', record_id: r.id,
        author: r.author, year: r.year,
        weeks_prior_contact: r.weeks, weeks_band: band.label,
        setting: r.setting, tester: r.tester, n1i: r.n1i, n2i: r.n2i,
        yi: r.yi, vi: r.vi, se: Math.round(Math.sqrt(r.vi) * 1e6) / 1e6,
        ci: [Math.round((r.yi - 1.96 * Math.sqrt(r.vi)) * 1e4) / 1e4, Math.round((r.yi + 1.96 * Math.sqrt(r.vi)) * 1e4) / 1e4],
        evidence_for: CELL_ID,
        provenance: 'original evidence base — transcribed from the open metadat distribution of dat.raudenbush1985 (Raudenbush 1984; Raudenbush & Bryk 1985)',
        record_ladder_rung: 'unassigned in v0.1 — no per-record source locator, approval event or data manifest exists for this row (see gap:verification)',
      }),
    });
  });

  // --- moderator
  addNode({
    id: 'mod:weeks', type: 'moderator', label: 'weeks of prior contact (candidate moderator)',
    shape: 'rect', ...MOD, lines: ['weeks · prior contact'],
    aria: () => 'Candidate moderator: weeks of prior teacher–pupil contact. Study-level, observational, provisional.',
    detail: () => {
      const reg = cappedWeeksFit();
      return {
        node_id: 'mod:weeks', type: 'moderator', field: 'weeks',
        status: 'candidate',
        fit: { form: 'x = min(weeks, 3), mixed-effects REML', slope_per_week: reg.moderator.b, p: reg.moderator.p, R2_percent: reg.R2_percent, QE_p: reg.QE_p },
        // R² = 100% is what the panel shows, so the panel has to say what it means:
        // residual tau^2 hit its lower bound, and a boundary estimate is not a
        // measurement of "explains all the heterogeneity".
        caveat: `R² = ${reg.R2_percent}% is a clipped boundary estimate (residual τ² estimated at ${fmt(reg.tau2, 4)}) with no uncertainty attached.`,
        why_candidate: 'A study-level, observational comparison across randomized experiments: the studies were not randomized to their amount of prior contact, so the moderator can stand in for anything else that differs between early and late studies. It is exposed to ecological bias until within-study interaction evidence exists, and it is not promoted to a child cell.',
        display_rule: 'the map labels this edge "moderates (candidate)" — never plain "moderates"',
      };
    },
  });

  // --- gaps
  GAPS.forEach((g, i) => {
    const [x, y] = GAP_XY[i];
    addNode({
      id: g.id, type: 'gap', gap: g, label: g.title,
      shape: 'rect', x, y, w: GAP_BOX.w, h: GAP_BOX.h,
      aria: () => `Computed gap: ${g.title}. ${g.statement}`,
      // a COPY: focus_node hands this straight to a caller, and a gap mutated
      // through that object would silently change every later get_gaps
      detail: () => structuredClone(g),
    });
  });

  // --- edges (typed; all rendered)
  const edges = [];
  for (const c of claims) {
    edges.push({ from: 'doc:pygmalion-exemplar', to: `claim:${c.id}`, type: 'asserts' });
    edges.push({ from: `claim:${c.id}`, to: CELL_ID, type: 'about' });
  }
  for (const r of records) edges.push({ from: `rec:${r.id}`, to: CELL_ID, type: 'evidence' });
  for (const id of Object.keys(CONSTRUCTS)) edges.push({ from: CELL_ID, to: id, type: 'measures', label: 'measures' });
  for (const g of GAPS) edges.push({ from: g.id, to: CELL_ID, type: 'about', dashed: true });
  // The hedge is not decoration: study-level, observational, provisional (DESIGN §5).
  edges.push({ from: 'mod:weeks', to: CELL_ID, type: 'moderates', label: 'moderates (candidate)', labelAt: [270, 356] });

  const edgeTypeCounts = edges.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {});
  const nodeTypeCounts = nodes.reduce((acc, n) => { acc[n.type] = (acc[n.type] || 0) + 1; return acc; }, {});

  // ------------------------------------------------------------ map render
  const nodeEls = new Map();
  let svgRoot = null;
  let cellEstimateEl = null;
  let cellMetaEl = null;

  function drawEdges() {
    const g = sv('g', { class: 'atlas-edges' });
    for (const e of edges) {
      const a = nodeById.get(e.from), b = nodeById.get(e.to);
      if (!a || !b) continue;
      g.appendChild(sv('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        class: `atlas-edge atlas-edge-${e.type}${e.dashed ? ' atlas-edge-dashed' : ''}`,
      }));
    }
    // edge labels last, so they sit above the lines they name
    for (const e of edges) {
      if (!e.label) continue;
      const a = nodeById.get(e.from), b = nodeById.get(e.to);
      const [lx, ly] = e.labelAt || [(a.x + b.x) / 2, (a.y + b.y) / 2 - 6];
      g.appendChild(svText(e.label, lx, ly, { size: 9.5, cls: 'atlas-t-muted', halo: true }));
    }
    return g;
  }

  function shapeFor(n) {
    if (n.shape === 'circle') {
      return sv('circle', { cx: n.x, cy: n.y, r: n.r, class: `atlas-shape atlas-dot atlas-band-${n.band.id}` });
    }
    return sv('rect', {
      x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h,
      rx: n.type === 'cell' ? 14 : 9, class: 'atlas-shape',
    });
  }

  function ringFor(n) {
    if (n.shape === 'circle') return sv('circle', { cx: n.x, cy: n.y, r: n.r + 5, class: 'atlas-ring' });
    return sv('rect', {
      x: n.x - n.w / 2 - 5, y: n.y - n.h / 2 - 5, width: n.w + 10, height: n.h + 10,
      rx: n.type === 'cell' ? 18 : 12, class: 'atlas-ring',
    });
  }

  function contentFor(n) {
    const out = [];
    if (n.type === 'cell') {
      const s = currentSynthesis();
      out.push(svText('Teacher expectancy → pupil IQ', n.x, n.y - 20, { size: 13, weight: 650 }));
      out.push(svText('estimand cell · experimentally induced', n.x, n.y - 5, { size: 9.5, cls: 'atlas-t-muted' }));
      cellEstimateEl = svText(`REML ${fmt(s.estimate)} [${fmt(s.ci[0])}, ${fmt(s.ci[1])}]`, n.x, n.y + 15, { size: 12, weight: 650, cls: 'atlas-t-accent' });
      cellMetaEl = svText(`k = ${s.k} · I² = ${fmt(s.I2, 1)}% · ${pRel(s.p)}`, n.x, n.y + 30, { size: 9.5, cls: 'atlas-t-muted' });
      out.push(cellEstimateEl, cellMetaEl);
    } else if (n.type === 'claim') {
      out.push(svText(n.claim.id, n.x - n.w / 2 + 10, n.y + 4, { size: 10.5, anchor: 'start' }));
      const badge = svText('', n.x + n.w / 2 - 10, n.y + 5, { size: 12, anchor: 'end', cls: 'atlas-claim-badge', weight: 700 });
      badge.setAttribute('data-claim-badge', n.claim.id);
      out.push(badge);
    } else if (n.type === 'record') {
      out.push(svText(n.record.id, n.labelX, n.labelY, { size: 8, cls: 'atlas-t-muted' }));
    } else if (n.type === 'gap') {
      const lines = gapMapLines(n.gap);
      out.push(svText(lines[0], n.x, n.y - 16, { size: 11, weight: 650 }));
      lines.slice(1).forEach((l, i) => out.push(svText(l, n.x, n.y + 2 + i * 14, { size: 9.5, cls: 'atlas-t-muted' })));
    } else if (n.lines) {
      const start = n.y - ((n.lines.length - 1) * 12) / 2 + 4;
      n.lines.forEach((l, i) => out.push(svText(l, n.x, start + i * 12, { size: i === 0 ? 10.5 : 9, cls: i === 0 ? 'atlas-t' : 'atlas-t-muted', weight: i === 0 ? 600 : null })));
    }
    return out;
  }

  function gapMapLines(g) {
    if (g.type === 'coverage') {
      return g.empty_band
        ? ['Coverage gap', `prior contact ${g.empty_band[0]}–${g.empty_band[1]} weeks`, `${g.records_in_band} records in the band`]
        : ['Coverage gap', 'none on this dimension', ''];
    }
    if (g.type === 'replication') {
      // "0 of 19" was a measurement the schema cannot make. The card says unknown.
      return ['Replication gap', 'Preregistration linkage unknown', `not assessed for any of the ${g.total_records} records`];
    }
    return ['Verification gap', `${g.count_with_manifest} of ${g.total_records} records carry a`, 'data manifest — none certifiable R2'];
  }

  function drawNodes() {
    const g = sv('g', { class: 'atlas-nodes' });
    for (const n of nodes) {
      const el = sv('g', {
        class: `atlas-node atlas-node-${n.type}`,
        'data-node': n.id, tabindex: '0', role: 'button', 'aria-label': n.aria(),
      });
      el.appendChild(shapeFor(n));
      el.appendChild(ringFor(n));
      for (const c of contentFor(n)) el.appendChild(c);
      el.addEventListener('click', () => focusNode(n.id, { actor: 'human' }));
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
          ev.preventDefault();
          focusNode(n.id, { actor: 'human' });
        }
      });
      nodeEls.set(n.id, el);
      g.appendChild(el);
    }
    return g;
  }

  function drawLegend() {
    const g = sv('g', { class: 'atlas-legend' });
    let y = LEGEND.y;
    g.appendChild(svText(`Evidence records (k = ${records.length})`, LEGEND.x, y, { size: 10, anchor: 'start', weight: 650 }));
    y += 17;
    for (const b of WEEK_BANDS) {
      g.appendChild(sv('circle', { cx: LEGEND.x + 6, cy: y - 3.5, r: 5.5, class: `atlas-legend-dot atlas-band-${b.id}` }));
      g.appendChild(svText(`${b.label} of prior contact — ${records.filter((r) => b.test(r.weeks)).length} records`, LEGEND.x + 18, y, { size: 9.5, anchor: 'start', cls: 'atlas-t-muted' }));
      y += 16;
    }
    // NOT "area ∝ precision": dotR is affine in sqrt(precision) with a 4.5px floor,
    // so the smallest dots are deliberately larger than proportionality would draw.
    // Wrapped by hand at the comma: one line of this length runs under the leftmost
    // record dots of the fan (~x 290 at this height), and there is no text wrapping
    // in SVG to catch that for us.
    g.appendChild(svText('dot size grows with precision (1/vi),', LEGEND.x, y + 3, { size: 9.5, anchor: 'start', cls: 'atlas-t-muted' }));
    g.appendChild(svText('floored for legibility · ordered by weeks →', LEGEND.x, y + 17, { size: 9.5, anchor: 'start', cls: 'atlas-t-muted' }));
    g.appendChild(svText('thin edges: typed relations · dashed: computed gaps', LEGEND.x, y + 33, { size: 9.5, anchor: 'start', cls: 'atlas-t-muted' }));
    return g;
  }

  function renderMap() {
    if (!mounts.map) return;
    svgRoot = sv('svg', {
      viewBox: `0 0 ${VIEW.w} ${VIEW.h}`,
      class: 'le-figure-svg atlas-map',
      role: 'group',
      'aria-label': `Evidence map: ${nodes.length} nodes and ${edges.length} typed edges around one estimand cell. Every node is focusable; press Enter to open it in the detail panel.`,
    });
    svgRoot.appendChild(drawEdges());
    svgRoot.appendChild(drawNodes());
    svgRoot.appendChild(drawLegend());
    mounts.map.replaceChildren(svgRoot);
  }

  /** Two ways out of a selection, wired once. The click handler lives on the frame
   *  rather than the <svg> so the padding around the drawing counts as background;
   *  a click that started on a node has already been handled by that node. */
  function wireDeselect() {
    mounts.map?.addEventListener('click', (ev) => {
      if (!ev.target?.closest?.('.atlas-node')) deselect();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && state.selected !== null) deselect();
    });
  }

  function updateCellNode() {
    const s = currentSynthesis();
    if (cellEstimateEl) cellEstimateEl.textContent = `${s.spec.estimator} ${fmt(s.estimate)} [${fmt(s.ci[0])}, ${fmt(s.ci[1])}]`;
    if (cellMetaEl) {
      cellMetaEl.textContent = `k = ${s.k}${s.spec.excluded.length ? ` (−${s.spec.excluded.length})` : ''} · I² = ${s.I2 === null ? 'n/a' : `${fmt(s.I2, 1)}%`} · ${pRel(s.p)}`;
    }
    nodeEls.get(CELL_ID)?.setAttribute('aria-label', cellAria());
  }

  const GLYPH = { supported: '✓', challenged: '✗', nuanced: '△' };

  function updateClaimNode(claimId) {
    const st = state.claimStatus.get(claimId);
    const el = nodeEls.get(`claim:${claimId}`);
    if (!el || !st) return;
    const badge = el.querySelector(`[data-claim-badge="${claimId}"]`);
    if (badge) {
      badge.textContent = GLYPH[st.verdict] || '?';
      badge.setAttribute('class', `atlas-claim-badge atlas-verdict-${st.verdict}`);
    }
    el.setAttribute('aria-label', nodeById.get(`claim:${claimId}`).aria());
  }

  function selectNode(id) {
    const n = nodeById.get(id);
    if (!n) throw new Error(`unknown node id: ${id}`);
    state.selected = id;
    for (const [nid, el] of nodeEls) el.classList.toggle('atlas-selected', nid === id);
    svgRoot?.classList.add('atlas-has-selection');
    renderPanel(id);
    return n;
  }

  /** Escape (or a click on empty map background) puts the map back to its booted
   *  state. Deliberately NOT ledgered and NOT a tool: closing a panel is not an act
   *  on the evidence, and a ledger that fills with "user pressed Escape" is a worse
   *  audit trail than one that does not. */
  function deselect() {
    state.selected = null;
    for (const el of nodeEls.values()) el.classList.remove('atlas-selected');
    svgRoot?.classList.remove('atlas-has-selection');
    if (mounts.panel) mounts.panel.replaceChildren(...panelPlaceholder.map((n) => n.cloneNode(true)));
  }

  // ----------------------------------------------------------------- panel
  function kv(pairs) {
    return h('table', { class: 'atlas-kv' }, [
      h('tbody', {}, pairs.filter(Boolean).map(([k, v]) => h('tr', {}, [h('th', { text: k }), h('td', { text: String(v) })]))),
    ]);
  }

  function panelCard(kicker, title, children) {
    return h('div', { class: 'atlas-card' }, [
      h('div', { class: 'atlas-kicker', text: kicker }),
      h('h3', { class: 'atlas-card-title', text: title }),
      ...children,
    ]);
  }

  function verdictChip(verdict) {
    const label = { supported: '✓ supported', challenged: '✗ challenged', nuanced: '△ nuanced' }[verdict] || '· untested';
    return h('span', { class: `le-chip le-chip-${verdict} atlas-chip`, text: label });
  }

  function cellPanel() {
    const s = currentSynthesis();
    const studies = included(s.spec.excluded);
    const rows = studies.map((r) => ({
      label: `${r.author} (${r.year})`,
      yi: r.yi, lo: r.yi - 1.96 * Math.sqrt(r.vi), hi: r.yi + 1.96 * Math.sqrt(r.vi),
      weight: 1 / (r.vi + (s.tau2 || 0)),
    }));
    const fig = h('div', { class: 'atlas-figure' });
    fig.appendChild(forestPlot(rows, { label: `Pooled (${s.spec.estimator})`, est: s.estimate, lo: s.ci[0], hi: s.ci[1] }, { width: 660 }));
    return panelCard('Estimand cell', 'Teacher expectancy → pupil IQ', [
      h('p', { class: 'atlas-lede', text: CELL_LABEL }),
      kv([
        ['synthesis spec', `${s.spec.model}${s.spec.excluded.length ? `, excluding ${s.spec.excluded.join(', ')}` : ''}`],
        ['pooled estimate', `${fmt(s.estimate)} [${fmt(s.ci[0])}, ${fmt(s.ci[1])}], ${pRel(s.p)}`],
        ['heterogeneity', `τ² = ${fmt(s.tau2, 4)} · I² = ${s.I2 === null ? 'n/a' : `${fmt(s.I2, 1)}%`} · Q(${s.Q_df}) = ${fmt(s.Q, 2)}, ${pRel(s.Q_p, 4)}`],
        // The band counts are over ALL records, the k is over the synthesis — saying
        // so explicitly, because "k = 18 · 8 at ≤ 1 …" invited adding 18 and 19 up.
        ['records', `k = ${s.k} of ${records.length} in cell · bands (all ${records.length} records): ${WEEK_BANDS.map((b) => bandCounts()[b.label]).join(' / ')}`],
        ['claims attached', claims.map((c) => `${c.id} (${claimVerdict(c.id)})`).join(', ')],
      ]),
      fig,
      h('p', { class: 'atlas-note', text: 'A cell never “has a number”: it has a synthesis under a named spec. Re-fit it with synthesize (REML / DL / FE, optional exclusions) — from an agent or from the tool console.' }),
    ]);
  }

  function claimPanel(n) {
    const c = n.claim;
    const st = state.claimStatus.get(c.id);
    return panelCard('Claim', c.id, [
      h('p', { class: 'atlas-lede' }, [h('span', { class: 'le-claim', text: c.statement || c.id }), verdictChip(st ? st.verdict : 'untested')]),
      kv([
        ['rule', c.rule],
        ['machine check', `${c.test.analysis}(${JSON.stringify(c.test.args || {})})`],
        ['asserted by', 'doc:pygmalion-exemplar'],
        ['about', CELL_ID],
        st ? ['verdict reason', st.reason] : null,
        st ? ['evaluated at', `run #${st.run}`] : null,
      ]),
      h('details', { class: 'atlas-ast' }, [
        h('summary', { text: 'the machine-check AST an agent reads before trusting the verdict' }),
        h('pre', { class: 'le-console-out', text: JSON.stringify(c.test, null, 2) }),
      ]),
      h('button', {
        class: 'le-btn', text: st ? 'Re-evaluate this claim' : 'Evaluate this claim',
        onclick: () => { try { invokeTool('evaluate_claim', { claim_id: c.id }, { actor: 'human' }); } catch (e) { console.warn(e); } },
      }),
    ]);
  }

  function recordPanel(n) {
    const d = n.detail();
    return panelCard('Evidence record', `${d.author} (${d.year})`, [
      kv([
        ['record id', d.record_id],
        ['prior contact', `${d.weeks_prior_contact} week${d.weeks_prior_contact === 1 ? '' : 's'} — ${d.weeks_band}`],
        ['setting / tester', `${d.setting === 'indiv' ? 'individual' : 'group'} · ${d.tester}`],
        ['group sizes', `${d.n1i} expectancy / ${d.n2i} control`],
        ['effect', `SMD ${d.yi} (variance ${d.vi}, SE ${fmt(d.se, 3)})`],
        ['95% CI', `[${fmt(d.ci[0])}, ${fmt(d.ci[1])}]`],
        ['evidence for', d.evidence_for],
        ['provenance', d.provenance],
      ]),
      h('p', { class: 'atlas-note', text: `Record ladder: ${d.record_ladder_rung}` }),
    ]);
  }

  function gapPanel(n) {
    const g = n.gap;
    const body = [
      h('p', { class: 'atlas-lede', text: g.statement }),
      kv([
        ['type', g.type],
        g.assessment_status ? ['assessment status', g.assessment_status] : null,
        g.dimension ? ['dimension', g.dimension] : null,
        g.empty_band ? ['empty band', `${g.empty_band[0]}–${g.empty_band[1]} weeks (between observed ${g.between_observed[0]} and ${g.between_observed[1]})`] : null,
        g.observed_values ? ['observed values', g.observed_values.join(', ')] : null,
        // R² is quoted here so the caveat note below has a visible referent; and a
        // flat fit has no crossing point, so that clause has to be able to vanish.
        // The prediction is quoted, not rounded to "≈ 0": under the cap every raw
        // value ≥ 3 shares this one number, and that is the point of the card.
        g.model ? ['fitted model', `${g.model.form}; slope ${g.model.slope_per_week}/week, intercept ${g.model.intercept}, R² = ${g.model.R2_percent}%`
          + (g.model.zero_crossing_weeks === null ? ' — the fitted slope is flat, so the model has no zero crossing' : ` → crosses zero near ${g.model.zero_crossing_weeks} weeks, predicting SMD ${g.model.predicted_smd_at_x3} for every raw value ≥ 3`)] : null,
        ['ranked by', g.ranked_by],
        ['collection frame', g.collection_frame],
      ]),
      g.honest_framing ? h('p', { class: 'atlas-note', text: g.honest_framing }) : null,
      g.model ? h('p', { class: 'atlas-note', text: g.model.caveat }) : null,
    ];
    if (g.brief_available) {
      body.push(h('button', {
        class: 'le-btn', text: 'Compile the study brief',
        onclick: () => { try { invokeTool('get_study_brief', { gap_id: g.id }, { actor: 'human' }); } catch (e) { console.warn(e); } },
      }));
    }
    return panelCard('Computed gap', g.title, body.filter(Boolean));
  }

  function briefCard(brief) {
    if (!brief || brief.brief === null) {
      return panelCard('Study brief', 'No brief for this gap', [h('p', { class: 'atlas-lede', text: brief.reason }), h('p', { class: 'atlas-note', text: brief.note })]);
    }
    const f = brief.filled_by_atlas;
    return panelCard('Study brief', `A study in the ${f.target_cell.moderator_window.band[0]}–${f.target_cell.moderator_window.band[1]}-week band`, [
      h('p', { class: 'atlas-lede', text: f.rationale }),
      h('h4', { class: 'atlas-h4', text: 'Filled in by the Atlas' }),
      kv([
        ['target', brief.target],
        ['design implication', f.design_implication],
        ...f.current_estimates.map((e) => [e.label, `${fmt(e.estimate)} ${e.ci ? `[${fmt(e.ci[0])}, ${fmt(e.ci[1])}]` : ''} (k = ${e.k}) — ${e.interpretation}`]),
        ['heterogeneity', `τ² = ${fmt(f.tau2, 4)}, I² = ${f.I2 === null ? 'n/a' : `${fmt(f.I2, 1)}%`}`],
      ]),
      h('h4', { class: 'atlas-h4', text: 'Unresolved — the Atlas cannot supply these' }),
      h('ul', { class: 'atlas-list' }, brief.unresolved_inputs.map((u) => h('li', {}, [
        h('strong', { text: u.name }), h('span', { text: ` — ${u.why}` }),
      ]))),
      h('p', { class: 'atlas-explicit-note', text: brief.explicit_note }),
      h('p', { class: 'atlas-note', text: f.heterogeneity_note }),
    ]);
  }

  function simplePanel(n) {
    const d = n.detail();
    const kicker = { construct: 'Construct', document: 'Document', moderator: 'Candidate moderator' }[n.type] || n.type;
    const body = [];
    if (n.type === 'document') {
      body.push(h('p', { class: 'atlas-lede' }, [
        h('span', { text: 'The living document this map indexes: ' }),
        h('a', { href: d.href, text: d.href }),
      ]));
      body.push(kv([['format', d.format], ['asserts', d.asserts.join(', ')]]));
      body.push(h('p', { class: 'atlas-note', text: d.note }));
    } else if (n.type === 'construct') {
      body.push(h('p', { class: 'atlas-lede', text: d.description }));
      body.push(kv([['role', d.role], ['measured by', d.measured_by], ['cell', d.cell]]));
    } else {
      body.push(h('p', { class: 'atlas-lede', text: d.why_candidate }));
      body.push(kv([
        ['status', d.status],
        ['fit', `${d.fit.form}: slope ${d.fit.slope_per_week}/week (p = ${d.fit.p}), R² = ${d.fit.R2_percent}%`],
        ['residual heterogeneity', `QE p = ${d.fit.QE_p}`],
        ['display rule', d.display_rule],
      ]));
      body.push(h('p', { class: 'atlas-note', text: d.caveat }));
    }
    return panelCard(kicker, n.label, body);
  }

  function renderPanel(id) {
    if (!mounts.panel) return;
    const n = nodeById.get(id);
    if (!n) return;
    const cards = [];
    if (n.type === 'cell') cards.push(cellPanel());
    else if (n.type === 'claim') cards.push(claimPanel(n));
    else if (n.type === 'record') cards.push(recordPanel(n));
    else if (n.type === 'gap') {
      cards.push(gapPanel(n));
      if (state.lastBrief && state.lastBrief.gap_id === n.gap.id) cards.push(briefCard(state.lastBrief));
    } else cards.push(simplePanel(n));
    mounts.panel.replaceChildren(...cards);
  }

  // ---------------------------------------------------------------- ledger
  let currentActor = 'agent';

  function renderLedgerRow(entry) {
    if (!mounts.ledger) return null;
    const row = h('li', {
      class: `le-ledger-row le-${entry.actor}`,
      title: `digest ${entry.result_digest || '—'} · inputs ${JSON.stringify(entry.inputs)}`,
    }, [
      h('span', { class: 'le-run', text: `#${entry.run}` }),
      h('span', { class: 'le-actor', text: String(entry.actor).toUpperCase() }),
      h('span', { class: 'le-summary', text: entry.summary }),
    ]);
    mounts.ledger.appendChild(row);
    return row;
  }

  /** Same envelope as the document runtime's ledger, so the two are diffable:
   *  {run, time, actor, kind, tool, inputs, summary, evidence_version, result_digest}. */
  function ledger({ kind, tool, summary, actor = null, inputs = null, result = undefined }) {
    const n = ++state.runCounter;
    const entry = {
      run: n,
      time: new Date().toISOString(),
      actor: actor || currentActor,
      kind,
      tool,
      inputs: inputs == null ? {} : inputs,
      summary,
      evidence_version: EVIDENCE_VERSION,
      result_digest: result === undefined ? null : fnv1a(JSON.stringify(result)),
    };
    state.audit.push(entry);
    const row = renderLedgerRow(entry);
    // Scroll the LEDGER's own box, never the page. row.scrollIntoView() walks every
    // scrollable ancestor including the document, so a click on the map — with the
    // ledger far below the fold — yanked the reader ~545px away from the map they
    // had just clicked. The ledger is `overflow-y: auto`; that is the box to move.
    if (row && mounts.ledger) mounts.ledger.scrollTop = mounts.ledger.scrollHeight;
    return n;
  }

  // ----------------------------------------------------------------- verbs

  /** Accept the bare id as well as the map's node id: 's10' and 'rec:s10' name the
   *  same thing, and so do 'c-window'/'claim:c-window', 'coverage-weeks'/'gap:…'.
   *  Returns the canonical node id, or null when nothing matches. */
  function resolveNodeId(raw) {
    const id = String(raw ?? '').trim();
    if (!id) return null;
    if (nodeById.has(id)) return id;
    for (const p of ID_PREFIXES) if (nodeById.has(p + id)) return p + id;
    return null;
  }

  function focusNode(rawId, opts = {}) {
    const nodeId = resolveNodeId(rawId);
    const n = nodeId ? nodeById.get(nodeId) : null;
    if (!n) {
      throw new Error(`unknown node id: ${rawId}. Call atlas_overview or list_nodes for the ids; both the node id and the bare id work (rec:s10 or s10, claim:c-window or c-window, gap:coverage-weeks or coverage-weeks, mod:weeks or weeks, ${CELL_ID}, doc:pygmalion-exemplar).`);
    }
    selectNode(nodeId);
    const detail = n.detail();
    ledger({
      kind: 'navigation', tool: 'focus_node', actor: opts.actor || null,
      inputs: { node_id: nodeId }, result: { node_id: nodeId, type: n.type },
      summary: `focused ${nodeId} — ${n.type} · ${String(n.label).slice(0, 70)}`,
    });
    return {
      node_id: nodeId,
      // the bare address alongside the node address, so a caller can round-trip
      // whichever form it started from
      bare_id: nodeId.includes(':') ? nodeId.slice(nodeId.indexOf(':') + 1) : nodeId,
      requested_id: String(rawId),
      type: n.type,
      selected: true,
      detail,
      note: 'The human’s map now shows this node selected and its detail panel open — your exploration is visible on their screen.',
    };
  }

  function evaluateClaim(rawClaimId) {
    // 'claim:c-window' is the node id, 'c-window' is the claim id; both point here.
    const claimId = String(rawClaimId ?? '').replace(/^claim:/, '');
    const c = claims.find((x) => x.id === claimId);
    if (!c) throw new Error(`unknown claim id: ${rawClaimId}. Use list_claims.`);
    const result = evaluateRules(c.test, runAnalysisByName, `claim ${c.id}`);
    const run = ledger({
      kind: 'claim', tool: 'evaluate_claim', inputs: { claim_id: claimId },
      result: { claim_id: claimId, verdict: result.verdict, reason: result.reason },
      summary: `claim ${claimId} → ${result.verdict.toUpperCase()} (${result.reason})`,
    });
    state.claimStatus.set(claimId, { verdict: result.verdict, reason: result.reason, run });
    updateClaimNode(claimId);
    selectNode(`claim:${claimId}`);
    return {
      claim_id: claimId, node_id: `claim:${claimId}`,
      statement: c.statement || claimId,
      verdict: result.verdict, status: result.verdict,
      verdict_scope: VERDICT_SCOPE,
      rule: c.rule, machine_check: structuredClone(c.test), reason: result.reason,
      evidence: result.evidence,
      evidence_version: EVIDENCE_VERSION,
      note: 'The verdict glyph is now on the claim’s node on the map, and the claim is open in the detail panel.',
    };
  }

  function synthesize({ method = 'REML', exclude = [] } = {}) {
    if (!['REML', 'DL', 'FE'].includes(method)) throw new Error(`method must be REML, DL or FE (got ${method})`);
    const list = Array.isArray(exclude) ? exclude.map((x) => String(x).replace(/^rec:/, '')) : [];
    const unknown = list.filter((id) => !records.some((r) => r.id === id));
    if (unknown.length) throw new Error(`unknown record id(s): ${unknown.join(', ')} — record ids look like s04 (or rec:s04)`);
    if (records.length - new Set(list).size < 2) throw new Error('excluding those records leaves fewer than 2 — a synthesis needs at least 2 records');
    const s = synthesisOf(method, list);
    state.synthesis = s;
    updateCellNode();
    selectNode(CELL_ID);
    ledger({
      kind: 'analysis', tool: 'synthesize', inputs: { method, exclude: list },
      result: { estimate: s.estimate, ci: s.ci, tau2: s.tau2, I2: s.I2, k: s.k, method },
      summary: `synthesis ${s.spec.model}, k=${s.k}${list.length ? `, excluding ${list.join(', ')}` : ''} → ${fmt(s.estimate)} [${fmt(s.ci[0])}, ${fmt(s.ci[1])}], ${pRel(s.p)}`,
    });
    return {
      cell_id: CELL_ID, spec: structuredClone(s.spec), k: s.k,
      excluded: [...list], excluded_node_ids: list.map((id) => `rec:${id}`),
      estimate: s.estimate, ci: s.ci, se: s.se, p: s.p, significant: s.significant,
      tau2: s.tau2, I2: s.I2, Q: s.Q, Q_df: s.Q_df, Q_p: s.Q_p,
      note: 'The cell node and the detail panel on the human’s map now show this synthesis. It is a (spec, result) pair — cite both. It changes only the displayed synthesis; the record set is untouched, and evaluate_claim still runs over all records.',
    };
  }

  function getStudyBrief(rawGapId) {
    // 'coverage-weeks' and 'gap:coverage-weeks' are the same address.
    const asked = String(rawGapId ?? '');
    const gapId = gapById(asked) ? asked : (gapById(`gap:${asked}`) ? `gap:${asked}` : asked);
    const brief = studyBrief(gapId);
    state.lastBrief = brief;
    const node = nodeById.get(gapId);
    if (node) selectNode(gapId);
    ledger({
      kind: 'brief', tool: 'get_study_brief', inputs: { gap_id: gapId },
      result: brief,
      summary: brief.brief === null
        ? `study brief for ${gapId} → none (no brief for this gap type in M2-lite)`
        : `study brief compiled for ${gapId} — ${brief.filled_by_atlas.current_estimates.length} filled estimates, ${brief.unresolved_inputs.length} unresolved inputs, no sample size`,
    });
    return brief;
  }

  // ----------------------------------------------------------------- tools
  const tools = [
    {
      name: 'atlas_overview', readOnly: true,
      description: 'Orientation for agents: what this evidence map is, how big the graph is, the one estimand cell’s current synthesis, the honesty labels that constrain what the map may claim, and which tool to reach for. Call this first.',
      inputSchema: { type: 'object', properties: {} },
      run() {
        const s = currentSynthesis();
        return {
          page: 'Living Evidence Atlas — mini (M2-lite)',
          what_this_is: 'An evidence map over ONE estimand cell: the 19 Pygmalion records and the 6 claims the exemplar document asserts about them. Nothing here adds, removes or persists evidence; what a tool can change is the view.',
          graph: {
            nodes: nodes.length, edges: edges.length,
            node_types: nodeTypeCounts, edge_types: edgeTypeCounts,
            node_id_forms: ['cell:<slug>', 'claim:<claim id>', 'rec:<record id>', 'gap:<type>', 'construct:<slug>', 'doc:<slug>', 'mod:<field>'],
          },
          cell: { id: CELL_ID, label: CELL_LABEL, synthesis: { spec: structuredClone(s.spec), estimate: s.estimate, ci: s.ci, p: s.p, tau2: s.tau2, I2: s.I2 } },
          verdict_scope: VERDICT_SCOPE,
          suite_context: {
            you_are_here: 'atlas',
            exemplar: 'index.html — the populated exemplar: a filled evidence base and six claims, the fastest cross-examination demo.',
            workspace: 'workspace.html — the authoring surface: an empty page in the fixed SMD template that an agent fills and a human approves.',
            atlas: 'atlas.html — this page: the evidence map, for node and gap inspection over the same records and claims. No tool here changes the evidence.',
          },
          suggested_flow: [
            'atlas_overview — orientation (this call)',
            'list_nodes — every addressable id, grouped by type',
            'evaluate_claim {claim_id: "c-textbook"} — a claim loses on the map',
            'synthesize {exclude: ["s04"]} — re-fit the cell without one record',
            'get_gaps, then get_study_brief {gap_id: "gap:coverage-weeks"}',
          ],
          honesty: [
            'Demo scale: ONE literature, one estimand cell. This is the Atlas direction, not a corpus-scale index.',
            'EVIDENCE-IMMUTABLE: no tool adds, removes, or persists records, edges, or claims. evaluate_claim, synthesize, get_study_brief and focus_node change ephemeral page/UI state and append session-ledger entries. Page state is per-page and per-session; nothing propagates to the exemplar or workspace pages.',
            `A verdict reports ${VERDICT_SCOPE}.`,
            'No dossier scores and no numeric power or sample size: a study brief lists design inputs, filled and unresolved.',
            'The weeks moderator is a CANDIDATE — study-level, observational, provisional. Its edge says so.',
            'Record verification rungs are unassigned in v0.1; no per-record data manifests exist.',
            'Gaps are computed from THIS collection frame. "unknown / not-searched" is a distinct state from "measured and absent".',
            'All statistics come from the page: deterministic code validated against R metafor for this dataset — all published reference values (the REML fit and the capped-weeks meta-regression) reproduced to published precision; this checks numerical reproduction against the reference implementation, not the data or model assumptions. Use tool results when reporting page state. Independent calculations are welcome as checks — label them external and do not silently substitute them for the page’s result.',
          ],
          tools: tools.map((t) => ({ name: t.name, read_only: !!t.readOnly, description: t.description })),
          guidance: [
            'get_cell for the synthesis and what hangs off it; list_nodes for every addressable id; list_claims for the machine-checkable rules; get_gaps for computed absence.',
            'evaluate_claim, synthesize, get_study_brief and focus_node all render into the page the human is reading, and are ledgered. Pure reads (atlas_overview, get_cell, list_nodes, list_claims, get_gaps, get_audit_log) are not.',
            'focus_node is the shared surface: the node you focus is the node they see selected. It takes the node id or the bare id (rec:s10 or s10).',
          ],
        };
      },
    },
    {
      name: 'get_cell', readOnly: true,
      description: 'Everything hanging off the one estimand cell: its canonical definition, the live synthesis (spec + result), heterogeneity, the claims attached to it and the record counts per band of prior teacher–pupil contact.',
      inputSchema: {
        type: 'object',
        properties: {
          cell_id: { type: 'string', const: CELL_ID, description: `optional, and only this value: the map holds exactly one estimand cell (${CELL_ID})` },
        },
      },
      run: (a = {}) => {
        if (a.cell_id && a.cell_id !== CELL_ID) throw new Error(`unknown cell id: ${a.cell_id}. This map holds exactly one cell: ${CELL_ID}`);
        return nodeById.get(CELL_ID).detail();
      },
    },
    {
      name: 'list_claims', readOnly: true,
      description: `The claims asserted about this cell, each with its human-readable rule, its declarative machine-check AST (data, not code — read it before deciding whether a verdict means anything) and its current verdict state. A verdict reports ${VERDICT_SCOPE}.`,
      inputSchema: { type: 'object', properties: {} },
      run: () => ({
        cell_id: CELL_ID,
        verdict_scope: VERDICT_SCOPE,
        claims: claims.map((c) => {
          const st = state.claimStatus.get(c.id);
          return {
            id: c.id, node_id: `claim:${c.id}`,
            // copies, never the live ASTs the evaluator runs
            statement: c.statement || c.id, rule: c.rule, machine_check: structuredClone(c.test),
            status: st ? st.verdict : 'untested',
            reason: st ? st.reason : null,
          };
        }),
      }),
    },
    {
      name: 'evaluate_claim',
      description: `Run the deterministic machine check behind one claim against the live records. It ALWAYS reruns the claim’s stored AST over the FULL record set — it does not inherit synthesize’s exclusions. The claim’s node on the map gets a verdict glyph (✓ supported / ✗ challenged / △ nuanced) and opens in the detail panel; the call is ledgered. This is the cross-examination verb, and the verdict reports ${VERDICT_SCOPE}.`,
      inputSchema: { type: 'object', properties: { claim_id: { type: 'string', description: 'claim id from list_claims, e.g. c-textbook (the node form claim:c-textbook is accepted too)' } }, required: ['claim_id'] },
      run: (a = {}) => evaluateClaim(a.claim_id),
    },
    {
      name: 'get_gaps', readOnly: true,
      description: 'The three typed gaps this map computes from the records themselves: a coverage gap along the weeks-of-prior-contact dimension, a replication gap and a verification gap. Each carries its collection frame — computed absence is not the same as "not searched".',
      inputSchema: { type: 'object', properties: {} },
      run: () => ({
        cell_id: CELL_ID,
        // copies: this is a read tool, and a read must not be a way to write
        gaps: structuredClone(GAPS),
        note: 'Observed values, estimates and derived gap bounds are computed from the current records under authored gap definitions and model specifications; changing either can change the result.',
      }),
    },
    {
      name: 'get_study_brief',
      description: 'Compile a gap into a prospective study-design brief: the design inputs the Atlas can supply, filled in and labelled for what they are, plus the ones it cannot, named. It computes NO sample size — the inputs that would justify one are not present in this Atlas or its corpus, and a pooled τ² is not an outcome variance. Gaps without a brief return {available: false, reason}, not an error. Renders the brief as a card in the detail panel; ledgered.',
      inputSchema: {
        type: 'object',
        properties: {
          gap_id: {
            type: 'string',
            enum: ['gap:coverage-weeks', 'gap:replication', 'gap:verification'],
            description: 'gap id from get_gaps; only gaps whose get_gaps entry has brief_available:true compile — currently gap:coverage-weeks',
          },
        },
        required: ['gap_id'],
      },
      run: (a = {}) => getStudyBrief(a.gap_id),
    },
    {
      name: 'focus_node',
      description: 'Select a node on the map the human is looking at and open it in the detail panel, returning that node’s full detail object. This is the shared surface: your exploration is visible on their screen. Changes only which node is selected — no record, edge or claim is touched. Ledgered as navigation.',
      inputSchema: { type: 'object', properties: { node_id: { type: 'string', description: 'node id or bare id — rec:s10 or s10, claim:c-window or c-window, gap:coverage-weeks or coverage-weeks (see list_nodes)' } }, required: ['node_id'] },
      run: (a = {}) => focusNode(a.node_id),
    },
    {
      name: 'synthesize',
      description: 'Re-fit the cell under a named spec: method REML or DL random-effects, or FE common-effect (FE assumes one common effect; tau2 is null by model assumption, not estimated as zero). p is a two-sided test of the pooled effect against zero. Optional record exclusions. Changes only the displayed synthesis (cell node + panel) — the record set is untouched and evaluate_claim does not inherit the exclusions; ledgered. Excluding down to fewer than 2 records is an error, not a silent empty fit.',
      inputSchema: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['REML', 'DL', 'FE'], description: 'tau² estimator / model: REML or DL random-effects, FE common-effect (default REML)' },
          exclude: { type: 'array', items: { type: 'string' }, description: 'record ids to leave out, bare or node form, e.g. ["s04"] or ["rec:s04"]' },
        },
      },
      run: (a = {}) => synthesize(a),
    },
    {
      name: 'list_nodes', readOnly: true,
      description: 'Every addressable node on the map, grouped by type, with its label — the id directory for focus_node. Record entries carry {record_id, node_id, author, year, weeks, yi, vi} so a record can be picked without a second call. Pure read: not ledgered, nothing on the human’s screen changes.',
      inputSchema: { type: 'object', properties: {} },
      run: () => {
        const grouped = {};
        for (const n of nodes) {
          (grouped[n.type] ||= []).push(n.type === 'record'
            ? {
              record_id: n.record.id, node_id: n.id, label: n.label,
              author: n.record.author, year: n.record.year, weeks: n.record.weeks,
              yi: n.record.yi, vi: n.record.vi,
            }
            : { node_id: n.id, label: n.label });
        }
        return {
          cell_id: CELL_ID,
          counts: { ...nodeTypeCounts, total: nodes.length },
          id_forms: 'focus_node accepts the node id or the bare id (rec:s10 or s10).',
          nodes: grouped,
        };
      },
    },
    {
      name: 'get_audit_log', readOnly: true,
      description: 'Return this page’s append-only audit ledger: every claim verdict, synthesis, brief and navigation in this session, in order. Each entry is {run, time, actor (human|agent|system), kind, tool, inputs, summary, evidence_version, result_digest}. result_digest is a non-cryptographic FNV-1a checksum for detecting accidental payload changes, not tamper evidence. The ledger is session-local: it lives in this page for this visit and is not published, synced or shared.',
      inputSchema: { type: 'object', properties: {} },
      run: () => ({ entries: state.audit }),
    },
  ];

  const TITLES = {
    atlas_overview: 'Atlas overview', get_cell: 'Estimand cell', list_claims: 'List claims',
    evaluate_claim: 'Evaluate a claim', get_gaps: 'Computed gaps', get_study_brief: 'Prospective study-design brief',
    focus_node: 'Focus a node', synthesize: 'Re-fit the cell',
    list_nodes: 'List map nodes', get_audit_log: 'Audit ledger',
  };
  for (const t of tools) {
    t.title = TITLES[t.name] || t.name;
    if (t.inputSchema && t.inputSchema.additionalProperties === undefined) t.inputSchema.additionalProperties = false;
  }

  /** One entry point for WebMCP execute(), the tool console and the e2e suite.
   *  opts.actor says who is calling, so the ledger attributes honestly. */
  function invokeTool(name, args = {}, opts = {}) {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`unknown tool: ${name}`);
    const previousActor = currentActor;
    currentActor = opts.actor || 'agent';
    try {
      return tool.run(args || {});
    } finally {
      currentActor = previousActor;
    }
  }

  // -------------------------------------------------------- WebMCP + status
  async function registerWebMCP() {
    const mc = (typeof document !== 'undefined' && document.modelContext)
      || (typeof navigator !== 'undefined' && navigator.modelContext) || null;
    if (!mc || typeof mc.registerTool !== 'function') {
      state.agent = {
        active: false, status: 'absent', registered: 0, total: tools.length,
        failed: tools.map((t) => t.name),
        detail: 'No WebMCP runtime (document.modelContext) in this browser.',
      };
      return state.agent;
    }
    const failed = [];
    for (const t of tools) {
      try {
        await mc.registerTool({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: !!t.readOnly },
          execute: async (inputs) => invokeTool(t.name, inputs ?? {}, { actor: 'agent' }),
        });
      } catch (e) {
        failed.push(t.name);
        console.warn(`[atlas] registerTool(${t.name}) failed:`, e);
      }
    }
    const total = tools.length;
    const ok = total - failed.length;
    if (failed.length === 0) {
      state.agent = { active: true, status: 'active', registered: ok, total, failed: [], detail: `${ok}/${total} tools registered with the browser’s WebMCP runtime.` };
    } else if (ok === 0) {
      state.agent = { active: false, status: 'absent', registered: 0, total, failed, detail: `The WebMCP runtime rejected all ${total} tool registrations.` };
    } else {
      state.agent = { active: false, status: 'degraded', registered: ok, total, failed, detail: `Only ${ok}/${total} tools registered — failed: ${failed.join(', ')}.` };
    }
    return state.agent;
  }

  function renderStatus() {
    if (!mounts.status) return;
    const a = state.agent;
    const text = {
      active: `Agent interface active — ${a.detail} Your AI can explore this map with you.`,
      degraded: `Agent interface DEGRADED — ${a.detail} Any question that needs a missing tool cannot be answered by your agent; run those from the Tool console below.`,
      absent: `Agent interface inactive — ${a.detail} You can still drive every tool by hand from the Tool console below, and every node on the map is clickable and keyboard-operable.`,
    }[a.status] || `Agent interface inactive — ${a.detail}`;
    mounts.status.replaceChildren(
      h('span', { class: `le-status-dot ${a.active ? 'le-on' : 'le-off'}` }),
      h('span', { text }),
    );
  }

  // ---------------------------------------------------------- tool console
  function renderConsole() {
    if (!mounts.console) return;
    const out = h('pre', { class: 'le-console-out', text: 'Pick a tool, edit the arguments, press Run. Everything an agent could do on this map, you can do by hand — same tools, same ledger, same map.' });
    const argBox = h('textarea', { class: 'le-console-args', rows: 4, spellcheck: 'false' });
    const sel = h('select', { class: 'le-console-select' }, tools.map((t) => h('option', { value: t.name, text: t.name })));
    const EXAMPLES = {
      atlas_overview: {}, get_cell: {}, list_claims: {}, list_nodes: {}, get_audit_log: {},
      evaluate_claim: { claim_id: claims[0]?.id || 'c-textbook' },
      get_gaps: {},
      get_study_brief: { gap_id: 'gap:coverage-weeks' },
      focus_node: { node_id: 'rec:s10' },
      synthesize: { method: 'REML' },
    };
    const fill = () => { argBox.value = JSON.stringify(EXAMPLES[sel.value] ?? {}, null, 1); };
    const desc = h('div', { class: 'le-console-desc' });
    const updateDesc = () => { desc.textContent = tools.find((t) => t.name === sel.value)?.description || ''; };
    sel.addEventListener('change', () => { fill(); updateDesc(); });
    fill(); updateDesc();
    const btn = h('button', {
      class: 'le-btn', text: 'Run tool',
      onclick: () => {
        try {
          const args = argBox.value.trim() ? JSON.parse(argBox.value) : {};
          out.textContent = JSON.stringify(invokeTool(sel.value, args, { actor: 'human' }), null, 2);
        } catch (e) { out.textContent = `ERROR: ${e.message}`; }
      },
    });
    mounts.console.replaceChildren(h('div', { class: 'le-console-row' }, [sel, btn]), desc, argBox, out);
  }

  // ------------------------------------------------------------------ boot
  currentSynthesis();
  renderMap();
  wireDeselect();
  renderConsole();
  ledger({
    kind: 'init', tool: 'init', actor: 'system',
    inputs: { dataset: dataset.id ?? null, nodes: nodes.length, edges: edges.length },
    result: { nodes: nodes.length, edges: edges.length, synthesis: currentSynthesis().estimate, gaps: GAPS.map((g) => g.id) },
    summary: `atlas loaded — ${nodes.length} nodes, ${edges.length} edges, 1 cell (k=${records.length}), ${GAPS.length} computed gaps`,
  });
  const ready = registerWebMCP().then((a) => { renderStatus(); return a; });

  const api = {
    version: '0.1.0',
    mode: 'atlas',
    tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, readOnly: !!t.readOnly })),
    invokeTool,
    graph: { nodes: nodes.map((n) => ({ id: n.id, type: n.type })), edges: edges.map((e) => ({ from: e.from, to: e.to, type: e.type })) },
    gaps: GAPS,
    state, ready,
  };
  if (typeof window !== 'undefined') window.LivingEvidenceAtlas = api;
  return api;
}
