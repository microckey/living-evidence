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
  const proposal = (overrides = {}) => ({
    author: 'E2E Replication Team', year: 1985, yi: 0.05, vi: 0.02, weeks: 3,
    setting: 'group', tester: 'blind', n1i: 100, n2i: 100,
    source: 'E2E fixture — not a real study',
    quote: 'd = 0.05 (SE 0.14)',
    source_locator: 'E2E fixture, table 1, row 1',
    derivation: 'd computed from the reported t(198) = 0.35 and group sizes',
    study_design: 'randomized expectancy-induction experiment',
    outcome: 'pupil IQ',
    timepoint: 'post-intervention',
    experiment_id: 'e2e-experiment-1',
    smd_variant: 'Hedges_g',
    effect_direction: 'positive = higher measured IQ in the expectancy group than control',
    collection_frame: 'Experiments included in the Raudenbush (1984) teacher-expectancy synthesis',
    risk_of_bias_status: 'not_assessed',
    ...overrides,
  });

  // -- registration surface --
  const tools = await page.evaluate(() => window.LivingEvidence.tools.map((t) => t.name));
  check('15 tools exposed', tools.length === 15, tools.join(','));
  for (const t of ['get_document_overview', 'get_data_manifest', 'evaluate_claim', 'propose_study', 'get_audit_log', 'get_reproducibility_status', 'create_reproducibility_receipt']) {
    check(`tool present: ${t}`, tools.includes(t));
  }
  // -- the descriptions ARE the agent-facing contract: what a tool claims about
  // itself is the only thing an agent has before it calls. These five carried
  // overclaims (bias verdicts, time travel, FE tau2 = 0, tamper-proof digests).
  const toolMeta = await page.evaluate(() => Object.fromEntries(
    window.LivingEvidence.tools.map((t) => [t.name, { title: t.title, description: t.description }]),
  ));
  check('funnel_check is titled and described as small-study asymmetry',
    toolMeta.funnel_check.title === 'Small-study asymmetry check'
    && /Asymmetry can have causes other than publication bias/.test(toolMeta.funnel_check.description)
    && /not evidence of absence of bias/.test(toolMeta.funnel_check.description),
    JSON.stringify(toolMeta.funnel_check));
  check('cumulative_meta admits it is retrospective over the current corpus',
    /Retrospective/.test(toolMeta.cumulative_meta.description)
    && /does not reconstruct which evidence was actually available/.test(toolMeta.cumulative_meta.description),
    toolMeta.cumulative_meta.description);
  check('leave_one_out says it checks significance-status stability only',
    /status flips only/.test(toolMeta.leave_one_out.description) && /not stability of magnitude/.test(toolMeta.leave_one_out.description),
    toolMeta.leave_one_out.description);
  check('run_meta_analysis explains that FE tau2 is null by assumption',
    /FE assumes one common effect; tau2 is null by model assumption, not estimated as zero/.test(toolMeta.run_meta_analysis.description)
    && /two-sided test of the pooled effect against zero/.test(toolMeta.run_meta_analysis.description),
    toolMeta.run_meta_analysis.description);
  check('get_audit_log accurately scopes its persistent SHA-256 chain',
    /reload-persistent/.test(toolMeta.get_audit_log.description)
    && /SHA-256/.test(toolMeta.get_audit_log.description)
    && /does not prove author identity/.test(toolMeta.get_audit_log.description)
    && /trusted timestamp/.test(toolMeta.get_audit_log.description),
    toolMeta.get_audit_log.description);

  const proposeSchema = await page.evaluate(() => window.LivingEvidence.tools.find((t) => t.name === 'propose_study').inputSchema);
  check('propose_study declares the bounds its handler enforces',
    proposeSchema.properties.year.type === 'integer' && proposeSchema.properties.year.minimum === 1900 && proposeSchema.properties.year.maximum === 2100
    && proposeSchema.properties.vi.exclusiveMinimum === 0 && proposeSchema.properties.weeks.minimum === 0
    && proposeSchema.properties.n1i.type === 'integer' && proposeSchema.properties.n1i.minimum === 1
    && proposeSchema.properties.source.minLength === 1 && proposeSchema.properties.quote.minLength === 1
    && proposeSchema.required.includes('source_locator') && proposeSchema.required.includes('derivation')
    && proposeSchema.required.includes('experiment_id') && proposeSchema.required.includes('risk_of_bias_status'),
    JSON.stringify(proposeSchema.properties));
  check('propose_study documents the estimand and required derivation',
    /what a positive yi means/.test(proposeSchema.properties.effect_direction.description)
    && /how yi and vi were derived/.test(proposeSchema.properties.derivation.description)
    && proposeSchema.properties.smd_variant.enum.includes('Hedges_g')
    && /unique experiment id/.test(proposeSchema.properties.experiment_id.description)
    && /expectancy-group sample size/.test(proposeSchema.properties.n1i.description),
    JSON.stringify(proposeSchema.properties));

  const agentStatus = await page.evaluate(() => window.LivingEvidence.state.agent);
  check('WebMCP absent in test browser handled gracefully', agentStatus.active === false, JSON.stringify(agentStatus));
  check('registration status is explicitly "absent" (not a silent false)', agentStatus.status === 'absent', JSON.stringify(agentStatus));
  check('absent status reports 0/15 registered', agentStatus.registered === 0 && agentStatus.total === 15, JSON.stringify(agentStatus));
  const statusText = await page.textContent('#le-status');
  check('status banner explains fallback', /Tool console/.test(statusText), statusText);

  // -- headline bindings --
  check('bound k = 19', (await page.textContent('[data-le-bind="k"]')) === '19');
  check('bound estimate = 0.084', (await page.textContent('[data-le-bind="estimate"]')) === '0.084');
  check('main forest plot rendered', await page.locator('#le-main-figure svg').count() === 1);

  // -- frozen PDF vs WebMCP benchmark: neutral until real paired runs exist --
  await page.waitForFunction(() => document.querySelector('[data-benchmark-hash]')?.textContent !== 'loading…');
  const benchmarkStatus = await page.textContent('[data-benchmark-status]');
  check('benchmark starts with no superiority claim',
    /No runs recorded/.test(benchmarkStatus) && /no claim that WebMCP outperforms PDF/.test(benchmarkStatus), benchmarkStatus);
  check('both benchmark answer boxes start empty',
    await page.inputValue('[data-benchmark-answer="pdf"]') === ''
    && await page.inputValue('[data-benchmark-answer="webmcp"]') === '');
  check('frozen baseline hash is displayed',
    (await page.textContent('[data-benchmark-hash]')) === '9ef53847f62ab86adb322876c21a7a0b008baa19f2425f32004819ccfa82eb49');
  const pdfResponse = await page.request.get(`http://127.0.0.1:${PORT}/docs/benchmark-baseline.pdf`);
  const pdfBytes = await pdfResponse.body();
  check('frozen PDF is served as a real PDF', pdfResponse.ok() && /application\/pdf/.test(pdfResponse.headers()['content-type'] || '')
    && pdfBytes.subarray(0, 5).toString() === '%PDF-', `${pdfResponse.status()} ${pdfResponse.headers()['content-type']}`);
  const benchmarkAuditBefore = (await call('get_audit_log', {})).entries.length;
  const perfectBenchmark = {
    overall: { k: 19, estimate: 0.0837, ci_lower: -0.0175, ci_upper: 0.1849, p: 0.1051 },
    exclude_s04: { k: 18, estimate: 0.0577, ci_lower: -0.0292, ci_upper: 0.1446, p: 0.1929, excluded: ['s04'] },
    bias: { egger_p: 0.057426, rule_outcome: 'inconclusive' },
  };
  await page.fill('[data-benchmark-answer="pdf"]', JSON.stringify(perfectBenchmark));
  await page.click('[data-benchmark-score="pdf"]');
  check('perfect benchmark answer scores 13/13', /13\/13 fields correct/.test(await page.textContent('[data-benchmark-result="pdf"]')));
  await page.fill('[data-benchmark-answer="webmcp"]', '{bad json');
  await page.click('[data-benchmark-score="webmcp"]');
  check('malformed benchmark answer is rejected locally', /Invalid JSON/.test(await page.textContent('[data-benchmark-result="webmcp"]')));
  const benchmarkAuditAfter = (await call('get_audit_log', {})).entries.length;
  check('benchmark scoring never enters scientific audit ledger', benchmarkAuditAfter === benchmarkAuditBefore,
    `${benchmarkAuditBefore} → ${benchmarkAuditAfter}`);

  // -- overview --
  const ov = await call('get_document_overview', {});
  check('overview k=19', ov.evidence_base.k === 19);
  check('overview starts at evidence version 1', ov.evidence_base.evidence_version === 1, String(ov.evidence_base.evidence_version));
  check('overview 6 claims, all untested', ov.claims.length === 6 && ov.claims.every((c) => c.status === 'untested'), JSON.stringify(ov.claims.map((c) => c.status)));
  // The old wording forbade the agent to do arithmetic at all ("never recompute").
  // The contract now is narrower and honest: report the page's numbers as the page's,
  // and label your own as external rather than substituting them.
  check('overview invites external checks instead of forbidding arithmetic',
    ov.rules_of_engagement.some((r) => /Use tool results when reporting page state/.test(r) && /label them external/.test(r))
    && !ov.rules_of_engagement.some((r) => /Never recompute/.test(r)),
    JSON.stringify(ov.rules_of_engagement));
  check('overview scopes what metafor validation proves',
    ov.rules_of_engagement.some((r) => /numerical reproduction against the reference implementation, not the data or model assumptions/.test(r)),
    JSON.stringify(ov.rules_of_engagement));
  check('overview states which calls are ledgered', ov.rules_of_engagement.some((r) => /pure reads are not/i.test(r)), JSON.stringify(ov.rules_of_engagement));
  // C1: a badge is the output of one authored rule, and the response says so.
  const expectedScope = 'document-registered rule outcome only — not an independent judgment of truth, validity, risk of bias, or evidence quality';
  check('overview carries the registered-rule scope',
    ov.rule_outcome_scope === expectedScope && ov.verdict_scope === expectedScope
    && ov.rules_of_engagement.some((r) => /document-registered rule outcome only/.test(r)), String(ov.rule_outcome_scope));
  check('overview orients the agent inside the suite',
    ov.suite_context.you_are_here === 'exemplar' && /workspace\.html/.test(ov.suite_context.workspace) && /atlas\.html/.test(ov.suite_context.atlas),
    JSON.stringify(ov.suite_context));
  check('overview suggests a five-minute flow of real tool calls',
    Array.isArray(ov.suggested_flow) && ov.suggested_flow.length >= 4 && ov.suggested_flow.length <= 6
    && /c-textbook/.test(ov.suggested_flow.join(' ')) && /funnel_check/.test(ov.suggested_flow.join(' ')),
    JSON.stringify(ov.suggested_flow));
  check('a finished document offers no authoring workflow', ov.workflow === undefined, JSON.stringify(ov.workflow));

  // -- claims are DATA: list_claims exposes the machine-checkable AST --
  const cl = await call('list_claims', {});
  check('list_claims returns 6 claims', cl.claims.length === 6);
  check('list_claims states what a registered-rule outcome is scoped to',
    cl.rule_outcome_scope === expectedScope && cl.verdict_scope === expectedScope, String(cl.rule_outcome_scope));
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
  check('untested claims expose the canonical not_run outcome',
    cl.claims.every((c) => c.rule_outcome === 'not_run' && c.outcome_type === 'document_registered_rule'));

  // -- citeable manifest and unit/provenance contract --
  const manifest = await call('get_data_manifest', {});
  check('manifest identifies 19 records from 18 experiments',
    manifest.dataset.record_count === 19 && manifest.dataset.experiment_count === 18, JSON.stringify(manifest.dataset));
  check('manifest makes current verification gaps machine-readable',
    manifest.evidence_quality.secondary_source_transcriptions === 19
    && manifest.evidence_quality.primary_source_checked === 0
    && manifest.evidence_quality.effect_size_derivation_checked === 0
    && manifest.evidence_quality.structured_risk_of_bias_assessment_supplied_unverified === 0,
    JSON.stringify(manifest.evidence_quality));
  check('manifest has a full SHA-256 scientific-state id', /^sha256:[0-9a-f]{64}$/.test(manifest.scientific_state_sha256), manifest.scientific_state_sha256);
  const manifestWithRecords = await call('get_data_manifest', { include_records: true });
  check('full manifest carries all 19 traceable records', manifestWithRecords.records_included === true && manifestWithRecords.dataset.studies.length === 19);
  const baseStudies = await call('get_studies', {});
  const s04 = baseStudies.studies.find((study) => study.id === 's04');
  const s05 = baseStudies.studies.find((study) => study.id === 's05');
  check('s04/s05 explicitly share an experiment cluster', s04.experiment_id === s05.experiment_id
    && new Set(baseStudies.studies.map((study) => study.experiment_id)).size === 18, `${s04.experiment_id} / ${s05.experiment_id}`);
  check('base records disclose secondary provenance and unassessed RoB',
    baseStudies.studies.every((study) => study.provenance.source_type === 'secondary_dataset'
      && study.provenance.source_locator && study.provenance.effect_size_derivation_checked === false
      && study.risk_of_bias.status === 'not_assessed'));

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
  const REQUIRED_KEYS = ['run', 'time', 'actor', 'kind', 'tool', 'inputs', 'summary', 'evidence_version', 'result_digest', 'previous_entry_hash', 'entry_hash'];
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
  check('analysis entry carries a full SHA-256 result digest', /^sha256:[0-9a-f]{64}$/.test(analysisEntry.result_digest), String(analysisEntry.result_digest));
  const rowTitle = await page.locator('#le-ledger .le-ledger-row').last().getAttribute('title');
  check('ledger row exposes entry hash, result hash and inputs in its title',
    /^entry sha256:[0-9a-f]{64} · result sha256:[0-9a-f]{64} · inputs \{/.test(rowTitle || ''), rowTitle);

  // A receipt signs the scientific-state id and an audit prefix. The key is
  // deliberately self-generated, so the API must state the assurance limit.
  const receipt = await call('create_reproducibility_receipt', {});
  check('receipt signs the current state with ECDSA P-256',
    receipt.receipt_version === 'living-evidence-receipt/1'
    && receipt.signature?.algorithm === 'ECDSA-P256-SHA256'
    && /^sha256:[0-9a-f]{64}$/.test(receipt.signer_key_fingerprint)
    && /^[A-Za-z0-9_-]+$/.test(receipt.signature?.value || ''), JSON.stringify(receipt));
  check('live receipt intentionally has no artifact hash', receipt.artifact_sha256 === null, String(receipt.artifact_sha256));
  check('receipt clearly disclaims unanchored authorship', /self-generated/.test(receipt.note) && /Pin signer_key_fingerprint/.test(receipt.note), receipt.note);
  const receiptStatus = await call('get_reproducibility_status', {});
  check('fresh receipt verifies against the current state and audit prefix',
    receiptStatus.status === 'matches_self_signed_session_receipt'
    && receiptStatus.latest_receipt_verification.status === 'valid_current_state'
    && receiptStatus.latest_receipt_verification.signature_status === 'valid'
    && receiptStatus.audit_chain.valid === true, JSON.stringify(receiptStatus));

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

  // -- claims: all three canonical registered-rule outcomes appear --
  const c1 = await call('evaluate_claim', { claim_id: 'c-textbook' });
  check('textbook registered rule FAILS', c1.rule_outcome === 'failed' && c1.verdict === 'challenged', JSON.stringify(c1));
  check('verdict response carries the staleness quartet',
    c1.stale === false && c1.evaluated_version === 1 && c1.evidence_version === 1 && c1.status === c1.verdict,
    JSON.stringify({ stale: c1.stale, ev: c1.evaluated_version, cur: c1.evidence_version, status: c1.status }));
  check('verdict reason is rendered from the AST template', /^pooled SMD 0\.0837 \[/.test(c1.reason), c1.reason);
  check('the rule-outcome response scopes itself', c1.rule_outcome_scope === cl.rule_outcome_scope, String(c1.rule_outcome_scope));
  check('failed-rule chip in prose', await page.locator('[data-claim="c-textbook"] .le-chip-challenged').count() === 1
    && /rule failed/.test(await page.textContent('[data-claim="c-textbook"] .le-chip-challenged')));
  const c2 = await call('evaluate_claim', { claim_id: 'c-bias' });
  check('bias registered rule INCONCLUSIVE (Egger borderline)', c2.rule_outcome === 'inconclusive' && c2.verdict === 'nuanced', JSON.stringify(c2.reason));
  for (const [id, expectLegacy] of [['c-overall', 'supported'], ['c-moderator', 'supported'], ['c-window', 'supported'], ['c-robust', 'supported']]) {
    const r = await call('evaluate_claim', { claim_id: id });
    check(`claim ${id} registered rule passed`, r.rule_outcome === 'passed' && r.verdict === expectLegacy, JSON.stringify(r.reason));
  }
  const badgeCount = await page.locator('.le-chip').count();
  check('6 verdict badges visible in prose', badgeCount === 6, String(badgeCount));
  check('no badge is stale before the evidence changes', await page.locator('.le-chip-stale').count() === 0);
  const unknownClaim = await callErr('evaluate_claim', { claim_id: 'nope' });
  check('unknown claim id errors helpfully', /list_claims/.test(unknownClaim || ''), unknownClaim);
  const claimEntry = (await call('get_audit_log', {})).entries.find((e) => e.tool === 'evaluate_claim');
  check('registered-rule outcomes are ledgered with their claim id', claimEntry.inputs.claim_id === 'c-textbook' && claimEntry.kind === 'claim', JSON.stringify(claimEntry));

  // -- moderator analysis reproduces published result through the tool layer --
  const mr = await call('meta_regression', { moderator: 'weeks', cap: 3 });
  check('meta-regression slope -0.157', Math.abs(mr.moderator.b - -0.157) < 1e-3, String(mr.moderator.b));
  check('meta-regression R2 ~100', mr.R2_percent > 99.5, String(mr.R2_percent));

  // -- analysis guards: an argument that cannot mean anything is refused, not ignored --
  const capOnYear = await callErr('meta_regression', { moderator: 'year', cap: 3 });
  check('capping a moderator other than weeks is rejected', /only accepted for moderator "weeks"/.test(capOnYear || ''), capOnYear);
  const capZero = await callErr('meta_regression', { moderator: 'weeks', cap: 0 });
  check('a non-positive cap is rejected', /cap must be a number > 0/.test(capZero || ''), capZero);
  check('an uncapped regression on year still works', typeof (await call('meta_regression', { moderator: 'year' })).run === 'number');
  const splitOnCategorical = await callErr('subgroup_analysis', { split_field: 'setting', split_at: 1 });
  check('split_at on a categorical field is rejected, not silently ignored',
    /split_at is only meaningful for numeric fields/.test(splitOnCategorical || ''), splitOnCategorical);

  // -- propose_study: validation, provenance, pending, human approval --
  const bad = await callErr('propose_study', proposal({ author: 'X', vi: -1, experiment_id: 'e2e-bad-vi' }));
  check('invalid vi rejected', /vi must be/.test(bad || ''), bad);
  const noQuote = await callErr('propose_study', proposal({ author: 'No Quote', quote: undefined, experiment_id: 'e2e-no-quote' }));
  check('proposal without a quote rejected', /missing required field: quote/.test(noQuote || ''), noQuote);
  const noSource = await callErr('propose_study', proposal({ author: 'No Source', source: undefined, experiment_id: 'e2e-no-source' }));
  check('proposal without a source rejected', /missing required field: source/.test(noSource || ''), noSource);
  const dup = await callErr('propose_study', proposal({
    author: 'Maxwell', year: 1970, yi: 0.80, vi: 0.063, weeks: 1,
    source: 'duplicate fixture', quote: 'd = 0.80', experiment_id: 'e2e-exact-duplicate',
  }));
  check('exact duplicate rejected', /duplicate/.test(dup || ''), dup);
  // The runtime enforces the same integer bounds the input schema declares — a schema
  // the handler does not back is documentation, not a contract.
  const fracYear = await callErr('propose_study', proposal({ author: 'Fractional', year: 1985.5, experiment_id: 'e2e-fractional-year' }));
  check('a non-integer year is rejected', /year must be a whole year/.test(fracYear || ''), fracYear);
  const fracN = await callErr('propose_study', proposal({ author: 'Fractional N', n1i: 12.5, experiment_id: 'e2e-fractional-n' }));
  check('a fractional group size is rejected', /n1i must be a whole sample size/.test(fracN || ''), fracN);

  const prop = await call('propose_study', proposal());
  check('proposal pending, not included', prop.status === 'pending_human_approval', JSON.stringify(prop));
  check('proposal returns a SHA-256 record hash', /^sha256:[0-9a-f]{64}$/.test(prop.record_hash || ''), String(prop.record_hash));
  // Present-and-null, not absent: an absent key reads as "not checked".
  check('unrelated proposal reports possible_duplicate_of: null',
    'possible_duplicate_of' in prop && prop.possible_duplicate_of === null, JSON.stringify(prop));
  check('the pending message tells the agent to re-orient after approval',
    /[Cc]all get_document_overview again after the human approves/.test(prop.message), prop.message);
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
  check('provenance keeps the derivation of yi/vi when the proposal supplied one',
    approvedRec.provenance.derivation === 'd computed from the reported t(198) = 0.35 and group sizes',
    JSON.stringify(approvedRec.provenance.derivation));
  const baseRec = studiesAfter.studies.find((s) => s.id === 's01');
  check('original records keep structured, explicitly unverified provenance',
    baseRec.provenance.source_type === 'secondary_dataset'
    && baseRec.provenance.source_locator === 'dat.raudenbush1985 row 1 (s01)'
    && baseRec.provenance.primary_source_checked === false
    && baseRec.risk_of_bias.status === 'not_assessed', JSON.stringify(baseRec));

  // re-evaluate after evidence change: badge refreshes, stale cleared for that claim
  const c1b = await call('evaluate_claim', { claim_id: 'c-textbook' });
  check('re-evaluation works on k=20', ['failed', 'passed', 'inconclusive'].includes(c1b.rule_outcome), JSON.stringify(c1b.rule_outcome));
  check('re-evaluated verdict reports the current evidence version', c1b.stale === false && c1b.evaluated_version === 2, JSON.stringify(c1b));
  check('re-evaluated chip not stale', await page.locator('[data-claim="c-textbook"] .le-chip-stale').count() === 0);
  const claimsMixed = (await call('list_claims', {})).claims;
  check('list_claims distinguishes fresh from stale verdicts',
    claimsMixed.find((c) => c.id === 'c-textbook').stale === false
    && claimsMixed.filter((c) => c.stale === true).length === 5,
    JSON.stringify(claimsMixed.map((c) => [c.id, c.stale])));

  // -- same author+year, different effect size: flagged, not rejected --
  const nearDup = await call('propose_study', proposal({
    author: 'Maxwell', year: 1970, yi: 0.42, vi: 0.055, weeks: 1,
    setting: 'group', tester: 'blind', source: 'E2E fixture — second experiment in the same paper',
    quote: 'Experiment 2: d = 0.42 (SE 0.23)',
    source_locator: 'E2E fixture, experiment 2, row 1', experiment_id: 'e2e-maxwell-experiment-2',
  }));
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
    log.entries.filter((e) => ['analysis', 'claim', 'proposal', 'approval', 'receipt'].includes(e.kind)).every((e) => /^sha256:[0-9a-f]{64}$/.test(e.result_digest || '')),
    JSON.stringify(log.entries.filter((e) => !e.result_digest).map((e) => e.kind)));
  check('entire audit hash chain verifies', log.chain.valid === true && log.chain.checked_entries === log.entries.length, JSON.stringify(log.chain));

  // -- tool console present --
  check('tool console select lists tools', await page.locator('#le-console select option').count() === 15);

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
