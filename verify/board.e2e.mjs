// Real-browser E2E for the Living Evidence Board (BOARD-SPEC.md) — verify/board.e2e.mjs
//
// Updated under the Codex-review fix round (docs/CODEX-FIX-DIRECTIVE-2, D1-D13):
// get_discoveries -> get_board_diagnostics with enriched {id,label,...} bucket
// objects (incl. the NEW claims_with_contradiction_only_edges state), a
// claim's tally_status -> evidence_edge_state (none/support_only/
// contradiction_only/mixed), ed35 + ed43 removed from the seed (43 -> 41
// edges) with every remaining supports/contradicts seed edge carrying a
// rationale, propose_edge now REJECTS exact duplicates instead of merely
// flagging them, and propose_node's inputSchema is a discriminated oneOf.
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
//     (as amended by D4) with no import of the seed at all. This is the check
//     that actually catches a wrong seed — block 2's seed-derived
//     recomputation agrees with a buggy seed by construction, since both
//     sides read the same buggy data. (Re-proven red-then-green against a
//     flipped ed25 as part of this fix round — see docs/AGENT_SYNC.md.)
//   - block 4 fault-injects an evidence->evidence edge, an evidence node
//     missing its quote, and a duplicate seed edge, and demands all three are
//     REJECTED, naming the matrix / the missing field / the duplicate,
//     before it ever tests the happy path.
//   - block 5 corrupts the localStorage snapshot — both a wholly unreadable
//     one and a structurally-valid one carrying an invalid PENDING edge —
//     and demands a clean boot with only the bad item dropped, never a crash.
//
// Server: python3 -m http.server 8501 --bind 127.0.0.1 (started by this
// script; readiness is polled, not assumed after a fixed delay). Playwright
// comes from the absolute path below — no install.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { computeTally, computeBoardDiagnostics, SEED_VERIFICATION_LABEL, TALLY_SCOPE } from '../lib/board.js';
import { SEED } from '../data/housewife-board-seed.js';


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
  check('the expected 11 tools (get_discoveries renamed to get_board_diagnostics)', JSON.stringify(tools) === JSON.stringify([
    'board_overview', 'list_nodes', 'get_node', 'get_edges', 'get_board_diagnostics',
    'propose_node', 'propose_edge', 'focus_node', 'set_topic', 'export_board', 'get_audit_log',
  ]), tools.join(','));
  const readOnlyNames = await page.evaluate(() => window.LivingEvidenceBoard.tools.filter((t) => t.readOnly).map((t) => t.name));
  check('the six read tools are declared read-only',
    JSON.stringify(readOnlyNames.sort()) === JSON.stringify(['board_overview', 'get_audit_log', 'get_board_diagnostics', 'get_edges', 'get_node', 'list_nodes'].sort()),
    readOnlyNames.join(','));
  check('every schema is closed (additionalProperties: false)',
    await page.evaluate(() => window.LivingEvidenceBoard.tools.every((t) => t.inputSchema.additionalProperties === false)));
  const proposeNodeSchema = await page.evaluate(() => window.LivingEvidenceBoard.tools.find((t) => t.name === 'propose_node').inputSchema);
  check('propose_node inputSchema is a discriminated oneOf, one branch per node type (D7)',
    Array.isArray(proposeNodeSchema.oneOf) && proposeNodeSchema.oneOf.length === 5
    && proposeNodeSchema.oneOf.every((b) => b.properties && b.properties.type),
    JSON.stringify(proposeNodeSchema));
  const evidenceBranch = proposeNodeSchema.oneOf.find((b) => b.properties.type.const === 'evidence');
  check('the evidence branch requires value/year/kind/cited_as/quote and accepts optional language, translation and locator provenance',
    ['value', 'year', 'kind', 'cited_as', 'quote'].every((f) => evidenceBranch.required.includes(f))
    && ['quote_language', 'quote_translation', 'quote_origin', 'source_locator'].every((f) => f in evidenceBranch.properties)
    && ['quote_language', 'quote_translation', 'quote_origin', 'source_locator'].every((f) => !evidenceBranch.required.includes(f)),
    JSON.stringify(evidenceBranch));
  const agentStatus = await page.evaluate(() => window.LivingEvidenceBoard.state.agent);
  check('WebMCP absent in the test browser, handled gracefully', agentStatus.active === false, JSON.stringify(agentStatus));
  check('registration status is explicitly "absent" (not a silent false)', agentStatus.status === 'absent', JSON.stringify(agentStatus));
  check('absent status reports 0/11 registered', agentStatus.registered === 0 && agentStatus.total === 11, JSON.stringify(agentStatus));
  check('status banner explains the fallback', /Tool console/.test(await page.textContent('#board-status')));
  const pageFraming = (await page.textContent('body')).replace(/\s+/g, ' ');
  check('the page visibly demotes the Board to an experimental, unverified appendix',
    /Living Evidence Board — experimental appendix/.test(await page.textContent('h1'))
    && /unverified conversation-to-graph sandbox/.test(pageFraming)
    && /not part of the Pygmalion meta-analysis, its evidence base, numerical reference checks, or software verification suite/.test(pageFraming),
    pageFraming.slice(0, 700));
  check('the page says human acceptance is local graph inclusion, not scientific verification',
    /Human approval means accepted onto this local board/.test(pageFraming)
    && /does not verify the source, quote, edge, or claim/.test(pageFraming),
    pageFraming.slice(0, 1000));
  check('the default visible Board presentation is English',
    !/[ぁ-んァ-ヶ一-龯]/.test(pageFraming), pageFraming.match(/[ぁ-んァ-ヶ一-龯].{0,80}/)?.[0] || '');
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
  check('41 seed edges rendered (D4: ed35 and ed43 removed, 43 -> 41)', edgeCount === 41, String(edgeCount));
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
  check('every evidence node carries machine-readable quote status + cited_as + the seed verification label',
    listedEvidence.nodes.every((n) => ['available', 'not_available'].includes(n.quote_status) && typeof n.cited_as === 'string' && n.cited_as.length > 0 && n.verification === SEED_VERIFICATION_LABEL),
    JSON.stringify(listedEvidence.nodes.find((n) => !['available', 'not_available'].includes(n.quote_status) || !n.cited_as || n.verification !== SEED_VERIFICATION_LABEL)));
  const japaneseQuoteEvidence = listedEvidence.nodes.filter((n) => n.quote_language === 'ja');
  check('all 22 Japanese seed quotations carry a separate English translation',
    japaneseQuoteEvidence.length === 22 && japaneseQuoteEvidence.every((n) => n.quote_status === 'available' && typeof n.quote === 'string' && n.quote.length > 0 && typeof n.quote_translation === 'string' && n.quote_translation.trim().length > 0),
    JSON.stringify(japaneseQuoteEvidence.filter((n) => !n.quote_translation).map((n) => n.id)));
  const seedPresentationStrings = SEED.nodes.flatMap((n) => [n.label, n.statement, n.value, n.cited_as, n.test_sketch]).filter(Boolean)
    .concat(SEED.edges.map((e) => e.rationale).filter(Boolean), SEED.topic);
  check('all seed presentation fields and edge rationales are English (original quote fields excluded)',
    seedPresentationStrings.every((s) => !/[ぁ-んァ-ヶ一-龯]/.test(s)),
    seedPresentationStrings.find((s) => /[ぁ-んァ-ヶ一-龯]/.test(s)) || '');

  // [D4] Every remaining supports/contradicts SEED edge (not the live active
  // set, which will pick up e2e's own edgeless-rationale proposals below)
  // must carry a nonempty rationale.
  const seedRationaleOffenders = SEED.edges.filter((e) => (e.type === 'supports' || e.type === 'contradicts') && (!e.rationale || !e.rationale.trim()));
  check('every supports/contradicts SEED edge has a nonempty rationale (D4)', seedRationaleOffenders.length === 0, JSON.stringify(seedRationaleOffenders.map((e) => e.id)));

  const byId = new Map(SEED.nodes.map((n) => [n.id, n]));
  const typeOf = (id) => byId.get(id)?.type;
  const nodeIncome = await call('get_node', { node_id: 'c-income' });
  const expectIncome = computeTally('c-income', SEED.edges, typeOf);
  check('c-income evidence_edge_state matches the independent node-side recomputation',
    nodeIncome.evidence_edge_state === expectIncome.state && nodeIncome.tally_supports === expectIncome.supports && nodeIncome.tally_contradicts === expectIncome.contradicts,
    JSON.stringify({ page: [nodeIncome.evidence_edge_state, nodeIncome.tally_supports, nodeIncome.tally_contradicts], node: [expectIncome.state, expectIncome.supports, expectIncome.contradicts] }));
  check('c-income is mixed (>=1 support AND >=1 contradict — D2 four-state scheme)',
    nodeIncome.evidence_edge_state === 'mixed' && nodeIncome.tally_supports >= 1 && nodeIncome.tally_contradicts >= 1, JSON.stringify(nodeIncome));
  const nodeGap = await call('get_node', { node_id: 'c-gap' });
  const expectGap = computeTally('c-gap', SEED.edges, typeOf);
  check('c-gap evidence_edge_state matches the independent recomputation and is support_only',
    nodeGap.evidence_edge_state === 'support_only' && nodeGap.evidence_edge_state === expectGap.state && nodeGap.tally_supports === expectGap.supports,
    JSON.stringify(nodeGap));
  check('claim tallies carry the bookkeeping scope, verbatim', nodeIncome.tally_scope === TALLY_SCOPE, nodeIncome.tally_scope);
  // a claim with zero evidence edges (proposed fresh, no edges yet) must read "none"
  const freshClaim = await call('propose_node', { type: 'claim', label: 'E2E edge-free claim', statement: 'This claim intentionally has no edges.' });
  await page.locator(`#le-pending-node-${freshClaim.node_id} .le-btn-approve`).click();
  await page.waitForTimeout(100);
  const freshDetail = await call('get_node', { node_id: freshClaim.node_id });
  check('a fresh, edge-less claim reads as "none" (0/0)',
    freshDetail.evidence_edge_state === 'none' && freshDetail.tally_supports === 0 && freshDetail.tally_contradicts === 0, JSON.stringify(freshDetail));
  // clean up: reject is not possible post-approval, so just leave it — it is inert
  // (zero edges, not part of any other assertion) and does not affect the counts below.

  // ======================================================================= 2b
  console.log('\n# 2b. GOLDEN per-claim tally map — literals transcribed from spec §6 (as amended by D4), independent of the page AND the seed module');
  // These are bare literals, NOT derived from data/housewife-board-seed.js —
  // if the seed disagrees with these numbers, the SEED is wrong, not this
  // map (BOARD-SPEC.md §7). Only evidence->claim edges feed a claim's tally
  // (claim->hypothesis and the evidence->hypothesis v1-ruling edges do not),
  // so D4's removal of ed35 (claim->hypothesis) and ed43 (evidence->
  // hypothesis) does not change a single one of these numbers — only their
  // STATE NAMES changed under D2 (supported/contested -> support_only/mixed).
  const GOLDEN_TALLY = {
    'c-gap': { state: 'support_only', supports: 1, contradicts: 0 },
    'c-marriage': { state: 'mixed', supports: 5, contradicts: 1 },
    'c-income': { state: 'mixed', supports: 2, contradicts: 1 },
    'c-grandparent': { state: 'support_only', supports: 3, contradicts: 0 },
    'c-commute': { state: 'support_only', supports: 3, contradicts: 0 },
    'c-values': { state: 'support_only', supports: 2, contradicts: 0 },
    'c-notonly': { state: 'support_only', supports: 1, contradicts: 0 },
    'c-industry': { state: 'support_only', supports: 2, contradicts: 0 },
  };
  const GOLDEN_MIXED = Object.entries(GOLDEN_TALLY).filter(([, g]) => g.state === 'mixed').map(([id]) => id).sort();
  check('the golden mixed set is exactly {c-income, c-marriage} (sanity on the literal itself)',
    JSON.stringify(GOLDEN_MIXED) === JSON.stringify(['c-income', 'c-marriage'].sort()), JSON.stringify(GOLDEN_MIXED));
  const GOLDEN_CONTRADICTION_ONLY = Object.entries(GOLDEN_TALLY).filter(([, g]) => g.state === 'contradiction_only').map(([id]) => id).sort();
  check('the golden contradiction_only set is exactly {} — no seed claim reaches this state (sanity on the literal itself)',
    JSON.stringify(GOLDEN_CONTRADICTION_ONLY) === JSON.stringify([]), JSON.stringify(GOLDEN_CONTRADICTION_ONLY));
  const claimList2b = await call('list_nodes', { type: 'claim' });
  for (const [cid, golden] of Object.entries(GOLDEN_TALLY)) {
    const n = claimList2b.nodes.find((x) => x.id === cid);
    check(`${cid} evidence_edge_state matches the GOLDEN map (${golden.state} ${golden.supports}+/${golden.contradicts}−)`,
      !!n && n.evidence_edge_state === golden.state && n.tally_supports === golden.supports && n.tally_contradicts === golden.contradicts,
      JSON.stringify(n));
  }

  // ======================================================================= 2c
  console.log('\n# 2c. GOLDEN seed evidence values + the FOUR remaining v1-ruling evidence→hypothesis edges');
  const eMukyo = await call('get_node', { node_id: 'e-mukyo' });
  check('e-mukyo value carries 26.4 and 7.3', eMukyo.value.includes('26.4') && eMukyo.value.includes('7.3'), eMukyo.value);
  check('e-mukyo year is 2022', eMukyo.year === 2022, String(eMukyo.year));
  check('e-mukyo cited_as names the Employment Status Survey', eMukyo.cited_as.includes('Employment Status Survey'), eMukyo.cited_as);
  const eJilpt16 = await call('get_node', { node_id: 'e-jilpt16' });
  check('e-jilpt16 value carries all four quartile figures (24.6/24.2/35.7/31.1)',
    ['24.6', '24.2', '35.7', '31.1'].every((s) => eJilpt16.value.includes(s)), eJilpt16.value);
  const e1995 = await call('get_node', { node_id: 'e-1995' });
  check('e-1995 year is 1995 and value carries 50.4 and 31.1',
    e1995.year === 1995 && e1995.value.includes('50.4') && e1995.value.includes('31.1'), JSON.stringify([e1995.year, e1995.value]));
  check('e-1995 label reflects it is a conversation-reported figure (D3)', e1995.label === '1995 homemaker share (reported in the conversation)', e1995.label);
  check('e-1995 quote is EXACTLY the new full verbatim sentence (D3)',
    e1995.quote === 'なんと1995年国勢調査でも、有配偶女性の専業主婦率は、東京 50.4% 福井 31.1%でした。', e1995.quote);
  check('e-1995 identifies the original as Japanese and preserves a separate English translation',
    e1995.quote_language === 'ja'
    && e1995.quote_translation === 'Remarkably, even in the 1995 Population Census, the full-time homemaker share among married women was 50.4% in Tokyo and 31.1% in Fukui.',
    JSON.stringify([e1995.quote_language, e1995.quote_translation]));
  check('e-1995 statement flags the indicator definition and primary table as unconfirmed (D3)',
    /indicator definition and primary census table remain unconfirmed/.test(e1995.statement), e1995.statement);
  const eKyuyo = await call('get_node', { node_id: 'e-kyuyo' });
  check('e-kyuyo machine-readably distinguishes a missing quotation from original source prose',
    eKyuyo.quote_status === 'not_available' && eKyuyo.quote == null && eKyuyo.quote_language == null
    && eKyuyo.quote_translation == null
    && eKyuyo.quote_missing_reason === 'The conversation’s comparison table lists only the number and provides no quotable prose.',
    JSON.stringify(eKyuyo));
  await call('focus_node', { node_id: 'e-kyuyo' });
  const kyuyoPanel = (await page.textContent('#board-panel')).replace(/\s+/g, ' ');
  check('the missing-quotation evidence panel shows status and reason, never an “original quote” label',
    /quote statusnot available/.test(kyuyoPanel) && /quote missing reasonThe conversation/.test(kyuyoPanel)
    && !/quote \(original/.test(kyuyoPanel), kyuyoPanel);

  const edges2c = await call('get_edges', {});
  const hasEdge = (from, to, type) => edges2c.edges.some((e) => e.from === from && e.to === to && e.type === type);
  check('e-kaiki supports h-selection (v1-ruling edge)', hasEdge('e-kaiki', 'h-selection', 'supports'));
  check('e-mikonritsu supports h-selection (v1-ruling edge)', hasEdge('e-mikonritsu', 'h-selection', 'supports'));
  check('e-kyuyo supports h-selection (v1-ruling edge)', hasEdge('e-kyuyo', 'h-selection', 'supports'));
  check('e-ishiki supports h-model (v1-ruling edge)', hasEdge('e-ishiki', 'h-model', 'supports'));
  check('e-1995 -> h-selection contradicts edge is ABSENT (D4: ed43 removed)', !hasEdge('e-1995', 'h-selection', 'contradicts'));
  const activeEdgeCount2c = edges2c.edges.filter((e) => e.status === 'active').length;
  check('41 active seed edges (37 + the FOUR remaining v1-ruling edges)', activeEdgeCount2c === 41, String(activeEdgeCount2c));

  // [D4/D13] ed35 (c-notonly -> h-selection, contradicts) is also gone —
  // verify structurally via get_edges on h-selection: it must carry NO
  // contradicts edges at all any more.
  const hSelectionEdges = await call('get_edges', { node_id: 'h-selection' });
  const hSelectionContradicts = hSelectionEdges.edges.filter((e) => e.to === 'h-selection' && e.type === 'contradicts');
  check('h-selection has ZERO incoming contradicts edges (ed35 and ed43 both removed, D4)',
    hSelectionContradicts.length === 0, JSON.stringify(hSelectionContradicts));

  // ======================================================================= 3
  console.log('\n# 3. get_board_diagnostics — bookkeeping, not truth language (renamed from get_discoveries, D1)');
  const diag = await call('get_board_diagnostics', {});
  const nodeDiag = computeBoardDiagnostics(SEED.nodes, SEED.edges);
  const idsOf = (arr) => arr.map((x) => x.id);
  check('claims_with_mixed_edge_labels includes c-income (matches node-side computeBoardDiagnostics)',
    idsOf(diag.claims_with_mixed_edge_labels).includes('c-income'), JSON.stringify(diag.claims_with_mixed_edge_labels));
  check('every entry in claims_with_mixed_edge_labels carries id/label/support_count/contradict_count (D1 enriched shape)',
    diag.claims_with_mixed_edge_labels.every((x) => typeof x.id === 'string' && typeof x.label === 'string' && Number.isFinite(x.support_count) && Number.isFinite(x.contradict_count)),
    JSON.stringify(diag.claims_with_mixed_edge_labels));
  // Sorted-set EQUALITY against the GOLDEN set from block 2b, not a subset
  // check — the fresh block-2 claim is "none" (not mixed), so equality
  // against the golden {c-income, c-marriage} holds exactly.
  check('claims_with_mixed_edge_labels is EXACTLY {c-income, c-marriage} (sorted-set equality vs the golden)',
    JSON.stringify(idsOf(diag.claims_with_mixed_edge_labels).slice().sort()) === JSON.stringify(GOLDEN_MIXED),
    JSON.stringify({ page: idsOf(diag.claims_with_mixed_edge_labels), golden: GOLDEN_MIXED }));
  check('claims_with_contradiction_only_edges is EXPLICITLY EMPTY on the seed (D1/D13 — the NEW state no seed claim reaches)',
    Array.isArray(diag.claims_with_contradiction_only_edges) && diag.claims_with_contradiction_only_edges.length === 0,
    JSON.stringify(diag.claims_with_contradiction_only_edges));
  check('claims_without_incoming_evidence_edges includes the freshly approved edge-less claim',
    idsOf(diag.claims_without_incoming_evidence_edges).includes(freshClaim.node_id), JSON.stringify(diag.claims_without_incoming_evidence_edges));
  const GOLDEN_SINGLE_CITATION = ['c-gap', 'c-values', 'c-notonly', 'c-industry'].sort();
  check('single_supporting_citation_label_claims is EXACTLY the golden set (sorted-set equality)',
    JSON.stringify(idsOf(diag.single_supporting_citation_label_claims).slice().sort()) === JSON.stringify(GOLDEN_SINGLE_CITATION),
    JSON.stringify({ page: idsOf(diag.single_supporting_citation_label_claims), golden: GOLDEN_SINGLE_CITATION }));
  check('single_supporting_citation_label_claims entries show a nonempty cited_as and their evidence_ids (D1 enriched shape)',
    diag.single_supporting_citation_label_claims.every((x) => typeof x.cited_as === 'string' && x.cited_as.trim().length > 0 && Array.isArray(x.evidence_ids) && x.evidence_ids.length > 0),
    JSON.stringify(diag.single_supporting_citation_label_claims));
  check('single_supporting_citation_label_scope names the string-identity caveat, not a source-independence claim',
    /string-identity/.test(diag.single_supporting_citation_label_scope) && /NOT a source-independence/.test(diag.single_supporting_citation_label_scope),
    diag.single_supporting_citation_label_scope);
  check('hypotheses_without_linked_test_questions matches the seed (both hypotheses are covered)',
    JSON.stringify(idsOf(diag.hypotheses_without_linked_test_questions)) === JSON.stringify(idsOf(nodeDiag.hypotheses_without_linked_test_questions)), JSON.stringify(diag.hypotheses_without_linked_test_questions));
  check('hypotheses_without_linked_test_questions_scope names test-PLAN coverage, not tests performed',
    /test-plan coverage/.test(diag.hypotheses_without_linked_test_questions_scope) && /not tests performed/.test(diag.hypotheses_without_linked_test_questions_scope),
    diag.hypotheses_without_linked_test_questions_scope);
  check('open_questions lists all 3 seed questions with their tested targets',
    diag.open_questions.length === 3
    && diag.open_questions.find((q) => q.question_id === 'q-decompose').targets.includes('h-selection')
    && diag.open_questions.find((q) => q.question_id === 'q-share').targets.includes('h-model'),
    JSON.stringify(diag.open_questions));
  check('unverified_evidence_count is 23 (every evidence node — seed and human-approved alike, D6)', diag.unverified_evidence_count === 23, String(diag.unverified_evidence_count));
  check('a note is present and names bookkeeping, not truth', /bookkeeping/.test(diag.note) && !/is true|is false|proven|disproven/i.test(diag.note), diag.note);
  check('diagnostics carry the tally scope disclaimer', diag.tally_scope === TALLY_SCOPE, diag.tally_scope);
  check('the diagnostics panel on the page renders the same note', (await page.textContent('#board-discoveries')).includes(diag.note));
  check('no truth-adjudication language anywhere in the rendered diagnostics panel',
    !/\b(is true|is false|proven|disproven|confirmed to be)\b/i.test(await page.textContent('#board-discoveries')));

  // ======================================================================= 4
  console.log('\n# 4. propose_node / propose_edge — validation, approval, matrix enforcement, duplicate rejection');
  const noQuote = await callErr('propose_node', { type: 'evidence', label: 'Missing-quote test', statement: 'Test evidence proposed without a quotation.', value: 'x', year: 2026, kind: 'survey', cited_as: 'Test source' });
  check('propose_node evidence without a quote fails, naming the field the schema\'s evidence oneOf branch requires (D7)', /quote/.test(noQuote || ''), noQuote);
  const badQuoteOrigin = await callErr('propose_node', {
    type: 'evidence', label: 'Bad quote-origin test', statement: 'Test evidence with invalid provenance.',
    value: 'x', year: 2026, kind: 'survey', cited_as: 'Test source', quote: 'Test quote.', quote_origin: 'invented',
  });
  check('direct invokeTool enforces the same quote_origin enum advertised by the schema',
    /quote_origin must be one of conversation, primary_source/.test(badQuoteOrigin || ''), badQuoteOrigin);
  const badEdgeShape = await callErr('propose_edge', { from: 'e-mukyo', to: 'e-tfr', type: 'supports' });
  check('evidence -> evidence is rejected by the endpoint/type compatibility matrix, naming it (D5)',
    /not allowed by the endpoint\/type compatibility matrix/.test(badEdgeShape || '') && /evidence→claim/.test(badEdgeShape || ''), badEdgeShape);

  // [D11] An exact (from,to,type) duplicate of an ACTIVE seed edge is
  // REJECTED outright — ed06 (e-mukyo -> c-gap, supports) already exists.
  const dupEdge = await callErr('propose_edge', { from: 'e-mukyo', to: 'c-gap', type: 'supports' });
  check('propose_edge REJECTS an exact duplicate of an active edge, naming it (D11, was: flagged)',
    /duplicate edge/.test(dupEdge || '') && /e-mukyo/.test(dupEdge || '') && /c-gap/.test(dupEdge || ''), dupEdge);

  const versionBefore4 = await boardVersion();
  const rowsBefore4 = await ledgerRows();
  const propNode = await call('propose_node', {
    type: 'evidence', label: 'E2E additional evidence', statement: 'New evidence proposed by the E2E test.',
    value: 'Test value 42%', year: 2026, kind: 'survey', cited_as: 'E2E test source', quote: 'これはE2Eテストの引用文である。',
    quote_language: 'ja', quote_translation: 'This is the E2E test quotation.', source_locator: 'Middle of the conversation log',
  });
  check('a valid propose_node returns pending_human_approval', propNode.status === 'pending_human_approval', JSON.stringify(propNode));
  check('the proposal response distinguishes local acceptance from verification',
    /Human approval adds the node to this local graph/.test(propNode.message)
    && /does not verify any source, quote, edge, or claim/.test(propNode.message),
    propNode.message);
  check('a pending-node card is rendered', await page.locator(`#le-pending-node-${propNode.node_id}`).count() === 1);
  check('the pending action is labelled as local-board acceptance, not scientific approval',
    await page.locator(`#le-pending-node-${propNode.node_id} .le-btn-approve`).textContent() === 'Accept onto local board');
  check('the pending section becomes visible', await page.locator('#pending-section.le-has-pending, #pending-section:has(.le-pending-card)').count() >= 1);
  const pendingDetail = await call('get_node', { node_id: propNode.node_id });
  check('quote_origin defaults to "conversation" when omitted, stored on provenance (D7)',
    pendingDetail.provenance?.quote_origin === 'conversation', JSON.stringify(pendingDetail.provenance));
  check('source_locator is stored on provenance when supplied (D7)',
    pendingDetail.provenance?.source_locator === 'Middle of the conversation log', JSON.stringify(pendingDetail.provenance));
  check('the original quote language and English translation are stored on both node and provenance',
    pendingDetail.quote_status === 'available' && pendingDetail.quote_language === 'ja' && pendingDetail.quote_translation === 'This is the E2E test quotation.'
    && pendingDetail.provenance?.quote_status === 'available' && pendingDetail.provenance?.quote_language === 'ja' && pendingDetail.provenance?.quote_translation === 'This is the E2E test quotation.',
    JSON.stringify(pendingDetail));
  check('a still-pending evidence node has no verification label yet (stamped only on approval, D6)',
    pendingDetail.verification == null, JSON.stringify(pendingDetail.verification));
  await call('focus_node', { node_id: propNode.node_id });
  const pendingPanel = (await page.textContent('#board-panel')).replace(/\s+/g, ' ');
  check('the pending detail panel renders quote provenance and says acceptance is not verification',
    /quote_originconversation/.test(pendingPanel)
    && /source_locatorMiddle of the conversation log/.test(pendingPanel)
    && /quote \(original · ja\)/.test(pendingPanel)
    && /English translationThis is the E2E test quotation/.test(pendingPanel)
    && /acceptance is not verification/.test(pendingPanel),
    pendingPanel);
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
  const approvedEvidence = await call('get_node', { node_id: propNode.node_id });
  check('an approved evidence node gets the D6 session-proposed verification label',
    approvedEvidence.verification === '(proposed this session — not independently verified)', approvedEvidence.verification);

  const versionBeforeEdge = await boardVersion();
  const propEdge2 = await call('propose_edge', { from: propNode.node_id, to: 'c-income', type: 'supports', rationale: 'Rationale supplied by the E2E test.' });
  check('propose_edge now succeeds once its "from" node is approved', propEdge2.status === 'pending_human_approval', JSON.stringify(propEdge2));
  check('the edge proposal response also distinguishes acceptance from verification',
    /Human approval adds the edge to this local graph/.test(propEdge2.message)
    && /does not verify the relation or either endpoint/.test(propEdge2.message),
    propEdge2.message);
  check('the edge action is labelled as local-board acceptance too',
    await page.locator(`#le-pending-edge-${propEdge2.edge_id} .le-btn-approve`).textContent() === 'Accept onto local board');
  const incomeBefore = await call('get_node', { node_id: 'c-income' });
  await page.locator(`#le-pending-edge-${propEdge2.edge_id} .le-btn-approve`).click();
  await page.waitForTimeout(100);
  check('board_version bumped again after the edge approval', (await boardVersion()) === versionBeforeEdge + 1, `${versionBeforeEdge} -> ${await boardVersion()}`);
  const incomeAfter = await call('get_node', { node_id: 'c-income' });
  check('c-income\'s evidence_edge_state recomputed to reflect the newly approved supporting edge',
    incomeAfter.tally_supports === incomeBefore.tally_supports + 1, `${incomeBefore.tally_supports} -> ${incomeAfter.tally_supports}`);
  const diagAfter4 = await call('get_board_diagnostics', {});
  check('get_board_diagnostics reflects the new evidence node in the unverified count (unchanged: every evidence node counts, D6)',
    diagAfter4.unverified_evidence_count === 24, String(diagAfter4.unverified_evidence_count));
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
  const reloadedEvidence = await call('get_node', { node_id: propNode.node_id });
  check('quote language and English translation survive reload',
    reloadedEvidence.quote_language === 'ja' && reloadedEvidence.quote_translation === 'This is the E2E test quotation.',
    JSON.stringify(reloadedEvidence));

  await page.evaluate(() => localStorage.setItem('le-board-v1', '{ this is not json'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.LivingEvidenceBoard && window.LivingEvidenceBoard.tools.length > 0, null, { timeout: 10000 });
  check('a corrupt snapshot boots the clean seed instead of crashing', (await page.locator('#board-map [data-node]').count()) === 40, String(await page.locator('#board-map [data-node]').count()));
  check('board_version resets to 1 after a corrupt-snapshot boot', (await boardVersion()) === 1, String(await boardVersion()));
  check('zero page errors from the corrupt-snapshot recovery', errors.length === 0, errors.join(' | '));

  // A valid pre-translation v1 snapshot has neither quote_language nor
  // quote_translation. It must remain loadable, while the exact old default
  // Japanese topic migrates to the new English seed topic.
  await page.evaluate(() => {
    const snapshot = {
      v: 1,
      topic: '会話で報告された東京の『専業主婦率』は、どの年・母集団・指標定義で他地域より高いのか。差が確認できる場合、経済的選抜・家族構造・時間コストはどこまで説明しうるか（一次資料未照合）',
      approvedNodes: [{
        id: 'e-legacy-v1', type: 'evidence', label: 'Legacy v1 evidence',
        statement: 'A legacy evidence node without translation metadata.', value: '1', year: 2026,
        kind: 'survey', cited_as: 'Legacy source', quote: 'Legacy verbatim quote.', verification: null,
        provenance: { origin: 'proposal', quote: 'Conflicting nested quote.', quote_language: 'xx', quote_translation: 'Conflicting translation.', cited_as: 'Conflicting nested source', proposed_at: new Date().toISOString(), approved_at: new Date().toISOString() },
      }],
      approvedEdges: [], pendingNodes: [], pendingEdges: [], ledger: [], boardVersion: 2, runCounter: 0,
    };
    localStorage.setItem('le-board-v1', JSON.stringify(snapshot));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.LivingEvidenceBoard && window.LivingEvidenceBoard.tools.length > 0, null, { timeout: 10000 });
  const restoredLegacy = await call('get_node', { node_id: 'e-legacy-v1' });
  check('a legacy v1 evidence node without translation metadata is preserved',
    restoredLegacy.quote === 'Legacy verbatim quote.' && restoredLegacy.quote_status === 'available');
  check('restore normalizes nested provenance from validated top-level citation fields',
    restoredLegacy.provenance.quote === restoredLegacy.quote
    && restoredLegacy.provenance.cited_as === restoredLegacy.cited_as
    && restoredLegacy.provenance.quote_language === null
    && restoredLegacy.provenance.quote_translation === null
    && restoredLegacy.provenance.quote_origin === 'conversation',
    JSON.stringify(restoredLegacy.provenance));
  check('the exact old default topic migrates to the new English topic without changing custom topics',
    await page.evaluate(() => window.LivingEvidenceBoard.state.topic) === SEED.topic,
    await page.evaluate(() => window.LivingEvidenceBoard.state.topic));

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
  check('include_json:true adds the json payload with nodes/edges/diagnostics/audit_log (renamed from discoveries, D1)',
    exp2.json && Array.isArray(exp2.json.nodes) && Array.isArray(exp2.json.edges) && exp2.json.diagnostics && Array.isArray(exp2.json.audit_log),
    JSON.stringify(Object.keys(exp2.json || {})));
  // block 5's corrupt-snapshot step reset the board to the clean 40-node seed
  // (that reset IS the point of block 5) — export reflects that clean state.
  check('exported node count matches the current (post-reset) 40-node seed', exp2.json.nodes.length === 40, String(exp2.json.nodes.length));
  const exported1995 = exp2.json.nodes.find((n) => n.id === 'e-1995');
  check('full export preserves original quote, language and English translation separately',
    exported1995.quote_language === 'ja' && exported1995.quote_translation === e1995.quote_translation
    && exported1995.quote === e1995.quote, JSON.stringify(exported1995));
  const exportedKyuyo = exp2.json.nodes.find((n) => n.id === 'e-kyuyo');
  check('full export preserves missing-quotation status without manufacturing quote text',
    exportedKyuyo.quote_status === 'not_available' && exportedKyuyo.quote == null
    && typeof exportedKyuyo.quote_missing_reason === 'string', JSON.stringify(exportedKyuyo));

  // ======================================================================= 7
  console.log('\n# 7. id normalization, focus/Escape/aria, no scroll hijack');
  const bareGet = await call('get_node', { node_id: 'c-income' });
  const typedGet = await call('get_node', { node_id: 'claim:c-income' });
  check('bare and typed node ids resolve to the same node', bareGet.id === typedGet.id && bareGet.evidence_edge_state === typedGet.evidence_edge_state, JSON.stringify([bareGet.id, typedGet.id]));
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
  console.log('\n# 8. ledger envelope, actor attribution, pure reads unledgered, board_overview contract');
  const REQUIRED_KEYS = ['run', 'time', 'actor', 'kind', 'tool', 'inputs', 'summary', 'board_version', 'result_digest'];
  // Fresh activity for this block's own attribution check — block 5's
  // corrupt-snapshot recovery deliberately wiped the ledger down to its boot
  // row, so block 4's propose/approve rows no longer exist to inspect.
  const propose8 = await call('propose_node', { type: 'question', label: 'E2E block 8 question', statement: 'A question used to test actor attribution.' });
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
  await call('get_board_diagnostics', {});
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
  check('board_overview machine-readably marks this as an unverified experimental appendix',
    overview8.page === 'Living Evidence Board — experimental appendix'
    && overview8.status === 'experimental_appendix'
    && overview8.scientific_evidence_status === 'unverified_seed_not_part_of_exemplar'
    && /accepts an item onto this local graph/.test(overview8.approval_semantics)
    && /does not verify its source, quote, edge, or claim/.test(overview8.approval_semantics),
    JSON.stringify({ page: overview8.page, status: overview8.status, scientific_evidence_status: overview8.scientific_evidence_status, approval_semantics: overview8.approval_semantics }));
  check('board_overview places the page in the suite and demotes its own board line',
    overview8.suite_context.you_are_here === 'board' && /index\.html/.test(overview8.suite_context.exemplar) && /atlas\.html/.test(overview8.suite_context.atlas)
    && /board\.html — experimental appendix/.test(overview8.suite_context.board)
    && /unverified conversation-to-graph sandbox/.test(overview8.suite_context.board)
    && /not part of the exemplar/.test(overview8.suite_context.board) && /numerical\/software verification/.test(overview8.suite_context.board),
    JSON.stringify(overview8.suite_context));
  check('board_overview.suggested_flow is the fixed five-step sequence (D8): propose -> approve node -> propose edge -> approve edge -> diagnostics again',
    Array.isArray(overview8.suggested_flow) && overview8.suggested_flow.length >= 3, JSON.stringify(overview8.suggested_flow));
  // [D8/D13] The pre-fix flow had ONE step that named both propose_node and
  // propose_edge together ("propose_node / propose_edge with a quote — the
  // human approves") — an agent following it literally would call
  // propose_edge on a node that isn't approved yet and hit an error. No
  // single step string may combine the two verbs any more, and whichever
  // step first mentions propose_edge must come AFTER a step that says to
  // approve the node.
  const flowStrings = overview8.suggested_flow;
  check('no suggested_flow step proposes an edge in the same breath as proposing a node (D8, was broken)',
    flowStrings.every((s) => !(/propose_node/.test(s) && /propose_edge/.test(s))), JSON.stringify(flowStrings));
  const approveNodeStepIdx = flowStrings.findIndex((s) => /approve it/.test(s));
  const proposeEdgeStepIdx = flowStrings.findIndex((s) => /propose_edge/.test(s));
  check('the propose_edge step comes AFTER a step telling the agent to get the node approved first (D8)',
    approveNodeStepIdx !== -1 && proposeEdgeStepIdx !== -1 && proposeEdgeStepIdx > approveNodeStepIdx,
    JSON.stringify({ approveNodeStepIdx, proposeEdgeStepIdx, flowStrings }));
  check('board_overview.suggested_fast_path is board_overview -> get_board_diagnostics -> focus_node (D8)',
    JSON.stringify(overview8.suggested_fast_path) === JSON.stringify(['board_overview', 'get_board_diagnostics', 'focus_node {"node_id":"c-income"}']),
    JSON.stringify(overview8.suggested_fast_path));
  check('board_overview honesty text describes active edges, endpoint/type compatibility, and the reload/board_version contract (D5/D9/D12)',
    overview8.honesty.some((s) => /endpoint\/type compatibility matrix/.test(s))
    && overview8.honesty.some((s) => /human approval/.test(s) && /not.*approved in this session/.test(s))
    && overview8.honesty.some((s) => /localStorage/.test(s) && /board_version increments ONLY/.test(s)),
    JSON.stringify(overview8.honesty));
  check('board_overview honesty explicitly excludes the Board from scientific verification and denies verification by approval',
    overview8.honesty.some((s) => /Experimental appendix/.test(s) && /not part of the Pygmalion meta-analysis/.test(s) && /software verification suite/.test(s))
    && overview8.honesty.some((s) => /Approval accepts an item onto this local graph/.test(s) && /does not verify/.test(s)),
    JSON.stringify(overview8.honesty));

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
