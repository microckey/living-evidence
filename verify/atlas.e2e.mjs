// Real-browser E2E for the Living Evidence Atlas (M2-lite) — verify/atlas.e2e.mjs
//
// The load-bearing assertions in this file are the ones that recompute the page's
// claims INDEPENDENTLY in node, from the same source data, and demand equality:
//
//   - the coverage gap's empty band is recomputed here from data/raudenbush1985.js
//     (block 2). If lib/atlas.js ever hard-codes 8–16, this test goes red.
//   - every synthesis the page reports is re-fitted here through lib/meta-stats.js
//     (block 3), full sample and after an exclusion.
//   - the study brief is searched for a numeric sample size (block 6): the whole
//     point of DESIGN §4.5 is that the Atlas does NOT compute one.
//
// It also re-checks the §0 extraction: the six claims now live in
// data/pygmalion-claims.js, and the document must still prefer its own prose spans
// over the module's statement field.
//
// Server: python3 -m http.server 8501 --bind 127.0.0.1 (started by this script).
// Playwright comes from the absolute path below — no install.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { metaAnalyze, metaRegression } from '../lib/meta-stats.js';
import { DATASET } from '../data/raudenbush1985.js';
import { CLAIMS } from '../data/pygmalion-claims.js';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/hirokisugimoto/tennis-checker/node_modules/playwright');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8501;

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}  ${detail}`); }
}
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

/** The independent recomputation: largest interior gap between observed `weeks`.
 *  Deliberately written from the spec sentence, not from lib/atlas.js. */
function recomputeCoverageBand(studies) {
  const observed = [...new Set(studies.map((s) => s.weeks))].sort((a, b) => a - b);
  let widest = null;
  for (let i = 0; i < observed.length - 1; i++) {
    const span = observed[i + 1] - observed[i];
    if (!widest || span > widest.span) widest = { lo: observed[i], hi: observed[i + 1], span };
  }
  return {
    observed,
    between_observed: [widest.lo, widest.hi],
    empty_band: [widest.lo + 1, widest.hi - 1],
  };
}

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch({ args: ['--disable-accelerated-2d-canvas', '--disable-gpu'] });
try {
  // ======================================================================= 0
  // §0 regression: the claims moved into data/pygmalion-claims.js, and the
  // DOCUMENT must still read its statements off its own prose spans.
  console.log('\n# 0. shared claims module (§0)');
  {
    const docPage = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const docErrors = [];
    docPage.on('pageerror', (e) => docErrors.push(`pageerror: ${e.message}`));
    docPage.on('console', (m) => { if (m.type() === 'error') docErrors.push(`console.error: ${m.text()}`); });
    await docPage.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    await docPage.waitForFunction(() => window.LivingEvidence && window.LivingEvidence.tools.length > 0, null, { timeout: 10000 });
    const docClaims = await docPage.evaluate(() => window.LivingEvidence.invokeTool('list_claims', {}).claims);
    check('module ships 6 claims with statements', CLAIMS.length === 6 && CLAIMS.every((c) => typeof c.statement === 'string' && c.statement.length > 20));
    check('document still lists the same 6 claim ids',
      JSON.stringify(docClaims.map((c) => c.id)) === JSON.stringify(CLAIMS.map((c) => c.id)),
      JSON.stringify(docClaims.map((c) => c.id)));
    const domStatements = Object.fromEntries(docClaims.map((c) => [c.id, c.statement]));
    check('document statements come from the DOM span, normalising to the module text',
      CLAIMS.every((c) => domStatements[c.id].replace(/\s+/g, ' ') === c.statement),
      JSON.stringify(domStatements));
    // c-textbook's prose span wraps across two source lines, so the DOM text carries
    // a newline the module's normalised statement does not — proof that statementOf()
    // read the span and not the config field.
    check('statementOf() prefers the span (raw DOM text differs from the module field)',
      domStatements['c-textbook'] !== CLAIMS[0].statement && /\n/.test(domStatements['c-textbook']),
      JSON.stringify(domStatements['c-textbook']));
    check('document boots clean after the extraction', docErrors.length === 0, docErrors.join(' | '));
    await docPage.close();
  }

  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

  await page.goto(`http://127.0.0.1:${PORT}/atlas.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.LivingEvidenceAtlas && window.LivingEvidenceAtlas.tools.length > 0, null, { timeout: 10000 });

  const call = (name, args, opts) => page.evaluate(([n, a, o]) => window.LivingEvidenceAtlas.invokeTool(n, a, o), [name, args, opts]);
  const callErr = (name, args) => page.evaluate(([n, a]) => {
    try { window.LivingEvidenceAtlas.invokeTool(n, a); return null; } catch (e) { return e.message; }
  }, [name, args]);
  const audit = () => page.evaluate(() => window.LivingEvidenceAtlas.state.audit);
  const ledgerRows = () => page.locator('#atlas-ledger .le-ledger-row').count();

  // ======================================================================= 1
  console.log('\n# 1. boot: tools, status, graph');
  const tools = await page.evaluate(() => window.LivingEvidenceAtlas.tools.map((t) => t.name));
  check('8 tools exposed', tools.length === 8, tools.join(','));
  check('the expected 8 tools',
    JSON.stringify(tools) === JSON.stringify(['atlas_overview', 'get_cell', 'list_claims', 'evaluate_claim', 'get_gaps', 'get_study_brief', 'focus_node', 'synthesize']),
    tools.join(','));
  check('every schema is closed (additionalProperties: false)',
    await page.evaluate(() => window.LivingEvidenceAtlas.tools.every((t) => t.inputSchema.additionalProperties === false)));
  const agentStatus = await page.evaluate(() => window.LivingEvidenceAtlas.state.agent);
  check('WebMCP absent in the test browser, handled gracefully', agentStatus.active === false, JSON.stringify(agentStatus));
  check('registration status is explicitly "absent" (not a silent false)', agentStatus.status === 'absent', JSON.stringify(agentStatus));
  check('absent status reports 0/8 registered', agentStatus.registered === 0 && agentStatus.total === 8, JSON.stringify(agentStatus));
  check('status banner explains the fallback', /Tool console/.test(await page.textContent('#atlas-status')));
  // 2 constructs + 1 cell + 6 claims + 19 records + 3 gaps + 1 document + 1 moderator
  const nodeCount = await page.locator('#atlas-map [data-node]').count();
  check('exactly 33 nodes rendered', nodeCount === 33, String(nodeCount));
  const nodeTypes = await page.evaluate(() => {
    const acc = {};
    for (const n of window.LivingEvidenceAtlas.graph.nodes) acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  });
  check('node types are 1 cell / 2 constructs / 1 document / 6 claims / 19 records / 3 gaps / 1 moderator',
    JSON.stringify(nodeTypes) === JSON.stringify({ cell: 1, construct: 2, document: 1, claim: 6, record: 19, moderator: 1, gap: 3 }),
    JSON.stringify(nodeTypes));
  const edgeCount = await page.locator('#atlas-map .atlas-edge').count();
  check('37 typed edges rendered (6 asserts + 6 about + 19 evidence + 2 measures + 3 gap + 1 moderates)', edgeCount === 37, String(edgeCount));
  const modLabel = await page.textContent('#atlas-map .atlas-edges');
  check('the moderator edge is hedged as "(candidate)"', /moderates \(candidate\)/.test(modLabel), modLabel);
  check('every node is keyboard reachable with an aria-label',
    await page.evaluate(() => [...document.querySelectorAll('[data-node]')].every((el) => el.getAttribute('tabindex') === '0' && el.getAttribute('role') === 'button' && (el.getAttribute('aria-label') || '').length > 10)));
  check('boot row is ledgered as the system', (await audit())[0].actor === 'system', JSON.stringify((await audit())[0]));
  check('nothing is selected before anyone asks', await page.locator('.atlas-selected').count() === 0);
  // the map at full contrast, before any selection dims it — the legibility check
  await page.locator('#atlas-map').screenshot({ path: path.join(root, 'verify', '_snap_atlas_map.png') });

  // ======================================================================= 2
  console.log('\n# 2. computed gaps vs an independent recomputation');
  const gapsRes = await call('get_gaps', {});
  const coverage = gapsRes.gaps.find((g) => g.id === 'gap:coverage-weeks');
  const expected = recomputeCoverageBand(DATASET.studies);
  check('coverage empty band equals the node-side recomputation',
    JSON.stringify(coverage.empty_band) === JSON.stringify(expected.empty_band),
    `page ${JSON.stringify(coverage.empty_band)} vs node ${JSON.stringify(expected.empty_band)}`);
  check('coverage between_observed equals the node-side recomputation',
    JSON.stringify(coverage.between_observed) === JSON.stringify(expected.between_observed),
    `page ${JSON.stringify(coverage.between_observed)} vs node ${JSON.stringify(expected.between_observed)}`);
  check('observed weeks values match the dataset',
    JSON.stringify(coverage.observed_values) === JSON.stringify(expected.observed),
    JSON.stringify(coverage.observed_values));
  check('no record sits inside the computed band', coverage.records_in_band === 0, String(coverage.records_in_band));
  check('coverage gap carries its collection frame', /not-searched/.test(coverage.collection_frame), coverage.collection_frame);
  const replication = gapsRes.gaps.find((g) => g.id === 'gap:replication');
  check('replication gap is 0 of 19', replication.count_with_prereg === 0 && replication.total_records === 19, JSON.stringify(replication));
  check('replication gap does not overclaim', /not evidence that no pre-registered replication/.test(replication.honest_framing), replication.honest_framing);
  const verification = gapsRes.gaps.find((g) => g.id === 'gap:verification');
  check('verification gap is 0 of 19', verification.count_with_manifest === 0 && verification.total_records === 19, JSON.stringify(verification));
  check('verification gap points at the record ladder', /R2/.test(verification.statement) && /unassigned in v0\.1/.test(verification.honest_framing), verification.statement);
  check('the map shows the computed band, not a literal', /8–16 weeks/.test(await page.textContent('#atlas-map [data-node="gap:coverage-weeks"]')));

  // ======================================================================= 3
  console.log('\n# 3. synthesize vs node re-fits');
  const before3 = await ledgerRows();
  const syn = await call('synthesize', {});
  const nodeFull = metaAnalyze(DATASET.studies, { method: 'REML' });
  check('synthesize k = 19', syn.k === 19, String(syn.k));
  check('synthesize estimate matches node metaAnalyze REML', near(syn.estimate, nodeFull.estimate, 1e-9), `${syn.estimate} vs ${nodeFull.estimate}`);
  check('synthesize CI matches node metaAnalyze REML',
    near(syn.ci[0], nodeFull.ci_lower, 1e-9) && near(syn.ci[1], nodeFull.ci_upper, 1e-9), JSON.stringify(syn.ci));
  check('synthesize tau2 matches node metaAnalyze REML', near(syn.tau2, nodeFull.tau2, 1e-9), `${syn.tau2} vs ${nodeFull.tau2}`);
  check('synthesis is returned as a (spec, result) pair', syn.spec && syn.spec.estimator === 'REML' && Array.isArray(syn.spec.excluded), JSON.stringify(syn.spec));
  const synEx = await call('synthesize', { exclude: ['s04'] });
  const nodeEx = metaAnalyze(DATASET.studies.filter((s) => s.id !== 's04'), { method: 'REML' });
  check('exclusion drops k to 18', synEx.k === 18, String(synEx.k));
  check('excluded fit matches the node 18-record re-fit',
    near(synEx.estimate, nodeEx.estimate, 1e-9) && near(synEx.ci[0], nodeEx.ci_lower, 1e-9) && near(synEx.ci[1], nodeEx.ci_upper, 1e-9) && near(synEx.tau2, nodeEx.tau2, 1e-9),
    `${synEx.estimate}/${synEx.tau2} vs ${nodeEx.estimate}/${nodeEx.tau2}`);
  // the drawn cell tracks the tool, exclusion and all — not a static label
  const cellText = () => page.textContent('#atlas-map [data-node="cell:teacher-expectancy-iq"]');
  const shown = (x) => x.toFixed(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const cellAfterExclusion = await cellText();
  check('the cell node shows the excluded re-fit',
    cellAfterExclusion.includes(shown(synEx.estimate)) && /k = 18 \(−1\)/.test(cellAfterExclusion),
    cellAfterExclusion);
  // The aria-label is the same fact for a screen reader; it must track the re-fit,
  // and it must carry the k and the exclusion — a pooled number without its record
  // count is not the same claim.
  const cellAria = await page.getAttribute('[data-node="cell:teacher-expectancy-iq"]', 'aria-label');
  check('the cell aria-label tracks the excluded re-fit (estimate, k 18, the exclusion)',
    cellAria.includes(shown(synEx.estimate)) && /k 18/.test(cellAria) && /excluding s04/.test(cellAria),
    cellAria);
  const emptyFit = await callErr('synthesize', { exclude: DATASET.studies.slice(0, 18).map((s) => s.id) });
  check('excluding below k=2 errors instead of fitting nothing', /fewer than 2/.test(emptyFit || ''), emptyFit);
  const badRec = await callErr('synthesize', { exclude: ['nope'] });
  check('an unknown record id errors helpfully', /unknown record id/.test(badRec || ''), badRec);
  const REQUIRED_KEYS = ['run', 'time', 'actor', 'kind', 'tool', 'inputs', 'summary', 'evidence_version', 'result_digest'];
  const log3 = await audit();
  check('every ledger entry carries the full envelope', log3.every((e) => REQUIRED_KEYS.every((k) => k in e)), JSON.stringify(log3[0]));
  const synEntries = log3.filter((e) => e.tool === 'synthesize');
  check('synthesize entries are ledgered as analyses with digests',
    synEntries.length === 2 && synEntries.every((e) => e.kind === 'analysis' && /^[0-9a-f]{8}$/.test(e.result_digest)),
    JSON.stringify(synEntries.map((e) => [e.kind, e.result_digest])));
  check('a different spec digests differently', synEntries[0].result_digest !== synEntries[1].result_digest);
  check('synthesize wrote rows to the visible ledger', (await ledgerRows()) > before3);
  await call('synthesize', {}); // back to the canonical full-sample REML fit
  const cellRestored = await cellText();
  check('…and returns to the full-sample fit when re-synthesized',
    cellRestored.includes(shown(nodeFull.estimate)) && /k = 19/.test(cellRestored), cellRestored);

  // ======================================================================= 4
  console.log('\n# 4. claims: exemplar verdicts, on the map');
  const EXPECTED_VERDICTS = {
    'c-textbook': 'challenged', 'c-overall': 'supported', 'c-moderator': 'supported',
    'c-window': 'supported', 'c-robust': 'supported', 'c-bias': 'nuanced',
  };
  const listed = await call('list_claims', {});
  check('list_claims returns 6 claims, all untested at boot',
    listed.claims.length === 6 && listed.claims.every((c) => c.status === 'untested'),
    JSON.stringify(listed.claims.map((c) => c.status)));
  check('every claim ships its machine-check AST',
    listed.claims.every((c) => c.machine_check && Array.isArray(c.machine_check.verdicts) && c.machine_check.verdicts.at(-1).default === true));
  check('claims carry the statement from the module (no prose to scrape here)',
    listed.claims.every((c, i) => c.statement === CLAIMS[i].statement), JSON.stringify(listed.claims.map((c) => c.statement.slice(0, 20))));
  for (const [id, want] of Object.entries(EXPECTED_VERDICTS)) {
    const r = await call('evaluate_claim', { claim_id: id });
    check(`claim ${id} ${want}`, r.verdict === want, `${r.verdict} — ${r.reason}`);
  }
  const glyphs = await page.evaluate(() => [...document.querySelectorAll('.atlas-claim-badge')].map((e) => e.textContent).filter(Boolean));
  check('6 verdict glyphs painted on the map', glyphs.length === 6 && glyphs.every((g) => '✓✗△'.includes(g)), glyphs.join(''));
  // Counting glyphs is not checking them: a swapped glyph map still paints 6 valid
  // symbols and still yields 4/1/1. Pair each claim's badge with its own verdict.
  const GLYPH_FOR = { supported: '✓', challenged: '✗', nuanced: '△' };
  for (const [id, want] of Object.entries(EXPECTED_VERDICTS)) {
    const badge = await page.textContent(`[data-claim-badge="${id}"]`);
    check(`claim ${id} wears the ${want} glyph (${GLYPH_FOR[want]})`,
      badge === GLYPH_FOR[want], `${id} shows "${badge}", ${want} should show "${GLYPH_FOR[want]}"`);
  }
  // …and the badge is decoration for the eye only: the aria-label has to say it too.
  const textbookAria = await page.getAttribute('[data-node="claim:c-textbook"]', 'aria-label');
  check('an evaluated claim refreshes its aria-label with the verdict',
    /challenged/.test(textbookAria || ''), textbookAria);
  check('glyph colours are carried by verdict classes',
    await page.locator('.atlas-verdict-challenged').count() === 1
    && await page.locator('.atlas-verdict-nuanced').count() === 1
    && await page.locator('.atlas-verdict-supported').count() === 4);
  const panelAfterClaims = await page.textContent('#atlas-panel');
  check('the panel shows the last evaluated claim', /c-bias/.test(panelAfterClaims) && /Egger/.test(panelAfterClaims), panelAfterClaims.slice(0, 160));
  check('the last claim node is the selected one', await page.locator('[data-node="claim:c-bias"].atlas-selected').count() === 1);
  const unknownClaim = await callErr('evaluate_claim', { claim_id: 'nope' });
  check('unknown claim id errors helpfully', /list_claims/.test(unknownClaim || ''), unknownClaim);

  // ======================================================================= 5
  console.log('\n# 5. focus_node — the shared surface');
  const focus = await call('focus_node', { node_id: 'rec:s10' });
  check('focus_node returns the record detail', focus.detail.author === 'Maxwell' && focus.detail.year === 1970, JSON.stringify(focus.detail).slice(0, 140));
  check('the focused node carries the selection ring', await page.locator('[data-node="rec:s10"].atlas-selected').count() === 1);
  check('the map root is dimmed via a class, not per-node style churn',
    await page.evaluate(() => document.querySelector('.atlas-map').classList.contains('atlas-has-selection')));
  check('exactly one node is selected at a time', await page.locator('.atlas-selected').count() === 1);
  const recPanel = await page.textContent('#atlas-panel');
  check('the panel shows Maxwell (1970) values',
    /Maxwell/.test(recPanel) && /1970/.test(recPanel) && /0\.8/.test(recPanel) && /0\.063/.test(recPanel) && /individual/.test(recPanel),
    recPanel.slice(0, 220));
  check('the record panel is honest about its ladder rung', /unassigned in v0\.1/.test(recPanel));
  const focusEntry = (await audit()).at(-1);
  check('focus_node is ledgered as navigation', focusEntry.kind === 'navigation' && focusEntry.inputs.node_id === 'rec:s10', JSON.stringify(focusEntry));
  const badNode = await callErr('focus_node', { node_id: 'rec:nope' });
  check('an unknown node id errors helpfully', /unknown node id/.test(badNode || '') && /atlas_overview/.test(badNode || ''), badNode);

  // ======================================================================= 6
  console.log('\n# 6. study brief — filled inputs, named unknowns, NO sample size');
  const brief = await call('get_study_brief', { gap_id: 'gap:coverage-weeks' });
  check('brief targets the empty band', /8–16 weeks/.test(brief.target), brief.target);
  check('brief names at least 6 unresolved inputs', brief.unresolved_inputs.length >= 6, String(brief.unresolved_inputs.length));
  check('every unresolved input says why it is unresolved',
    brief.unresolved_inputs.every((u) => typeof u.name === 'string' && typeof u.why === 'string' && u.why.length > 20));
  check('the design implication is equivalence/precision, not superiority',
    /equivalence/.test(brief.filled_by_atlas.design_implication) && /superiority test is the wrong shape/.test(brief.filled_by_atlas.design_implication),
    brief.filled_by_atlas.design_implication);
  check('both current estimates are labelled selection-biased optimistic bounds',
    brief.filled_by_atlas.current_estimates.length === 2
    && brief.filled_by_atlas.current_estimates.every((e) => /selection-biased optimistic bound/.test(e.interpretation)),
    JSON.stringify(brief.filled_by_atlas.current_estimates.map((e) => e.interpretation)));
  // The numbers a brief quotes are the load-bearing part of it — a study gets designed
  // against them. Both are refitted here in node and demanded equal to 1e-9, so a
  // brief that quoted the pooled fit for its subgroup row (or any other mix-up) is red.
  const [briefPooled, briefEarly] = brief.filled_by_atlas.current_estimates;
  const nodeEarly = metaAnalyze(DATASET.studies.filter((s) => s.weeks <= 1), { method: 'REML' });
  check('brief current_estimates[0] is the node-side full-sample REML refit',
    near(briefPooled.estimate, nodeFull.estimate, 1e-9)
    && near(briefPooled.ci[0], nodeFull.ci_lower, 1e-9) && near(briefPooled.ci[1], nodeFull.ci_upper, 1e-9)
    && briefPooled.k === nodeFull.k,
    `page ${briefPooled.estimate} [${briefPooled.ci}] k=${briefPooled.k} vs node ${nodeFull.estimate} [${nodeFull.ci_lower}, ${nodeFull.ci_upper}] k=${nodeFull.k}`);
  check('brief current_estimates[1] is the node-side ≤1-week subgroup REML refit',
    near(briefEarly.estimate, nodeEarly.estimate, 1e-9)
    && near(briefEarly.ci[0], nodeEarly.ci_lower, 1e-9) && near(briefEarly.ci[1], nodeEarly.ci_upper, 1e-9)
    && briefEarly.k === nodeEarly.k,
    `page ${briefEarly.estimate} [${briefEarly.ci}] k=${briefEarly.k} vs node ${nodeEarly.estimate} [${nodeEarly.ci_lower}, ${nodeEarly.ci_upper}] k=${nodeEarly.k}`);
  check('the two brief estimates are actually different fits, not the same one twice',
    briefPooled.estimate !== briefEarly.estimate && briefPooled.k !== briefEarly.k,
    `${briefPooled.estimate}/${briefPooled.k} vs ${briefEarly.estimate}/${briefEarly.k}`);
  check('the brief carries tau2 and I2 from the live fit',
    near(brief.filled_by_atlas.tau2, nodeFull.tau2, 1e-9) && near(brief.filled_by_atlas.I2, nodeFull.I2, 1e-9),
    `${brief.filled_by_atlas.tau2} / ${brief.filled_by_atlas.I2}`);
  const zero = coverage.model.zero_crossing_weeks;
  // Anchored, not just range-checked: the crossing is -intercept/slope of the SAME
  // capped meta-regression, refitted here in node. A range check alone would let the
  // page drift anywhere inside ±0.2 (or hard-code 2.6) and still pass.
  const nodeReg = metaRegression(DATASET.studies, (r) => Math.min(r.weeks, 3));
  const nodeZero = Math.round((-nodeReg.intercept.b / nodeReg.moderator.b) * 10) / 10;
  check('zero-crossing equals the node-side capped meta-regression crossing (-intercept/slope)',
    zero === nodeZero, `page ${zero} vs node ${nodeZero}`);
  check('zero-crossing computed from the live capped-linear fit is ~2.6', zero >= 2.4 && zero <= 2.8, String(zero));
  check('the brief quotes that same computed crossing', brief.filled_by_atlas.rationale.includes(String(zero)), brief.filled_by_atlas.rationale);
  // the honesty assertion: no numeric sample size anywhere except the explicit note
  const briefWithoutNote = { ...brief, explicit_note: undefined };
  const briefJson = JSON.stringify(briefWithoutNote);
  // Widened: the old /sample size|n =/ let "sample_size", "n:", "n_required" and
  // "recommended n" through, which are exactly the shapes a JSON field would use.
  const SAMPLE_SIZE_RE = /sample[ _]?size|n[ _]?(=|:|required)|recommended[ _]?n/i;
  check('NO numeric sample size anywhere in the brief', !SAMPLE_SIZE_RE.test(briefJson),
    (briefJson.match(/.{0,60}(sample[ _]?size|n[ _]?(=|:|required)|recommended[ _]?n).{0,60}/i) || [''])[0]);
  check('…and the note says so out loud',
    /No sample size is computed/.test(brief.explicit_note) && /not an outcome variance/.test(brief.explicit_note), brief.explicit_note);
  const briefPanel = await page.textContent('#atlas-panel');
  check('the brief renders as a card in the panel',
    /Unresolved/.test(briefPanel) && /No sample size is computed/.test(briefPanel) && /equivalence/.test(briefPanel), briefPanel.slice(0, 200));
  check('the coverage gap node is selected by the brief', await page.locator('[data-node="gap:coverage-weeks"].atlas-selected').count() === 1);
  const briefEntry = (await audit()).at(-1);
  check('the brief is ledgered', briefEntry.kind === 'brief' && /no sample size/.test(briefEntry.summary), JSON.stringify(briefEntry));
  const noBrief = await call('get_study_brief', { gap_id: 'gap:replication' });
  check('other gap types return the short no-brief object',
    noBrief.brief === null && noBrief.reason === 'no brief for this gap type in M2-lite', JSON.stringify(noBrief));
  const badGap = await callErr('get_study_brief', { gap_id: 'gap:nope' });
  check('an unknown gap id errors helpfully', /unknown gap id/.test(badGap || '') && /get_gaps/.test(badGap || ''), badGap);

  // ======================================================================= 7
  console.log('\n# 7. the human tool console');
  await page.click('details:has(#atlas-console) > summary');
  check('console lists all 8 tools', await page.locator('#atlas-console select option').count() === 8);
  await page.selectOption('#atlas-console select', 'evaluate_claim');
  await page.fill('#atlas-console textarea', JSON.stringify({ claim_id: 'c-window' }));
  await page.click('#atlas-console .le-btn');
  await page.waitForTimeout(150);
  const consoleEntry = (await audit()).at(-1);
  check('a console-driven evaluation is attributed to the human',
    consoleEntry.actor === 'human' && consoleEntry.tool === 'evaluate_claim' && consoleEntry.inputs.claim_id === 'c-window',
    JSON.stringify(consoleEntry));
  check('console output rendered as JSON', /"verdict"/.test(await page.textContent('#atlas-console .le-console-out')));
  check('human rows are visibly marked in the ledger', await page.locator('#atlas-ledger .le-human').count() >= 1);
  check('agent rows too', await page.locator('#atlas-ledger .le-agent').count() >= 1);
  check('and the boot row is the system', await page.locator('#atlas-ledger .le-system').count() === 1);

  // ======================================================================= 8
  console.log('\n# 8. pure reads leave no trace');
  const rowsBefore = await ledgerRows();
  const auditBefore = (await audit()).length;
  await call('atlas_overview', {});
  await call('get_cell', {});
  await call('list_claims', {});
  await call('get_gaps', {});
  check('the four read tools ledger nothing', (await audit()).length === auditBefore && (await ledgerRows()) === rowsBefore,
    `${auditBefore} → ${(await audit()).length}`);
  const ov = await call('atlas_overview', {});
  check('overview reports the graph size', ov.graph.nodes === 33 && ov.graph.edges === 37, JSON.stringify(ov.graph));
  check('overview states it is read-only', ov.honesty.some((s) => /READ-ONLY/.test(s)), JSON.stringify(ov.honesty));
  check('overview states there is no numeric power output', ov.honesty.some((s) => /no numeric power or sample size/.test(s)));
  check('overview states the single-literature demo scale', ov.honesty.some((s) => /Demo scale: ONE literature/.test(s)));
  check('overview flags the candidate moderator', ov.honesty.some((s) => /CANDIDATE/.test(s)));
  const cell = await call('get_cell', {});
  // band counts recomputed here from the dataset, not copied off the page
  const bandExpect = {
    '≤ 1 week': DATASET.studies.filter((s) => s.weeks <= 1).length,
    '2–7 weeks': DATASET.studies.filter((s) => s.weeks >= 2 && s.weeks <= 7).length,
    '≥ 17 weeks': DATASET.studies.filter((s) => s.weeks >= 17).length,
  };
  check('get_cell reports k = 19 and band counts matching the dataset',
    cell.k === 19 && JSON.stringify(cell.records_by_weeks_band) === JSON.stringify(bandExpect),
    `${JSON.stringify(cell.records_by_weeks_band)} vs ${JSON.stringify(bandExpect)}`);
  check('the three bands partition all 19 records', Object.values(bandExpect).reduce((a, b) => a + b, 0) === 19, JSON.stringify(bandExpect));
  check('get_cell attaches all 6 claims with their verdicts',
    cell.claims_attached.length === 6 && cell.claims_attached.every((c) => c.verdict !== 'untested'), JSON.stringify(cell.claims_attached));
  check('get_cell refuses an unknown cell id', /unknown cell id/.test(await callErr('get_cell', { cell_id: 'cell:nope' }) || ''));

  // ======================================================================= 9
  console.log('\n# 9. keyboard: WebMCP is not accessibility');
  await page.locator('[data-node="gap:verification"]').focus();
  check('a node takes DOM focus', await page.evaluate(() => document.activeElement?.getAttribute('data-node')) === 'gap:verification');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  check('Enter selects the focused node', await page.locator('[data-node="gap:verification"].atlas-selected').count() === 1);
  check('…and opens it in the panel', /Verification gap/.test(await page.textContent('#atlas-panel')));
  const kbEntry = (await audit()).at(-1);
  check('a keyboard selection is attributed to the human', kbEntry.actor === 'human' && kbEntry.kind === 'navigation', JSON.stringify(kbEntry));

  // ====================================================================== 10
  console.log('\n# 10. reading affordances: p-value floor, Escape, no scroll hijack');
  // (a) a p-value below the printed precision must read as a bound, never as "0".
  // The ≤1-week subgroup is the repro: p = 0.000106, which fmt() rendered as "p = 0".
  const lateIds = DATASET.studies.filter((s) => s.weeks >= 2).map((s) => s.id);
  const tiny = await call('synthesize', { exclude: lateIds });
  check('the repro synthesis really does have p below the printed precision',
    tiny.k === 8 && tiny.p > 0 && tiny.p < 0.0005, `k=${tiny.k} p=${tiny.p}`);
  const tinyCell = await cellText();
  check('the cell node prints "p < 0.001", not "p = 0"',
    /p < 0\.001/.test(tinyCell) && !/p = 0(\D|$)/.test(tinyCell), tinyCell);
  const tinyAria = await page.getAttribute('[data-node="cell:teacher-expectancy-iq"]', 'aria-label');
  check('…and so does the aria-label', /p < 0\.001/.test(tinyAria || ''), tinyAria);
  check('…and the panel', /p < 0\.001/.test(await page.textContent('#atlas-panel')));
  check('…and the ledger summary', /p < 0\.001/.test((await audit()).at(-1).summary), (await audit()).at(-1).summary);
  await call('synthesize', {}); // back to the canonical full-sample fit

  // (b) Escape lets go of a selection — and is NOT an event worth auditing.
  await call('focus_node', { node_id: 'rec:s10' });
  check('a node is selected before Escape', await page.locator('.atlas-selected').count() === 1);
  const auditBeforeEsc = (await audit()).length;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  check('Escape clears the selection class', await page.locator('.atlas-selected').count() === 0);
  check('…and undims the map', await page.evaluate(() => !document.querySelector('.atlas-map').classList.contains('atlas-has-selection')));
  check('…and restores the panel placeholder', await page.locator('#atlas-panel .atlas-panel-empty').count() === 1,
    (await page.textContent('#atlas-panel')).slice(0, 80));
  check('…and is not ledgered — closing a panel is not an act on the evidence',
    (await audit()).length === auditBeforeEsc, `${auditBeforeEsc} → ${(await audit()).length}`);

  // (c) a new ledger row scrolls the LEDGER, not the reader. scrollIntoView() on the
  // row walked up to the document and hijacked the page ~545px per map click.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  // dispatched, not page.click(): Playwright would scroll the node into view itself
  // and the measurement would be of Playwright, not of the page.
  await page.evaluate(() => document.querySelector('[data-node="rec:s12"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(400);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  check('a map click does not scroll the page out from under the reader',
    scrollBefore === 0 && scrollAfter === 0, `scrollY ${scrollBefore} → ${scrollAfter}`);
  check('…because the ledger scrolled its own box to the newest row instead',
    await page.evaluate(() => {
      const l = document.querySelector('#atlas-ledger');
      return l.scrollHeight > l.clientHeight && l.scrollTop >= l.scrollHeight - l.clientHeight - 2;
    }));
  check('…and the click did select the node it was aimed at',
    await page.locator('[data-node="rec:s12"].atlas-selected').count() === 1);
  // clicking empty map background is the mouse equivalent of Escape
  await page.evaluate(() => document.querySelector('.atlas-map').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(120);
  check('a click on empty map background deselects too', await page.locator('.atlas-selected').count() === 0);

  // ====================================================================== 11
  console.log('\n# 11. no probes, no errors, screenshots');
  const probes = await page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__')));
  check('no window.__* probe hooks', probes.length === 0, probes.join(','));
  check('zero page errors across the whole session', errors.length === 0, errors.join(' | '));

  // demo state for the screenshots: claims evaluated, coverage gap + brief open
  await call('get_study_brief', { gap_id: 'gap:coverage-weeks' });
  // drop DOM focus: a focus ring on a node nobody selected is correct behaviour but
  // noise in a still, and the screenshots are read as pictures of the demo state
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(root, 'verify', '_snap_atlas.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(root, 'verify', '_snap_atlas_dark.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  console.log('  (screenshots: verify/_snap_atlas.png, _snap_atlas_map.png, _snap_atlas_dark.png)');
} finally {
  await browser.close();
  server.kill();
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\natlas.e2e.mjs: all green');
