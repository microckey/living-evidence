// living-evidence.js — runtime for the Living Evidence document format.
//
// A Living Evidence page is one HTML document with two first-class readers:
//   - humans read the prose and figures;
//   - the reader's own AI agent interrogates the same document through WebMCP tools.
// Everything the agent does is rendered back INTO the page (figures, claim badges,
// an audit ledger), so the human watches the cross-examination happen on the
// document itself.
//
// Design rules of the format:
//   1. THE PAGE COMPUTES, THE AGENT JUDGES — all numbers come from page code.
//   2. Every tool call is logged to a visible, append-only audit ledger.
//   3. The evidence base only changes through HUMAN APPROVAL — agents can propose
//      a study, never silently include one.
//   4. Claims are addressable (ids) and machine-checkable (deterministic rules)
//      expressed as DATA — a declarative AST, never a function (see claim-rules.js).
//
// Two modes share this runtime:
//   - 'document' (default): a finished living article, prose first (index.html).
//   - 'workspace': the format turned on itself — an empty page where an agent
//     proposes the evidence, a human approves it, claims are added as data, the
//     session survives a reload, and the result is EXPORTED as a self-contained
//     single-file document of exactly the same format (workspace.html).

import {
  metaAnalyze, leaveOneOut, subgroupAnalysis, metaRegression, eggerTest, cumulativeMeta,
} from './meta-stats.js';
import { forestPlot, looPlot, funnelPlot, moderatorPlot } from './meta-plots.js';
import { fnv1a, evaluateRules, validateTest } from './claim-rules.js';

const $ = (sel) => document.querySelector(sel);

function h(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) n.appendChild(c);
  return n;
}

function fmt(x, d = 3) { return typeof x === 'number' ? x.toFixed(d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : String(x); }

/** Claim ids end up inside a [data-claim="…"] selector, so keep them boring.
 *  Enforced by add_claim AND by the restore path — a snapshot is untrusted input
 *  (it can be hand-edited in devtools), and an id carrying a quote would throw
 *  out of querySelector during boot. */
const CLAIM_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** What a verdict IS, said in the response that carries it. A badge is the output of
 *  one authored rule over one evidence base — an agent that reports it as a finding
 *  about the world is overstating what this document can do. */
const VERDICT_SCOPE = 'authored statistical rule only — not an independent judgment of truth, validity, or bias';

// ---------- single-file export helpers (workspace mode) ----------

function htmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** JSON safe to paste inside a <script> element: no '<', no line separators. */
function jsonScriptLiteral(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * Turn an ES module source into a fragment that can be concatenated with its
 * siblings inside ONE inline <script type="module">: drop the import statements
 * (the modules are being inlined side by side, so the bindings are already in
 * scope) and demote the export keyword. Deliberately dumb and auditable — the
 * four files it is applied to are ours, and their import forms are the two the
 * regexes below cover.
 */
function stripModuleSyntax(src) {
  return String(src)
    .replace(/^import\s[^;]*?;\s*$/gm, '')
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']*';\s*$/gm, '')
    .replace(/^export\s+(function|const)/gm, '$1');
}

export function initLivingEvidence(config) {
  const mode = config.mode === 'workspace' ? 'workspace' : 'document';
  const isWorkspace = mode === 'workspace';
  const storageKey = isWorkspace ? (config.storageKey || null) : null;
  // Title and hypothesis are fixed prose in a document, but editable state in a
  // workspace (set_hypothesis), so they live here rather than being read off the
  // config object on every call.
  const doc = { title: config.title, hypothesis: config.hypothesis };

  const state = {
    mode,
    // Records that already carry provenance keep it: an EXPORTED document ships the
    // approval provenance (source, quote, hashes) of every record it was built from,
    // and overwriting that with a generic label would be a lie about where it came from.
    base: config.dataset.studies.map((s) => ({ ...s, provenance: s.provenance ?? 'original evidence base' })),
    approved: [],
    pending: [],   // {study, status: 'pending'|'approved'|'rejected', proposal}
    audit: [],
    runCounter: 0,
    // Version of the evidence base itself: 1 at boot, +1 on every human approval.
    // A verdict evaluated at an older version is STALE — that is machine-readable,
    // not a CSS afterthought.
    evidenceVersion: 1,
    claimStatus: new Map(), // id -> {verdict, run, evaluated_version}
    agent: { active: false, status: 'absent', detail: 'not initialized' },
  };
  const included = () => state.base.concat(state.approved);

  // Claims are data. A `check()` function would be un-auditable and un-exportable,
  // so it is now a hard error rather than a silently different code path.
  const claims = (config.claims || []).map((c) => {
    if (!c || typeof c !== 'object' || !c.id) throw new Error('every entry of config.claims needs an id');
    if (typeof c.check === 'function') {
      throw new Error(`claim ${c.id}: check() functions are no longer supported — give the claim a declarative "test" AST (see lib/claim-rules.js)`);
    }
    validateTest(c.test, `claim ${c.id}`);
    return c;
  });

  const mounts = {
    workbench: $(config.mounts?.workbench || '#le-workbench'),
    ledger: $(config.mounts?.ledger || '#le-ledger'),
    pending: $(config.mounts?.pending || '#le-pending'),
    status: $(config.mounts?.status || '#le-status'),
    mainFigure: $(config.mounts?.mainFigure || '#le-main-figure'),
    console: $(config.mounts?.console || '#le-console'),
    // workspace-only mounts; null in a document, and every use is guarded
    hypothesis: $(config.mounts?.hypothesis || '#le-hypothesis'),
    claimsList: $(config.mounts?.claimsList || '#le-claims-list'),
    reset: $(config.mounts?.reset || '#le-reset'),
  };

  // ---------- audit ledger ----------
  // Who is calling right now. invokeTool sets it for the duration of one call, so
  // analyses nested inside a claim evaluation inherit the true actor instead of
  // guessing. Ledger entries may still name an actor explicitly (boot = system,
  // approval buttons = human).
  let currentActor = 'agent';

  /** Render one ledger entry as a row. Used live AND when replaying a restored
   *  ledger — a restored row keeps its original run number and actor; the page
   *  never re-ledgers history it merely reloaded. */
  function renderLedgerRow(entry) {
    if (!mounts.ledger) return null;
    const row = h('li', {
      class: `le-ledger-row le-${entry.actor}`,
      title: `digest ${entry.result_digest || '—'} · inputs ${JSON.stringify(entry.inputs)}`,
    }, [
      h('span', { class: 'le-run', text: `#${entry.run}` }),
      h('span', { class: 'le-actor', text: String(entry.actor).toUpperCase() }),
      h('span', { class: 'le-summary', text: entry.summary }),
    ]);
    mounts.ledger.appendChild(row);
    return row;
  }

  /**
   * Append one structured entry to the visible, append-only ledger.
   * Envelope: {run, time, actor, kind, tool, inputs, summary, evidence_version, result_digest}
   * `result_digest` fingerprints the deterministic payload of the event (the
   * statistics, the verdict, the proposal record) — not the session-local run id
   * or figure id, so the same evidence base digests identically across sessions.
   */
  function ledger({ kind, tool, summary, actor = null, inputs = null, result = undefined }) {
    const n = ++state.runCounter;
    const who = actor || currentActor;
    const entry = {
      run: n,
      time: new Date().toISOString(),
      actor: who,
      kind,
      tool,
      inputs: inputs == null ? {} : inputs,
      summary,
      evidence_version: state.evidenceVersion,
      result_digest: result === undefined ? null : fnv1a(JSON.stringify(result)),
    };
    state.audit.push(entry);
    const row = renderLedgerRow(entry);
    // Scroll the LEDGER's own box, never the page. row.scrollIntoView() walks every
    // scrollable ancestor including the document, so an action taken while the
    // ledger is off-screen yanked the reader away from what they were doing. The
    // ledger is `overflow-y: auto`; that is the box to move.
    if (row && mounts.ledger) mounts.ledger.scrollTop = mounts.ledger.scrollHeight;
    // Every ledgered event is a state change worth surviving a reload; a workspace
    // snapshots itself here so no mutation path can forget to.
    persist();
    return n;
  }

  // ---------- persistence (workspace mode) ----------
  // A workspace is a working session, not an article: it must survive a reload.
  // Documents persist nothing — their evidence base ships inside the file.

  /** Everything needed to reconstruct the session, including the ledger itself. */
  function snapshot() {
    return {
      v: 1,
      title: doc.title,
      hypothesis: doc.hypothesis,
      approved: state.approved,
      pending: state.pending,
      claims: claims.map((c) => ({ id: c.id, statement: c.statement, rule: c.rule, test: c.test })),
      claimStatus: [...state.claimStatus],
      ledger: state.audit,
      evidenceVersion: state.evidenceVersion,
      runCounter: state.runCounter,
    };
  }

  function persist() {
    if (!isWorkspace || !storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot()));
    } catch (e) {
      // Private mode, quota, or a disabled storage partition. A workspace that
      // cannot save is still a usable workspace — it just forgets on reload.
      console.warn('[living-evidence] could not save the workspace:', e.message);
    }
  }

  function clearPersisted() {
    if (!storageKey) return;
    try { localStorage.removeItem(storageKey); } catch (e) { /* nothing we can do */ }
  }

  // ---------- figures ----------
  function renderFigure(run, title, svg, caption) {
    if (!mounts.workbench) return null;
    const id = `le-fig-run${run}`;
    const fig = h('figure', { class: 'le-figure', id }, [
      h('figcaption', {}, [
        h('span', { class: 'le-fig-run', text: `run #${run}` }),
        h('span', { class: 'le-fig-title', text: title }),
        caption ? h('span', { class: 'le-fig-caption', text: caption }) : h('span'),
      ]),
      svg,
    ]);
    mounts.workbench.prepend(fig);
    mounts.workbench.closest('section')?.classList.add('le-has-figures');
    return id;
  }

  function studyRows(studies, tau2) {
    return studies.map((s) => ({
      label: `${s.author} (${s.year})${s.provenance !== 'original evidence base' ? ' †' : ''}`,
      yi: s.yi, lo: s.yi - 1.96 * Math.sqrt(s.vi), hi: s.yi + 1.96 * Math.sqrt(s.vi),
      weight: 1 / (s.vi + (tau2 || 0)),
    }));
  }

  // ---------- headline (main figure + bound stats) ----------
  const EMPTY_NOTE = 'evidence base empty — agents can propose studies; you approve them';

  /**
   * Re-render the main figure and every `data-le-bind` span.
   * Returns the fit, or null when there is nothing to pool: a workspace legitimately
   * starts empty, and an empty page is a state to render, not an exception to throw.
   * (Tools that genuinely need k>=2 still throw their normal errors.)
   */
  function refreshHeadline() {
    const studies = included();
    if (studies.length < 2) {
      const note = studies.length === 0
        ? EMPTY_NOTE
        : `only ${studies.length} study approved so far — pooling needs at least 2 (${EMPTY_NOTE})`;
      if (mounts.mainFigure) mounts.mainFigure.replaceChildren(h('p', { class: 'le-empty-note', text: note }));
      document.querySelectorAll('[data-le-bind]').forEach((elm) => {
        const path = elm.getAttribute('data-le-bind');
        elm.textContent = path === 'k' ? String(studies.length) : '—';
      });
      return null;
    }
    const fit = metaAnalyze(studies, { method: 'REML' });
    if (mounts.mainFigure) {
      mounts.mainFigure.replaceChildren(
        forestPlot(studyRows(studies, fit.tau2), {
          label: `RE model (k=${fit.k})`, est: fit.estimate, lo: fit.ci_lower, hi: fit.ci_upper,
        }),
      );
    }
    document.querySelectorAll('[data-le-bind]').forEach((elm) => {
      const path = elm.getAttribute('data-le-bind');
      const map = {
        k: fit.k, estimate: fmt(fit.estimate), ci: `[${fmt(fit.ci_lower)}, ${fmt(fit.ci_upper)}]`,
        p: fmt(fit.p), I2: `${fmt(fit.I2, 1)}%`, tau2: fmt(fit.tau2, 4),
        Q: fmt(fit.Q, 2), Q_p: fmt(fit.Q_p, 4),
      };
      if (path in map) elm.textContent = String(map[path]);
    });
    return fit;
  }

  // ---------- claim badges ----------
  const isStale = (st) => !!st && st.evaluated_version < state.evidenceVersion;

  /** Badge staleness is derived from evidence_version — one source of truth. */
  function refreshStaleBadges() {
    for (const [id, st] of state.claimStatus) {
      const chip = document.querySelector(`[data-claim="${id}"] .le-chip`);
      if (!chip) continue;
      const stale = isStale(st);
      chip.classList.toggle('le-chip-stale', stale);
      chip.setAttribute('title', stale
        ? `Evidence base changed after this verdict (evaluated at evidence version ${st.evaluated_version}, now ${state.evidenceVersion}) — re-evaluate`
        : `Verdict from run #${st.run}, evidence version ${st.evaluated_version}`);
    }
  }

  /** Draw (or redraw) one verdict badge. Separate from setClaimStatus because a
   *  restored session repaints badges it did NOT just compute. */
  function paintClaimBadge(claimId, verdict, run) {
    const span = document.querySelector(`[data-claim="${claimId}"]`);
    if (!span) return;
    span.querySelector('.le-chip')?.remove();
    const label = { supported: '✓ supported', challenged: '✗ challenged', nuanced: '△ nuanced' }[verdict] || verdict;
    span.appendChild(h('sup', { class: `le-chip le-chip-${verdict}`, text: `${label} · run #${run}` }));
    span.classList.add('le-claim-tested');
  }

  function setClaimStatus(claimId, verdict, run) {
    state.claimStatus.set(claimId, { verdict, run, evaluated_version: state.evidenceVersion });
    paintClaimBadge(claimId, verdict, run);
    refreshStaleBadges();
    persist();
  }

  /** Workspace only: claims are a list in the page, not spans in prose. */
  function renderClaimsList() {
    if (!mounts.claimsList) return;
    if (claims.length === 0) {
      mounts.claimsList.replaceChildren(h('li', {
        class: 'le-claim-empty',
        text: 'No claims yet — an agent can add one with add_claim, then test it with evaluate_claim.',
      }));
      return;
    }
    mounts.claimsList.replaceChildren(...claims.map((c) => h('li', { class: 'le-claim-item' }, [
      // the statement must be the span's FIRST child: statementOf() reads it back
      h('span', { class: 'le-claim', 'data-claim': c.id, text: c.statement || c.id }),
      h('div', { class: 'le-claim-meta', text: `${c.id} · ${c.rule || 'no rule text'}` }),
    ])));
    for (const [id, st] of state.claimStatus) paintClaimBadge(id, st.verdict, st.run);
    refreshStaleBadges();
  }

  function renderHypothesis() {
    if (mounts.hypothesis) mounts.hypothesis.textContent = doc.hypothesis || '(not set)';
  }

  // ---------- analyses (compute + render + ledger; used by tools AND claim checks) ----------
  const analyses = {
    overall({ method = 'REML', exclude = [] } = {}, { silentFigure = false } = {}) {
      const excluded = new Set(exclude);
      const studies = included().filter((s) => !excluded.has(s.id));
      if (studies.length < 2) throw new Error('fewer than 2 studies after exclusions');
      const fit = metaAnalyze(studies, { method });
      const title = `${fit.model}, k=${fit.k}${exclude.length ? `, excluding ${exclude.join(', ')}` : ''}`;
      const run = ledger({
        kind: 'analysis', tool: 'run_meta_analysis', inputs: { method, exclude }, result: fit,
        summary: `${title} → ${fmt(fit.estimate)} [${fmt(fit.ci_lower)}, ${fmt(fit.ci_upper)}], p=${fmt(fit.p)}`,
      });
      let figure = null;
      if (!silentFigure) {
        figure = renderFigure(run, 'Forest plot', forestPlot(studyRows(studies, fit.tau2), {
          label: 'Pooled', est: fit.estimate, lo: fit.ci_lower, hi: fit.ci_upper,
        }), title);
      }
      return { run, figure, ...fit, excluded: exclude };
    },

    loo() {
      const studies = included();
      const res = leaveOneOut(studies, { method: 'REML' });
      const run = ledger({
        kind: 'analysis', tool: 'leave_one_out', inputs: {}, result: res,
        summary: `leave-one-out (k=${studies.length}) → estimates ${fmt(res.min_estimate)}…${fmt(res.max_estimate)}; significance flips: ${res.flips_significance.length ? res.flips_significance.join(', ') : 'none'}`,
      });
      const figure = renderFigure(run, 'Leave-one-out sensitivity', looPlot(res.rows, res.full_estimate), 'Pooled REML estimate re-fitted with each study omitted');
      return { run, figure, ...res };
    },

    subgroup({ split_field, split_at = null } = {}) {
      const allowed = config.subgroupFields || {};
      if (!(split_field in allowed)) throw new Error(`split_field must be one of: ${Object.keys(allowed).join(', ')}`);
      const spec = allowed[split_field];
      // A threshold on a categorical field cannot do anything — the labeller ignores
      // it. Silently ignoring an argument is how an agent ends up believing it split
      // "setting at 1" and got a meaningful answer.
      if (spec.type !== 'numeric' && split_at !== null && split_at !== undefined) {
        throw new Error(`split_at is only meaningful for numeric fields; ${split_field} is categorical and splits by value — omit split_at`);
      }
      let labelOf;
      if (spec.type === 'numeric') {
        const at = split_at === null ? spec.default_split : split_at;
        labelOf = (s) => (s[split_field] <= at ? `${split_field} ≤ ${at}` : `${split_field} > ${at}`);
      } else {
        labelOf = (s) => `${split_field} = ${s[split_field]}`;
      }
      const res = subgroupAnalysis(included(), labelOf, { method: 'REML' });
      const groupLine = res.groups.filter((g) => g.estimate !== undefined)
        .map((g) => `${g.group}: ${fmt(g.estimate)} (p=${fmt(g.p)})`).join(' | ');
      const run = ledger({
        kind: 'analysis', tool: 'subgroup_analysis', inputs: { split_field, split_at }, result: res,
        summary: `subgroups by ${split_field} → ${groupLine}`,
      });
      // figure: forest of group summaries
      const rows = res.groups.filter((g) => g.estimate !== undefined)
        .map((g) => ({ label: `${g.group} (k=${g.k})`, yi: g.estimate, lo: g.ci_lower, hi: g.ci_upper, weight: 1 / (g.se * g.se) }));
      const figure = renderFigure(run, 'Subgroup analysis', forestPlot(rows, null, { xlab: 'Pooled SMD per subgroup' }),
        res.between_group_test ? `between-group Q=${res.between_group_test.Q_between} (df ${res.between_group_test.df}), p=${fmt(res.between_group_test.p, 4)}` : '');
      return { run, figure, ...res };
    },

    metareg({ moderator, cap = null } = {}) {
      const allowed = config.moderators || {};
      if (!(moderator in allowed)) throw new Error(`moderator must be one of: ${Object.keys(allowed).join(', ')}`);
      // The cap is an AUTHORED modelling choice that only has a published referent for
      // weeks (Raudenbush's min(weeks,3)). Capping calendar year, or capping at 0,
      // would fit something nobody meant — refuse rather than return a number.
      if (cap !== null && cap !== undefined) {
        if (!Number.isFinite(cap) || cap <= 0) throw new Error(`cap must be a number > 0 (got ${cap})`);
        if (moderator !== 'weeks') throw new Error(`cap is only accepted for moderator "weeks" (the published min(weeks, 3) model); drop cap to regress on ${moderator} untruncated`);
      }
      const xOf = (s) => (cap === null || cap === undefined ? s[moderator] : Math.min(s[moderator], cap));
      const res = metaRegression(included(), xOf);
      const capNote = cap === null ? moderator : `min(${moderator}, ${cap})`;
      const run = ledger({
        kind: 'analysis', tool: 'meta_regression', inputs: { moderator, cap }, result: res,
        summary: `meta-regression on ${capNote} → slope ${fmt(res.moderator.b)} (p=${fmt(res.moderator.p, 5)}), R²=${res.R2_percent === null ? 'n/a' : fmt(res.R2_percent, 1) + '%'}`,
      });
      const figure = renderFigure(run, 'Meta-regression', moderatorPlot(included(), xOf, res, { xlab: capNote }),
        `slope ${fmt(res.moderator.b)} [${fmt(res.moderator.ci_lower)}, ${fmt(res.moderator.ci_upper)}]; residual heterogeneity QE p=${fmt(res.QE_p, 4)}`);
      return { run, figure, moderator_field: capNote, ...res };
    },

    funnel() {
      const studies = included();
      const fe = metaAnalyze(studies, { method: 'FE' });
      const res = eggerTest(studies);
      const run = ledger({
        kind: 'analysis', tool: 'funnel_check', inputs: {}, result: res,
        summary: `Egger's test → intercept ${fmt(res.intercept)}, p=${fmt(res.p, 4)} (${res.asymmetry_detected ? 'asymmetry detected' : 'no significant asymmetry'})`,
      });
      const figure = renderFigure(run, 'Funnel plot', funnelPlot(studies, fe.estimate), `pseudo-95% CI funnel around the fixed-effect estimate; Egger p=${fmt(res.p, 4)}`);
      return { run, figure, ...res };
    },

    cumulative() {
      const res = cumulativeMeta(included(), { method: 'REML' });
      const run = ledger({
        kind: 'analysis', tool: 'cumulative_meta', inputs: {}, result: res,
        summary: `cumulative meta-analysis by year (${res.rows.length} steps); final ${fmt(res.rows[res.rows.length - 1].estimate)}`,
      });
      const rows = res.rows.map((r) => ({ label: `+ ${r.upto} (k=${r.k})`, yi: r.estimate, lo: r.ci_lower, hi: r.ci_upper, weight: 1 }));
      const figure = renderFigure(run, 'Cumulative meta-analysis', forestPlot(rows, null, { xlab: 'Pooled SMD as evidence accumulates' }), 'studies added in publication-year order');
      return { run, figure, ...res };
    },
  };

  // ---------- pending studies / human approval ----------
  /**
   * Reveal the proposals section while cards are waiting. In a workspace the
   * section also hides itself again once the last card has been decided — that
   * loop runs constantly there. A document keeps v0.1's behaviour (the class
   * stays once set) so the published exemplar renders exactly as before.
   */
  function syncPendingSection() {
    const section = mounts.pending?.closest('section');
    if (!section) return;
    if (mounts.pending.querySelector('.le-pending-card')) section.classList.add('le-has-pending');
    else if (isWorkspace) section.classList.remove('le-has-pending');
  }

  function renderPendingCard(item) {
    if (!mounts.pending) return;
    const s = item.study;
    const card = h('div', { class: 'le-pending-card', id: `le-pending-${s.id}` }, [
      h('div', { class: 'le-pending-head', text: `Proposed study: ${s.author} (${s.year})` }),
      h('table', { class: 'le-pending-table' }, [
        h('tbody', {}, [
          ['effect (yi)', fmt(s.yi)], ['variance (vi)', fmt(s.vi, 4)], ['prior contact (weeks)', s.weeks],
          ['setting / tester', `${s.setting || '—'} / ${s.tester || '—'}`],
          ['n (expectancy / control)', `${s.n1i ?? '—'} / ${s.n2i ?? '—'}`],
          ['source', item.proposal.source], ['supporting quote', item.proposal.quote || '—'],
          ['derivation', item.proposal.derivation || '— (reported directly)'],
        ].map(([k, v]) => h('tr', {}, [h('th', { text: k }), h('td', { text: String(v) })]))),
      ]),
      h('div', { class: 'le-pending-note', text: 'An agent proposed this study. It is NOT part of the evidence base until a human approves it.' }),
      h('div', { class: 'le-pending-actions' }, [
        h('button', {
          class: 'le-btn le-btn-approve', text: 'Approve & include',
          onclick: () => {
            item.status = 'approved';
            // The approved record carries structured provenance: where it came from,
            // the quote the numbers were read out of, and the hash of the numbers
            // themselves — so a later reader can check nothing drifted.
            item.proposal.approved_at = new Date().toISOString();
            s.provenance = {
              source: item.proposal.source,
              quote: item.proposal.quote,
              derivation: item.proposal.derivation ?? null,
              proposed_at: item.proposal.proposed_at,
              approved_at: item.proposal.approved_at,
              record_hash: item.proposal.record_hash,
            };
            state.approved.push(s);
            card.remove();
            syncPendingSection();
            state.evidenceVersion += 1;
            ledger({
              kind: 'approval', tool: 'propose_study', actor: 'human',
              inputs: { study_id: s.id, decision: 'approved', record_hash: item.proposal.record_hash },
              result: { decision: 'approved', study_id: s.id, record_hash: item.proposal.record_hash, k: included().length, evidence_version: state.evidenceVersion },
              summary: `human APPROVED ${s.author} (${s.year}) [${item.proposal.record_hash}] — evidence base now k=${included().length}, evidence version ${state.evidenceVersion}`,
            });
            const fit = refreshHeadline();
            // fit is null while a workspace still holds fewer than 2 studies —
            // there is no forest plot to draw yet, and that is not an error.
            if (fit) {
              renderFigure(state.runCounter, 'Updated forest plot', forestPlot(studyRows(included(), fit.tau2), {
                label: 'Pooled', est: fit.estimate, lo: fit.ci_lower, hi: fit.ci_upper,
              }), `evidence base updated: k=${fit.k}, pooled ${fmt(fit.estimate)} [${fmt(fit.ci_lower)}, ${fmt(fit.ci_upper)}], p=${fmt(fit.p)}`);
            }
            refreshStaleBadges();
            persist();
          },
        }),
        h('button', {
          class: 'le-btn le-btn-reject', text: 'Reject',
          onclick: () => {
            item.status = 'rejected';
            card.remove();
            syncPendingSection();
            ledger({
              kind: 'approval', tool: 'propose_study', actor: 'human',
              inputs: { study_id: s.id, decision: 'rejected', record_hash: item.proposal.record_hash },
              result: { decision: 'rejected', study_id: s.id, record_hash: item.proposal.record_hash },
              summary: `human REJECTED ${s.author} (${s.year})`,
            });
          },
        }),
      ]),
    ]);
    mounts.pending.appendChild(card);
    syncPendingSection();
  }

  function proposeStudy(args) {
    // source AND quote are both required: a number without the sentence it was read
    // out of is not evidence, it is a rumour with a citation.
    const required = ['author', 'year', 'yi', 'vi', 'weeks', 'source', 'quote'];
    for (const f of required) {
      if (args[f] === undefined || args[f] === null || args[f] === '') {
        throw new Error(`missing required field: ${f}${f === 'quote' ? ' — quote the sentence, table cell or figure caption the numbers come from' : ''}`);
      }
    }
    const year = Number(args.year), yi = Number(args.yi), vi = Number(args.vi), weeks = Number(args.weeks);
    // These mirror the input schema exactly: a runtime that accepted 1985.5 or a
    // fractional group size would make the schema a suggestion rather than a contract.
    if (!Number.isInteger(year) || year < 1900 || year > 2100) throw new Error('year must be a whole year between 1900 and 2100');
    if (!Number.isFinite(yi) || Math.abs(yi) > 10) throw new Error('yi must be a finite SMD (|yi| <= 10)');
    if (!Number.isFinite(vi) || vi <= 0 || vi > 10) throw new Error('vi must be a positive sampling variance');
    if (!Number.isFinite(weeks) || weeks < 0 || weeks > 500) throw new Error('weeks out of range');
    for (const f of ['n1i', 'n2i']) {
      if (args[f] === undefined || args[f] === null || args[f] === '') continue;
      const n = Number(args[f]);
      if (!Number.isInteger(n) || n < 1) throw new Error(`${f} must be a whole sample size of at least 1`);
    }
    if (args.derivation !== undefined && args.derivation !== null && typeof args.derivation !== 'string') {
      throw new Error('derivation must be a string describing how yi/vi were derived');
    }
    if (args.setting && !['group', 'indiv'].includes(args.setting)) throw new Error("setting must be 'group' or 'indiv'");
    if (args.tester && !['aware', 'blind'].includes(args.tester)) throw new Error("tester must be 'aware' or 'blind'");
    const candidates = included().concat(state.pending.filter((p) => p.status === 'pending').map((p) => p.study));
    const dup = candidates.find((s) => s.author === args.author && s.year === year && Math.abs(s.yi - yi) < 1e-9);
    if (dup) throw new Error(`duplicate of existing record ${dup.id} (${dup.author} ${dup.year})`);
    // Same author+year but a DIFFERENT effect size is not automatically a duplicate —
    // one paper can report several independent experiments (see s04/s05 in the base).
    // Flag it for the human instead of silently rejecting real evidence.
    const nearDup = candidates.find((s) => s.author === args.author && s.year === year);

    const id = `p${String(state.pending.length + 1).padStart(2, '0')}`;
    const study = {
      id, author: String(args.author), year, weeks,
      setting: args.setting || null, tester: args.tester || null,
      n1i: args.n1i === undefined || args.n1i === null || args.n1i === '' ? null : Number(args.n1i),
      n2i: args.n2i === undefined || args.n2i === null || args.n2i === '' ? null : Number(args.n2i),
      yi, vi,
      provenance: `agent proposal (${args.source})`,
    };
    // Content hash of the extracted numbers: identifies THIS record independently of
    // ids, sessions or documents, so two documents can tell they hold the same row.
    const record_hash = fnv1a(JSON.stringify({
      author: study.author, year, weeks, setting: study.setting, tester: study.tester,
      n1i: study.n1i, n2i: study.n2i, yi, vi,
    }));
    const item = {
      study,
      status: 'pending',
      proposal: {
        source: String(args.source), quote: String(args.quote),
        // How the numbers were arrived at when the paper did not print them (t → d,
        // means and SDs, a digitised figure). Optional, but it travels with the record.
        derivation: args.derivation === undefined || args.derivation === null || args.derivation === '' ? null : String(args.derivation),
        proposed_at: new Date().toISOString(), record_hash,
      },
    };
    state.pending.push(item);
    const response = {
      status: 'pending_human_approval', study_id: id, record_hash,
      // Always present, null when there is no candidate: an absent key reads as
      // "not checked", and a caller should not have to know which it was.
      possible_duplicate_of: nearDup ? nearDup.id : null,
      message: 'Proposal recorded and shown to the human reader with an Approve/Reject card. It is NOT included in any analysis until approved. Ask the human to review it on the page.'
        + (nearDup ? ` NOTE: ${nearDup.author} (${nearDup.year}) is already in the evidence base with a different effect size — say so when you ask the human to approve this one.` : '')
        + ' Call get_document_overview again after the human approves.',
    };
    ledger({
      kind: 'proposal', tool: 'propose_study',
      inputs: { author: study.author, year, yi, vi, weeks, source: item.proposal.source, quote: item.proposal.quote },
      result: response,
      summary: `agent proposed ${study.author} (${study.year}), yi=${fmt(yi)}, vi=${fmt(vi, 4)} [${record_hash}] — awaiting human approval`,
    });
    renderPendingCard(item);
    return response;
  }

  // ---------- claims ----------
  /** The executor injected into the rule engine: rule data in, page statistics out. */
  function runAnalysisByName(name, args) {
    const fn = analyses[name];
    if (typeof fn !== 'function') {
      throw new Error(`unknown analysis "${name}" — available: ${Object.keys(analyses).join(', ')}`);
    }
    return fn(args || {});
  }

  function statementOf(claim) {
    const span = document.querySelector(`[data-claim="${claim.id}"]`);
    return span ? span.childNodes[0].textContent.trim() : claim.statement || '';
  }

  function evaluateClaim(claimId) {
    const claim = claims.find((c) => c.id === claimId);
    if (!claim) throw new Error(`unknown claim id: ${claimId}. Use list_claims.`);
    const result = evaluateRules(claim.test, runAnalysisByName, `claim ${claim.id}`);
    const evaluatedVersion = state.evidenceVersion;
    const run = ledger({
      kind: 'claim', tool: 'evaluate_claim', inputs: { claim_id: claimId },
      result: { claim_id: claimId, verdict: result.verdict, reason: result.reason },
      summary: `claim ${claimId} → ${result.verdict.toUpperCase()} (${result.reason})`,
    });
    setClaimStatus(claimId, result.verdict, run);
    return {
      claim_id: claimId,
      statement: statementOf(claim),
      verdict: result.verdict,
      status: result.verdict,
      verdict_scope: VERDICT_SCOPE,
      rule: claim.rule,
      machine_check: claim.test,
      reason: result.reason,
      evidence: result.evidence,
      stale: false,
      evaluated_version: evaluatedVersion,
      evidence_version: state.evidenceVersion,
      note: 'The verdict badge is now shown next to the claim in the document. It goes stale (evaluated_version < evidence_version) as soon as a human approves a change to the evidence base.',
    };
  }

  function claimList() {
    return claims.map((c) => {
      const st = state.claimStatus.get(c.id);
      return {
        id: c.id,
        statement: statementOf(c),
        rule: c.rule,
        machine_check: c.test,
        status: st ? st.verdict : 'untested',
        stale: isStale(st),
        evaluated_version: st ? st.evaluated_version : null,
        evidence_version: state.evidenceVersion,
      };
    });
  }

  // ---------- workspace mutations (workspace mode only) ----------

  function setHypothesis(args = {}) {
    if (!isWorkspace) throw new Error('set_hypothesis is only available in workspace mode');
    const text = typeof args.text === 'string' ? args.text.trim() : '';
    // Blank-after-trim is its own rejection, not a "missing field" by accident: a
    // whitespace-only string satisfies minLength in the schema but says nothing.
    if (typeof args.text === 'string' && args.text.length > 0 && !text) {
      throw new Error('missing required field: text — the hypothesis is blank after trimming whitespace');
    }
    if (!text) throw new Error('missing required field: text — the hypothesis this workspace examines');
    if (text.length > 500) throw new Error(`text too long: ${text.length} characters (max 500)`);
    const previous = doc.hypothesis;
    doc.hypothesis = text;
    renderHypothesis();
    ledger({
      kind: 'mutation', tool: 'set_hypothesis', inputs: { text },
      result: { hypothesis: text },
      summary: `hypothesis set: “${text}”`,
    });
    return {
      hypothesis: text, previous,
      note: 'The hypothesis is now shown at the top of the workspace and travels with the exported document.',
    };
  }

  function addClaim(args = {}) {
    if (!isWorkspace) throw new Error('add_claim is only available in workspace mode');
    const statement = typeof args.statement === 'string' ? args.statement.trim() : '';
    if (!statement) throw new Error('missing required field: statement — the sentence a reader would argue about');
    if (statement.length > 300) throw new Error(`statement too long: ${statement.length} characters (max 300)`);
    const rule = typeof args.rule === 'string' ? args.rule.trim() : '';
    if (!rule) throw new Error('missing required field: rule — the human-readable version of the machine check');
    const label = `claim ${args.id ? String(args.id) : '(new)'}`;
    // Shape only: the AST is validated, never dry-run. A claim is added because it
    // is well-formed, not because it happens to pass on today's evidence base.
    validateTest(args.test, label);
    if (!(args.test.analysis in analyses)) {
      throw new Error(`${label}: unknown analysis "${args.test.analysis}" — available: ${Object.keys(analyses).join(', ')}`);
    }
    let id = args.id === undefined || args.id === null || args.id === '' ? null : String(args.id).trim();
    if (id !== null && !CLAIM_ID_RE.test(id)) {
      throw new Error(`claim id "${id}" is not usable — letters, digits, hyphen and underscore only (max 40 characters)`);
    }
    if (id === null) {
      let n = claims.length + 1;
      while (claims.some((c) => c.id === `wc${String(n).padStart(2, '0')}`)) n += 1;
      id = `wc${String(n).padStart(2, '0')}`;
    } else if (claims.some((c) => c.id === id)) {
      throw new Error(`claim id "${id}" already exists — pick another id, or omit id to get one assigned`);
    }
    const claim = { id, statement, rule, test: args.test };
    claims.push(claim);
    renderClaimsList();
    ledger({
      kind: 'mutation', tool: 'add_claim',
      inputs: { claim_id: id, statement, analysis: args.test.analysis },
      result: { claim_id: id, statement, rule, machine_check: args.test },
      summary: `claim ${id} added: “${statement}” (checked by ${args.test.analysis})`,
    });
    return {
      claim_id: id, statement, rule, machine_check: args.test,
      status: 'untested', evidence_version: state.evidenceVersion,
      note: 'The claim is now listed in the document. Run evaluate_claim to give it a visible verdict badge.',
    };
  }

  // ---------- self-contained export (workspace mode only) ----------
  // The recursion made literal: the workspace writes out a Living Evidence document
  // that carries its own data, engine, figures and agent tools — one file, no
  // network, no reference back to this origin.
  const EXPORT_SOURCES = ['meta-stats.js', 'meta-plots.js', 'claim-rules.js', 'living-evidence.js'];

  function provenanceOf(s) {
    const p = s.provenance;
    if (p && typeof p === 'object') return { source: p.source || '', quote: p.quote || '' };
    return { source: typeof p === 'string' ? p : '', quote: '' };
  }

  function buildExportHtml({ css, js, studies, now }) {
    const dataset = {
      id: `${config.dataset.id || 'workspace'}-export`,
      label: config.dataset.label || 'Exported evidence base',
      effect_measure: config.dataset.effect_measure,
      fields: config.dataset.fields || {},
      studies,
    };
    const bootConfig = {
      mode: 'document',
      title: doc.title,
      hypothesis: doc.hypothesis,
      subgroupFields: config.subgroupFields || {},
      moderators: config.moderators || {},
      claims: claims.map((c) => ({ id: c.id, statement: c.statement, rule: c.rule, test: c.test })),
    };
    const claimItems = claims.length
      ? claims.map((c) => `      <li class="le-claim-item"><span class="le-claim" data-claim="${htmlEscape(c.id)}">${htmlEscape(c.statement || c.id)}</span><div class="le-claim-meta">${htmlEscape(c.id)} · ${htmlEscape(c.rule || 'no rule text')}</div></li>`).join('\n')
      : '      <li class="le-claim-empty">This document carries no claims yet.</li>';
    const provRows = studies.map((s) => {
      const p = provenanceOf(s);
      return `          <tr><td>${htmlEscape(s.author)}</td><td>${htmlEscape(s.year)}</td><td>${htmlEscape(fmt(s.yi))}</td><td>${htmlEscape(fmt(s.vi, 4))}</td><td>${htmlEscape(s.weeks ?? '—')}</td><td>${htmlEscape(p.source || '—')}</td><td>${htmlEscape(p.quote || '—')}</td></tr>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(doc.title)}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚖️</text></svg>">
<style>
${css}
/* ---- exported article layout ---- */
html { background: var(--le-paper); }
body { margin: 0; padding: 0 1.2rem 4rem; background: var(--le-paper); color: var(--le-ink);
  font-family: Iowan Old Style, Palatino, Georgia, serif; font-size: 17px; line-height: 1.65; }
main { max-width: 46rem; margin: 0 auto; }
h1 { font-size: 2rem; line-height: 1.2; margin: 2.5rem 0 0.5rem; letter-spacing: -0.01em; }
h2 { font-size: 1.3rem; margin: 2.4rem 0 0.6rem; }
a { color: var(--le-accent); }
p.hypothesis { font-size: 1.05rem; margin: 0.2rem 0 1.2rem; }
p.note { color: var(--le-muted); font-size: 0.88em; }
.stat-line { font-variant-numeric: tabular-nums; }
figure.main { margin: 1.4rem 0; }
details { margin: 1rem 0; border: 1px solid var(--le-border); border-radius: 10px; background: var(--le-card); padding: 0.6rem 1rem; }
summary { cursor: pointer; font-weight: 650; }
table.studies { border-collapse: collapse; font-size: 0.78em; margin: 0.8rem 0; width: 100%; font-variant-numeric: tabular-nums; }
table.studies th, table.studies td { text-align: right; padding: 0.25em 0.6em; border-bottom: 1px solid var(--le-border); vertical-align: top; }
table.studies th:first-child, table.studies td:first-child,
table.studies th:last-child, table.studies td:last-child,
table.studies th:nth-last-child(2), table.studies td:nth-last-child(2) { text-align: left; }
.table-scroll { overflow-x: auto; }
#pending-section { display: none; }
section.le-has-pending#pending-section, #pending-section:has(.le-pending-card) { display: block; }
footer { margin-top: 3.5rem; padding-top: 1.2rem; border-top: 1px solid var(--le-border); color: var(--le-muted); font-size: 0.85em; }
<\/style>
</head>
<body>
<main>
  <header>
    <h1>${htmlEscape(doc.title)}</h1>
    <div class="le-status" id="le-status"><span class="le-status-dot le-off"></span><span>Initializing agent interface…</span></div>
  </header>

  <h2>Hypothesis</h2>
  <p class="hypothesis" id="le-hypothesis">${htmlEscape(doc.hypothesis || '(not set)')}</p>
  <p class="note">This is a <strong>Living Evidence</strong> document: the statistics below are not typeset, they are
  computed in your browser from the study records embedded in this file. If you are reading with a WebMCP-enabled agent,
  it has been handed tools to re-run and cross-examine every number here.</p>

  <h2>Claims</h2>
  <p class="note">Each claim carries a deterministic machine check (readable through <code>list_claims</code>).
  Ask your agent to test one with <code>evaluate_claim</code> — the verdict badge appears here, in the document.</p>
  <ul class="le-claims">
${claimItems}
  </ul>

  <h2>Evidence</h2>
  <p class="stat-line">Across <strong data-le-bind="k">…</strong> studies the pooled random-effects (REML) estimate is
  <strong data-le-bind="estimate">…</strong> ${htmlEscape(dataset.effect_measure || '')}, 95%&nbsp;CI
  <strong data-le-bind="ci">…</strong>, <em>p</em>&nbsp;= <strong data-le-bind="p">…</strong>
  (I²&nbsp;= <span data-le-bind="I2">…</span>, Q&nbsp;= <span data-le-bind="Q">…</span>,
  <em>p</em>&nbsp;= <span data-le-bind="Q_p">…</span>).</p>

  <figure class="main"><div id="le-main-figure"></div></figure>

  <details>
    <summary>Provenance appendix — every record with the text its numbers were read from</summary>
    <div class="table-scroll">
      <table class="studies">
        <thead><tr><th>Study</th><th>Year</th><th>yi</th><th>vi</th><th>weeks</th><th>Source</th><th>Quote</th></tr></thead>
        <tbody>
${provRows}
        </tbody>
      </table>
    </div>
  </details>

  <h2>Reader’s Workbench</h2>
  <div id="le-workbench"></div>

  <section id="pending-section">
    <h2>Proposed changes to the evidence base</h2>
    <div id="le-pending"></div>
  </section>

  <h2>Audit ledger</h2>
  <ol class="le-ledger" id="le-ledger"></ol>

  <h2>Tool console</h2>
  <details>
    <summary>Drive this document’s tools by hand (no agent required)</summary>
    <div id="le-console"></div>
  </details>

  <footer>
    <p>Exported from Living Evidence Workspace, ${htmlEscape(now.toISOString())}. Self-contained: data, statistics
    engine, figures and agent tools all travel inside this one file — it needs no network and no server.</p>
  </footer>
</main>
<script type="module">
${js}

const DATASET = ${jsonScriptLiteral(dataset)};
const EXPORTED_CONFIG = ${jsonScriptLiteral(bootConfig)};
initLivingEvidence({ ...EXPORTED_CONFIG, dataset: DATASET });
<\/script>
</body>
</html>
`;
  }

  async function exportDocument(args = {}) {
    // Capture the caller BEFORE the first await. invokeTool restores currentActor in
    // a synchronous finally block, which runs while this function is still suspended
    // on its fetches — by the time the ledger() call below executes, the ambient
    // actor has already reverted to 'agent'. A human export must stay a human export.
    const actor = currentActor;
    if (!isWorkspace) throw new Error('export_document is only available in workspace mode');
    // Same-origin reads of this runtime's own source files. They are inlined, so
    // the exported file never points back here.
    const base = new URL('.', import.meta.url);
    const fetchText = async (rel) => {
      const res = await fetch(new URL(rel, base).href);
      if (!res.ok) throw new Error(`could not read ${rel} for export (HTTP ${res.status})`);
      return res.text();
    };
    const css = await fetchText('living-evidence.css');
    const sources = await Promise.all(EXPORT_SOURCES.map(fetchText));
    const js = sources.map(stripModuleSyntax).join('\n\n');
    const now = new Date();
    const studies = included();
    const html = buildExportHtml({ css, js, studies, now });
    const bytes = new TextEncoder().encode(html).length;
    const p2 = (n) => String(n).padStart(2, '0');
    const filename = `living-evidence-export-${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}.html`;
    let downloaded = false;
    try {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const a = h('a', { href: url, download: filename, style: 'display:none' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      downloaded = true;
    } catch (e) {
      console.warn('[living-evidence] export download failed, returning the HTML instead:', e.message);
    }
    const content_digest = fnv1a(html);
    ledger({
      kind: 'mutation', tool: 'export_document', actor,
      inputs: { k: studies.length, claims: claims.length, include_html: !!args.include_html },
      result: html,
      summary: `exported ${filename} — self-contained document, ${bytes} bytes, k=${studies.length}, ${claims.length} claim(s)`,
    });
    // The file is megabytes of HTML. Handing all of it back on every call burns an
    // agent's context for a payload it usually cannot use — the human already has
    // the download. Ask for it explicitly (include_html) when you need to read it;
    // it is also returned unasked when the download itself failed, since then the
    // response is the only copy the caller can reach.
    return {
      filename, bytes,
      download_started: downloaded,
      content_digest,
      ...(args.include_html || !downloaded ? { html } : {}),
      note: `A complete Living Evidence document: HTML + data + statistics engine + WebMCP tools in one file. It runs from file:// with no network access. content_digest is a non-cryptographic FNV-1a checksum of the file content.${args.include_html || !downloaded ? '' : ' Pass include_html: true to get the HTML itself in the response.'}`,
    };
  }

  // ---------- restore a saved workspace ----------

  function readSnapshot() {
    if (!isWorkspace || !storageKey) return null;
    let raw = null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch (e) {
      console.warn('[living-evidence] storage unavailable, starting a fresh workspace:', e.message);
      return null;
    }
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || Array.isArray(d) || d.v !== 1) throw new Error('not a v1 workspace snapshot');
      return d;
    } catch (e) {
      // A corrupt snapshot must never take the page down. Drop it, say so, and
      // boot the clean empty workspace the human expects to see.
      console.warn('[living-evidence] discarding an unreadable workspace snapshot:', e.message);
      clearPersisted();
      return null;
    }
  }

  function resetSessionState() {
    state.approved = [];
    state.pending = [];
    state.audit = [];
    state.claimStatus.clear();
    claims.length = 0;
    state.evidenceVersion = 1;
    state.runCounter = 0;
    if (mounts.ledger) mounts.ledger.replaceChildren();
    if (mounts.pending) mounts.pending.replaceChildren();
  }

  /** Rebuild the session from localStorage. Returns true if anything was restored. */
  function restoreWorkspace() {
    const d = readSnapshot();
    if (!d) return false;
    try {
      const approved = Array.isArray(d.approved) ? d.approved : [];
      const pending = Array.isArray(d.pending) ? d.pending : [];
      // A snapshot is untrusted input — it lives in localStorage where anyone can
      // hand-edit it. Ids are re-checked against the SAME rule add_claim enforces,
      // and offenders are dropped: an id carrying a quote would otherwise throw out
      // of the [data-claim="…"] querySelector and take the whole boot down.
      const allClaims = Array.isArray(d.claims) ? d.claims : [];
      const storedClaims = allClaims.filter((c) => c && CLAIM_ID_RE.test(String(c.id ?? '')));
      if (storedClaims.length !== allClaims.length) {
        console.warn(`[living-evidence] dropped ${allClaims.length - storedClaims.length} restored claim(s) with an unusable id`);
      }
      for (const s of approved) {
        if (!s || typeof s !== 'object' || !Number.isFinite(Number(s.yi)) || !Number.isFinite(Number(s.vi))) {
          throw new Error('an approved record is not a study');
        }
      }
      for (const c of storedClaims) validateTest(c && c.test, `restored claim ${c && c.id}`);
      if (typeof d.title === 'string') doc.title = d.title;
      if (typeof d.hypothesis === 'string') doc.hypothesis = d.hypothesis;
      // Evidence version FIRST: restored badges are judged stale against it, so a
      // reload must not make an out-of-date verdict look freshly computed.
      state.evidenceVersion = Number.isFinite(d.evidenceVersion) ? d.evidenceVersion : 1;
      state.runCounter = Number.isFinite(d.runCounter) ? d.runCounter : 0;
      state.approved = approved;
      state.pending = pending;
      // The snapshot holds the WHOLE claim list as it stood (config claims included),
      // so it replaces rather than appends — otherwise a reload duplicates them.
      claims.length = 0;
      for (const c of storedClaims) claims.push({ id: String(c.id), statement: c.statement, rule: c.rule, test: c.test });
      for (const pair of Array.isArray(d.claimStatus) ? d.claimStatus : []) {
        const [id, st] = Array.isArray(pair) ? pair : [];
        // Same guard as the claim list above: a status keyed by an unusable id is
        // dropped, never fed to querySelector.
        if (typeof id === 'string' && CLAIM_ID_RE.test(id) && st && typeof st === 'object') {
          state.claimStatus.set(id, {
            verdict: st.verdict, run: st.run,
            evaluated_version: Number.isFinite(st.evaluated_version) ? st.evaluated_version : 1,
          });
        }
      }
      state.audit = Array.isArray(d.ledger) ? d.ledger : [];
      // Replay, do not re-ledger: a restored row keeps its original run and actor.
      for (const entry of state.audit) renderLedgerRow(entry);
      for (const item of state.pending) if (item.status === 'pending') renderPendingCard(item);
      return true;
    } catch (e) {
      console.warn('[living-evidence] workspace snapshot could not be restored, starting fresh:', e.message);
      resetSessionState();
      clearPersisted();
      return false;
    }
  }

  // ---------- tools (the WebMCP contract) ----------
  const tools = [
    {
      name: 'get_document_overview', readOnly: true,
      description: 'Orientation for agents: what this living document claims, the current state of its evidence base, which analyses its tools can run, and the rules of engagement. Call this first.',
      inputSchema: { type: 'object', properties: {} },
      run() {
        // An empty workspace still has to be describable: orientation is the one
        // tool that must never fail, so the fit is omitted rather than thrown.
        const fit = included().length >= 2 ? metaAnalyze(included(), { method: 'REML' }) : null;
        return {
          format: 'Living Evidence v0.1 — a document your agent can cross-examine',
          mode,
          title: doc.title, hypothesis: doc.hypothesis,
          effect_measure: config.dataset.effect_measure,
          evidence_base: {
            k: included().length, original: state.base.length,
            added_by_approved_proposals: state.approved.length,
            pending_proposals: state.pending.filter((p) => p.status === 'pending').length,
            evidence_version: state.evidenceVersion,
          },
          current_overall_fit: fit
            ? { model: fit.model, estimate: fit.estimate, ci: [fit.ci_lower, fit.ci_upper], p: fit.p, I2: fit.I2 }
            : null,
          claims: claimList(),
          verdict_scope: VERDICT_SCOPE,
          // Where this page sits in the suite: an agent that lands here should know
          // which surface answers which question without having to guess from a URL.
          suite_context: {
            you_are_here: isWorkspace ? 'workspace' : 'exemplar',
            exemplar: 'index.html — the populated exemplar: a filled evidence base and six claims, the fastest cross-examination demo.',
            workspace: 'workspace.html — the authoring surface: an empty page in the fixed SMD template that an agent fills and a human approves.',
            atlas: 'atlas.html — the evidence map: node/gap inspection over the same records and claims; no tool there changes the evidence.',
            board: 'board.html — an Evidence Board built from an unverified ChatGPT conversation (a reported Tokyo 専業主婦 measure): structural graph diagnostics + human-approved additions; its state does not propagate to the other pages.',
          },
          suggested_flow: isWorkspace
            ? [
              'set_hypothesis — state the question this workspace examines',
              'propose_study — one call per record, each with source AND a verbatim quote',
              'ask the human to click Approve on each card (there is no agent approval tool)',
              'add_claim — register a machine-checkable claim as data',
              'evaluate_claim, then export_document',
            ]
            : [
              'get_document_overview — orientation (this call)',
              'evaluate_claim {claim_id: "c-textbook"} — the headline claim, and it loses',
              'evaluate_claim {claim_id: "c-moderator"} — why it loses',
              'leave_one_out — is any single study driving it?',
              'funnel_check — small-study asymmetry',
            ],
          ...(isWorkspace ? {
            workflow: [
              'set_hypothesis — one sentence stating what this workspace examines.',
              'propose_study — once per record, with a source AND the verbatim quote the numbers were read from.',
              'A human clicks Approve on each card — there is NO agent approval tool; k changes only after approval; ≥2 approved records are needed before synthesis.',
              'add_claim — register the claim as a declarative AST (copy an existing claim\'s machine_check from list_claims as a template).',
              'evaluate_claim — give the claim a visible verdict badge.',
              'export_document — write the session out as a self-contained single-file living document.',
            ],
            workflow_note: 'This page is the authoring surface; the exemplar page is the fastest cross-examination demo.',
          } : {}),
          rules_of_engagement: [
            ...(isWorkspace ? ['This is an empty-by-design WORKSPACE, not a finished document: set_hypothesis states the question, propose_study fills the evidence base (human-approved), add_claim registers a machine-checkable claim, export_document writes the whole session out as a self-contained living document. Pooled statistics need at least 2 approved studies.'] : []),
            'All statistics come from the page (deterministic code, validated against R metafor — this checks numerical reproduction against the reference implementation, not the data or model assumptions). Use tool results when reporting page state. Independent calculations are welcome as checks — label them external and do not silently substitute them for the page\'s result.',
            `A verdict reports ${VERDICT_SCOPE}.`,
            'Analysis, verdict and mutation calls are ledgered; pure reads (get_document_overview, list_claims, get_studies, get_audit_log) are not. Analysis tools also render a figure into the document the human is reading.',
            'You may propose adding a study (propose_study), but only the human reader can approve it into the evidence base. Both source and quote are required.',
            // A workspace has no prose to badge — its claims live in a list.
            `Use evaluate_claim to test the document's own claims; verdicts are shown as badges ${isWorkspace ? 'in the claims list' : 'in the prose'}.`,
            `The evidence base carries a version (now ${state.evidenceVersion}); it increments on every human approval. A verdict whose evaluated_version is lower is STALE — re-evaluate before citing it.`,
          ],
        };
      },
    },
    {
      name: 'list_claims', readOnly: true,
      description: `List the document's addressable claims with their machine-check rules and current verdict status (untested / supported / challenged / nuanced). A verdict reports ${VERDICT_SCOPE}.`,
      inputSchema: { type: 'object', properties: {} },
      run: () => ({ verdict_scope: VERDICT_SCOPE, claims: claimList() }),
    },
    {
      name: 'get_studies', readOnly: true,
      description: 'Return the full study-level evidence base: one record per study with effect size (yi), sampling variance (vi), moderators (weeks of prior teacher-student contact, setting, tester blinding), sample sizes, and provenance. Set include_pending=true to also see agent-proposed studies awaiting human approval.',
      inputSchema: { type: 'object', properties: { include_pending: { type: 'boolean', description: 'also list pending proposals (default false)' } } },
      run: (a = {}) => ({
        effect_measure: config.dataset.effect_measure,
        fields: config.dataset.fields,
        studies: included(),
        ...(a.include_pending ? {
          pending_proposals: state.pending.map((p) => ({
            ...p.study, proposal_status: p.status,
            source: p.proposal.source, quote: p.proposal.quote, record_hash: p.proposal.record_hash,
          })),
        } : {}),
      }),
    },
    {
      name: 'run_meta_analysis',
      description: 'Fit a meta-analytic model to the current evidence base and RENDER A FOREST PLOT into the document. method: REML or DL random-effects, or FE common-effect (FE assumes one common effect; tau2 is null by model assumption, not estimated as zero). p is a two-sided test of the pooled effect against zero. Optionally exclude specific study ids (e.g. to test sensitivity to one study). Returns pooled estimate, 95% CI, p, tau^2, I^2, and heterogeneity Q.',
      inputSchema: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['REML', 'DL', 'FE'], description: 'model / tau^2 estimator: REML or DL random-effects, FE common-effect (default REML)' },
          exclude: { type: 'array', items: { type: 'string' }, description: 'study ids to exclude, e.g. ["s04"]' },
        },
      },
      run: (a = {}) => analyses.overall(a),
    },
    {
      name: 'leave_one_out',
      description: 'Leave-one-out sensitivity analysis: re-fit the random-effects model omitting each study in turn, and RENDER the plot into the document. Shows whether any single study drives the pooled result (min/max estimates, significance flips). It reports estimate changes and p<.05-status flips only — not stability of magnitude, moderators, heterogeneity, or bias diagnostics.',
      inputSchema: { type: 'object', properties: {} },
      run: () => analyses.loo(),
    },
    {
      name: 'subgroup_analysis',
      description: 'Split the studies into subgroups, fit each subgroup separately, test the between-group difference, and RENDER a subgroup forest plot. For weeks, omit split_at to use 1 or provide another threshold; split_at is rejected for setting/tester (categorical fields split by value, so a threshold would be silently meaningless).',
      inputSchema: {
        type: 'object',
        properties: {
          split_field: { type: 'string', enum: ['weeks', 'setting', 'tester'], description: 'field to split on' },
          split_at: { type: 'number', description: 'threshold for the numeric field weeks (group A: value <= split_at; default 1). Rejected for setting/tester.' },
        },
        required: ['split_field'],
      },
      run: (a = {}) => analyses.subgroup(a),
    },
    {
      name: 'meta_regression',
      description: 'Mixed-effects meta-regression of effect size on a numeric moderator (REML), RENDERING a bubble plot with the fitted line. cap truncates the moderator (cap=3 replicates the published Raudenbush model min(weeks,3)); it must be > 0 and is only accepted for moderator "weeks" — capping any other field is rejected rather than silently fitted. Returns slope, p, and R^2 (a boundary-clipped proportional reduction in estimated tau^2, with no uncertainty interval).',
      inputSchema: {
        type: 'object',
        properties: {
          moderator: { type: 'string', enum: ['weeks', 'year'], description: 'numeric moderator field' },
          cap: { type: 'number', exclusiveMinimum: 0, description: 'optional truncation: x = min(field, cap). Must be > 0, and only accepted for moderator "weeks".' },
        },
        required: ['moderator'],
      },
      run: (a = {}) => analyses.metareg(a),
    },
    {
      name: 'funnel_check',
      description: 'Small-study asymmetry diagnostics: render a funnel plot and run Egger\'s regression test. Asymmetry can have causes other than publication bias, and a non-significant result (especially at k≈19) is not evidence of absence of bias. Returns the intercept, p-value and an interpretation.',
      inputSchema: { type: 'object', properties: {} },
      run: () => analyses.funnel(),
    },
    {
      name: 'cumulative_meta',
      description: 'Retrospective cumulative meta-analysis in publication-year order: prefixes of the CURRENT corpus. It does not reconstruct which evidence was actually available or discoverable at each historical date. RENDERS the step plot.',
      inputSchema: { type: 'object', properties: {} },
      run: () => analyses.cumulative(),
    },
    {
      name: 'evaluate_claim',
      description: `Run the deterministic machine-check behind one of the document's claims (see list_claims for ids). The analysis renders into the document and the claim gets a visible verdict badge: supported / challenged / nuanced. This is the core cross-examination tool. The verdict reports ${VERDICT_SCOPE}.`,
      inputSchema: { type: 'object', properties: { claim_id: { type: 'string', description: 'claim id from list_claims' } }, required: ['claim_id'] },
      run: (a = {}) => evaluateClaim(a.claim_id),
    },
    {
      name: 'propose_study',
      description: 'Propose adding a study to the evidence base (e.g. a replication published after this document). The proposal is validated, logged, and shown to the human reader as an approve/reject card — it is NOT included in analyses until the human approves. Required: author, year, yi (SMD), vi (sampling variance), weeks (prior contact), source (citation or URL) AND quote (the exact sentence/table cell the numbers were read from — a number without its source text is not admissible). Optional: setting (group|indiv), tester (aware|blind), n1i, n2i, derivation. Returns record_hash — a non-cryptographic FNV-1a checksum of the extracted numbers, for spotting accidental drift between copies of a record, not tamper evidence — and possible_duplicate_of, which is null unless the same author+year already exists with a different effect size.',
      inputSchema: {
        type: 'object',
        properties: {
          author: { type: 'string', minLength: 1 },
          year: { type: 'integer', minimum: 1900, maximum: 2100 },
          yi: { type: 'number', description: 'SMD; positive = higher measured IQ in the expectancy group than control' },
          vi: { type: 'number', exclusiveMinimum: 0, description: 'sampling variance of yi' },
          weeks: { type: 'number', minimum: 0, description: 'weeks of prior teacher-student contact' },
          setting: { type: 'string', enum: ['group', 'indiv'], description: 'IQ test administration setting (group|indiv)' },
          tester: { type: 'string', enum: ['aware', 'blind'], description: 'whether the tester knew the expectancy assignment (aware|blind)' },
          n1i: { type: 'integer', minimum: 1, description: 'expectancy-group sample size' },
          n2i: { type: 'integer', minimum: 1, description: 'control-group sample size' },
          source: { type: 'string', minLength: 1, description: 'citation or URL for provenance' },
          quote: { type: 'string', minLength: 1, description: 'short verbatim excerpt the extracted numbers were read from (required)' },
          derivation: { type: 'string', description: 'how yi/vi were derived when not directly reported' },
        },
        required: ['author', 'year', 'yi', 'vi', 'weeks', 'source', 'quote'],
      },
      run: (a = {}) => proposeStudy(a),
    },
    {
      name: 'get_audit_log', readOnly: true,
      description: 'Return the append-only audit ledger: every analysis, claim verdict, proposal and human approval in this session, in order. Each entry is {run, time, actor (human|agent|system), kind, tool, inputs, summary, evidence_version, result_digest}. result_digest is a non-cryptographic FNV-1a checksum for detecting accidental payload changes, not tamper evidence. The ledger is session-local: it lives in this page for this visit and is not published, synced or shared.',
      inputSchema: { type: 'object', properties: {} },
      run: () => ({ entries: state.audit }),
    },
  ];

  // Workspace mode adds the three tools that let an agent BUILD a document rather
  // than only interrogate one. They are absent from a finished document on purpose:
  // a published article's hypothesis and claims are not up for silent revision.
  if (isWorkspace) {
    tools.push(
      {
        name: 'set_hypothesis',
        description: 'Set the hypothesis this workspace examines (1–500 characters). Shown at the top of the page and carried into the exported document.',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string', minLength: 1, maxLength: 500, description: 'the hypothesis, as one sentence (1–500 characters, not blank after trimming)' } },
          required: ['text'],
        },
        run: (a = {}) => setHypothesis(a),
      },
      {
        name: 'add_claim',
        description: 'Register a new addressable claim with its deterministic machine check. `test` is the declarative rule AST: {analysis, args?, focus?, verdicts:[{when:[{path,op,value}], verdict, reason}, …, {default:true, verdict, reason}]}. Ops: lt, le, gt, ge, eq, ne, abs_lt, abs_ge. Copy an existing claim\'s machine_check from list_claims as a template. Only the SHAPE is validated here — a claim is registered because it is well-formed, not because it currently passes. Use evaluate_claim afterwards to get a verdict.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'optional claim id; auto-assigned (wc01, wc02, …) when omitted' },
            statement: { type: 'string', minLength: 1, maxLength: 300, description: 'the claim in plain language, as a reader would argue about it' },
            rule: { type: 'string', minLength: 1, description: 'human-readable description of the check ("Supported iff …")' },
            // The full AST, spelled out rather than {type:'object'}: an agent that has
            // to guess the shape of the one argument that matters writes claims that
            // fail validation at registration time.
            test: {
              type: 'object',
              description: 'the machine-check AST; mirrors what list_claims returns as machine_check',
              properties: {
                analysis: { type: 'string', enum: ['overall', 'loo', 'subgroup', 'metareg', 'funnel', 'cumulative'], description: 'which page analysis produces the result the conditions read' },
                args: { type: 'object', description: 'arguments passed to that analysis, e.g. {"method":"REML"} or {"moderator":"weeks","cap":3}' },
                focus: {
                  type: 'object',
                  description: 'optional: pick one element of a result collection and expose it as ctx.f (e.g. one subgroup)',
                  properties: {
                    collection: { type: 'string', description: 'array field of the result, e.g. "groups"' },
                    match_field: { type: 'string', description: 'field of each element to match on, e.g. "group"' },
                    match_substring: { type: 'string', description: 'substring that identifies the element, e.g. "≤ 1"' },
                  },
                  required: ['collection', 'match_field', 'match_substring'],
                  additionalProperties: false,
                },
                verdicts: {
                  type: 'array',
                  minItems: 2,
                  description: 'walked in order; the LAST entry must be {default:true} and carries no conditions',
                  items: {
                    type: 'object',
                    properties: {
                      when: {
                        type: 'array',
                        description: 'all conditions must hold for this entry to match',
                        items: {
                          type: 'object',
                          properties: {
                            path: { type: 'string', description: 'dotted path into the analysis result, e.g. "moderator.p"' },
                            op: { type: 'string', enum: ['lt', 'le', 'gt', 'ge', 'eq', 'ne', 'abs_lt', 'abs_ge'] },
                            value: { description: 'comparison value; numeric for every op except eq/ne' },
                          },
                          required: ['path', 'op', 'value'],
                          additionalProperties: false,
                        },
                      },
                      default: { type: 'boolean', description: 'true on the final fallthrough entry only' },
                      verdict: { type: 'string', enum: ['supported', 'challenged', 'nuanced'] },
                      reason: { type: 'string', description: 'template rendered against the result, e.g. "pooled SMD {estimate}, p = {p}"' },
                    },
                    required: ['verdict'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['analysis', 'verdicts'],
              additionalProperties: false,
            },
          },
          required: ['statement', 'rule', 'test'],
        },
        run: (a = {}) => addClaim(a),
      },
      {
        name: 'export_document',
        description: 'Write this workspace out as a SELF-CONTAINED single-file Living Evidence document: prose, evidence base with provenance, claims with their machine checks, the statistics engine, the figures and this same WebMCP tool surface — all inlined in one HTML file that runs from file:// with no network. Offers the file as a browser download and returns {filename, bytes, download_started, content_digest}; the HTML itself is only included when include_html is true.',
        inputSchema: {
          type: 'object',
          properties: {
            include_html: { type: 'boolean', description: 'return the full HTML in the response (large); default false' },
          },
        },
        run: (a = {}) => exportDocument(a),
      },
    );
  }

  // Harden schemas for agent runtimes (ChatGPT docs recommend additionalProperties: false)
  // and attach human-readable titles for "Site tools" UI surfaces.
  const TITLES = {
    get_document_overview: 'Document overview', list_claims: 'List claims',
    get_studies: 'Study-level data', run_meta_analysis: 'Run meta-analysis',
    leave_one_out: 'Leave-one-out sensitivity', subgroup_analysis: 'Subgroup analysis',
    meta_regression: 'Meta-regression', funnel_check: 'Small-study asymmetry check',
    cumulative_meta: 'Cumulative meta-analysis', evaluate_claim: 'Evaluate a claim',
    propose_study: 'Propose adding a study', get_audit_log: 'Audit ledger',
    set_hypothesis: 'Set the hypothesis', add_claim: 'Add a claim',
    export_document: 'Export a living document',
  };
  for (const t of tools) {
    t.title = TITLES[t.name] || t.name;
    if (t.inputSchema && t.inputSchema.additionalProperties === undefined) t.inputSchema.additionalProperties = false;
  }

  /**
   * The one entry point every caller goes through — WebMCP execute(), the tool
   * console, and the e2e suite. `opts.actor` says who is calling, so the ledger
   * can attribute honestly instead of assuming everything is an agent.
   */
  function invokeTool(name, args = {}, opts = {}) {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`unknown tool: ${name}`);
    const previousActor = currentActor;
    currentActor = opts.actor || 'agent';
    try {
      return tool.run(args || {});
    } finally {
      currentActor = previousActor;
    }
  }

  // ---------- WebMCP registration ----------
  async function registerWebMCP() {
    const mc = (typeof document !== 'undefined' && document.modelContext)
      || (typeof navigator !== 'undefined' && navigator.modelContext) || null;
    if (!mc || typeof mc.registerTool !== 'function') {
      state.agent = {
        active: false, status: 'absent', registered: 0, total: tools.length,
        failed: tools.map((t) => t.name),
        detail: 'No WebMCP runtime (document.modelContext) in this browser.',
      };
      return state.agent;
    }
    const failed = [];
    for (const t of tools) {
      try {
        await mc.registerTool({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: !!t.readOnly },
          // Per the WebMCP spec, the runtime serializes the returned value to JSON —
          // return the result object directly, do NOT pre-stringify.
          execute: async (inputs) => invokeTool(t.name, inputs ?? {}, { actor: 'agent' }),
        });
      } catch (e) {
        failed.push(t.name);
        console.warn(`[living-evidence] registerTool(${t.name}) failed:`, e);
      }
    }
    const total = tools.length;
    const ok = total - failed.length;
    // "Active" means the WHOLE contract is available. A half-registered document
    // would let an agent conclude things it could not actually check.
    if (failed.length === 0) {
      state.agent = { active: true, status: 'active', registered: ok, total, failed: [], count: ok, detail: `${ok}/${total} tools registered with the browser's WebMCP runtime.` };
    } else if (ok === 0) {
      state.agent = { active: false, status: 'absent', registered: 0, total, failed, count: 0, detail: `The WebMCP runtime rejected all ${total} tool registrations.` };
    } else {
      state.agent = { active: false, status: 'degraded', registered: ok, total, failed, count: ok, detail: `Only ${ok}/${total} tools registered — failed: ${failed.join(', ')}.` };
    }
    return state.agent;
  }

  function renderStatus() {
    if (!mounts.status) return;
    const a = state.agent;
    const text = {
      active: `Agent interface active — ${a.detail} Your AI can now cross-examine this document.`,
      degraded: `Agent interface DEGRADED — ${a.detail} Any question that needs a missing tool cannot be answered by your agent; run those from the Tool console below.`,
      absent: `Agent interface inactive — ${a.detail} You can still drive every tool by hand from the Tool console below.`,
    }[a.status] || `Agent interface inactive — ${a.detail} You can still drive every tool by hand from the Tool console below.`;
    mounts.status.replaceChildren(
      h('span', { class: `le-status-dot ${a.active ? 'le-on' : 'le-off'}` }),
      h('span', { text }),
    );
  }

  // ---------- tool console (human-driven fallback / transparency panel) ----------
  /** The console PRINTS the tool result; an exported document is megabytes of HTML,
   *  so show its size instead of pasting the file into the panel. */
  function forDisplay(res) {
    if (res && typeof res === 'object' && typeof res.html === 'string') {
      return { ...res, html: `‹${res.bytes} bytes of self-contained HTML — offered as a download›` };
    }
    return res;
  }

  function renderConsole() {
    if (!mounts.console) return;
    const out = h('pre', { class: 'le-console-out', text: 'Pick a tool, edit the arguments, press Run. Everything an agent could do, you can do by hand — same tools, same ledger.' });
    const argBox = h('textarea', { class: 'le-console-args', rows: 4, spellcheck: 'false' });
    const sel = h('select', { class: 'le-console-select' }, tools.map((t) => h('option', { value: t.name, text: t.name })));
    const EXAMPLES = {
      get_document_overview: {}, list_claims: {}, get_studies: { include_pending: false },
      run_meta_analysis: { method: 'REML' }, leave_one_out: {},
      subgroup_analysis: { split_field: 'weeks', split_at: 1 },
      meta_regression: { moderator: 'weeks', cap: 3 },
      funnel_check: {}, cumulative_meta: {}, evaluate_claim: { claim_id: claims[0]?.id || 'c1' },
      propose_study: { author: 'Example & Author', year: 1976, yi: 0.1, vi: 0.05, weeks: 2, setting: 'group', tester: 'blind', source: 'Journal of Examples 12(3)', quote: 'd = 0.10 (SE 0.22)', derivation: 'd read directly from Table 2; vi = SE²' },
      get_audit_log: {},
      set_hypothesis: { text: 'State the question this evidence base is meant to settle.' },
      add_claim: {
        statement: 'The pooled effect is positive.',
        rule: 'Supported iff the pooled REML estimate is greater than 0.',
        test: {
          analysis: 'overall',
          args: { method: 'REML' },
          verdicts: [
            { when: [{ path: 'estimate', op: 'gt', value: 0 }], verdict: 'supported', reason: 'pooled SMD {estimate}, p = {p}' },
            { default: true, verdict: 'challenged', reason: 'pooled SMD {estimate}, p = {p}' },
          ],
        },
      },
      export_document: { include_html: false },
    };
    const fill = () => { argBox.value = JSON.stringify(EXAMPLES[sel.value] ?? {}, null, 1); };
    sel.addEventListener('change', fill); fill();
    const desc = h('div', { class: 'le-console-desc' });
    const updateDesc = () => { desc.textContent = tools.find((t) => t.name === sel.value)?.description || ''; };
    sel.addEventListener('change', updateDesc); updateDesc();
    const btn = h('button', {
      class: 'le-btn', text: 'Run tool',
      onclick: () => {
        try {
          const args = argBox.value.trim() ? JSON.parse(argBox.value) : {};
          // A human pressed this button — the ledger says so.
          const res = invokeTool(sel.value, args, { actor: 'human' });
          // export_document is the one asynchronous tool (it reads its own source).
          Promise.resolve(res)
            .then((v) => { out.textContent = JSON.stringify(forDisplay(v), null, 2); })
            .catch((e) => { out.textContent = `ERROR: ${e.message}`; });
        } catch (e) { out.textContent = `ERROR: ${e.message}`; }
      },
    });
    mounts.console.replaceChildren(
      h('div', { class: 'le-console-row' }, [sel, btn]), desc, argBox, out,
    );
  }

  // ---------- boot ----------
  // Restore BEFORE the first render: evidence version, ledger and badges all have to
  // be in place, or a restored verdict would be painted as if it were fresh.
  const restored = isWorkspace ? restoreWorkspace() : false;
  renderHypothesis();
  renderClaimsList();
  if (isWorkspace && mounts.reset) {
    mounts.reset.addEventListener('click', () => {
      if (!confirm('Reset this workspace? The evidence base, claims and ledger saved in this browser will be deleted.')) return;
      clearPersisted();
      location.reload();
    });
  }
  const fit0 = refreshHeadline();
  // The boot entry is the PAGE talking, not a human and not an agent.
  ledger({
    kind: 'init', tool: 'init', actor: 'system',
    inputs: { dataset: config.dataset.id ?? null, k: included().length, ...(isWorkspace ? { mode, restored } : {}) },
    result: fit0,
    summary: fit0
      ? `${restored ? 'workspace restored' : 'document loaded'} — evidence base k=${included().length}, pooled ${fmt(fit0.estimate)} [${fmt(fit0.ci_lower)}, ${fmt(fit0.ci_upper)}], p=${fmt(fit0.p)}`
      : `${restored ? 'workspace restored' : 'workspace opened'} — evidence base k=${included().length}, nothing to pool yet (needs 2 studies)`,
  });
  renderConsole();
  const ready = registerWebMCP().then((a) => { renderStatus(); return a; });

  const api = {
    version: '0.1.0',
    mode,
    tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, readOnly: !!t.readOnly })),
    // invokeTool(name, args) still works; the third argument is optional.
    invokeTool,
    invokeToolJSON: (name, args, opts) => JSON.stringify(invokeTool(name, args, opts)),
    // a getter, not a snapshot: a workspace grows claims after boot
    get claims() { return claims.map((c) => ({ id: c.id, rule: c.rule, test: c.test })); },
    state, ready,
    _analyses: analyses,
  };
  if (typeof window !== 'undefined') window.LivingEvidence = api;
  return api;
}
