import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = spawn('python3', ['-m', 'http.server', '8505', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:8505/');
  await page.waitForFunction(() => !document.querySelector('[data-quick-check]').disabled);
  assert.equal(await page.textContent('[data-quick-outcome]'), 'Not run on this device');
  const button = await page.locator('[data-quick-check]').boundingBox();
  assert.ok(button.y + button.height < 900, 'first action visible in first desktop viewport');
  assert.equal(await page.evaluate(() => window.LivingEvidence.state.audit.filter((e) => e.kind === 'claim').length), 0, 'no automatic rule check');
  await page.click('[data-quick-check]');
  await page.waitForFunction(() => document.querySelector('[data-quick-outcome]').textContent === 'Registered rule failed');
  assert.match(await page.textContent('[data-quick-attribution]'), /human/);
  assert.match(await page.textContent('[data-claim="c-textbook"] .le-chip'), /rule failed/);
  assert.match(await page.textContent('[data-quick-reason]'), /0\.105/);
  assert.equal(await page.textContent('[data-le-bind="k"]'), '19');
  await page.click('[data-quick-provenance]');
  assert.match(await page.textContent('[data-quick-quality]'), /0\/19 primary reports checked/);
  const manifest = JSON.parse(await page.textContent('[data-quick-manifest-json]'));
  assert.equal(manifest.record_count, 19);
  assert.equal(manifest.experiment_count, 18);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-quick-outcome]').textContent === 'Registered rule failed');
  assert.match(await page.textContent('[data-quick-attribution]'), /human/);
  // This is the public-handler UI regression path; native transport is tested separately.
  await page.evaluate(() => window.LivingEvidence.invokeTool('evaluate_claim', { claim_id: 'c-textbook' }));
  await page.waitForFunction(() => document.querySelector('[data-quick-attribution]').textContent.includes('agent / tool client'));
  await page.click('[data-quick-provenance]');
  await page.locator('[data-quick-manifest] summary').click();
  await page.evaluate(() => window.LivingEvidence.invokeTool('propose_study', {
    author: 'Synthetic quickstart test', year: 2026, yi: 0.1, vi: 0.04, weeks: 2,
    source: 'Synthetic test; not a publication', quote: 'Synthetic g 0.1; variance 0.04',
    source_locator: 'Onboarding test fixture', derivation: 'Invented test values',
    study_design: 'synthetic experiment', outcome: 'IQ', timepoint: 'post-test',
    experiment_id: 'onboarding-synthetic', risk_of_bias_status: 'not_assessed', smd_variant: 'Hedges_g',
    effect_direction: 'positive = higher measured IQ in the expectancy group than control',
    collection_frame: 'Experiments included in the Raudenbush (1984) teacher-expectancy synthesis',
  }));
  await page.locator('.le-btn-approve').click();
  assert.match(await page.textContent('[data-quick-outcome]'), /Stale — rerun required/);
  await page.locator('[data-quick-manifest] summary').click();
  await page.waitForFunction(() => document.querySelector('[data-quick-quality]').textContent.includes('0/20 primary'));
  assert.equal(JSON.parse(await page.textContent('[data-quick-manifest-json]')).record_count, 20);
  // Fresh display for screenshots, separate from the modified test-only session.
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('[data-quick-check]').disabled);
  await page.click('[data-quick-check]');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/living-evidence-onboarding-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:8505/');
  await page.waitForFunction(() => !document.querySelector('[data-quick-check]').disabled);
  const mobileButton = await page.locator('[data-quick-check]').boundingBox();
  assert.ok(mobileButton.y + mobileButton.height < 844, 'first action visible on mobile');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
  await page.screenshot({ path: '/tmp/living-evidence-onboarding-mobile.png' });
  console.log('PASS quick start: visible action, human/agent attribution, provenance, persistence, responsive layout');

  await page.goto('http://127.0.0.1:8505/workspace.html');
  await page.evaluate(() => window.LivingEvidence.ready);
  await page.click('#le-load-sample');
  await page.waitForFunction(() => document.querySelectorAll('#le-pending .le-pending-card').length === 3);
  assert.equal(await page.textContent('[data-le-bind="k"]'), '0');
  assert.match(await page.textContent('#le-import-status'), /SYNTHETIC DEMO ONLY/);
  assert.match(await page.textContent('#le-pending'), /not a publication/);
  assert.ok(!/An agent proposed/.test(await page.textContent('#le-pending')));
  await page.click('#le-load-sample');
  assert.match(await page.textContent('#le-import-status'), /requires an empty workspace/);
  assert.equal(await page.locator('#le-pending .le-pending-card').count(), 3);
  await page.locator('.le-btn-approve').first().click();
  assert.equal(await page.textContent('[data-le-bind="k"]'), '1');
  await page.locator('.le-btn-approve').first().click();
  assert.equal(await page.textContent('[data-le-bind="k"]'), '2');
  assert.equal(await page.locator('#le-main-figure svg').count(), 1);
  const exportError = await page.evaluate(async () => {
    try { await window.LivingEvidence.invokeTool('export_document'); return null; }
    catch (error) { return error.message; }
  });
  assert.match(exportError, /cannot export.*await human review/i);
  await page.reload();
  await page.evaluate(() => window.LivingEvidence.ready);
  assert.equal(await page.textContent('[data-le-bind="k"]'), '2');
  assert.equal(await page.locator('.le-btn-approve').count(), 1);
  const guarded = await browser.newContext();
  const realPage = await guarded.newPage();
  await realPage.goto('http://127.0.0.1:8505/workspace.html');
  await realPage.evaluate(async () => {
    await window.LivingEvidence.ready;
    window.LivingEvidence.invokeTool('set_hypothesis', { text: 'A real research question without records yet' });
  });
  await realPage.click('#le-load-sample');
  assert.match(await realPage.textContent('#le-import-status'), /requires an empty workspace/);
  assert.equal(await realPage.locator('#le-pending .le-pending-card').count(), 0);
  await guarded.close();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS sample: 3 review cards, no automatic approvals, no mixing, forest after 2 approvals, pending export blocked, reload retained');
} finally {
  await browser.close();
  server.kill();
}
