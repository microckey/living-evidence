// pygmalion-claims.js — the six addressable claims of the Pygmalion exemplar.
//
// Claims are DATA, not code: each `test` is a declarative AST the rule engine
// (lib/claim-rules.js) walks — no eval, nothing to hide. An agent can read the
// exact rule through list_claims before deciding whether the verdict means
// anything, and the same JSON travels with the document.
//
// They live in their own module because more than one page needs them: the
// exemplar document (index.html) renders them as spans inside its prose, and the
// evidence map (atlas.html) renders them as nodes on a graph. Both pages must be
// arguing about the SAME claims, byte-identical rules included — a map whose
// claims had drifted from the document's would be worse than no map at all.
//
// `statement` is the sentence the claim asserts. In the document it is redundant
// (living-evidence.js's statementOf() reads the prose span, which is the real
// source of truth there — the reader must see exactly what is being tested);
// in the atlas there is no prose to read, so this field is what gets displayed.

export const CLAIMS = [
  {
    id: 'c-textbook',
    statement: 'simply raising a teacher’s expectations makes children measurably smarter',
    rule: 'Supported iff the pooled random-effects (REML) estimate over the full evidence base is positive AND p < 0.05.',
    test: {
      analysis: 'overall',
      args: { method: 'REML' },
      verdicts: [
        {
          when: [{ path: 'significant', op: 'eq', value: true }, { path: 'estimate', op: 'gt', value: 0 }],
          verdict: 'supported',
          reason: 'pooled SMD {estimate}, p = {p} < 0.05',
        },
        {
          default: true,
          verdict: 'challenged',
          reason: 'pooled SMD {estimate} [{ci_lower}, {ci_upper}], p = {p} — the general claim is not supported across the full evidence base',
        },
      ],
    },
  },
  {
    id: 'c-overall',
    statement: 'pooled across all studies, the average expectancy effect is small and not statistically significant',
    rule: 'Supported iff the pooled REML estimate has p ≥ 0.05 AND |SMD| < 0.2 (small by Cohen’s convention).',
    test: {
      analysis: 'overall',
      args: {},
      verdicts: [
        {
          when: [{ path: 'significant', op: 'eq', value: false }, { path: 'estimate', op: 'abs_lt', value: 0.2 }],
          verdict: 'supported',
          reason: 'pooled SMD {estimate} (|SMD| < 0.2), p = {p} ≥ 0.05',
        },
        {
          when: [{ path: 'significant', op: 'eq', value: true }],
          verdict: 'challenged',
          reason: 'pooled effect IS significant (p = {p})',
        },
        {
          default: true,
          verdict: 'nuanced',
          reason: 'not significant, but |SMD| ({estimate}) ≥ 0.2',
        },
      ],
    },
  },
  {
    id: 'c-moderator',
    statement: 'The length of prior teacher–pupil contact explains essentially all of the between-study differences',
    rule: 'Supported iff meta-regression on min(weeks, 3) has negative slope, p < 0.05, AND R² ≥ 90% of heterogeneity explained.',
    test: {
      analysis: 'metareg',
      args: { moderator: 'weeks', cap: 3 },
      verdicts: [
        {
          when: [
            { path: 'moderator.b', op: 'lt', value: 0 },
            { path: 'moderator.p', op: 'lt', value: 0.05 },
            { path: 'R2_percent', op: 'ge', value: 90 },
          ],
          verdict: 'supported',
          reason: 'slope {moderator.b} per week (p = {moderator.p}), R² = {R2_percent}% of between-study heterogeneity explained',
        },
        {
          when: [
            { path: 'moderator.b', op: 'lt', value: 0 },
            { path: 'moderator.p', op: 'lt', value: 0.05 },
          ],
          verdict: 'nuanced',
          reason: 'slope significant ({moderator.b}, p = {moderator.p}) but explains only {R2_percent}% of heterogeneity',
        },
        {
          default: true,
          verdict: 'challenged',
          reason: 'moderator not significant (slope {moderator.b}, p = {moderator.p})',
        },
      ],
    },
  },
  {
    id: 'c-window',
    statement: 'in studies where teachers had known their pupils for at most one week, the expectancy induction produced a significant IQ gain',
    rule: 'Supported iff the subgroup with ≤ 1 week of prior contact has a positive pooled estimate with p < 0.05.',
    test: {
      analysis: 'subgroup',
      args: { split_field: 'weeks', split_at: 1 },
      focus: { collection: 'groups', match_field: 'group', match_substring: '≤ 1' },
      verdicts: [
        {
          when: [{ path: 'f.estimate', op: 'gt', value: 0 }, { path: 'f.significant', op: 'eq', value: true }],
          verdict: 'supported',
          reason: '≤1-week subgroup (k={f.k}): SMD {f.estimate} [{f.ci_lower}, {f.ci_upper}], p = {f.p}',
        },
        {
          default: true,
          verdict: 'challenged',
          reason: '≤1-week subgroup not significantly positive (SMD {f.estimate}, p = {f.p})',
        },
      ],
    },
  },
  {
    id: 'c-robust',
    statement: 'no single study drives these conclusions',
    rule: 'Supported iff leave-one-out re-fits never flip the significance status of the pooled estimate.',
    test: {
      analysis: 'loo',
      args: {},
      verdicts: [
        {
          when: [{ path: 'flips_significance.length', op: 'eq', value: 0 }],
          verdict: 'supported',
          reason: '{rows.length} re-fits, estimates {min_estimate}…{max_estimate}, no significance flips',
        },
        {
          default: true,
          verdict: 'challenged',
          reason: 'omitting {flips_significance} flips the conclusion',
        },
      ],
    },
  },
  {
    id: 'c-bias',
    statement: 'the evidence base shows no signs of publication bias',
    rule: 'Supported iff Egger’s test p ≥ 0.10; nuanced if 0.05 ≤ p < 0.10 (borderline asymmetry); challenged if p < 0.05.',
    test: {
      analysis: 'funnel',
      args: {},
      verdicts: [
        {
          when: [{ path: 'p', op: 'ge', value: 0.10 }],
          verdict: 'supported',
          reason: 'Egger’s test p = {p} — no indication of small-study asymmetry',
        },
        {
          when: [{ path: 'p', op: 'ge', value: 0.05 }],
          verdict: 'nuanced',
          reason: 'Egger’s test p = {p}: not significant at α = 0.05, but borderline — “no signs of publication bias” overstates the confidence this test supports',
        },
        {
          default: true,
          verdict: 'challenged',
          reason: 'Egger’s test p = {p} < 0.05 — significant small-study asymmetry',
        },
      ],
    },
  },
];
