// Real-browser E2E for the Living Evidence exemplar.
// Drives the PUBLIC tool contract (window.LivingEvidence.invokeTool) — the same
// surface WebMCP execute() wraps — plus the human-only approval UI and the human
// tool console (actor attribution is part of the contract now).
// Server: python3 -m http.server 8501 --bind 127.0.0.1 (started by this script).
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/hirokisugimoto/tennis-checker/node_modules/playwright');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8501;

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}  ${detail}`); }
}

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch({ args: ['--disable-accelerated-2d-canvas', '--disable-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.LivingEvidence && window.LivingEvidence.tools.length > 0, null, { timeout: 10000 });

  const call = (name, args, opts) => page.evaluate(([n, a, o]) => window.LivingEvidence.invokeTool(n, a, o), [name, args, opts]);
  const callErr = (name, args) => page.evaluate(([n, a]) => {
    try { window.LivingEvidence.invokeTool(n, a); return null; } catch (e) { return e.message; }
  }, [name, args]);

  // -- registration surface --
  const tools = await page.evaluate(() => window.LivingEvidence.tools.map((t) => t.name));
  check('12 tools exposed', tools.length === 12, tools.join(','));
  for (const t of ['get_document_overview', 'evaluate_claim', 'propose_study', 'get_audit_log']) {
    check(`tool present: ${t}`, tools.includes(t));
  }
  const agentStatus = await page.evaluate(() => window.LivingEvidence.state.agent);
  check('WebMCP absent in test browser handled gracefully', agentStatus.active === false, JSON.stringify(agentStatus));
  check('registration status is explicitly "absent" (not a silent false)', agentStatus.status === 'absent', JSON.stringify(agentStatus));
  check('absent status reports 0/12 registered', agentStatus.registered === 0 && agentStatus.total === 12, JSON.stringify(agentStatus));
  const statusText = await page.textContent('#le-status');
  check('status banner explains fallback', /Tool console/.test(statusText), statusText);

  // -- headline bindings --
  check('bound k = 19', (await page.textContent('[data-le-bind="k"]')) === '19');
  check('bound estimate = 0.084', (await page.textContent('[data-le-bind="estimate"]')) === '0.084');
  check('main forest plot rendered', await page.locator('#le-main-figure svg').count() === 1);

  // -- overview --
  const ov = await call('get_document_overview', {});
  check('overview k=19', ov.evidence_base.k === 19);
  check('overview starts at evidence version 1', ov.evidence_base.evidence_version === 1, String(ov.evidence_base.evidence_version));
  check('overview 6 claims, all untested', ov.claims.length === 6 && ov.claims.every((c) => c.status === 'untested'), JSON.stringify(ov.claims.map((c) => c.status)));
  check('overview states the format rule', ov.rules_of_engagement.some((r) => r.includes('call tools')), '');
  check('overview states which calls are ledgered', ov.rules_of_engagement.some((r) => /pure reads .* are not/.test(r)), JSON.stringify(ov.rules_of_engagement));

  // -- claims are DATA: list_claims exposes the machine-checkable AST --
  const cl = await call('list_claims', {});
  check('list_claims returns 6 claims', cl.claims.length === 6);
  check('every claim ships its rule AST', cl.claims.every((c) => c.machine_check && Array.isArray(c.machine_check.verdicts) && c.machine_check.verdicts.length >= 2),
    JSON.stringify(cl.claims.map((c) => c.id)));
  check('every AST ends in a default verdict', cl.claims.every((c) => c.machine_check.verdicts.at(-1).default === true));
  check('no claim carries executable code', JSON.stringify(cl.claims).indexOf('function') === -1);
  check('claims keep their human-readable rule too', cl.claims.every((c) => typeof c.rule === 'string' && c.rule.length > 20));
  const shippedAnalyses = Object.fromEntries(cl.claims.map((c) => [c.id, c.machine_check.analysis]));
  check('shipped ASTs use the expected analyses',
    JSON.stringify(shippedAnalyses) === JSON.stringify({
      'c-textbook': 'overall', 'c-overall': 'overall', 'c-moderator': 'metareg',
      'c-window': 'subgroup', 'c-robust': 'loo', 'c-bias': 'funnel',
    }), JSON.stringify(shippedAnalyses));
  const windowClaim = cl.claims.find((c) => c.id === 'c-window');
  check('c-window AST carries its focus selector', windowClaim.machine_check.focus?.match_substring === '≤ 1', JSON.stringify(windowClaim.machine_check.focus));
  check('untested claims are not stale and have no evaluated_version',
    cl.claims.every((c) => c.stale === false && c.evaluated_version === null && c.evidence_version === 1));

  // -- pure reads are NOT ledgered (the contract says so; prove it) --
  const beforeReads = (await call('get_audit_log', {})).entries.length;
  await call('list_claims', {});
  await call('get_studies', {});
  await call('get_document_overview', {});
  const afterReads = (await call('get_audit_log', {})).entries.length;
  check('pure reads leave no ledger entries', beforeReads === afterReads, `${beforeReads} → ${afterReads}`);

  // -- run_meta_analysis renders into the page --
  const re = await call('run_meta_analysis', { method: 'REML' });
  check('REML estimate via tool', Math.abs(re.estimate - 0.0837) < 5e-4, String(re.estimate));
  check('figure rendered in workbench', await page.locator('#le-workbench .le-figure').count() === 1);
  check('workbench empty-note hidden', await page.locator('.workbench-empty').isHidden());
  const ledgerRows1 = await page.locator('#le-ledger .le-ledger-row').count();
  check('ledger has init + analysis rows', ledgerRows1 >= 2, String(ledgerRows1));

  // -- structured ledger envelope --
  const log1 = await call('get_audit_log', {});
  const REQUIRED_KEYS = ['run', 'time', 'actor', 'kind', 'tool', 'inputs', 'summary', 'evidence_version', 'result_digest'];
  check('every entry carries the full envelope',
    log1.entries.every((e) => REQUIRED_KEYS.every((k) => k in e)), JSON.stringify(log1.entries[0]));
  check('every entry has actor + evidence_version',
    log1.entries.every((e) => 'actor' in e && 'evidence_version' in e), JSON.stringify(log1.entries[0]));
  const boot = log1.entries[0];
  check('boot entry is attributed to the system, not a human', boot.actor === 'system' && boot.kind === 'init', JSON.stringify(boot));
  check('boot entry recorded at evidence version 1', boot.evidence_version === 1, String(boot.evidence_version));
  const analysisEntry = log1.entries.find((e) => e.tool === 'run_meta_analysis');
  check('analysis entry attributed to the agent', analysisEntry.actor === 'agent', JSON.stringify(analysisEntry));
  check('analysis entry records its inputs', analysisEntry.inputs.method === 'REML', JSON.stringify(analysisEntry.inputs));
  check('analysis entry carries an 8-hex result digest', /^[0-9a-f]{8}$/.test(analysisEntry.result_digest), String(analysisEntry.result_digest));
  const rowTitle = await page.locator('#le-ledger .le-ledger-row').last().getAttribute('title');
  check('ledger row exposes digest + inputs in its title', /^digest [0-9a-f]{8} · inputs \{/.test(rowTitle || ''), rowTitle);

  // digests are deterministic for the same evidence base, and sensitive to the model
  await call('run_meta_analysis', { method: 'REML' });
  await call('run_meta_analysis', { method: 'FE' });
  const log2 = await call('get_audit_log', {});
  const remlDigests = log2.entries.filter((e) => e.tool === 'run_meta_analysis' && e.inputs.method === 'REML').map((e) => e.result_digest);
  const feDigest = log2.entries.find((e) => e.inputs && e.inputs.method === 'FE').result_digest;
  check('identical analyses digest identically', remlDigests.length >= 2 && new Set(remlDigests).size === 1, remlDigests.join(','));
  check('a different model digests differently', !remlDigests.includes(feDigest), feDigest);

  // -- exclude argument --
  const reEx = await call('run_meta_analysis', { method: 'REML', exclude: ['s04'] });
  check('exclude drops k to 18', reEx.k === 18, String(reEx.k));
  check('excluding the outlier lowers the estimate', reEx.estimate < re.estimate, `${reEx.estimate} vs ${re.estimate}`);

  // -- claims: all three verdict kinds appear --
  const c1 = await call('evaluate_claim', { claim_id: 'c-textbook' });
  check('textbook claim CHALLENGED', c1.verdict === 'challenged', JSON.stringify(c1));
  check('verdict response carries the staleness quartet',
    c1.stale === false && c1.evaluated_version === 1 && c1.evidence_version === 1 && c1.status === c1.verdict,
    JSON.stringify({ stale: c1.stale, ev: c1.evaluated_version, cur: c1.evidence_version, status: c1.status }));
  check('verdict reason is rendered from the AST template', /^pooled SMD 0\.0837 \[/.test(c1.reason), c1.reason);
  check('challenged chip in prose', await page.locator('[data-claim="c-textbook"] .le-chip-challenged').count() === 1);
  const c2 = await call('evaluate_claim', { claim_id: 'c-bias' });
  check('bias claim NUANCED (Egger borderline)', c2.verdict === 'nuanced', JSON.stringify(c2.reason));
  for (const [id, expect] of [['c-overall', 'supported'], ['c-moderator', 'supported'], ['c-window', 'supported'], ['c-robust', 'supported']]) {
    const r = await call('evaluate_claim', { claim_id: id });
    check(`claim ${id} ${expect}`, r.verdict === expect, JSON.stringify(r.reason));
  }
  const badgeCount = await page.locator('.le-chip').count();
  check('6 verdict badges visible in prose', badgeCount === 6, String(badgeCount));
  check('no badge is stale before the evidence changes', await page.locator('.le-chip-stale').count() === 0);
  const unknownClaim = await callErr('evaluate_claim', { claim_id: 'nope' });
  check('unknown claim id errors helpfully', /list_claims/.test(unknownClaim || ''), unknownClaim);
  const claimEntry = (await call('get_audit_log', {})).entries.find((e) => e.tool === 'evaluate_claim');
  check('claim verdicts are ledgered with their claim id', claimEntry.inputs.claim_id === 'c-textbook' && claimEntry.kind === 'claim', JSON.stringify(claimEntry));

  // -- moderator analysis reproduces published result through the tool layer --
  const mr = await call('meta_regression', { moderator: 'weeks', cap: 3 });
  check('meta-regression slope -0.157', Math.abs(mr.moderator.b - -0.157) < 1e-3, String(mr.moderator.b));
  check('meta-regression R2 ~100', mr.R2_percent > 99.5, String(mr.R2_percent));

  // -- propose_study: validation, provenance, pending, human approval --
  const bad = await callErr('propose_study', { author: 'X', year: 1985, yi: 0.1, vi: -1, weeks: 0, source: 's', quote: 'q' });
  check('invalid vi rejected', /vi must be/.test(bad || ''), bad);
  const noQuote = await callErr('propose_study', { author: 'No Quote', year: 1985, yi: 0.1, vi: 0.02, weeks: 0, source: 'a citation' });
  check('proposal without a quote rejected', /missing required field: quote/.test(noQuote || ''), noQuote);
  const noSource = await callErr('propose_study', { author: 'No Source', year: 1985, yi: 0.1, vi: 0.02, weeks: 0, quote: 'd = 0.10' });
  check('proposal without a source rejected', /missing required field: source/.test(noSource || ''), noSource);
  const dup = await callErr('propose_study', { author: 'Maxwell', year: 1970, yi: 0.80, vi: 0.063, weeks: 1, source: 'dup', quote: 'd = 0.80' });
  check('exact duplicate rejected', /duplicate/.test(dup || ''), dup);

  const prop = await call('propose_study', {
    author: 'E2E Replication Team', year: 1985, yi: 0.05, vi: 0.02, weeks: 3,
    setting: 'group', tester: 'blind', n1i: 100, n2i: 100,
    source: 'E2E fixture — not a real study', quote: 'd = 0.05 (SE 0.14)',
  });
  check('proposal pending, not included', prop.status === 'pending_human_approval', JSON.stringify(prop));
  check('proposal returns a record hash', /^[0-9a-f]{8}$/.test(prop.record_hash || ''), String(prop.record_hash));
  check('unrelated proposal is not flagged as a duplicate', !('possible_duplicate_of' in prop), JSON.stringify(prop));
  const withPending = await call('get_studies', { include_pending: true });
  check('pending visible via get_studies', withPending.pending_proposals?.length === 1, '');
  check('pending record exposes source, quote and hash',
    withPending.pending_proposals[0].quote === 'd = 0.05 (SE 0.14)' && withPending.pending_proposals[0].record_hash === prop.record_hash,
    JSON.stringify(withPending.pending_proposals[0]));
  const stillK = await call('run_meta_analysis', { method: 'REML' });
  check('analysis still k=19 before approval', stillK.k === 19, String(stillK.k));
  check('pending card visible', await page.locator('.le-pending-card').count() === 1);
  check('pending section revealed', await page.locator('#pending-section').isVisible());

  await page.click('.le-btn-approve');
  await page.waitForTimeout(200);
  check('bound k updated to 20', (await page.textContent('[data-le-bind="k"]')) === '20');
  const afterK = await call('run_meta_analysis', { method: 'REML' });
  check('analysis now k=20', afterK.k === 20, String(afterK.k));
  check('stale marker on existing badges', await page.locator('.le-chip-stale').count() >= 1);
  const humanRows = await page.locator('#le-ledger .le-human').count();
  check('approval logged as a human row', humanRows >= 1, String(humanRows));
  check('boot row logged as system', await page.locator('#le-ledger .le-system').count() === 1);

  // -- evidence version + machine-readable staleness --
  const ov2 = await call('get_document_overview', {});
  check('approval bumped evidence version to 2', ov2.evidence_base.evidence_version === 2, String(ov2.evidence_base.evidence_version));
  const claimsAfter = (await call('list_claims', {})).claims;
  check('all evaluated claims report stale:true after approval',
    claimsAfter.every((c) => c.stale === true && c.evaluated_version === 1 && c.evidence_version === 2),
    JSON.stringify(claimsAfter.map((c) => [c.id, c.stale])));
  const approvalEntry = (await call('get_audit_log', {})).entries.find((e) => /human APPROVED/.test(e.summary));
  check('approval recorded with human actor', approvalEntry && approvalEntry.actor === 'human', JSON.stringify(approvalEntry));
  check('approval entry carries the record hash', approvalEntry.inputs.record_hash === prop.record_hash, JSON.stringify(approvalEntry.inputs));
  check('approval entry stamped with the NEW evidence version', approvalEntry.evidence_version === 2, String(approvalEntry.evidence_version));

  // approved record carries structured provenance
  const studiesAfter = await call('get_studies', {});
  const approvedRec = studiesAfter.studies.find((s) => s.author === 'E2E Replication Team');
  check('approved record is in the evidence base', !!approvedRec);
  check('approved record has provenance as an object', approvedRec && typeof approvedRec.provenance === 'object' && approvedRec.provenance !== null, JSON.stringify(approvedRec?.provenance));
  check('provenance keeps source, quote, timestamps and hash',
    approvedRec.provenance.source === 'E2E fixture — not a real study'
    && approvedRec.provenance.quote === 'd = 0.05 (SE 0.14)'
    && approvedRec.provenance.record_hash === prop.record_hash
    && !!approvedRec.provenance.proposed_at && !!approvedRec.provenance.approved_at,
    JSON.stringify(approvedRec.provenance));
  const baseRec = studiesAfter.studies.find((s) => s.id === 's01');
  check('original records keep their provenance string', baseRec.provenance === 'original evidence base', JSON.stringify(baseRec.provenance));

  // re-evaluate after evidence change: badge refreshes, stale cleared for that claim
  const c1b = await call('evaluate_claim', { claim_id: 'c-textbook' });
  check('re-evaluation works on k=20', ['challenged', 'supported', 'nuanced'].includes(c1b.verdict), JSON.stringify(c1b.verdict));
  check('re-evaluated verdict reports the current evidence version', c1b.stale === false && c1b.evaluated_version === 2, JSON.stringify(c1b));
  check('re-evaluated chip not stale', await page.locator('[data-claim="c-textbook"] .le-chip-stale').count() === 0);
  const claimsMixed = (await call('list_claims', {})).claims;
  check('list_claims distinguishes fresh from stale verdicts',
    claimsMixed.find((c) => c.id === 'c-textbook').stale === false
    && claimsMixed.filter((c) => c.stale === true).length === 5,
    JSON.stringify(claimsMixed.map((c) => [c.id, c.stale])));

  // -- same author+year, different effect size: flagged, not rejected --
  const nearDup = await call('propose_study', {
    author: 'Maxwell', year: 1970, yi: 0.42, vi: 0.055, weeks: 1,
    setting: 'group', tester: 'blind', source: 'E2E fixture — second experiment in the same paper',
    quote: 'Experiment 2: d = 0.42 (SE 0.23)',
  });
  check('same author+year with a different yi is accepted', nearDup.status === 'pending_human_approval', JSON.stringify(nearDup));
  check('…but flagged with possible_duplicate_of', /^s\d\d$/.test(nearDup.possible_duplicate_of || ''), JSON.stringify(nearDup.possible_duplicate_of));
  check('…and the message tells the agent to say so', /already in the evidence base/.test(nearDup.message), nearDup.message);
  check('different numbers produce a different record hash', nearDup.record_hash !== prop.record_hash);
  await page.click('.le-btn-reject');
  await page.waitForTimeout(150);
  const rejectEntry = (await call('get_audit_log', {})).entries.at(-1);
  check('rejection logged as a human decision', rejectEntry.actor === 'human' && /REJECTED/.test(rejectEntry.summary), JSON.stringify(rejectEntry));
  check('rejection did not change the evidence version', rejectEntry.evidence_version === 2, String(rejectEntry.evidence_version));

  // -- a human driving the tool console is attributed to the human --
  await page.click('details:has(#le-console) > summary'); // the reader opens the console
  await page.selectOption('#le-console select', 'funnel_check');
  await page.click('#le-console .le-btn');
  await page.waitForTimeout(200);
  const consoleEntry = (await call('get_audit_log', {})).entries.at(-1);
  check('tool console action logged with actor human', consoleEntry.actor === 'human' && consoleEntry.tool === 'funnel_check', JSON.stringify(consoleEntry));
  check('console output rendered as JSON', /"intercept"/.test(await page.textContent('.le-console-out')));
  const humanRows2 = await page.locator('#le-ledger .le-human').count();
  check('human rows accumulate (approval, rejection, console run)', humanRows2 >= 3, String(humanRows2));
  // the same tool through the agent path is attributed to the agent
  await call('funnel_check', {}, { actor: 'agent' });
  const agentEntry = (await call('get_audit_log', {})).entries.at(-1);
  check('agent-invoked call logged with actor agent', agentEntry.actor === 'agent' && agentEntry.tool === 'funnel_check', JSON.stringify(agentEntry));
  check('same analysis, same digest regardless of actor', agentEntry.result_digest === consoleEntry.result_digest, `${agentEntry.result_digest} vs ${consoleEntry.result_digest}`);

  // -- remaining analysis tools all render --
  for (const [tool, args] of [['leave_one_out', {}], ['subgroup_analysis', { split_field: 'tester' }], ['funnel_check', {}], ['cumulative_meta', {}]]) {
    const r = await call(tool, args);
    check(`${tool} returns run id`, typeof r.run === 'number', JSON.stringify(r).slice(0, 120));
  }
  const figCount = await page.locator('#le-workbench .le-figure').count();
  check('workbench accumulated many figures', figCount >= 10, String(figCount));

  // -- audit log --
  const log = await call('get_audit_log', {});
  check('audit log rich and ordered', log.entries.length >= 15 && log.entries.every((e, i) => e.run === i + 1), String(log.entries.length));
  check('every actor is one of human/agent/system', log.entries.every((e) => ['human', 'agent', 'system'].includes(e.actor)),
    JSON.stringify([...new Set(log.entries.map((e) => e.actor))]));
  check('evidence_version only ever moves forward', log.entries.every((e, i) => i === 0 || e.evidence_version >= log.entries[i - 1].evidence_version));
  check('mutation and analysis entries all carry a digest',
    log.entries.filter((e) => ['analysis', 'claim', 'proposal', 'approval'].includes(e.kind)).every((e) => /^[0-9a-f]{8}$/.test(e.result_digest || '')),
    JSON.stringify(log.entries.filter((e) => !e.result_digest).map((e) => e.kind)));

  // -- tool console present --
  check('tool console select lists tools', await page.locator('#le-console select option').count() === 12);

  // -- no probe hooks left in shipping files --
  const probes = await page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__')));
  check('no window.__* probe hooks', probes.length === 0, probes.join(','));

  // -- no console/page errors during the whole session --
  check('zero page errors', errors.length === 0, errors.join(' | '));

  // -- screenshots for human review (tests PASS ≠ readable page) --
  await page.screenshot({ path: path.join(root, 'verify', '_snap_full.png'), fullPage: true });
  await page.locator('#le-main-figure svg').screenshot({ path: path.join(root, 'verify', '_snap_forest.png') });
  console.log('  (screenshots: verify/_snap_full.png, verify/_snap_forest.png)');
} finally {
  await browser.close();
  server.kill();
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\ne2e.mjs: all green');
