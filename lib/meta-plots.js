// meta-plots.js — dependency-free SVG renderers for meta-analytic figures.
// All colors come from CSS custom properties (--le-ink, --le-accent, --le-muted,
// --le-good, --le-bad) so figures follow the document's light/dark theme.

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, children = []) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.appendChild(c);
  return node;
}
function txt(s, x, y, attrs = {}) {
  const t = el('text', { x, y, 'font-size': attrs.size || 11, fill: attrs.fill || 'var(--le-ink)', 'text-anchor': attrs.anchor || 'start', 'font-family': 'inherit', ...(attrs.extra || {}) });
  t.textContent = s;
  return t;
}

function niceTicks(lo, hi, n = 6) {
  const span = hi - lo;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 0.5, 0.25, 0.2, 0.1].map((m) => mag / m).concat([mag, mag * 2, mag * 2.5, mag * 5, mag * 10])
    .sort((a, b) => a - b).find((s) => span / s <= n + 1) || step0;
  const ticks = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-12; t += step) ticks.push(Math.round(t * 1e10) / 1e10);
  return ticks;
}

/**
 * Forest plot. rows: [{label, yi, lo, hi, weight}] ; pooled: {label, est, lo, hi} | null
 */
export function forestPlot(rows, pooled, opts = {}) {
  const W = opts.width || 680;
  const rowH = 22, labelW = 200, valW = 128, top = 26, bottom = 40;
  const H = top + (rows.length + (pooled ? 2 : 0)) * rowH + bottom;
  const plotX = labelW, plotW = W - labelW - valW;

  let lo = Math.min(...rows.map((r) => r.lo), pooled ? pooled.lo : 0, 0);
  let hi = Math.max(...rows.map((r) => r.hi), pooled ? pooled.hi : 0, 0);
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const x = (v) => plotX + ((v - lo) / (hi - lo)) * plotW;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'le-figure-svg' });
  svg.appendChild(txt(opts.xlab || 'Standardized mean difference', plotX + plotW / 2, H - 8, { anchor: 'middle', fill: 'var(--le-muted)' }));

  // zero line + axis
  svg.appendChild(el('line', { x1: x(0), x2: x(0), y1: top - 8, y2: H - bottom + 6, stroke: 'var(--le-muted)', 'stroke-dasharray': '3 3' }));
  const axisY = H - bottom + 6;
  svg.appendChild(el('line', { x1: plotX, x2: plotX + plotW, y1: axisY, y2: axisY, stroke: 'var(--le-muted)' }));
  for (const t of niceTicks(lo, hi)) {
    svg.appendChild(el('line', { x1: x(t), x2: x(t), y1: axisY, y2: axisY + 4, stroke: 'var(--le-muted)' }));
    svg.appendChild(txt(String(t), x(t), axisY + 16, { anchor: 'middle', size: 10, fill: 'var(--le-muted)' }));
  }

  const maxWt = Math.max(...rows.map((r) => r.weight || 1));
  rows.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2;
    svg.appendChild(txt(r.label, labelW - 10, cy + 4, { anchor: 'end', size: 11 }));
    svg.appendChild(el('line', { x1: x(r.lo), x2: x(r.hi), y1: cy, y2: cy, stroke: 'var(--le-ink)', 'stroke-width': 1.2 }));
    const s = 4 + 6 * Math.sqrt((r.weight || 1) / maxWt);
    svg.appendChild(el('rect', { x: x(r.yi) - s / 2, y: cy - s / 2, width: s, height: s, fill: 'var(--le-accent)' }));
    svg.appendChild(txt(`${r.yi.toFixed(2)} [${r.lo.toFixed(2)}, ${r.hi.toFixed(2)}]`, W - valW + 122, cy + 4, { anchor: 'end', size: 10.5, fill: 'var(--le-muted)', extra: { 'font-variant-numeric': 'tabular-nums' } }));
  });

  if (pooled) {
    const cy = top + (rows.length + 0.9) * rowH;
    svg.appendChild(el('line', { x1: plotX, x2: plotX + plotW, y1: cy - rowH * 0.75, y2: cy - rowH * 0.75, stroke: 'var(--le-muted)', 'stroke-width': 0.5 }));
    svg.appendChild(txt(pooled.label, labelW - 10, cy + 4, { anchor: 'end', size: 11.5, extra: { 'font-weight': 600 } }));
    const d = `M ${x(pooled.lo)} ${cy} L ${x(pooled.est)} ${cy - 7} L ${x(pooled.hi)} ${cy} L ${x(pooled.est)} ${cy + 7} Z`;
    svg.appendChild(el('path', { d, fill: 'var(--le-accent)' }));
    svg.appendChild(txt(`${pooled.est.toFixed(2)} [${pooled.lo.toFixed(2)}, ${pooled.hi.toFixed(2)}]`, W - valW + 122, cy + 4, { anchor: 'end', size: 10.5, extra: { 'font-weight': 600, 'font-variant-numeric': 'tabular-nums' } }));
  }
  return svg;
}

/** Leave-one-out plot: one dot+CI per omitted study, reference line at the full-sample estimate. */
export function looPlot(rows, fullEstimate, opts = {}) {
  const converted = rows.map((r) => ({ label: `omit ${r.omitted_label || r.omitted}`, yi: r.estimate, lo: r.ci_lower, hi: r.ci_upper, weight: 1 }));
  const svg = forestPlot(converted, null, { ...opts, xlab: opts.xlab || 'Pooled estimate when the study is omitted' });
  // reference line at full estimate: recompute scale exactly like forestPlot did
  const W = opts.width || 680;
  const labelW = 200, valW = 128, plotX = labelW, plotW = W - labelW - valW;
  let lo = Math.min(...converted.map((r) => r.lo), 0), hi = Math.max(...converted.map((r) => r.hi), 0);
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const x = plotX + ((fullEstimate - lo) / (hi - lo)) * plotW;
  const H = Number(svg.getAttribute('viewBox').split(' ')[3]);
  svg.appendChild(el('line', { x1: x, x2: x, y1: 18, y2: H - 34, stroke: 'var(--le-accent)', 'stroke-width': 1, 'stroke-dasharray': '5 3' }));
  svg.appendChild(txt('full sample', x + 4, 16, { size: 10, fill: 'var(--le-accent)' }));
  return svg;
}

/** Funnel plot: effect size vs standard error (inverted), pseudo-95% CI funnel around the pooled estimate. */
export function funnelPlot(studies, pooledEst, opts = {}) {
  const W = opts.width || 560, H = opts.height || 380;
  const m = { l: 64, r: 24, t: 20, b: 46 };
  const se = studies.map((s) => Math.sqrt(s.vi));
  const maxSe = Math.max(...se) * 1.08;
  const xs = studies.map((s) => s.yi);
  let xLo = Math.min(...xs, pooledEst - 1.96 * maxSe), xHi = Math.max(...xs, pooledEst + 1.96 * maxSe);
  const pad = (xHi - xLo) * 0.05; xLo -= pad; xHi += pad;
  const x = (v) => m.l + ((v - xLo) / (xHi - xLo)) * (W - m.l - m.r);
  const y = (s) => m.t + (s / maxSe) * (H - m.t - m.b); // se grows downward

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'le-figure-svg' });
  // funnel region
  const d = `M ${x(pooledEst)} ${y(0)} L ${x(pooledEst - 1.96 * maxSe)} ${y(maxSe)} L ${x(pooledEst + 1.96 * maxSe)} ${y(maxSe)} Z`;
  svg.appendChild(el('path', { d, fill: 'var(--le-accent)', opacity: 0.08 }));
  svg.appendChild(el('line', { x1: x(pooledEst), x2: x(pooledEst - 1.96 * maxSe), y1: y(0), y2: y(maxSe), stroke: 'var(--le-muted)', 'stroke-dasharray': '4 3' }));
  svg.appendChild(el('line', { x1: x(pooledEst), x2: x(pooledEst + 1.96 * maxSe), y1: y(0), y2: y(maxSe), stroke: 'var(--le-muted)', 'stroke-dasharray': '4 3' }));
  svg.appendChild(el('line', { x1: x(pooledEst), x2: x(pooledEst), y1: y(0), y2: y(maxSe), stroke: 'var(--le-muted)' }));
  // axes
  svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: 'var(--le-muted)' }));
  svg.appendChild(el('line', { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, stroke: 'var(--le-muted)' }));
  for (const t of niceTicks(xLo, xHi)) {
    svg.appendChild(txt(String(t), x(t), H - m.b + 16, { anchor: 'middle', size: 10, fill: 'var(--le-muted)' }));
  }
  for (const t of niceTicks(0, maxSe, 5)) {
    svg.appendChild(txt(t.toFixed(2), m.l - 8, y(t) + 3, { anchor: 'end', size: 10, fill: 'var(--le-muted)' }));
  }
  svg.appendChild(txt(opts.xlab || 'Standardized mean difference', (m.l + W - m.r) / 2, H - 8, { anchor: 'middle', fill: 'var(--le-muted)' }));
  svg.appendChild(txt('Standard error', 14, m.t - 6, { size: 10.5, fill: 'var(--le-muted)' }));
  for (const s of studies) {
    svg.appendChild(el('circle', { cx: x(s.yi), cy: y(Math.sqrt(s.vi)), r: 4, fill: 'var(--le-accent)', opacity: 0.85 }));
  }
  return svg;
}

/** Moderator scatter: effect size vs moderator, bubble area ~ precision, with fitted meta-regression line. */
export function moderatorPlot(studies, xOf, fit, opts = {}) {
  const W = opts.width || 560, H = opts.height || 380;
  const m = { l: 56, r: 24, t: 20, b: 46 };
  const pts = studies.map((s) => ({ x: xOf(s), y: s.yi, w: 1 / s.vi }));
  let xLo = Math.min(...pts.map((p) => p.x)), xHi = Math.max(...pts.map((p) => p.x));
  let yLo = Math.min(...pts.map((p) => p.y), 0), yHi = Math.max(...pts.map((p) => p.y));
  const xPad = Math.max(0.5, (xHi - xLo) * 0.08), yPad = (yHi - yLo) * 0.1;
  xLo -= xPad; xHi += xPad; yLo -= yPad; yHi += yPad;
  const x = (v) => m.l + ((v - xLo) / (xHi - xLo)) * (W - m.l - m.r);
  const y = (v) => H - m.b - ((v - yLo) / (yHi - yLo)) * (H - m.t - m.b);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'le-figure-svg' });
  svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: 'var(--le-muted)', 'stroke-dasharray': '3 3' }));
  svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: 'var(--le-muted)' }));
  svg.appendChild(el('line', { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, stroke: 'var(--le-muted)' }));
  for (const t of niceTicks(xLo, xHi)) svg.appendChild(txt(String(t), x(t), H - m.b + 16, { anchor: 'middle', size: 10, fill: 'var(--le-muted)' }));
  for (const t of niceTicks(yLo, yHi)) svg.appendChild(txt(String(t), m.l - 8, y(t) + 3, { anchor: 'end', size: 10, fill: 'var(--le-muted)' }));
  svg.appendChild(txt(opts.xlab || 'Moderator', (m.l + W - m.r) / 2, H - 8, { anchor: 'middle', fill: 'var(--le-muted)' }));
  svg.appendChild(txt(opts.ylab || 'Standardized mean difference', 14, m.t - 6, { size: 10.5, fill: 'var(--le-muted)' }));
  // fitted line
  if (fit) {
    const yA = fit.intercept.b + fit.moderator.b * xLo, yB = fit.intercept.b + fit.moderator.b * xHi;
    svg.appendChild(el('line', { x1: x(xLo), x2: x(xHi), y1: y(yA), y2: y(yB), stroke: 'var(--le-accent)', 'stroke-width': 2 }));
  }
  const maxW = Math.max(...pts.map((p) => p.w));
  for (const p of pts) {
    svg.appendChild(el('circle', { cx: x(p.x), cy: y(p.y), r: 3 + 7 * Math.sqrt(p.w / maxW), fill: 'var(--le-accent)', opacity: 0.45, stroke: 'var(--le-accent)' }));
  }
  return svg;
}
