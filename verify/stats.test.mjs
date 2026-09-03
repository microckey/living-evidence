// Golden tests for the meta-analysis engine.
// Reference values come from R's metafor package output for dat.raudenbush1985 as
// published on https://wviechtb.github.io/metadat/reference/dat.raudenbush1985.html :
//   rma(yi, vi, data=dat)  [REML]
//     estimate 0.0837 (SE 0.0516), p 0.1051, CI [-0.0175, 0.1849]
//     tau^2 0.0188, I^2 41.86%, Q(18) 35.83 (p 0.0074)
//   rma(yi, vi, mods=~weeks.c, data=dat) with weeks.c = min(weeks, 3)  [REML]
//     intercept 0.407 (SE 0.087, p<.001), slope -0.157 (SE 0.036, p<.001), R^2 100%
import {
  metaAnalyze, leaveOneOut, subgroupAnalysis, metaRegression, eggerTest,
  cumulativeMeta, chiSqSf, normP2, tP2, tau2DL,
} from '../lib/meta-stats.js';
import { DATASET } from '../data/raudenbush1985.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  ok  ${name}`); }
  else { failures++; console.error(`FAIL  ${name}  ${detail}`); }
}
function near(name, got, want, tol) {
  check(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `got ${got}, want ${want} ±${tol}`);
}

const S = DATASET.studies;
check('dataset has 19 effect-size records', S.length === 19);

// --- special functions sanity ---
near('chiSqSf(35.83, 18)', chiSqSf(35.83, 18), 0.0074, 0.0002);
near('normP2(1.959964)', normP2(1.959964), 0.05, 1e-6);
near('tP2(2.1098, 17)', tP2(2.1098, 17), 0.05, 2e-4); // t_{0.975,17} = 2.1098

// --- REML random-effects model vs published metafor output ---
const re = metaAnalyze(S, { method: 'REML' });
near('REML estimate', re.estimate, 0.0837, 5e-4);
near('REML se', re.se, 0.0516, 5e-4);
near('REML p', re.p, 0.1051, 1.5e-3);
near('REML ci_lower', re.ci_lower, -0.0175, 6e-4);
near('REML ci_upper', re.ci_upper, 0.1849, 6e-4);
near('REML tau2', re.tau2, 0.0188, 5e-4);
near('REML I2', re.I2, 41.86, 0.15);
near('Q', re.Q, 35.83, 0.01);
check('Q df', re.Q_df === 18);
near('Q p', re.Q_p, 0.0074, 2e-4);
check('overall effect NOT significant at 0.05', re.significant === false, JSON.stringify(re));

// --- DL estimator sanity (no external golden; must be positive and near REML) ---
const dl = metaAnalyze(S, { method: 'DL' });
check('DL tau2 > 0', dl.tau2 > 0);
check('DL estimate within 0.03 of REML', Math.abs(dl.estimate - re.estimate) < 0.03, `${dl.estimate} vs ${re.estimate}`);
near('tau2DL direct', tau2DL(S.map(s => s.yi), S.map(s => s.vi)), dl.tau2, 5e-7); // dl.tau2 is rounded to 6dp

// --- fixed-effects model consistency ---
const fe = metaAnalyze(S, { method: 'FE' });
check('FE se < RE se', fe.se < re.se, `${fe.se} vs ${re.se}`);

// --- meta-regression on weeks.c = min(weeks,3) vs published metafor output ---
const mr = metaRegression(S, (s) => Math.min(s.weeks, 3));
near('MR intercept', mr.intercept.b, 0.407, 1e-3);
near('MR intercept se', mr.intercept.se, 0.087, 1e-3);
check('MR intercept p < .001', mr.intercept.p < 0.001, `${mr.intercept.p}`);
near('MR slope', mr.moderator.b, -0.157, 1e-3);
near('MR slope se', mr.moderator.se, 0.036, 1e-3);
check('MR slope p < .001', mr.moderator.p < 0.001, `${mr.moderator.p}`);
check('MR R2 ~ 100%', mr.R2_percent > 99.5, `${mr.R2_percent}`);
check('MR residual tau2 ~ 0', mr.tau2 < 1e-4, `${mr.tau2}`);

// --- subgroup analysis: early contact (<=1 week) vs established contact (>1 week) ---
const sg = subgroupAnalysis(S, (s) => (s.weeks <= 1 ? 'low prior contact (<=1 week)' : 'high prior contact (>1 week)'));
const low = sg.groups.find((g) => g.group.startsWith('low'));
const high = sg.groups.find((g) => g.group.startsWith('high'));
check('low-contact group has 8 studies', low.k === 8, `${low.k}`);
check('high-contact group has 11 studies', high.k === 11, `${high.k}`);
check('low-contact effect positive & significant', low.estimate > 0.2 && low.significant === true, JSON.stringify(low));
check('high-contact effect near zero & not significant', Math.abs(high.estimate) < 0.1 && high.significant === false, JSON.stringify(high));
check('between-group difference significant', sg.between_group_test.significant === true, JSON.stringify(sg.between_group_test));

// --- leave-one-out ---
const loo = leaveOneOut(S, { method: 'REML' });
check('LOO has 19 rows', loo.rows.length === 19);
const dropPellegrini = loo.rows.find((r) => r.omitted === 's04');
check('dropping Pellegrini&Hicks(aware) lowers the estimate', dropPellegrini.estimate < re.estimate, `${dropPellegrini.estimate} vs ${re.estimate}`);
check('LOO overall stays non-significant in every re-fit', loo.flips_significance.length === 0, JSON.stringify(loo.flips_significance));

// --- Egger test runs and returns finite values ---
const eg = eggerTest(S);
check('Egger returns finite intercept/p', Number.isFinite(eg.intercept) && Number.isFinite(eg.p), JSON.stringify(eg));
console.log(`  (Egger: intercept ${eg.intercept}, t ${eg.t}, p ${eg.p})`);

// --- cumulative meta-analysis ---
const cum = cumulativeMeta(S, { method: 'REML' });
check('cumulative has 18 rows', cum.rows.length === 18, `${cum.rows.length}`);
near('cumulative final row equals full fit', cum.rows[cum.rows.length - 1].estimate, re.estimate, 1e-9);

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nstats.test.mjs: all green');
