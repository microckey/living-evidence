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
    check('document statements come from canonical claim data',
      CLAIMS.every((c) => domStatements[c.id] === c.statement),
      JSON.stringify(domStatements));
    check('mutable DOM whitespace does not redefine a signed statement',
      domStatements['c-textbook'] === CLAIMS[0].statement && !/\n/.test(domStatements['c-textbook']),
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
  check('10 tools exposed', tools.length === 10, tools.join(','));
  check('the expected 10 tools',
    JSON.stringify(tools) === JSON.stringify(['atlas_overview', 'get_cell', 'list_claims', 'evaluate_claim', 'get_gaps', 'get_study_brief', 'focus_node', 'synthesize', 'list_nodes', 'get_audit_log']),
    tools.join(','));
  const readOnlyNames = await page.evaluate(() => window.LivingEvidenceAtlas.tools.filter((t) => t.readOnly).map((t) => t.name));
  check('the two new tools are declared read-only',
    readOnlyNames.includes('list_nodes') && readOnlyNames.includes('get_audit_log'), readOnlyNames.join(','));
  check('every schema is closed (additionalProperties: false)',
    await page.evaluate(() => window.LivingEvidenceAtlas.tools.every((t) => t.inputSchema.additionalProperties === false)));
  const agentStatus = await page.evaluate(() => window.LivingEvidenceAtlas.state.agent);
  check('WebMCP absent in the test browser, handled gracefully', agentStatus.active === false, JSON.stringify(agentStatus));
  check('registration status is explicitly "absent" (not a silent false)', agentStatus.status === 'absent', JSON.stringify(agentStatus));
  check('absent status reports 0/10 registered', agentStatus.registered === 0 && agentStatus.total === 10, JSON.stringify(agentStatus));
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
  // The statement now enumerates the observed values and states the model's ONE
  // prediction for the whole band, instead of implying the band has its own.
  check('the coverage statement lists the observed weeks and the empty band',
    coverage.statement.startsWith(`Observed weeks are ${expected.observed.join(', ')};`)
    && coverage.statement.includes(`none fall in ${expected.empty_band[0]}–${expected.empty_band[1]}`),
    coverage.statement);
  check('the coverage gap is ranked as coverage, with no confidence ranking claimed',
    /raw-moderator coverage gap/.test(coverage.ranked_by) && /no confidence or priority ranking is inferred/.test(coverage.ranked_by)
    && /no distinct fitted prediction under the current model/.test(coverage.ranked_by),
    coverage.ranked_by);
  const replication = gapsRes.gaps.find((g) => g.id === 'gap:replication');
  // "0 of 19" was a measurement the record schema cannot make: null + not_collected.
  check('replication gap reports preregistration as NOT COLLECTED, not as zero',
    replication.count_with_prereg === null && replication.assessment_status === 'not_collected' && replication.total_records === 19,
    JSON.stringify(replication));
  check('replication gap title and statement say "unknown", not "none"',
    /preregistration linkage unknown/i.test(replication.title)
    && /Preregistration linkage was not assessed/.test(replication.statement)
    && /No inference about the existence of preregistered replications is available/.test(replication.statement),
    `${replication.title} — ${replication.statement}`);
  check('the replication card on the map says unknown too',
    /Preregistration linkage unknown/.test(await page.textContent('#atlas-map [data-node="gap:replication"]')),
    await page.textContent('#atlas-map [data-node="gap:replication"]'));
  check('replication gap does not overclaim', /not evidence that no pre-registered replication/.test(replication.honest_framing), replication.honest_framing);
  const verification = gapsRes.gaps.find((g) => g.id === 'gap:verification');
  check('verification gap distinguishes secondary locators from four absent verification layers',
    verification.total_records === 19
    && verification.count_with_secondary_locator === 19
    && verification.count_with_primary_source_check === 0
    && verification.count_with_effect_size_derivation_check === 0
    && verification.count_with_manifest === 0
    && verification.count_with_risk_of_bias_assessment === 0,
    JSON.stringify(verification));
  check('verification statement reports primary, derivation, manifest and RoB counts without treating a secondary locator as verification',
    /All 19 records have secondary/.test(verification.statement)
    && /0\/19 have primary-source checks/.test(verification.statement)
    && /0\/19 have independent effect-size derivation checks/.test(verification.statement)
    && /0\/19 have per-record data manifests/.test(verification.statement)
    && /0\/19 have structured risk-of-bias assessments/.test(verification.statement),
    verification.statement);
  check('verification framing says recomputability is not primary-source, derivation, validity, RoB or authenticity verification',
    /pooled synthesis is recomputable/.test(verification.honest_framing)
    && /does not verify primary extraction, effect derivation, design validity, risk of bias, or data authenticity/.test(verification.honest_framing)
    && /Secondary row locators are a starting point, not primary-source traceability/.test(verification.honest_framing),
    verification.honest_framing);
  check('get_gaps says the numbers depend on authored definitions, not just the data',
    /computed from the current records under authored gap definitions and model specifications/.test(gapsRes.note), gapsRes.note);
  check('the map shows the computed band, not a literal', /8–16 weeks/.test(await page.textContent('#atlas-map [data-node="gap:coverage-weeks"]')));

  // ======================================================================= 3
  console.log('\n# 3. synthesize vs node re-fits');
  const before3 = await ledgerRows();
  const syn = await call('synthesize', {});
  const nodeFull = metaAnalyze(DATASET.studies, { method: 'REML' });
  check('synthesize k = 19', syn.k === 19, String(syn.k));
  check('synthesize names k as effect-size records and reports 18 represented experiments',
    syn.k_unit === 'effect_size_records' && syn.experiment_count_represented === 18,
    JSON.stringify({ k_unit: syn.k_unit, experiment_count_represented: syn.experiment_count_represented }));
  check('synthesize estimate matches node metaAnalyze REML', near(syn.estimate, nodeFull.estimate, 1e-9), `${syn.estimate} vs ${nodeFull.estimate}`);
  check('synthesize CI matches node metaAnalyze REML',
    near(syn.ci[0], nodeFull.ci_lower, 1e-9) && near(syn.ci[1], nodeFull.ci_upper, 1e-9), JSON.stringify(syn.ci));
  check('synthesize tau2 matches node metaAnalyze REML', near(syn.tau2, nodeFull.tau2, 1e-9), `${syn.tau2} vs ${nodeFull.tau2}`);
  check('synthesis is returned as a (spec, result) pair', syn.spec && syn.spec.estimator === 'REML' && Array.isArray(syn.spec.excluded), JSON.stringify(syn.spec));
  const synEx = await call('synthesize', { exclude: ['s04'] });
  const nodeEx = metaAnalyze(DATASET.studies.filter((s) => s.id !== 's04'), { method: 'REML' });
  check('exclusion drops k to 18', synEx.k === 18, String(synEx.k));
  check('excluding one of the two Pellegrini/Hicks records still represents all 18 experiments',
    synEx.k_unit === 'effect_size_records' && synEx.experiment_count_represented === 18,
    JSON.stringify({ k_unit: synEx.k_unit, experiment_count_represented: synEx.experiment_count_represented }));
  check('excluded fit matches the node 18-record re-fit',
    near(synEx.estimate, nodeEx.estimate, 1e-9) && near(synEx.ci[0], nodeEx.ci_lower, 1e-9) && near(synEx.ci[1], nodeEx.ci_upper, 1e-9) && near(synEx.tau2, nodeEx.tau2, 1e-9),
    `${synEx.estimate}/${synEx.tau2} vs ${nodeEx.estimate}/${nodeEx.tau2}`);
  // the drawn cell tracks the tool, exclusion and all — not a static label
  const cellText = () => page.textContent('#atlas-map [data-node="cell:teacher-expectancy-iq"]');
  const shown = (x) => x.toFixed(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const cellAfterExclusion = await cellText();
  check('the cell node shows the excluded re-fit',
    cellAfterExclusion.includes(shown(synEx.estimate)) && /18 effect-size records \(−1\)/.test(cellAfterExclusion),
    cellAfterExclusion);
  // The aria-label is the same fact for a screen reader; it must track the re-fit,
  // and it must carry the k and the exclusion — a pooled number without its record
  // count is not the same claim.
  const cellAria = await page.getAttribute('[data-node="cell:teacher-expectancy-iq"]', 'aria-label');
  check('the cell aria-label tracks the excluded re-fit (estimate, 18 records, the exclusion)',
    cellAria.includes(shown(synEx.estimate)) && /18 effect-size records/.test(cellAria) && /excluding s04/.test(cellAria),
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
    cellRestored.includes(shown(nodeFull.estimate)) && /19 effect-size records/.test(cellRestored), cellRestored);

  // ======================================================================= 4
  console.log('\n# 4. claims: registered-rule outcomes, on the map');
  const EXPECTED_OUTCOMES = {
    'c-textbook': 'failed', 'c-overall': 'passed', 'c-moderator': 'passed',
    'c-window': 'passed', 'c-robust': 'passed', 'c-bias': 'inconclusive',
  };
  const listed = await call('list_claims', {});
  check('list_claims returns 6 claims, all canonically not_run at boot',
    listed.claims.length === 6
    && listed.claims.every((c) => c.outcome_type === 'document_registered_rule' && c.rule_outcome === 'not_run'),
    JSON.stringify(listed.claims.map((c) => [c.outcome_type, c.rule_outcome])));
  check('every claim ships its machine-check AST',
    listed.claims.every((c) => c.machine_check && Array.isArray(c.machine_check.verdicts) && c.machine_check.verdicts.at(-1).default === true));
  check('claims carry the statement from the module (no prose to scrape here)',
    listed.claims.every((c, i) => c.statement === CLAIMS[i].statement), JSON.stringify(listed.claims.map((c) => c.statement.slice(0, 20))));
  const RULE_SCOPE = 'document-registered rule outcome only — not an independent judgment of truth, validity, risk of bias, or evidence quality';
  check('list_claims states exactly what a registered-rule outcome is scoped to',
    listed.rule_outcome_scope === RULE_SCOPE && listed.verdict_scope === RULE_SCOPE,
    JSON.stringify({ rule_outcome_scope: listed.rule_outcome_scope, verdict_scope: listed.verdict_scope }));
  const LEGACY_FOR = { failed: 'challenged', passed: 'supported', inconclusive: 'nuanced' };
  for (const [id, want] of Object.entries(EXPECTED_OUTCOMES)) {
    const r = await call('evaluate_claim', { claim_id: id });
    check(`claim ${id} registered rule ${want}`,
      r.outcome_type === 'document_registered_rule' && r.rule_outcome === want
      && r.rule_outcome_scope === RULE_SCOPE && r.verdict === LEGACY_FOR[want],
      JSON.stringify({ outcome_type: r.outcome_type, rule_outcome: r.rule_outcome, legacy_verdict: r.verdict, reason: r.reason }));
  }
  const glyphs = await page.evaluate(() => [...document.querySelectorAll('.atlas-claim-badge')].map((e) => e.textContent).filter(Boolean));
  check('6 verdict glyphs painted on the map', glyphs.length === 6 && glyphs.every((g) => '✓✗△'.includes(g)), glyphs.join(''));
  // Counting glyphs is not checking them: a swapped glyph map still paints 6 valid
  // symbols and still yields 4/1/1. Pair each claim's badge with its own rule outcome.
  const GLYPH_FOR = { passed: '✓', failed: '✗', inconclusive: '△' };
  for (const [id, want] of Object.entries(EXPECTED_OUTCOMES)) {
    const badge = await page.textContent(`[data-claim-badge="${id}"]`);
    check(`claim ${id} wears the registered-rule ${want} glyph (${GLYPH_FOR[want]})`,
      badge === GLYPH_FOR[want], `${id} shows "${badge}", ${want} should show "${GLYPH_FOR[want]}"`);
  }
  // …and the badge is decoration for the eye only: the aria-label has to say it too.
  const textbookAria = await page.getAttribute('[data-node="claim:c-textbook"]', 'aria-label');
  check('an evaluated claim refreshes its aria-label with the canonical rule outcome',
    /Rule outcome: failed/.test(textbookAria || ''), textbookAria);
  check('glyph colours are carried by verdict classes',
    await page.locator('.atlas-verdict-challenged').count() === 1
    && await page.locator('.atlas-verdict-nuanced').count() === 1
    && await page.locator('.atlas-verdict-supported').count() === 4);
  const panelAfterClaims = await page.textContent('#atlas-panel');
  check('the panel shows the last evaluated claim', /c-bias/.test(panelAfterClaims) && /Egger/.test(panelAfterClaims), panelAfterClaims.slice(0, 160));
  check('the last claim node is the selected one', await page.locator('[data-node="claim:c-bias"].atlas-selected').count() === 1);
  const unknownClaim = await callErr('evaluate_claim', { claim_id: 'nope' });
  check('unknown claim id errors helpfully', /list_claims/.test(unknownClaim || ''), unknownClaim);
  // C21: the map calls it claim:c-window, list_claims calls it c-window. Both address it.
  const nodeFormClaim = await call('evaluate_claim', { claim_id: 'claim:c-window' });
  check('evaluate_claim accepts the node form claim:c-window',
    nodeFormClaim.claim_id === 'c-window' && nodeFormClaim.node_id === 'claim:c-window'
    && nodeFormClaim.rule_outcome === 'passed' && nodeFormClaim.verdict === 'supported',
    JSON.stringify({ id: nodeFormClaim.claim_id, node: nodeFormClaim.node_id, outcome: nodeFormClaim.rule_outcome, legacy: nodeFormClaim.verdict }));
  check('the registered-rule response scopes itself',
    nodeFormClaim.rule_outcome_scope === listed.rule_outcome_scope && nodeFormClaim.verdict_scope === listed.verdict_scope,
    JSON.stringify({ rule_outcome_scope: nodeFormClaim.rule_outcome_scope, verdict_scope: nodeFormClaim.verdict_scope }));
  await call('evaluate_claim', { claim_id: 'c-bias' }); // restore the demo state block 4 left behind

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
  check('the record detail exposes structured provenance and an explicitly unassessed RoB',
    focus.detail.provenance?.source_type === 'secondary_dataset'
    && focus.detail.provenance?.source_url === 'https://wviechtb.github.io/metadat/reference/dat.raudenbush1985.html'
    && /row 10 \(s10\)/.test(focus.detail.provenance?.source_locator || '')
    && /not independently re-derived/.test(focus.detail.provenance?.derivation || '')
    && focus.detail.provenance?.synthesis_doi === '10.1037/0022-0663.76.1.85'
    && focus.detail.provenance?.primary_source_checked === false
    && focus.detail.provenance?.effect_size_derivation_checked === false
    && focus.detail.risk_of_bias?.status === 'not_assessed',
    JSON.stringify({ provenance: focus.detail.provenance, risk_of_bias: focus.detail.risk_of_bias }));
  check('the record panel renders locator, derivation, primary-source and RoB caveats',
    /row 10 \(s10\)/.test(recPanel) && /not independently re-derived/.test(recPanel)
    && /primary source checkedno/.test(recPanel.replace(/\s+/g, ' '))
    && /not_assessed/.test(recPanel) && /unassigned in v0\.2/.test(recPanel),
    recPanel.slice(0, 900));

  const pellegriniAware = await call('focus_node', { node_id: 's04' });
  const pellegriniBlind = await call('focus_node', { node_id: 's05' });
  check('s04 and s05 are two records from the same disclosed experiment cluster',
    pellegriniAware.detail.experiment_id === 'pellegrini-hicks-1972'
    && pellegriniBlind.detail.experiment_id === pellegriniAware.detail.experiment_id
    && pellegriniAware.detail.record_role !== pellegriniBlind.detail.record_role,
    JSON.stringify({ s04: [pellegriniAware.detail.experiment_id, pellegriniAware.detail.record_role], s05: [pellegriniBlind.detail.experiment_id, pellegriniBlind.detail.record_role] }));
  await call('focus_node', { node_id: 'rec:s10' });
  const focusEntry = (await audit()).at(-1);
  check('focus_node is ledgered as navigation', focusEntry.kind === 'navigation' && focusEntry.inputs.node_id === 'rec:s10', JSON.stringify(focusEntry));
  const badNode = await callErr('focus_node', { node_id: 'rec:nope' });
  check('an unknown node id errors helpfully', /unknown node id/.test(badNode || '') && /atlas_overview/.test(badNode || ''), badNode);
  // C21: an agent reading get_cell or list_nodes sees record ids like "s10". Making
  // it learn the map's "rec:" prefix before it can point at anything is a trap.
  const bareFocus = await call('focus_node', { node_id: 's10' });
  check('focus_node accepts the bare record id and canonicalises it',
    bareFocus.node_id === 'rec:s10' && bareFocus.bare_id === 's10' && bareFocus.requested_id === 's10'
    && bareFocus.type === 'record' && bareFocus.detail.record_id === 's10',
    JSON.stringify({ n: bareFocus.node_id, b: bareFocus.bare_id, r: bareFocus.requested_id }));
  check('the bare id selects the same node the prefixed id does',
    await page.locator('[data-node="rec:s10"].atlas-selected').count() === 1
    && await page.locator('.atlas-selected').count() === 1);
  const prefixedFocus = await call('focus_node', { node_id: 'rec:s10' });
  check('both id forms return the same node detail',
    prefixedFocus.node_id === bareFocus.node_id && JSON.stringify(prefixedFocus.detail) === JSON.stringify(bareFocus.detail),
    `${prefixedFocus.node_id} vs ${bareFocus.node_id}`);
  const bareClaimFocus = await call('focus_node', { node_id: 'c-window' });
  check('a bare claim id resolves to its claim node', bareClaimFocus.node_id === 'claim:c-window' && bareClaimFocus.type === 'claim', bareClaimFocus.node_id);
  const bareGapFocus = await call('focus_node', { node_id: 'coverage-weeks' });
  check('a bare gap id resolves to its gap node', bareGapFocus.node_id === 'gap:coverage-weeks' && bareGapFocus.type === 'gap', bareGapFocus.node_id);
  const bareModFocus = await call('focus_node', { node_id: 'weeks' });
  check('a bare moderator id resolves to mod:weeks', bareModFocus.node_id === 'mod:weeks' && bareModFocus.type === 'moderator', bareModFocus.node_id);
  const bareSynth = await call('synthesize', { exclude: ['s04'] });
  const prefixedSynth = await call('synthesize', { exclude: ['rec:s04'] });
  check('synthesize takes bare or prefixed record ids and reports both forms',
    bareSynth.estimate === prefixedSynth.estimate && bareSynth.k === 18
    && JSON.stringify(prefixedSynth.excluded) === JSON.stringify(['s04'])
    && JSON.stringify(prefixedSynth.excluded_node_ids) === JSON.stringify(['rec:s04']),
    JSON.stringify({ e: prefixedSynth.excluded, n: prefixedSynth.excluded_node_ids }));
  await call('synthesize', {}); // back to the canonical full-sample fit
  await call('focus_node', { node_id: 'rec:s10' }); // …and back to the record block 5 is about

  // ======================================================================= 6
  console.log('\n# 6. study brief — filled inputs, named unknowns, NO sample size');
  const brief = await call('get_study_brief', { gap_id: 'gap:coverage-weeks' });
  check('brief targets the empty band', /8–16 weeks/.test(brief.target), brief.target);
  check('brief names at least 6 unresolved inputs', brief.unresolved_inputs.length >= 6, String(brief.unresolved_inputs.length));
  check('every unresolved input says why it is unresolved',
    brief.unresolved_inputs.every((u) => typeof u.name === 'string' && typeof u.why === 'string' && u.why.length > 20));
  check('the brief is marked available', brief.available === true, JSON.stringify(brief.available));
  // The Atlas states what each test shape answers and refuses to pick one — and it
  // quotes the model's prediction for the band rather than leaving "≈ 0" implicit.
  check('the design implication refuses to choose the test but names both shapes',
    /The Atlas cannot choose the test/.test(brief.filled_by_atlas.design_implication)
    && /equivalence analysis/.test(brief.filled_by_atlas.design_implication)
    && /a superiority test answers that different question/.test(brief.filled_by_atlas.design_implication)
    && /define a margin δ/.test(brief.filled_by_atlas.design_implication),
    brief.filled_by_atlas.design_implication);
  check('neither current estimate is offered as a bound or a planning value',
    brief.filled_by_atlas.current_estimates.length === 2
    && brief.filled_by_atlas.current_estimates.every((e) => /justified planning value/.test(e.interpretation))
    && /neither a bound nor a justified planning value/.test(brief.filled_by_atlas.current_estimates[0].interpretation)
    && /not independent validation and not a justified planning value/.test(brief.filled_by_atlas.current_estimates[1].interpretation)
    && /post-hoc subgroup estimate/.test(brief.filled_by_atlas.current_estimates[1].interpretation)
    && !JSON.stringify(brief.filled_by_atlas.current_estimates).includes('optimistic bound'),
    JSON.stringify(brief.filled_by_atlas.current_estimates.map((e) => e.interpretation)));
  check('unresolved inputs are missing from THIS Atlas, not declared non-existent',
    !/do not exist/.test(JSON.stringify(brief.unresolved_inputs) + brief.explicit_note)
    && brief.unresolved_inputs.some((u) => /may lose pupils/.test(u.why))
    && brief.unresolved_inputs.some((u) => /remains informative but exploratory/.test(u.why))
    && /not present in this Atlas or its corpus/.test(brief.explicit_note),
    brief.explicit_note);
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
  check('the coverage statement quotes that same computed crossing', coverage.statement.includes(String(zero)), coverage.statement);
  // The band's single fitted prediction: under x = min(weeks, 3) every raw value ≥ 3
  // shares one predicted SMD, so it is quoted rather than described as "≈ 0".
  const nodePred3 = Math.round((nodeReg.intercept.b + 3 * nodeReg.moderator.b) * 1e4) / 1e4;
  check('the prediction at x = 3 equals the node-side capped fit (intercept + 3·slope)',
    coverage.model.predicted_smd_at_x3 === nodePred3, `page ${coverage.model.predicted_smd_at_x3} vs node ${nodePred3}`);
  check('the coverage statement quotes that prediction for every raw value ≥ 3',
    coverage.statement.includes(`predicts approximately SMD ${nodePred3} for every raw value ≥ 3`), coverage.statement);
  check('the brief rationale is about model criticism, not effect-hunting',
    /pre-registered study in this band would add raw-week coverage/.test(brief.filled_by_atlas.rationale)
    && /prespecified uncapped or nonlinear alternatives/.test(brief.filled_by_atlas.rationale),
    brief.filled_by_atlas.rationale);
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
  check('other gap types return the short no-brief object, not an error',
    noBrief.available === false && noBrief.brief === null && noBrief.reason === 'no brief for this gap type in M2-lite', JSON.stringify(noBrief));
  const briefSchema = await page.evaluate(() => window.LivingEvidenceAtlas.tools.find((t) => t.name === 'get_study_brief'));
  check('the brief tool is titled as a prospective study-design brief', briefSchema.title === 'Prospective study-design brief', briefSchema.title);
  check('the gap_id schema enumerates the three computed gaps and names the one that compiles',
    JSON.stringify(briefSchema.inputSchema.properties.gap_id.enum) === JSON.stringify(['gap:coverage-weeks', 'gap:replication', 'gap:verification'])
    && /brief_available:true/.test(briefSchema.inputSchema.properties.gap_id.description),
    JSON.stringify(briefSchema.inputSchema.properties.gap_id));
  const badGap = await callErr('get_study_brief', { gap_id: 'gap:nope' });
  check('an unknown gap id errors helpfully', /unknown gap id/.test(badGap || '') && /get_gaps/.test(badGap || ''), badGap);

  // ======================================================================= 7
  console.log('\n# 7. the human tool console');
  await page.click('details:has(#atlas-console) > summary');
  check('console lists all 10 tools', await page.locator('#atlas-console select option').count() === 10);
  await page.selectOption('#atlas-console select', 'evaluate_claim');
  await page.fill('#atlas-console textarea', JSON.stringify({ claim_id: 'c-window' }));
  await page.click('#atlas-console .le-btn');
  await page.waitForTimeout(150);
  const consoleEntry = (await audit()).at(-1);
  check('a console-driven evaluation is attributed to the human',
    consoleEntry.actor === 'human' && consoleEntry.tool === 'evaluate_claim' && consoleEntry.inputs.claim_id === 'c-window',
    JSON.stringify(consoleEntry));
  check('console output renders the canonical registered-rule outcome as JSON',
    /"rule_outcome": "passed"/.test(await page.textContent('#atlas-console .le-console-out')));
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
  await call('list_nodes', {});
  await call('get_audit_log', {});
  check('all six read tools ledger nothing', (await audit()).length === auditBefore && (await ledgerRows()) === rowsBefore,
    `${auditBefore} → ${(await audit()).length}`);
  const ov = await call('atlas_overview', {});
  check('overview reports the graph size', ov.graph.nodes === 33 && ov.graph.edges === 37, JSON.stringify(ov.graph));
  // "READ-ONLY" was false about the page: focus_node, synthesize, evaluate_claim and
  // get_study_brief all change what is on screen. What is immutable is the EVIDENCE.
  check('overview claims evidence-immutability, not read-only-ness',
    ov.honesty.some((s) => /EVIDENCE-IMMUTABLE: no tool adds, removes, or persists records, edges, or claims/.test(s)
      && /change ephemeral page\/UI state and append session-ledger entries/.test(s)
      && /nothing propagates to the exemplar or workspace pages/.test(s))
    && !ov.honesty.some((s) => /READ-ONLY/.test(s)),
    JSON.stringify(ov.honesty));
  check('overview scopes registered-rule outcomes away from truth, validity, RoB and evidence quality',
    ov.rule_outcome_scope === RULE_SCOPE && ov.verdict_scope === RULE_SCOPE
    && ov.honesty.some((s) => /document-registered rule outcome only/.test(s)),
    JSON.stringify({ scope: ov.rule_outcome_scope, honesty: ov.honesty }));
  check('overview invites external checks instead of forbidding arithmetic',
    ov.honesty.some((s) => /Use tool results when reporting page state/.test(s) && /label them external/.test(s)
      && /not the data or model assumptions/.test(s))
    && !ov.honesty.some((s) => /Never recompute/.test(s)),
    JSON.stringify(ov.honesty));
  check('overview places this page in the suite, demotes Board to an unverified experimental appendix, and suggests a flow',
    ov.suite_context.you_are_here === 'atlas' && /index\.html/.test(ov.suite_context.exemplar) && /workspace\.html/.test(ov.suite_context.workspace)
    && /experimental appendix/.test(ov.suite_context.board) && /unverified conversation-to-graph sandbox/.test(ov.suite_context.board)
    && /not part of the exemplar/.test(ov.suite_context.board) && /numerical\/software verification/.test(ov.suite_context.board)
    && Array.isArray(ov.suggested_flow) && ov.suggested_flow.length >= 4 && /list_nodes/.test(ov.suggested_flow.join(' ')),
    JSON.stringify({ board: ov.suite_context.board, flow: ov.suggested_flow }));
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
  check('get_cell reports 19 effect-size records / 18 experiments and band counts matching the dataset',
    cell.k === 19 && cell.record_count === 19 && cell.experiment_count === 18 && cell.analysis_unit === 'effect_size_record'
    && /19 effect-size records/.test(cell.unit_note) && /18 experiments/.test(cell.unit_note)
    && /does not model within-experiment covariance/.test(cell.unit_note)
    && JSON.stringify(cell.records_by_weeks_band) === JSON.stringify(bandExpect),
    `${JSON.stringify(cell.records_by_weeks_band)} vs ${JSON.stringify(bandExpect)}`);
  check('the three bands partition all 19 records', Object.values(bandExpect).reduce((a, b) => a + b, 0) === 19, JSON.stringify(bandExpect));
  check('get_cell attaches all 6 claims with canonical registered-rule outcomes',
    cell.claims_attached.length === 6
    && cell.claims_attached.every((c) => ['passed', 'failed', 'inconclusive'].includes(c.rule_outcome)),
    JSON.stringify(cell.claims_attached));
  check('get_cell refuses an unknown cell id', /unknown cell id/.test(await callErr('get_cell', { cell_id: 'cell:nope' }) || ''));
  // C27: "causal" is the estimand, and the note says what that rests on.
  check('get_cell keeps relation_type causal and explains what it depends on',
    cell.relation_type === 'causal'
    && /contrast of assigned expectancy induction vs no induction/.test(cell.relation_type_note)
    && /randomization, clustering, attrition and outcome-measurement assumptions/.test(cell.relation_type_note),
    `${cell.relation_type} — ${cell.relation_type_note}`);
  check('the effect scale states the SMD direction convention',
    /positive = higher measured IQ in the expectancy group than control/.test(cell.effect_scale), cell.effect_scale);
  const cellSchema = await page.evaluate(() => window.LivingEvidenceAtlas.tools.find((t) => t.name === 'get_cell').inputSchema);
  check('the get_cell schema pins cell_id to the one cell that exists',
    cellSchema.properties.cell_id.const === 'cell:teacher-expectancy-iq', JSON.stringify(cellSchema.properties.cell_id));

  // ---------------------------------------------------------------- 8b
  console.log('\n# 8b. list_nodes — the id directory, and get_audit_log');
  const listNodes = await call('list_nodes', {});
  check('list_nodes counts match the rendered graph',
    listNodes.counts.total === 33 && listNodes.counts.record === 19 && listNodes.counts.claim === 6 && listNodes.counts.gap === 3,
    JSON.stringify(listNodes.counts));
  const recordIds = listNodes.nodes.record.map((r) => r.record_id);
  check('list_nodes returns all 19 record ids, in the dataset\'s own ids',
    recordIds.length === 19 && DATASET.studies.every((s) => recordIds.includes(s.id)),
    recordIds.join(','));
  check('every record entry carries both id forms plus its numbers',
    listNodes.nodes.record.every((r) => r.node_id === `rec:${r.record_id}`
      && typeof r.author === 'string' && Number.isFinite(r.year) && Number.isFinite(r.weeks)
      && Number.isFinite(r.yi) && Number.isFinite(r.vi)),
    JSON.stringify(listNodes.nodes.record[0]));
  const s10Row = listNodes.nodes.record.find((r) => r.record_id === 's10');
  const s10Data = DATASET.studies.find((s) => s.id === 's10');
  check('s10\'s row matches the dataset record field for field',
    s10Row.author === s10Data.author && s10Row.year === s10Data.year && s10Row.weeks === s10Data.weeks
    && s10Row.yi === s10Data.yi && s10Row.vi === s10Data.vi,
    JSON.stringify(s10Row));
  check('every other node type is listed with a label',
    ['cell', 'construct', 'document', 'claim', 'gap', 'moderator'].every((t) => Array.isArray(listNodes.nodes[t])
      && listNodes.nodes[t].every((n) => typeof n.node_id === 'string' && typeof n.label === 'string' && n.label.length > 2)),
    Object.keys(listNodes.nodes).join(','));
  check('the claim node ids are the map\'s claim ids',
    JSON.stringify(listNodes.nodes.claim.map((c) => c.node_id)) === JSON.stringify(CLAIMS.map((c) => `claim:${c.id}`)),
    JSON.stringify(listNodes.nodes.claim.map((c) => c.node_id)));
  const logTool = await call('get_audit_log', {});
  const pageAudit = await audit();
  check('get_audit_log returns the same ledger the page holds, in the same order',
    logTool.entries.length === pageAudit.length && logTool.entries.every((e, i) => e.run === pageAudit[i].run && e.tool === pageAudit[i].tool),
    `${logTool.entries.length} vs ${pageAudit.length}`);
  check('get_audit_log entries carry the M1 envelope',
    logTool.entries.every((e) => REQUIRED_KEYS.every((k) => k in e)) && logTool.entries[0].actor === 'system',
    JSON.stringify(logTool.entries[0]));
  const auditDesc = await page.evaluate(() => window.LivingEvidenceAtlas.tools.find((t) => t.name === 'get_audit_log').description);
  check('get_audit_log calls the digest a checksum, not tamper evidence',
    /non-cryptographic FNV-1a checksum/.test(auditDesc) && /not tamper evidence/.test(auditDesc) && /session-local/.test(auditDesc), auditDesc);

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
