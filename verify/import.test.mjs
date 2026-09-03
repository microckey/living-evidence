import assert from 'node:assert/strict';
import {
  PACKAGE_VERSION,
  parseCsvRfc4180,
  parseEvidenceContent,
} from '../lib/evidence-package.js';

const dataset = {
  id: 'review-2026', label: 'Review 2026', effect_measure: 'SMD',
  smd_variant: 'Hedges_g',
  effect_direction: 'positive = intervention higher than control',
  collection_frame: 'Protocol v1; searched MEDLINE through 2026-08-31',
};
const study = {
  id: 'r01', author: 'Doe, J.', year: 2024, yi: 0.2, vi: 0.04, weeks: 2,
  source: 'doi:10.test/x', quote: 'Table says "g = 0.2" and continues',
  source_locator: 'Table 2, row 1', derivation: 'metafor::escalc(measure="SMDH")',
  study_design: 'parallel randomized trial', outcome: 'test score', timepoint: '8 weeks',
  experiment_id: 'doe-2024-rct', risk_of_bias_status: 'not_assessed',
};
const packageObject = { schema_version: PACKAGE_VERSION, dataset, studies: [study] };

const headers = [
  'id', 'author', 'year', 'yi', 'vi', 'weeks', 'source', 'quote', 'source_locator',
  'derivation', 'study_design', 'outcome', 'timepoint', 'experiment_id',
  'risk_of_bias_status', 'smd_variant', 'effect_direction', 'collection_frame',
];
const csv = `\uFEFF${headers.join(',')}\r\n` +
  'r01,"Doe, J.",2024,0.2,0.04,2,doi:10.test/x,"Table says ""g = 0.2,""\nand continues","Table 2, row 1","metafor::escalc(measure=""SMDH"")",parallel randomized trial,test score,8 weeks,doe-2024-rct,not_assessed,Hedges_g,positive = intervention higher than control,Protocol v1\r\n';
const rows = parseCsvRfc4180(csv);
assert.equal(rows.length, 1);
assert.equal(rows[0].author, 'Doe, J.');
assert.match(rows[0].quote, /g = 0\.2,/);
const pkg = parseEvidenceContent(csv, 'metafor.csv', {
  sourceArtifact: { filename: 'metafor.csv', media_type: 'text/csv', sha256: `sha256:${'a'.repeat(64)}` },
});
assert.equal(pkg.schema_version, PACKAGE_VERSION);
assert.equal(pkg.studies[0].yi, 0.2);
assert.equal(pkg.dataset.smd_variant, 'Hedges_g');
assert.equal(pkg.source_artifact.sha256, `sha256:${'a'.repeat(64)}`);

assert.throws(() => parseEvidenceContent('author,year\nA,2024', 'bad.csv'), /missing required CSV column/);
assert.throws(() => parseEvidenceContent(`${headers.join(',')},email\n${headers.map(() => 'x').join(',')},a@b.test`, 'bad.csv'), /identifier columns/);

const qmd = `# Review\n\n\`\`\`{living-evidence}\n${JSON.stringify({
  ...packageObject,
  studies: [{ ...study, quote: '</script> remains text' }],
})}\n\`\`\``;
assert.equal(parseEvidenceContent(qmd, 'review.qmd').studies[0].quote, '</script> remains text');

const notebook = JSON.stringify({
  metadata: { living_evidence: { ...packageObject, studies: [{ ...study, quote: '=1+1 is inert evidence text' }] } },
  cells: [{ cell_type: 'code', source: ['throw new Error("must not execute")'], metadata: {} }],
});
assert.equal(parseEvidenceContent(notebook, 'review.ipynb').studies[0].quote, '=1+1 is inert evidence text');

assert.throws(() => parseEvidenceContent(JSON.stringify({
  ...packageObject, dataset: { ...dataset, effect_measure: 'RR' },
}), 'bad.json'), /effect_measure must be SMD/);
assert.throws(() => parseEvidenceContent(JSON.stringify({
  ...packageObject, studies: [{ ...study, yi: true }],
}), 'bad.json'), /yi must be a number/);
assert.throws(() => parseEvidenceContent(JSON.stringify({
  ...packageObject, studies: [{ ...study, yi: '0.2' }],
}), 'bad.json'), /JSON number/);
assert.throws(() => parseEvidenceContent(JSON.stringify({
  ...packageObject, studies: [{ ...study, surprise: 'field' }],
}), 'bad.json'), /unknown field/);
assert.throws(() => parseEvidenceContent(JSON.stringify({
  ...packageObject,
  studies: [study, { ...study, id: 'r02', author: 'Smith', experiment_id: study.experiment_id }],
}), 'bad.json'), /cannot model dependent effects/);
assert.throws(() => parseEvidenceContent(JSON.stringify({
  ...packageObject,
  source_artifact: { filename: 'bad.csv', media_type: 'text/csv', sha256: 'not-a-hash' },
}), 'bad.json'), /64 lowercase hex/);

const assessed = parseEvidenceContent(JSON.stringify({
  ...packageObject,
  studies: [{
    ...study,
    risk_of_bias_status: 'low',
    risk_of_bias_instrument: 'Example RoB tool v1',
    risk_of_bias_assessor: 'Review team A',
    risk_of_bias_date: '2026-09-04',
    risk_of_bias_source: 'Protocol appendix, Table RoB-1',
    risk_of_bias_overall_rationale: 'Overall judgment supplied by the review team.',
    // Instrument-specific aggregation is deliberately not guessed by this runtime.
    risk_of_bias_domains: [{ domain: 'Allocation', judgment: 'high', rationale: 'Illustrative source rationale.' }],
  }],
}), 'assessed.json');
assert.equal(assessed.studies[0].risk_of_bias_overall_rationale, 'Overall judgment supplied by the review team.');
assert.equal(assessed.studies[0].risk_of_bias_domains[0].judgment, 'high');
assert.throws(() => parseEvidenceContent(JSON.stringify({
  ...packageObject,
  studies: [{
    ...study, risk_of_bias_status: 'some_concerns',
    risk_of_bias_instrument: 'Tool', risk_of_bias_assessor: 'Team',
    risk_of_bias_date: '2026-09-04', risk_of_bias_source: 'Appendix',
    risk_of_bias_domains: [{ domain: 'Missing data', judgment: 'some_concerns', rationale: 'Attrition reported.' }],
  }],
}), 'bad-rob.json'), /overall rationale/);
assert.throws(() => parseCsvRfc4180('a,b\r\n"closed"x,y\r\n'), /unexpected character after a closing quote/);

console.log('import.test.mjs: all green');
