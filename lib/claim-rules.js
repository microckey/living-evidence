// claim-rules.js — the declarative claim-check language of the Living Evidence format.
//
// A claim's machine check is DATA, not code:
//
//   { analysis: 'overall', args: { method: 'REML' },
//     focus?: { collection, match_field, match_substring },
//     verdicts: [ { when: [Cond, …], verdict, reason }, …, { default: true, verdict, reason } ] }
//
//   Cond = { path, op: 'lt'|'le'|'gt'|'ge'|'eq'|'ne'|'abs_lt'|'abs_ge', value }
//
// There are no code strings and no eval anywhere in this module. That is the point:
// a claim can be listed, diffed, transported and audited by an agent without anyone
// executing anything, and the rule an agent reads is byte-identical to the rule the
// page runs. This module is pure (no DOM, no imports) so it is node-testable and
// safe to inline into an exported single-file document.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** 32-bit FNV-1a over the bytes of `str`, as an 8-hex-character string. */
export function fnv1a(str) {
  const s = String(str);
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = Math.imul(h ^ (c & 0xff), FNV_PRIME);
    if (c > 0xff) h = Math.imul(h ^ (c >>> 8), FNV_PRIME);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Read a dotted path out of a result object: 'estimate', 'moderator.p',
 * 'f.estimate', 'flips_significance.length'. Throws if the path does not exist
 * (a typo in a rule must fail loudly, never silently evaluate to undefined).
 */
export function resolvePath(obj, path) {
  const parts = String(path).split('.');
  let cur = obj;
  for (const key of parts) {
    if (cur === null || cur === undefined) {
      throw new Error(`unresolvable path "${path}": "${key}" reached a ${cur === null ? 'null' : 'missing'} value`);
    }
    if (!(key in Object(cur))) throw new Error(`unresolvable path "${path}": no field "${key}"`);
    cur = cur[key];
  }
  return cur;
}

/** Numbers to ~4 significant digits, without trailing-zero noise. */
export function fmtNumber(x) {
  if (!Number.isFinite(x)) return String(x);
  if (Number.isInteger(x)) return String(x);
  return String(Number(x.toPrecision(4)));
}

/** Render one resolved value for a reason string: numbers trimmed, arrays joined. */
export function fmtValue(v) {
  if (Array.isArray(v)) return v.map(fmtValue).join(', ');
  if (typeof v === 'number') return fmtNumber(v);
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  return String(v);
}

/** '{estimate}' → fmtValue(resolvePath(ctx, 'estimate')). Unknown paths throw. */
export function fmtTemplate(tpl, ctx) {
  return String(tpl).replace(/\{([A-Za-z0-9_$.]+)\}/g, (_, path) => fmtValue(resolvePath(ctx, path)));
}

const NUMERIC_OPS = {
  lt: (a, b) => a < b,
  le: (a, b) => a <= b,
  gt: (a, b) => a > b,
  ge: (a, b) => a >= b,
  abs_lt: (a, b) => Math.abs(a) < b,
  abs_ge: (a, b) => Math.abs(a) >= b,
};
const EQUALITY_OPS = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
};

/** Every operator the rule language understands, in documentation order. */
export const OPS = ['lt', 'le', 'gt', 'ge', 'eq', 'ne', 'abs_lt', 'abs_ge'];

function isCond(c) {
  return !!c && typeof c === 'object' && typeof c.path === 'string' && typeof c.op === 'string' && 'value' in c;
}

/**
 * Shape validation for a claim test. Called at claim registration (and again by
 * evaluateRules) so a malformed rule fails when it is authored, not when a reader
 * asks the question. `label` names the claim in every error message.
 */
export function validateTest(test, label = '(claim)') {
  if (!test || typeof test !== 'object' || Array.isArray(test)) throw new Error(`${label}: test must be an object`);
  if (typeof test.analysis !== 'string' || !test.analysis) throw new Error(`${label}: test.analysis must be an analysis name`);
  if (test.args !== undefined && (test.args === null || typeof test.args !== 'object' || Array.isArray(test.args))) {
    throw new Error(`${label}: test.args must be an object`);
  }
  if (test.focus !== undefined) {
    const f = test.focus;
    if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error(`${label}: test.focus must be an object`);
    for (const k of ['collection', 'match_field', 'match_substring']) {
      if (typeof f[k] !== 'string' || !f[k]) throw new Error(`${label}: test.focus.${k} must be a non-empty string`);
    }
  }
  const vs = test.verdicts;
  if (!Array.isArray(vs) || vs.length === 0) throw new Error(`${label}: test.verdicts must be a non-empty array`);
  vs.forEach((v, i) => {
    if (!v || typeof v !== 'object') throw new Error(`${label}: verdicts[${i}] must be an object`);
    if (typeof v.verdict !== 'string' || !v.verdict) throw new Error(`${label}: verdicts[${i}].verdict must be a string`);
    if (v.reason !== undefined && typeof v.reason !== 'string') throw new Error(`${label}: verdicts[${i}].reason must be a string`);
    const last = i === vs.length - 1;
    if (last) {
      if (v.default !== true) throw new Error(`${label}: the last verdict entry must be { default: true } — every claim needs a fallthrough verdict`);
      // evaluateRules matches the default entry unconditionally, so a `when` on it
      // would be silently ignored — exactly the kind of rule that reads as if it
      // says one thing and runs as another. Reject it at authoring time.
      if (v.when !== undefined) throw new Error(`${label}: the default entry cannot carry conditions — verdicts[${i}] has a "when" that would never be evaluated`);
      return;
    }
    if (v.default === true) throw new Error(`${label}: verdicts[${i}] has default:true but is not last — nothing after it could ever match`);
    if (!Array.isArray(v.when) || v.when.length === 0) throw new Error(`${label}: verdicts[${i}] needs a non-empty "when" array`);
    v.when.forEach((c, j) => {
      if (!isCond(c)) throw new Error(`${label}: verdicts[${i}].when[${j}] must be { path, op, value }`);
      if (!OPS.includes(c.op)) throw new Error(`${label}: unknown op "${c.op}" in verdicts[${i}].when[${j}] (expected one of ${OPS.join(', ')})`);
    });
  });
  return true;
}

function resolveFor(ctx, path, label) {
  try {
    return resolvePath(ctx, path);
  } catch (e) {
    throw new Error(`${label}: ${e.message}`);
  }
}

function evalCond(cond, ctx, label) {
  if (!isCond(cond)) throw new Error(`${label}: malformed condition ${JSON.stringify(cond)}`);
  const { path, op, value } = cond;
  if (!OPS.includes(op)) throw new Error(`${label}: unknown op "${op}" (expected one of ${OPS.join(', ')})`);
  const actual = resolveFor(ctx, path, label);
  if (op in EQUALITY_OPS) return EQUALITY_OPS[op](actual, value);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}: op "${op}" needs a numeric value, got ${JSON.stringify(value)}`);
  }
  // A numeric comparison against a non-number (e.g. R2_percent === null when there
  // is no heterogeneity to explain) simply does not hold — it is not a rule error.
  if (typeof actual !== 'number' || !Number.isFinite(actual)) return false;
  return NUMERIC_OPS[op](actual, value);
}

/**
 * Run a claim's machine check.
 *
 * test        = { analysis, args?, focus?, verdicts }
 * runAnalysis = (analysisName, args) => result object (injected — in the page it
 *               calls the analyses registry, in tests a stub, so this module never
 *               needs the statistics engine or the DOM).
 * label       = claim id, used in every error message.
 *
 * ctx = { ...result } plus, when `focus` is given, ctx.f = the first element of
 * result[collection] whose match_field contains match_substring.
 * Verdicts are walked in order; a `when` entry matches iff ALL of its conditions
 * hold; the last entry is the default.
 */
export function evaluateRules(test, runAnalysis, label) {
  const id = label || (test && (test.id || test.claim_id)) || '(claim)';
  validateTest(test, id);
  if (typeof runAnalysis !== 'function') throw new Error(`${id}: runAnalysis executor is required`);

  const result = runAnalysis(test.analysis, { ...(test.args || {}) });
  if (!result || typeof result !== 'object') throw new Error(`${id}: analysis "${test.analysis}" returned no result object`);

  const ctx = { ...result };
  if (test.focus) {
    const { collection, match_field, match_substring } = test.focus;
    const list = resolveFor(result, collection, id);
    if (!Array.isArray(list)) throw new Error(`${id}: focus collection "${collection}" is not an array`);
    const found = list.find((el) => el && String(el[match_field]).includes(match_substring));
    if (!found) {
      throw new Error(`${id}: focus matched nothing — no element of "${collection}" has ${match_field} containing "${match_substring}"`);
    }
    ctx.f = found;
  }

  for (const v of test.verdicts) {
    const matched = v.default === true || (v.when || []).every((c) => evalCond(c, ctx, id));
    if (matched) {
      return { verdict: v.verdict, reason: fmtTemplate(v.reason ?? '', ctx), evidence: result };
    }
  }
  // validateTest guarantees a default entry, so this is defence in depth.
  throw new Error(`${id}: no verdict matched and no default entry was present`);
}
