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
//   4. Claims are addressable (ids) and machine-checkable (deterministic rules).

import {
  metaAnalyze, leaveOneOut, subgroupAnalysis, metaRegression, eggerTest, cumulativeMeta,
} from './meta-stats.js';
import { forestPlot, looPlot, funnelPlot, moderatorPlot } from './meta-plots.js';

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

export function initLivingEvidence(config) {
  const state = {
    base: config.dataset.studies.map((s) => ({ ...s, provenance: 'original evidence base' })),
    approved: [],
    pending: [],   // {study, status: 'pending'|'approved'|'rejected', proposal}
    audit: [],
    runCounter: 0,
    claimStatus: new Map(), // id -> {verdict, run}
    agent: { active: false, detail: 'not initialized' },
  };
  const included = () => state.base.concat(state.approved);

  const mounts = {
    workbench: $(config.mounts?.workbench || '#le-workbench'),
    ledger: $(config.mounts?.ledger || '#le-ledger'),
    pending: $(config.mounts?.pending || '#le-pending'),
    status: $(config.mounts?.status || '#le-status'),
    mainFigure: $(config.mounts?.mainFigure || '#le-main-figure'),
    console: $(config.mounts?.console || '#le-console'),
  };

  // ---------- audit ledger ----------
  function ledger(kind, tool, summary, byHuman = false) {
    const n = ++state.runCounter;
    const entry = {
      run: n, time: new Date().toISOString(), kind, tool,
      actor: byHuman ? 'human' : 'agent', summary,
    };
    state.audit.push(entry);
    if (mounts.ledger) {
      const row = h('li', { class: `le-ledger-row le-${byHuman ? 'human' : 'agent'}` }, [
        h('span', { class: 'le-run', text: `#${n}` }),
        h('span', { class: 'le-actor', text: byHuman ? 'HUMAN' : 'AGENT' }),
        h('span', { class: 'le-summary', text: summary }),
      ]);
      mounts.ledger.appendChild(row);
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return n;
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
  function refreshHeadline() {
    const studies = included();
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
  function setClaimStatus(claimId, verdict, run) {
    state.claimStatus.set(claimId, { verdict, run });
    const span = document.querySelector(`[data-claim="${claimId}"]`);
    if (!span) return;
    span.querySelector('.le-chip')?.remove();
    const label = { supported: '✓ supported', challenged: '✗ challenged', nuanced: '△ nuanced' }[verdict] || verdict;
    span.appendChild(h('sup', { class: `le-chip le-chip-${verdict}`, text: `${label} · run #${run}` }));
    span.classList.add('le-claim-tested');
  }

  // ---------- analyses (compute + render + ledger; used by tools AND claim checks) ----------
  const analyses = {
    overall({ method = 'REML', exclude = [] } = {}, { silentFigure = false } = {}) {
      const excluded = new Set(exclude);
      const studies = included().filter((s) => !excluded.has(s.id));
      if (studies.length < 2) throw new Error('fewer than 2 studies after exclusions');
      const fit = metaAnalyze(studies, { method });
      const title = `${fit.model}, k=${fit.k}${exclude.length ? `, excluding ${exclude.join(', ')}` : ''}`;
      const run = ledger('analysis', 'run_meta_analysis', `${title} → ${fmt(fit.estimate)} [${fmt(fit.ci_lower)}, ${fmt(fit.ci_upper)}], p=${fmt(fit.p)}`);
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
      const run = ledger('analysis', 'leave_one_out',
        `leave-one-out (k=${studies.length}) → estimates ${fmt(res.min_estimate)}…${fmt(res.max_estimate)}; significance flips: ${res.flips_significance.length ? res.flips_significance.join(', ') : 'none'}`);
      const figure = renderFigure(run, 'Leave-one-out sensitivity', looPlot(res.rows, res.full_estimate), 'Pooled REML estimate re-fitted with each study omitted');
      return { run, figure, ...res };
    },

    subgroup({ split_field, split_at = null } = {}) {
      const allowed = config.subgroupFields || {};
      if (!(split_field in allowed)) throw new Error(`split_field must be one of: ${Object.keys(allowed).join(', ')}`);
      const spec = allowed[split_field];
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
      const run = ledger('analysis', 'subgroup_analysis', `subgroups by ${split_field} → ${groupLine}`);
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
      const xOf = (s) => (cap === null ? s[moderator] : Math.min(s[moderator], cap));
      const res = metaRegression(included(), xOf);
      const capNote = cap === null ? moderator : `min(${moderator}, ${cap})`;
      const run = ledger('analysis', 'meta_regression',
        `meta-regression on ${capNote} → slope ${fmt(res.moderator.b)} (p=${fmt(res.moderator.p, 5)}), R²=${res.R2_percent === null ? 'n/a' : fmt(res.R2_percent, 1) + '%'}`);
      const figure = renderFigure(run, 'Meta-regression', moderatorPlot(included(), xOf, res, { xlab: capNote }),
        `slope ${fmt(res.moderator.b)} [${fmt(res.moderator.ci_lower)}, ${fmt(res.moderator.ci_upper)}]; residual heterogeneity QE p=${fmt(res.QE_p, 4)}`);
      return { run, figure, moderator_field: capNote, ...res };
    },

    funnel() {
      const studies = included();
      const fe = metaAnalyze(studies, { method: 'FE' });
      const res = eggerTest(studies);
      const run = ledger('analysis', 'funnel_check', `Egger's test → intercept ${fmt(res.intercept)}, p=${fmt(res.p, 4)} (${res.asymmetry_detected ? 'asymmetry detected' : 'no significant asymmetry'})`);
      const figure = renderFigure(run, 'Funnel plot', funnelPlot(studies, fe.estimate), `pseudo-95% CI funnel around the fixed-effect estimate; Egger p=${fmt(res.p, 4)}`);
      return { run, figure, ...res };
    },

    cumulative() {
      const res = cumulativeMeta(included(), { method: 'REML' });
      const run = ledger('analysis', 'cumulative_meta', `cumulative meta-analysis by year (${res.rows.length} steps); final ${fmt(res.rows[res.rows.length - 1].estimate)}`);
      const rows = res.rows.map((r) => ({ label: `+ ${r.upto} (k=${r.k})`, yi: r.estimate, lo: r.ci_lower, hi: r.ci_upper, weight: 1 }));
      const figure = renderFigure(run, 'Cumulative meta-analysis', forestPlot(rows, null, { xlab: 'Pooled SMD as evidence accumulates' }), 'studies added in publication-year order');
      return { run, figure, ...res };
    },
  };

  // ---------- pending studies / human approval ----------
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
        ].map(([k, v]) => h('tr', {}, [h('th', { text: k }), h('td', { text: String(v) })]))),
      ]),
      h('div', { class: 'le-pending-note', text: 'An agent proposed this study. It is NOT part of the evidence base until a human approves it.' }),
      h('div', { class: 'le-pending-actions' }, [
        h('button', {
          class: 'le-btn le-btn-approve', text: 'Approve & include',
          onclick: () => {
            item.status = 'approved';
            state.approved.push(s);
            card.remove();
            ledger('approval', 'propose_study', `human APPROVED ${s.author} (${s.year}) — evidence base now k=${included().length}`, true);
            const fit = refreshHeadline();
            renderFigure(state.runCounter, 'Updated forest plot', forestPlot(studyRows(included(), fit.tau2), {
              label: 'Pooled', est: fit.estimate, lo: fit.ci_lower, hi: fit.ci_upper,
            }), `evidence base updated: k=${fit.k}, pooled ${fmt(fit.estimate)} [${fmt(fit.ci_lower)}, ${fmt(fit.ci_upper)}], p=${fmt(fit.p)}`);
            for (const id of state.claimStatus.keys()) {
              const span = document.querySelector(`[data-claim="${id}"] .le-chip`);
              span?.classList.add('le-chip-stale');
              span?.setAttribute('title', 'Evidence base changed after this verdict — re-evaluate');
            }
          },
        }),
        h('button', {
          class: 'le-btn le-btn-reject', text: 'Reject',
          onclick: () => {
            item.status = 'rejected';
            card.remove();
            ledger('approval', 'propose_study', `human REJECTED ${s.author} (${s.year})`, true);
          },
        }),
      ]),
    ]);
    mounts.pending.appendChild(card);
    mounts.pending.closest('section')?.classList.add('le-has-pending');
  }

  function proposeStudy(args) {
    const required = ['author', 'year', 'yi', 'vi', 'weeks', 'source'];
    for (const f of required) if (args[f] === undefined || args[f] === null || args[f] === '') throw new Error(`missing required field: ${f}`);
    const year = Number(args.year), yi = Number(args.yi), vi = Number(args.vi), weeks = Number(args.weeks);
    if (!Number.isFinite(year) || year < 1900 || year > 2100) throw new Error('year out of range');
    if (!Number.isFinite(yi) || Math.abs(yi) > 10) throw new Error('yi must be a finite SMD (|yi| <= 10)');
    if (!Number.isFinite(vi) || vi <= 0 || vi > 10) throw new Error('vi must be a positive sampling variance');
    if (!Number.isFinite(weeks) || weeks < 0 || weeks > 500) throw new Error('weeks out of range');
    if (args.setting && !['group', 'indiv'].includes(args.setting)) throw new Error("setting must be 'group' or 'indiv'");
    if (args.tester && !['aware', 'blind'].includes(args.tester)) throw new Error("tester must be 'aware' or 'blind'");
    const dup = included().concat(state.pending.filter((p) => p.status === 'pending').map((p) => p.study))
      .find((s) => s.author === args.author && s.year === year && Math.abs(s.yi - yi) < 1e-9);
    if (dup) throw new Error(`duplicate of existing record ${dup.id} (${dup.author} ${dup.year})`);

    const id = `p${String(state.pending.length + 1).padStart(2, '0')}`;
    const study = {
      id, author: String(args.author), year, weeks,
      setting: args.setting || null, tester: args.tester || null,
      n1i: args.n1i ?? null, n2i: args.n2i ?? null, yi, vi,
      provenance: `agent proposal (${args.source})`,
    };
    const item = { study, status: 'pending', proposal: { source: String(args.source), quote: args.quote ? String(args.quote) : null, proposed_at: new Date().toISOString() } };
    state.pending.push(item);
    ledger('proposal', 'propose_study', `agent proposed ${study.author} (${study.year}), yi=${fmt(yi)}, vi=${fmt(vi, 4)} — awaiting human approval`);
    renderPendingCard(item);
    return {
      status: 'pending_human_approval', study_id: id,
      message: 'Proposal recorded and shown to the human reader with an Approve/Reject card. It is NOT included in any analysis until approved. Ask the human to review it on the page.',
    };
  }

  // ---------- claims ----------
  function evaluateClaim(claimId) {
    const claim = (config.claims || []).find((c) => c.id === claimId);
    if (!claim) throw new Error(`unknown claim id: ${claimId}. Use list_claims.`);
    const result = claim.check(analyses, included());
    setClaimStatus(claimId, result.verdict, state.runCounter);
    ledger('claim', 'evaluate_claim', `claim ${claimId} → ${result.verdict.toUpperCase()} (${result.reason})`);
    const span = document.querySelector(`[data-claim="${claimId}"]`);
    return {
      claim_id: claimId,
      statement: span ? span.childNodes[0].textContent.trim() : claim.statement || '',
      verdict: result.verdict, rule: claim.rule, reason: result.reason, evidence: result.evidence,
      note: 'The verdict badge is now shown next to the claim in the document.',
    };
  }

  function claimList() {
    return (config.claims || []).map((c) => {
      const span = document.querySelector(`[data-claim="${c.id}"]`);
      const st = state.claimStatus.get(c.id);
      return {
        id: c.id,
        statement: span ? span.childNodes[0].textContent.trim() : c.statement || '',
        machine_check: c.rule,
        status: st ? st.verdict : 'untested',
      };
    });
  }

  // ---------- tools (the WebMCP contract) ----------
  const tools = [
    {
      name: 'get_document_overview', readOnly: true,
      description: 'Orientation for agents: what this living document claims, the current state of its evidence base, which analyses its tools can run, and the rules of engagement. Call this first.',
      inputSchema: { type: 'object', properties: {} },
      run() {
        const fit = metaAnalyze(included(), { method: 'REML' });
        return {
          format: 'Living Evidence v0.1 — a document your agent can cross-examine',
          title: config.title, hypothesis: config.hypothesis,
          effect_measure: config.dataset.effect_measure,
          evidence_base: { k: included().length, original: state.base.length, added_by_approved_proposals: state.approved.length, pending_proposals: state.pending.filter((p) => p.status === 'pending').length },
          current_overall_fit: { model: fit.model, estimate: fit.estimate, ci: [fit.ci_lower, fit.ci_upper], p: fit.p, I2: fit.I2 },
          claims: claimList(),
          rules_of_engagement: [
            'All statistics come from the page (deterministic code, validated against R metafor). Never recompute or estimate these numbers yourself — call tools.',
            'Every tool call is logged to a visible audit ledger; analysis tools also render a figure into the document the human is reading.',
            'You may propose adding a study (propose_study), but only the human reader can approve it into the evidence base.',
            'Use evaluate_claim to test the document\'s own claims; verdicts are shown as badges in the prose.',
          ],
        };
      },
    },
    {
      name: 'list_claims', readOnly: true,
      description: 'List the document\'s addressable claims with their machine-check rules and current verdict status (untested / supported / challenged / nuanced).',
      inputSchema: { type: 'object', properties: {} },
      run: () => ({ claims: claimList() }),
    },
    {
      name: 'get_studies', readOnly: true,
      description: 'Return the full study-level evidence base: one record per study with effect size (yi), sampling variance (vi), moderators (weeks of prior teacher-student contact, setting, tester blinding), sample sizes, and provenance. Set include_pending=true to also see agent-proposed studies awaiting human approval.',
      inputSchema: { type: 'object', properties: { include_pending: { type: 'boolean', description: 'also list pending proposals (default false)' } } },
      run: (a = {}) => ({
        effect_measure: config.dataset.effect_measure,
        fields: config.dataset.fields,
        studies: included(),
        ...(a.include_pending ? { pending_proposals: state.pending.map((p) => ({ ...p.study, proposal_status: p.status, source: p.proposal.source })) } : {}),
      }),
    },
    {
      name: 'run_meta_analysis',
      description: 'Fit a meta-analytic model to the current evidence base and RENDER A FOREST PLOT into the document. method: REML (default, random-effects), DL (DerSimonian-Laird random-effects) or FE (fixed-effect). Optionally exclude specific study ids (e.g. to test sensitivity to one study). Returns pooled estimate, 95% CI, p, tau^2, I^2, and heterogeneity Q.',
      inputSchema: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['REML', 'DL', 'FE'], description: 'model / tau^2 estimator (default REML)' },
          exclude: { type: 'array', items: { type: 'string' }, description: 'study ids to exclude, e.g. ["s04"]' },
        },
      },
      run: (a = {}) => analyses.overall(a),
    },
    {
      name: 'leave_one_out',
      description: 'Leave-one-out sensitivity analysis: re-fit the random-effects model omitting each study in turn, and RENDER the plot into the document. Shows whether any single study drives the pooled result (min/max estimates, significance flips).',
      inputSchema: { type: 'object', properties: {} },
      run: () => analyses.loo(),
    },
    {
      name: 'subgroup_analysis',
      description: 'Split the studies into subgroups, fit each subgroup separately, test the between-group difference, and RENDER a subgroup forest plot. Numeric fields need split_at (weeks default 1: "≤1 week vs >1 week of prior teacher-student contact"). Categorical fields (setting, tester) split by value.',
      inputSchema: {
        type: 'object',
        properties: {
          split_field: { type: 'string', enum: ['weeks', 'setting', 'tester'], description: 'field to split on' },
          split_at: { type: 'number', description: 'threshold for numeric fields (group A: value <= split_at). Default 1 for weeks.' },
        },
        required: ['split_field'],
      },
      run: (a = {}) => analyses.subgroup(a),
    },
    {
      name: 'meta_regression',
      description: 'Mixed-effects meta-regression of effect size on a numeric moderator (REML), RENDERING a bubble plot with the fitted line. cap truncates the moderator (cap=3 replicates the published Raudenbush model min(weeks,3)). Returns slope, p, and R^2 (share of heterogeneity explained).',
      inputSchema: {
        type: 'object',
        properties: {
          moderator: { type: 'string', enum: ['weeks', 'year'], description: 'numeric moderator field' },
          cap: { type: 'number', description: 'optional truncation: x = min(field, cap)' },
        },
        required: ['moderator'],
      },
      run: (a = {}) => analyses.metareg(a),
    },
    {
      name: 'funnel_check',
      description: 'Publication-bias diagnostics: RENDER a funnel plot and run Egger\'s regression test for small-study asymmetry. Returns the intercept, p-value and an interpretation.',
      inputSchema: { type: 'object', properties: {} },
      run: () => analyses.funnel(),
    },
    {
      name: 'cumulative_meta',
      description: 'Cumulative meta-analysis in publication-year order — how the pooled estimate evolved as evidence accumulated. RENDERS the step plot into the document.',
      inputSchema: { type: 'object', properties: {} },
      run: () => analyses.cumulative(),
    },
    {
      name: 'evaluate_claim',
      description: 'Run the deterministic machine-check behind one of the document\'s claims (see list_claims for ids). The analysis renders into the document and the claim gets a visible verdict badge: supported / challenged / nuanced. This is the core cross-examination tool.',
      inputSchema: { type: 'object', properties: { claim_id: { type: 'string', description: 'claim id from list_claims' } }, required: ['claim_id'] },
      run: (a = {}) => evaluateClaim(a.claim_id),
    },
    {
      name: 'propose_study',
      description: 'Propose adding a study to the evidence base (e.g. a replication published after this document). The proposal is validated, logged, and shown to the human reader as an approve/reject card — it is NOT included in analyses until the human approves. Required: author, year, yi (SMD), vi (sampling variance), weeks (prior contact), source (citation or URL). Optional: setting (group|indiv), tester (aware|blind), n1i, n2i, quote (supporting excerpt).',
      inputSchema: {
        type: 'object',
        properties: {
          author: { type: 'string' }, year: { type: 'number' },
          yi: { type: 'number', description: 'standardized mean difference' },
          vi: { type: 'number', description: 'sampling variance of yi' },
          weeks: { type: 'number', description: 'weeks of prior teacher-student contact' },
          setting: { type: 'string', enum: ['group', 'indiv'] },
          tester: { type: 'string', enum: ['aware', 'blind'] },
          n1i: { type: 'number' }, n2i: { type: 'number' },
          source: { type: 'string', description: 'citation or URL for provenance' },
          quote: { type: 'string', description: 'short excerpt supporting the extracted numbers' },
        },
        required: ['author', 'year', 'yi', 'vi', 'weeks', 'source'],
      },
      run: (a = {}) => proposeStudy(a),
    },
    {
      name: 'get_audit_log', readOnly: true,
      description: 'Return the append-only audit ledger: every analysis, claim verdict, proposal and human approval in this session, in order.',
      inputSchema: { type: 'object', properties: {} },
      run: () => ({ entries: state.audit }),
    },
  ];

  // Harden schemas for agent runtimes (ChatGPT docs recommend additionalProperties: false)
  // and attach human-readable titles for "Site tools" UI surfaces.
  const TITLES = {
    get_document_overview: 'Document overview', list_claims: 'List claims',
    get_studies: 'Study-level data', run_meta_analysis: 'Run meta-analysis',
    leave_one_out: 'Leave-one-out sensitivity', subgroup_analysis: 'Subgroup analysis',
    meta_regression: 'Meta-regression', funnel_check: 'Publication-bias check',
    cumulative_meta: 'Cumulative meta-analysis', evaluate_claim: 'Evaluate a claim',
    propose_study: 'Propose adding a study', get_audit_log: 'Audit ledger',
  };
  for (const t of tools) {
    t.title = TITLES[t.name] || t.name;
    if (t.inputSchema && t.inputSchema.additionalProperties === undefined) t.inputSchema.additionalProperties = false;
  }

  function invokeTool(name, args = {}) {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`unknown tool: ${name}`);
    return tool.run(args || {});
  }

  // ---------- WebMCP registration ----------
  async function registerWebMCP() {
    const mc = (typeof document !== 'undefined' && document.modelContext)
      || (typeof navigator !== 'undefined' && navigator.modelContext) || null;
    if (!mc || typeof mc.registerTool !== 'function') {
      state.agent = { active: false, detail: 'No WebMCP runtime (document.modelContext) in this browser.' };
      return state.agent;
    }
    let ok = 0;
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
          execute: async (inputs) => invokeTool(t.name, inputs ?? {}),
        });
        ok++;
      } catch (e) {
        console.warn(`[living-evidence] registerTool(${t.name}) failed:`, e);
      }
    }
    state.agent = { active: ok > 0, detail: `${ok}/${tools.length} tools registered with the browser's WebMCP runtime.`, count: ok };
    return state.agent;
  }

  function renderStatus() {
    if (!mounts.status) return;
    const a = state.agent;
    mounts.status.replaceChildren(
      h('span', { class: `le-status-dot ${a.active ? 'le-on' : 'le-off'}` }),
      h('span', {
        text: a.active
          ? `Agent interface active — ${a.detail} Your AI can now cross-examine this document.`
          : `Agent interface inactive — ${a.detail} You can still drive every tool by hand from the Tool console below.`,
      }),
    );
  }

  // ---------- tool console (human-driven fallback / transparency panel) ----------
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
      funnel_check: {}, cumulative_meta: {}, evaluate_claim: { claim_id: (config.claims?.[0]?.id) || 'c1' },
      propose_study: { author: 'Example & Author', year: 1976, yi: 0.1, vi: 0.05, weeks: 2, setting: 'group', tester: 'blind', source: 'Journal of Examples 12(3)', quote: 'd = 0.10 (SE 0.22)' },
      get_audit_log: {},
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
          const res = invokeTool(sel.value, args);
          out.textContent = JSON.stringify(res, null, 2);
        } catch (e) { out.textContent = `ERROR: ${e.message}`; }
      },
    });
    mounts.console.replaceChildren(
      h('div', { class: 'le-console-row' }, [sel, btn]), desc, argBox, out,
    );
  }

  // ---------- boot ----------
  const fit0 = refreshHeadline();
  ledger('init', 'init', `document loaded — evidence base k=${included().length}, pooled ${fmt(fit0.estimate)} [${fmt(fit0.ci_lower)}, ${fmt(fit0.ci_upper)}], p=${fmt(fit0.p)}`, true);
  renderConsole();
  const ready = registerWebMCP().then((a) => { renderStatus(); return a; });

  const api = {
    version: '0.1.0',
    tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, readOnly: !!t.readOnly })),
    invokeTool,
    invokeToolJSON: (name, args) => JSON.stringify(invokeTool(name, args)),
    state, ready,
    _analyses: analyses,
  };
  if (typeof window !== 'undefined') window.LivingEvidence = api;
  return api;
}
