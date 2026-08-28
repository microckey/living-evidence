// meta-stats.js — self-contained meta-analysis engine (no dependencies, no DOM).
//
// Design rule of the Living Evidence format: THE PAGE COMPUTES, THE AGENT JUDGES.
// Every number shown in the document or returned through a WebMCP tool comes from
// this module — never from an LLM's arithmetic. Methods follow standard
// random-effects meta-analysis (DerSimonian-Laird and REML tau^2 estimation);
// reference implementation for validation is R's `metafor` (Viechtbauer 2010).

// ---------- special functions ----------

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lnGamma(x) {
  if (x < 0.5) {
    // reflection
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularized lower incomplete gamma P(a,x) (series) and upper Q(a,x) (continued fraction).
function gammaPSeries(a, x) {
  let sum = 1 / a, term = sum;
  for (let n = 1; n < 500; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

function gammaQCF(a, x) {
  // Lentz's algorithm
  const FPMIN = 1e-300;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

export function gammaP(a, x) {
  if (x <= 0) return 0;
  return x < a + 1 ? gammaPSeries(a, x) : 1 - gammaQCF(a, x);
}
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  return x < a + 1 ? 1 - gammaPSeries(a, x) : gammaQCF(a, x);
}

/** Survival function of the chi-square distribution: P(X > x) with df degrees of freedom. */
export function chiSqSf(x, df) {
  if (x <= 0) return 1;
  return gammaQ(df / 2, x / 2);
}

/** Two-sided p-value and survival function for the standard normal. */
export function normSf(z) {
  // erfc via incomplete gamma: erfc(t) = Q(1/2, t^2) for t >= 0
  if (z < 0) return 1 - normSf(-z);
  return 0.5 * gammaQ(0.5, (z * z) / 2);
}
export function normP2(z) { return 2 * normSf(Math.abs(z)); }

// Incomplete beta for Student-t p-values.
function betaCF(a, b, x) {
  const FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

export function betaI(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betaCF(a, b, x)) / a : 1 - (bt * betaCF(b, a, 1 - x)) / b;
}

/** Two-sided p-value for a t statistic with df degrees of freedom. */
export function tP2(t, df) {
  return betaI(df / 2, 0.5, df / (df + t * t));
}

export const Z975 = 1.959963984540054;

// ---------- small dense linear algebra (p <= 4) ----------

function xtwx(X, w) {
  const k = X.length, p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < k; i++)
    for (let r = 0; r < p; r++)
      for (let c = 0; c < p; c++) A[r][c] += w[i] * X[i][r] * X[i][c];
  return A;
}
function xtwy(X, w, y) {
  const k = X.length, p = X[0].length;
  const b = new Array(p).fill(0);
  for (let i = 0; i < k; i++)
    for (let r = 0; r < p; r++) b[r] += w[i] * X[i][r] * y[i];
  return b;
}
function luDecompose(Ain) {
  const n = Ain.length;
  const A = Ain.map((row) => row.slice());
  const piv = new Array(n).fill(0).map((_, i) => i);
  let detSign = 1;
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[best][col])) best = r;
    if (best !== col) {
      [A[col], A[best]] = [A[best], A[col]];
      [piv[col], piv[best]] = [piv[best], piv[col]];
      detSign = -detSign;
    }
    if (A[col][col] === 0) throw new Error('singular matrix');
    for (let r = col + 1; r < n; r++) {
      A[r][col] /= A[col][col];
      for (let c = col + 1; c < n; c++) A[r][c] -= A[r][col] * A[col][c];
    }
  }
  return { A, piv, detSign };
}
function luSolve(lu, bIn) {
  const { A, piv } = lu;
  const n = A.length;
  const x = piv.map((p) => bIn[p]);
  for (let r = 1; r < n; r++) for (let c = 0; c < r; c++) x[r] -= A[r][c] * x[c];
  for (let r = n - 1; r >= 0; r--) {
    for (let c = r + 1; c < n; c++) x[r] -= A[r][c] * x[c];
    x[r] /= A[r][r];
  }
  return x;
}
function matInverse(A) {
  const n = A.length;
  const lu = luDecompose(A);
  const inv = [];
  for (let c = 0; c < n; c++) {
    const e = new Array(n).fill(0); e[c] = 1;
    inv.push(luSolve(lu, e));
  }
  // inv currently holds columns as rows; transpose
  const out = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => inv[c][r]));
  return out;
}
function logDet(A) {
  const lu = luDecompose(A);
  let s = 0;
  for (let i = 0; i < A.length; i++) s += Math.log(Math.abs(lu.A[i][i]));
  return s;
}

// ---------- weighted least squares at a given tau^2 ----------

function fitWLS(y, v, X, tau2) {
  const k = y.length;
  const w = v.map((vi) => 1 / (vi + tau2));
  const A = xtwx(X, w);
  const b = xtwy(X, w, y);
  const lu = luDecompose(A);
  const beta = luSolve(lu, b);
  const cov = matInverse(A);
  const resid = y.map((yi, i) => yi - X[i].reduce((s, xij, j) => s + xij * beta[j], 0));
  return { beta, cov, resid, w, A };
}

// REML log-likelihood (up to a constant) for given tau^2 and design X.
function remlLL(y, v, X, tau2) {
  const { A, resid, w } = fitWLS(y, v, X, tau2);
  let ll = 0;
  for (let i = 0; i < y.length; i++) ll += Math.log(v[i] + tau2) + w[i] * resid[i] * resid[i];
  ll += logDet(A);
  return -0.5 * ll;
}

/** REML estimate of tau^2 by profiling the restricted log-likelihood (coarse grid + golden refine). */
export function tau2REML(y, v, X) {
  const meanY = y.reduce((a, b) => a + b, 0) / y.length;
  const varY = y.reduce((a, b) => a + (b - meanY) ** 2, 0) / Math.max(1, y.length - 1);
  const hi = Math.max(1e-3, varY * 10);
  // coarse scan
  const N = 240;
  let bestT = 0, bestLL = -Infinity;
  for (let i = 0; i <= N; i++) {
    const t = (hi * i) / N;
    const ll = remlLL(y, v, X, t);
    if (ll > bestLL) { bestLL = ll; bestT = t; }
  }
  // golden-section refine around the best grid point
  let lo = Math.max(0, bestT - hi / N), up = bestT + hi / N;
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = up - phi * (up - lo), d = lo + phi * (up - lo);
  let fc = remlLL(y, v, X, c), fd = remlLL(y, v, X, d);
  for (let it = 0; it < 200 && up - lo > 1e-12; it++) {
    if (fc > fd) { up = d; d = c; fd = fc; c = up - phi * (up - lo); fc = remlLL(y, v, X, c); }
    else { lo = c; c = d; fc = fd; d = lo + phi * (up - lo); fd = remlLL(y, v, X, d); }
  }
  return Math.max(0, (lo + up) / 2);
}

/** DerSimonian-Laird estimate of tau^2 (intercept-only model). */
export function tau2DL(y, v) {
  const w = v.map((vi) => 1 / vi);
  const sw = w.reduce((a, b) => a + b, 0);
  const muFE = w.reduce((a, wi, i) => a + wi * y[i], 0) / sw;
  const Q = w.reduce((a, wi, i) => a + wi * (y[i] - muFE) ** 2, 0);
  const sw2 = w.reduce((a, wi) => a + wi * wi, 0);
  const df = y.length - 1;
  return Math.max(0, (Q - df) / (sw - sw2 / sw));
}

// ---------- public model fits ----------

function heterogeneity(y, v) {
  const k = y.length;
  const w = v.map((vi) => 1 / vi);
  const sw = w.reduce((a, b) => a + b, 0);
  const muFE = w.reduce((a, wi, i) => a + wi * y[i], 0) / sw;
  const Q = w.reduce((a, wi, i) => a + wi * (y[i] - muFE) ** 2, 0);
  const sw2 = w.reduce((a, wi) => a + wi * wi, 0);
  const s2 = (k - 1) * sw / (sw * sw - sw2); // Higgins-Thompson "typical" sampling variance
  return { Q, Qdf: k - 1, Qp: chiSqSf(Q, k - 1), s2, muFE, seFE: Math.sqrt(1 / sw) };
}

function round(x, d = 4) {
  const m = 10 ** d;
  return Math.round(x * m) / m;
}

/**
 * Random-effects meta-analysis.
 * studies: [{id?, yi, vi, ...}] — only yi/vi are used.
 * opts.method: 'REML' (default, matches metafor's default) or 'DL' or 'FE'.
 */
export function metaAnalyze(studies, opts = {}) {
  const method = opts.method || 'REML';
  const y = studies.map((s) => s.yi);
  const v = studies.map((s) => s.vi);
  const k = y.length;
  if (k < 2) throw new Error('need at least 2 studies');
  const X = y.map(() => [1]);
  const het = heterogeneity(y, v);
  let tau2 = 0;
  if (method === 'REML') tau2 = tau2REML(y, v, X);
  else if (method === 'DL') tau2 = tau2DL(y, v);
  else if (method === 'FE') tau2 = 0;
  else throw new Error(`unknown method: ${method}`);
  const { beta, cov } = fitWLS(y, v, X, tau2);
  const estimate = beta[0];
  const se = Math.sqrt(cov[0][0]);
  const z = estimate / se;
  const p = normP2(z);
  const I2 = method === 'FE' ? null : 100 * (tau2 / (tau2 + het.s2));
  const H2 = method === 'FE' ? null : (tau2 + het.s2) / het.s2;
  return {
    model: method === 'FE' ? 'fixed-effects' : `random-effects (${method})`,
    method, k,
    estimate: round(estimate), se: round(se), z: round(z), p: round(p),
    ci_lower: round(estimate - Z975 * se), ci_upper: round(estimate + Z975 * se),
    tau2: method === 'FE' ? null : round(tau2, 6),
    I2: I2 === null ? null : round(I2, 2),
    H2: H2 === null ? null : round(H2, 2),
    Q: round(het.Q, 4), Q_df: het.Qdf, Q_p: round(het.Qp, 6),
    significant: p < 0.05,
  };
}

/** Leave-one-out sensitivity analysis: re-fit omitting each study in turn. */
export function leaveOneOut(studies, opts = {}) {
  const rows = studies.map((s, i) => {
    const rest = studies.filter((_, j) => j !== i);
    const fit = metaAnalyze(rest, opts);
    return {
      omitted: s.id || `#${i + 1}`, omitted_label: `${s.author || ''} ${s.year || ''}`.trim(),
      estimate: fit.estimate, ci_lower: fit.ci_lower, ci_upper: fit.ci_upper,
      p: fit.p, tau2: fit.tau2, I2: fit.I2, significant: fit.significant,
    };
  });
  const ests = rows.map((r) => r.estimate);
  const full = metaAnalyze(studies, opts);
  return {
    full_estimate: full.estimate, full_significant: full.significant,
    min_estimate: round(Math.min(...ests)), max_estimate: round(Math.max(...ests)),
    flips_significance: rows.filter((r) => r.significant !== full.significant).map((r) => r.omitted),
    rows,
  };
}

/** Subgroup analysis: split studies by a labelling function/field, fit each, test between-group difference. */
export function subgroupAnalysis(studies, labelOf, opts = {}) {
  const groups = new Map();
  for (const s of studies) {
    const g = typeof labelOf === 'function' ? labelOf(s) : String(s[labelOf]);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(s);
  }
  const fits = [];
  for (const [label, members] of groups) {
    if (members.length < 2) {
      fits.push({ group: label, k: members.length, note: 'fewer than 2 studies — not fitted' });
      continue;
    }
    const f = metaAnalyze(members, opts);
    fits.push({ group: label, k: f.k, estimate: f.estimate, se: f.se, ci_lower: f.ci_lower, ci_upper: f.ci_upper, p: f.p, tau2: f.tau2, I2: f.I2, significant: f.significant });
  }
  const usable = fits.filter((f) => f.estimate !== undefined);
  let between = null;
  if (usable.length >= 2) {
    const wg = usable.map((f) => 1 / (f.se * f.se));
    const swg = wg.reduce((a, b) => a + b, 0);
    const mu = usable.reduce((a, f, i) => a + wg[i] * f.estimate, 0) / swg;
    const QB = usable.reduce((a, f, i) => a + wg[i] * (f.estimate - mu) ** 2, 0);
    const df = usable.length - 1;
    between = { Q_between: round(QB, 4), df, p: round(chiSqSf(QB, df), 6), significant: chiSqSf(QB, df) < 0.05 };
  }
  return { groups: fits, between_group_test: between };
}

/**
 * Mixed-effects meta-regression with a single numeric moderator (REML tau^2).
 * xOf: function(study) -> numeric moderator value.
 */
export function metaRegression(studies, xOf, opts = {}) {
  const y = studies.map((s) => s.yi);
  const v = studies.map((s) => s.vi);
  const x = studies.map((s) => xOf(s));
  const k = y.length;
  const X = x.map((xi) => [1, xi]);
  const tau2 = tau2REML(y, v, X);
  const { beta, cov, resid } = fitWLS(y, v, X, tau2);
  const seB = [Math.sqrt(cov[0][0]), Math.sqrt(cov[1][1])];
  const zB = beta.map((b, i) => b / seB[i]);
  const pB = zB.map((z) => normP2(z));
  // residual heterogeneity: QE from the FE (tau2=0) fit of the same model
  const fe = fitWLS(y, v, X, 0);
  const QE = y.reduce((a, yi, i) => a + (1 / v[i]) * fe.resid[i] * fe.resid[i], 0);
  const QEdf = k - 2;
  // R^2: proportional reduction in tau^2 vs the intercept-only model (same estimator)
  const tau2Base = tau2REML(y, v, y.map(() => [1]));
  const R2 = tau2Base <= 0 ? null : Math.max(0, Math.min(100, 100 * (1 - tau2 / tau2Base)));
  // omnibus moderator test (single moderator => Wald z^2, df 1)
  const QM = zB[1] * zB[1];
  return {
    model: 'mixed-effects meta-regression (REML)',
    k, tau2: round(tau2, 6), tau2_intercept_only: round(tau2Base, 6),
    R2_percent: R2 === null ? null : round(R2, 2),
    intercept: { b: round(beta[0]), se: round(seB[0]), z: round(zB[0]), p: round(pB[0], 6), ci_lower: round(beta[0] - Z975 * seB[0]), ci_upper: round(beta[0] + Z975 * seB[0]) },
    moderator: { b: round(beta[1]), se: round(seB[1]), z: round(zB[1]), p: round(pB[1], 6), ci_lower: round(beta[1] - Z975 * seB[1]), ci_upper: round(beta[1] + Z975 * seB[1]) },
    QM: round(QM, 4), QM_df: 1, QM_p: round(chiSqSf(QM, 1), 6),
    QE: round(QE, 4), QE_df: QEdf, QE_p: round(chiSqSf(QE, QEdf), 6),
  };
}

/** Egger's regression test for funnel-plot asymmetry (classical form: SND ~ precision). */
export function eggerTest(studies) {
  const k = studies.length;
  const snd = studies.map((s) => s.yi / Math.sqrt(s.vi));
  const prec = studies.map((s) => 1 / Math.sqrt(s.vi));
  const mx = prec.reduce((a, b) => a + b, 0) / k;
  const my = snd.reduce((a, b) => a + b, 0) / k;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < k; i++) { sxx += (prec[i] - mx) ** 2; sxy += (prec[i] - mx) * (snd[i] - my); }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const df = k - 2;
  let sse = 0;
  for (let i = 0; i < k; i++) sse += (snd[i] - intercept - slope * prec[i]) ** 2;
  const mse = sse / df;
  const seIntercept = Math.sqrt(mse * (1 / k + (mx * mx) / sxx));
  const t = intercept / seIntercept;
  const p = tP2(t, df);
  return {
    test: "Egger's regression test for funnel plot asymmetry",
    intercept: round(intercept), se: round(seIntercept), t: round(t), df, p: round(p, 6),
    asymmetry_detected: p < 0.05,
    interpretation: p < 0.05
      ? 'significant small-study asymmetry — smaller studies show systematically different effects'
      : 'no significant funnel-plot asymmetry detected at alpha = 0.05',
  };
}

/** Cumulative meta-analysis in a given order (default: by year, then id). */
export function cumulativeMeta(studies, opts = {}) {
  const sorted = [...studies].sort((a, b) => (a.year - b.year) || String(a.id).localeCompare(String(b.id)));
  const rows = [];
  for (let i = 2; i <= sorted.length; i++) {
    const fit = metaAnalyze(sorted.slice(0, i), opts);
    const last = sorted[i - 1];
    rows.push({ upto: `${last.author || last.id} ${last.year || ''}`.trim(), k: i, estimate: fit.estimate, ci_lower: fit.ci_lower, ci_upper: fit.ci_upper, p: fit.p, significant: fit.significant });
  }
  return { order: 'by publication year', rows };
}
