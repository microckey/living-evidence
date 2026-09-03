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
// `statement` is the canonical sentence the claim asserts and the signed source
// of truth. The runtime paints document and atlas text from this value so mutable
// DOM text cannot silently change what a receipt or export claims to cover.

export const CLAIMS = [
  {
    id: 'c-textbook',
    statement: 'simply raising a teacher’s expectations makes children measurably smarter',
    rule: 'Supported iff the pooled random-effects (REML) estimate over the full evidence base is positive AND p < 0.05. Passing would not establish generalized intelligence gains, uniform benefit, or transportability beyond these experiments.',
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
    statement: 'pooled across all effect-size records, the average expectancy effect is small and not statistically significant',
    rule: 'Supported iff the pooled REML estimate has p ≥ 0.05 AND |SMD| < 0.2. This is a heuristic smallness check (|SMD| < 0.2 is Cohen’s convention, not a domain-defined SESOI), not an equivalence test.',
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
    statement: 'The length of prior teacher–pupil contact is associated, under the fitted capped-linear model, with essentially all of the between-study differences',
    rule: 'Supported iff meta-regression on min(weeks, 3) has negative slope, p < 0.05, AND R² ≥ 90%. R² here is a boundary-clipped proportional reduction in estimated τ², with no uncertainty interval; association, not causation.',
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
        // A significant slope pointing the WRONG way is not "not significant": the
        // old default reason mislabelled a positive-significant fit as a failure to
        // detect anything. It is a detected association contradicting the claim.
        {
          when: [
            { path: 'moderator.p', op: 'lt', value: 0.05 },
            { path: 'moderator.b', op: 'ge', value: 0 },
          ],
          verdict: 'challenged',
          reason: 'slope is statistically significant but nonnegative ({moderator.b}, p = {moderator.p}) — contrary to the claimed negative association',
        },
        {
          default: true,
          verdict: 'challenged',
          reason: 'the required negative association was not detected (slope {moderator.b}, p = {moderator.p})',
        },
      ],
    },
  },
  {
    id: 'c-window',
    statement: 'in studies where teachers had known their pupils for at most one week, the expectancy induction produced a significant IQ gain',
    rule: 'Supported iff the subgroup with ≤ 1 week of prior contact has a positive pooled estimate with p < 0.05. A within-subgroup test in a post-hoc subset; it does not by itself establish a difference from the >1-week subgroup — subgroup_analysis’s between-group test addresses that.',
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
    statement: 'no single effect-size record changes whether the pooled estimate crosses p < 0.05',
    rule: 'Supported iff leave-one-record-out re-fits never flip the p < 0.05 status of the pooled estimate. This checks one threshold only; it is not leave-one-experiment-out and does not establish stability of magnitude, moderators, heterogeneity, bias, or dependent effects.',
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
    rule: 'Egger’s regression test for small-study asymmetry, read as explicit strength-of-evidence labels: supported (p ≥ 0.10: no detected asymmetry), nuanced (0.05 ≤ p < 0.10: borderline signal — a distinct strength-of-evidence label, not a pass), challenged (p < 0.05: asymmetry detected).',
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
