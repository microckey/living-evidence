import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  BENCHMARK_BASELINE,
  buildReference,
  scoreRun,
  summarizeRuns,
} from '../lib/comparison-eval.js';
import { DATASET } from '../data/raudenbush1985.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const reference = buildReference(DATASET.studies);

assert.deepEqual(reference, {
  overall: { k: 19, estimate: 0.0837, ci_lower: -0.0175, ci_upper: 0.1849, p: 0.1051 },
  exclude_s04: { k: 18, estimate: 0.0577, ci_lower: -0.0292, ci_upper: 0.1446, p: 0.1929, excluded: ['s04'] },
  bias: { egger_p: 0.057426, rule_outcome: 'inconclusive' },
});

const perfect = scoreRun(JSON.stringify(reference), reference);
assert.equal(perfect.status, 'scored');
assert.equal(perfect.score, 13);
assert.equal(perfect.proportion, 1);

const oneWrong = structuredClone(reference);
oneWrong.bias.rule_outcome = 'passed';
const scoredWrong = scoreRun(oneWrong, reference);
assert.equal(scoredWrong.score, 12);
assert.deepEqual(scoredWrong.checks.filter((item) => !item.pass).map((item) => item.path), ['bias.rule_outcome']);

const boundary = structuredClone(reference);
boundary.overall.estimate += 0.0005;
assert.equal(scoreRun(boundary, reference).checks.find((item) => item.path === 'overall.estimate').pass, true);
boundary.overall.estimate += 0.000001;
assert.equal(scoreRun(boundary, reference).checks.find((item) => item.path === 'overall.estimate').pass, false);

assert.equal(scoreRun('{bad', reference).status, 'parse_error');
assert.equal(scoreRun('[]', reference).status, 'parse_error');

assert.deepEqual(summarizeRuns([]), { n: 0, mean: null, range: null });
assert.deepEqual(summarizeRuns([perfect, scoredWrong, { status: 'parse_error' }]), {
  n: 2,
  mean: 25 / 26,
  range: [12 / 13, 1],
});

const pdf = await readFile(path.resolve(root, BENCHMARK_BASELINE.file));
const digest = createHash('sha256').update(pdf).digest('hex');
assert.equal(digest, BENCHMARK_BASELINE.sha256);

console.log('comparison-eval.test.mjs: all green');
