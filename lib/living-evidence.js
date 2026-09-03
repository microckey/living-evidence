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
import { evaluateRules, validateTest } from './claim-rules.js';
import {
  canonicalStringify, decodeBase64url, encodeBase64url, normalizeP256PublicJwk,
  p256JwkThumbprint, RECEIPT_PAYLOAD_KEYS, sha256Hex, sha256Object, validateReceiptV1,
} from './integrity.js';
import { normalizeEvidencePackage, PACKAGE_VERSION } from './evidence-package.js';

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
const RULE_OUTCOME_SCOPE = 'document-registered rule outcome only — not an independent judgment of truth, validity, risk of bias, or evidence quality';
// Kept as a response alias for v0.1 clients. New clients should read
// rule_outcome_scope and rule_outcome.
const VERDICT_SCOPE = RULE_OUTCOME_SCOPE;
const RULE_OUTCOME = {
  supported: 'passed',
  challenged: 'failed',
  nuanced: 'inconclusive',
  untested: 'not_run',
};

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
  // Treat caller-owned configuration as untrusted input. The public data modules
  // remain importable by other scripts on the page; cloning here prevents a later
  // mutation of those objects from silently changing a signed scientific state.
  const dataset = structuredClone(config.dataset);
  const subgroupFields = structuredClone(config.subgroupFields || {});
  const moderators = structuredClone(config.moderators || {});
  const configuredClaims = structuredClone(config.claims || []);
  // A supplied storage key makes the whole local session reload-persistent in
  // either mode. It is device-local continuity, not a shared archive or identity.
  const storageKey = config.storageKey || null;
  // Title and hypothesis are fixed prose in a document, but editable state in a
  // workspace (set_hypothesis), so they live here rather than being read off the
  // config object on every call.
  const doc = { title: config.title, hypothesis: config.hypothesis };
  const initialDoc = { ...doc };
  const configuredPublishedReceipt = config.publishedReceipt ? structuredClone(config.publishedReceipt) : null;
  if (configuredPublishedReceipt) validateReceiptV1(configuredPublishedReceipt);

  const state = {
    mode,
    // Records that already carry provenance keep it: an EXPORTED document ships the
    // approval provenance (source, quote, hashes) of every record it was built from,
    // and overwriting that with a generic label would be a lie about where it came from.
    base: dataset.studies.map((s) => ({
      ...s,
      experiment_id: s.experiment_id || s.id,
      smd_variant: s.smd_variant || dataset.smd_variant || null,
      effect_direction: s.effect_direction || dataset.effect_direction || null,
      collection_frame: s.collection_frame || dataset.collection_frame || null,
      provenance: s.provenance && typeof s.provenance === 'object'
        ? s.provenance
        : {
            source_type: 'unspecified', source: typeof s.provenance === 'string' ? s.provenance : null,
            source_url: null, source_locator: null, quote: null, derivation: null,
            primary_source_checked: false, effect_size_derivation_checked: false,
            verification_status: 'unverified',
          },
      risk_of_bias: s.risk_of_bias && typeof s.risk_of_bias === 'object'
        ? s.risk_of_bias
        : { status: 'not_assessed', instrument: null, domains: [], note: 'No structured risk-of-bias assessment supplied.' },
    })),
    approved: [],
    pending: [],   // {study, status: 'pending'|'approved'|'rejected', proposal}
    audit: Array.isArray(config.initialAudit) ? config.initialAudit.map((entry) => structuredClone(entry)) : [],
    runCounter: Number.isInteger(config.initialRunCounter) && config.initialRunCounter >= 0 ? config.initialRunCounter : 0,
    // Version of the evidence base itself: 1 at boot, +1 on every human approval.
    // A verdict evaluated at an older version is STALE — that is machine-readable,
    // not a CSS afterthought.
    evidenceVersion: Number.isInteger(config.initialEvidenceVersion) && config.initialEvidenceVersion >= 1
      ? config.initialEvidenceVersion : 1,
    claimStatus: new Map(), // id -> {verdict, run, evaluated_version}
    agent: { active: false, status: 'absent', detail: 'not initialized' },
    auditLegacyImported: false,
    imports: Array.isArray(config.initialImports) ? config.initialImports.map((item) => structuredClone(item)) : [],
    lastReceipt: null,
    publishedReceipt: configuredPublishedReceipt,
    lastReceiptSignatureStatus: 'none',
    publishedReceiptSignatureStatus: configuredPublishedReceipt ? 'pending' : 'none',
    storage: {
      configured: !!storageKey,
      read_status: storageKey ? 'not_attempted' : 'not_configured',
      write_status: storageKey ? 'not_attempted' : 'not_configured',
      removal_status: storageKey ? 'not_attempted' : 'not_configured',
      last_error: null,
    },
  };
  const included = () => state.base.concat(state.approved);

  // Claims are data. A `check()` function would be un-auditable and un-exportable,
  // so it is now a hard error rather than a silently different code path.
  const claims = configuredClaims.map((c) => {
    if (!c || typeof c !== 'object' || !c.id) throw new Error('every entry of config.claims needs an id');
    if (typeof c.check === 'function') {
      throw new Error(`claim ${c.id}: check() functions are no longer supported — give the claim a declarative "test" AST (see lib/claim-rules.js)`);
    }
    validateTest(c.test, `claim ${c.id}`);
    return c;
  });
  const authoredClaims = structuredClone(claims);
  const bootBaseline = {
    audit: structuredClone(state.audit),
    runCounter: state.runCounter,
    evidenceVersion: state.evidenceVersion,
    imports: structuredClone(state.imports),
  };

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
    reproducibility: $(config.mounts?.reproducibility || '#le-reproducibility'),
  };

  // ---------- audit ledger ----------
  // Who is calling right now. invokeTool sets it for the duration of one call, so
  // analyses nested inside a claim evaluation inherit the true actor instead of
  // guessing. Ledger entries may still name an actor explicitly (boot = system,
  // approval buttons = human).
  let currentActor = 'agent';

  function sealAuditEntry(entry, previousEntryHash) {
    const sealed = { ...entry, previous_entry_hash: previousEntryHash || null };
    sealed.entry_hash = sha256Object(sealed);
    return sealed;
  }

  function verifyAuditChain(entries = state.audit) {
    let previous = null;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry || entry.run !== i + 1 || entry.previous_entry_hash !== previous
        || typeof entry.entry_hash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(entry.entry_hash)) {
        return { valid: false, checked_entries: i, first_invalid_run: entry?.run ?? i + 1, head: previous };
      }
      const { entry_hash, ...unsigned } = entry;
      const expected = sha256Object(unsigned);
      if (entry_hash !== expected) {
        return { valid: false, checked_entries: i, first_invalid_run: entry.run ?? i + 1, head: previous };
      }
      if (entry.result_payload_status === 'stored'
        && sha256Object(entry.result_payload) !== entry.result_digest) {
        return { valid: false, checked_entries: i, first_invalid_run: entry.run, head: previous, reason: 'result payload digest mismatch' };
      }
      if (entry.result_payload_status === 'no_result'
        && (entry.result_payload !== null || entry.result_digest !== null)) {
        return { valid: false, checked_entries: i, first_invalid_run: entry.run, head: previous, reason: 'unexpected result payload' };
      }
      if (!['stored', 'no_result', 'omitted_exact_artifact', 'legacy_unavailable'].includes(entry.result_payload_status)) {
        return { valid: false, checked_entries: i, first_invalid_run: entry.run, head: previous, reason: 'invalid result payload status' };
      }
      previous = entry_hash;
    }
    return { valid: true, checked_entries: entries.length, first_invalid_run: null, head: previous };
  }

  /** v0.1 snapshots had FNV result fingerprints but no chain. Preserve their
   * history, label the migration, and seal the imported sequence from this point.
   * This does not retroactively prove that the legacy snapshot was authentic. */
  function migrateLegacyAudit(entries) {
    let previous = null;
    return entries.map((entry) => {
      const { entry_hash: _oldHash, previous_entry_hash: _oldPrevious, ...legacy } = entry || {};
      const migrated = sealAuditEntry({
        ...legacy, legacy_unverified: true,
        result_payload: null, result_payload_status: 'legacy_unavailable',
      }, previous);
      previous = migrated.entry_hash;
      return migrated;
    });
  }

  if (state.audit.length) {
    const shippedChain = verifyAuditChain(state.audit);
    if (!shippedChain.valid) throw new Error(`embedded audit chain is invalid at run ${shippedChain.first_invalid_run}`);
    const lastRun = state.audit.at(-1)?.run;
    if (!Number.isInteger(lastRun) || state.runCounter !== lastRun) {
      throw new Error('embedded audit runCounter does not match the sealed chain');
    }
  }

  /** Render one ledger entry as a row. Used live AND when replaying a restored
   *  ledger — a restored row keeps its original run number and actor; the page
   *  never re-ledgers history it merely reloaded. */
  function renderLedgerRow(entry) {
    if (!mounts.ledger) return null;
    const row = h('li', {
      class: `le-ledger-row le-${entry.actor}`,
      title: `entry ${entry.entry_hash || 'unsealed'} · result ${entry.result_digest || '—'} · inputs ${JSON.stringify(entry.inputs)}`,
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
   * Envelope: {run, time, actor, kind, tool, inputs, summary, evidence_version,
   * result_digest, previous_entry_hash, entry_hash}. SHA-256 seals both the
   * deterministic result and the append order. A chain detects later edits; it
   * does not identify the author unless a receipt is externally anchored.
   */
  function ledger({ kind, tool, summary, actor = null, inputs = null, result = undefined }) {
    const n = ++state.runCounter;
    const who = actor || currentActor;
    const resultDigest = result === undefined ? null : sha256Object(result);
    const omitArtifact = tool === 'export_document' && typeof result === 'string';
    const unsigned = {
      run: n,
      time: new Date().toISOString(),
      actor: who,
      kind,
      tool,
      inputs: inputs == null ? {} : inputs,
      summary,
      evidence_version: state.evidenceVersion,
      result_digest: resultDigest,
      result_payload: result === undefined || omitArtifact ? null : structuredClone(result),
      result_payload_status: result === undefined
        ? 'no_result'
        : omitArtifact ? 'omitted_exact_artifact' : 'stored',
    };
    const entry = sealAuditEntry(unsigned, state.audit.at(-1)?.entry_hash || null);
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
    if (state.lastReceipt || state.publishedReceipt) renderReproducibilityPanel();
    return n;
  }

  // ---------- persistence (workspace mode) ----------
  // A workspace is a working session, not an article: it must survive a reload.
  // A document can also opt into persistence (the exemplar does); its shipped
  // evidence stays embedded while reader analyses and decisions survive reloads.

  /** Everything needed to reconstruct the session, including the ledger itself. */
  function snapshot() {
    return {
      v: 2,
      mode,
      title: doc.title,
      hypothesis: doc.hypothesis,
      approved: state.approved,
      pending: state.pending,
      claims: claims.map((c) => ({ id: c.id, statement: c.statement, rule: c.rule, test: c.test })),
      claimStatus: [...state.claimStatus],
      ledger: state.audit,
      evidenceVersion: state.evidenceVersion,
      runCounter: state.runCounter,
      auditLegacyImported: state.auditLegacyImported,
      imports: state.imports,
      lastReceipt: state.lastReceipt,
    };
  }

  function persist() {
    if (!storageKey) return false;
    try {
      const encoded = JSON.stringify(snapshot());
      localStorage.setItem(storageKey, encoded);
      if (localStorage.getItem(storageKey) !== encoded) throw new Error('storage read-back did not match the snapshot');
      state.storage.write_status = 'saved_and_read_back';
      state.storage.last_error = null;
      return true;
    } catch (e) {
      // Private mode, quota, or a disabled storage partition. A workspace that
      // cannot save is still a usable workspace — it just forgets on reload.
      state.storage.write_status = 'memory_only_storage_failed';
      state.storage.last_error = String(e.message || e);
      console.warn('[living-evidence] could not save the workspace:', e.message);
      return false;
    }
  }

  function clearPersisted() {
    if (!storageKey) return true;
    try {
      localStorage.removeItem(storageKey);
      if (localStorage.getItem(storageKey) !== null) throw new Error('storage key still exists after removal');
      state.storage.removal_status = 'removed_and_read_back';
      state.storage.last_error = null;
      return true;
    } catch (e) {
      state.storage.removal_status = 'storage_removal_failed';
      state.storage.last_error = String(e.message || e);
      console.warn('[living-evidence] could not remove the saved workspace:', e.message);
      return false;
    }
  }

  // ---------- provenance, content identity and signed receipts ----------

  function countExperiments(studies = included()) {
    return new Set(studies.map((s) => s.experiment_id || s.id)).size;
  }

  function dependenceDisclosure(studies = included()) {
    const clusters = new Map();
    for (const study of studies) {
      const experimentId = study.experiment_id || study.id;
      if (!clusters.has(experimentId)) clusters.set(experimentId, []);
      clusters.get(experimentId).push(study.id);
    }
    const multiRecordExperiments = [...clusters]
      .filter(([, recordIds]) => recordIds.length > 1)
      .map(([experiment_id, record_ids]) => ({ experiment_id, record_ids }));
    const recordCount = studies.length;
    const experimentCount = clusters.size;
    const clustered = multiRecordExperiments.length > 0;
    return {
      record_count: recordCount,
      experiment_count: experimentCount,
      covariance_modeled: false,
      multi_record_experiments: multiRecordExperiments,
      model: clustered
        ? 'working-independence row-wise model; records sharing an experiment are treated as independent'
        : 'one independent effect-size record per experiment; no covariance, multilevel model, or robust variance estimation',
      warning: clustered
        ? `${recordCount} effect-size records represent ${experimentCount} experiments. The historical row-wise analysis does not model within-experiment covariance for ${multiRecordExperiments.map((cluster) => cluster.experiment_id).join(', ')}; standard errors and inferential uncertainty may therefore be understated.`
        : 'No repeated experiment_id is present, but the runtime has no covariance, multilevel, or robust-variance engine and rejects a second record for an experiment.',
    };
  }

  function resultWithDependence(result, studies = included()) {
    const dependence_disclosure = dependenceDisclosure(studies);
    return {
      ...result,
      record_count: dependence_disclosure.record_count,
      experiment_count: dependence_disclosure.experiment_count,
      dependence_warning: dependence_disclosure.warning,
      dependence_disclosure,
    };
  }

  function dependenceCaption(studies = included()) {
    const disclosure = dependenceDisclosure(studies);
    return disclosure.record_count > disclosure.experiment_count
      ? `${disclosure.record_count} records / ${disclosure.experiment_count} experiments; working independence, within-experiment covariance unmodeled`
      : `${disclosure.record_count} independent experiment record(s)`;
  }

  function estimandDefinition(studies = included()) {
    const first = studies[0] || {};
    return {
      smd_variant: dataset.smd_variant || first.smd_variant || null,
      effect_direction: dataset.effect_direction || first.effect_direction || null,
      collection_frame: dataset.collection_frame || first.collection_frame || null,
    };
  }

  function evidenceQuality(studies = included()) {
    const provenance = studies.map((s) => (s.provenance && typeof s.provenance === 'object' ? s.provenance : {}));
    const risks = studies.map((s) => (s.risk_of_bias && typeof s.risk_of_bias === 'object' ? s.risk_of_bias : {}));
    return {
      effect_size_records: studies.length,
      experiments: countExperiments(studies),
      secondary_source_transcriptions: provenance.filter((p) => p.source_type === 'secondary_dataset').length,
      primary_source_checked: provenance.filter((p) => p.primary_source_checked === true).length,
      effect_size_derivation_checked: provenance.filter((p) => p.effect_size_derivation_checked === true).length,
      records_with_source_locator: provenance.filter((p) => typeof p.source_locator === 'string' && p.source_locator.trim()).length,
      records_with_doi: provenance.filter((p) => typeof p.doi === 'string' && p.doi.trim()).length,
      structured_risk_of_bias_assessment_supplied_unverified: risks.filter((r) => ['low', 'some_concerns', 'high'].includes(r.status)
        && typeof r.instrument === 'string' && r.instrument.trim()
        && typeof r.assessor === 'string' && r.assessor.trim()
        && typeof r.assessment_date === 'string' && r.assessment_date.trim()
        && typeof r.source === 'string' && r.source.trim()
        && typeof r.overall_rationale === 'string' && r.overall_rationale.trim()
        && Array.isArray(r.domains) && r.domains.length > 0).length,
      risk_of_bias_not_assessed: risks.filter((r) => r.status === 'not_assessed').length,
      note: 'Numerical reproduction over yi/vi is not primary-source extraction verification, independent validation of an author-supplied risk-of-bias assessment, or validation of the model assumptions.',
    };
  }

  function scientificState() {
    const estimand = estimandDefinition();
    return {
      manifest_version: 'living-evidence-manifest/1',
      format_version: '0.2.0',
      document: { title: doc.title, hypothesis: doc.hypothesis },
      dataset: {
        id: dataset.id,
        label: dataset.label,
        effect_measure: dataset.effect_measure,
        ...estimand,
        fields: dataset.fields || {},
        unit_note: dataset.unit_note || null,
        sources: dataset.sources || [],
        provenance_note: dataset.provenance_note || null,
        studies: included(),
      },
      imported_packages: state.imports,
      claims: claims.map((c) => ({ id: c.id, statement: statementOf(c), rule: c.rule, test: c.test })),
      analysis_spec: {
        default_model: 'REML random-effects',
        subgroup_fields: subgroupFields,
        moderators,
        dependence_model: dependenceDisclosure().model,
        dependence_disclosure: dependenceDisclosure(),
      },
    };
  }

  function dataManifest(includeRecords = false) {
    const scientific_state = scientificState();
    const scientific_state_sha256 = sha256Object(scientific_state);
    return {
      manifest_version: scientific_state.manifest_version,
      format_version: scientific_state.format_version,
      document: scientific_state.document,
      dataset: {
        id: scientific_state.dataset.id,
        label: scientific_state.dataset.label,
        effect_measure: scientific_state.dataset.effect_measure,
        smd_variant: scientific_state.dataset.smd_variant,
        effect_direction: scientific_state.dataset.effect_direction,
        collection_frame: scientific_state.dataset.collection_frame,
        fields: scientific_state.dataset.fields,
        unit_note: scientific_state.dataset.unit_note,
        sources: scientific_state.dataset.sources,
        provenance_note: scientific_state.dataset.provenance_note,
        record_count: included().length,
        experiment_count: countExperiments(),
        ...(includeRecords ? { studies: included() } : {}),
      },
      claims: scientific_state.claims,
      analysis_spec: scientific_state.analysis_spec,
      imported_packages: scientific_state.imported_packages,
      evidence_quality: evidenceQuality(),
      scientific_state_sha256,
      records_included: includeRecords,
    };
  }

  /** Capture one internally consistent science + ledger view before any await.
   *  Receipts and exports must never mix state from two user actions. */
  function captureReceiptState() {
    const audit = structuredClone(state.audit);
    const runCounter = state.runCounter;
    const lastRun = audit.at(-1)?.run ?? 0;
    if (lastRun !== runCounter) throw new Error('audit run counter does not match the captured ledger');
    return {
      scientific: structuredClone(scientificState()),
      audit,
      runCounter,
      evidenceVersion: state.evidenceVersion,
    };
  }

  function reproducibilityStatus() {
    const chain = verifyAuditChain();
    const manifest = dataManifest(false);
    const published = state.publishedReceipt;
    const latestAssessment = assessReceipt(state.lastReceipt, state.lastReceiptSignatureStatus);
    const publishedAssessment = assessReceipt(published, state.publishedReceiptSignatureStatus);
    let status = 'unanchored_live_state';
    if (!chain.valid) {
      status = 'audit_chain_invalid';
    } else if (published) {
      if (publishedAssessment.signature_status === 'pending') status = 'published_receipt_verification_pending';
      else if (publishedAssessment.signature_status !== 'valid') status = 'published_receipt_signature_invalid';
      else if (!publishedAssessment.audit_anchor_matches) status = 'published_receipt_audit_anchor_missing';
      else if (!publishedAssessment.scientific_state_matches) status = 'changed_since_published_receipt';
      else if (!publishedAssessment.evidence_version_matches) status = 'evidence_version_changed_since_published_receipt';
      else if (!publishedAssessment.covers_current_audit) status = 'signed_scientific_state_matches_published_receipt_with_local_audit_suffix';
      else status = 'signed_scientific_state_and_current_audit_match_published_receipt';
    } else if (latestAssessment.status === 'valid_current_state') {
      status = 'matches_self_signed_session_receipt';
    } else if (state.lastReceipt) {
      status = latestAssessment.status;
    }
    return {
      status,
      document_version: manifest.scientific_state_sha256,
      scientific_state_sha256: manifest.scientific_state_sha256,
      evidence_version: state.evidenceVersion,
      audit_chain: {
        algorithm: 'SHA-256', ...chain,
        legacy_history_rehashed_without_original_authentication: state.auditLegacyImported,
      },
      latest_signed_receipt: state.lastReceipt,
      latest_receipt_verification: latestAssessment,
      published_receipt: published,
      published_receipt_verification: publishedAssessment,
      persistence: !storageKey
        ? 'memory_only_not_configured'
        : state.storage.write_status === 'memory_only_storage_failed'
          ? 'memory_only_storage_failed'
          : state.storage.write_status === 'saved_and_read_back'
            ? 'device_local_snapshot_saved_and_read_back'
            : 'device_local_storage_configured_not_yet_confirmed',
      persistence_detail: structuredClone(state.storage),
      assurance: 'Signed scientific-state identity, append-order integrity, and self-signed session continuity.',
      not_assured: ['in-page verification of its own runtime or artifact bytes', 'author identity', 'trusted timestamp', 'peer review', 'primary-source correctness', 'server-side preservation'],
    };
  }

  let signingKeyPromise = null;
  function getSigningKey() {
    if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable; cannot create a signed receipt');
    signingKeyPromise ||= globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'],
    );
    return signingKeyPromise;
  }

  function signedPayloadFromReceipt(receipt) {
    return Object.fromEntries(RECEIPT_PAYLOAD_KEYS.map((key) => [key, receipt[key]]));
  }

  function assessReceipt(receipt, signatureStatus) {
    if (!receipt || typeof receipt !== 'object') {
      return {
        status: 'none', signature_status: 'none', scientific_state_matches: null,
        audit_anchor_matches: null, artifact_sha256: null,
      };
    }
    const currentState = sha256Object(scientificState());
    const currentChain = verifyAuditChain();
    const covers = receipt.covers_through_run;
    const coveredEntries = Number.isInteger(covers) && covers >= 0 && covers <= state.audit.length
      ? state.audit.slice(0, covers) : null;
    const coveredChain = coveredEntries ? verifyAuditChain(coveredEntries) : null;
    const scientificStateMatches = receipt.scientific_state_sha256 === currentState
      && receipt.document_version === currentState;
    const auditAnchorMatches = !!coveredChain?.valid && coveredChain.head === receipt.audit_head;
    const evidenceVersionMatches = receipt.evidence_version === state.evidenceVersion;
    const coversCurrentAudit = auditAnchorMatches && covers === state.runCounter
      && receipt.audit_head === currentChain.head;
    const unsignedRunsAfterReceipt = Number.isInteger(covers)
      ? Math.max(0, state.runCounter - covers) : null;
    let status;
    if (signatureStatus === 'pending') status = 'receipt_signature_verification_pending';
    else if (signatureStatus !== 'valid') status = 'receipt_signature_invalid';
    else if (!auditAnchorMatches) status = 'receipt_audit_anchor_missing';
    else if (!scientificStateMatches) status = 'changed_since_signed_receipt';
    else if (!evidenceVersionMatches) status = 'evidence_version_changed_since_signed_receipt';
    else if (!coversCurrentAudit) status = 'valid_science_with_signed_audit_prefix';
    else status = 'valid_current_state';
    return {
      status,
      signature_status: signatureStatus,
      scientific_state_matches: scientificStateMatches,
      audit_anchor_matches: auditAnchorMatches,
      covered_chain_valid: coveredChain?.valid ?? false,
      evidence_version_matches: evidenceVersionMatches,
      covers_current_audit: coversCurrentAudit,
      unsigned_runs_after_receipt: unsignedRunsAfterReceipt,
      runtime_sha256_claimed: receipt.runtime_sha256 ?? null,
      runtime_verification: receipt.runtime_sha256 ? 'not_performed_in_page' : 'not_claimed',
      artifact_sha256: receipt.artifact_sha256 ?? null,
      artifact_verification: receipt.artifact_sha256 ? 'external_sidecar_verification_required' : 'not_claimed',
    };
  }

  async function verifyReceiptSignature(receipt) {
    try {
      const { publicKey, signatureBytes, payload } = validateReceiptV1(receipt);
      const key = await globalThis.crypto.subtle.importKey(
        'jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
      );
      const verified = await globalThis.crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' }, key,
        signatureBytes,
        new TextEncoder().encode(canonicalStringify(payload)),
      );
      return verified ? 'valid' : 'invalid';
    } catch {
      return 'invalid';
    }
  }

  async function makeSignedReceipt({ runtime_sha256 = null, artifact_sha256 = null, store = true, snapshot = null } = {}) {
    const actor = currentActor;
    // Snapshot synchronously, before key generation or signing yields control.
    const captured = snapshot ? structuredClone(snapshot) : captureReceiptState();
    const chain = verifyAuditChain(captured.audit);
    if (!chain.valid) throw new Error(`cannot sign an invalid audit chain (first invalid run ${chain.first_invalid_run})`);
    const keyPair = await getSigningKey();
    const publicKey = normalizeP256PublicJwk(await globalThis.crypto.subtle.exportKey('jwk', keyPair.publicKey));
    const keyFingerprint = p256JwkThumbprint(publicKey);
    const scientific = captured.scientific;
    const scientificStateDigest = sha256Object(scientific);
    const payload = {
      receipt_version: 'living-evidence-receipt/1',
      created_at: new Date().toISOString(),
      document_version: scientificStateDigest,
      scientific_state_sha256: scientificStateDigest,
      runtime_sha256,
      artifact_sha256,
      evidence_version: captured.evidenceVersion,
      audit_head: chain.head,
      covers_through_run: captured.runCounter,
      signer_key_fingerprint: keyFingerprint,
      signer_scope: 'self-generated non-extractable key for this page load; the key rotates on reload',
      assurance: artifact_sha256
        ? 'signature covers the exact artifact SHA-256 and captured scientific/audit state for this session key'
        : 'signature covers the captured scientific/audit state for this session key',
      not_assured: [
        'in-page verification of the runtime or containing artifact; use the detached receipt verifier',
        'author identity unless the public-key fingerprint is pinned externally',
        'trusted timestamp', 'peer review', 'source correctness',
      ],
      note: 'The non-extractable key is self-generated for this page load and rotates on reload; receipts are individually self-signed, not a continuous author identity. Pin signer_key_fingerprint in an external archive, repository release, DOI record, or trusted registry before treating this signature as authorship evidence.',
    };
    const encoded = new TextEncoder().encode(canonicalStringify(payload));
    const signatureBytes = await globalThis.crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, encoded,
    );
    const verified = await globalThis.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, keyPair.publicKey, signatureBytes, encoded,
    );
    const receipt = {
      ...payload,
      signature: { algorithm: 'ECDSA-P256-SHA256', value: encodeBase64url(signatureBytes), public_key_jwk: publicKey },
    };
    if (!verified) throw new Error('new receipt signature failed immediate verification');
    if (store) {
      state.lastReceipt = receipt;
      state.lastReceiptSignatureStatus = 'valid';
      renderReproducibilityPanel();
      persist();
    }
    return { receipt, actor };
  }

  async function createReproducibilityReceipt() {
    const actor = currentActor;
    // Record the signing request first so the resulting receipt can cover the
    // complete audit prefix including the human/agent action that created it.
    ledger({
      kind: 'receipt', tool: 'create_reproducibility_receipt', actor,
      inputs: { action: 'sign_current_scientific_state_and_audit_prefix' },
      result: { requested: true },
      summary: 'requested a self-signed reproducibility receipt for the current scientific state and audit prefix',
    });
    const { receipt } = await makeSignedReceipt();
    return receipt;
  }

  function renderReproducibilityPanel() {
    if (!mounts.reproducibility) return;
    const status = reproducibilityStatus();
    const localReceipt = state.lastReceipt;
    const publishedReceipt = state.publishedReceipt;
    const receiptLine = (label, receipt, assessment, empty) => h('p', {
      class: 'le-integrity-note',
      text: receipt
        ? `${label} · ${receipt.document_version.slice(0, 26)}… · key ${receipt.signer_key_fingerprint.slice(0, 19)}… · covers through run #${receipt.covers_through_run} · ${assessment.status.replaceAll('_', ' ')}`
        : `${label} · ${empty}`,
    });
    const publishedLine = receiptLine(
      'Published release receipt', publishedReceipt, status.published_receipt_verification,
      'none embedded in this document',
    );
    const localLine = receiptLine(
      'Local reader-session receipt', localReceipt, status.latest_receipt_verification,
      `not sealed · current state ${status.document_version.slice(0, 26)}… · audit chain ${status.audit_chain.valid ? 'valid' : 'INVALID'}`,
    );
    const limits = h('p', { class: 'le-integrity-limits', text: 'A self-signed receipt detects scientific-state and audit changes for its key. This page cannot independently verify the runtime performing the check or its own containing bytes; verify the detached artifact receipt externally. The signature does not prove author identity, peer review, or source correctness unless its key fingerprint is anchored elsewhere.' });
    const button = h('button', {
      class: 'le-btn', type: 'button', text: localReceipt ? 'Seal current state again' : 'Create local session receipt',
      onclick: async () => {
        button.disabled = true;
        button.textContent = 'Signing…';
        try { await invokeTool('create_reproducibility_receipt', {}, { actor: 'human' }); }
        catch (e) { localLine.textContent = `Could not sign: ${e.message}`; }
        finally { button.disabled = false; button.textContent = 'Seal current state again'; }
      },
    });
    const children = [publishedLine, localLine, limits, button];
    if (localReceipt) {
      children.push(h('button', {
        class: 'le-btn', type: 'button',
        text: localReceipt.artifact_sha256 ? 'Download detached artifact receipt' : 'Download local state receipt',
        onclick: () => {
          const filename = localReceipt.artifact_sha256
            ? `living-evidence-${localReceipt.artifact_sha256.slice(7, 19)}.receipt.json`
            : `living-evidence-${localReceipt.scientific_state_sha256.slice(7, 19)}.state-receipt.json`;
          const url = URL.createObjectURL(new Blob([`${JSON.stringify(localReceipt, null, 2)}\n`], { type: 'application/json' }));
          const anchor = h('a', { href: url, download: filename, style: 'display:none' });
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        },
      }));
    }
    mounts.reproducibility.replaceChildren(...children);
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
        ? `Evidence base changed after this registered-rule outcome (evaluated at evidence version ${st.evaluated_version}, now ${state.evidenceVersion}) — re-evaluate`
        : `Document-registered rule outcome from run #${st.run}, evidence version ${st.evaluated_version}; not a truth or quality rating`);
    }
  }

  /** Draw (or redraw) one verdict badge. Separate from setClaimStatus because a
   *  restored session repaints badges it did NOT just compute. */
  function paintClaimBadge(claimId, verdict, run) {
    const span = document.querySelector(`[data-claim="${claimId}"]`);
    if (!span) return;
    span.querySelector('.le-chip')?.remove();
    const label = { supported: '✓ rule passed', challenged: '✗ rule failed', nuanced: '△ inconclusive' }[verdict] || verdict;
    span.appendChild(h('sup', { class: `le-chip le-chip-${verdict}`, text: `${label} · run #${run}` }));
    span.classList.add('le-claim-tested');
  }

  function setClaimStatus(claimId, verdict, run, reason) {
    state.claimStatus.set(claimId, {
      verdict, run, reason, evaluated_version: state.evidenceVersion,
    });
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
      const knownIds = new Set(included().map((s) => s.id));
      const unknownIds = exclude.filter((id) => !knownIds.has(id));
      if (unknownIds.length) throw new Error(`unknown study id(s) in exclude: ${unknownIds.join(', ')}. Call get_studies for valid ids.`);
      const excluded = new Set(exclude);
      const studies = included().filter((s) => !excluded.has(s.id));
      if (studies.length < 2) throw new Error('fewer than 2 studies after exclusions');
      const fit = metaAnalyze(studies, { method });
      const result = resultWithDependence(fit, studies);
      const title = `${fit.model}, k=${fit.k}${exclude.length ? `, excluding ${exclude.join(', ')}` : ''}`;
      const run = ledger({
        kind: 'analysis', tool: 'run_meta_analysis', inputs: { method, exclude }, result,
        summary: `${title} → ${fmt(fit.estimate)} [${fmt(fit.ci_lower)}, ${fmt(fit.ci_upper)}], p=${fmt(fit.p)}`,
      });
      let figure = null;
      if (!silentFigure) {
        figure = renderFigure(run, 'Forest plot', forestPlot(studyRows(studies, fit.tau2), {
          label: 'Pooled', est: fit.estimate, lo: fit.ci_lower, hi: fit.ci_upper,
        }), `${title} · ${dependenceCaption(studies)}`);
      }
      return { run, figure, ...result, excluded: exclude };
    },

    loo() {
      const studies = included();
      const res = leaveOneOut(studies, { method: 'REML' });
      const result = resultWithDependence(res, studies);
      const run = ledger({
        kind: 'analysis', tool: 'leave_one_out', inputs: {}, result,
        summary: `leave-one-out (k=${studies.length}) → estimates ${fmt(res.min_estimate)}…${fmt(res.max_estimate)}; significance flips: ${res.flips_significance.length ? res.flips_significance.join(', ') : 'none'}`,
      });
      const figure = renderFigure(run, 'Leave-one-record-out sensitivity', looPlot(res.rows, res.full_estimate), `Pooled REML estimate re-fitted with each effect-size record omitted · ${dependenceCaption(studies)}`);
      return { run, figure, ...result };
    },

    subgroup({ split_field, split_at = null } = {}) {
      const allowed = subgroupFields;
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
      const studies = included();
      const res = subgroupAnalysis(studies, labelOf, { method: 'REML' });
      const result = resultWithDependence(res, studies);
      const groupLine = res.groups.filter((g) => g.estimate !== undefined)
        .map((g) => `${g.group}: ${fmt(g.estimate)} (p=${fmt(g.p)})`).join(' | ');
      const run = ledger({
        kind: 'analysis', tool: 'subgroup_analysis', inputs: { split_field, split_at }, result,
        summary: `subgroups by ${split_field} → ${groupLine}`,
      });
      // figure: forest of group summaries
      const rows = res.groups.filter((g) => g.estimate !== undefined)
        .map((g) => ({ label: `${g.group} (k=${g.k})`, yi: g.estimate, lo: g.ci_lower, hi: g.ci_upper, weight: 1 / (g.se * g.se) }));
      const figure = renderFigure(run, 'Subgroup analysis', forestPlot(rows, null, { xlab: 'Pooled SMD per subgroup' }),
        `${res.between_group_test ? `between-group Q=${res.between_group_test.Q_between} (df ${res.between_group_test.df}), p=${fmt(res.between_group_test.p, 4)} · ` : ''}${dependenceCaption(studies)}`);
      return { run, figure, ...result };
    },

    metareg({ moderator, cap = null } = {}) {
      const allowed = moderators;
      if (!(moderator in allowed)) throw new Error(`moderator must be one of: ${Object.keys(allowed).join(', ')}`);
      // The cap is an AUTHORED modelling choice that only has a published referent for
      // weeks (Raudenbush's min(weeks,3)). Capping calendar year, or capping at 0,
      // would fit something nobody meant — refuse rather than return a number.
      if (cap !== null && cap !== undefined) {
        if (!Number.isFinite(cap) || cap <= 0) throw new Error(`cap must be a number > 0 (got ${cap})`);
        if (moderator !== 'weeks') throw new Error(`cap is only accepted for moderator "weeks" (the published min(weeks, 3) model); drop cap to regress on ${moderator} untruncated`);
      }
      const xOf = (s) => (cap === null || cap === undefined ? s[moderator] : Math.min(s[moderator], cap));
      const studies = included();
      const res = metaRegression(studies, xOf);
      const result = resultWithDependence(res, studies);
      const capNote = cap === null ? moderator : `min(${moderator}, ${cap})`;
      const run = ledger({
        kind: 'analysis', tool: 'meta_regression', inputs: { moderator, cap }, result,
        summary: `meta-regression on ${capNote} → slope ${fmt(res.moderator.b)} (p=${fmt(res.moderator.p, 5)}), R²=${res.R2_percent === null ? 'n/a' : fmt(res.R2_percent, 1) + '%'}`,
      });
      const figure = renderFigure(run, 'Meta-regression', moderatorPlot(studies, xOf, res, { xlab: capNote }),
        `slope ${fmt(res.moderator.b)} [${fmt(res.moderator.ci_lower)}, ${fmt(res.moderator.ci_upper)}]; residual heterogeneity QE p=${fmt(res.QE_p, 4)} · ${dependenceCaption(studies)}`);
      return { run, figure, moderator_field: capNote, ...result };
    },

    funnel() {
      const studies = included();
      const fe = metaAnalyze(studies, { method: 'FE' });
      const res = eggerTest(studies);
      const result = resultWithDependence(res, studies);
      const run = ledger({
        kind: 'analysis', tool: 'funnel_check', inputs: {}, result,
        summary: `Egger's test → intercept ${fmt(res.intercept)}, p=${fmt(res.p, 4)} (${res.asymmetry_detected ? 'asymmetry detected' : 'no significant asymmetry'})`,
      });
      const figure = renderFigure(run, 'Funnel plot', funnelPlot(studies, fe.estimate), `pseudo-95% CI funnel around the fixed-effect estimate; Egger p=${fmt(res.p, 4)} · ${dependenceCaption(studies)}`);
      return { run, figure, ...result };
    },

    cumulative() {
      const studies = included();
      const res = cumulativeMeta(studies, { method: 'REML' });
      const result = resultWithDependence(res, studies);
      const run = ledger({
        kind: 'analysis', tool: 'cumulative_meta', inputs: {}, result,
        summary: `cumulative meta-analysis by year (${res.rows.length} steps); final ${fmt(res.rows[res.rows.length - 1].estimate)}`,
      });
      const rows = res.rows.map((r) => ({ label: `+ ${r.upto} (k=${r.k})`, yi: r.estimate, lo: r.ci_lower, hi: r.ci_upper, weight: 1 }));
      const figure = renderFigure(run, 'Cumulative meta-analysis', forestPlot(rows, null, { xlab: 'Pooled SMD as evidence accumulates' }), `records added in publication-year order · ${dependenceCaption(studies)}`);
      return { run, figure, ...result };
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

  /** Stable identity for the quantitative record itself. */
  function recordIdentityHash(study, metadata = {}) {
    return sha256Object({
      author: study.author, year: study.year, weeks: study.weeks,
      setting: study.setting, tester: study.tester, n1i: study.n1i, n2i: study.n2i,
      yi: study.yi, vi: study.vi, experiment_id: study.experiment_id,
      smd_variant: study.smd_variant, smd_variant_detail: study.smd_variant_detail ?? null,
      effect_direction: study.effect_direction,
      outcome: metadata.outcome ?? study.outcome ?? null,
      timepoint: metadata.timepoint ?? study.timepoint ?? null,
    });
  }

  /** Commitment to everything a human sees and accepts, excluding timestamps. */
  function proposalCommitment(study, proposal) {
    return sha256Object({
      record_hash: recordIdentityHash(study, proposal),
      record: {
        author: study.author, year: study.year, weeks: study.weeks,
        setting: study.setting, tester: study.tester, n1i: study.n1i, n2i: study.n2i,
        yi: study.yi, vi: study.vi, experiment_id: study.experiment_id,
        record_role: study.record_role, smd_variant: study.smd_variant,
        smd_variant_detail: study.smd_variant_detail ?? null,
        effect_direction: study.effect_direction, collection_frame: study.collection_frame,
      },
      traceability: {
        source: proposal.source, source_url: proposal.source_url ?? null,
        source_locator: proposal.source_locator, doi: proposal.doi ?? null,
        quote: proposal.quote, derivation: proposal.derivation,
        study_design: proposal.study_design ?? study.study_design ?? null,
        outcome: proposal.outcome ?? study.outcome ?? null,
        timepoint: proposal.timepoint ?? study.timepoint ?? null,
      },
      risk_of_bias: {
        status: proposal.risk_of_bias_status ?? study.risk_of_bias?.status ?? null,
        instrument: proposal.risk_of_bias_instrument ?? study.risk_of_bias?.instrument ?? null,
        assessor: proposal.risk_of_bias_assessor ?? study.risk_of_bias?.assessor ?? null,
        assessment_date: proposal.risk_of_bias_date ?? study.risk_of_bias?.assessment_date ?? null,
        source: proposal.risk_of_bias_source ?? study.risk_of_bias?.source ?? null,
        overall_rationale: proposal.risk_of_bias_overall_rationale ?? study.risk_of_bias?.overall_rationale ?? null,
        domains: proposal.risk_of_bias_domains ?? study.risk_of_bias?.domains ?? [],
      },
      import: {
        package_sha256: proposal.import_package_sha256 ?? null,
        dataset: proposal.import_dataset ?? null,
        source_artifact: proposal.source_artifact ?? null,
        source_record_id: proposal.source_record_id ?? null,
      },
    });
  }

  function assertPendingApprovalInvariant(item) {
    if (item.status !== 'pending') throw new Error('this proposal has already been decided');
    const expectedRecordHash = recordIdentityHash(item.study, item.proposal);
    if (item.proposal.record_hash !== expectedRecordHash) throw new Error('record hash no longer matches the proposed quantitative record');
    const expectedProposalHash = proposalCommitment(item.study, item.proposal);
    if (item.proposal.proposal_sha256 !== expectedProposalHash) throw new Error('proposal commitment no longer matches the reviewed fields');
    const sealedProposal = state.audit.find((entry) => entry.kind === 'proposal'
      && entry.tool === 'propose_study' && entry.inputs?.study_id === item.study.id
      && entry.inputs?.proposal_sha256 === expectedProposalHash);
    if (!sealedProposal) throw new Error('proposal commitment is not anchored in the audit ledger');
    const duplicate = included().find((candidate) => candidate.author === item.study.author
      && candidate.year === item.study.year && Math.abs(candidate.yi - item.study.yi) < 1e-9);
    if (duplicate) throw new Error(`record duplicates ${duplicate.id}`);
    const experimentDuplicate = included().find((candidate) => candidate.experiment_id === item.study.experiment_id);
    if (experimentDuplicate) throw new Error(`experiment_id is already represented by ${experimentDuplicate.id}`);
    const expectedEstimand = estimandDefinition(included());
    if (expectedEstimand.smd_variant && expectedEstimand.smd_variant !== item.study.smd_variant) throw new Error('SMD variant no longer matches the evidence base');
    if (expectedEstimand.effect_direction && expectedEstimand.effect_direction !== item.study.effect_direction) throw new Error('effect direction no longer matches the evidence base');
    if (expectedEstimand.collection_frame && expectedEstimand.collection_frame !== item.study.collection_frame) throw new Error('collection frame no longer matches the evidence base');
  }

  function importDecisionFor(item) {
    const packageSha = item.proposal.import_package_sha256;
    if (!packageSha) return null;
    const registry = state.imports.find((candidate) => candidate.package_sha256 === packageSha
      && candidate.decisions?.some((decision) => decision.study_id === item.study.id
        && decision.source_record_id === item.proposal.source_record_id
        && decision.proposal_sha256 === item.proposal.proposal_sha256));
    if (!registry) throw new Error('the proposal import package is missing from the import registry');
    const decision = registry.decisions?.find((candidate) => candidate.study_id === item.study.id
      && candidate.source_record_id === item.proposal.source_record_id
      && candidate.proposal_sha256 === item.proposal.proposal_sha256);
    if (!decision) throw new Error('the proposal is not linked to its import registry record');
    return { registry, decision };
  }

  function setImportDecision(item, status) {
    const linked = importDecisionFor(item);
    if (!linked) return;
    linked.decision.status = status;
    linked.registry.status = deriveImportStatus(linked.registry.decisions);
  }

  function deriveImportStatus(decisions) {
    const statuses = decisions.map((decision) => decision.status);
    if (statuses.every((value) => value === 'pending')) return 'pending';
    if (statuses.every((value) => value === 'approved')) return 'approved';
    if (statuses.every((value) => value === 'rejected')) return 'rejected';
    if (statuses.includes('pending')) return 'partially_decided';
    return 'mixed';
  }

  function renderPendingCard(item) {
    if (!mounts.pending) return;
    const s = item.study;
    const rows = [
      ['effect (yi)', fmt(s.yi)], ['variance (vi)', fmt(s.vi, 4)], ['prior contact (weeks)', s.weeks],
      ['setting / tester', `${s.setting || '—'} / ${s.tester || '—'}`],
      ['n (expectancy / control)', `${s.n1i ?? '—'} / ${s.n2i ?? '—'}`],
      ['experiment id / record role', `${s.experiment_id} / ${s.record_role || 'not supplied'}`],
      ['source', item.proposal.source], ['source URL', item.proposal.source_url || 'not supplied'],
      ['DOI', item.proposal.doi || 'not supplied'],
      ['source locator', item.proposal.source_locator || 'not supplied'],
      ['supporting quote', item.proposal.quote || '—'],
      ['derivation', item.proposal.derivation || '— (reported directly)'],
      ['study design / outcome / timepoint', `${item.proposal.study_design || 'not supplied'} / ${item.proposal.outcome || 'not supplied'} / ${item.proposal.timepoint || 'not supplied'}`],
      ['effect definition', `${s.smd_variant || 'not supplied'}${s.smd_variant_detail ? ` (${s.smd_variant_detail})` : ''}; ${s.effect_direction || 'not supplied'}`],
      ['collection frame', s.collection_frame || 'not supplied'],
      ['source record id', item.proposal.source_record_id || 'direct proposal'],
      ['import package', item.proposal.import_package_sha256 || 'direct proposal'],
      ['import dataset', item.proposal.import_dataset ? `${item.proposal.import_dataset.id} — ${item.proposal.import_dataset.label}` : 'direct proposal'],
      ['source artifact', item.proposal.source_artifact
        ? `${item.proposal.source_artifact.filename} · ${item.proposal.source_artifact.media_type} · ${item.proposal.source_artifact.sha256}`
        : 'not supplied'],
      ['risk-of-bias overall', item.proposal.risk_of_bias_status === 'not_assessed'
        ? 'not assessed'
        : `${item.proposal.risk_of_bias_status} · author-supplied, human-accepted if approved, not independently verified`],
      ['RoB instrument', item.proposal.risk_of_bias_instrument || 'not assessed'],
      ['RoB assessor / date', item.proposal.risk_of_bias_assessor
        ? `${item.proposal.risk_of_bias_assessor} / ${item.proposal.risk_of_bias_date}` : 'not assessed'],
      ['RoB source', item.proposal.risk_of_bias_source || 'not assessed'],
      ['RoB overall rationale', item.proposal.risk_of_bias_overall_rationale || 'not assessed'],
      ...item.proposal.risk_of_bias_domains.map((domain) => [
        `RoB domain — ${domain.domain}`, `${domain.judgment}: ${domain.rationale}`,
      ]),
      ['RoB consistency check', item.proposal.risk_of_bias_status === 'not_assessed'
        ? 'not applicable'
        : 'structural completeness only; instrument-specific domain algorithm not performed'],
      ['proposal commitment', item.proposal.proposal_sha256 || 'missing'],
    ];
    const card = h('div', { class: 'le-pending-card', id: `le-pending-${s.id}` }, [
      h('div', { class: 'le-pending-head', text: `Proposed study: ${s.author} (${s.year})` }),
      h('table', { class: 'le-pending-table' }, [
        h('tbody', {}, [
          ...rows.map(([k, v]) => h('tr', {}, [h('th', { text: k }), h('td', { text: String(v) })])),
        ]),
      ]),
      h('div', { class: 'le-pending-note', text: 'This proposed or imported study is NOT part of the evidence base until a human approves it. Approval accepts the supplied extraction; it does not verify the source.' }),
      h('div', { class: 'le-pending-actions' }, [
        h('button', {
          class: 'le-btn le-btn-approve', text: 'Approve & include',
          onclick: () => {
            try {
              assertPendingApprovalInvariant(item);
            } catch (error) {
              const note = card.querySelector('.le-pending-note');
              if (note) note.textContent = `Approval blocked: ${error.message}. Reject this card and submit a fresh proposal.`;
              return;
            }
            // Validate this cross-link before mutating any decision state.
            importDecisionFor(item);
            item.status = 'approved';
            setImportDecision(item, 'approved');
            card.querySelectorAll('button').forEach((button) => { button.disabled = true; });
            // The approved record carries structured provenance: where it came from,
            // the quote the numbers were read out of, and the hash of the numbers
            // themselves — so a later reader can check nothing drifted.
            item.proposal.approved_at = new Date().toISOString();
            s.provenance = {
              source_type: 'user_supplied',
              source: item.proposal.source,
              source_url: item.proposal.source_url ?? null,
              source_locator: item.proposal.source_locator ?? null,
              doi: item.proposal.doi ?? null,
              quote: item.proposal.quote,
              derivation: item.proposal.derivation ?? null,
              import_package_sha256: item.proposal.import_package_sha256 ?? null,
              import_dataset: item.proposal.import_dataset ?? null,
              source_artifact: item.proposal.source_artifact ?? null,
              source_record_id: item.proposal.source_record_id ?? null,
              primary_source_checked: false,
              effect_size_derivation_checked: false,
              verification_status: 'human_accepted_extraction_not_independently_verified',
              proposed_at: item.proposal.proposed_at,
              approved_at: item.proposal.approved_at,
              record_hash: item.proposal.record_hash,
              proposal_sha256: item.proposal.proposal_sha256,
            };
            s.study_design = item.proposal.study_design ?? null;
            s.outcome = item.proposal.outcome ?? null;
            s.timepoint = item.proposal.timepoint ?? null;
            s.risk_of_bias = {
              status: item.proposal.risk_of_bias_status,
              instrument: item.proposal.risk_of_bias_instrument ?? null,
              assessor: item.proposal.risk_of_bias_assessor ?? null,
              assessment_date: item.proposal.risk_of_bias_date ?? null,
              source: item.proposal.risk_of_bias_source ?? null,
              overall_rationale: item.proposal.risk_of_bias_overall_rationale ?? null,
              domains: structuredClone(item.proposal.risk_of_bias_domains || []),
              consistency_validation: item.proposal.risk_of_bias_status === 'not_assessed'
                ? 'not_applicable'
                : 'structural_only_instrument_specific_algorithm_not_performed',
              note: item.proposal.risk_of_bias_status !== 'not_assessed'
                ? 'Structured assessment supplied with the proposal and accepted by a human; not independently verified by this page.'
                : 'No structured risk-of-bias assessment supplied.',
            };
            state.approved.push(structuredClone(s));
            card.remove();
            syncPendingSection();
            state.evidenceVersion += 1;
            ledger({
              kind: 'approval', tool: 'propose_study', actor: 'human',
              inputs: { study_id: s.id, decision: 'approved', record_hash: item.proposal.record_hash, proposal_sha256: item.proposal.proposal_sha256 },
              result: { decision: 'approved', study_id: s.id, record_hash: item.proposal.record_hash, proposal_sha256: item.proposal.proposal_sha256, k: included().length, evidence_version: state.evidenceVersion },
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
            if (item.status !== 'pending') return;
            try {
              importDecisionFor(item);
            } catch (error) {
              const note = card.querySelector('.le-pending-note');
              if (note) note.textContent = `Rejection blocked: ${error.message}. Reload the last valid snapshot.`;
              return;
            }
            item.status = 'rejected';
            setImportDecision(item, 'rejected');
            card.querySelectorAll('button').forEach((button) => { button.disabled = true; });
            card.remove();
            syncPendingSection();
            ledger({
              kind: 'approval', tool: 'propose_study', actor: 'human',
              inputs: { study_id: s.id, decision: 'rejected', record_hash: item.proposal.record_hash, proposal_sha256: item.proposal.proposal_sha256 },
              result: { decision: 'rejected', study_id: s.id, record_hash: item.proposal.record_hash, proposal_sha256: item.proposal.proposal_sha256 },
              summary: `human REJECTED ${s.author} (${s.year})`,
            });
          },
        }),
      ]),
    ]);
    mounts.pending.appendChild(card);
    syncPendingSection();
  }

  function normalizeRiskProposal(args) {
    const status = args.risk_of_bias_status;
    if (!['low', 'some_concerns', 'high', 'not_assessed'].includes(status)) {
      throw new Error('risk_of_bias_status must be low, some_concerns, high, or not_assessed');
    }
    const optionalString = (name) => {
      const value = args[name];
      if (value === undefined || value === null || value === '') return null;
      if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
      return value.trim();
    };
    const instrument = optionalString('risk_of_bias_instrument');
    const assessor = optionalString('risk_of_bias_assessor');
    const date = optionalString('risk_of_bias_date');
    const source = optionalString('risk_of_bias_source');
    const overallRationale = optionalString('risk_of_bias_overall_rationale');
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date)
      || Number.isNaN(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) {
      throw new Error('risk_of_bias_date must be a real calendar date in YYYY-MM-DD format');
    }
    const rawDomains = args.risk_of_bias_domains ?? [];
    if (!Array.isArray(rawDomains)) throw new Error('risk_of_bias_domains must be an array');
    const allowedJudgments = new Set(['low', 'some_concerns', 'high', 'unclear', 'not_applicable']);
    const domains = rawDomains.map((domain, index) => {
      if (!domain || typeof domain !== 'object' || Array.isArray(domain)) throw new Error(`risk_of_bias_domains[${index}] must be an object`);
      const unknown = Object.keys(domain).filter((key) => !['domain', 'judgment', 'rationale'].includes(key));
      if (unknown.length) throw new Error(`risk_of_bias_domains[${index}] has unknown field(s): ${unknown.join(', ')}`);
      for (const key of ['domain', 'judgment', 'rationale']) {
        if (typeof domain[key] !== 'string' || !domain[key].trim()) throw new Error(`risk_of_bias_domains[${index}].${key} must be a non-empty string`);
      }
      if (!allowedJudgments.has(domain.judgment)) throw new Error(`risk_of_bias_domains[${index}].judgment is invalid`);
      return { domain: domain.domain.trim(), judgment: domain.judgment, rationale: domain.rationale.trim() };
    });
    const normalizedDomainNames = domains.map((domain) => domain.domain.toLocaleLowerCase());
    if (new Set(normalizedDomainNames).size !== normalizedDomainNames.length) {
      throw new Error('risk_of_bias_domains contains duplicate domain names');
    }
    if (status === 'not_assessed') {
      if (instrument || assessor || date || source || overallRationale || domains.length) {
        throw new Error('risk_of_bias_status not_assessed cannot carry assessment details');
      }
    } else if (!instrument || !assessor || !date || !source || !overallRationale || !domains.length) {
      throw new Error('an assessed risk_of_bias_status requires instrument, assessor, date, source, overall rationale, and at least one domain judgment with rationale');
    } else {
      const judgments = domains.map((domain) => domain.judgment).filter((judgment) => judgment !== 'not_applicable');
      if (!judgments.length) throw new Error('an assessed risk of bias cannot contain only not_applicable domains');
    }
    return { status, instrument, assessor, assessment_date: date, source, overall_rationale: overallRationale, domains };
  }

  function proposeStudy(args, trustedImport = null) {
    for (const reserved of ['import_package_sha256', 'import_dataset', 'source_artifact', 'source_record_id']) {
      if (Object.prototype.hasOwnProperty.call(args, reserved)) {
        throw new Error(`${reserved} is reserved for the validated local package importer`);
      }
    }
    // source AND quote are both required: a number without the sentence it was read
    // out of is not evidence, it is a rumour with a citation.
    const required = [
      'author', 'year', 'yi', 'vi', 'weeks', 'source', 'quote', 'source_locator',
      'derivation', 'study_design', 'outcome', 'timepoint', 'experiment_id',
      'risk_of_bias_status', 'smd_variant', 'effect_direction', 'collection_frame',
    ];
    for (const f of required) {
      if (args[f] === undefined || args[f] === null || args[f] === '') {
        throw new Error(`missing required field: ${f}${f === 'quote' ? ' — quote the sentence, table cell or figure caption the numbers come from' : ''}`);
      }
    }
    for (const field of ['author', 'source', 'quote', 'source_locator', 'derivation', 'study_design', 'outcome', 'timepoint', 'experiment_id', 'smd_variant', 'effect_direction', 'collection_frame']) {
      if (typeof args[field] !== 'string' || !args[field].trim()) throw new Error(`${field} must be a non-empty string`);
    }
    if (!['Hedges_g', 'Cohen_d', 'Glass_delta', 'other'].includes(args.smd_variant)) {
      throw new Error('smd_variant must be Hedges_g, Cohen_d, Glass_delta, or other');
    }
    if (args.smd_variant === 'other' && (typeof args.smd_variant_detail !== 'string' || !args.smd_variant_detail.trim())) {
      throw new Error('smd_variant_detail is required when smd_variant is other');
    }
    const { year, yi, vi, weeks } = args;
    // These mirror the input schema exactly: a runtime that accepted 1985.5 or a
    // fractional group size would make the schema a suggestion rather than a contract.
    if (!Number.isInteger(year) || year < 1900 || year > 2100) throw new Error('year must be a whole year between 1900 and 2100');
    if (!Number.isFinite(yi) || Math.abs(yi) > 10) throw new Error('yi must be a finite SMD (|yi| <= 10)');
    if (!Number.isFinite(vi) || vi <= 0 || vi > 10) throw new Error('vi must be a positive sampling variance');
    if (!Number.isFinite(weeks) || weeks < 0 || weeks > 500) throw new Error('weeks out of range');
    for (const f of ['n1i', 'n2i']) {
      if (args[f] === undefined || args[f] === null || args[f] === '') continue;
      const n = args[f];
      if (!Number.isInteger(n) || n < 1) throw new Error(`${f} must be a whole sample size of at least 1`);
    }
    for (const f of ['doi', 'source_url', 'risk_of_bias_instrument', 'risk_of_bias_assessor', 'risk_of_bias_date', 'risk_of_bias_source', 'risk_of_bias_overall_rationale', 'record_role', 'smd_variant_detail', 'source_record_id']) {
      if (args[f] !== undefined && args[f] !== null && typeof args[f] !== 'string') throw new Error(`${f} must be a string`);
    }
    const normalizedRisk = normalizeRiskProposal(args);
    if (args.setting && !['group', 'indiv'].includes(args.setting)) throw new Error("setting must be 'group' or 'indiv'");
    if (args.tester && !['aware', 'blind'].includes(args.tester)) throw new Error("tester must be 'aware' or 'blind'");
    const candidates = included().concat(state.pending.filter((p) => p.status === 'pending').map((p) => p.study));
    const dup = candidates.find((s) => s.author === args.author && s.year === year && Math.abs(s.yi - yi) < 1e-9);
    if (dup) throw new Error(`duplicate of existing record ${dup.id} (${dup.author} ${dup.year})`);
    const experimentDup = candidates.find((s) => s.experiment_id === args.experiment_id);
    if (experimentDup) throw new Error(`experiment_id ${args.experiment_id} is already represented by ${experimentDup.id}; this runtime cannot model dependent effects`);
    const expectedEstimand = estimandDefinition(candidates);
    if (expectedEstimand.smd_variant && expectedEstimand.smd_variant !== args.smd_variant) {
      throw new Error(`smd_variant ${args.smd_variant} is incompatible with existing ${expectedEstimand.smd_variant} records`);
    }
    if (expectedEstimand.effect_direction && expectedEstimand.effect_direction !== args.effect_direction) {
      throw new Error('effect_direction differs from the existing evidence base; recode effects before pooling');
    }
    if (expectedEstimand.collection_frame && expectedEstimand.collection_frame !== args.collection_frame) {
      throw new Error('collection_frame differs from the existing evidence base; start a separate workspace or reconcile the eligibility frame');
    }
    // Same author+year but a DIFFERENT effect size is not automatically a duplicate —
    // one paper can contribute multiple effect-size records (see s04/s05 in the base).
    // Flag it for the human instead of silently rejecting real evidence.
    const nearDup = candidates.find((s) => s.author === args.author && s.year === year);

    const id = `p${String(state.pending.length + 1).padStart(2, '0')}`;
    const study = {
      id, author: args.author.trim(), year, weeks,
      experiment_id: args.experiment_id.trim(),
      record_role: args.record_role ? String(args.record_role) : 'experiment estimate',
      smd_variant: args.smd_variant,
      smd_variant_detail: args.smd_variant_detail ? args.smd_variant_detail.trim() : null,
      effect_direction: args.effect_direction.trim(),
      collection_frame: args.collection_frame.trim(),
      setting: args.setting || null, tester: args.tester || null,
      n1i: args.n1i === undefined || args.n1i === null || args.n1i === '' ? null : args.n1i,
      n2i: args.n2i === undefined || args.n2i === null || args.n2i === '' ? null : args.n2i,
      yi, vi,
      provenance: `agent proposal (${args.source})`,
    };
    // record_hash identifies the quantitative row; proposal_sha256 additionally
    // commits every traceability, estimand, import and risk-of-bias field the human
    // reviews. Neither includes timestamps or the session-local proposal id.
    const record_hash = recordIdentityHash(study, args);
    const proposal = {
      source: String(args.source), quote: String(args.quote),
      source_url: args.source_url ? String(args.source_url) : null,
      source_locator: args.source_locator ? String(args.source_locator) : null,
      doi: args.doi ? String(args.doi) : null,
      study_design: args.study_design ? String(args.study_design) : null,
      outcome: args.outcome ? String(args.outcome) : null,
      timepoint: args.timepoint ? String(args.timepoint) : null,
      risk_of_bias_status: normalizedRisk.status,
      risk_of_bias_instrument: normalizedRisk.instrument,
      risk_of_bias_assessor: normalizedRisk.assessor,
      risk_of_bias_date: normalizedRisk.assessment_date,
      risk_of_bias_source: normalizedRisk.source,
      risk_of_bias_overall_rationale: normalizedRisk.overall_rationale,
      risk_of_bias_domains: normalizedRisk.domains,
      import_package_sha256: trustedImport?.package_sha256 || null,
      import_dataset: trustedImport?.dataset ? structuredClone(trustedImport.dataset) : null,
      source_artifact: trustedImport?.source_artifact ? structuredClone(trustedImport.source_artifact) : null,
      source_record_id: trustedImport?.source_record_id || null,
      // How the numbers were arrived at when the paper did not print them (t → d,
      // means and SDs, a digitised figure). Required, and it travels with the record.
      derivation: String(args.derivation),
      proposed_at: new Date().toISOString(), record_hash,
    };
    proposal.proposal_sha256 = proposalCommitment(study, proposal);
    const item = { study, status: 'pending', proposal };
    state.pending.push(item);
    const response = {
      status: 'pending_human_approval', study_id: id, record_hash,
      proposal_sha256: proposal.proposal_sha256,
      // Always present, null when there is no candidate: an absent key reads as
      // "not checked", and a caller should not have to know which it was.
      possible_duplicate_of: nearDup ? nearDup.id : null,
      message: 'Proposal recorded and shown to the human reader with an Approve/Reject card. It is NOT included in any analysis until approved. Ask the human to review it on the page.'
        + (nearDup ? ` NOTE: ${nearDup.author} (${nearDup.year}) is already in the evidence base with a different effect size — say so when you ask the human to approve this one.` : '')
        + ' Call get_document_overview again after the human approves.',
    };
    ledger({
      kind: 'proposal', tool: 'propose_study',
      inputs: {
        study_id: id, author: study.author, year, yi, vi, weeks,
        record_hash, proposal_sha256: proposal.proposal_sha256,
      },
      result: response,
      summary: `agent proposed ${study.author} (${study.year}), yi=${fmt(yi)}, vi=${fmt(vi, 4)} [${record_hash}] — awaiting human approval`,
    });
    renderPendingCard(item);
    return response;
  }

  /** Stage a locally opened CSV/JSON/QMD/notebook package through the same
   * proposal cards as an agent. The whole package is normalized and duplicate-
   * checked before the first card is created, so a bad row cannot half-import. */
  function stageEvidencePackage(packageInput, opts = {}) {
    if (!isWorkspace) throw new Error('evidence packages can only be staged in workspace mode');
    const pkg = normalizeEvidencePackage(packageInput);
    const existing = included().concat(state.pending.filter((p) => p.status === 'pending').map((p) => p.study));
    const seen = [...existing];
    const experimentIds = new Set(existing.map((s) => s.experiment_id).filter(Boolean));
    for (const record of pkg.studies) {
      const duplicate = seen.find((study) => study.author === record.author
        && study.year === record.year && Math.abs(study.yi - record.yi) < 1e-9);
      if (duplicate) throw new Error(`package would duplicate ${record.author} (${record.year}), yi=${record.yi}; nothing was staged`);
      if (experimentIds.has(record.experiment_id)) {
        throw new Error(`experiment_id ${record.experiment_id} is already represented; v1 cannot model dependent effects and nothing was staged`);
      }
      seen.push(record);
      experimentIds.add(record.experiment_id);
    }
    const expectedEstimand = estimandDefinition(existing);
    if (expectedEstimand.smd_variant && expectedEstimand.smd_variant !== pkg.dataset.smd_variant) {
      throw new Error(`package SMD variant ${pkg.dataset.smd_variant} is incompatible with ${expectedEstimand.smd_variant}; nothing was staged`);
    }
    if (expectedEstimand.effect_direction && expectedEstimand.effect_direction !== pkg.dataset.effect_direction) {
      throw new Error('package effect_direction is incompatible with the current evidence base; nothing was staged');
    }
    if (expectedEstimand.collection_frame && expectedEstimand.collection_frame !== pkg.dataset.collection_frame) {
      throw new Error('package collection_frame differs from the current eligibility frame; nothing was staged');
    }
    const packageSha = sha256Object(pkg);
    const previousActor = currentActor;
    currentActor = opts.actor || 'human';
    const staged = [];
    const checkpoint = {
      pending: state.pending.length,
      audit: state.audit.length,
      runCounter: state.runCounter,
      imports: state.imports.length,
    };
    try {
      for (const record of pkg.studies) {
        staged.push(proposeStudy({
          ...record,
          smd_variant: pkg.dataset.smd_variant,
          smd_variant_detail: pkg.dataset.smd_variant_detail,
          effect_direction: pkg.dataset.effect_direction,
          collection_frame: pkg.dataset.collection_frame,
        }, {
          source_record_id: record.id,
          dataset: pkg.dataset,
          source_artifact: pkg.source_artifact,
          package_sha256: packageSha,
        }));
      }
      state.imports.push({
        package_sha256: packageSha,
        schema_version: pkg.schema_version,
        dataset: pkg.dataset,
        source_artifact: pkg.source_artifact,
        source_record_ids: pkg.studies.map((record) => record.id),
        decisions: staged.map((proposal, index) => ({
          source_record_id: pkg.studies[index].id,
          study_id: proposal.study_id,
          proposal_sha256: proposal.proposal_sha256,
          status: 'pending',
        })),
        status: 'pending',
      });
      ledger({
        kind: 'import', tool: 'import_evidence_package',
        inputs: { schema_version: pkg.schema_version, dataset_id: pkg.dataset.id, record_count: pkg.studies.length },
        result: { package_sha256: packageSha, staged_study_ids: staged.map((r) => r.study_id) },
        summary: `staged ${staged.length} imported record(s) from ${pkg.dataset.label} — every record awaits separate human approval`,
      });
    } catch (error) {
      // Transactional rollback: no package may leave half a batch in state, DOM,
      // ledger or localStorage even if a later proposal trips a runtime guard.
      state.pending.splice(checkpoint.pending);
      state.audit.splice(checkpoint.audit);
      state.runCounter = checkpoint.runCounter;
      state.imports.splice(checkpoint.imports);
      if (mounts.pending) {
        mounts.pending.replaceChildren();
        for (const item of state.pending) if (item.status === 'pending') renderPendingCard(item);
      }
      if (mounts.ledger) {
        mounts.ledger.replaceChildren();
        for (const entry of state.audit) renderLedgerRow(entry);
      }
      syncPendingSection();
      persist();
      throw new Error(`${error.message}; import rolled back and nothing was staged`);
    } finally {
      currentActor = previousActor;
    }
    return {
      status: 'pending_human_review', package_sha256: packageSha,
      staged_records: staged.length, staged_study_ids: staged.map((r) => r.study_id),
      imported_claims: 0,
      source_artifact: pkg.source_artifact,
      note: `${pkg.claims.length} package claim(s) were not imported automatically; review and add them explicitly. Evidence k is unchanged until each proposal is approved.`,
    };
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
    return claim.statement || '';
  }

  /** Claim data, not mutable DOM text, is the signed source of truth. Repaint the
   * authored prose span from that source before restoring any outcome badge. */
  function renderDocumentClaimStatements() {
    if (isWorkspace) return;
    for (const claim of claims) {
      const span = document.querySelector(`[data-claim="${claim.id}"]`);
      if (span) span.replaceChildren(document.createTextNode(statementOf(claim)));
    }
  }

  function evaluateClaim(claimId) {
    const claim = claims.find((c) => c.id === claimId);
    if (!claim) throw new Error(`unknown claim id: ${claimId}. Use list_claims.`);
    const result = evaluateRules(claim.test, runAnalysisByName, `claim ${claim.id}`);
    const evaluatedVersion = state.evidenceVersion;
    const run = ledger({
      kind: 'claim', tool: 'evaluate_claim', inputs: { claim_id: claimId },
      result: { claim_id: claimId, verdict: result.verdict, reason: result.reason },
      summary: `claim ${claimId} → REGISTERED RULE ${RULE_OUTCOME[result.verdict]?.toUpperCase() || result.verdict.toUpperCase()} (${result.reason})`,
    });
    setClaimStatus(claimId, result.verdict, run, result.reason);
    return {
      claim_id: claimId,
      statement: statementOf(claim),
      verdict: result.verdict,
      status: result.verdict,
      outcome_type: 'document_registered_rule',
      rule_outcome: RULE_OUTCOME[result.verdict] || result.verdict,
      rule_outcome_code: result.verdict,
      rule_outcome_scope: RULE_OUTCOME_SCOPE,
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
        outcome_type: 'document_registered_rule',
        rule_outcome: RULE_OUTCOME[st ? st.verdict : 'untested'],
        rule_outcome_code: st ? st.verdict : 'untested',
        rule_outcome_scope: RULE_OUTCOME_SCOPE,
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
      outcome_type: 'document_registered_rule', rule_outcome: 'not_run', rule_outcome_code: 'untested',
      note: 'The claim is now listed in the document. Run evaluate_claim to give it a visible registered-rule outcome badge.',
    };
  }

  // ---------- self-contained export (workspace mode only) ----------
  // The recursion made literal: the workspace writes out a Living Evidence document
  // that carries its own data, engine, figures and agent tools — one file, no
  // network, no reference back to this origin.
  const EXPORT_SOURCES = ['meta-stats.js', 'meta-plots.js', 'claim-rules.js', 'integrity.js', 'evidence-package.js', 'living-evidence.js'];

  function provenanceOf(s) {
    const p = s.provenance;
    if (p && typeof p === 'object') return { ...p };
    return { source: typeof p === 'string' ? p : '', quote: '', verification_status: 'legacy_unstructured' };
  }

  function buildExportHtml({ css, js, now, publishedReceipt, snapshot }) {
    const exportedScientific = snapshot.scientific;
    const exportedDoc = exportedScientific.document;
    const studies = exportedScientific.dataset.studies;
    // Keep the canonical dataset identity stable across the export boundary;
    // changing it here would make the embedded receipt fail immediately.
    const exportedDataset = structuredClone(exportedScientific.dataset);
    const exportedClaims = exportedScientific.claims;
    // Assemble verifier sentinels from fragments so the runtime source embedded
    // inside its own export does not reproduce the complete sentinel text.
    const runtimeCssElementId = ['le-runtime-', 'css'].join('');
    const releaseReceiptElementId = ['le-release-', 'receipt'].join('');
    const scientificStateElementId = ['le-scientific-', 'state'].join('');
    const runtimeStartMarker = ['/*__LIVING_EVIDENCE_', 'RUNTIME_START__*/'].join('');
    const runtimeEndMarker = ['/*__LIVING_EVIDENCE_', 'RUNTIME_END__*/'].join('');
    const bootConfig = {
      mode: 'document',
      storageKey: `le-export-${publishedReceipt.scientific_state_sha256}-${publishedReceipt.audit_head || 'empty-ledger'}`,
      title: exportedDoc.title,
      hypothesis: exportedDoc.hypothesis,
      subgroupFields: exportedScientific.analysis_spec.subgroup_fields,
      moderators: exportedScientific.analysis_spec.moderators,
      claims: exportedClaims.map((c) => ({ id: c.id, statement: c.statement, rule: c.rule, test: c.test })),
      initialAudit: snapshot.audit,
      initialRunCounter: snapshot.runCounter,
      initialEvidenceVersion: snapshot.evidenceVersion,
      initialImports: exportedScientific.imported_packages,
    };
    const claimItems = exportedClaims.length
      ? exportedClaims.map((c) => `      <li class="le-claim-item"><span class="le-claim" data-claim="${htmlEscape(c.id)}">${htmlEscape(c.statement || c.id)}</span><div class="le-claim-meta">${htmlEscape(c.id)} · ${htmlEscape(c.rule || 'no rule text')}</div></li>`).join('\n')
      : '      <li class="le-claim-empty">This document carries no claims yet.</li>';
    const provenanceField = (label, value) => `<dt>${htmlEscape(label)}</dt><dd>${htmlEscape(value === null || value === undefined || value === '' ? '—' : value)}</dd>`;
    const provCards = studies.map((s) => {
      const p = provenanceOf(s);
      const risk = s.risk_of_bias || { status: 'not_assessed', domains: [] };
      const domains = Array.isArray(risk.domains) && risk.domains.length
        ? `<ul>${risk.domains.map((domain) => `<li>${htmlEscape(domain.domain)} — ${htmlEscape(domain.judgment)}: ${htmlEscape(domain.rationale)}</li>`).join('')}</ul>`
        : '—';
      return `
      <details class="provenance-record">
        <summary>${htmlEscape(s.id)} · ${htmlEscape(s.author)} (${htmlEscape(s.year)}) · yi ${htmlEscape(fmt(s.yi))}</summary>
        <dl class="provenance-grid">
          ${provenanceField('Experiment id', s.experiment_id)}
          ${provenanceField('Record role', s.record_role)}
          ${provenanceField('Effect / variance', `yi ${fmt(s.yi)}; vi ${fmt(s.vi, 4)}`)}
          ${provenanceField('Weeks / setting / tester', `${s.weeks ?? '—'} / ${s.setting ?? '—'} / ${s.tester ?? '—'}`)}
          ${provenanceField('Sample sizes', `${s.n1i ?? '—'} / ${s.n2i ?? '—'}`)}
          ${provenanceField('SMD definition', `${s.smd_variant || '—'}${s.smd_variant_detail ? ` (${s.smd_variant_detail})` : ''}`)}
          ${provenanceField('Effect direction', s.effect_direction)}
          ${provenanceField('Collection frame', s.collection_frame)}
          ${provenanceField('Study design', s.study_design)}
          ${provenanceField('Outcome', s.outcome)}
          ${provenanceField('Timepoint', s.timepoint)}
          ${provenanceField('Source type', p.source_type)}
          ${provenanceField('Source', p.source)}
          ${provenanceField('Source URL', p.source_url)}
          ${provenanceField('DOI', p.doi)}
          ${provenanceField('Locator', p.source_locator)}
          ${provenanceField('Quoted evidence', p.quote)}
          ${provenanceField('Effect-size derivation', p.derivation)}
          ${provenanceField('Extraction verification', p.verification_status || 'unverified')}
          ${provenanceField('Primary source checked', p.primary_source_checked === true ? 'yes' : 'no')}
          ${provenanceField('Derivation checked', p.effect_size_derivation_checked === true ? 'yes' : 'no')}
          ${provenanceField('Record hash', p.record_hash)}
          ${provenanceField('Proposal commitment', p.proposal_sha256)}
          ${provenanceField('Import package hash', p.import_package_sha256)}
          ${provenanceField('Import source record id', p.source_record_id)}
          ${provenanceField('Import dataset', p.import_dataset ? JSON.stringify(p.import_dataset) : null)}
          ${provenanceField('Source artifact', p.source_artifact ? JSON.stringify(p.source_artifact) : null)}
          ${provenanceField('Risk-of-bias overall', `${risk.status || 'not_assessed'} — author-supplied if assessed; not independently verified`)}
          ${provenanceField('RoB instrument', risk.instrument)}
          ${provenanceField('RoB assessor / date', risk.assessor ? `${risk.assessor} / ${risk.assessment_date || '—'}` : null)}
          ${provenanceField('RoB source', risk.source)}
          ${provenanceField('RoB overall rationale', risk.overall_rationale)}
          <dt>RoB domain judgments</dt><dd>${domains}</dd>
          ${provenanceField('RoB consistency validation', risk.consistency_validation || (risk.status === 'not_assessed' ? 'not applicable' : 'not performed instrument-specifically'))}
        </dl>
      </details>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(exportedDoc.title)}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚖️</text></svg>">
<style id="${runtimeCssElementId}">${css}</style>
<style>
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
.provenance-record { margin: 0.7rem 0; }
.provenance-grid { display: grid; grid-template-columns: minmax(9rem, 0.35fr) minmax(0, 1fr); margin: 0.6rem 0; font-size: 0.82em; }
.provenance-grid dt, .provenance-grid dd { margin: 0; padding: 0.32rem 0.5rem; border-bottom: 1px solid var(--le-border); overflow-wrap: anywhere; }
.provenance-grid dt { font-weight: 650; }
.provenance-grid ul { margin: 0; padding-left: 1.2rem; }
#pending-section { display: none; }
section.le-has-pending#pending-section, #pending-section:has(.le-pending-card) { display: block; }
footer { margin-top: 3.5rem; padding-top: 1.2rem; border-top: 1px solid var(--le-border); color: var(--le-muted); font-size: 0.85em; }
<\/style>
</head>
<body>
<main>
  <header>
    <h1>${htmlEscape(exportedDoc.title)}</h1>
    <div class="le-status" id="le-status"><span class="le-status-dot le-off"></span><span>Initializing agent interface…</span></div>
  </header>

  <h2>Hypothesis</h2>
  <p class="hypothesis" id="le-hypothesis">${htmlEscape(exportedDoc.hypothesis || '(not set)')}</p>
  <p class="note">This is a <strong>Living Evidence</strong> document: the statistics below are not typeset, they are
  computed in your browser from the effect-size records embedded in this file. If you are reading with a WebMCP-enabled agent,
  it has been handed tools to re-run and cross-examine every number here.</p>

  <h2>Claims</h2>
  <p class="note">Each claim carries a document-registered deterministic rule (readable through <code>list_claims</code>).
  Its badge says whether that authored rule passed, failed or was inconclusive — never whether the claim is true or the evidence is high quality.</p>
  <ul class="le-claims">
${claimItems}
  </ul>

  <h2>Evidence</h2>
  <p class="note">${htmlEscape(exportedScientific.analysis_spec.dependence_disclosure.warning)}</p>
  <p class="note">Dataset provenance: ${htmlEscape(exportedDataset.provenance_note || 'No dataset-level provenance note supplied.')} Sources: ${htmlEscape(JSON.stringify(exportedDataset.sources || []))}</p>
  <p class="stat-line">Across <strong data-le-bind="k">…</strong> effect-size records the pooled random-effects (REML) estimate is
  <strong data-le-bind="estimate">…</strong> ${htmlEscape(exportedDataset.effect_measure || '')}, 95%&nbsp;CI
  <strong data-le-bind="ci">…</strong>, <em>p</em>&nbsp;= <strong data-le-bind="p">…</strong>
  (I²&nbsp;= <span data-le-bind="I2">…</span>, Q&nbsp;= <span data-le-bind="Q">…</span>,
  <em>p</em>&nbsp;= <span data-le-bind="Q_p">…</span>).</p>

  <figure class="main"><div id="le-main-figure"></div></figure>

  <details>
    <summary>Full provenance appendix — traceability, estimand, design, derivation, import hashes and risk of bias for every record</summary>
${provCards}
  </details>

  <h2>Reader’s Workbench</h2>
  <div id="le-workbench"></div>

  <section id="pending-section">
    <h2>Proposed changes to the evidence base</h2>
    <div id="le-pending"></div>
  </section>

  <h2>Audit ledger</h2>
  <ol class="le-ledger" id="le-ledger"></ol>

  <h2>Reproducibility receipt</h2>
  <div class="le-integrity" id="le-reproducibility"></div>
  <script id="${releaseReceiptElementId}" type="application/vnd.living-evidence.receipt+json">${jsonScriptLiteral(publishedReceipt)}<\/script>
  <script id="${scientificStateElementId}" type="application/vnd.living-evidence.scientific-state+json">${jsonScriptLiteral(exportedScientific)}<\/script>

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
${runtimeStartMarker}${js}${runtimeEndMarker}

const DATASET = ${jsonScriptLiteral(exportedDataset)};
const EXPORTED_CONFIG = ${jsonScriptLiteral(bootConfig)};
const RELEASE_RECEIPT = parseJsonRejectDuplicates(document.getElementById('le-release-receipt').textContent);
const EMBEDDED_SCIENCE = parseJsonRejectDuplicates(document.getElementById('le-scientific-state').textContent);
if (sha256Object(EMBEDDED_SCIENCE) !== RELEASE_RECEIPT.scientific_state_sha256) {
  throw new Error('embedded scientific state does not match the published release receipt');
}
initLivingEvidence({ ...EXPORTED_CONFIG, dataset: DATASET, publishedReceipt: RELEASE_RECEIPT });
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
    const unresolved = state.pending.filter((item) => item.status === 'pending');
    if (unresolved.length) {
      throw new Error(`cannot export while ${unresolved.length} proposal(s) still await human review: ${unresolved.map((item) => item.study.id).join(', ')}. Approve or reject every card first`);
    }
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
    const exportSnapshot = captureReceiptState();
    const studies = exportSnapshot.scientific.dataset.studies;
    // Hash the exact CSS and transformed JavaScript embedded in the artifact.
    // The page reports this signed claim but deliberately does not self-verify it;
    // exact artifact verification belongs to the detached receipt + external CLI.
    const runtime_sha256 = sha256Object({ css, js });
    // The embedded receipt seals canonical science/runtime and an audit snapshot.
    // It cannot also hash its containing HTML without a circular dependency.
    const { receipt: embeddedStateReceipt } = await makeSignedReceipt({ runtime_sha256, store: false, snapshot: exportSnapshot });
    const html = buildExportHtml({ css, js, now, publishedReceipt: embeddedStateReceipt, snapshot: exportSnapshot });
    const bytes = new TextEncoder().encode(html).length;
    const p2 = (n) => String(n).padStart(2, '0');
    const filename = `living-evidence-export-${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}.html`;
    const artifact_sha256 = `sha256:${sha256Hex(html)}`;
    const content_digest = artifact_sha256;
    // Sign before starting the download: an artifact must never be handed out if
    // its matching detached receipt could not be created.
    const { receipt } = await makeSignedReceipt({ runtime_sha256, artifact_sha256, store: true, snapshot: exportSnapshot });
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
    // The detached receipt authenticates the exact completed HTML bytes and can
    // be checked with verify-receipt.mjs.
    ledger({
      kind: 'mutation', tool: 'export_document', actor,
      inputs: { k: studies.length, claims: exportSnapshot.scientific.claims.length, include_html: !!args.include_html },
      result: html,
      summary: `exported ${filename} — self-contained document, ${bytes} bytes, k=${studies.length}, ${exportSnapshot.scientific.claims.length} claim(s)`,
    });
    // The file is megabytes of HTML. Handing all of it back on every call burns an
    // agent's context for a payload it usually cannot use — the human already has
    // the download. Ask for it explicitly (include_html) when you need to read it;
    // it is also returned unasked when the download itself failed, since then the
    // response is the only copy the caller can reach.
    return {
      filename, bytes,
      download_started: downloaded,
      content_digest, artifact_sha256,
      document_version: receipt.document_version,
      receipt,
      embedded_state_receipt: embeddedStateReceipt,
      receipt_filename: `${filename}.receipt.json`,
      ...(args.include_html || !downloaded ? { html } : {}),
      note: `A complete Living Evidence document: HTML + data + statistics engine + WebMCP tools in one file. It runs from file:// with no network access. The returned detached receipt signs artifact_sha256 for the exact HTML bytes; the embedded receipt signs canonical science, runtime and its auditable history without claiming to hash its own containing bytes. Save receipt as ${filename}.receipt.json and pin its key fingerprint externally for authorship evidence.${args.include_html || !downloaded ? '' : ' Pass include_html: true to get the HTML itself in the response.'}`,
    };
  }

  // ---------- restore a saved workspace ----------

  function readSnapshot() {
    if (!storageKey) return null;
    let raw = null;
    try {
      raw = localStorage.getItem(storageKey);
      state.storage.read_status = raw ? 'snapshot_read' : 'no_snapshot_present';
      state.storage.last_error = null;
    } catch (e) {
      state.storage.read_status = 'memory_only_storage_failed';
      state.storage.last_error = String(e.message || e);
      console.warn('[living-evidence] storage unavailable, starting a fresh workspace:', e.message);
      return null;
    }
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || Array.isArray(d) || ![1, 2].includes(d.v)) throw new Error('not a supported local snapshot');
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
    doc.title = initialDoc.title;
    doc.hypothesis = initialDoc.hypothesis;
    state.approved = [];
    state.pending = [];
    state.audit = structuredClone(bootBaseline.audit);
    state.claimStatus.clear();
    claims.length = 0;
    claims.push(...structuredClone(authoredClaims));
    state.evidenceVersion = bootBaseline.evidenceVersion;
    state.runCounter = bootBaseline.runCounter;
    state.auditLegacyImported = false;
    state.imports = structuredClone(bootBaseline.imports);
    state.lastReceipt = null;
    state.lastReceiptSignatureStatus = 'none';
    if (mounts.ledger) mounts.ledger.replaceChildren();
    if (mounts.pending) mounts.pending.replaceChildren();
  }

  function assertStoredStudyCore(study, label) {
    if (!study || typeof study !== 'object' || Array.isArray(study)) throw new Error(`${label} is not an object`);
    for (const field of ['id', 'author', 'experiment_id', 'smd_variant', 'effect_direction', 'collection_frame']) {
      if (typeof study[field] !== 'string' || !study[field].trim()) throw new Error(`${label}.${field} must be a non-empty string`);
    }
    if (!['Hedges_g', 'Cohen_d', 'Glass_delta', 'other'].includes(study.smd_variant)) throw new Error(`${label}.smd_variant is invalid`);
    if (study.smd_variant === 'other' && (typeof study.smd_variant_detail !== 'string' || !study.smd_variant_detail.trim())) {
      throw new Error(`${label}.smd_variant_detail is required`);
    }
    if (!Number.isInteger(study.year) || study.year < 1900 || study.year > 2100) throw new Error(`${label}.year is invalid`);
    if (!Number.isFinite(study.yi) || Math.abs(study.yi) > 10) throw new Error(`${label}.yi is invalid`);
    if (!Number.isFinite(study.vi) || study.vi <= 0 || study.vi > 10) throw new Error(`${label}.vi is invalid`);
    if (!Number.isFinite(study.weeks) || study.weeks < 0 || study.weeks > 500) throw new Error(`${label}.weeks is invalid`);
    if (study.setting !== null && study.setting !== undefined && !['group', 'indiv'].includes(study.setting)) throw new Error(`${label}.setting is invalid`);
    if (study.tester !== null && study.tester !== undefined && !['aware', 'blind'].includes(study.tester)) throw new Error(`${label}.tester is invalid`);
    for (const field of ['n1i', 'n2i']) {
      if (study[field] !== null && study[field] !== undefined && (!Number.isInteger(study[field]) || study[field] < 1)) {
        throw new Error(`${label}.${field} is invalid`);
      }
    }
  }

  function assertStoredPending(item, label) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${label} is not an object`);
    if (!['pending', 'approved', 'rejected'].includes(item.status)) throw new Error(`${label}.status is invalid`);
    assertStoredStudyCore(item.study, `${label}.study`);
    const proposal = item.proposal;
    if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw new Error(`${label}.proposal is invalid`);
    for (const field of ['source', 'quote', 'source_locator', 'derivation', 'study_design', 'outcome', 'timepoint']) {
      if (typeof proposal[field] !== 'string' || !proposal[field].trim()) throw new Error(`${label}.proposal.${field} is invalid`);
    }
    normalizeRiskProposal(proposal);
    if (!/^sha256:[0-9a-f]{64}$/.test(proposal.record_hash || '')
      || proposal.record_hash !== recordIdentityHash(item.study, proposal)) throw new Error(`${label} has an invalid record hash`);
    if (!/^sha256:[0-9a-f]{64}$/.test(proposal.proposal_sha256 || '')
      || proposal.proposal_sha256 !== proposalCommitment(item.study, proposal)) throw new Error(`${label} has an invalid proposal commitment`);
  }

  function assertStoredApproved(study, label) {
    assertStoredStudyCore(study, label);
    for (const field of ['study_design', 'outcome', 'timepoint']) {
      if (typeof study[field] !== 'string' || !study[field].trim()) throw new Error(`${label}.${field} is invalid`);
    }
    const provenance = study.provenance;
    if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) throw new Error(`${label}.provenance is invalid`);
    for (const field of ['source', 'quote', 'source_locator', 'derivation']) {
      if (typeof provenance[field] !== 'string' || !provenance[field].trim()) throw new Error(`${label}.provenance.${field} is invalid`);
    }
    if (!study.risk_of_bias || typeof study.risk_of_bias !== 'object' || Array.isArray(study.risk_of_bias)) throw new Error(`${label}.risk_of_bias is invalid`);
    normalizeRiskProposal({
      risk_of_bias_status: study.risk_of_bias.status,
      risk_of_bias_instrument: study.risk_of_bias.instrument,
      risk_of_bias_assessor: study.risk_of_bias.assessor,
      risk_of_bias_date: study.risk_of_bias.assessment_date,
      risk_of_bias_source: study.risk_of_bias.source,
      risk_of_bias_overall_rationale: study.risk_of_bias.overall_rationale,
      risk_of_bias_domains: study.risk_of_bias.domains,
    });
    if (!/^sha256:[0-9a-f]{64}$/.test(provenance.record_hash || '')
      || provenance.record_hash !== recordIdentityHash(study, provenance)) throw new Error(`${label} has an invalid record hash`);
    if (!/^sha256:[0-9a-f]{64}$/.test(provenance.proposal_sha256 || '')
      || provenance.proposal_sha256 !== proposalCommitment(study, provenance)) throw new Error(`${label} has an invalid proposal commitment`);
  }

  function assertStoredImport(item, label) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${label} is invalid`);
    const expectedKeys = ['package_sha256', 'schema_version', 'dataset', 'source_artifact', 'source_record_ids', 'decisions', 'status'];
    const actualKeys = Object.keys(item);
    if (actualKeys.length !== expectedKeys.length || expectedKeys.some((key) => !actualKeys.includes(key))) throw new Error(`${label} has invalid fields`);
    if (!/^sha256:[0-9a-f]{64}$/.test(item.package_sha256 || '')) throw new Error(`${label}.package_sha256 is invalid`);
    if (item.schema_version !== PACKAGE_VERSION) throw new Error(`${label}.schema_version is invalid`);
    if (!item.dataset || typeof item.dataset !== 'object' || item.dataset.effect_measure !== 'SMD') throw new Error(`${label}.dataset is invalid`);
    if (!Array.isArray(item.source_record_ids) || item.source_record_ids.some((id) => typeof id !== 'string' || !id)) throw new Error(`${label}.source_record_ids is invalid`);
    if (new Set(item.source_record_ids).size !== item.source_record_ids.length) throw new Error(`${label}.source_record_ids contains duplicates`);
    if (!Array.isArray(item.decisions) || item.decisions.length !== item.source_record_ids.length || !item.decisions.length) throw new Error(`${label}.decisions is invalid`);
    const decisionFields = ['source_record_id', 'study_id', 'proposal_sha256', 'status'];
    for (const [index, decision] of item.decisions.entries()) {
      if (!decision || typeof decision !== 'object' || Array.isArray(decision)
        || Object.keys(decision).length !== decisionFields.length
        || decisionFields.some((key) => !Object.prototype.hasOwnProperty.call(decision, key))) throw new Error(`${label}.decisions[${index}] has invalid fields`);
      if (typeof decision.source_record_id !== 'string' || !decision.source_record_id
        || typeof decision.study_id !== 'string' || !decision.study_id
        || !/^sha256:[0-9a-f]{64}$/.test(decision.proposal_sha256 || '')
        || !['pending', 'approved', 'rejected'].includes(decision.status)) throw new Error(`${label}.decisions[${index}] is invalid`);
    }
    if (new Set(item.decisions.map((decision) => decision.source_record_id)).size !== item.decisions.length
      || new Set(item.decisions.map((decision) => decision.study_id)).size !== item.decisions.length) throw new Error(`${label}.decisions contains duplicate identities`);
    if (item.decisions.some((decision, index) => decision.source_record_id !== item.source_record_ids[index])) throw new Error(`${label}.decisions do not match source_record_ids`);
    if (item.status !== deriveImportStatus(item.decisions)) throw new Error(`${label}.status is inconsistent with its decisions`);
  }

  /** Rebuild a device-local session. Workspace snapshots may restore authored
   * claims; published documents keep their shipped claims and restore only the
   * reader's analyses, proposals, approvals and rule outcomes. */
  function restoreStoredSession() {
    const d = readSnapshot();
    if (!d) return false;
    try {
      // Build and validate a complete candidate without touching live state or DOM.
      // A failed restore is all-or-nothing, including title and hypothesis.
      if (d.v === 2) {
        const requiredSnapshotKeys = [
          'v', 'mode', 'title', 'hypothesis', 'approved', 'pending', 'claims',
          'claimStatus', 'ledger', 'evidenceVersion', 'runCounter',
          'auditLegacyImported', 'imports', 'lastReceipt',
        ];
        const actual = Object.keys(d);
        if (actual.length !== requiredSnapshotKeys.length || requiredSnapshotKeys.some((key) => !actual.includes(key))) {
          throw new Error('v2 snapshot has missing or unknown fields');
        }
        if (d.mode !== mode) throw new Error(`snapshot mode ${d.mode} does not match ${mode}`);
      }
      const approved = Array.isArray(d.approved) ? structuredClone(d.approved) : (() => { throw new Error('approved is missing'); })();
      const pending = Array.isArray(d.pending) ? structuredClone(d.pending) : (() => { throw new Error('pending is missing'); })();
      const imports = Array.isArray(d.imports) ? structuredClone(d.imports) : (() => { throw new Error('imports is missing'); })();
      const allClaims = isWorkspace
        ? (Array.isArray(d.claims) ? structuredClone(d.claims) : (() => { throw new Error('workspace claims are missing'); })())
        : structuredClone(authoredClaims);
      for (const claim of allClaims) {
        if (!claim || !CLAIM_ID_RE.test(String(claim.id ?? ''))) throw new Error('a restored claim id is unusable');
        if (typeof claim.statement !== 'string' || !claim.statement.trim() || claim.statement.length > 300) throw new Error(`restored claim ${claim.id} has an invalid statement`);
        if (typeof claim.rule !== 'string' || !claim.rule.trim()) throw new Error(`restored claim ${claim.id} has an invalid rule`);
        validateTest(claim.test, `restored claim ${claim.id}`);
      }
      if (new Set(allClaims.map((claim) => claim.id)).size !== allClaims.length) throw new Error('restored claims contain duplicate ids');

      if (!Number.isSafeInteger(d.evidenceVersion) || d.evidenceVersion < 1) throw new Error('evidenceVersion is invalid');
      if (!Number.isSafeInteger(d.runCounter) || d.runCounter < 0) throw new Error('runCounter is invalid');
      const rawAudit = Array.isArray(d.ledger) ? structuredClone(d.ledger) : (() => { throw new Error('ledger is missing'); })();
      if (d.v === 2 && rawAudit.some((entry) => !entry?.entry_hash)) throw new Error('v2 ledger contains an unsealed entry');
      const storedAudit = d.v === 1 && rawAudit.length ? migrateLegacyAudit(rawAudit) : rawAudit;
      const chain = verifyAuditChain(storedAudit);
      if (!chain.valid) throw new Error(`audit chain is invalid at run ${chain.first_invalid_run}`);
      if ((storedAudit.at(-1)?.run ?? 0) !== d.runCounter) throw new Error('runCounter does not match the audit ledger');
      for (const entry of storedAudit) {
        if (!['human', 'agent', 'system'].includes(entry.actor)) throw new Error(`audit run ${entry.run} has an invalid actor`);
        if (!Number.isSafeInteger(entry.evidence_version) || entry.evidence_version < 1 || entry.evidence_version > d.evidenceVersion) {
          throw new Error(`audit run ${entry.run} has an invalid evidence version`);
        }
        if (d.v === 2 && entry.result_digest !== null && !/^sha256:[0-9a-f]{64}$/.test(entry.result_digest || '')) {
          throw new Error(`audit run ${entry.run} has an invalid result digest`);
        }
      }

      const representedExperiments = new Set(state.base.map((record) => record.experiment_id));
      const representedRecords = [...state.base];
      for (const [index, study] of approved.entries()) {
        assertStoredApproved(study, `approved[${index}]`);
        if (representedExperiments.has(study.experiment_id)) throw new Error(`approved[${index}] duplicates experiment_id ${study.experiment_id}`);
        if (representedRecords.some((record) => record.author === study.author && record.year === study.year && Math.abs(record.yi - study.yi) < 1e-9)) {
          throw new Error(`approved[${index}] duplicates an existing quantitative record`);
        }
        const expected = estimandDefinition(representedRecords);
        if (expected.smd_variant && expected.smd_variant !== study.smd_variant) throw new Error(`approved[${index}] has an incompatible SMD variant`);
        if (expected.effect_direction && expected.effect_direction !== study.effect_direction) throw new Error(`approved[${index}] has an incompatible effect direction`);
        if (expected.collection_frame && expected.collection_frame !== study.collection_frame) throw new Error(`approved[${index}] has an incompatible collection frame`);
        representedExperiments.add(study.experiment_id);
        representedRecords.push(study);
      }
      const proposalIds = new Set();
      for (const [index, item] of pending.entries()) {
        assertStoredPending(item, `pending[${index}]`);
        if (proposalIds.has(item.study.id)) throw new Error(`pending[${index}] duplicates study id ${item.study.id}`);
        proposalIds.add(item.study.id);
        const anchored = storedAudit.filter((entry) => entry.kind === 'proposal' && entry.tool === 'propose_study'
          && entry.inputs?.study_id === item.study.id && entry.inputs?.proposal_sha256 === item.proposal.proposal_sha256);
        if (anchored.length !== 1) throw new Error(`pending[${index}] is not committed exactly once by the audit ledger`);
        const decisions = storedAudit.filter((entry) => entry.kind === 'approval' && entry.tool === 'propose_study'
          && entry.actor === 'human' && entry.inputs?.study_id === item.study.id
          && entry.inputs?.record_hash === item.proposal.record_hash
          && entry.inputs?.proposal_sha256 === item.proposal.proposal_sha256);
        if (item.status === 'pending') {
          if (decisions.length) throw new Error(`pending[${index}] has an approval decision but is still pending`);
          if (representedExperiments.has(item.study.experiment_id)) throw new Error(`pending[${index}] duplicates experiment_id ${item.study.experiment_id}`);
          if (representedRecords.some((record) => record.author === item.study.author && record.year === item.study.year && Math.abs(record.yi - item.study.yi) < 1e-9)) {
            throw new Error(`pending[${index}] duplicates an existing quantitative record`);
          }
          representedExperiments.add(item.study.experiment_id);
          representedRecords.push(item.study);
        } else {
          if (decisions.length !== 1 || decisions[0].inputs?.decision !== item.status) throw new Error(`pending[${index}] decision is inconsistent with the audit ledger`);
          const matches = approved.filter((study) => study.id === item.study.id
            && study.provenance?.proposal_sha256 === item.proposal.proposal_sha256
            && sha256Object(study) === sha256Object(item.study));
          if (item.status === 'approved' && matches.length !== 1) throw new Error(`pending[${index}] approved record is missing or changed`);
          if (item.status === 'rejected' && matches.length) throw new Error(`pending[${index}] rejected record appears in approved evidence`);
        }
      }
      imports.forEach((item, index) => assertStoredImport(item, `imports[${index}]`));
      for (const [index, study] of approved.entries()) {
        const reverse = pending.filter((item) => item.status === 'approved' && item.study.id === study.id
          && item.proposal.proposal_sha256 === study.provenance?.proposal_sha256
          && sha256Object(item.study) === sha256Object(study));
        if (reverse.length !== 1) throw new Error(`approved[${index}] has no unique approved proposal`);
      }
      if (d.evidenceVersion !== bootBaseline.evidenceVersion + approved.length) {
        throw new Error('evidenceVersion does not match the number of approved local proposals');
      }
      const importDecisions = imports.flatMap((registry) => registry.decisions.map((decision) => ({ registry, decision })));
      for (const [index, item] of pending.entries()) {
        const isImported = !!item.proposal.import_package_sha256;
        const matches = importDecisions.filter(({ registry, decision }) => registry.package_sha256 === item.proposal.import_package_sha256
          && decision.source_record_id === item.proposal.source_record_id
          && decision.study_id === item.study.id
          && decision.proposal_sha256 === item.proposal.proposal_sha256
          && decision.status === item.status);
        if (isImported && matches.length !== 1) throw new Error(`pending[${index}] has no unique matching import decision`);
        if (!isImported && matches.length) throw new Error(`pending[${index}] is unexpectedly linked to an import decision`);
      }
      for (const { decision } of importDecisions) {
        const reverse = pending.filter((item) => item.study.id === decision.study_id
          && item.proposal.source_record_id === decision.source_record_id
          && item.proposal.proposal_sha256 === decision.proposal_sha256
          && item.status === decision.status);
        if (reverse.length !== 1) throw new Error(`import decision for ${decision.study_id} has no unique proposal`);
      }

      const claimStatus = new Map();
      if (!Array.isArray(d.claimStatus)) throw new Error('claimStatus is missing');
      const validClaimIds = new Set(allClaims.map((claim) => String(claim.id)));
      for (const pair of d.claimStatus) {
        const [id, status] = Array.isArray(pair) ? pair : [];
        if (claimStatus.has(id) || !validClaimIds.has(id) || !status || typeof status !== 'object'
          || !['supported', 'challenged', 'nuanced'].includes(status.verdict)
          || typeof status.reason !== 'string' || !status.reason
          || !Number.isInteger(status.run) || status.run < 1 || status.run > d.runCounter
          || !Number.isInteger(status.evaluated_version) || status.evaluated_version < 1
          || status.evaluated_version > d.evidenceVersion) throw new Error('a restored claim status is invalid');
        const entry = storedAudit.find((candidate) => candidate.run === status.run);
        if (!entry || entry.kind !== 'claim' || entry.tool !== 'evaluate_claim'
          || entry.inputs?.claim_id !== id || entry.evidence_version !== status.evaluated_version
          || entry.result_digest !== sha256Object({ claim_id: id, verdict: status.verdict, reason: status.reason })) {
          throw new Error(`restored claim ${id} does not match its sealed evaluation entry`);
        }
        claimStatus.set(id, structuredClone(status));
      }
      const restoredTitle = isWorkspace
        ? (typeof d.title === 'string' && d.title.trim() ? d.title : (() => { throw new Error('workspace title is invalid'); })())
        : initialDoc.title;
      const restoredHypothesis = isWorkspace
        ? (typeof d.hypothesis === 'string' ? d.hypothesis : (() => { throw new Error('workspace hypothesis is invalid'); })())
        : initialDoc.hypothesis;
      const lastReceipt = d.lastReceipt === null || d.lastReceipt === undefined
        ? null
        : (typeof d.lastReceipt === 'object' && !Array.isArray(d.lastReceipt)
            ? structuredClone(d.lastReceipt) : (() => { throw new Error('lastReceipt is invalid'); })());
      if (lastReceipt) validateReceiptV1(lastReceipt);

      // Commit only after every candidate component has passed validation.
      doc.title = restoredTitle;
      doc.hypothesis = restoredHypothesis;
      state.evidenceVersion = d.evidenceVersion;
      state.runCounter = d.runCounter;
      state.approved = approved;
      state.pending = pending;
      state.imports = imports;
      state.audit = storedAudit;
      state.auditLegacyImported = d.v === 1 || !!d.auditLegacyImported;
      claims.length = 0;
      claims.push(...allClaims);
      state.claimStatus = claimStatus;
      state.lastReceipt = lastReceipt;
      // Never trust a persisted "verified" flag. The signature is checked again
      // asynchronously from the signed payload and embedded public key after boot.
      state.lastReceiptSignatureStatus = state.lastReceipt ? 'pending' : 'none';
      // Replay, do not re-ledger: a restored row keeps its original run and actor.
      for (const entry of state.audit) renderLedgerRow(entry);
      for (const item of state.pending) if (item.status === 'pending') renderPendingCard(item);
      return true;
    } catch (e) {
      console.warn('[living-evidence] local snapshot could not be restored, starting fresh:', e.message);
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
          format: 'Living Evidence v0.2 — an aggregate-SMD document your agent can cross-examine',
          mode,
          title: doc.title, hypothesis: doc.hypothesis,
          effect_measure: dataset.effect_measure,
          evidence_base: {
            k: included().length, original: state.base.length,
            record_count: included().length,
            experiment_count: countExperiments(),
            dependence_disclosure: dependenceDisclosure(),
            unit_note: dataset.unit_note || null,
            added_by_approved_proposals: state.approved.length,
            pending_proposals: state.pending.filter((p) => p.status === 'pending').length,
            evidence_version: state.evidenceVersion,
          },
          current_overall_fit: fit
            ? { model: fit.model, estimate: fit.estimate, ci: [fit.ci_lower, fit.ci_upper], p: fit.p, I2: fit.I2 }
            : null,
          claims: claimList(),
          evidence_quality: evidenceQuality(),
          reproducibility: reproducibilityStatus(),
          rule_outcome_scope: RULE_OUTCOME_SCOPE,
          verdict_scope: VERDICT_SCOPE,
          // Where this page sits in the suite: an agent that lands here should know
          // which surface answers which question without having to guess from a URL.
          suite_context: {
            you_are_here: isWorkspace ? 'workspace' : 'exemplar',
            exemplar: 'index.html — the populated exemplar: a filled evidence base and six claims, the fastest cross-examination demo.',
            workspace: 'workspace.html — the authoring surface: an empty page in the fixed SMD template that an agent fills and a human approves.',
            atlas: 'atlas.html — the evidence map: node/gap inspection over the same records and claims; no tool there changes the evidence.',
            board: 'board.html — experimental appendix: an unverified conversation-to-graph ingestion sandbox; not part of the exemplar, its evidence base, or its numerical/software verification.',
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
              'evaluate_claim — give the claim a visible registered-rule outcome badge.',
              'export_document — write the session out as a self-contained single-file living document.',
            ],
            workflow_note: 'This page is the authoring surface; the exemplar page is the fastest cross-examination demo.',
          } : {}),
          rules_of_engagement: [
            ...(isWorkspace ? ['This is an empty-by-design WORKSPACE, not a finished document: set_hypothesis states the question, propose_study fills the evidence base (human-approved), add_claim registers a machine-checkable claim, export_document writes the whole session out as a self-contained living document. Pooled statistics need at least 2 approved effect-size records.'] : []),
            'All statistics come from the page. For the bundled fixture, selected numerical outputs reproduce R metafor reference values to the tested precision. This checks numerical reproduction against the reference implementation, not the data or model assumptions, and does not validate a scientific conclusion. Use tool results when reporting page state. Independent calculations are welcome as checks — label them external and do not silently substitute them for the page\'s result.',
            `A rule outcome reports ${RULE_OUTCOME_SCOPE}. Legacy verdict/status fields carry the same internal code for v0.1 clients.`,
            'Analysis, registered-rule, mutation and receipt calls are ledgered; pure reads are not. Ledger entries form a SHA-256 hash chain. Analysis tools also render a figure into the document the human is reading.',
            ...(isWorkspace ? [] : ['The 19 analyzed rows represent 18 experiments; two condition records share one experiment id. The reference fit reproduces the historical 19-row analysis and does not model their within-experiment covariance.']),
            'Per-record provenance and risk-of-bias missingness are returned explicitly. Numerical reproduction does not verify extraction, primary sources, study quality, or model assumptions.',
            'You may propose adding a study (propose_study), but only the human reader can approve it into the evidence base. Both source and quote are required.',
            // A workspace has no prose to badge — its claims live in a list.
            `Use evaluate_claim to run the document's own registered rules; outcomes are shown as badges ${isWorkspace ? 'in the claims list' : 'in the prose'}. They are not truth or evidence-quality ratings.`,
            `The evidence base carries a version (now ${state.evidenceVersion}); it increments on every human approval. A rule outcome whose evaluated_version is lower is STALE — re-evaluate before citing it.`,
          ],
        };
      },
    },
    {
      name: 'list_claims', readOnly: true,
      description: `List addressable claims, their document-registered rules, and canonical rule outcomes (not_run / passed / failed / inconclusive). Legacy status codes remain for compatibility. A rule outcome reports ${RULE_OUTCOME_SCOPE}.`,
      inputSchema: { type: 'object', properties: {} },
      run: () => ({ rule_outcome_scope: RULE_OUTCOME_SCOPE, verdict_scope: VERDICT_SCOPE, claims: claimList() }),
    },
    {
      name: 'get_data_manifest', readOnly: true,
      description: 'Return the citeable scientific-state manifest: dataset identity, record and experiment counts, estimand definition, unit note, claim rules, provenance-completeness counts, risk-of-bias coverage, and SHA-256 state id. Records are omitted by default to protect context; set include_records=true for the full evidence table.',
      inputSchema: { type: 'object', properties: { include_records: { type: 'boolean', description: 'include every effect-size record with provenance and risk-of-bias fields (default false)' } } },
      run: (a = {}) => dataManifest(a.include_records === true),
    },
    {
      name: 'get_studies', readOnly: true,
      description: 'Return the full effect-size evidence table with record and experiment counts, experiment cluster ids, yi/vi, moderators, sample sizes, source locator/DOI/derivation/verification provenance, and structured risk-of-bias state. Set include_pending=true to include proposals.',
      inputSchema: { type: 'object', properties: { include_pending: { type: 'boolean', description: 'also list pending proposals (default false)' } } },
      run: (a = {}) => ({
        effect_measure: dataset.effect_measure,
        fields: dataset.fields,
        record_count: included().length,
        experiment_count: countExperiments(),
        unit_note: dataset.unit_note || null,
        evidence_quality: evidenceQuality(),
        studies: included(),
        ...(a.include_pending ? {
          pending_proposals: state.pending.map((p) => ({
            ...p.study, proposal_status: p.status,
            source: p.proposal.source, quote: p.proposal.quote,
            record_hash: p.proposal.record_hash, proposal_sha256: p.proposal.proposal_sha256,
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
      description: 'Leave-one-record-out sensitivity analysis: re-fit the random-effects model omitting each effect-size record in turn, and RENDER the plot into the document. Shows whether any single record drives the pooled result (min/max estimates, significance flips). It reports estimate changes and p<.05-status flips only — not stability of magnitude, dependence, moderators, heterogeneity, or bias diagnostics.',
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
      description: `Run one claim's document-registered rule. The analysis renders into the document and the badge reports passed / failed / inconclusive. It is not a truth, validity, bias, or evidence-quality rating. Legacy verdict codes remain in the response. Scope: ${RULE_OUTCOME_SCOPE}.`,
      inputSchema: { type: 'object', properties: { claim_id: { type: 'string', description: 'claim id from list_claims' } }, required: ['claim_id'] },
      run: (a = {}) => evaluateClaim(a.claim_id),
    },
    {
      name: 'propose_study',
      description: 'Propose one independent SMD record. Source locator, quote, derivation, design, outcome/timepoint, experiment id, SMD variant/direction, collection frame and explicit risk-of-bias status are required. An assessed RoB label additionally requires instrument, assessor, date, source, and domain rationales; otherwise use not_assessed. DOI remains optional when none exists. Dependent records and incompatible estimands are rejected because this v1 package runtime does not model their covariance. Human approval accepts an extraction into the local evidence base; it does not independently verify it.',
      inputSchema: {
        type: 'object',
        properties: {
          author: { type: 'string', minLength: 1 },
          year: { type: 'integer', minimum: 1900, maximum: 2100 },
          yi: { type: 'number', minimum: -10, maximum: 10, description: 'standardized mean difference, coded in effect_direction' },
          vi: { type: 'number', exclusiveMinimum: 0, description: 'sampling variance of yi' },
          weeks: { type: 'number', minimum: 0, description: 'weeks of prior teacher-student contact' },
          setting: { type: 'string', enum: ['group', 'indiv'], description: 'IQ test administration setting (group|indiv)' },
          tester: { type: 'string', enum: ['aware', 'blind'], description: 'whether the tester knew the expectancy assignment (aware|blind)' },
          n1i: { type: 'integer', minimum: 1, description: 'expectancy-group sample size' },
          n2i: { type: 'integer', minimum: 1, description: 'control-group sample size' },
          source: { type: 'string', minLength: 1, description: 'citation or URL for provenance' },
          quote: { type: 'string', minLength: 1, description: 'short verbatim excerpt the extracted numbers were read from (required)' },
          derivation: { type: 'string', minLength: 1, description: 'how yi and vi were derived, including the metafor measure or source cells used' },
          source_url: { type: 'string', description: 'resolvable source URL when available; the page does not fetch or verify it' },
          source_locator: { type: 'string', minLength: 1, description: 'page, table, figure, row, cell, or supplement locator' },
          doi: { type: 'string', description: 'DOI when one exists; omit rather than inventing one' },
          study_design: { type: 'string', minLength: 1, description: 'design relevant to interpreting this effect-size record' },
          outcome: { type: 'string', minLength: 1, description: 'outcome represented by yi' },
          timepoint: { type: 'string', minLength: 1, description: 'measurement time point represented by yi' },
          experiment_id: { type: 'string', minLength: 1, description: 'unique experiment id; v1 rejects a second record with the same id because dependent effects are unsupported' },
          record_role: { type: 'string', description: 'what this row represents within its experiment' },
          smd_variant: { type: 'string', enum: ['Hedges_g', 'Cohen_d', 'Glass_delta', 'other'], description: 'exact standardized-mean-difference definition' },
          smd_variant_detail: { type: 'string', description: 'required description when smd_variant is other' },
          effect_direction: { type: 'string', minLength: 1, description: 'what a positive yi means, including contrast direction' },
          collection_frame: { type: 'string', minLength: 1, description: 'eligibility/search frame defining what this evidence base attempted to collect' },
          risk_of_bias_status: { type: 'string', enum: ['low', 'some_concerns', 'high', 'not_assessed'], description: 'overall status; an assessed label requires all assessment metadata and remains author-supplied/unverified' },
          risk_of_bias_instrument: { type: 'string', description: 'named assessment instrument/version when assessed' },
          risk_of_bias_assessor: { type: 'string', description: 'person or team responsible for the assessment' },
          risk_of_bias_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'assessment date (YYYY-MM-DD)' },
          risk_of_bias_source: { type: 'string', description: 'citation, file, registry or record locating the assessment' },
          risk_of_bias_overall_rationale: { type: 'string', minLength: 1, description: 'rationale for the overall judgment; stored verbatim and not checked against an instrument-specific algorithm' },
          risk_of_bias_domains: {
            type: 'array', minItems: 1, description: 'instrument-specific domain judgments with a rationale',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                domain: { type: 'string', minLength: 1 },
                judgment: { type: 'string', enum: ['low', 'some_concerns', 'high', 'unclear', 'not_applicable'] },
                rationale: { type: 'string', minLength: 1 },
              },
              required: ['domain', 'judgment', 'rationale'],
            },
          },
        },
        required: [
          'author', 'year', 'yi', 'vi', 'weeks', 'source', 'quote', 'source_locator',
          'derivation', 'study_design', 'outcome', 'timepoint', 'experiment_id',
          'smd_variant', 'effect_direction', 'collection_frame', 'risk_of_bias_status',
        ],
        allOf: [
          {
            if: { properties: { risk_of_bias_status: { const: 'not_assessed' } }, required: ['risk_of_bias_status'] },
            then: {
              properties: {
                risk_of_bias_domains: { type: 'array', maxItems: 0 },
              },
            },
            else: {
              required: ['risk_of_bias_instrument', 'risk_of_bias_assessor', 'risk_of_bias_date', 'risk_of_bias_source', 'risk_of_bias_overall_rationale', 'risk_of_bias_domains'],
            },
          },
        ],
      },
      run: (a = {}) => proposeStudy(a),
    },
    {
      name: 'get_audit_log', readOnly: true,
      description: 'Return the reload-persistent, append-ordered audit ledger. Every entry carries SHA-256 result_digest, previous_entry_hash and entry_hash. The chain detects edits and reordering; it does not prove author identity or provide a trusted timestamp. Use create_reproducibility_receipt to sign a state with the current browser-session key.',
      inputSchema: { type: 'object', properties: {} },
      run: () => ({ chain: verifyAuditChain(), device_local: !!storageKey, legacy_history_rehashed_without_original_authentication: state.auditLegacyImported, entries: state.audit }),
    },
    {
      name: 'get_reproducibility_status', readOnly: true,
      description: 'Return SHA-256 scientific-state identity, audit-chain verification, persistence scope and the latest signed receipt. Runtime/artifact hashes are signed claims but are not self-verified in-page; use the detached receipt verifier for exact artifact bytes. This distinguishes content integrity from authorship, peer review, primary-source correctness and preservation.',
      inputSchema: { type: 'object', properties: {} },
      run: () => reproducibilityStatus(),
    },
    {
      name: 'create_reproducibility_receipt',
      description: 'Create and visibly render an ECDSA P-256 signed receipt for the current scientific-state SHA-256 and audit-chain head. The signing key is generated for this browser session; pin its fingerprint externally before treating the signature as authorship evidence.',
      inputSchema: { type: 'object', properties: {} },
      run: () => createReproducibilityReceipt(),
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
        description: 'Register a new addressable claim with its deterministic machine check. `test` is the declarative rule AST: {analysis, args?, focus?, verdicts:[{when:[{path,op,value}], verdict, reason}, …, {default:true, verdict, reason}]}. Ops: lt, le, gt, ge, eq, ne, abs_lt, abs_ge. Copy an existing claim\'s machine_check from list_claims as a template. Only the SHAPE is validated here — a claim is registered because it is well-formed, not because it currently passes. Use evaluate_claim afterwards to get a canonical passed / failed / inconclusive rule outcome.',
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
        description: 'Write a self-contained single-file Living Evidence document with evidence provenance, registered rules, runtime, WebMCP tools and an embedded ECDSA-signed scientific-state receipt. Returns an exact artifact_sha256 plus a detached receipt that must be saved and checked externally for byte-level artifact verification; HTML is included only when requested.',
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
    get_data_manifest: 'Data & provenance manifest',
    get_studies: 'Effect-size records', run_meta_analysis: 'Run meta-analysis',
    leave_one_out: 'Leave-one-out sensitivity', subgroup_analysis: 'Subgroup analysis',
    meta_regression: 'Meta-regression', funnel_check: 'Small-study asymmetry check',
    cumulative_meta: 'Cumulative meta-analysis', evaluate_claim: 'Evaluate a claim',
    propose_study: 'Propose adding a study', get_audit_log: 'Audit ledger',
    get_reproducibility_status: 'Reproducibility status',
    create_reproducibility_receipt: 'Create signed receipt',
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
    let result;
    try {
      // Inputs and outputs cross a trust boundary. Clone both so callers cannot
      // mutate a pending proposal, stored receipt, audit entry, rule AST or study
      // through a reference returned by the in-page API.
      result = tool.run(structuredClone(args || {}));
    } finally {
      currentActor = previousActor;
    }
    return result && typeof result.then === 'function'
      ? Promise.resolve(result).then((value) => structuredClone(value))
      : structuredClone(result);
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
      absent: `Manual mode — ${a.detail} The page still works: run a check yourself or use the Tool console below.`,
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
      get_document_overview: {}, list_claims: {}, get_data_manifest: { include_records: false }, get_studies: { include_pending: false },
      run_meta_analysis: { method: 'REML' }, leave_one_out: {},
      subgroup_analysis: { split_field: 'weeks', split_at: 1 },
      meta_regression: { moderator: 'weeks', cap: 3 },
      funnel_check: {}, cumulative_meta: {}, evaluate_claim: { claim_id: claims[0]?.id || 'c1' },
      propose_study: {
        author: 'Example & Author', year: 1976, yi: 0.1, vi: 0.05, weeks: 2,
        setting: 'group', tester: 'blind', source: 'Journal of Examples 12(3)',
        source_locator: 'Table 2, row 4', quote: 'g = 0.10; sampling variance = 0.05',
        derivation: 'Hedges g and vi transcribed directly from Table 2',
        study_design: 'randomized expectancy-induction experiment', outcome: 'measured IQ',
        timepoint: 'post-intervention', experiment_id: 'example-1976-01',
        smd_variant: 'Hedges_g', effect_direction: dataset.effect_direction || 'positive = higher outcome in intervention than control',
        collection_frame: dataset.collection_frame || 'Records meeting this workspace review protocol',
        risk_of_bias_status: 'not_assessed',
      },
      get_audit_log: {}, get_reproducibility_status: {}, create_reproducibility_receipt: {},
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
  const restored = storageKey ? restoreStoredSession() : false;
  if (!restored && state.audit.length) {
    for (const entry of state.audit) renderLedgerRow(entry);
  }
  renderHypothesis();
  renderDocumentClaimStatements();
  renderClaimsList();
  if (mounts.reset) {
    mounts.reset.addEventListener('click', () => {
      if (!confirm(`${isWorkspace ? 'Reset this workspace' : 'Clear this device-local reading session'}? Saved analyses, rule outcomes, proposals and the audit chain will be deleted.`)) return;
      if (clearPersisted()) location.reload();
      else {
        renderReproducibilityPanel();
        alert('The saved session could not be removed from this browser. The page was not reloaded, because the old state could return. Check browser storage permissions and try again.');
      }
    });
  }
  const fit0 = refreshHeadline();
  // The boot entry is the PAGE talking, not a human and not an agent.
  ledger({
    kind: 'init', tool: 'init', actor: 'system',
    inputs: { dataset: dataset.id ?? null, k: included().length, ...(isWorkspace ? { mode, restored } : {}) },
    result: fit0,
    summary: fit0
      ? `${restored ? 'workspace restored' : 'document loaded'} — evidence base k=${included().length}, pooled ${fmt(fit0.estimate)} [${fmt(fit0.ci_lower)}, ${fmt(fit0.ci_upper)}], p=${fmt(fit0.p)}`
      : `${restored ? 'workspace restored' : 'workspace opened'} — evidence base k=${included().length}, nothing to pool yet (needs 2 effect-size records)`,
  });
  renderConsole();
  renderReproducibilityPanel();
  const receiptReady = (async () => {
    const localCandidate = state.lastReceipt;
    if (localCandidate) {
      const verified = await verifyReceiptSignature(localCandidate);
      if (state.lastReceipt === localCandidate) state.lastReceiptSignatureStatus = verified;
    }
    const publishedCandidate = state.publishedReceipt;
    if (publishedCandidate) {
      const verified = await verifyReceiptSignature(publishedCandidate);
      if (state.publishedReceipt === publishedCandidate) state.publishedReceiptSignatureStatus = verified;
    }
    renderReproducibilityPanel();
  })();
  const ready = Promise.all([registerWebMCP(), receiptReady]).then(([agent]) => {
    renderStatus();
    return structuredClone(agent);
  });

  const api = {
    version: '0.2.0',
    mode,
    tools: tools.map((t) => ({
      name: t.name, title: t.title, description: t.description,
      inputSchema: structuredClone(t.inputSchema), readOnly: !!t.readOnly,
    })),
    // invokeTool(name, args) still works; the third argument is optional.
    invokeTool,
    invokeToolJSON: (name, args, opts) => {
      const result = invokeTool(name, args, opts);
      return result && typeof result.then === 'function'
        ? result.then((value) => JSON.stringify(value)) : JSON.stringify(result);
    },
    stageEvidencePackage: (packageInput, opts) => structuredClone(stageEvidencePackage(packageInput, opts)),
    // a getter, not a snapshot: a workspace grows claims after boot
    get claims() { return structuredClone(claims.map((c) => ({ id: c.id, rule: c.rule, test: c.test }))); },
    // Diagnostic state is a snapshot, never a writable reference into the runtime.
    get state() { return structuredClone(state); },
    ready,
  };
  if (typeof window !== 'undefined') window.LivingEvidence = api;
  return api;
}
