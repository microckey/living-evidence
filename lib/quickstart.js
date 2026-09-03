// Progressive enhancement for the exemplar. Uses the public handlers and
// observes the shared ledger, so native WebMCP calls appear here too.
export async function initQuickstart(api) {
  const root = document.getElementById('quickstart');
  if (!root) return;
  await api.ready;
  const find = (selector) => root.querySelector(selector);
  const call = (name, args = {}) => api.invokeTool(name, args, { actor: 'human' });
  const outcome = find('[data-quick-outcome]');
  const reason = find('[data-quick-reason]');
  const attribution = find('[data-quick-attribution]');
  const check = find('[data-quick-check]');
  const provenance = find('[data-quick-provenance]');
  function refresh() {
    const state = api.state;
    const status = state.claimStatus.get('c-textbook');
    if (find('[data-quick-manifest]').open) renderManifest();
    if (!status) {
      outcome.textContent = 'Not run on this device';
      delete outcome.dataset.outcome;
      reason.textContent = 'Run the check yourself, or ask your WebMCP agent to do it. Both update this page.';
      attribution.textContent = 'Buttons are human actions, not an agent simulation.';
      return;
    }
    const claim = call('list_claims').claims.find((c) => c.id === 'c-textbook');
    const entry = state.audit.find((e) => e.run === status.run);
    outcome.textContent = `${claim.stale ? 'Stale — rerun required · ' : ''}Registered rule ${claim.rule_outcome}`;
    outcome.dataset.outcome = claim.rule_outcome;
    reason.textContent = status.reason;
    attribution.textContent = `Run #${status.run} · ${entry?.actor === 'agent' ? 'agent / tool client' : 'human'} · evidence version ${claim.evaluated_version}${claim.stale ? ` (current: ${claim.evidence_version})` : ''}. This reports the authored rule, not scientific truth.`;
  }
  function renderManifest() {
    const manifest = call('get_data_manifest');
    const q = manifest.evidence_quality;
    find('[data-quick-quality]').textContent = `${q.primary_source_checked}/${q.effect_size_records} primary reports checked · ${q.effect_size_derivation_checked}/${q.effect_size_records} derivations independently checked · ${q.structured_risk_of_bias_assessment_supplied_unverified}/${q.effect_size_records} structured risk-of-bias assessments supplied. ${q.note}`;
    find('[data-quick-manifest-json]').textContent = JSON.stringify({
      dataset: manifest.dataset.label,
      record_count: manifest.dataset.record_count,
      experiment_count: manifest.dataset.experiment_count,
      evidence_quality: q,
      dependence: manifest.analysis_spec.dependence_disclosure,
      scientific_state_sha256: manifest.scientific_state_sha256,
    }, null, 2);
  }
  check.addEventListener('click', async () => {
    check.disabled = true;
    try {
      await call('evaluate_claim', { claim_id: 'c-textbook' });
      refresh();
    } catch (error) {
      outcome.textContent = 'Check did not complete';
      reason.textContent = error.message;
    } finally { check.disabled = false; }
  });
  provenance.addEventListener('click', () => {
    try {
      renderManifest();
      const panel = find('[data-quick-manifest]');
      panel.hidden = false;
      panel.open = true;
    } catch (error) { reason.textContent = `Manifest unavailable: ${error.message}`; }
  });
  find('[data-quick-manifest]').addEventListener('toggle', () => {
    if (find('[data-quick-manifest]').open) renderManifest();
  });
  find('[data-quick-copy]').addEventListener('click', async () => {
    const prompt = find('[data-quick-prompt]');
    try {
      await navigator.clipboard.writeText(prompt.value);
      find('[data-quick-copy-status]').textContent = 'Copied. Paste into your WebMCP-capable agent.';
    } catch {
      prompt.focus();
      prompt.select();
      find('[data-quick-copy-status]').textContent = 'Copy is unavailable here. The prompt is selected for manual copying.';
    }
  });
  new MutationObserver(refresh).observe(document.getElementById('le-ledger'), { childList: true });
  refresh();
  check.disabled = false;
  provenance.disabled = false;
}
