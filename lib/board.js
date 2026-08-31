// board.js — the Living Evidence Board (docs/BOARD-SPEC.md, frozen 2026-08-31).
//
// A visual board of hypotheses, claims, evidence, mechanisms and open
// questions, extracted from messy research and managed under the format's
// rules: propose -> human approve, quotes required for evidence, everything
// ledgered, computed (never fabricated) diagnostics. It is DESIGN.md v3 §7's
// Evidence Map (Layer 1), first concrete cut — a generalization of the
// document/workspace runtime (lib/living-evidence.js) beyond the SMD genre,
// and a mutable sibling of the read-only Atlas (lib/atlas.js).
//
// Honesty rules carried over from the rest of the suite, non-negotiable:
//   - The board has NO statistics engine and issues NO verdicts. A claim's
//     evidence_edge_state is edge bookkeeping over active edges (preloaded
//     seed + human-approved additions) — not truth adjudication — and every
//     surface that shows it says so (TALLY_SCOPE).
//   - Seeded evidence is agent-extracted from a conversation, not
//     independently verified: every seed evidence node carries the
//     SEED_VERIFICATION label and a cited_as; the UI renders that label on
//     every evidence panel. `kind` is likewise only ever "source kind as
//     reported in the conversation (unverified)."
//   - Mutations only through propose -> approve (a human card), quotes
//     required for evidence, everything ledgered with the M1 envelope.
//
// This module is data-model + tools only (stage 1). It exports pure
// functions (validateEdgeShape, computeTally, computeBoardDiagnostics,
// resolveBareId) that a headless test can call with no DOM, and a stateful
// initBoard(config) that boots the tool surface, ledger, console and
// localStorage persistence. It renders NO map and NO detail panel — every
// render function that touches a mount checks the mount exists first and
// no-ops otherwise, so this file boots and serves every tool even when
// board.html (stage 2) has not wired the map/panel mounts yet.

import { fnv1a } from './claim-rules.js';

const $ = (sel) => document.querySelector(sel);
const NS = 'http://www.w3.org/2000/svg';

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

// copied deliberately from lib/atlas.js (its own header explains why: shared
// code is imported, these two primitives are copied) — same contract here.
function sv(name, attrs = {}, children = []) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const c of children) if (c) n.appendChild(c);
  return n;
}

function svText(str, x, y, attrs = {}) {
  const { size = 10, anchor = 'middle', cls = 'atlas-t', weight = null } = attrs;
  const el = sv('text', {
    x, y, 'font-size': size, 'text-anchor': anchor, class: cls,
    ...(weight ? { 'font-weight': weight } : {}),
  });
  el.textContent = str;
  return el;
}

/** Truncate a label for a map node's small fixed-width box; the full text is
 *  always in the aria-label and the detail panel — this is display-only. */
function truncateLabel(s, n) {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

// ------------------------------------------------------------- constants

/** Same string as data/housewife-board-seed.js — kept as a literal here too
 *  (rather than importing it) because this module must stay generic over
 *  whatever seed a caller hands initBoard, while still being able to
 *  recognize "this evidence node still carries the ORIGINAL seed label" for
 *  display purposes (get_board_diagnostics' unverified count no longer keys
 *  off this string — see PROPOSED_VERIFICATION_LABEL and D6 below). */
export const SEED_VERIFICATION_LABEL = 'unverified — extracted from a ChatGPT research conversation (2026-08); the cited primary sources were not independently checked';

/** [D6] Stored on an evidence node's `verification` field the moment a human
 *  approves it — an agent proposing evidence right now is vouching for a
 *  citation the board has not independently checked either, just via a
 *  different route (session proposal vs. the 2026-08 seed conversation).
 *  Distinct string from SEED_VERIFICATION_LABEL so the two provenances stay
 *  visually distinguishable in the panel. */
export const PROPOSED_VERIFICATION_LABEL = '(proposed this session — not independently verified)';

/** What evidence_edge_state IS, said everywhere it is shown (BOARD-SPEC.md
 *  §0/§1, renamed under the Codex-review fix round D2). */
export const TALLY_SCOPE = 'edge bookkeeping over active edges (preloaded seed + human-approved additions) — not truth adjudication';

/** What get_board_diagnostics computes, said in the response that carries it
 *  (renamed from DISCOVERIES_NOTE under D1/D5). */
export const DIAGNOSTICS_NOTE = "computed from the board's active nodes and edges (preloaded seed + human-approved additions) under the endpoint/type compatibility matrix — bookkeeping over what the board contains, not an assessment of the literature.";

export const NODE_TYPES = ['hypothesis', 'claim', 'evidence', 'mechanism', 'question'];
export const EDGE_TYPES = ['supports', 'contradicts', 'part-of', 'tests', 'refines'];
export const EVIDENCE_KINDS = ['official-stat', 'survey', 'regression', 'study'];

/** BOARD-SPEC.md §1's validity matrix, as data: for each edge type, the
 *  [fromType, toType] pairs it may legally connect. Anything else is an
 *  error naming this matrix — nothing here is enforced by convention only.
 *
 *  [v1 ruling, Fable 2026-08-31, BOARD-SPEC.md §1]: supports/contradicts now
 *  also allows evidence→hypothesis directly — §6 named five such edges while
 *  this matrix originally omitted the pair, an internal spec contradiction
 *  the build correctly surfaced instead of silently violating. Direct
 *  evidence bearing on a hypothesis is scientifically natural (e-1995
 *  contradicting the pure-selection reading is the board's single most
 *  instructive structure); claim tallies are unaffected since the new pair
 *  touches hypotheses, which carry no tally. */
export const EDGE_MATRIX = {
  supports: [['evidence', 'claim'], ['claim', 'hypothesis'], ['evidence', 'hypothesis']],
  contradicts: [['evidence', 'claim'], ['claim', 'hypothesis'], ['evidence', 'hypothesis']],
  'part-of': [['mechanism', 'hypothesis']],
  tests: [['question', 'claim'], ['question', 'hypothesis']],
  refines: [['hypothesis', 'hypothesis']],
};

const MATRIX_TEXT = 'supports/contradicts: evidence→claim, claim→hypothesis, or evidence→hypothesis; part-of: mechanism→hypothesis; tests: question→claim or question→hypothesis; refines: hypothesis→hypothesis';

// ---------------------------------------------------------------- layout
// §3: deterministic SVG map layout. Type columns left→right (hypotheses,
// mechanisms, claims, evidence, questions); within a column, nodes are
// vertically ordered by a two-pass barycenter over already-placed upstream
// targets, then packed into a legible non-overlapping stack. The stack is
// never squeezed to fit a fixed band — squeezing is exactly what would
// reintroduce overlap — so the vertical EXTENT of the drawing is computed
// FROM the layout instead of the layout being forced into a fixed extent
// (see computeLayout's return: {positioned, width, height}). That is also
// why this is more honest for a board that grows by approval: a fixed
// viewBox tuned to fit today's 40 seed nodes would start overlapping the
// first time an agent's proposal is approved into a crowded column. Width
// stays fixed (five fixed columns); height is data-driven. The spec's
// "viewBox ≈ 1200×760" is the width and the seed's own resulting height —
// documented as the one layout deviation the "≈" leaves room for.
export const BOARD_WIDTH = 1220;
const COL_X = { hypothesis: 160, mechanism: 395, claim: 635, evidence: 905, question: 1115 };
const TOP_MARGIN = 60;
const LEGEND_HEIGHT = 150;
const NODE_SIZE = {
  hypothesis: { w: 232, h: 80, rx: 16 },
  mechanism: { w: 196, h: 42, rx: 9 },
  claim: { w: 196, h: 40, rx: 20 },
  evidence: { w: 168, h: 22, rx: 5 },
  question: { w: 168, h: 38, rx: 8 },
};
const MIN_PITCH = { mechanism: 54, claim: 64, evidence: 26, question: 70 };
const HYP_PITCH = 260; // hypotheses are few and structurally central; give their own column room to breathe

/** Pool-adjacent-violators: the least-squares non-decreasing sequence for
 *  desired values `d` (minimizes sum((y_i-d_i)^2) subject to y_1<=y_2<=...).
 *  Adjacent "violating" blocks are merged and replaced by their (weighted)
 *  mean; a single left-to-right sweep with a stack suffices — this is the
 *  standard algorithm, not a bespoke heuristic. */
function isotonicNonDecreasing(d) {
  const stack = []; // [{ sum, w, start, end }], one per pooled block
  for (let i = 0; i < d.length; i++) {
    let block = { sum: d[i], w: 1, start: i, end: i };
    while (stack.length && stack[stack.length - 1].sum / stack[stack.length - 1].w > block.sum / block.w) {
      const prev = stack.pop();
      block = { sum: prev.sum + block.sum, w: prev.w + block.w, start: prev.start, end: block.end };
    }
    stack.push(block);
  }
  const y = new Array(d.length);
  for (const b of stack) {
    const mean = b.sum / b.w;
    for (let i = b.start; i <= b.end; i++) y[i] = mean;
  }
  return y;
}

/** One column's y-coordinates: `scored` is [{n, bary}] pre-sorted ascending
 *  by bary. Reduced to isotonic regression by the standard substitution
 *  d'_i = bary_i - i*pitch: the non-decreasing least-squares fit to d' is
 *  the closest-to-desired stack with AT LEAST `pitch` between consecutive
 *  nodes once i*pitch is added back. This is what correctly separates
 *  several distinct clusters (many evidence nodes sharing one claim's y,
 *  another cluster sharing a different claim's y) instead of a naive
 *  forward-sweep-and-shift, which cascades distortion from one cluster into
 *  the next (proven wrong against this seed: evidence overflowed the 600px
 *  band to 900+px before this was PAVA'd). A final translate (never a
 *  re-squeeze, which is exactly the operation that would reintroduce
 *  overlap — this returns an UNCLAMPED sequence; computeLayout fits the
 *  drawing's extent to the union of every column's result afterward,
 *  rather than fitting every column into a band decided in advance. */
function resolveColumnY(scored, pitch) {
  const n = scored.length;
  if (n === 0) return [];
  const dPrime = scored.map((s, i) => s.bary - i * pitch);
  const yPrime = isotonicNonDecreasing(dPrime);
  return yPrime.map((v, i) => v + i * pitch);
}

/** Ids `id` points AT via an edge of one of `types`, restricted to the
 *  UPSTREAM direction only (id is always the edge's `from`). This is what
 *  keeps the two passes below acyclic: a claim's position is pulled toward
 *  the hypothesis it asserts something about, never toward the evidence
 *  pointing into it — feeding evidence's (not-yet-placed) position back into
 *  its claim's barycenter is exactly the bug an earlier version of this
 *  function had (evidence overflowed the column by 300+px because a
 *  symmetric neighbor average let noisy, not-yet-meaningful evidence
 *  positions drag claims around, which then dragged evidence again). */
function upstreamTargets(id, edges, types) {
  const out = [];
  for (const e of edges) if (e.from === id && types.includes(e.type)) out.push(e.to);
  return out;
}

/** Pure layout over one (nodes, edges) snapshot. Returns
 *  { positioned, width, height, legendY }: positioned nodes (original
 *  fields + x, y, w, h, rx), the fixed drawing width, the height the
 *  content actually needs, and the y at which the legend band starts — no
 *  DOM here at all.
 *
 *  Two passes, strictly dependency-ordered (never a node's position feeding
 *  back into something that already fed it):
 *    pass 1 — mechanisms and claims, each barycentered ONLY over the
 *             hypothesis they point at (part-of / supports|contradicts),
 *             which is already fixed. This is §3's "group claims under the
 *             hypothesis they connect to most."
 *    pass 2 — evidence, barycentered over the claim(s) it points at
 *             (now fixed by pass 1) — §3's "evidence sorted to sit near its
 *             claims" — and questions, over whichever claim/hypothesis their
 *             `tests` edge targets (both already fixed).
 *  Every column (hypotheses included) is placed in an UNBOUNDED coordinate
 *  space first (only relative spacing is enforced); only at the very end
 *  does one global translate fit the union of every node's extent under a
 *  fixed top margin, and the content height is read off that same union —
 *  never the reverse. Forcing hypotheses to sit at whatever a fixed band's
 *  edges happened to be, before their dependent claims/evidence had a
 *  chance to ask for room to spread, is what caused the fixed-band version
 *  of this function to blow claims 180px past their band on this exact
 *  seed; unbounded-then-fit does not have that failure mode by
 *  construction. */
export function computeLayout(nodes, edges) {
  const byType = (t) => nodes.filter((n) => n.type === t).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const y = new Map();

  const hyps = byType('hypothesis');
  hyps.forEach((n, i) => y.set(n.id, i * HYP_PITCH));

  function placeColumn(type, edgeTypes) {
    const list = byType(type);
    const fallback = hyps.length ? (hyps.length - 1) * HYP_PITCH / 2 : 0;
    const scored = list.map((n) => {
      const targets = upstreamTargets(n.id, edges, edgeTypes).map((id) => y.get(id)).filter((v) => v !== undefined);
      const bary = targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : fallback;
      return { n, bary };
    });
    scored.sort((a, b) => a.bary - b.bary || (a.n.id < b.n.id ? -1 : a.n.id > b.n.id ? 1 : 0));
    const ys = resolveColumnY(scored, MIN_PITCH[type]);
    scored.forEach((s, i) => y.set(s.n.id, ys[i]));
  }

  placeColumn('mechanism', ['part-of']); // pass 1
  placeColumn('claim', ['supports', 'contradicts']); // pass 1 (claim -> hypothesis half of this edge type)
  placeColumn('evidence', ['supports', 'contradicts']); // pass 2 (evidence -> claim half)
  placeColumn('question', ['tests']); // pass 2

  const raw = nodes.map((n) => ({ ...n, x: COL_X[n.type], y: y.get(n.id), ...NODE_SIZE[n.type] }));
  if (raw.length === 0) return { positioned: [], width: BOARD_WIDTH, height: TOP_MARGIN + LEGEND_HEIGHT, legendY: TOP_MARGIN };

  const top = Math.min(...raw.map((n) => n.y - n.h / 2));
  const bottom = Math.max(...raw.map((n) => n.y + n.h / 2));
  const shift = TOP_MARGIN - top;
  const positioned = raw.map((n) => ({ ...n, y: n.y + shift }));
  const legendY = bottom + shift + 26;
  const height = legendY + LEGEND_HEIGHT;
  return { positioned, width: BOARD_WIDTH, height, legendY };
}

/** Node-id address forms a caller may use, tried in this order against the
 *  bare id — mirrors atlas.js's ID_PREFIXES / resolveNodeId exactly, just
 *  with this board's five node types instead of the atlas's map-specific
 *  prefixes. Seed ids already read as "h-selection", "c-gap", "e-mukyo" etc,
 *  so the TYPED form is "hypothesis:h-selection" and the BARE form is the id
 *  itself — get_node/list_nodes/get_edges/focus_node all accept either. */
const TYPED_ID_RE = /^(hypothesis|claim|evidence|mechanism|question):(.+)$/;

/** Strip a "type:" prefix if present; otherwise return the string unchanged.
 *  Pure — does not check whether the resulting bare id actually exists. */
export function normalizeId(raw) {
  const s = String(raw ?? '').trim();
  const m = TYPED_ID_RE.exec(s);
  return m ? m[2] : s;
}

/** Resolve a caller-supplied id (bare or "type:bare") against a Set/Map of
 *  known bare ids. Returns the bare id, or null if nothing matches. Pure —
 *  callers pass in whatever id universe they have (seed+approved, or seed
 *  +approved+pending) rather than this function reaching into board state. */
export function resolveBareId(raw, knownIds) {
  const has = (id) => (knownIds instanceof Map ? knownIds.has(id) : knownIds.has(id));
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (has(s)) return s;
  const bare = normalizeId(s);
  if (bare !== s && has(bare)) return bare;
  return null;
}

// -------------------------------------------------------- validity matrix

/** Throws an error NAMING THE MATRIX (BOARD-SPEC.md §1) when `type` may not
 *  connect a `fromType` node to a `toType` node. Returns true otherwise. */
export function validateEdgeShape(type, fromType, toType) {
  if (!EDGE_TYPES.includes(type)) {
    throw new Error(`unknown edge type "${type}" — must be one of ${EDGE_TYPES.join(', ')}`);
  }
  const ok = EDGE_MATRIX[type].some(([f, t]) => f === fromType && t === toType);
  if (!ok) {
    throw new Error(`invalid edge: ${type} from ${fromType} to ${toType} is not allowed by the endpoint/type compatibility matrix — it checks node types, not inferential validity (${MATRIX_TEXT}).`);
  }
  return true;
}

// -------------------------------------------------------- computed tally

/** BOARD-SPEC.md §1: a claim's evidence_edge_state is computed over
 *  evidence->claim edges of type supports/contradicts, and NOTHING else —
 *  not claim->hypothesis edges, not pending proposals. `edges` should be the
 *  board's current ACTIVE edge list; `typeOf(id)` returns a node's type or
 *  undefined. Pure — no DOM, no board state, just data in.
 *
 *  [D2, Codex-review fix round] Four MUTUALLY EXCLUSIVE, EXHAUSTIVE states —
 *  every (supports, contradicts) pair lands in exactly one:
 *    none              — supports === 0 && contradicts === 0
 *    support_only      — supports >= 1 && contradicts === 0
 *    contradiction_only — supports === 0 && contradicts >= 1
 *    mixed             — supports >= 1 && contradicts >= 1
 *  The pre-D2 three-state scheme (supported/contested/unsupported) folded
 *  contradiction_only into "contested" alongside mixed, which is why the
 *  board's own diagnostics could not tell "evidence disputes this and
 *  nothing supports it" apart from "evidence is split" — the very case a
 *  claim with only disputing evidence needed its own bucket for. */
export function computeTally(claimId, edges, typeOf) {
  let supports = 0;
  let contradicts = 0;
  for (const e of edges) {
    if (e.to !== claimId) continue;
    if (e.type !== 'supports' && e.type !== 'contradicts') continue;
    if (typeOf(e.from) !== 'evidence') continue;
    if (e.type === 'supports') supports += 1; else contradicts += 1;
  }
  let state;
  if (supports === 0 && contradicts === 0) state = 'none';
  else if (supports >= 1 && contradicts === 0) state = 'support_only';
  else if (supports === 0 && contradicts >= 1) state = 'contradiction_only';
  else state = 'mixed';
  return { state, supports, contradicts, scope: TALLY_SCOPE };
}

// ---------------------------------------------------------------- gaps
// §2: the discovery machinery. Every number below is derived from `nodes`
// and `edges` as handed in — nothing here is typed in, which is what makes
// the panel worth reading at all.

/** cited_as for an evidence node, wherever it currently lives on the object
 *  (top-level for every node this module creates; provenance.cited_as as a
 *  fallback for anything constructed a different way). */
function citedAsOf(node) {
  return node?.cited_as ?? node?.provenance?.cited_as ?? null;
}

function verificationOf(node) {
  return node?.verification ?? node?.provenance?.verification ?? null;
}

/** [D6] Whether an evidence node carries an explicit `verified: true` flag.
 *  No tool in this build ever sets that flag — there is no verification
 *  workflow yet, only the propose/approve flow that admits a node onto the
 *  board — so unverified_evidence_count is, correctly, every evidence node
 *  today (seed AND human-approved alike). Defined structurally (absence of
 *  the flag) rather than by matching a specific label string, so it counts
 *  correctly the day a verification workflow actually exists. */
function isVerified(node) {
  return node?.verified === true;
}

export const SINGLE_CITATION_SCOPE = 'all supporting evidence shares one exact nonempty cited_as label — a string-identity check, NOT a source-independence assessment';
export const TEST_COVERAGE_SCOPE = 'test-plan coverage (a question node linked by a tests edge), not tests performed';

/** Live computation over one (nodes, edges) snapshot — ACTIVE (seed +
 *  human-approved) only; pending proposals are not part of the board yet,
 *  exactly as evidence_edge_state ignores them. Pure — no DOM, no ledger, no
 *  board_version; initBoard's get_board_diagnostics tool adds board_version
 *  to the response.
 *
 *  [D1, Codex-review fix round] Renamed from computeDiscoveries, and every
 *  bucket enriched from bare id lists to inspectable {id,label,...} objects
 *  so an agent does not have to round-trip through get_node just to read a
 *  claim's own label. claims_with_contradiction_only_edges is NEW — the
 *  pre-D2 three-state tally folded it into "contested" (see computeTally's
 *  doc comment), so this state existed on the board but had no bucket that
 *  could report it. */
export function computeBoardDiagnostics(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const typeOf = (id) => byId.get(id)?.type;

  const claims = nodes.filter((n) => n.type === 'claim');
  const hypotheses = nodes.filter((n) => n.type === 'hypothesis');
  const questions = nodes.filter((n) => n.type === 'question');
  const evidenceNodes = nodes.filter((n) => n.type === 'evidence');

  const tallies = new Map(claims.map((c) => [c.id, computeTally(c.id, edges, typeOf)]));

  const claims_with_mixed_edge_labels = claims
    .filter((c) => tallies.get(c.id).state === 'mixed')
    .map((c) => ({ id: c.id, label: c.label, support_count: tallies.get(c.id).supports, contradict_count: tallies.get(c.id).contradicts }));

  const claims_with_contradiction_only_edges = claims
    .filter((c) => tallies.get(c.id).state === 'contradiction_only')
    .map((c) => ({ id: c.id, label: c.label, contradict_count: tallies.get(c.id).contradicts }));

  const claims_without_incoming_evidence_edges = claims
    .filter((c) => tallies.get(c.id).state === 'none')
    .map((c) => ({ id: c.id, label: c.label }));

  // single_supporting_citation_label_claims: every SUPPORTING evidence node
  // behind a claim carries the SAME exact, nonempty cited_as string. This is
  // a STRING-IDENTITY check over the cited_as label (SINGLE_CITATION_SCOPE)
  // — it does not and cannot assess whether the underlying sources are
  // actually independent. A claim with zero supporting evidence is not
  // "single citation label" — it is already in
  // claims_without_incoming_evidence_edges (or, if it also has contradicts,
  // in claims_with_contradiction_only_edges).
  const single_supporting_citation_label_claims = [];
  for (const c of claims) {
    const supporters = edges
      .filter((e) => e.to === c.id && e.type === 'supports' && typeOf(e.from) === 'evidence')
      .map((e) => byId.get(e.from));
    if (supporters.length === 0) continue;
    const labels = supporters.map((ev) => citedAsOf(ev));
    const allNonemptyStrings = labels.every((l) => typeof l === 'string' && l.trim().length > 0);
    const distinctLabels = new Set(labels);
    if (allNonemptyStrings && distinctLabels.size === 1) {
      single_supporting_citation_label_claims.push({
        id: c.id, label: c.label, cited_as: labels[0], evidence_ids: supporters.map((ev) => ev.id),
      });
    }
  }

  // hypotheses_without_linked_test_questions: TEST_COVERAGE_SCOPE — a
  // hypothesis counts as covered if a `tests` edge reaches it directly, OR
  // reaches a claim that itself supports/contradicts it (the claims a
  // hypothesis owns are exactly the claims with a supports/contradicts edge
  // into it, the same relation evidence_edge_state reads). This is whether a
  // TEST PLAN exists on the board, never whether a test was actually run.
  const testsEdges = edges.filter((e) => e.type === 'tests');
  const hypothesisClaimsOf = new Map();
  for (const e of edges) {
    if ((e.type === 'supports' || e.type === 'contradicts') && typeOf(e.from) === 'claim' && typeOf(e.to) === 'hypothesis') {
      if (!hypothesisClaimsOf.has(e.to)) hypothesisClaimsOf.set(e.to, []);
      hypothesisClaimsOf.get(e.to).push(e.from);
    }
  }
  const testedHypotheses = new Set();
  for (const t of testsEdges) {
    if (typeOf(t.to) === 'hypothesis') testedHypotheses.add(t.to);
    else if (typeOf(t.to) === 'claim') {
      for (const [hid, claimIds] of hypothesisClaimsOf) {
        if (claimIds.includes(t.to)) testedHypotheses.add(hid);
      }
    }
  }
  const hypotheses_without_linked_test_questions = hypotheses
    .filter((hy) => !testedHypotheses.has(hy.id))
    .map((hy) => ({ id: hy.id, label: hy.label }));

  const open_questions = questions.map((q) => ({
    question_id: q.id,
    targets: testsEdges.filter((e) => e.from === q.id).map((e) => e.to),
  }));

  const unverified_evidence_count = evidenceNodes.filter((ev) => !isVerified(ev)).length;

  return {
    claims_with_mixed_edge_labels,
    claims_with_contradiction_only_edges,
    claims_without_incoming_evidence_edges,
    single_supporting_citation_label_claims,
    single_supporting_citation_label_scope: SINGLE_CITATION_SCOPE,
    hypotheses_without_linked_test_questions,
    hypotheses_without_linked_test_questions_scope: TEST_COVERAGE_SCOPE,
    open_questions,
    unverified_evidence_count,
    tally_scope: TALLY_SCOPE,
    note: DIAGNOSTICS_NOTE,
  };
}

// ================================================================ runtime

export function initBoard(config) {
  if (!config || !config.seed || !Array.isArray(config.seed.nodes) || !Array.isArray(config.seed.edges)) {
    throw new Error('initBoard needs { seed: { topic, nodes, edges } }');
  }
  const SEED = config.seed;
  const storageKey = config.storageKey || 'le-board-v1';

  const mounts = {
    map: config.mounts?.map ? $(config.mounts.map) : null,
    panel: config.mounts?.panel ? $(config.mounts.panel) : null,
    discoveries: config.mounts?.discoveries ? $(config.mounts.discoveries) : null,
    pending: config.mounts?.pending ? $(config.mounts.pending) : null,
    ledger: config.mounts?.ledger ? $(config.mounts.ledger) : null,
    status: config.mounts?.status ? $(config.mounts.status) : null,
    console: config.mounts?.console ? $(config.mounts.console) : null,
    reset: config.mounts?.reset ? $(config.mounts.reset) : null,
    topic: config.mounts?.topic ? $(config.mounts.topic) : null,
  };

  const state = {
    // Base (seed) nodes/edges are never mutated in place; approvals APPEND
    // to base.approvedNodes/base.approvedEdges, mirroring living-evidence's
    // state.base/state.approved split — a snapshot only ever needs to store
    // the delta, and "seed loads only when storage is empty" falls out for
    // free (an empty snapshot's delta is nothing).
    topic: SEED.topic,
    approvedNodes: [],
    approvedEdges: [],
    pendingNodes: [], // { id, node, status: 'pending'|'rejected', proposed_at }
    pendingEdges: [], // { id, edge, status: 'pending'|'rejected', proposed_at }
    selected: null,
    audit: [],
    runCounter: 0,
    boardVersion: 1, // +1 per approval (node or edge)
    agent: { active: false, status: 'absent', detail: 'not initialized' },
  };

  const activeNodes = () => SEED.nodes.concat(state.approvedNodes);
  const activeEdges = () => SEED.edges.concat(state.approvedEdges);
  const nodeById = () => new Map(activeNodes().map((n) => [n.id, n]));
  const typeOfFn = (map) => (id) => map.get(id)?.type;

  // ---------------------------------------------------------------- ids
  const TYPE_PREFIX = { hypothesis: 'h', claim: 'c', evidence: 'e', mechanism: 'm', question: 'q' };

  function allKnownNodeIds() {
    const s = new Set(activeNodes().map((n) => n.id));
    for (const p of state.pendingNodes) s.add(p.id);
    return s;
  }

  function assignNodeId(type) {
    const known = allKnownNodeIds();
    const prefix = TYPE_PREFIX[type];
    let n = 1;
    let id = `${prefix}-new${n}`;
    while (known.has(id)) { n += 1; id = `${prefix}-new${n}`; }
    return id;
  }

  function assignEdgeId() {
    const known = new Set(activeEdges().map((e) => e.id).concat(state.pendingEdges.map((p) => p.id)));
    let n = 1;
    let id = `ed-p${n}`;
    while (known.has(id)) { n += 1; id = `ed-p${n}`; }
    return id;
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

  /** Same M1 envelope as the rest of the suite: {run, time, actor, kind,
   *  tool, inputs, summary, result_digest} — with board_version standing in
   *  for the document runtime's evidence_version / the atlas's
   *  evidence_version, since this is what the board itself calls its
   *  staleness clock (§1). Pure reads are never routed through here. */
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
      board_version: state.boardVersion,
      result_digest: result === undefined ? null : fnv1a(JSON.stringify(result)),
    };
    state.audit.push(entry);
    const row = renderLedgerRow(entry);
    // Scroll the LEDGER's own box only — see atlas.js/living-evidence.js for
    // why row.scrollIntoView() is the wrong call here.
    if (row && mounts.ledger) mounts.ledger.scrollTop = mounts.ledger.scrollHeight;
    persist();
    return n;
  }

  // ---------------------------------------------------------- persistence
  function snapshot() {
    return {
      v: 1,
      topic: state.topic,
      approvedNodes: state.approvedNodes,
      approvedEdges: state.approvedEdges,
      pendingNodes: state.pendingNodes,
      pendingEdges: state.pendingEdges,
      ledger: state.audit,
      boardVersion: state.boardVersion,
      runCounter: state.runCounter,
    };
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot()));
    } catch (e) {
      // Private mode, quota, or a disabled storage partition. The board is
      // still fully usable — it just forgets on reload.
      console.warn('[board] could not save the board:', e.message);
    }
  }

  function clearPersisted() {
    try { localStorage.removeItem(storageKey); } catch (e) { /* nothing we can do */ }
  }

  /** A corrupt snapshot must never take the page down — drop it and boot the
   *  clean seed the human expects to see (same contract as living-evidence's
   *  readSnapshot). */
  function readSnapshot() {
    let raw = null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch (e) {
      console.warn('[board] storage unavailable, starting from seed:', e.message);
      return null;
    }
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || Array.isArray(d) || d.v !== 1) throw new Error('not a v1 board snapshot');
      return d;
    } catch (e) {
      console.warn('[board] discarding an unreadable board snapshot:', e.message);
      clearPersisted();
      return null;
    }
  }

  /** The same required-field checks proposeNode enforces for a fresh evidence
   *  proposal (quote, cited_as, kind, value — see proposeNode), applied here
   *  to a node read back out of localStorage. Non-evidence node types have no
   *  extra fields to check beyond the shape check restoreBoard already does. */
  function evidenceFieldsValid(n) {
    if (n.type !== 'evidence') return true;
    return typeof n.quote === 'string' && n.quote.trim().length > 0
      && typeof n.cited_as === 'string' && n.cited_as.trim().length > 0
      && EVIDENCE_KINDS.includes(n.kind)
      && typeof n.value === 'string' && n.value.trim().length > 0;
  }

  /** Untrusted input (hand-editable in devtools): every restored node/edge —
   *  approved OR still pending — is re-validated against the SAME rules a
   *  fresh proposal goes through before it is trusted (shape, required
   *  evidence fields, and — for edges — validateEdgeShape against the
   *  endpoints' actual types plus endpoint existence), and anything that
   *  fails is dropped rather than taking the boot down. A pending item is
   *  UNAPPROVED input the human has not yet looked at, which makes it if
   *  anything the more dangerous of the two to skip: approving a tampered
   *  pending card is a single click away. Returns true if anything was
   *  restored. */
  function restoreBoard() {
    const d = readSnapshot();
    if (!d) return false;
    try {
      const seedIds = new Set(SEED.nodes.map((n) => n.id));
      const approvedNodesRaw = Array.isArray(d.approvedNodes) ? d.approvedNodes : [];
      const approvedNodes = approvedNodesRaw.filter((n) => n && typeof n === 'object' && NODE_TYPES.includes(n.type) && typeof n.id === 'string' && !seedIds.has(n.id) && evidenceFieldsValid(n));
      const knownAfterNodes = new Set([...seedIds, ...approvedNodes.map((n) => n.id)]);

      const seedEdgeIds = new Set(SEED.edges.map((e) => e.id));
      const approvedEdgesRaw = Array.isArray(d.approvedEdges) ? d.approvedEdges : [];
      const approvedEdges = approvedEdgesRaw.filter((e) => {
        if (!e || typeof e !== 'object' || seedEdgeIds.has(e.id)) return false;
        if (!knownAfterNodes.has(e.from) || !knownAfterNodes.has(e.to)) return false;
        const fromType = (SEED.nodes.find((n) => n.id === e.from) || approvedNodes.find((n) => n.id === e.from))?.type;
        const toType = (SEED.nodes.find((n) => n.id === e.to) || approvedNodes.find((n) => n.id === e.to))?.type;
        try { validateEdgeShape(e.type, fromType, toType); } catch { return false; }
        return true;
      });

      const pendingNodes = (Array.isArray(d.pendingNodes) ? d.pendingNodes : [])
        .filter((p) => p && p.node && typeof p.node === 'object' && NODE_TYPES.includes(p.node.type) && typeof p.id === 'string' && evidenceFieldsValid(p.node));
      const pendingEdges = (Array.isArray(d.pendingEdges) ? d.pendingEdges : [])
        .filter((p) => {
          if (!p || !p.edge || typeof p.edge !== 'object' || typeof p.id !== 'string') return false;
          const e = p.edge;
          if (!knownAfterNodes.has(e.from) || !knownAfterNodes.has(e.to)) return false;
          const fromType = (SEED.nodes.find((n) => n.id === e.from) || approvedNodes.find((n) => n.id === e.from))?.type;
          const toType = (SEED.nodes.find((n) => n.id === e.to) || approvedNodes.find((n) => n.id === e.to))?.type;
          try { validateEdgeShape(e.type, fromType, toType); } catch { return false; }
          return true;
        });

      if (typeof d.topic === 'string' && d.topic.trim()) state.topic = d.topic;
      state.approvedNodes = approvedNodes;
      state.approvedEdges = approvedEdges;
      state.pendingNodes = pendingNodes;
      state.pendingEdges = pendingEdges;
      state.boardVersion = Number.isFinite(d.boardVersion) ? d.boardVersion : 1;
      state.runCounter = Number.isFinite(d.runCounter) ? d.runCounter : 0;
      state.audit = Array.isArray(d.ledger) ? d.ledger : [];
      for (const entry of state.audit) renderLedgerRow(entry);
      for (const p of state.pendingNodes) if (p.status === 'pending') renderNodeProposalCard(p);
      for (const p of state.pendingEdges) if (p.status === 'pending') renderEdgeProposalCard(p);
      return true;
    } catch (e) {
      console.warn('[board] board snapshot could not be restored, starting from seed:', e.message);
      state.approvedNodes = [];
      state.approvedEdges = [];
      state.pendingNodes = [];
      state.pendingEdges = [];
      state.boardVersion = 1;
      state.runCounter = 0;
      state.audit = [];
      state.topic = SEED.topic;
      if (mounts.ledger) mounts.ledger.replaceChildren();
      if (mounts.pending) mounts.pending.replaceChildren();
      clearPersisted();
      return false;
    }
  }

  // ------------------------------------------------------------- getters

  function getNodeDetail(node) {
    const byId = nodeById();
    const typeOf = typeOfFn(byId);
    const edgesIn = activeEdges().filter((e) => e.to === node.id).map((e) => ({ edge_id: e.id, type: e.type, from: e.from, rationale: e.rationale || null }));
    const edgesOut = activeEdges().filter((e) => e.from === node.id).map((e) => ({ edge_id: e.id, type: e.type, to: e.to, rationale: e.rationale || null }));
    const out = { ...node, edges_in: edgesIn, edges_out: edgesOut };
    if (node.type === 'claim') {
      const tally = computeTally(node.id, activeEdges(), typeOf);
      out.evidence_edge_state = tally.state;
      out.tally_supports = tally.supports;
      out.tally_contradicts = tally.contradicts;
      out.tally_scope = TALLY_SCOPE;
    }
    return out;
  }

  function nodeStatusFields(node, status) {
    return { ...node, status };
  }

  function listActiveAndPendingNodes() {
    const active = activeNodes().map((n) => nodeStatusFields(n, 'active'));
    const pending = state.pendingNodes.filter((p) => p.status === 'pending').map((p) => nodeStatusFields(p.node, 'pending'));
    return active.concat(pending);
  }

  function listActiveAndPendingEdges() {
    const active = activeEdges().map((e) => ({ ...e, status: 'active' }));
    const pending = state.pendingEdges.filter((p) => p.status === 'pending').map((p) => ({ ...p.edge, status: 'pending' }));
    return active.concat(pending);
  }

  // ------------------------------------------------------- pending cards
  function syncPendingSection() {
    const section = mounts.pending?.closest('section');
    if (!section) return;
    if (mounts.pending.querySelector('.le-pending-card')) section.classList.add('le-has-pending');
    else section.classList.remove('le-has-pending');
  }

  function approveNode(item) {
    // Guard against a double-approval: the detail panel can show the same
    // pending item's card alongside the one in the pending section (a human
    // who is currently focused on it should not have to leave the panel to
    // approve), so both cards reference the SAME item object and this is
    // what keeps clicking Approve on whichever one is left afterward inert
    // instead of pushing the node onto the board twice.
    if (item.status !== 'pending') return;
    item.status = 'approved';
    // [D6] A freshly proposed evidence node has no verification label at
    // proposal time (see proposeNode) — the moment a human approves it, it
    // gets one: it is now a citation the board is standing behind, sourced
    // this session rather than from the seed conversation, and still not
    // independently checked either way.
    if (item.node.type === 'evidence' && !item.node.verification) {
      item.node.verification = PROPOSED_VERIFICATION_LABEL;
    }
    item.node.provenance = { ...item.node.provenance, approved_at: new Date().toISOString(), verification: item.node.verification ?? item.node.provenance?.verification ?? null };
    state.approvedNodes.push(item.node);
    state.boardVersion += 1;
    ledger({
      kind: 'approval', tool: 'propose_node', actor: 'human',
      inputs: { node_id: item.id, decision: 'approved' },
      result: { decision: 'approved', node_id: item.id, board_version: state.boardVersion },
      summary: `human APPROVED node ${item.id} (${item.node.type}) — board version ${state.boardVersion}`,
    });
    renderDiscoveries();
    rebuildMap();
    refreshSelectedPanel();
  }

  function rejectNode(item) {
    if (item.status !== 'pending') return;
    item.status = 'rejected';
    ledger({
      kind: 'approval', tool: 'propose_node', actor: 'human',
      inputs: { node_id: item.id, decision: 'rejected' },
      result: { decision: 'rejected', node_id: item.id },
      summary: `human REJECTED node ${item.id} (${item.node.type})`,
    });
    refreshSelectedPanel();
  }

  function renderNodeProposalCard(item) {
    if (!mounts.pending) return;
    const n = item.node;
    const card = h('div', { class: 'le-pending-card', id: `le-pending-node-${n.id}` }, [
      h('div', { class: 'le-pending-head', text: `Proposed ${n.type}: ${n.label}` }),
      h('table', { class: 'le-pending-table' }, [
        h('tbody', {}, [
          ['statement', n.statement],
          n.type === 'evidence' ? ['value', n.value] : null,
          n.type === 'evidence' ? ['year / kind', `${n.year} / ${n.kind}`] : null,
          n.type === 'evidence' ? ['cited_as', n.cited_as] : null,
          n.type === 'evidence' ? ['quote', n.quote] : null,
          n.type === 'question' && n.test_sketch ? ['test_sketch', n.test_sketch] : null,
        ].filter(Boolean).map(([k, v]) => h('tr', {}, [h('th', { text: k }), h('td', { text: String(v) })]))),
      ]),
      h('div', { class: 'le-pending-note', text: 'An agent proposed this node. It is NOT on the board until a human approves it.' }),
      h('div', { class: 'le-pending-actions' }, [
        h('button', { class: 'le-btn le-btn-approve', text: 'Approve & include', onclick: () => { approveNode(item); card.remove(); syncPendingSection(); } }),
        h('button', { class: 'le-btn le-btn-reject', text: 'Reject', onclick: () => { rejectNode(item); card.remove(); syncPendingSection(); } }),
      ]),
    ]);
    mounts.pending.appendChild(card);
    syncPendingSection();
  }

  function approveEdge(item) {
    if (item.status !== 'pending') return; // see approveNode's comment on the same guard
    item.status = 'approved';
    item.edge.provenance = { ...item.edge.provenance, approved_at: new Date().toISOString() };
    state.approvedEdges.push(item.edge);
    state.boardVersion += 1;
    ledger({
      kind: 'approval', tool: 'propose_edge', actor: 'human',
      inputs: { edge_id: item.id, decision: 'approved' },
      result: { decision: 'approved', edge_id: item.id, board_version: state.boardVersion },
      summary: `human APPROVED edge ${item.id} (${item.edge.type} ${item.edge.from} -> ${item.edge.to}) — board version ${state.boardVersion}`,
    });
    renderDiscoveries();
    rebuildMap();
    refreshSelectedPanel();
  }

  function rejectEdge(item) {
    if (item.status !== 'pending') return;
    item.status = 'rejected';
    ledger({
      kind: 'approval', tool: 'propose_edge', actor: 'human',
      inputs: { edge_id: item.id, decision: 'rejected' },
      result: { decision: 'rejected', edge_id: item.id },
      summary: `human REJECTED edge ${item.id} (${item.edge.type} ${item.edge.from} -> ${item.edge.to})`,
    });
    refreshSelectedPanel();
  }

  function renderEdgeProposalCard(item) {
    if (!mounts.pending) return;
    const e = item.edge;
    const card = h('div', { class: 'le-pending-card', id: `le-pending-edge-${e.id}` }, [
      h('div', { class: 'le-pending-head', text: `Proposed edge: ${e.from} —${e.type}→ ${e.to}` }),
      h('table', { class: 'le-pending-table' }, [
        h('tbody', {}, [
          ['from', e.from], ['to', e.to], ['type', e.type],
          e.rationale ? ['rationale', e.rationale] : null,
        ].filter(Boolean).map(([k, v]) => h('tr', {}, [h('th', { text: k }), h('td', { text: String(v) })]))),
      ]),
      h('div', { class: 'le-pending-note', text: 'An agent proposed this edge. It is NOT on the board until a human approves it.' }),
      h('div', { class: 'le-pending-actions' }, [
        h('button', { class: 'le-btn le-btn-approve', text: 'Approve & include', onclick: () => { approveEdge(item); card.remove(); syncPendingSection(); } }),
        h('button', { class: 'le-btn le-btn-reject', text: 'Reject', onclick: () => { rejectEdge(item); card.remove(); syncPendingSection(); } }),
      ]),
    ]);
    mounts.pending.appendChild(card);
    syncPendingSection();
  }

  // -------------------------------------------------------------- verbs

  function boardOverview() {
    const nodes = activeNodes();
    const counts = {};
    for (const n of nodes) counts[n.type] = (counts[n.type] || 0) + 1;
    return {
      page: 'Living Evidence Board',
      topic: state.topic,
      board_version: state.boardVersion,
      counts_by_type: counts,
      total_nodes: nodes.length,
      total_edges: activeEdges().length,
      pending: {
        nodes: state.pendingNodes.filter((p) => p.status === 'pending').length,
        edges: state.pendingEdges.filter((p) => p.status === 'pending').length,
      },
      tally_scope: TALLY_SCOPE,
      suite_context: {
        you_are_here: 'board',
        exemplar: 'index.html — the populated exemplar: a filled evidence base and six claims, the fastest cross-examination demo.',
        workspace: 'workspace.html — the authoring surface: an empty page in the fixed SMD template that an agent fills and a human approves.',
        atlas: 'atlas.html — the evidence map: node/gap inspection over one fixed estimand cell; no tool there changes the evidence.',
        board: 'board.html — an Evidence Board built from an unverified ChatGPT conversation (a reported Tokyo 専業主婦 measure): structural graph diagnostics + human-approved additions; its state does not propagate to the other pages.',
      },
      // [D8, Codex-review fix round] The old fourth step ("propose_node /
      // propose_edge with a quote — the human approves") conflated two
      // different approvals into one line and was simply wrong: propose_edge
      // refuses a still-pending node as an endpoint (see proposeEdge below),
      // so an agent following that line literally would hit an error on its
      // very next call. Spelled out as the actual five-step sequence.
      suggested_flow: [
        'board_overview — orientation (this call)',
        `list_nodes {type: "claim"} — the ${counts.claim || 0} claims and their computed evidence_edge_state`,
        'get_board_diagnostics — mixed/contradiction-only/no-evidence claims, single-citation-label claims, hypotheses without linked test questions, open questions',
        'propose_node with a context-bearing quote — a new node proposal',
        'ask the human to approve it — a still-pending node cannot be an edge endpoint',
        'propose_edge from the now-active node, with a rationale',
        'ask the human to approve the edge',
        'get_board_diagnostics again — what changed',
      ],
      // [D8] A short path for an agent that already knows what it wants to
      // look at, rather than the full orientation walk above.
      suggested_fast_path: ['board_overview', 'get_board_diagnostics', 'focus_node {"node_id":"c-income"}'],
      honesty: [
        `The board has NO statistics engine and issues NO verdicts. A claim's evidence_edge_state is ${TALLY_SCOPE}.`,
        `Seeded evidence is agent-extracted from a conversation, not independently verified. Every seed evidence node carries: "${SEED_VERIFICATION_LABEL}"`,
        'Nodes and edges enter the active graph through proposal and human approval; preloaded seed content is active but was not approved in this session. set_topic changes the heading immediately (no approval), focus_node changes selection, export_board starts a download. Proposals, approvals/rejections, topic changes, navigation and exports are ledgered; pure reads are not.',
        `Edges are constrained by a fixed endpoint/type compatibility matrix — it checks node types, not inferential validity: ${MATRIX_TEXT}. propose_edge rejects anything else, naming the matrix.`,
        // [D12] What survives a reload, and what actually moves board_version.
        "This browser persists the board via localStorage: approved nodes/edges, pending proposals, the topic and the ledger all survive a reload. board_version increments ONLY on a node or edge approval — proposals, rejections, navigation, topic changes and exports do not move it.",
      ],
      guidance: [
        'get_node accepts a bare id (e.g. "c-income") or a typed id (e.g. "claim:c-income").',
        'list_nodes/get_edges show pending proposals inline with status:"pending" — there is no separate pending-listing tool.',
        'propose_node/propose_edge render an approval card for the human; there is NO agent approval tool.',
      ],
    };
  }

  function listNodes(a = {}) {
    if (a.type !== undefined && !NODE_TYPES.includes(a.type)) {
      throw new Error(`type must be one of ${NODE_TYPES.join(', ')} (got ${a.type})`);
    }
    const byId = nodeById();
    const typeOf = typeOfFn(byId);
    let nodes = listActiveAndPendingNodes();
    if (a.type) nodes = nodes.filter((n) => n.type === a.type);
    return {
      topic: state.topic,
      board_version: state.boardVersion,
      tally_scope: TALLY_SCOPE,
      nodes: nodes.map((n) => {
        if (n.type !== 'claim' || n.status === 'pending') return n;
        const tally = computeTally(n.id, activeEdges(), typeOf);
        return { ...n, evidence_edge_state: tally.state, tally_supports: tally.supports, tally_contradicts: tally.contradicts };
      }),
    };
  }

  function getNode(rawId) {
    const known = allKnownNodeIds();
    const id = resolveBareId(rawId, known);
    if (!id) {
      throw new Error(`unknown node id: ${rawId}. Call list_nodes for the ids; bare ("c-income") and typed ("claim:c-income") forms are both accepted.`);
    }
    const active = nodeById().get(id);
    if (active) return { ...getNodeDetail(active), status: 'active' };
    const pending = state.pendingNodes.find((p) => p.id === id);
    if (pending) return { ...pending.node, status: pending.status, edges_in: [], edges_out: [] };
    throw new Error(`node ${id} was found in an id list but not in board state — this is a bug`);
  }

  function getEdges(a = {}) {
    let edges = listActiveAndPendingEdges();
    if (a.node_id !== undefined) {
      const known = allKnownNodeIds();
      const id = resolveBareId(a.node_id, known);
      if (!id) throw new Error(`unknown node id: ${a.node_id}. Call list_nodes for the ids.`);
      edges = edges.filter((e) => e.from === id || e.to === id);
    }
    return { board_version: state.boardVersion, edges };
  }

  function getBoardDiagnostics() {
    const result = computeBoardDiagnostics(activeNodes(), activeEdges());
    return { ...result, board_version: state.boardVersion };
  }

  function requireString(v, field, { min = 1, max = Infinity } = {}) {
    if (typeof v !== 'string' || v.trim().length < min) throw new Error(`missing or too-short required field: ${field}`);
    if (v.length > max) throw new Error(`${field} too long: ${v.length} characters (max ${max})`);
    return v;
  }

  function proposeNode(args = {}) {
    if (!NODE_TYPES.includes(args.type)) throw new Error(`type must be one of ${NODE_TYPES.join(', ')} (got ${args.type})`);
    requireString(args.label, 'label', { max: 80 });
    requireString(args.statement, 'statement');

    const node = { id: assignNodeId(args.type), type: args.type, label: args.label.trim(), statement: args.statement.trim() };

    if (args.type === 'evidence') {
      requireString(args.value, 'value (required for evidence)');
      requireString(args.cited_as, 'cited_as (required for evidence)');
      requireString(args.quote, 'quote (required for evidence) — the verbatim fragment the value was read from');
      if (!EVIDENCE_KINDS.includes(args.kind)) throw new Error(`kind must be one of ${EVIDENCE_KINDS.join(', ')} (got ${args.kind}) — required for evidence`);
      const year = args.year === undefined || args.year === null ? 'n/a' : args.year;
      if (year !== 'n/a' && !(Number.isInteger(year) && year >= 1900 && year <= 2100)) {
        throw new Error('year must be an integer between 1900 and 2100, or the literal string "n/a"');
      }
      node.value = args.value.trim();
      node.year = year;
      // kind is source kind AS REPORTED IN THE CONVERSATION (unverified) —
      // see EVIDENCE_KINDS and the propose_node tool description; it is not
      // an independently checked classification.
      node.kind = args.kind;
      node.cited_as = args.cited_as.trim();
      node.quote = args.quote.trim();
      // A freshly proposed evidence node is a human-sourced citation the
      // agent is vouching for right now, not something extracted from the
      // 2026-08 seed conversation — it does NOT get SEED_VERIFICATION_LABEL.
      // It gets no verification label at all until a human approves it (see
      // approveNode), and so — like every other evidence node on this board
      // — it counts toward get_board_diagnostics' unverified count either way
      // (D6: that count keys off an explicit verified flag, not this label).
      node.verification = null;
    } else if (args.type === 'question' && args.test_sketch !== undefined && args.test_sketch !== null) {
      node.test_sketch = requireString(args.test_sketch, 'test_sketch');
    } else if (args.type === 'question') {
      node.test_sketch = null;
    }

    // [D7] quote_origin/source_locator are evidence-only, optional, and land
    // ONLY on provenance — runtime is otherwise unchanged. quote_origin
    // defaults to 'conversation' when omitted, matching the schema's stated
    // default; no additional enum validation is added here (the schema
    // documents the two allowed values).
    const quoteOrigin = args.type === 'evidence'
      ? (typeof args.quote_origin === 'string' && args.quote_origin.trim() ? args.quote_origin.trim() : 'conversation')
      : null;
    const sourceLocator = args.type === 'evidence' && typeof args.source_locator === 'string' && args.source_locator.trim()
      ? args.source_locator.trim() : null;

    node.provenance = {
      origin: 'proposal', source: null,
      quote: node.quote ?? null, cited_as: node.cited_as ?? null, verification: node.verification ?? null,
      quote_origin: quoteOrigin, source_locator: sourceLocator,
      proposed_at: new Date().toISOString(), approved_at: null,
    };

    // Dupe check by (type, label) across active + still-pending nodes.
    const dup = activeNodes().concat(state.pendingNodes.filter((p) => p.status === 'pending').map((p) => p.node))
      .find((n) => n.type === node.type && n.label.trim() === node.label);

    const item = { id: node.id, node, status: 'pending', proposed_at: node.provenance.proposed_at };
    state.pendingNodes.push(item);
    const response = {
      status: 'pending_human_approval', node_id: node.id, type: node.type,
      possible_duplicate_of: dup ? dup.id : null,
      message: 'Proposal recorded and shown to the human reader with an Approve/Reject card. It is NOT on the board until approved. Ask the human to review it on the page.'
        + (dup ? ` NOTE: a ${node.type} node with the same label already exists (${dup.id}) — say so when you ask the human to approve this one.` : '')
        + ' Call board_overview or list_nodes again after the human approves.',
    };
    ledger({
      kind: 'proposal', tool: 'propose_node',
      inputs: { type: node.type, label: node.label },
      result: response,
      summary: `agent proposed ${node.type} node ${node.id} (“${node.label}”) — awaiting human approval`,
    });
    renderNodeProposalCard(item);
    return response;
  }

  function proposeEdge(args = {}) {
    requireString(args.from, 'from');
    requireString(args.to, 'to');
    if (!EDGE_TYPES.includes(args.type)) throw new Error(`type must be one of ${EDGE_TYPES.join(', ')} (got ${args.type})`);

    const known = nodeById();
    const fromId = resolveBareId(args.from, known);
    const toId = resolveBareId(args.to, known);
    // Edges may only connect nodes already ON the board (seed or approved) —
    // a node still awaiting its own approval is not yet something an edge
    // can point at; approve it first, then propose the edge.
    if (!fromId) throw new Error(`unknown "from" node id: ${args.from}. It must already be on the board (not merely pending) — call list_nodes.`);
    if (!toId) throw new Error(`unknown "to" node id: ${args.to}. It must already be on the board (not merely pending) — call list_nodes.`);

    const fromType = known.get(fromId).type;
    const toType = known.get(toId).type;
    validateEdgeShape(args.type, fromType, toType);

    // [D11] An exact (from, to, type) duplicate — active OR still pending —
    // is REJECTED outright, not merely flagged: a distinct edge id carrying
    // identical semantics adds nothing an agent or human can act on
    // differently, and silently letting duplicates accumulate on approval
    // would double-count in computeTally (each edge counted separately).
    const dup = activeEdges().concat(state.pendingEdges.filter((p) => p.status === 'pending').map((p) => p.edge))
      .find((e) => e.from === fromId && e.to === toId && e.type === args.type);
    if (dup) {
      throw new Error(`duplicate edge: an identical ${args.type} edge from ${fromId} to ${toId} already exists (${dup.id}) — an edge is uniquely identified by (from, to, type); propose a different type or a different endpoint instead.`);
    }

    const edgeObj = {
      id: assignEdgeId(), from: fromId, to: toId, type: args.type,
      rationale: args.rationale !== undefined && args.rationale !== null ? String(args.rationale).trim() : null,
      provenance: { origin: 'proposal', source: null, quote: null, cited_as: null, verification: null, proposed_at: new Date().toISOString(), approved_at: null },
    };

    const item = { id: edgeObj.id, edge: edgeObj, status: 'pending', proposed_at: edgeObj.provenance.proposed_at };
    state.pendingEdges.push(item);
    const response = {
      status: 'pending_human_approval', edge_id: edgeObj.id, from: fromId, to: toId, type: args.type,
      message: 'Proposal recorded and shown to the human reader with an Approve/Reject card. It is NOT on the board until approved. Ask the human to review it on the page.'
        + ' Call get_edges or get_board_diagnostics again after the human approves.',
    };
    ledger({
      kind: 'proposal', tool: 'propose_edge',
      inputs: { from: fromId, to: toId, type: args.type, rationale: edgeObj.rationale },
      result: response,
      summary: `agent proposed edge ${edgeObj.id} (${fromId} —${args.type}→ ${toId}) — awaiting human approval`,
    });
    renderEdgeProposalCard(item);
    return response;
  }

  function focusNode(rawId, opts = {}) {
    const known = allKnownNodeIds();
    const id = resolveBareId(rawId, known);
    if (!id) throw new Error(`unknown node id: ${rawId}. Call list_nodes for the ids; bare or typed ("hypothesis:h-selection") forms are both accepted.`);
    state.selected = id;
    const detail = getNode(id); // same resolution + detail logic get_node uses — one source of truth
    const onBoard = detail.status === 'active';
    applySelection(id, detail, onBoard);
    ledger({
      kind: 'navigation', tool: 'focus_node', actor: opts.actor || null, inputs: { node_id: id },
      result: { node_id: id, type: detail.type },
      summary: `focused ${id} — ${detail.type} · ${String(detail.label).slice(0, 70)}`,
    });
    return {
      node_id: id, bare_id: id, requested_id: String(rawId),
      type: detail.type, on_board: onBoard, selected: true, detail,
      note: onBoard
        ? 'The human’s board now shows this node selected — your exploration is visible on their screen.'
        : 'This node is still pending human approval and is not yet placed on the map.',
    };
  }

  function setTopic(args = {}) {
    const text = requireString(args.text, 'text', { max: 300 }).trim();
    const previous = state.topic;
    state.topic = text;
    if (mounts.topic) mounts.topic.textContent = text;
    ledger({
      kind: 'mutation', tool: 'set_topic', inputs: { text },
      result: { topic: text },
      summary: `topic set: “${text}”`,
    });
    return { topic: text, previous, note: 'The topic is now shown at the top of the board.' };
  }

  async function exportBoard(args = {}) {
    const actor = currentActor; // capture before any await (see living-evidence.js's exportDocument)
    const payload = {
      exported_at: new Date().toISOString(),
      topic: state.topic,
      board_version: state.boardVersion,
      tally_scope: TALLY_SCOPE,
      nodes: listActiveAndPendingNodes(),
      edges: listActiveAndPendingEdges(),
      diagnostics: getBoardDiagnostics(),
      audit_log: state.audit,
    };
    const json = JSON.stringify(payload, null, 2);
    const bytes = new TextEncoder().encode(json).length;
    const now = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const filename = `evidence-board-export-${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}.json`;
    let downloaded = false;
    if (typeof document !== 'undefined') {
      try {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
        const a = h('a', { href: url, download: filename, style: 'display:none' });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        downloaded = true;
      } catch (e) {
        console.warn('[board] export download failed, returning the JSON instead:', e.message);
      }
    }
    const content_digest = fnv1a(json);
    ledger({
      kind: 'mutation', tool: 'export_board', actor,
      inputs: { include_json: !!args.include_json },
      result: payload,
      summary: `exported ${filename} — ${bytes} bytes, ${payload.nodes.length} nodes, ${payload.edges.length} edges`,
    });
    return {
      filename, bytes, download_started: downloaded, content_digest,
      ...(args.include_json || !downloaded ? { json: payload } : {}),
      note: `A snapshot of the board as JSON: nodes, edges (incl. pending), discoveries and the audit log. content_digest is a non-cryptographic FNV-1a checksum of the exported bytes.${args.include_json || !downloaded ? '' : ' Pass include_json: true to get the JSON itself in the response.'}`,
    };
  }

  function getAuditLog() { return { entries: state.audit }; }

  // ---------------------------------------------------------------- map
  // §3: SVG map render + selection/detail-panel, mirroring lib/atlas.js's
  // patterns (data-node/tabindex/role/aria-label, click/Enter -> focus_node,
  // Escape/background click -> deselect (unledgered — closing a panel is
  // not an act on the evidence, same reasoning as atlas.js), dim via a
  // `.atlas-has-selection` class rather than per-node style churn, ledger
  // scrolls its own box never the page). Unlike atlas's evidence-immutable
  // map, this one is redrawn (rebuildMap) whenever an approval adds a node
  // or edge — computeLayout is pure and cheap enough at this scale that a
  // full rebuild is simpler and safer than patching the SVG in place.
  // [D2, Codex-review fix round] Renamed from TALLY_GLYPH's three-state map;
  // one glyph per evidence_edge_state.
  const TALLY_GLYPH = { support_only: '●', mixed: '◐', contradiction_only: '⊘', none: '○' };
  // The map's CSS coloring (living-evidence.css) predates the D2 state
  // rename and is out of this fix round's scope — this maps each new state
  // onto the closest existing `.board-tally-*` color class rather than
  // leaving contradiction_only/mixed/none unstyled: support_only reads as
  // the old "supported" green, mixed AND contradiction_only both read as the
  // old "contested" amber (both involve disputing evidence), none reads as
  // the old "unsupported" muted gray.
  const TALLY_CSS_CLASS = { support_only: 'supported', mixed: 'contested', contradiction_only: 'contested', none: 'unsupported' };
  const EVIDENCE_KIND_LABEL = { 'official-stat': 'official statistic', survey: 'survey', regression: 'regression', study: 'study' };
  const EDGE_LEGEND_LABEL = {
    supports: 'supports — solid', contradicts: 'contradicts — dashed',
    'part-of': 'part-of — thin (mechanism→hypothesis)', tests: 'tests — dotted', refines: 'refines — accent',
  };

  let svgRoot = null;
  let nodeEls = new Map();

  function questionTargetsOf(qid) {
    return activeEdges().filter((e) => e.type === 'tests' && e.from === qid).map((e) => e.to);
  }

  /** The full sentence a screen reader gets for one node — always computed
   *  live (never cached), so a claim's tally in the aria-label can never
   *  drift from what get_node would report right now. */
  function nodeAriaText(n, typeOf) {
    const base = `${n.type[0].toUpperCase()}${n.type.slice(1)} ${n.id}: ${n.label}`;
    if (n.type === 'claim') {
      const t = computeTally(n.id, activeEdges(), typeOf);
      return `${base} — ${t.state} (${t.supports} supports, ${t.contradicts} contradicts) — ${TALLY_SCOPE}`;
    }
    if (n.type === 'evidence') return `${base} (${n.kind}, ${n.year}): ${n.value} — cited as ${n.cited_as}`;
    if (n.type === 'question') {
      const targets = questionTargetsOf(n.id);
      return `${base}${targets.length ? ` — tests ${targets.join(', ')}` : ' — not yet linked to a tests edge'}`;
    }
    return `${base} — ${truncateLabel(n.statement, 140)}`;
  }

  function contentFor(n, typeOf) {
    const out = [];
    if (n.type === 'claim') {
      const t = computeTally(n.id, activeEdges(), typeOf);
      out.push(svText(n.id, n.x - n.w / 2 + 10, n.y - 4, { size: 10, anchor: 'start', weight: 600 }));
      out.push(svText(TALLY_GLYPH[t.state], n.x + n.w / 2 - 12, n.y - 3, { size: 13, anchor: 'end', cls: `atlas-t board-tally-${TALLY_CSS_CLASS[t.state]}`, weight: 700 }));
      out.push(svText(truncateLabel(n.label, 15), n.x - n.w / 2 + 10, n.y + 12, { size: 8.5, anchor: 'start', cls: 'atlas-t-muted' }));
      out.push(svText(`${t.supports}+/${t.contradicts}−`, n.x + n.w / 2 - 10, n.y + 12, { size: 8.5, anchor: 'end', cls: 'atlas-t-muted' }));
    } else if (n.type === 'evidence') {
      out.push(svText(n.id, n.x, n.y + 3, { size: 8, cls: 'atlas-t' }));
    } else if (n.type === 'hypothesis') {
      out.push(svText(n.id, n.x, n.y - 16, { size: 12.5, weight: 650 }));
      out.push(svText(truncateLabel(n.label, 16), n.x, n.y, { size: 10.5, cls: 'atlas-t-muted' }));
      out.push(svText('hypothesis', n.x, n.y + 22, { size: 8.5, cls: 'atlas-t-muted' }));
    } else if (n.type === 'mechanism') {
      out.push(svText(n.id, n.x, n.y - 6, { size: 9.5, weight: 600 }));
      out.push(svText(truncateLabel(n.label, 16), n.x, n.y + 9, { size: 8, cls: 'atlas-t-muted' }));
    } else if (n.type === 'question') {
      out.push(svText(n.id, n.x, n.y - 7, { size: 9.5, weight: 600 }));
      out.push(svText(truncateLabel(n.label, 13), n.x, n.y + 8, { size: 8, cls: 'atlas-t-muted' }));
    }
    return out;
  }

  function shapeFor(n) {
    const cls = n.type === 'evidence' ? `atlas-shape board-kind-${n.kind}` : 'atlas-shape';
    return sv('rect', { x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h, rx: n.rx, class: cls });
  }

  function ringFor(n) {
    return sv('rect', {
      x: n.x - n.w / 2 - 5, y: n.y - n.h / 2 - 5, width: n.w + 10, height: n.h + 10, rx: n.rx + 4, class: 'atlas-ring',
    });
  }

  /** Where a ray from a rectangle's CENTER (w×h, axis-aligned, as every node
   *  box here is) toward direction (dx,dy) crosses that rectangle's own
   *  bounding-box border. Standard box/ray intersection: the crossing
   *  happens at whichever of the two axes' half-extent is reached first
   *  (t = min(halfW/|dx|, halfH/|dy|)). Used to trim BOTH ends of an edge
   *  segment onto the two nodes' borders instead of drawing center-to-center
   *  — a center-to-center line strikes straight through whatever label sits
   *  at the node's center (BOARD-SPEC.md §3's edges are meant to connect
   *  boxes, not cross out their contents). */
  function pointOnBorderToward(cx, cy, w, h, dx, dy) {
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    const halfW = w / 2;
    const halfH = h / 2;
    const tX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
    const tY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
    const t = Math.min(tX, tY);
    return { x: cx + t * dx, y: cy + t * dy };
  }

  function drawEdges(positioned, edges) {
    const byId = new Map(positioned.map((n) => [n.id, n]));
    const g = sv('g', { class: 'atlas-edges' });
    for (const e of edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const p1 = pointOnBorderToward(a.x, a.y, a.w, a.h, dx, dy);
      const p2 = pointOnBorderToward(b.x, b.y, b.w, b.h, -dx, -dy);
      g.appendChild(sv('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: `atlas-edge board-edge-${e.type}` }));
    }
    return g;
  }

  function drawNodes(positioned, typeOf) {
    const g = sv('g', { class: 'atlas-nodes' });
    nodeEls = new Map();
    for (const n of positioned) {
      const el = sv('g', {
        class: `atlas-node board-node-${n.type}`,
        'data-node': n.id, tabindex: '0', role: 'button', 'aria-label': nodeAriaText(n, typeOf),
      });
      el.appendChild(shapeFor(n));
      el.appendChild(ringFor(n));
      for (const c of contentFor(n, typeOf)) el.appendChild(c);
      el.addEventListener('click', () => focusNode(n.id, { actor: 'human' }));
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); focusNode(n.id, { actor: 'human' }); }
      });
      nodeEls.set(n.id, el);
      g.appendChild(el);
    }
    return g;
  }

  function drawLegend(legendY, width) {
    const g = sv('g', { class: 'atlas-legend' });
    const colX = [26, Math.round(width / 3) + 6, Math.round((2 * width) / 3) + 2];
    g.appendChild(svText('Node types', colX[0], legendY, { size: 10, anchor: 'start', weight: 650 }));
    g.appendChild(svText('Evidence, by kind', colX[1], legendY, { size: 10, anchor: 'start', weight: 650 }));
    g.appendChild(svText('Edges', colX[2], legendY, { size: 10, anchor: 'start', weight: 650 }));
    const rowY = legendY + 18;
    const nodeRows = [
      'hypothesis — large rounded box',
      'mechanism — small box, part-of a hypothesis',
      `claim — pill; evidence_edge_state ${TALLY_GLYPH.support_only} support_only  ${TALLY_GLYPH.mixed} mixed  ${TALLY_GLYPH.contradiction_only} contradiction_only  ${TALLY_GLYPH.none} none`,
      'question — dashed box, far right',
    ];
    nodeRows.forEach((t, i) => g.appendChild(svText(t, colX[0], rowY + i * 15, { size: 9, anchor: 'start', cls: 'atlas-t-muted' })));
    EVIDENCE_KINDS.forEach((kind, i) => {
      const y = rowY + i * 17;
      g.appendChild(sv('rect', { x: colX[1], y: y - 8, width: 13, height: 10, rx: 2, class: `atlas-legend-dot board-kind-${kind}` }));
      g.appendChild(svText(EVIDENCE_KIND_LABEL[kind], colX[1] + 19, y, { size: 9, anchor: 'start', cls: 'atlas-t-muted' }));
    });
    EDGE_TYPES.forEach((et, i) => {
      const y = rowY + i * 17;
      g.appendChild(sv('line', { x1: colX[2], x2: colX[2] + 22, y1: y - 4, y2: y - 4, class: `atlas-edge board-edge-${et}` }));
      g.appendChild(svText(EDGE_LEGEND_LABEL[et], colX[2] + 28, y, { size: 9, anchor: 'start', cls: 'atlas-t-muted' }));
    });
    return g;
  }

  function renderMap() {
    if (!mounts.map) return;
    const nodes = activeNodes();
    const edges = activeEdges();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const typeOf = (id) => byId.get(id)?.type;
    const layout = computeLayout(nodes, edges);
    svgRoot = sv('svg', {
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      class: 'le-figure-svg atlas-map',
      role: 'group',
      'aria-label': `Evidence board map: ${nodes.length} nodes and ${edges.length} typed edges across five columns (hypotheses, mechanisms, claims, evidence, questions). Every node is focusable; press Enter to open it in the detail panel.`,
    });
    svgRoot.appendChild(drawEdges(layout.positioned, edges));
    svgRoot.appendChild(drawNodes(layout.positioned, typeOf));
    svgRoot.appendChild(drawLegend(layout.legendY, layout.width));
    mounts.map.replaceChildren(svgRoot);
  }

  /** Called after every approval: the node/edge set changed, so the whole
   *  map is recomputed and redrawn (computeLayout is pure and cheap at this
   *  scale — patching the old SVG in place would need to re-derive the same
   *  layout anyway). Re-applies the selection ring so approving something
   *  does not silently drop whatever the human was looking at. */
  function rebuildMap() {
    renderMap();
    if (state.selected && nodeEls.has(state.selected)) {
      nodeEls.get(state.selected).classList.add('atlas-selected');
      svgRoot?.classList.add('atlas-has-selection');
    }
  }

  function applySelection(id, detail, onBoard) {
    if (mounts.map) {
      for (const [nid, el] of nodeEls) el.classList.toggle('atlas-selected', nid === id);
      if (onBoard && nodeEls.has(id)) svgRoot?.classList.add('atlas-has-selection');
      else svgRoot?.classList.remove('atlas-has-selection'); // a pending node has no map presence to ring
    }
    renderPanel(id, detail, onBoard);
  }

  const PANEL_PLACEHOLDER = 'Nothing selected yet — pick a node on the map, or let your agent drive (focus_node). Whatever either of you opens, both of you see.';

  /** Escape (or a click on empty map background) puts the board's UI back to
   *  its unselected state. Deliberately NOT ledgered and NOT a tool: closing
   *  a panel is not an act on the evidence (same reasoning as atlas.js). */
  function deselect() {
    state.selected = null;
    for (const el of nodeEls.values()) el.classList.remove('atlas-selected');
    svgRoot?.classList.remove('atlas-has-selection');
    if (mounts.panel) mounts.panel.replaceChildren(h('p', { class: 'atlas-panel-empty', text: PANEL_PLACEHOLDER }));
  }

  function wireDeselect() {
    mounts.map?.addEventListener('click', (ev) => {
      if (!ev.target?.closest?.('.atlas-node')) deselect();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && state.selected !== null) deselect();
    });
  }

  /** After an approval/rejection, refresh whatever is currently selected (if
   *  anything) — the mutation may have changed the selected node's tally or
   *  edge list, or IS the selected item finishing its own approval. A no-op
   *  when nothing is selected, or when the selected id somehow no longer
   *  resolves (never expected, but a panel should never throw). */
  function refreshSelectedPanel() {
    if (!state.selected) return;
    try {
      const detail = getNode(state.selected);
      applySelection(state.selected, detail, detail.status === 'active');
    } catch (e) { /* selected id vanished — leave the panel as it was */ }
  }

  function kv(pairs) {
    return h('table', { class: 'atlas-kv' }, [
      h('tbody', {}, pairs.filter(Boolean).map(([k, v]) => h('tr', {}, [h('th', { text: k }), h('td', { text: String(v) })]))),
    ]);
  }

  function edgeDirectionList(list, heading, otherKey) {
    const empty = h('p', { class: 'atlas-note', text: `${heading}: none` });
    if (!list.length) return empty;
    const arrow = otherKey === 'from' ? (e) => `${e[otherKey]} —${e.type}→ this` : (e) => `this —${e.type}→ ${e[otherKey]}`;
    return h('div', {}, [
      h('div', { class: 'atlas-h4', text: heading }),
      h('ul', { class: 'atlas-list' }, list.map((e) => h('li', { text: `${arrow(e)}${e.rationale ? ` — ${e.rationale}` : ''}` }))),
    ]);
  }

  /** The detail panel for one node — statement, provenance (quote/cited_as/
   *  verification for evidence), edges in/out, tally for a claim, and — for
   *  a pending item — the same fields the Approve/Reject card in the
   *  pending section shows, framed as a pointer to that live card rather
   *  than a second set of live buttons: two buttons mutating the same
   *  pending item is guarded against double-firing (see approveNode's
   *  comment) but would still leave a stale, still-clickable card sitting
   *  in whichever spot the human did NOT use — a correctness/UX tradeoff,
   *  not a spec violation, made explicit here rather than silently. */
  function renderPanel(id, detail, onBoard) {
    if (!mounts.panel) return;
    const kicker = `${detail.type}${onBoard ? '' : ' · pending human approval'}`;
    const rows = [['id', id], ['label', detail.label], ['statement', detail.statement]];
    if (detail.type === 'evidence') {
      rows.push(
        ['value', detail.value], ['year', detail.year],
        ['kind', `${detail.kind} (source kind as reported in the conversation — unverified)`],
        ['cited_as', detail.cited_as], ['quote', detail.quote],
        ['verification', detail.verification || '(pending — verification is recorded when a human approves this node)'],
      );
    }
    if (detail.type === 'claim' && onBoard) {
      rows.push(
        ['evidence_edge_state', `${TALLY_GLYPH[detail.evidence_edge_state]} ${detail.evidence_edge_state}`],
        ['tally', `${detail.tally_supports} supports / ${detail.tally_contradicts} contradicts`],
        ['tally scope', detail.tally_scope || TALLY_SCOPE],
      );
    }
    if (detail.type === 'question' && detail.test_sketch) rows.push(['test_sketch', detail.test_sketch]);

    const prov = detail.provenance;
    const provRows = prov ? [
      ['origin', prov.origin],
      prov.source ? ['source', prov.source] : null,
      prov.proposed_at ? ['proposed_at', prov.proposed_at] : null,
      prov.approved_at ? ['approved_at', prov.approved_at] : null,
    ].filter(Boolean) : [];

    const children = [kv(rows)];
    if (provRows.length) children.push(h('div', { class: 'atlas-h4', text: 'Provenance' }), kv(provRows));

    if (onBoard) {
      children.push(
        edgeDirectionList(detail.edges_in || [], 'Edges in', 'from'),
        edgeDirectionList(detail.edges_out || [], 'Edges out', 'to'),
      );
    } else {
      children.push(h('p', {
        class: 'atlas-explicit-note',
        text: `This ${detail.type} is ${detail.status === 'rejected' ? 'REJECTED — it will never appear on the board.' : 'still pending human approval — it is not yet placed on the map. Approve or reject it from its card in the Pending section below.'}`,
      }));
    }
    mounts.panel.replaceChildren(h('div', { class: 'atlas-card' }, [
      h('div', { class: 'atlas-kicker', text: kicker }),
      h('h3', { class: 'atlas-card-title', text: `${id} — ${detail.label}` }),
      ...children,
    ]));
  }

  // -------------------------------------------------------------- tools

  const tools = [
    {
      name: 'board_overview', readOnly: true,
      description: 'Orientation for agents: the research topic under examination, node/edge counts, the honesty rules that constrain what the board may claim, and which tool to reach for. Call this first.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => boardOverview(),
    },
    {
      name: 'list_nodes', readOnly: true,
      description: 'List the board\'s nodes, optionally filtered by type. Pending proposals are included inline with status:"pending" (there is no separate pending-listing tool). Claim nodes carry a computed evidence_edge_state (support_only/contradiction_only/mixed/none): edge bookkeeping over active evidence edges (preloaded seed + human-approved additions) — describing those edges, not truth adjudication.',
      inputSchema: { type: 'object', properties: { type: { type: 'string', enum: NODE_TYPES, description: 'optional: restrict to one node type' } }, additionalProperties: false },
      run: (a = {}) => listNodes(a),
    },
    {
      name: 'get_node', readOnly: true,
      description: 'Full detail for one node: statement, provenance (quote/cited_as/verification for evidence), edges in and out, and — for a claim — its computed evidence_edge_state. Accepts a bare id (e.g. "c-income") or a typed id (e.g. "claim:c-income").',
      inputSchema: { type: 'object', properties: { node_id: { type: 'string', description: 'bare or typed node id, e.g. "c-income" or "claim:c-income"' } }, required: ['node_id'], additionalProperties: false },
      run: (a = {}) => getNode(a.node_id),
    },
    {
      name: 'get_edges', readOnly: true,
      description: 'List the board\'s edges, optionally filtered to those touching one node (as either endpoint). Pending edge proposals are included inline with status:"pending".',
      inputSchema: { type: 'object', properties: { node_id: { type: 'string', description: 'optional: bare or typed node id to filter by' } }, additionalProperties: false },
      run: (a = {}) => getEdges(a),
    },
    {
      name: 'get_board_diagnostics', readOnly: true,
      description: 'The board\'s computed diagnostics panel: claims_with_mixed_edge_labels (both supporting and contradicting evidence-derived edges), claims_with_contradiction_only_edges (only contradicting evidence-derived edges — a state the endpoint/type compatibility matrix allows but the pre-D2 three-state tally could not separate from "mixed"), claims_without_incoming_evidence_edges (no evidence-derived edges at all), single_supporting_citation_label_claims ("all supporting evidence shares one exact nonempty cited_as label — a string-identity check, NOT a source-independence assessment"), hypotheses_without_linked_test_questions ("test-plan coverage — a question node linked by a tests edge — not tests performed"), every open question with its targets, and unverified_evidence_count (every evidence node lacking an explicit verified flag — currently: all evidence, seed and human-approved alike, since no verification workflow exists yet). Bookkeeping over the board\'s ACTIVE nodes/edges (preloaded seed + human-approved additions) under the endpoint/type compatibility matrix — never an assessment of the literature.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => getBoardDiagnostics(),
    },
    {
      name: 'propose_node',
      description: 'Propose adding a node to the board (hypothesis, claim, mechanism, evidence or question). Shown to the human as an approve/reject card — NOT on the board until approved. label (<=80 chars) and statement are always required for every type. Evidence additionally requires value, year (integer 1900-2100 or "n/a"), kind (source kind as reported in the conversation — unverified), cited_as AND quote (the verbatim fragment the value was read from — a number without its source text is not admissible), and accepts optional quote_origin ("conversation" default, or "primary_source") and source_locator (where in the source the quote sits) — both stored on the node\'s provenance. question accepts an optional test_sketch. A (type,label) match against an existing or pending node is flagged as possible_duplicate_of, not rejected. Newly approved evidence gets a "(proposed this session — not independently verified)" verification label at approval time.',
      inputSchema: {
        oneOf: [
          {
            type: 'object',
            properties: {
              type: { const: 'hypothesis' },
              label: { type: 'string', minLength: 1, maxLength: 80, description: 'short label, <=80 characters' },
              statement: { type: 'string', minLength: 1, description: 'full sentence; Japanese OK' },
            },
            required: ['type', 'label', 'statement'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: { const: 'claim' },
              label: { type: 'string', minLength: 1, maxLength: 80, description: 'short label, <=80 characters' },
              statement: { type: 'string', minLength: 1, description: 'full sentence; Japanese OK' },
            },
            required: ['type', 'label', 'statement'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: { const: 'mechanism' },
              label: { type: 'string', minLength: 1, maxLength: 80, description: 'short label, <=80 characters' },
              statement: { type: 'string', minLength: 1, description: 'full sentence; Japanese OK' },
            },
            required: ['type', 'label', 'statement'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: { const: 'evidence' },
              label: { type: 'string', minLength: 1, maxLength: 80, description: 'short label, <=80 characters' },
              statement: { type: 'string', minLength: 1, description: 'full sentence; Japanese OK' },
              value: { type: 'string', minLength: 1, description: 'short datum value, e.g. "東京26.4% vs 福井7.3%"' },
              year: {
                oneOf: [
                  { type: 'integer', minimum: 1900, maximum: 2100 },
                  { const: 'n/a' },
                ],
                description: 'integer year (1900-2100) or the literal string "n/a"',
              },
              kind: { type: 'string', enum: EVIDENCE_KINDS, description: 'source kind as reported in the conversation (unverified) — not an independently checked classification' },
              cited_as: { type: 'string', minLength: 1, description: 'the source name as cited in the conversation' },
              quote: { type: 'string', minLength: 1, description: 'verbatim fragment the value was read from' },
              quote_origin: { type: 'string', enum: ['conversation', 'primary_source'], description: 'where the quote text itself came from; defaults to "conversation" when omitted' },
              source_locator: { type: 'string', description: 'optional: where in the source the quote sits (e.g. a page, table or section reference)' },
            },
            required: ['type', 'label', 'statement', 'value', 'year', 'kind', 'cited_as', 'quote'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              type: { const: 'question' },
              label: { type: 'string', minLength: 1, maxLength: 80, description: 'short label, <=80 characters' },
              statement: { type: 'string', minLength: 1, description: 'full sentence; Japanese OK' },
              test_sketch: { type: 'string', description: 'optional: how it could be answered' },
            },
            required: ['type', 'label', 'statement'],
            additionalProperties: false,
          },
        ],
      },
      run: (a = {}) => proposeNode(a),
    },
    {
      name: 'propose_edge',
      description: 'Propose adding an edge between two nodes ALREADY on the board (seed or previously approved — a still-pending node cannot be an edge endpoint yet). Shown to the human as an approve/reject card — NOT on the board until approved. Validated against the fixed endpoint/type compatibility matrix — it checks node types, not inferential validity: supports/contradicts (evidence->claim, claim->hypothesis, or evidence->hypothesis), part-of (mechanism->hypothesis), tests (question->claim or question->hypothesis), refines (hypothesis->hypothesis); anything else is rejected, naming the matrix. An identical (from,to,type) triple already on the board or pending is REJECTED with a clear error, not merely flagged.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', minLength: 1, description: 'source node id, bare or typed' },
          to: { type: 'string', minLength: 1, description: 'target node id, bare or typed' },
          type: { type: 'string', enum: EDGE_TYPES },
          rationale: { type: 'string', description: 'optional note — used in the seed for a contradicts edge that needs scoping (e.g. "flow vs stock")' },
        },
        required: ['from', 'to', 'type'],
        additionalProperties: false,
      },
      run: (a = {}) => proposeEdge(a),
    },
    {
      name: 'focus_node',
      description: 'Select a node the human is looking at, returning its full detail. This is the shared surface: your exploration is visible on their screen. Changes only which node is selected — no node or edge is touched. Ledgered as navigation.',
      inputSchema: { type: 'object', properties: { node_id: { type: 'string', description: 'bare or typed node id' } }, required: ['node_id'], additionalProperties: false },
      run: (a = {}) => focusNode(a.node_id),
    },
    {
      name: 'set_topic',
      description: 'Set the research topic under examination shown at the top of the board (1-300 characters).',
      inputSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 300 } }, required: ['text'], additionalProperties: false },
      run: (a = {}) => setTopic(a),
    },
    {
      name: 'export_board',
      description: 'Export the board (nodes incl. pending, edges incl. pending, computed diagnostics, audit log) as JSON. Offers the file as a browser download and returns a receipt {filename, bytes, download_started, content_digest} by default; the JSON itself is only included when include_json is true.',
      inputSchema: { type: 'object', properties: { include_json: { type: 'boolean', description: 'return the full board JSON in the response (large); default false' } }, additionalProperties: false },
      run: (a = {}) => exportBoard(a),
    },
    {
      name: 'get_audit_log', readOnly: true,
      description: 'Return the append-only audit ledger: every proposal, approval, navigation and export in this session, in order. Each entry is {run, time, actor (human|agent|system), kind, tool, inputs, summary, board_version, result_digest}. result_digest is a non-cryptographic FNV-1a checksum for detecting accidental payload changes, not tamper evidence. The ledger is session-local: it lives in this page for this visit and is not published, synced or shared.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => getAuditLog(),
    },
  ];

  const TITLES = {
    board_overview: 'Board overview', list_nodes: 'List nodes', get_node: 'Node detail',
    get_edges: 'List edges', get_board_diagnostics: 'Board diagnostics',
    propose_node: 'Propose a node', propose_edge: 'Propose an edge',
    focus_node: 'Focus a node', set_topic: 'Set the topic',
    export_board: 'Export the board', get_audit_log: 'Audit ledger',
  };
  for (const t of tools) {
    t.title = TITLES[t.name] || t.name;
    if (t.inputSchema && t.inputSchema.additionalProperties === undefined) t.inputSchema.additionalProperties = false;
  }

  /** One entry point for WebMCP execute(), the tool console and the e2e
   *  suite. opts.actor says who is calling, so the ledger attributes
   *  honestly instead of assuming everything is an agent. */
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

  // -------------------------------------------------------- diagnostics UI
  // §2/§5's "rendered card panel" — reuses the same atlas-card/atlas-kicker
  // vocabulary the map's own detail panel uses, so the board's several
  // panels read as one system rather than two different UI languages.
  // Refreshed on every approval (renderDiscoveries is called from
  // approveNode/approveEdge) so it never sits stale. No-ops when unmounted.
  // [D1] `items` is now an array of {id,...} objects (not bare id strings) —
  // this row still displays just the ids, for the same compact reading the
  // panel always had; full detail is one get_node/get_board_diagnostics
  // call away.
  function discoveryRow(label, items) {
    const ids = items.map((it) => it.id);
    return h('li', { class: ids.length ? '' : 'le-claim-empty' }, [
      h('strong', { text: `${label} (${ids.length})` }),
      ids.length ? h('span', { text: `: ${ids.join(', ')}` }) : h('span', { text: ': none' }),
    ]);
  }

  function renderDiscoveries() {
    if (!mounts.discoveries) return;
    const d = getBoardDiagnostics();
    const openQ = d.open_questions.length
      ? d.open_questions.map((q) => `${q.question_id} → ${q.targets.join(', ') || '(no tests edge yet)'}`).join(' · ')
      : 'none';
    mounts.discoveries.replaceChildren(h('div', { class: 'atlas-card' }, [
      h('div', { class: 'atlas-kicker', text: `board version ${d.board_version} · ${d.tally_scope}` }),
      h('h3', { class: 'atlas-card-title', text: 'Computed diagnostics' }),
      h('ul', { class: 'atlas-list' }, [
        discoveryRow('claims with mixed edge labels', d.claims_with_mixed_edge_labels),
        discoveryRow('claims with contradiction-only edges', d.claims_with_contradiction_only_edges),
        discoveryRow('claims without incoming evidence edges', d.claims_without_incoming_evidence_edges),
        discoveryRow('single supporting citation label', d.single_supporting_citation_label_claims),
        discoveryRow('hypotheses without linked test questions', d.hypotheses_without_linked_test_questions),
        h('li', {}, [h('strong', { text: `open questions (${d.open_questions.length})` }), h('span', { text: `: ${openQ}` })]),
        h('li', {}, [h('strong', { text: 'unverified evidence' }), h('span', { text: `: ${d.unverified_evidence_count} of the board's evidence nodes lack an explicit verified flag` })]),
      ]),
      h('p', { class: 'atlas-note', text: d.note }),
    ]));
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
          name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
          annotations: { readOnlyHint: !!t.readOnly },
          execute: async (inputs) => invokeTool(t.name, inputs ?? {}, { actor: 'agent' }),
        });
      } catch (e) {
        failed.push(t.name);
        console.warn(`[board] registerTool(${t.name}) failed:`, e);
      }
    }
    const total = tools.length;
    const ok = total - failed.length;
    if (failed.length === 0) {
      state.agent = { active: true, status: 'active', registered: ok, total, failed: [], detail: `${ok}/${total} tools registered with the browser's WebMCP runtime.` };
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
      active: `Agent interface active — ${a.detail} Your AI can explore this board with you.`,
      degraded: `Agent interface DEGRADED — ${a.detail} Any question that needs a missing tool cannot be answered by your agent; run those from the Tool console below.`,
      absent: `Agent interface inactive — ${a.detail} You can still drive every tool by hand from the Tool console below.`,
    }[a.status] || `Agent interface inactive — ${a.detail}`;
    mounts.status.replaceChildren(
      h('span', { class: `le-status-dot ${a.active ? 'le-on' : 'le-off'}` }),
      h('span', { text }),
    );
  }

  // ---------------------------------------------------------- tool console
  function renderConsole() {
    if (!mounts.console) return;
    const out = h('pre', { class: 'le-console-out', text: 'Pick a tool, edit the arguments, press Run. Everything an agent could do on this board, you can do by hand — same tools, same ledger.' });
    const argBox = h('textarea', { class: 'le-console-args', rows: 4, spellcheck: 'false' });
    const sel = h('select', { class: 'le-console-select' }, tools.map((t) => h('option', { value: t.name, text: t.name })));
    const EXAMPLES = {
      board_overview: {}, list_nodes: { type: 'claim' }, get_edges: {}, get_board_diagnostics: {}, get_audit_log: {},
      get_node: { node_id: 'c-income' },
      propose_node: { type: 'evidence', label: '例: 新規データ', statement: '例として提案するデータ点。', value: '例 12.3%', year: 2026, kind: 'survey', cited_as: '例出典', quote: '例の引用文', quote_origin: 'conversation' },
      // e-hoiku -> h-model does not already exist on the seed (unlike e.g.
      // e-mukyo -> c-gap, which does) — this example must stay a NON-
      // duplicate edge, since propose_edge now rejects exact (from,to,type)
      // duplicates outright (D11) instead of merely flagging them.
      propose_edge: { from: 'e-hoiku', to: 'h-model', type: 'supports', rationale: '例: 保育所整備が4要因モデルの説明力を補強する、という例示。' },
      focus_node: { node_id: 'h-selection' },
      set_topic: { text: state.topic },
      export_board: { include_json: false },
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
          const res = invokeTool(sel.value, args, { actor: 'human' });
          Promise.resolve(res)
            .then((v) => { out.textContent = JSON.stringify(v, null, 2); })
            .catch((e) => { out.textContent = `ERROR: ${e.message}`; });
        } catch (e) { out.textContent = `ERROR: ${e.message}`; }
      },
    });
    mounts.console.replaceChildren(h('div', { class: 'le-console-row' }, [sel, btn]), desc, argBox, out);
  }

  // ------------------------------------------------------------------ boot
  const restored = restoreBoard();
  if (mounts.topic) mounts.topic.textContent = state.topic;
  if (mounts.reset) {
    mounts.reset.addEventListener('click', () => {
      if (!confirm('Reset this board to its seed? All proposals, approvals and the ledger saved in this browser will be deleted.')) return;
      clearPersisted();
      location.reload();
    });
  }
  renderMap();
  wireDeselect();
  deselect(); // sets the initial "nothing selected" panel placeholder
  renderDiscoveries();
  renderConsole();
  ledger({
    kind: 'init', tool: 'init', actor: 'system',
    inputs: { restored, nodes: activeNodes().length, edges: activeEdges().length },
    result: { nodes: activeNodes().length, edges: activeEdges().length, board_version: state.boardVersion },
    summary: `board ${restored ? 'restored' : 'loaded from seed'} — ${activeNodes().length} nodes, ${activeEdges().length} edges, board version ${state.boardVersion}`,
  });
  const ready = registerWebMCP().then((a) => { renderStatus(); return a; });

  const api = {
    version: '0.1.0',
    tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, readOnly: !!t.readOnly })),
    invokeTool,
    // Read-only convenience accessors for whatever renders the actual map in
    // stage 2 — pure data, no ledgering, no side effects.
    getActiveNodes: () => listActiveAndPendingNodes(),
    getActiveEdges: () => listActiveAndPendingEdges(),
    getBoardDiagnostics: () => getBoardDiagnostics(),
    state, ready,
  };
  if (typeof window !== 'undefined') window.LivingEvidenceBoard = api;
  return api;
}
