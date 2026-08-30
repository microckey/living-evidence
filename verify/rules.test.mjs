// Node tests for the declarative claim-rule language (lib/claim-rules.js).
// No DOM, no browser, no statistics engine: the rule engine is injected with a
// stub analysis executor, so a failure here is a failure of the LANGUAGE, not of
// the meta-analysis. The last block replays the six ASTs shipped in index.html
// against canned fixture results — the exemplar's verdicts are a contract.
import {
  fnv1a, resolvePath, fmtNumber, fmtValue, fmtTemplate, evaluateRules, validateTest, OPS,
} from '../lib/claim-rules.js';
import { CLAIMS } from '../data/pygmalion-claims.js';

let failures = 0;
let count = 0;
function check(name, cond, detail = '') {
  count++;
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}  ${detail}`); }
}
function throws(name, fn, re) {
  count++;
  try {
    fn();
    failures++;
    console.error(`FAIL  ${name}  (no throw)`);
  } catch (e) {
    if (!re || re.test(e.message)) console.log(`  ok  ${name}`);
    else { failures++; console.error(`FAIL  ${name}  wrong message: ${e.message}`); }
  }
}

// ---------------------------------------------------------------- fnv1a
console.log('\n# fnv1a');
// Canonical 32-bit FNV-1a vectors (ASCII input).
check('fnv1a("") = 811c9dc5', fnv1a('') === '811c9dc5', fnv1a(''));
check('fnv1a("a") = e40c292c', fnv1a('a') === 'e40c292c', fnv1a('a'));
check('fnv1a("foobar") = bf9cf968', fnv1a('foobar') === 'bf9cf968', fnv1a('foobar'));
check('always 8 hex chars', ['', 'a', 'x'.repeat(300), '≤ 1 week'].every((s) => /^[0-9a-f]{8}$/.test(fnv1a(s))));
check('stable across calls', fnv1a('{"yi":0.8,"vi":0.063}') === fnv1a('{"yi":0.8,"vi":0.063}'));
check('sensitive to a single digit', fnv1a('{"yi":0.80}') !== fnv1a('{"yi":0.81}'));
check('non-ASCII hashes deterministically', fnv1a('weeks ≤ 1') === fnv1a('weeks ≤ 1') && fnv1a('weeks ≤ 1') !== fnv1a('weeks <= 1'));

// ---------------------------------------------------------- resolvePath
console.log('\n# resolvePath');
const RES = {
  estimate: 0.0837, significant: false, moderator: { b: -0.157, p: 0.000015 },
  flips_significance: [], rows: [{ a: 1 }, { a: 2 }], nothing: null,
};
check('flat path', resolvePath(RES, 'estimate') === 0.0837);
check('nested path', resolvePath(RES, 'moderator.p') === 0.000015);
check('array .length', resolvePath(RES, 'rows.length') === 2);
check('empty array .length', resolvePath(RES, 'flips_significance.length') === 0);
check('null value resolves (does not throw)', resolvePath(RES, 'nothing') === null);
throws('missing field throws', () => resolvePath(RES, 'estimatte'), /unresolvable path/);
throws('missing nested field throws', () => resolvePath(RES, 'moderator.slope'), /no field "slope"/);
throws('path through null throws', () => resolvePath(RES, 'nothing.b'), /unresolvable path/);

// ---------------------------------------------- fmtNumber / fmtTemplate
console.log('\n# fmtTemplate');
check('4 significant digits', fmtNumber(0.083712345) === '0.08371', fmtNumber(0.083712345));
check('no trailing zeros', fmtNumber(0.0837) === '0.0837', fmtNumber(0.0837));
check('integers stay integers', fmtNumber(19) === '19' && fmtNumber(100) === '100');
check('tiny p-values survive', fmtNumber(0.000015) === '0.000015', fmtNumber(0.000015));
check('negatives', fmtNumber(-0.157) === '-0.157', fmtNumber(-0.157));
check('arrays join with ", "', fmtValue(['s04', 's05']) === 's04, s05');
check('empty array renders empty', fmtValue([]) === '');
check('booleans stringify', fmtValue(true) === 'true');
check('template substitutes numbers', fmtTemplate('SMD {estimate}, p = {moderator.p}', RES) === 'SMD 0.0837, p = 0.000015',
  fmtTemplate('SMD {estimate}, p = {moderator.p}', RES));
check('template substitutes lengths', fmtTemplate('{rows.length} re-fits', RES) === '2 re-fits');
check('template keeps unmatched braces', fmtTemplate('literal { brace }', RES) === 'literal { brace }');
throws('template with a bad path throws', () => fmtTemplate('{nope}', RES), /unresolvable path/);

// -------------------------------------------------------- evaluateRules
console.log('\n# evaluateRules');
// A stubbed analysis executor: the rule engine never touches the statistics engine.
function stub(result) {
  const fn = (name, args) => { fn.lastCall = { name, args }; return result; };
  return fn;
}

const ordered = {
  analysis: 'overall',
  args: { method: 'REML' },
  verdicts: [
    { when: [{ path: 'p', op: 'lt', value: 0.01 }], verdict: 'supported', reason: 'p = {p} < 0.01' },
    { when: [{ path: 'p', op: 'lt', value: 0.05 }], verdict: 'nuanced', reason: 'p = {p} < 0.05' },
    { default: true, verdict: 'challenged', reason: 'p = {p}' },
  ],
};
const r1 = evaluateRules(ordered, stub({ p: 0.004 }), 'c-x');
check('first matching entry wins', r1.verdict === 'supported' && r1.reason === 'p = 0.004 < 0.01', JSON.stringify(r1));
check('later entry when earlier misses', evaluateRules(ordered, stub({ p: 0.03 }), 'c-x').verdict === 'nuanced');
check('default fallthrough', evaluateRules(ordered, stub({ p: 0.4 }), 'c-x').verdict === 'challenged');
check('evidence is the raw analysis result', evaluateRules(ordered, stub({ p: 0.4, k: 19 }), 'c-x').evidence.k === 19);
const exec = stub({ p: 0.5 });
evaluateRules(ordered, exec, 'c-x');
check('analysis name and args are passed through', exec.lastCall.name === 'overall' && exec.lastCall.args.method === 'REML',
  JSON.stringify(exec.lastCall));
check('args are passed as a copy, not the AST object', exec.lastCall.args !== ordered.args);

// ALL conditions must hold
const allConds = {
  analysis: 'overall',
  verdicts: [
    { when: [{ path: 'significant', op: 'eq', value: true }, { path: 'estimate', op: 'gt', value: 0 }], verdict: 'supported', reason: 'yes' },
    { default: true, verdict: 'challenged', reason: 'no' },
  ],
};
check('AND: both hold', evaluateRules(allConds, stub({ significant: true, estimate: 0.3 }), 'c-a').verdict === 'supported');
check('AND: one fails', evaluateRules(allConds, stub({ significant: true, estimate: -0.3 }), 'c-a').verdict === 'challenged');
check('AND: other fails', evaluateRules(allConds, stub({ significant: false, estimate: 0.3 }), 'c-a').verdict === 'challenged');

// every operator
console.log('\n# operators');
const opTest = (op, value, actual) => evaluateRules({
  analysis: 'a',
  verdicts: [{ when: [{ path: 'x', op, value }], verdict: 'hit', reason: '' }, { default: true, verdict: 'miss', reason: '' }],
}, stub({ x: actual }), 'c-op').verdict === 'hit';
check('op list is complete', OPS.join(',') === 'lt,le,gt,ge,eq,ne,abs_lt,abs_ge', OPS.join(','));
check('lt', opTest('lt', 1, 0.5) && !opTest('lt', 1, 1) && !opTest('lt', 1, 2));
check('le', opTest('le', 1, 1) && opTest('le', 1, 0.5) && !opTest('le', 1, 1.5));
check('gt', opTest('gt', 0, 0.5) && !opTest('gt', 0, 0) && !opTest('gt', 0, -1));
check('ge', opTest('ge', 90, 90) && opTest('ge', 90, 100) && !opTest('ge', 90, 89.9));
check('eq', opTest('eq', 0, 0) && !opTest('eq', 0, 1));
check('eq is strict (no coercion)', evaluateRules({
  analysis: 'a',
  verdicts: [{ when: [{ path: 'x', op: 'eq', value: 0 }], verdict: 'hit', reason: '' }, { default: true, verdict: 'miss', reason: '' }],
}, stub({ x: '0' }), 'c-op').verdict === 'miss');
check('eq on booleans', opTest('eq', true, true) && !opTest('eq', true, false));
check('ne', opTest('ne', 0, 1) && !opTest('ne', 0, 0));
check('abs_lt', opTest('abs_lt', 0.2, -0.15) && opTest('abs_lt', 0.2, 0.15) && !opTest('abs_lt', 0.2, -0.25));
check('abs_ge', opTest('abs_ge', 0.2, -0.25) && opTest('abs_ge', 0.2, 0.2) && !opTest('abs_ge', 0.2, 0.1));
check('numeric op against null does not match (and does not throw)', !opTest('ge', 90, null));
throws('unknown op throws naming the claim', () => evaluateRules({
  analysis: 'a',
  verdicts: [{ when: [{ path: 'x', op: 'approximately', value: 1 }], verdict: 'hit', reason: '' }, { default: true, verdict: 'miss', reason: '' }],
}, stub({ x: 1 }), 'c-bogus'), /c-bogus.*unknown op "approximately"/);
throws('unresolvable path throws naming the claim', () => evaluateRules({
  analysis: 'a',
  verdicts: [{ when: [{ path: 'nope', op: 'gt', value: 1 }], verdict: 'hit', reason: '' }, { default: true, verdict: 'miss', reason: '' }],
}, stub({ x: 1 }), 'c-typo'), /c-typo.*unresolvable path "nope"/);

// focus
console.log('\n# focus');
const focusTest = {
  analysis: 'subgroup',
  args: { split_field: 'weeks', split_at: 1 },
  focus: { collection: 'groups', match_field: 'group', match_substring: '≤ 1' },
  verdicts: [
    { when: [{ path: 'f.estimate', op: 'gt', value: 0 }], verdict: 'supported', reason: 'k={f.k}, SMD {f.estimate}' },
    { default: true, verdict: 'challenged', reason: 'SMD {f.estimate}' },
  ],
};
const groupsResult = {
  groups: [
    { group: 'weeks > 1', k: 12, estimate: -0.02, significant: false },
    { group: 'weeks ≤ 1', k: 7, estimate: 0.354, significant: true },
  ],
};
const rf = evaluateRules(focusTest, stub(groupsResult), 'c-window');
check('focus selects the matching element', rf.verdict === 'supported' && rf.reason === 'k=7, SMD 0.354', JSON.stringify(rf));
check('focus picks the FIRST match', evaluateRules(focusTest, stub({
  groups: [{ group: 'weeks ≤ 1 (a)', k: 1, estimate: 1 }, { group: 'weeks ≤ 1 (b)', k: 2, estimate: -1 }],
}), 'c-window').reason === 'k=1, SMD 1');
throws('focus with no match throws naming the claim', () => evaluateRules(focusTest, stub({
  groups: [{ group: 'weeks > 1', k: 19, estimate: 0.1 }],
}), 'c-window'), /c-window.*focus matched nothing/);
throws('focus on a non-array throws', () => evaluateRules(focusTest, stub({ groups: 'not an array' }), 'c-window'), /not an array/);
check('ctx.f does not leak into evidence', !('f' in rf.evidence));

// validation
console.log('\n# validation');
throws('missing default entry rejected', () => validateTest({
  analysis: 'overall',
  verdicts: [{ when: [{ path: 'p', op: 'lt', value: 0.05 }], verdict: 'supported', reason: '' }],
}, 'c-nodefault'), /c-nodefault.*last verdict entry must be/);
throws('evaluateRules also rejects a missing default', () => evaluateRules({
  analysis: 'overall',
  verdicts: [{ when: [{ path: 'p', op: 'lt', value: 0.05 }], verdict: 'supported', reason: '' }],
}, stub({ p: 0.5 }), 'c-nodefault'), /last verdict entry must be/);
throws('default not last rejected', () => validateTest({
  analysis: 'overall',
  verdicts: [{ default: true, verdict: 'a', reason: '' }, { default: true, verdict: 'b', reason: '' }],
}, 'c-x'), /not last/);
// A `when` on the default entry would be silently ignored by evaluateRules — the
// rule would read as conditional and run as unconditional. That must not validate.
throws('default entry carrying a "when" rejected', () => validateTest({
  analysis: 'overall',
  verdicts: [
    { when: [{ path: 'p', op: 'lt', value: 0.05 }], verdict: 'supported', reason: '' },
    { default: true, when: [{ path: 'p', op: 'ge', value: 0.05 }], verdict: 'challenged', reason: '' },
  ],
}, 'c-defaultwhen'), /c-defaultwhen: the default entry cannot carry conditions/);
throws('evaluateRules also rejects a conditional default', () => evaluateRules({
  analysis: 'overall',
  verdicts: [{ default: true, when: [{ path: 'p', op: 'lt', value: 0.05 }], verdict: 'a', reason: '' }],
}, stub({ p: 0.5 }), 'c-defaultwhen'), /default entry cannot carry conditions/);
throws('empty verdicts rejected', () => validateTest({ analysis: 'overall', verdicts: [] }, 'c-x'), /non-empty array/);
throws('missing analysis rejected', () => validateTest({ verdicts: [{ default: true, verdict: 'a' }] }, 'c-x'), /analysis/);
throws('malformed cond rejected', () => validateTest({
  analysis: 'overall',
  verdicts: [{ when: [{ path: 'p', op: 'lt' }], verdict: 'a', reason: '' }, { default: true, verdict: 'b', reason: '' }],
}, 'c-x'), /must be \{ path, op, value \}/);
throws('unknown op rejected at validation', () => validateTest({
  analysis: 'overall',
  verdicts: [{ when: [{ path: 'p', op: 'roughly', value: 1 }], verdict: 'a', reason: '' }, { default: true, verdict: 'b', reason: '' }],
}, 'c-x'), /unknown op "roughly"/);
throws('empty when rejected', () => validateTest({
  analysis: 'overall',
  verdicts: [{ when: [], verdict: 'a', reason: '' }, { default: true, verdict: 'b', reason: '' }],
}, 'c-x'), /non-empty "when"/);
throws('bad focus shape rejected', () => validateTest({
  analysis: 'subgroup', focus: { collection: 'groups' },
  verdicts: [{ default: true, verdict: 'a', reason: '' }],
}, 'c-x'), /focus\.match_field/);
check('a well-formed test validates', validateTest(focusTest, 'c-window') === true);
throws('a missing executor is refused', () => evaluateRules(ordered, null, 'c-x'), /runAnalysis executor/);
throws('an analysis returning nothing is refused', () => evaluateRules(ordered, () => undefined, 'c-x'), /returned no result object/);

// ---------------------------------------------------- the shipped ASTs
// Copied from index.html (they are data now). Drift between these fixtures and the
// page is caught by verify/e2e.mjs, which evaluates the real claims in a browser.
console.log('\n# index.html claim ASTs vs canned fixtures');

const SHIPPED = {
  'c-textbook': {
    analysis: 'overall',
    args: { method: 'REML' },
    verdicts: [
      { when: [{ path: 'significant', op: 'eq', value: true }, { path: 'estimate', op: 'gt', value: 0 }], verdict: 'supported', reason: 'pooled SMD {estimate}, p = {p} < 0.05' },
      { default: true, verdict: 'challenged', reason: 'pooled SMD {estimate} [{ci_lower}, {ci_upper}], p = {p} — the general claim is not supported across the full evidence base' },
    ],
  },
  'c-overall': {
    analysis: 'overall',
    args: {},
    verdicts: [
      { when: [{ path: 'significant', op: 'eq', value: false }, { path: 'estimate', op: 'abs_lt', value: 0.2 }], verdict: 'supported', reason: 'pooled SMD {estimate} (|SMD| < 0.2), p = {p} ≥ 0.05' },
      { when: [{ path: 'significant', op: 'eq', value: true }], verdict: 'challenged', reason: 'pooled effect IS significant (p = {p})' },
      { default: true, verdict: 'nuanced', reason: 'not significant, but |SMD| ({estimate}) ≥ 0.2' },
    ],
  },
  'c-moderator': {
    analysis: 'metareg',
    args: { moderator: 'weeks', cap: 3 },
    verdicts: [
      { when: [{ path: 'moderator.b', op: 'lt', value: 0 }, { path: 'moderator.p', op: 'lt', value: 0.05 }, { path: 'R2_percent', op: 'ge', value: 90 }], verdict: 'supported', reason: 'slope {moderator.b} per week (p = {moderator.p}), R² = {R2_percent}% of between-study heterogeneity explained' },
      { when: [{ path: 'moderator.b', op: 'lt', value: 0 }, { path: 'moderator.p', op: 'lt', value: 0.05 }], verdict: 'nuanced', reason: 'slope significant ({moderator.b}, p = {moderator.p}) but explains only {R2_percent}% of heterogeneity' },
      { when: [{ path: 'moderator.p', op: 'lt', value: 0.05 }, { path: 'moderator.b', op: 'ge', value: 0 }], verdict: 'challenged', reason: 'slope is statistically significant but nonnegative ({moderator.b}, p = {moderator.p}) — contrary to the claimed negative association' },
      { default: true, verdict: 'challenged', reason: 'the required negative association was not detected (slope {moderator.b}, p = {moderator.p})' },
    ],
  },
  'c-window': {
    analysis: 'subgroup',
    args: { split_field: 'weeks', split_at: 1 },
    focus: { collection: 'groups', match_field: 'group', match_substring: '≤ 1' },
    verdicts: [
      { when: [{ path: 'f.estimate', op: 'gt', value: 0 }, { path: 'f.significant', op: 'eq', value: true }], verdict: 'supported', reason: '≤1-week subgroup (k={f.k}): SMD {f.estimate} [{f.ci_lower}, {f.ci_upper}], p = {f.p}' },
      { default: true, verdict: 'challenged', reason: '≤1-week subgroup not significantly positive (SMD {f.estimate}, p = {f.p})' },
    ],
  },
  'c-robust': {
    analysis: 'loo',
    args: {},
    verdicts: [
      { when: [{ path: 'flips_significance.length', op: 'eq', value: 0 }], verdict: 'supported', reason: '{rows.length} re-fits, estimates {min_estimate}…{max_estimate}, no significance flips' },
      { default: true, verdict: 'challenged', reason: 'omitting {flips_significance} flips the conclusion' },
    ],
  },
  'c-bias': {
    analysis: 'funnel',
    args: {},
    verdicts: [
      { when: [{ path: 'p', op: 'ge', value: 0.10 }], verdict: 'supported', reason: 'Egger’s test p = {p} — no indication of small-study asymmetry' },
      { when: [{ path: 'p', op: 'ge', value: 0.05 }], verdict: 'nuanced', reason: 'Egger’s test p = {p}: not significant at α = 0.05, but borderline — “no signs of publication bias” overstates the confidence this test supports' },
      { default: true, verdict: 'challenged', reason: 'Egger’s test p = {p} < 0.05 — significant small-study asymmetry' },
    ],
  },
};

for (const [id, test] of Object.entries(SHIPPED)) check(`${id} AST is well-formed`, validateTest(test, id) === true);

// The fixtures above are a hand-copy. A copy that drifts from the module silently
// stops testing the shipped rules, so it is held to the module both pages boot from.
const MODULE_TESTS = Object.fromEntries(CLAIMS.map((c) => [c.id, c.test]));
check('the fixtures cover exactly the shipped claim ids',
  JSON.stringify(Object.keys(SHIPPED)) === JSON.stringify(Object.keys(MODULE_TESTS)), Object.keys(MODULE_TESTS).join(','));
for (const id of Object.keys(SHIPPED)) {
  check(`${id} fixture is byte-identical to data/pygmalion-claims.js`,
    JSON.stringify(SHIPPED[id]) === JSON.stringify(MODULE_TESTS[id]),
    `module: ${JSON.stringify(MODULE_TESTS[id])}`);
}

// Fixtures = the real Raudenbush(1985) numbers this document ships with
// (goldens cross-checked against R metafor in verify/stats.test.mjs).
const SHIPPED_FIXTURES = {
  overall: { model: 'random-effects (REML)', k: 19, estimate: 0.0837, se: 0.0518, p: 0.1058, ci_lower: -0.0179, ci_upper: 0.1852, significant: false, tau2: 0.0188, I2: 41.84 },
  metareg: { k: 19, R2_percent: 100, moderator: { b: -0.157, se: 0.0362, p: 0.000015, ci_lower: -0.228, ci_upper: -0.0861 }, intercept: { b: 0.407 } },
  subgroup: {
    groups: [
      { group: 'weeks > 1', k: 12, estimate: -0.0192, ci_lower: -0.0824, ci_upper: 0.044, p: 0.5513, significant: false },
      { group: 'weeks ≤ 1', k: 7, estimate: 0.3379, ci_lower: 0.1758, ci_upper: 0.4999, p: 0.0000432, significant: true },
    ],
  },
  loo: { full_estimate: 0.0837, min_estimate: 0.0621, max_estimate: 0.0949, flips_significance: [], rows: new Array(19).fill({}) },
  funnel: { intercept: -0.3562, p: 0.0574, df: 17, asymmetry_detected: false },
};
const shippedExec = (name) => {
  const fixture = SHIPPED_FIXTURES[name];
  if (!fixture) throw new Error(`no fixture for analysis "${name}"`);
  return fixture;
};

const EXPECTED = {
  'c-textbook': 'challenged', 'c-overall': 'supported', 'c-moderator': 'supported',
  'c-window': 'supported', 'c-robust': 'supported', 'c-bias': 'nuanced',
};
for (const [id, expected] of Object.entries(EXPECTED)) {
  const out = evaluateRules(SHIPPED[id], shippedExec, id);
  check(`${id} → ${expected}`, out.verdict === expected, `${out.verdict}: ${out.reason}`);
  check(`${id} reason renders numbers`, /\d/.test(out.reason) && !/[{}]/.test(out.reason), out.reason);
}

// The document must be able to LOSE against its own checks — and to change its mind
// when the evidence changes. Same ASTs, different (hypothetical) evidence base:
const flipped = evaluateRules(SHIPPED['c-textbook'], () => ({ significant: true, estimate: 0.31, p: 0.004, ci_lower: 0.1, ci_upper: 0.52 }), 'c-textbook');
check('c-textbook flips to supported on different evidence', flipped.verdict === 'supported' && flipped.reason === 'pooled SMD 0.31, p = 0.004 < 0.05', JSON.stringify(flipped));
const biasBad = evaluateRules(SHIPPED['c-bias'], () => ({ p: 0.01 }), 'c-bias');
check('c-bias goes challenged when Egger p < 0.05', biasBad.verdict === 'challenged');
const robustBad = evaluateRules(SHIPPED['c-robust'], () => ({ flips_significance: ['s04', 's09'], rows: new Array(19).fill({}), min_estimate: 0.01, max_estimate: 0.2 }), 'c-robust');
check('c-robust goes challenged and names the studies', robustBad.verdict === 'challenged' && robustBad.reason === 'omitting s04, s09 flips the conclusion', robustBad.reason);
const modNuanced = evaluateRules(SHIPPED['c-moderator'], () => ({ R2_percent: 40, moderator: { b: -0.1, p: 0.01 } }), 'c-moderator');
check('c-moderator goes nuanced when R² is low', modNuanced.verdict === 'nuanced' && /only 40%/.test(modNuanced.reason), modNuanced.reason);
// A slope that is significant but points the WRONG WAY used to fall through to the
// default and be reported as "moderator not significant" — a real mislabelling: the
// association WAS detected, it just contradicted the claim. That branch is now
// explicit, and this fixture is what proves it fires.
const modWrongWay = evaluateRules(SHIPPED['c-moderator'], () => ({ R2_percent: 95, moderator: { b: 0.21, p: 0.001 } }), 'c-moderator');
check('c-moderator: a significant POSITIVE slope is challenged, not "not significant"',
  modWrongWay.verdict === 'challenged' && /significant but nonnegative/.test(modWrongWay.reason)
  && !/not significant/.test(modWrongWay.reason) && !/was not detected/.test(modWrongWay.reason),
  modWrongWay.reason);
check('c-moderator: the wrong-way reason quotes the slope and its p', modWrongWay.reason.includes('0.21') && modWrongWay.reason.includes('0.001'), modWrongWay.reason);
// b = 0 exactly is nonnegative too — the branch uses ge, so a significant flat slope
// lands there rather than in the "not detected" default.
const modFlatSig = evaluateRules(SHIPPED['c-moderator'], () => ({ R2_percent: 0, moderator: { b: 0, p: 0.02 } }), 'c-moderator');
check('c-moderator: a significant ZERO slope also hits the nonnegative branch',
  modFlatSig.verdict === 'challenged' && /significant but nonnegative/.test(modFlatSig.reason), modFlatSig.reason);
// …and a genuinely null result still reaches the default, with its corrected wording.
const modNull = evaluateRules(SHIPPED['c-moderator'], () => ({ R2_percent: 3, moderator: { b: -0.02, p: 0.62 } }), 'c-moderator');
check('c-moderator: a non-significant slope falls to the default "not detected" reason',
  modNull.verdict === 'challenged' && /the required negative association was not detected/.test(modNull.reason), modNull.reason);
const windowBad = evaluateRules(SHIPPED['c-window'], () => ({
  groups: [{ group: 'weeks ≤ 1', k: 7, estimate: 0.05, ci_lower: -0.2, ci_upper: 0.3, p: 0.6, significant: false }],
}), 'c-window');
check('c-window goes challenged when the subgroup is n.s.', windowBad.verdict === 'challenged', windowBad.reason);
const overallNuanced = evaluateRules(SHIPPED['c-overall'], () => ({ significant: false, estimate: 0.25, p: 0.3 }), 'c-overall');
check('c-overall goes nuanced on a big but n.s. effect', overallNuanced.verdict === 'nuanced', overallNuanced.reason);

if (failures) { console.error(`\n${failures} of ${count} FAILED`); process.exit(1); }
console.log(`\nrules.test.mjs: all green (${count} assertions)`);
