import { eggerTest, metaAnalyze } from './meta-stats.js';

export const BENCHMARK_BASELINE = Object.freeze({
  version: '2026-09-04.v1',
  file: 'docs/benchmark-baseline.pdf',
  sha256: '9ef53847f62ab86adb322876c21a7a0b008baa19f2425f32004819ccfa82eb49',
});

export const BENCHMARK_PROMPT = `Using only the supplied evidence artifact (do not search the web), return exactly one JSON object and no prose.

1. Fit the full 19-record dataset with a random-effects meta-analysis using REML. Return k, estimate, ci_lower, ci_upper, and p.
2. Refit the same model after excluding record s04. Return k, estimate, ci_lower, ci_upper, p, and excluded: ["s04"].
3. Run Egger's regression test on the full dataset. Return egger_p and apply this registered rule: passed if p >= 0.10, failed if p < 0.05, otherwise inconclusive.

Required shape:
{"overall":{"k":0,"estimate":0,"ci_lower":0,"ci_upper":0,"p":0},"exclude_s04":{"k":0,"estimate":0,"ci_lower":0,"ci_upper":0,"p":0,"excluded":["s04"]},"bias":{"egger_p":0,"rule_outcome":"passed|failed|inconclusive"}}`;

const NUMBER_TOLERANCE = 0.0005;
const EGGER_TOLERANCE = 0.000005;

function biasRuleOutcome(p) {
  if (p >= 0.1) return 'passed';
  if (p < 0.05) return 'failed';
  return 'inconclusive';
}

export function buildReference(studies) {
  const overall = metaAnalyze(studies, { method: 'REML' });
  const withoutS04 = studies.filter((study) => study.id !== 's04');
  if (withoutS04.length !== studies.length - 1) throw new Error('benchmark requires record s04 exactly once');
  const excludeS04 = metaAnalyze(withoutS04, { method: 'REML' });
  const egger = eggerTest(studies);
  return {
    overall: {
      k: overall.k,
      estimate: overall.estimate,
      ci_lower: overall.ci_lower,
      ci_upper: overall.ci_upper,
      p: overall.p,
    },
    exclude_s04: {
      k: excludeS04.k,
      estimate: excludeS04.estimate,
      ci_lower: excludeS04.ci_lower,
      ci_upper: excludeS04.ci_upper,
      p: excludeS04.p,
      excluded: ['s04'],
    },
    bias: {
      egger_p: egger.p,
      rule_outcome: biasRuleOutcome(egger.p),
    },
  };
}

function readPath(value, path) {
  let cursor = value;
  for (const key of path.split('.')) {
    if (!cursor || typeof cursor !== 'object' || !(key in cursor)) return { present: false, value: undefined };
    cursor = cursor[key];
  }
  return { present: true, value: cursor };
}

function exact(actual, expected) {
  return actual === expected;
}

function near(actual, expected, tolerance) {
  return typeof actual === 'number' && Number.isFinite(actual)
    && Math.abs(actual - expected) <= tolerance + Number.EPSILON * Math.max(1, Math.abs(expected));
}

function sameStringArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export function scoreRun(raw, reference) {
  let answer;
  try {
    answer = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error) {
    return { status: 'parse_error', score: null, total: null, message: `Invalid JSON: ${error.message}` };
  }
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return { status: 'parse_error', score: null, total: null, message: 'The answer must be one JSON object.' };
  }

  const specs = [
    ['overall.k', exact, 0],
    ['overall.estimate', near, NUMBER_TOLERANCE],
    ['overall.ci_lower', near, NUMBER_TOLERANCE],
    ['overall.ci_upper', near, NUMBER_TOLERANCE],
    ['overall.p', near, NUMBER_TOLERANCE],
    ['exclude_s04.k', exact, 0],
    ['exclude_s04.estimate', near, NUMBER_TOLERANCE],
    ['exclude_s04.ci_lower', near, NUMBER_TOLERANCE],
    ['exclude_s04.ci_upper', near, NUMBER_TOLERANCE],
    ['exclude_s04.p', near, NUMBER_TOLERANCE],
    ['exclude_s04.excluded', sameStringArray, 0],
    ['bias.egger_p', near, EGGER_TOLERANCE],
    ['bias.rule_outcome', exact, 0],
  ];

  const checks = specs.map(([path, compare, tolerance]) => {
    const actual = readPath(answer, path);
    const expected = readPath(reference, path).value;
    const pass = actual.present && compare(actual.value, expected, tolerance);
    return { path, pass, actual: actual.present ? actual.value : null, expected, tolerance };
  });
  const score = checks.filter((item) => item.pass).length;
  return {
    status: 'scored',
    score,
    total: checks.length,
    proportion: score / checks.length,
    checks,
  };
}

export function summarizeRuns(runs) {
  const scored = runs.filter((run) => run?.status === 'scored');
  if (!scored.length) return { n: 0, mean: null, range: null };
  const values = scored.map((run) => run.proportion);
  return {
    n: scored.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    range: [Math.min(...values), Math.max(...values)],
  };
}

function renderScore(mount, result) {
  if (result.status === 'parse_error') {
    mount.className = 'le-benchmark-result le-benchmark-error';
    mount.textContent = result.message;
    return;
  }
  const failures = result.checks.filter((item) => !item.pass).map((item) => item.path);
  mount.className = 'le-benchmark-result';
  mount.replaceChildren();
  const summary = document.createElement('strong');
  summary.textContent = `${result.score}/${result.total} fields correct (${(100 * result.proportion).toFixed(1)}%)`;
  mount.appendChild(summary);
  if (failures.length) {
    const detail = document.createElement('span');
    detail.textContent = ` Check: ${failures.join(', ')}.`;
    mount.appendChild(detail);
  }
}

export function initComparisonEval({ studies }) {
  const root = document.getElementById('le-comparison-eval');
  if (!root) return null;
  const reference = buildReference(studies);
  const prompt = root.querySelector('[data-benchmark-prompt]');
  if (prompt) prompt.textContent = BENCHMARK_PROMPT;
  const hash = root.querySelector('[data-benchmark-hash]');
  if (hash) hash.textContent = BENCHMARK_BASELINE.sha256;

  const conditions = ['pdf', 'webmcp'];
  const results = {};
  for (const condition of conditions) {
    const textarea = root.querySelector(`[data-benchmark-answer="${condition}"]`);
    const output = root.querySelector(`[data-benchmark-result="${condition}"]`);
    root.querySelector(`[data-benchmark-score="${condition}"]`)?.addEventListener('click', () => {
      results[condition] = scoreRun(textarea.value, reference);
      renderScore(output, results[condition]);
      const status = root.querySelector('[data-benchmark-status]');
      status.textContent = 'Local descriptive scores only. No latency, token-cost, or population-level performance claim is inferred.';
    });
  }

  root.querySelector('[data-benchmark-copy]')?.addEventListener('click', async (event) => {
    try {
      await navigator.clipboard.writeText(BENCHMARK_PROMPT);
      event.currentTarget.textContent = 'Copied';
    } catch {
      event.currentTarget.textContent = 'Select the prompt and copy';
    }
  });
  return { reference, results };
}
