// Real-browser E2E for the Living Evidence exemplar.
// Drives the PUBLIC tool contract (window.LivingEvidence.invokeTool) — the same
// surface WebMCP execute() wraps — plus the human-only approval UI.
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

  const call = (name, args) => page.evaluate(([n, a]) => window.LivingEvidence.invokeTool(n, a), [name, args]);
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
  const statusText = await page.textContent('#le-status');
  check('status banner explains fallback', /Tool console/.test(statusText), statusText);

  // -- headline bindings --
  check('bound k = 19', (await page.textContent('[data-le-bind="k"]')) === '19');
  check('bound estimate = 0.084', (await page.textContent('[data-le-bind="estimate"]')) === '0.084');
  check('main forest plot rendered', await page.locator('#le-main-figure svg').count() === 1);

  // -- overview --
  const ov = await call('get_document_overview', {});
  check('overview k=19', ov.evidence_base.k === 19);
  check('overview 6 claims, all untested', ov.claims.length === 6 && ov.claims.every((c) => c.status === 'untested'), JSON.stringify(ov.claims.map((c) => c.status)));
  check('overview states the format rule', ov.rules_of_engagement.some((r) => r.includes('call tools')), '');

  // -- run_meta_analysis renders into the page --
  const re = await call('run_meta_analysis', { method: 'REML' });
  check('REML estimate via tool', Math.abs(re.estimate - 0.0837) < 5e-4, String(re.estimate));
  check('figure rendered in workbench', await page.locator('#le-workbench .le-figure').count() === 1);
  check('workbench empty-note hidden', await page.locator('.workbench-empty').isHidden());
  const ledgerRows1 = await page.locator('#le-ledger .le-ledger-row').count();
  check('ledger has init + analysis rows', ledgerRows1 >= 2, String(ledgerRows1));

  // -- exclude argument --
  const reEx = await call('run_meta_analysis', { method: 'REML', exclude: ['s04'] });
  check('exclude drops k to 18', reEx.k === 18, String(reEx.k));
  check('excluding the outlier lowers the estimate', reEx.estimate < re.estimate, `${reEx.estimate} vs ${re.estimate}`);

  // -- claims: all three verdict kinds appear --
  const c1 = await call('evaluate_claim', { claim_id: 'c-textbook' });
  check('textbook claim CHALLENGED', c1.verdict === 'challenged', JSON.stringify(c1));
  check('challenged chip in prose', await page.locator('[data-claim="c-textbook"] .le-chip-challenged').count() === 1);
  const c2 = await call('evaluate_claim', { claim_id: 'c-bias' });
  check('bias claim NUANCED (Egger borderline)', c2.verdict === 'nuanced', JSON.stringify(c2.reason));
  for (const [id, expect] of [['c-overall', 'supported'], ['c-moderator', 'supported'], ['c-window', 'supported'], ['c-robust', 'supported']]) {
    const r = await call('evaluate_claim', { claim_id: id });
    check(`claim ${id} ${expect}`, r.verdict === expect, JSON.stringify(r.reason));
  }
  const badgeCount = await page.locator('.le-chip').count();
  check('6 verdict badges visible in prose', badgeCount === 6, String(badgeCount));
  const unknownClaim = await callErr('evaluate_claim', { claim_id: 'nope' });
  check('unknown claim id errors helpfully', /list_claims/.test(unknownClaim || ''), unknownClaim);

  // -- moderator analysis reproduces published result through the tool layer --
  const mr = await call('meta_regression', { moderator: 'weeks', cap: 3 });
  check('meta-regression slope -0.157', Math.abs(mr.moderator.b - -0.157) < 1e-3, String(mr.moderator.b));
  check('meta-regression R2 ~100', mr.R2_percent > 99.5, String(mr.R2_percent));

  // -- propose_study: validation, pending, human approval --
  const bad = await callErr('propose_study', { author: 'X', year: 1985, yi: 0.1, vi: -1, weeks: 0, source: 's' });
  check('invalid vi rejected', /vi must be/.test(bad || ''), bad);
  const dup = await callErr('propose_study', { author: 'Maxwell', year: 1970, yi: 0.80, vi: 0.063, weeks: 1, source: 'dup' });
  check('duplicate rejected', /duplicate/.test(dup || ''), dup);

  const prop = await call('propose_study', {
    author: 'E2E Replication Team', year: 1985, yi: 0.05, vi: 0.02, weeks: 3,
    setting: 'group', tester: 'blind', n1i: 100, n2i: 100,
    source: 'E2E fixture — not a real study', quote: 'd = 0.05 (SE 0.14)',
  });
  check('proposal pending, not included', prop.status === 'pending_human_approval', JSON.stringify(prop));
  const withPending = await call('get_studies', { include_pending: true });
  check('pending visible via get_studies', withPending.pending_proposals?.length === 1, '');
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
  check('human actor rows in ledger (init + approval)', humanRows >= 2, String(humanRows));

  // re-evaluate after evidence change: badge refreshes, stale cleared for that claim
  const c1b = await call('evaluate_claim', { claim_id: 'c-textbook' });
  check('re-evaluation works on k=20', ['challenged', 'supported', 'nuanced'].includes(c1b.verdict), JSON.stringify(c1b.verdict));
  check('re-evaluated chip not stale', await page.locator('[data-claim="c-textbook"] .le-chip-stale').count() === 0);

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
  const approvalEntry = log.entries.find((e) => /human APPROVED/.test(e.summary));
  check('approval recorded with human actor', approvalEntry && approvalEntry.actor === 'human', JSON.stringify(approvalEntry));

  // -- tool console present --
  check('tool console select lists tools', await page.locator('#le-console select option').count() === 12);

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
