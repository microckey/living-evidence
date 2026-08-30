// Real-browser E2E for WORKSPACE mode — the format turned on itself.
//
// The full loop, in one browser session: an empty workspace, an agent that states
// the hypothesis and proposes real Raudenbush records (with quotes), a human who
// approves them, a claim added as data and evaluated, a reload that restores the
// whole session, and finally an EXPORT that must run as a self-contained document
// with zero network access — that last assertion is the point of the whole file.
//
// Servers (both started here): 8501 serves the workspace, 8502 serves the exported
// document, always on 127.0.0.1. Playwright comes from the absolute path below.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { metaAnalyze } from '../lib/meta-stats.js';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/hirokisugimoto/tennis-checker/node_modules/playwright');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8501;
const EXPORT_PORT = 8502;
const EXPORT_FILE = path.join(root, 'verify', '_export_test.html');
const STORAGE_KEY = 'le-workspace-v1';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}  ${detail}`); }
}

// The three records the agent will propose, copied verbatim out of
// data/raudenbush1985.js (s10, s17, s08) — real numbers, real quotes.
const PROPOSALS = [
  {
    author: 'Maxwell', year: 1970, weeks: 1, setting: 'indiv', tester: 'blind', n1i: 32, n2i: 32,
    yi: 0.80, vi: 0.0630,
    source: 'Raudenbush (1984), J. Educational Psychology 76(1), Table 1',
    quote: 'd = 0.80, weeks = 1 (Raudenbush 1984, Table 1)',
  },
  {
    author: 'Rosenthal & Jacobson', year: 1968, weeks: 1, setting: 'group', tester: 'aware', n1i: 65, n2i: 255,
    yi: 0.30, vi: 0.0193,
    source: 'Raudenbush (1984), J. Educational Psychology 76(1), Table 1',
    quote: 'd = 0.30, weeks = 1 (Raudenbush 1984, Table 1)',
  },
  {
    author: 'Claiborn', year: 1969, weeks: 24, setting: 'group', tester: 'aware', n1i: 26, n2i: 99,
    yi: -0.32, vi: 0.0484,
    source: 'Raudenbush (1984), J. Educational Psychology 76(1), Table 1',
    quote: 'd = -0.32, weeks = 24 (Raudenbush 1984, Table 1)',
  },
];

// A FOURTH real record (s09), proposed just before the reload and deliberately left
// UNDECIDED: an open approval card is session state too, and has to come back.
const PENDING4 = {
  author: 'Kester', year: 1969, weeks: 0, setting: 'group', tester: 'aware', n1i: 75, n2i: 74,
  yi: 0.27, vi: 0.0269,
  source: 'Raudenbush (1984), J. Educational Psychology 76(1), Table 1',
  quote: 'd = 0.27, weeks = 0 (Raudenbush 1984, Table 1)',
};
const ALL_RECORDS = [...PROPOSALS, PENDING4];

// The expected fit, computed HERE with the same engine, in the order the human
// approves them. The page must reproduce it exactly, not approximately.
const EXPECTED = metaAnalyze(PROPOSALS.map((p) => ({ yi: p.yi, vi: p.vi })), { method: 'REML' });

// The claim the agent registers in step 4. Chosen so the "supported" branch holds
// on these three records (pooled 0.2531, p = 0.4155 → positive but not significant).
const CLAIM = {
  id: 'wc-window',
  statement: 'On this evidence base the pooled expectancy effect is positive but not statistically significant.',
  rule: 'Supported iff the pooled REML estimate is > 0 AND p ≥ 0.05.',
  test: {
    analysis: 'overall',
    args: { method: 'REML' },
    verdicts: [
      {
        when: [{ path: 'estimate', op: 'gt', value: 0 }, { path: 'significant', op: 'eq', value: false }],
        verdict: 'supported',
        reason: 'pooled SMD {estimate} [{ci_lower}, {ci_upper}], p = {p} — positive but not significant (k={k})',
      },
      { default: true, verdict: 'challenged', reason: 'pooled SMD {estimate}, p = {p}' },
    ],
  },
};

const serve = (port) => spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const server = serve(PORT);
const exportServer = serve(EXPORT_PORT);
await new Promise((r) => setTimeout(r, 900));

const browser = await chromium.launch({ args: ['--disable-accelerated-2d-canvas', '--disable-gpu'] });
try {
  // "Fresh profile": a brand-new context, so localStorage starts genuinely empty.
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

  const call = (name, args, opts) => page.evaluate(
    async ([n, a, o]) => window.LivingEvidence.invokeTool(n, a, o), [name, args, opts],
  );
  const callErr = (name, args) => page.evaluate(async ([n, a]) => {
    try { await window.LivingEvidence.invokeTool(n, a); return null; } catch (e) { return e.message; }
  }, [name, args]);
  const boot = async () => {
    await page.waitForFunction(() => window.LivingEvidence && window.LivingEvidence.tools.length > 0, null, { timeout: 10000 });
  };

  // ------------------------------------------------ 1. fresh, empty workspace
  console.log('\n# 1 — a fresh workspace');
  await page.goto(`http://127.0.0.1:${PORT}/workspace.html`, { waitUntil: 'load' });
  await boot();
  const tools = await page.evaluate(() => window.LivingEvidence.tools.map((t) => t.name));
  check('workspace exposes 15 tools (12 document + 3 workspace)', tools.length === 15, tools.join(','));
  for (const t of ['set_hypothesis', 'add_claim', 'export_document']) check(`workspace tool present: ${t}`, tools.includes(t));
  check('mode reported as workspace', await page.evaluate(() => window.LivingEvidence.mode) === 'workspace');
  const status = await page.textContent('#le-status');
  check('status banner explains the fallback', /Tool console/.test(status), status);
  check('empty evidence base binds k = 0', (await page.textContent('[data-le-bind="k"]')) === '0');
  check('unpoolable stats show a dash, not NaN', (await page.textContent('[data-le-bind="estimate"]')) === '—');
  const emptyNote = await page.textContent('#le-main-figure .le-empty-note');
  check('empty-evidence placeholder invites proposals', /evidence base empty/.test(emptyNote || ''), emptyNote);
  check('no forest plot yet', await page.locator('#le-main-figure svg').count() === 0);
  check('claims list shows its empty state', /No claims yet/.test(await page.textContent('#le-claims-list')));
  const ov0 = await call('get_document_overview', {});
  check('overview survives an empty evidence base', ov0.evidence_base.k === 0 && ov0.current_overall_fit === null, JSON.stringify(ov0.current_overall_fit));
  check('overview tells the agent how a workspace works', ov0.rules_of_engagement.some((r) => /WORKSPACE/.test(r)), '');
  // C15: the one thing an agent cannot do here is approve. The workflow has to say
  // so in order, or an agent waits for a tool that does not exist.
  check('overview ships an ordered authoring workflow',
    Array.isArray(ov0.workflow) && ov0.workflow.length >= 5
    && /^set_hypothesis/.test(ov0.workflow[0]) && /^propose_study/.test(ov0.workflow[1])
    && /export_document/.test(ov0.workflow.at(-1)),
    JSON.stringify(ov0.workflow));
  check('the workflow names the human approval gate and the absence of an approval tool',
    ov0.workflow.some((s) => /NO agent approval tool/.test(s) && /k changes only after approval/.test(s) && /≥2 approved records/.test(s)),
    JSON.stringify(ov0.workflow));
  check('the workflow points at the exemplar as the demo surface',
    /This page is the authoring surface/.test(ov0.workflow_note || '') && /exemplar page is the fastest cross-examination demo/.test(ov0.workflow_note || ''),
    String(ov0.workflow_note));
  check('overview orients the workspace inside the suite',
    ov0.suite_context.you_are_here === 'workspace' && /index\.html/.test(ov0.suite_context.exemplar) && /atlas\.html/.test(ov0.suite_context.atlas),
    JSON.stringify(ov0.suite_context));
  check('overview suggests an authoring flow that ends in export',
    Array.isArray(ov0.suggested_flow) && /set_hypothesis/.test(ov0.suggested_flow[0]) && /export_document/.test(ov0.suggested_flow.at(-1)),
    JSON.stringify(ov0.suggested_flow));
  const poolErr = await callErr('run_meta_analysis', {});
  check('analysis on an empty base throws its normal error', /fewer than 2 studies/.test(poolErr || ''), poolErr);
  await page.screenshot({ path: path.join(root, 'verify', '_snap_workspace_fresh.png'), fullPage: true });

  // ------------------------------------------- 2. hypothesis, proposals, approval
  console.log('\n# 2 — the agent proposes, the human approves');
  const hyp = 'Experimentally induced teacher expectations raise pupils’ measured IQ.';
  const setH = await call('set_hypothesis', { text: hyp });
  check('set_hypothesis returns the new text', setH.hypothesis === hyp, JSON.stringify(setH));
  check('hypothesis rendered in the page', (await page.textContent('#le-hypothesis')) === hyp);
  const emptyH = await callErr('set_hypothesis', { text: '   ' });
  check('whitespace-only hypothesis rejected as blank, not as missing',
    /missing required field: text/.test(emptyH || '') && /blank after trimming/.test(emptyH || ''), emptyH);
  const absentH = await callErr('set_hypothesis', {});
  check('an absent hypothesis is rejected too', /missing required field: text/.test(absentH || ''), absentH);
  const longH = await callErr('set_hypothesis', { text: 'x'.repeat(501) });
  check('over-long hypothesis rejected', /max 500/.test(longH || ''), longH);

  const { quote, ...noQuote } = PROPOSALS[0];
  const noQuoteErr = await callErr('propose_study', noQuote);
  check('propose_study without a quote rejected', /missing required field: quote/.test(noQuoteErr || ''), noQuoteErr);

  for (const p of PROPOSALS) {
    const res = await call('propose_study', p);
    check(`proposal pending: ${p.author}`, res.status === 'pending_human_approval', JSON.stringify(res));
  }
  check('three approval cards on the page', await page.locator('.le-pending-card').count() === 3);
  check('pending section revealed', await page.locator('#pending-section').isVisible());
  check('nothing in the evidence base before approval', (await call('get_studies', {})).studies.length === 0);

  for (let i = 0; i < 3; i++) {
    await page.click('.le-pending-card .le-btn-approve');
    await page.waitForTimeout(120);
  }
  check('all approval cards consumed', await page.locator('.le-pending-card').count() === 0);
  check('proposals section hides itself again when empty', await page.locator('#pending-section').isHidden());
  const ov1 = await call('get_document_overview', {});
  check('evidence base is k=3', ov1.evidence_base.k === 3, String(ov1.evidence_base.k));
  check('evidence version 4 (1 at boot, +1 per approval)', ov1.evidence_base.evidence_version === 4, String(ov1.evidence_base.evidence_version));
  check('bound k updated to 3', (await page.textContent('[data-le-bind="k"]')) === '3');
  check('main forest plot now renders', await page.locator('#le-main-figure svg').count() === 1);
  check('approved records carry structured provenance',
    (await call('get_studies', {})).studies.every((s) => s.provenance && typeof s.provenance === 'object' && s.provenance.quote),
    JSON.stringify((await call('get_studies', {})).studies.map((s) => s.provenance)));
  check('three human approvals in the ledger', await page.locator('#le-ledger .le-human').count() === 3);

  // --------------------------------------------------- 3. the numbers are ours
  console.log('\n# 3 — the page reproduces the engine exactly');
  const fit = await call('run_meta_analysis', { method: 'REML' });
  for (const key of ['estimate', 'se', 'z', 'p', 'ci_lower', 'ci_upper', 'tau2', 'I2', 'Q']) {
    check(`in-page REML ${key} matches node to 1e-9`, Math.abs(fit[key] - EXPECTED[key]) < 1e-9, `${fit[key]} vs ${EXPECTED[key]}`);
  }
  check('k = 3', fit.k === 3 && EXPECTED.k === 3, String(fit.k));
  check('pooled estimate is finite', Number.isFinite(fit.estimate), String(fit.estimate));
  // An oracle that borrows nothing from our engine: the fixed-effect estimate simply
  // IS the inverse-variance weighted mean, sum(yi/vi) / sum(1/vi). The node-vs-page
  // comparison above would still pass if both sides were wrong in the same way; this
  // one would not. (Results are reported rounded to 4 decimals, so the oracle is too.)
  const feRaw = PROPOSALS.reduce((a, s) => a + s.yi / s.vi, 0) / PROPOSALS.reduce((a, s) => a + 1 / s.vi, 0);
  const feOracle = Math.round(feRaw * 1e4) / 1e4;
  const feFit = await call('run_meta_analysis', { method: 'FE' });
  check('page FE estimate matches the closed-form inverse-variance mean to 1e-9',
    Math.abs(feFit.estimate - feOracle) < 1e-9, `${feFit.estimate} vs ${feOracle} (unrounded ${feRaw})`);

  // ------------------------------------------------------------ 4. add a claim
  console.log('\n# 4 — a claim added as data, then tested');
  const badClaim = await callErr('add_claim', {
    statement: 'Bad claim', rule: 'x', test: { analysis: 'overall', verdicts: [{ when: [{ path: 'estimate', op: 'gt', value: 0 }], verdict: 'supported' }] },
  });
  check('claim without a default verdict rejected', /last verdict entry must be/.test(badClaim || ''), badClaim);
  const unknownAnalysis = await callErr('add_claim', {
    statement: 'Bad claim', rule: 'x', test: { analysis: 'astrology', verdicts: [{ default: true, verdict: 'supported' }] },
  });
  check('claim naming an unknown analysis rejected', /unknown analysis "astrology"/.test(unknownAnalysis || ''), unknownAnalysis);
  const badId = await callErr('add_claim', { id: 'x" onload="', statement: 'Bad id', rule: 'x', test: CLAIM.test });
  check('claim id that would break a selector rejected', /not usable/.test(badId || ''), badId);
  const noStatement = await callErr('add_claim', { rule: 'x', test: CLAIM.test });
  check('claim without a statement rejected', /missing required field: statement/.test(noStatement || ''), noStatement);

  // The AST is the one argument that matters, and an agent that has to guess its
  // shape writes claims that bounce. The schema spells it out, closed at every level.
  const addSchema = await page.evaluate(() => window.LivingEvidence.tools.find((t) => t.name === 'add_claim').inputSchema);
  const testSchema = addSchema.properties.test;
  const verdictItems = testSchema.properties.verdicts.items;
  check('add_claim declares the full AST rather than a bare object',
    JSON.stringify(testSchema.properties.analysis.enum) === JSON.stringify(['overall', 'loo', 'subgroup', 'metareg', 'funnel', 'cumulative'])
    && testSchema.additionalProperties === false && JSON.stringify(testSchema.required) === JSON.stringify(['analysis', 'verdicts']),
    JSON.stringify(testSchema.properties.analysis));
  check('the verdicts schema is closed and mirrors validateTest',
    testSchema.properties.verdicts.minItems === 2
    && verdictItems.additionalProperties === false
    && JSON.stringify(verdictItems.properties.verdict.enum) === JSON.stringify(['supported', 'challenged', 'nuanced'])
    && JSON.stringify(verdictItems.properties.when.items.properties.op.enum) === JSON.stringify(['lt', 'le', 'gt', 'ge', 'eq', 'ne', 'abs_lt', 'abs_ge'])
    && verdictItems.properties.when.items.additionalProperties === false
    && JSON.stringify(verdictItems.properties.when.items.required) === JSON.stringify(['path', 'op', 'value']),
    JSON.stringify(verdictItems));
  check('the focus selector is declared and closed',
    JSON.stringify(testSchema.properties.focus.required) === JSON.stringify(['collection', 'match_field', 'match_substring'])
    && testSchema.properties.focus.additionalProperties === false,
    JSON.stringify(testSchema.properties.focus));
  check('add_claim points at list_claims as the template source',
    /copy an existing claim's machine_check from list_claims as a template/i.test(
      (await page.evaluate(() => window.LivingEvidence.tools.find((t) => t.name === 'add_claim').description)),
    ));

  const added = await call('add_claim', CLAIM);
  check('claim registered with its id', added.claim_id === CLAIM.id, JSON.stringify(added));
  check('claim starts untested', added.status === 'untested');
  const dupClaim = await callErr('add_claim', CLAIM);
  check('duplicate claim id rejected', /already exists/.test(dupClaim || ''), dupClaim);
  const auto = await call('add_claim', {
    statement: 'Heterogeneity across these studies is substantial.',
    rule: 'Supported iff I² ≥ 50%.',
    test: {
      analysis: 'overall', args: { method: 'REML' },
      verdicts: [
        { when: [{ path: 'I2', op: 'ge', value: 50 }], verdict: 'supported', reason: 'I² = {I2}%' },
        { default: true, verdict: 'challenged', reason: 'I² = {I2}%' },
      ],
    },
  });
  check('id auto-assigned as wc02', auto.claim_id === 'wc02', auto.claim_id);
  check('both claims listed in the page', await page.locator('#le-claims-list .le-claim-item').count() === 2);

  const verdict = await call('evaluate_claim', { claim_id: CLAIM.id });
  check('claim verdict is supported', verdict.verdict === 'supported', JSON.stringify(verdict.reason));
  // Compare against the template's OWN formatting (fmtNumber = 4 significant digits),
  // not the raw number — otherwise this passes or fails on trailing-zero luck.
  check('verdict quotes the page statistics',
    verdict.reason.includes(String(Number(EXPECTED.estimate.toPrecision(4)))), verdict.reason);
  check('verdict is fresh (evaluated at the current evidence version)', verdict.stale === false && verdict.evaluated_version === 4, JSON.stringify(verdict));
  check('badge painted in the claims list', await page.locator(`[data-claim="${CLAIM.id}"] .le-chip-supported`).count() === 1);
  check('no badge is stale (no approvals since)', await page.locator('.le-chip-stale').count() === 0);
  const listed = (await call('list_claims', {})).claims;
  check('list_claims carries the new AST', listed.length === 2 && listed[0].machine_check.analysis === 'overall', JSON.stringify(listed.map((c) => c.id)));

  // ------------------------------------------------------------- 5. reload
  console.log('\n# 5 — the workspace survives a reload');
  // A fourth proposal, left UNDECIDED on purpose: the reload must bring the approval
  // card back, still actionable, not silently swallow the agent's open proposal.
  const pending4 = await call('propose_study', PENDING4);
  check('fourth study proposed and pending', pending4.status === 'pending_human_approval', JSON.stringify(pending4));
  check('one undecided approval card before the reload', await page.locator('.le-pending-card').count() === 1);
  const humanRowsBefore = await page.locator('#le-ledger .le-human').count();
  const badgeBefore = await page.textContent(`[data-claim="${CLAIM.id}"] .le-chip`);
  const ledgerBefore = (await call('get_audit_log', {})).entries.length;
  await page.reload({ waitUntil: 'load' });
  await boot();
  check('hypothesis restored', (await page.textContent('#le-hypothesis')) === hyp);
  const ov2 = await call('get_document_overview', {});
  check('evidence base restored (k=3)', ov2.evidence_base.k === 3, String(ov2.evidence_base.k));
  check('evidence version restored (4)', ov2.evidence_base.evidence_version === 4, String(ov2.evidence_base.evidence_version));
  check('claims restored', ov2.claims.length === 2, JSON.stringify(ov2.claims.map((c) => c.id)));
  check('verdict restored, still fresh', ov2.claims[0].status === 'supported' && ov2.claims[0].stale === false && ov2.claims[0].evaluated_version === 4, JSON.stringify(ov2.claims[0]));
  check('badge restored in the DOM', await page.locator(`[data-claim="${CLAIM.id}"] .le-chip-supported`).count() === 1);
  check('forest plot restored', await page.locator('#le-main-figure svg').count() === 1);
  const restoredLog = (await call('get_audit_log', {})).entries;
  check('ledger replayed, not re-run', restoredLog.length === ledgerBefore + 1, `${restoredLog.length} vs ${ledgerBefore} + 1 boot entry`);
  check('restored rows keep their original run numbers', restoredLog.every((e, i) => e.run === i + 1), '');
  check('restored rows keep their original actors', restoredLog.filter((e) => e.actor === 'human').length === 3, '');
  check('ledger rows re-rendered', await page.locator('#le-ledger .le-ledger-row').count() === restoredLog.length);
  // Not just the data model — the replayed DOM has to carry the same actor classes,
  // or the ledger the human LOOKS at stops matching the ledger the agent reads.
  check('restored ledger rows keep their actor classes',
    await page.locator('#le-ledger .le-human').count() === humanRowsBefore,
    `${await page.locator('#le-ledger .le-human').count()} vs ${humanRowsBefore}`);
  const badgeAfter = await page.textContent(`[data-claim="${CLAIM.id}"] .le-chip`);
  check('restored badge keeps its run number, not a fresh one',
    /run #\d+/.test(badgeAfter) && badgeAfter === badgeBefore, `${badgeAfter} vs ${badgeBefore}`);
  const provenanceAfterReload = (await call('get_studies', {})).studies[0].provenance;
  check('provenance survives the round trip', provenanceAfterReload.quote === PROPOSALS[0].quote, JSON.stringify(provenanceAfterReload));

  // the undecided proposal, and the human deciding it after the reload
  check('the undecided approval card came back', await page.locator('.le-pending-card').count() === 1);
  check('pending section visible again after restore', await page.locator('#pending-section').isVisible());
  await page.screenshot({ path: path.join(root, 'verify', '_snap_workspace_full.png'), fullPage: true });
  await page.click('.le-pending-card .le-btn-approve');
  await page.waitForTimeout(200);
  check('restored card consumed on approval', await page.locator('.le-pending-card').count() === 0);
  const ov2b = await call('get_document_overview', {});
  check('approving the restored proposal grows the base to k=4', ov2b.evidence_base.k === 4, String(ov2b.evidence_base.k));
  check('evidence version bumped to 5', ov2b.evidence_base.evidence_version === 5, String(ov2b.evidence_base.evidence_version));
  check('bound k updated to 4', (await page.textContent('[data-le-bind="k"]')) === '4');
  check('the k=3 verdict is now marked stale', await page.locator('.le-chip-stale').count() === 1);
  const verdict4 = await call('evaluate_claim', { claim_id: CLAIM.id });
  check('re-evaluated verdict is fresh at evidence version 5',
    verdict4.stale === false && verdict4.evaluated_version === 5, JSON.stringify(verdict4));
  check('no stale badge left after re-evaluation', await page.locator('.le-chip-stale').count() === 0);

  // ------------------------------------------------------------- 6. export
  console.log('\n# 6 — export a self-contained document');
  // The DEFAULT response is a receipt, not the file: megabytes of HTML in a tool
  // result burns the agent's context for a payload the human already has as a
  // download. The file itself has to be asked for.
  const exportedDefault = await page.evaluate(async () => {
    const r = await window.LivingEvidence.invokeTool('export_document', {}, { actor: 'human' });
    return {
      keys: Object.keys(r), filename: r.filename, bytes: r.bytes,
      download_started: r.download_started, content_digest: r.content_digest, has_html: 'html' in r,
    };
  });
  check('the default export response does NOT carry the html', exportedDefault.has_html === false, exportedDefault.keys.join(','));
  check('the default export response says the download started',
    exportedDefault.download_started === true, JSON.stringify(exportedDefault.download_started));
  check('the default export response carries a content digest',
    /^[0-9a-f]{8}$/.test(exportedDefault.content_digest || ''), String(exportedDefault.content_digest));
  check('the default export response still reports filename and size',
    /^living-evidence-export-\d{8}-\d{4}\.html$/.test(exportedDefault.filename) && exportedDefault.bytes > 50000,
    `${exportedDefault.filename} / ${exportedDefault.bytes}`);

  const exported = await page.evaluate(async () => {
    const r = await window.LivingEvidence.invokeTool('export_document', { include_html: true }, { actor: 'human' });
    return { filename: r.filename, bytes: r.bytes, html: r.html, content_digest: r.content_digest };
  });
  check('include_html:true adds the html to the same response', typeof exported.html === 'string' && exported.html.length > 50000, String(typeof exported.html));
  // Same document either way — only the export timestamp inside it differs, and that
  // string has a fixed length, so the byte count must match exactly.
  check('include_html returns the same document the default call digested',
    exported.bytes === exportedDefault.bytes && /^[0-9a-f]{8}$/.test(exported.content_digest || ''),
    `${exported.bytes} vs ${exportedDefault.bytes}`);
  check('export filename is timestamped', /^living-evidence-export-\d{8}-\d{4}\.html$/.test(exported.filename), exported.filename);
  check('export is a substantial single file', exported.bytes > 50000, String(exported.bytes));
  check('export inlines the engine (no module imports left)', !/^import\s/m.test(exported.html), '');
  check('export references nothing under lib/', !/["'(](\.\/)?lib\//.test(exported.html), '');
  check('export carries no <script src>', !/<script[^>]+src=/i.test(exported.html), '');
  check('export carries no stylesheet link', !/<link[^>]+stylesheet/i.test(exported.html), '');
  check('export embeds all four records', ALL_RECORDS.every((p) => exported.html.includes(p.quote)), '');
  // The ledger must name the human who pressed the button. export_document is the
  // one ASYNC tool, so this is the regression test for the attribution bug where
  // invokeTool's synchronous finally-restore fired before the trailing ledger().
  const exportEntry = (await call('get_audit_log', {})).entries.at(-1);
  check('export ledgered as a mutation', exportEntry.tool === 'export_document', '');
  check('a human-driven export is attributed to the human, not the agent',
    exportEntry.actor === 'human', `actor=${exportEntry.actor}`);

  fs.writeFileSync(EXPORT_FILE, exported.html);
  const page2 = await context.newPage();
  const requested = [];
  page2.on('request', (r) => requested.push(r.url()));
  const errors2 = [];
  page2.on('pageerror', (e) => errors2.push(`pageerror: ${e.message}`));
  page2.on('console', (m) => { if (m.type() === 'error') errors2.push(`console.error: ${m.text()}`); });
  await page2.goto(`http://127.0.0.1:${EXPORT_PORT}/verify/_export_test.html`, { waitUntil: 'load' });
  await page2.waitForFunction(() => window.LivingEvidence && window.LivingEvidence.tools.length > 0, null, { timeout: 10000 });

  const tools2 = await page2.evaluate(() => window.LivingEvidence.tools.map((t) => t.name));
  check('exported document boots its own runtime', tools2.length >= 12, String(tools2.length));
  check('exported document is in document mode (no workspace tools)',
    await page2.evaluate(() => window.LivingEvidence.mode) === 'document' && !tools2.includes('add_claim'), tools2.join(','));
  const ov3 = await page2.evaluate(() => window.LivingEvidence.invokeTool('get_document_overview', {}));
  check('exported evidence base is k=4', ov3.evidence_base.k === 4, String(ov3.evidence_base.k));
  check('exported hypothesis travelled with it', ov3.hypothesis === hyp, ov3.hypothesis);
  check('exported bound k rendered', (await page2.textContent('[data-le-bind="k"]')) === '4');
  check('exported forest plot rendered', await page2.locator('#le-main-figure svg').count() === 1);
  const v2 = await page2.evaluate((id) => window.LivingEvidence.invokeTool('evaluate_claim', { claim_id: id }), CLAIM.id);
  // The workspace's own latest verdict (k=4, evidence version 5) is the contract the
  // exported document has to reproduce — same rule, same evidence base, same answer.
  check('exported claim reaches the same verdict', v2.verdict === verdict4.verdict, `${v2.verdict} vs ${verdict4.verdict}`);
  check('exported claim reproduces the same reason', v2.reason === verdict4.reason, `${v2.reason} vs ${verdict4.reason}`);
  check('exported badge painted', await page2.locator(`[data-claim="${CLAIM.id}"] .le-chip-${verdict4.verdict}`).count() === 1);
  const exportedStudies = await page2.evaluate(() => window.LivingEvidence.invokeTool('get_studies', {}));
  check('exported records keep their approval provenance (source + quote), not a generic label',
    exportedStudies.studies.every((s) => s.provenance && typeof s.provenance === 'object' && s.provenance.quote && s.provenance.record_hash),
    JSON.stringify(exportedStudies.studies.map((s) => s.provenance)));
  const page2Text = await page2.textContent('body');
  check('provenance appendix lists the quotes', ALL_RECORDS.every((p) => page2Text.includes(p.quote)), '');
  check('exported claim statement is in the prose', page2Text.includes(CLAIM.statement), '');
  const offOrigin = requested.filter((u) => !u.startsWith(`http://127.0.0.1:${EXPORT_PORT}/`));
  const libRequests = requested.filter((u) => /\/lib\//.test(u));
  const assetRequests = requested.filter((u) => /\.(js|css)(\?|$)/.test(u));
  // Positive control FIRST: if the collector saw nothing at all, every "requested
  // nothing" assertion below would pass vacuously and prove exactly nothing.
  check('the request collector saw the export document itself',
    requested.some((u) => u.endsWith('/verify/_export_test.html')), requested.join(','));
  check('exported document requested NOTHING from /lib/', libRequests.length === 0, libRequests.join(','));
  check('exported document requested no scripts or stylesheets', assetRequests.length === 0, assetRequests.join(','));
  check('exported document made no off-origin request', offOrigin.length === 0, offOrigin.join(','));
  // Airtight: the document itself and NOTHING else — not even /favicon.ico, because
  // the export carries its own data: URI icon.
  check('the document itself was the only request on the wire',
    requested.every((u) => u.endsWith('/verify/_export_test.html')), requested.join(','));
  await page2.screenshot({ path: path.join(root, 'verify', '_snap_workspace_export.png'), fullPage: true });

  // The claim of the format is "runs from file:// with no server". Test it as such.
  await page2.goto(`file://${EXPORT_FILE}`, { waitUntil: 'load' });
  await page2.waitForFunction(() => window.LivingEvidence && window.LivingEvidence.tools.length > 0, null, { timeout: 10000 });
  const toolsFile = await page2.evaluate(() => window.LivingEvidence.tools.map((t) => t.name));
  check('exported document boots from file:// with no server', toolsFile.length >= 12, String(toolsFile.length));
  check('file:// document renders its forest plot', await page2.locator('#le-main-figure svg').count() === 1);
  check('exported document raised no errors (http and file://)', errors2.length === 0, errors2.join(' | '));
  await page2.close();
  fs.unlinkSync(EXPORT_FILE);
  check('temp export file cleaned up', !fs.existsSync(EXPORT_FILE));

  // ------------------------------------------------------------- 7. reset
  console.log('\n# 7 — reset clears the workspace');
  page.on('dialog', (d) => d.accept());
  await page.click('#le-reset');
  await page.waitForTimeout(400);
  await boot();
  check('storage key cleared or re-initialised empty',
    await page.evaluate((k) => { const raw = localStorage.getItem(k); return !raw || JSON.parse(raw).approved.length === 0; }, STORAGE_KEY));
  check('reset returns k = 0', (await page.textContent('[data-le-bind="k"]')) === '0');
  check('reset clears the claims list', /No claims yet/.test(await page.textContent('#le-claims-list')));
  check('reset clears the hypothesis', /not set/.test(await page.textContent('#le-hypothesis')));
  check('reset clears the ledger to a single boot row', await page.locator('#le-ledger .le-ledger-row').count() === 1);

  // ----------------------------------------- fault injection: corrupt snapshot
  console.log('\n# fault injection — a corrupt snapshot must not take the page down');
  await page.evaluate((k) => localStorage.setItem(k, '{"v":1,"approved":[{"yi":0.8,'), STORAGE_KEY);
  await page.reload({ waitUntil: 'load' });
  await boot();
  check('page boots clean after unparseable JSON', await page.evaluate(() => !!window.LivingEvidence), '');
  check('corrupt snapshot yields a fresh empty workspace', (await page.textContent('[data-le-bind="k"]')) === '0');
  check('corrupt snapshot discarded from storage',
    await page.evaluate((k) => { const raw = localStorage.getItem(k); return !raw || JSON.parse(raw).v === 1; }, STORAGE_KEY));
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({
    v: 1, approved: [{ id: 'x', author: 'Broken', yi: 'not a number', vi: null }], claims: [], ledger: [], claimStatus: [],
  })), STORAGE_KEY);
  await page.reload({ waitUntil: 'load' });
  await boot();
  check('page boots clean after a structurally invalid snapshot', (await page.textContent('[data-le-bind="k"]')) === '0');
  check('workspace still fully operable after a bad snapshot',
    (await call('get_document_overview', {})).evidence_base.k === 0, '');

  check('zero page errors across the whole session', errors.length === 0, errors.join(' | '));
  console.log('  (screenshots: verify/_snap_workspace_fresh.png, _snap_workspace_full.png, _snap_workspace_export.png)');
} finally {
  await browser.close();
  server.kill();
  exportServer.kill();
  if (fs.existsSync(EXPORT_FILE)) fs.unlinkSync(EXPORT_FILE);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nworkspace.e2e.mjs: all green');
