// Real-browser E2E for the Living Evidence Board (BOARD-SPEC.md) — verify/board.e2e.mjs
//
// The load-bearing assertions in this file are the ones that recompute the
// board's claims independently of the page's DOM and state, and demand
// equality with what the page reports:
//   - block 2 recomputes every seed claim's tally from data/housewife-board-seed.js
//     via lib/board.js's own exported computeTally, and demands the page's
//     get_node/list_nodes numbers match.
//   - block 2b/2c go one step further and are independent of the SEED MODULE
//     too: a GOLDEN per-claim tally map and golden evidence values, both
//     transcribed as bare literals straight out of docs/BOARD-SPEC.md §6/§1
//     with no import of the seed at all. This is the check that actually
//     catches a wrong seed — block 2's seed-derived recomputation agrees with
//     a buggy seed by construction, since both sides read the same buggy
//     data.
//   - block 4 fault-injects an evidence->evidence edge and an evidence node
//     missing its quote, and demands both are REJECTED, naming the matrix /
//     the missing field, before it ever tests the happy path.
//   - block 5 corrupts the localStorage snapshot — both a wholly unreadable
//     one and a structurally-valid one carrying an invalid PENDING edge —
//     and demands a clean boot with only the bad item dropped, never a crash.
//
// Server: python3 -m http.server 8501 --bind 127.0.0.1 (started by this
// script; readiness is polled, not assumed after a fixed delay). Playwright
// comes from the absolute path below — no install.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { computeTally, computeDiscoveries, SEED_VERIFICATION_LABEL, TALLY_SCOPE } from '../lib/board.js';
import { SEED } from '../data/housewife-board-seed.js';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/hirokisugimoto/tennis-checker/node_modules/playwright');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8501;

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`FAIL  ${name}  ${detail}`); }
}

let intentionalKill = false;
let serverExited = false;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
server.on('exit', (code, signal) => {
  serverExited = true;
  if (!intentionalKill) {
    console.error(`\nFAIL  server process exited unexpectedly (code ${code}, signal ${signal}) — port ${PORT} already in use?`);
    failures++;
  }
});

/** Poll the server instead of assuming a fixed sleep was long enough (or
 *  wastefully longer than needed) — fails loudly, with the same "port
 *  already in use?" hint the exit handler gives, if it never comes up. */
async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (serverExited) throw new Error(`server process exited before it became ready — is port ${PORT} already in use?`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not listening yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server at ${url} did not become ready within ${timeoutMs}ms — is port ${PORT} already in use?`);
}

try {
  await waitForServer(`http://127.0.0.1:${PORT}/board.html`);
  const browser = await chromium.launch({ args: ['--disable-accelerated-2d-canvas', '--disable-gpu'] });
  try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

  await page.goto(`http://127.0.0.1:${PORT}/board.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.LivingEvidenceBoard && window.LivingEvidenceBoard.tools.length > 0, null, { timeout: 10000 });

  const call = (name, args, opts) => page.evaluate(([n, a, o]) => window.LivingEvidenceBoard.invokeTool(n, a, o), [name, args, opts]);
  const callErr = (name, args) => page.evaluate(([n, a]) => {
    try { window.LivingEvidenceBoard.invokeTool(n, a); return null; } catch (e) { return e.message; }
  }, [name, args]);
  const audit = () => page.evaluate(() => window.LivingEvidenceBoard.state.audit);
  const ledgerRows = () => page.locator('#board-ledger .le-ledger-row').count();
  const boardVersion = () => page.evaluate(() => window.LivingEvidenceBoard.state.boardVersion);

  // ======================================================================= 1
  console.log('\n# 1. boot: tools, status, map');
  const tools = await page.evaluate(() => window.LivingEvidenceBoard.tools.map((t) => t.name));
  check('11 tools exposed', tools.length === 11, tools.join(','));
  check('the expected 11 tools', JSON.stringify(tools) === JSON.stringify([
    'board_overview', 'list_nodes', 'get_node', 'get_edges', 'get_discoveries',
    'propose_node', 'propose_edge', 'focus_node', 'set_topic', 'export_board', 'get_audit_log',
  ]), tools.join(','));
  const readOnlyNames = await page.evaluate(() => window.LivingEvidenceBoard.tools.filter((t) => t.readOnly).map((t) => t.name));
  check('the six read tools are declared read-only',
    JSON.stringify(readOnlyNames.sort()) === JSON.stringify(['board_overview', 'get_audit_log', 'get_discoveries', 'get_edges', 'get_node', 'list_nodes'].sort()),
    readOnlyNames.join(','));
  check('every schema is closed (additionalProperties: false)',
    await page.evaluate(() => window.LivingEvidenceBoard.tools.every((t) => t.inputSchema.additionalProperties === false)));
  const agentStatus = await page.evaluate(() => window.LivingEvidenceBoard.state.agent);
  check('WebMCP absent in the test browser, handled gracefully', agentStatus.active === false, JSON.stringify(agentStatus));
  check('registration status is explicitly "absent" (not a silent false)', agentStatus.status === 'absent', JSON.stringify(agentStatus));
  check('absent status reports 0/11 registered', agentStatus.registered === 0 && agentStatus.total === 11, JSON.stringify(agentStatus));
  check('status banner explains the fallback', /Tool console/.test(await page.textContent('#board-status')));
  const nodeCount = await page.locator('#board-map [data-node]').count();
  check('exactly 40 nodes rendered', nodeCount === 40, String(nodeCount));
  const nodeTypeCounts = await page.evaluate(() => {
    const acc = {};
    for (const el of document.querySelectorAll('#board-map [data-node]')) {
      const cls = [...el.classList].find((c) => c.startsWith('board-node-'));
      const t = cls.slice('board-node-'.length);
      acc[t] = (acc[t] || 0) + 1;
    }
    return acc;
  });
  check('node types are 2 hypothesis / 4 mechanism / 8 claim / 23 evidence / 3 question',
    JSON.stringify(nodeTypeCounts) === JSON.stringify({ hypothesis: 2, mechanism: 4, claim: 8, evidence: 23, question: 3 }),
    JSON.stringify(nodeTypeCounts));
  const edgeCount = await page.locator('#board-map .atlas-edges .atlas-edge').count();
  check('43 seed edges rendered (incl. the five v1-ruling evidence→hypothesis edges)', edgeCount === 43, String(edgeCount));
  check('every node is keyboard reachable with an aria-label',
    await page.evaluate(() => [...document.querySelectorAll('[data-node]')].every((el) => el.getAttribute('tabindex') === '0' && el.getAttribute('role') === 'button' && (el.getAttribute('aria-label') || '').length > 5)));
  check('boot row is ledgered as the system', (await audit())[0].actor === 'system', JSON.stringify((await audit())[0]));
  check('nothing is selected before anyone asks', await page.locator('.atlas-selected').count() === 0);
  check('the panel shows the empty placeholder', /Nothing selected yet/.test(await page.textContent('#board-panel')));
  await page.locator('#board-map').screenshot({ path: path.join(root, 'verify', '_snap_board_map.png') });

  // ======================================================================= 2
  console.log('\n# 2. seed integrity + tally spot-checks vs an independent recomputation');
  const listedEvidence = await call('list_nodes', { type: 'evidence' });
  check('23 evidence nodes listed', listedEvidence.nodes.length === 23, String(listedEvidence.nodes.length));
  check('every evidence node carries quote + cited_as + the seed verification label',
    listedEvidence.nodes.every((n) => typeof n.quote === 'string' && n.quote.length > 0 && typeof n.cited_as === 'string' && n.cited_as.length > 0 && n.verification === SEED_VERIFICATION_LABEL),
    JSON.stringify(listedEvidence.nodes.find((n) => !n.quote || !n.cited_as || n.verification !== SEED_VERIFICATION_LABEL)));

  const byId = new Map(SEED.nodes.map((n) => [n.id, n]));
  const typeOf = (id) => byId.get(id)?.type;
  const nodeIncome = await call('get_node', { node_id: 'c-income' });
  const expectIncome = computeTally('c-income', SEED.edges, typeOf);
  check('c-income tally matches the independent node-side recomputation',
    nodeIncome.tally_status === expectIncome.status && nodeIncome.tally_supports === expectIncome.supports && nodeIncome.tally_contradicts === expectIncome.contradicts,
    JSON.stringify({ page: [nodeIncome.tally_status, nodeIncome.tally_supports, nodeIncome.tally_contradicts], node: [expectIncome.status, expectIncome.supports, expectIncome.contradicts] }));
  check('c-income is contested (>=2 supports AND >=1 contradict — spec §7 verbatim)',
    nodeIncome.tally_status === 'contested' && nodeIncome.tally_supports >= 2 && nodeIncome.tally_contradicts >= 1, JSON.stringify(nodeIncome));
  const nodeGap = await call('get_node', { node_id: 'c-gap' });
  const expectGap = computeTally('c-gap', SEED.edges, typeOf);
  check('c-gap tally matches the independent recomputation and is supported',
    nodeGap.tally_status === 'supported' && nodeGap.tally_status === expectGap.status && nodeGap.tally_supports === expectGap.supports,
    JSON.stringify(nodeGap));
  check('claim tallies carry the bookkeeping scope, verbatim', nodeIncome.tally_scope === TALLY_SCOPE, nodeIncome.tally_scope);
  // a claim with zero evidence edges (proposed fresh, no edges yet) must read unsupported
  const freshClaim = await call('propose_node', { type: 'claim', label: 'e2e スポットチェック用の新規クレーム', statement: 'このクレームは意図的にどのエッジも持たない。' });
  await page.locator(`#le-pending-node-${freshClaim.node_id} .le-btn-approve`).click();
  await page.waitForTimeout(100);
  const freshDetail = await call('get_node', { node_id: freshClaim.node_id });
  check('a fresh, edge-less claim reads as unsupported (0/0)',
    freshDetail.tally_status === 'unsupported' && freshDetail.tally_supports === 0 && freshDetail.tally_contradicts === 0, JSON.stringify(freshDetail));
  // clean up: reject is not possible post-approval, so just leave it — it is inert
  // (zero edges, not part of any other assertion) and does not affect the counts below.

  // ======================================================================= 2b
  console.log('\n# 2b. GOLDEN per-claim tally map — literals transcribed from spec §6, independent of the page AND the seed module');
  // These are bare literals, NOT derived from data/housewife-board-seed.js —
  // if the seed disagrees with these numbers, the SEED is wrong, not this
  // map (BOARD-SPEC.md §7). Only evidence->claim edges feed a claim's tally
  // (claim->hypothesis and the v1-ruling evidence->hypothesis edges do not),
  // so these counts are unaffected by the five edges B1 added.
  const GOLDEN_TALLY = {
    'c-gap': { status: 'supported', supports: 1, contradicts: 0 },
    'c-marriage': { status: 'contested', supports: 5, contradicts: 1 },
    'c-income': { status: 'contested', supports: 2, contradicts: 1 },
    'c-grandparent': { status: 'supported', supports: 3, contradicts: 0 },
    'c-commute': { status: 'supported', supports: 3, contradicts: 0 },
    'c-values': { status: 'supported', supports: 2, contradicts: 0 },
    'c-notonly': { status: 'supported', supports: 1, contradicts: 0 },
    'c-industry': { status: 'supported', supports: 2, contradicts: 0 },
  };
  const GOLDEN_CONTESTED = Object.entries(GOLDEN_TALLY).filter(([, g]) => g.status === 'contested').map(([id]) => id).sort();
  check('the golden contested set is exactly {c-income, c-marriage} (sanity on the literal itself)',
    JSON.stringify(GOLDEN_CONTESTED) === JSON.stringify(['c-income', 'c-marriage'].sort()), JSON.stringify(GOLDEN_CONTESTED));
  const claimList2b = await call('list_nodes', { type: 'claim' });
  for (const [cid, golden] of Object.entries(GOLDEN_TALLY)) {
    const n = claimList2b.nodes.find((x) => x.id === cid);
    check(`${cid} tally matches the GOLDEN map (${golden.status} ${golden.supports}+/${golden.contradicts}−)`,
      !!n && n.tally_status === golden.status && n.tally_supports === golden.supports && n.tally_contradicts === golden.contradicts,
      JSON.stringify(n));
  }

  // ======================================================================= 2c
  console.log('\n# 2c. GOLDEN seed evidence values + the five v1-ruling evidence→hypothesis edges');
  const eMukyo = await call('get_node', { node_id: 'e-mukyo' });
  check('e-mukyo value carries 26.4 and 7.3', eMukyo.value.includes('26.4') && eMukyo.value.includes('7.3'), eMukyo.value);
  check('e-mukyo year is 2022', eMukyo.year === 2022, String(eMukyo.year));
  check('e-mukyo cited_as names 就業構造基本調査', eMukyo.cited_as.includes('就業構造基本調査'), eMukyo.cited_as);
  const eJilpt16 = await call('get_node', { node_id: 'e-jilpt16' });
  check('e-jilpt16 value carries all four quartile figures (24.6/24.2/35.7/31.1)',
    ['24.6', '24.2', '35.7', '31.1'].every((s) => eJilpt16.value.includes(s)), eJilpt16.value);
  const e1995 = await call('get_node', { node_id: 'e-1995' });
  check('e-1995 year is 1995 and value carries 50.4 and 31.1',
    e1995.year === 1995 && e1995.value.includes('50.4') && e1995.value.includes('31.1'), JSON.stringify([e1995.year, e1995.value]));
  const eKyuyo = await call('get_node', { node_id: 'e-kyuyo' });
  check('e-kyuyo quote is EXACTLY the canonical placeholder (not a fabricated citation)',
    eKyuyo.quote === '（会話中の比較表に数値のみが記載され、引用可能な地の文は与えられていない）', eKyuyo.quote);

  const edges2c = await call('get_edges', {});
  const hasEdge = (from, to, type) => edges2c.edges.some((e) => e.from === from && e.to === to && e.type === type);
  check('e-kaiki supports h-selection (v1-ruling edge)', hasEdge('e-kaiki', 'h-selection', 'supports'));
  check('e-mikonritsu supports h-selection (v1-ruling edge)', hasEdge('e-mikonritsu', 'h-selection', 'supports'));
  check('e-kyuyo supports h-selection (v1-ruling edge)', hasEdge('e-kyuyo', 'h-selection', 'supports'));
  check('e-ishiki supports h-model (v1-ruling edge)', hasEdge('e-ishiki', 'h-model', 'supports'));
  check('e-1995 contradicts h-selection (v1-ruling edge)', hasEdge('e-1995', 'h-selection', 'contradicts'));
  const activeEdgeCount2c = edges2c.edges.filter((e) => e.status === 'active').length;
  check('43 active seed edges (38 + the five v1-ruling edges)', activeEdgeCount2c === 43, String(activeEdgeCount2c));

  // ======================================================================= 3
  console.log('\n# 3. get_discoveries — bookkeeping, not truth language');
  const disc = await call('get_discoveries', {});
  const nodeDisc = computeDiscoveries(SEED.nodes, SEED.edges);
  check('contested_claims includes c-income (matches node-side computeDiscoveries)',
    disc.contested_claims.includes('c-income'), JSON.stringify(disc.contested_claims));
  // Sorted-set EQUALITY against the GOLDEN set from block 2b, not a subset
  // check — the fresh block-2 claim is unsupported (not contested), so
  // equality against the golden {c-income, c-marriage} holds exactly.
  check('contested_claims is EXACTLY {c-income, c-marriage} (sorted-set equality vs the golden)',
    JSON.stringify(disc.contested_claims.slice().sort()) === JSON.stringify(GOLDEN_CONTESTED),
    JSON.stringify({ page: disc.contested_claims, golden: GOLDEN_CONTESTED }));
  check('unsupported_claims includes the freshly approved edge-less claim',
    disc.unsupported_claims.includes(freshClaim.node_id), JSON.stringify(disc.unsupported_claims));
  const GOLDEN_SINGLE_SOURCE = ['c-gap', 'c-values', 'c-notonly', 'c-industry'].sort();
  check('single_source_claims is EXACTLY the golden set (sorted-set equality)',
    JSON.stringify(disc.single_source_claims.slice().sort()) === JSON.stringify(GOLDEN_SINGLE_SOURCE),
    JSON.stringify({ page: disc.single_source_claims, golden: GOLDEN_SINGLE_SOURCE }));
  check('untested_hypotheses matches the seed (both hypotheses are tested)',
    JSON.stringify(disc.untested_hypotheses) === JSON.stringify(nodeDisc.untested_hypotheses), JSON.stringify(disc.untested_hypotheses));
  check('open_questions lists all 3 seed questions with their tested targets',
    disc.open_questions.length === 3
    && disc.open_questions.find((q) => q.question_id === 'q-decompose').targets.includes('h-selection')
    && disc.open_questions.find((q) => q.question_id === 'q-share').targets.includes('h-model'),
    JSON.stringify(disc.open_questions));
  check('unverified_evidence_count is 23 (every seed evidence node)', disc.unverified_evidence_count === 23, String(disc.unverified_evidence_count));
  check('a note is present and names bookkeeping, not truth', /bookkeeping/.test(disc.note) && !/is true|is false|proven|disproven/i.test(disc.note), disc.note);
  check('discoveries carry the tally scope disclaimer', disc.tally_scope === TALLY_SCOPE, disc.tally_scope);
  check('the discoveries panel on the page renders the same note', (await page.textContent('#board-discoveries')).includes(disc.note));
  check('no truth-adjudication language anywhere in the rendered discoveries panel',
    !/\b(is true|is false|proven|disproven|confirmed to be)\b/i.test(await page.textContent('#board-discoveries')));

  // ======================================================================= 4
  console.log('\n# 4. propose_node / propose_edge — validation, approval, matrix enforcement');
  const noQuote = await callErr('propose_node', { type: 'evidence', label: '引用なしテスト', statement: '引用なしで提案されたテスト証拠。', value: 'x', year: 2026, kind: 'survey', cited_as: 'テスト出典' });
  check('propose_node evidence without a quote errors, naming the field', /quote/.test(noQuote || ''), noQuote);
  const badEdgeShape = await callErr('propose_edge', { from: 'e-mukyo', to: 'e-tfr', type: 'supports' });
  check('evidence -> evidence is rejected by the matrix, naming it',
    /not allowed by the validity matrix/.test(badEdgeShape || '') && /evidence→claim/.test(badEdgeShape || ''), badEdgeShape);

  const versionBefore4 = await boardVersion();
  const rowsBefore4 = await ledgerRows();
  const propNode = await call('propose_node', {
    type: 'evidence', label: 'e2e追加証拠', statement: 'e2eテストで提案された新規証拠。',
    value: 'テスト値42%', year: 2026, kind: 'survey', cited_as: 'e2eテスト出典', quote: 'これはe2eテストの引用文である',
  });
  check('a valid propose_node returns pending_human_approval', propNode.status === 'pending_human_approval', JSON.stringify(propNode));
  check('a pending-node card is rendered', await page.locator(`#le-pending-node-${propNode.node_id}`).count() === 1);
  check('the pending section becomes visible', await page.locator('#pending-section.le-has-pending, #pending-section:has(.le-pending-card)').count() >= 1);
  // propose_edge from a still-PENDING node must be refused — an edge can only
  // point at something already on the board (seed or previously approved).
  const notYetOnBoard = await callErr('propose_edge', { from: propNode.node_id, to: 'c-income', type: 'supports' });
  check('propose_edge naming a still-pending node as "from" errors, telling the agent to approve first',
    /must already be on the board/.test(notYetOnBoard || ''), notYetOnBoard);

  await page.locator(`#le-pending-node-${propNode.node_id} .le-btn-approve`).click();
  await page.waitForTimeout(100);
  check('board_version bumped after the node approval', (await boardVersion()) === versionBefore4 + 1, `${versionBefore4} -> ${await boardVersion()}`);
  check('the node no longer appears pending', await page.locator(`#le-pending-node-${propNode.node_id}`).count() === 0);
  check('the approved evidence node is now drawn on the map', await page.locator(`[data-node="${propNode.node_id}"]`).count() === 1);

  const versionBeforeEdge = await boardVersion();
  const propEdge2 = await call('propose_edge', { from: propNode.node_id, to: 'c-income', type: 'supports' });
  check('propose_edge now succeeds once its "from" node is approved', propEdge2.status === 'pending_human_approval', JSON.stringify(propEdge2));
  const incomeBefore = await call('get_node', { node_id: 'c-income' });
  await page.locator(`#le-pending-edge-${propEdge2.edge_id} .le-btn-approve`).click();
  await page.waitForTimeout(100);
  check('board_version bumped again after the edge approval', (await boardVersion()) === versionBeforeEdge + 1, `${versionBeforeEdge} -> ${await boardVersion()}`);
  const incomeAfter = await call('get_node', { node_id: 'c-income' });
  check('c-income\'s tally recomputed to reflect the newly approved supporting edge',
    incomeAfter.tally_supports === incomeBefore.tally_supports + 1, `${incomeBefore.tally_supports} -> ${incomeAfter.tally_supports}`);
  const discAfter4 = await call('get_discoveries', {});
  check('get_discoveries reflects the new evidence node in the unverified count (unchanged: freshly proposed evidence is NOT seed-unverified)',
    discAfter4.unverified_evidence_count === 23, String(discAfter4.unverified_evidence_count));
  check('ledger gained rows for both approvals', (await ledgerRows()) > rowsBefore4);

  // ======================================================================= 5
  console.log('\n# 5. persistence — reload restores state; a corrupt snapshot boots clean');
  const preReloadVersion = await boardVersion();
  const preReloadNodeCount = await page.locator('#board-map [data-node]').count();
  const preReloadAudit = await audit();
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.LivingEvidenceBoard && window.LivingEvidenceBoard.tools.length > 0, null, { timeout: 10000 });
  check('board_version survives a reload', (await boardVersion()) === preReloadVersion, `${preReloadVersion} -> ${await boardVersion()}`);
  check('node count survives a reload (seed + approved)', (await page.locator('#board-map [data-node]').count()) === preReloadNodeCount);
  // +1: every boot appends its own "restored" system row to the ledger (same
  // convention as the rest of the suite) — everything BEFORE that new row
  // must be byte-identical to what was there before the reload.
  const postReloadAudit = await audit();
  check('the restored ledger is the prior ledger plus exactly one new boot row',
    postReloadAudit.length === preReloadAudit.length + 1, `${preReloadAudit.length} -> ${postReloadAudit.length}`);
  check('the rows before the new boot row are unchanged, and the new row says "restored"',
    JSON.stringify(postReloadAudit.slice(0, preReloadAudit.length)) === JSON.stringify(preReloadAudit)
    && postReloadAudit.at(-1).summary.includes('restored'),
    postReloadAudit.at(-1)?.summary);
  check('the approved evidence node is still on the map after reload', await page.locator(`[data-node="${propNode.node_id}"]`).count() === 1);

  await page.evaluate(() => localStorage.setItem('le-board-v1', '{ this is not json'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.LivingEvidenceBoard && window.LivingEvidenceBoard.tools.length > 0, null, { timeout: 10000 });
  check('a corrupt snapshot boots the clean seed instead of crashing', (await page.locator('#board-map [data-node]').count()) === 40, String(await page.locator('#board-map [data-node]').count()));
  check('board_version resets to 1 after a corrupt-snapshot boot', (await boardVersion()) === 1, String(await boardVersion()));
  check('zero page errors from the corrupt-snapshot recovery', errors.length === 0, errors.join(' | '));

  // A structurally-VALID snapshot (parses fine, right shape) can still smuggle
  // a matrix-violating edge into the PENDING list — a tampered snapshot one
  // click away from being approved onto the board. Only the offending item
  // should be dropped; the rest of the boot must stay clean.
  await page.evaluate(() => {
    const now = new Date().toISOString();
    const snapshot = {
      v: 1, topic: 'corrupt-pending e2e probe',
      approvedNodes: [], approvedEdges: [],
      pendingNodes: [],
      pendingEdges: [{
        id: 'ed-corrupt1',
        edge: {
          id: 'ed-corrupt1', from: 'e-mukyo', to: 'e-tfr', type: 'supports', rationale: null,
          provenance: { origin: 'proposal', source: null, quote: null, cited_as: null, verification: null, proposed_at: now, approved_at: null },
        },
        status: 'pending', proposed_at: now,
      }],
      ledger: [], boardVersion: 1, runCounter: 0,
    };
    localStorage.setItem('le-board-v1', JSON.stringify(snapshot));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.LivingEvidenceBoard && window.LivingEvidenceBoard.tools.length > 0, null, { timeout: 10000 });
  check('a corrupt PENDING evidence->evidence edge does not take the boot down', errors.length === 0, errors.join(' | '));
  check('the corrupt pending edge is dropped, not restored onto a card', await page.locator('#le-pending-edge-ed-corrupt1').count() === 0);
  const edgesAfterCorruptPending = await call('get_edges', {});
  check('get_edges does not list the dropped corrupt pending edge',
    !edgesAfterCorruptPending.edges.some((e) => e.id === 'ed-corrupt1'), JSON.stringify(edgesAfterCorruptPending.edges.filter((e) => e.id === 'ed-corrupt1')));
  check('the seed itself is intact — only the corrupt pending item was dropped', (await page.locator('#board-map [data-node]').count()) === 40, String(await page.locator('#board-map [data-node]').count()));

  // ======================================================================= 6
  console.log('\n# 6. export — receipt by default, full JSON on request');
  const exp1 = await call('export_board', {});
  check('default export omits the json payload', !('json' in exp1), JSON.stringify(Object.keys(exp1)));
  check('default export carries the receipt shape', typeof exp1.filename === 'string' && Number.isFinite(exp1.bytes) && typeof exp1.download_started === 'boolean' && /^[0-9a-f]{8}$/.test(exp1.content_digest), JSON.stringify(exp1));
  const exp2 = await call('export_board', { include_json: true });
  check('include_json:true adds the json payload with nodes/edges/discoveries/audit_log',
    exp2.json && Array.isArray(exp2.json.nodes) && Array.isArray(exp2.json.edges) && exp2.json.discoveries && Array.isArray(exp2.json.audit_log),
    JSON.stringify(Object.keys(exp2.json || {})));
  // block 5's corrupt-snapshot step reset the board to the clean 40-node seed
  // (that reset IS the point of block 5) — export reflects that clean state.
  check('exported node count matches the current (post-reset) 40-node seed', exp2.json.nodes.length === 40, String(exp2.json.nodes.length));

  // ======================================================================= 7
  console.log('\n# 7. id normalization, focus/Escape/aria, no scroll hijack');
  const bareGet = await call('get_node', { node_id: 'c-income' });
  const typedGet = await call('get_node', { node_id: 'claim:c-income' });
  check('bare and typed node ids resolve to the same node', bareGet.id === typedGet.id && bareGet.tally_status === typedGet.tally_status, JSON.stringify([bareGet.id, typedGet.id]));
  const focus1 = await call('focus_node', { node_id: 'hypothesis:h-selection' });
  check('focus_node accepts the typed id form', focus1.node_id === 'h-selection' && focus1.bare_id === 'h-selection', JSON.stringify(focus1));
  check('the focused node carries the selection ring', await page.locator('[data-node="h-selection"].atlas-selected').count() === 1);
  check('the map is dimmed via a class, not per-node style churn',
    await page.evaluate(() => document.querySelector('.atlas-map').classList.contains('atlas-has-selection')));
  check('exactly one node is selected at a time', await page.locator('.atlas-selected').count() === 1);
  check('the panel shows the focused hypothesis', /h-selection/.test(await page.textContent('#board-panel')));
  const focusEntry = (await audit()).at(-1);
  check('focus_node is ledgered as navigation', focusEntry.kind === 'navigation' && focusEntry.inputs.node_id === 'h-selection', JSON.stringify(focusEntry));
  const badFocus = await callErr('focus_node', { node_id: 'nope-not-a-node' });
  check('an unknown node id errors helpfully', /unknown node id/.test(badFocus || '') && /list_nodes/.test(badFocus || ''), badFocus);

  // keyboard reachability
  await page.locator('[data-node="c-gap"]').focus();
  check('a node takes DOM focus', await page.evaluate(() => document.activeElement?.getAttribute('data-node')) === 'c-gap');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  check('Enter selects the focused node', await page.locator('[data-node="c-gap"].atlas-selected').count() === 1);
  const kbEntry = (await audit()).at(-1);
  check('a keyboard selection is attributed to the human', kbEntry.actor === 'human' && kbEntry.kind === 'navigation', JSON.stringify(kbEntry));

  // Escape — unledgered
  const auditBeforeEsc = (await audit()).length;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  check('Escape clears the selection class', await page.locator('.atlas-selected').count() === 0);
  check('…and undims the map', await page.evaluate(() => !document.querySelector('.atlas-map').classList.contains('atlas-has-selection')));
  check('…and restores the panel placeholder', await page.locator('#board-panel .atlas-panel-empty').count() === 1);
  check('…and Escape is NOT ledgered', (await audit()).length === auditBeforeEsc, `${auditBeforeEsc} -> ${(await audit()).length}`);

  // no scroll hijack — a new ledger row scrolls the LEDGER, not the reader.
  // Pad the ledger past its 300px max-height first: post-corrupt-snapshot
  // (block 5 reset it to just the boot row) a single new row would not
  // overflow the box, and the mechanism this checks only fires on overflow.
  for (const id of ['h-model', 'h-selection', 'm-selection', 'm-time', 'c-values', 'c-industry', 'e-tsukin', 'e-kaji', 'q-share']) {
    await call('focus_node', { node_id: id });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => document.querySelector('[data-node="c-marriage"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(300);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  check('a map click does not scroll the page out from under the reader', scrollBefore === 0 && scrollAfter === 0, `scrollY ${scrollBefore} -> ${scrollAfter}`);
  check('…because the ledger scrolled its own box instead', await page.evaluate(() => {
    const l = document.querySelector('#board-ledger');
    return l.scrollHeight > l.clientHeight && l.scrollTop >= l.scrollHeight - l.clientHeight - 2;
  }));
  // background click deselects (mouse equivalent of Escape)
  await page.evaluate(() => document.querySelector('.atlas-map').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(120);
  check('a click on empty map background deselects too', await page.locator('.atlas-selected').count() === 0);

  // ======================================================================= 8
  console.log('\n# 8. ledger envelope, actor attribution, pure reads unledgered');
  const REQUIRED_KEYS = ['run', 'time', 'actor', 'kind', 'tool', 'inputs', 'summary', 'board_version', 'result_digest'];
  // Fresh activity for this block's own attribution check — block 5's
  // corrupt-snapshot recovery deliberately wiped the ledger down to its boot
  // row, so block 4's propose/approve rows no longer exist to inspect.
  const propose8 = await call('propose_node', { type: 'question', label: 'e2e block8用の質問', statement: 'アクター帰属テスト用の質問。' });
  await page.locator(`#le-pending-node-${propose8.node_id} .le-btn-approve`).click();
  await page.waitForTimeout(100);
  const log8 = await audit();
  check('every ledger entry carries the full M1 envelope', log8.every((e) => REQUIRED_KEYS.every((k) => k in e)), JSON.stringify(log8[0]));
  check('actors are only human, agent, or system', log8.every((e) => ['human', 'agent', 'system'].includes(e.actor)), [...new Set(log8.map((e) => e.actor))].join(','));
  check('propose_* rows are attributed to the agent (invokeTool default)',
    log8.some((e) => e.tool === 'propose_node' && e.kind === 'proposal' && e.actor === 'agent'), JSON.stringify(log8.filter((e) => e.tool === 'propose_node')));
  check('approve/reject rows are attributed to the human', log8.some((e) => e.tool === 'propose_node' && e.kind === 'approval' && e.actor === 'human'), JSON.stringify(log8.filter((e) => e.kind === 'approval')));
  const rowsBefore8 = await ledgerRows();
  const auditBefore8 = (await audit()).length;
  await call('board_overview', {});
  await call('list_nodes', {});
  await call('get_node', { node_id: 'c-income' });
  await call('get_edges', {});
  await call('get_discoveries', {});
  await call('get_audit_log', {});
  check('all six read tools ledger nothing', (await audit()).length === auditBefore8 && (await ledgerRows()) === rowsBefore8, `${auditBefore8} -> ${(await audit()).length}`);
  const logTool = await call('get_audit_log', {});
  const pageAudit = await audit();
  check('get_audit_log returns the same ledger the page holds, in the same order',
    logTool.entries.length === pageAudit.length && logTool.entries.every((e, i) => e.run === pageAudit[i].run), `${logTool.entries.length} vs ${pageAudit.length}`);
  const auditDesc = await page.evaluate(() => window.LivingEvidenceBoard.tools.find((t) => t.name === 'get_audit_log').description);
  check('get_audit_log calls the digest a checksum, not tamper evidence',
    /non-cryptographic FNV-1a checksum/.test(auditDesc) && /not tamper evidence/.test(auditDesc) && /session-local/.test(auditDesc), auditDesc);
  const overview8 = await call('board_overview', {});
  check('board_overview states the tally-bookkeeping scope', overview8.tally_scope === TALLY_SCOPE, overview8.tally_scope);
  check('board_overview places the page in the suite and suggests a flow',
    overview8.suite_context.you_are_here === 'board' && /index\.html/.test(overview8.suite_context.exemplar) && /atlas\.html/.test(overview8.suite_context.atlas)
    && Array.isArray(overview8.suggested_flow) && overview8.suggested_flow.length >= 3, JSON.stringify(overview8.suggested_flow));

  // ======================================================================= 9
  console.log('\n# 9. no probes, no errors, screenshots');
  const probes = await page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__')));
  check('no window.__* probe hooks', probes.length === 0, probes.join(','));
  check('zero page errors across the whole session', errors.length === 0, errors.join(' | '));

  // demo state for the screenshots: a claim selected so the panel has content
  await call('focus_node', { node_id: 'c-income' });
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(root, 'verify', '_snap_board.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(root, 'verify', '_snap_board_dark.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  console.log('  (screenshots: verify/_snap_board.png, _snap_board_map.png, _snap_board_dark.png)');
  } finally {
    await browser.close();
  }
} finally {
  intentionalKill = true;
  server.kill();
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nboard.e2e.mjs: all green');
