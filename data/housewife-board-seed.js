// housewife-board-seed.js — seed data for the Evidence Board (board.html + lib/board.js).
//
// Semantic English presentation of docs/BOARD-SPEC.md §6 (frozen 2026-08-31): 40 nodes
// (2 hypotheses, 4 mechanisms, 8 claims, 23 evidence, 3 questions) and, as of
// the Codex-review fix round (D4), 41 edges (incl. FOUR evidence→hypothesis
// edges — e-kaiki, e-mikonritsu and e-kyuyo supporting h-selection, e-ishiki
// supporting h-model — per the v1 matrix ruling in docs/BOARD-SPEC.md §1).
// Every evidence node carries the seed verification label and an English
// `cited_as`. Japanese verbatim excerpts remain in `quote`, with an explicit
// English `quote_translation` beside them — this is agent-extracted material
// from a ChatGPT research conversation, not independently checked, and every
// surface that shows it must say so (see BOARD-SPEC.md §0). `kind` is likewise
// only ever "source kind as reported in the conversation (unverified)" — not
// an independently
// checked classification.
//
// Seed-data facts the spec's own prose could not honestly resolve,
// documented once here rather than silently patched over:
//
//  - e-kyuyo is the one evidence row §6 never gives a quotable fragment for
//    ("the conversation table lists it without a clear source line"). It uses
//    quote_status:not_available plus quote_missing_reason rather than
//    fabricating source prose or storing an explanatory note as a quotation.
//
//  - [Codex-review fix D4, applied here]: two contradicts edges into
//    h-selection — ed35 (c-notonly → h-selection) and ed43 (e-1995 →
//    h-selection) — were REMOVED. Both refuted "economic selection as the
//    SOLE explanation," a reading no node actually asserts: h-selection
//    itself only claims selection raises the rate, and c-notonly's own
//    content (selection alone can't explain the gap) already feeds h-model
//    as a SUPPORTED claim via ed34. Edges whose own rationale argues against
//    their target's actual content contradicted themselves, not the board.
//    41 edges remain (43 minus these two); every remaining supports/
//    contradicts edge below carries a one-line rationale.

const SEED_VERIFICATION = 'unverified — extracted from a ChatGPT research conversation (2026-08); the cited primary sources were not independently checked';

function seedProvenance(extra = {}) {
  return {
    origin: 'seed',
    source: null,
    quote: null,
    quote_status: null,
    quote_missing_reason: null,
    quote_language: null,
    quote_translation: null,
    quote_origin: null,
    cited_as: null,
    verification: null,
    proposed_at: null,
    approved_at: null,
    ...extra,
  };
}

function hypothesis(id, label, statement) {
  return { id, type: 'hypothesis', label, statement, provenance: seedProvenance() };
}

function mechanism(id, label, statement) {
  return { id, type: 'mechanism', label, statement, provenance: seedProvenance() };
}

function claim(id, label, statement) {
  return { id, type: 'claim', label, statement, provenance: seedProvenance() };
}

function evidence(id, label, statement, {
  value, year, kind, cited_as, quote = null,
  quote_status = quote ? 'available' : 'not_available',
  quote_missing_reason = null,
  quote_language = quote ? 'ja' : null,
  quote_translation = null,
}) {
  return {
    id, type: 'evidence', label, statement,
    value, year, kind, cited_as, quote, quote_status, quote_missing_reason,
    quote_language, quote_translation,
    verification: SEED_VERIFICATION,
    provenance: seedProvenance({
      cited_as, quote, quote_status, quote_missing_reason, quote_language,
      quote_translation, quote_origin: 'conversation', verification: SEED_VERIFICATION,
    }),
  };
}

function question(id, label, statement, test_sketch = null) {
  return { id, type: 'question', label, statement, test_sketch, provenance: seedProvenance() };
}

function edge(id, from, to, type, rationale = null) {
  return { id, from, to, type, rationale, provenance: seedProvenance() };
}

// ---------------------------------------------------------------- nodes

const HYPOTHESES = [
  hypothesis(
    'h-selection',
    'Economic selection hypothesis',
    'Because Tokyo’s economic barriers to marriage and childbearing are high, families who go on to have children may be disproportionately higher-income, raising the share of non-employed wives among families with children.',
  ),
  hypothesis(
    'h-model',
    'Four-factor model',
    'Tokyo’s higher share of non-employed wives is explained by overlapping economic selection, limited grandparent support, commuting and time costs, and the economic rationality of a single-earner arrangement in high-income households. The alternative “urban homemaker preference” explanation is not consistent with the reported data.',
  ),
];

const MECHANISMS = [
  mechanism('m-selection', 'High costs → marriage/childbearing barriers → income selection', 'High costs raise barriers to marriage and childbearing, selecting families with children toward higher household incomes.'),
  mechanism('m-grandparent', 'Three-generation proximity → grandparent care → dual earners', 'Living with or near grandparents enables childcare support and makes dual-earner arrangements more feasible.'),
  mechanism('m-time', 'Long commutes + care constraints → higher dual-earner time costs', 'Long commutes and after-school-care constraints increase the time costs of sustaining two careers.'),
  mechanism('m-oneincome', 'High income × overwork → single earner becomes rational', 'When a high-earning husband also works very long hours, a single-earner arrangement can become economically rational for the household.'),
];

const CLAIMS = [
  claim('c-gap', 'Tokyo’s wife non-employment rate is about 3.6× Fukui’s', 'Among families whose youngest child is age 6–14, Tokyo’s wife non-employment rate is about 3.6 times Fukui’s.'),
  claim('c-marriage', 'Tokyo’s low fertility mainly reflects a low married share', 'Tokyo’s low fertility mainly reflects its low married share: fewer people reach marriage.'),
  claim('c-income', 'Higher husbands’ income is associated with wives’ non-employment', 'Higher husbands’ income is associated with wives being non-employed or limiting earnings to remain dependents.'),
  claim('c-grandparent', 'Grandparent-care infrastructure supports regional dual earners', 'Regional differences in grandparent childcare support help sustain dual-earner families outside Tokyo.'),
  claim('c-commute', 'Commute differences raise dual-earner costs around Tokyo', 'Longer commutes raise the cost of maintaining two careers in the Tokyo metropolitan area.'),
  claim('c-values', 'A simple “rural conservative, Tokyo egalitarian” story does not fit', 'The reported regional differences are not explained by a simple “rural areas are conservative and Tokyo is egalitarian” values story; some measures point in the opposite direction.'),
  claim('c-notonly', 'Economic selection alone cannot explain the regional gap', 'Economic selection alone cannot explain the regional gap because the reported difference predates its recent intensification.'),
  claim('c-industry', 'Regional industry structures may support women’s career continuity', 'Industry structures outside Tokyo may make it easier for women to remain in regular full-time employment.'),
];

const EVIDENCE = [
  evidence('e-mukyo', 'Wife non-employment, youngest child age 6–14',
    'Among families whose youngest child is age 6–14, the reported wife non-employment rate is 26.4% in Tokyo and 7.3% in Fukui (highest and lowest nationally).',
    { value: 'Tokyo 26.4% vs Fukui 7.3% (highest vs lowest nationally)', year: 2022, kind: 'official-stat', cited_as: 'Employment Status Survey, Table 158 (Statistics Bureau of Japan)', quote: '末子6〜14歳家庭の妻無業率 26.4%(東京) 7.3%(福井)', quote_translation: 'Wife non-employment rate in families whose youngest child is age 6–14: 26.4% (Tokyo), 7.3% (Fukui).' }),
  evidence('e-tfr', 'Total fertility rate',
    'The conversation reports a total fertility rate of 0.96 in Tokyo (lowest nationally) and 1.45 in Fukui (third highest).',
    { value: 'Tokyo 0.96 (lowest nationally) vs Fukui 1.45 (third highest)', year: 2025, kind: 'official-stat', cited_as: 'Ministry of Health, Labour and Welfare', quote: '2025年は東京0.96で全国最低、福井1.45で全国3位', quote_translation: 'In 2025, Tokyo was lowest nationally at 0.96, while Fukui ranked third at 1.45.' }),
  evidence('e-yuhaigu', 'Married share (2020 Population Census)',
    'For men, the reported married share is 51.3% in Tokyo (lowest nationally) and 61.6% in Fukui; for women, it is 49.4% and 57.4%.',
    { value: 'Men: Tokyo 51.3% vs Fukui 61.6% / Women: Tokyo 49.4% vs Fukui 57.4%', year: 2020, kind: 'official-stat', cited_as: 'Statistics Bureau of Japan', quote: '男性：東京51.3%（全国最低）', quote_translation: 'Men: Tokyo 51.3% (lowest nationally).' }),
  evidence('e-mikon', 'Never-married share',
    'The conversation reports never-married shares of 42.1% for men and 33.5% for women in Tokyo, both the highest nationally.',
    { value: 'Tokyo: men 42.1%, women 33.5% (both highest nationally)', year: 2020, kind: 'official-stat', cited_as: 'Statistics Bureau of Japan', quote: '未婚割合は…東京42.1%（全国最高）', quote_translation: 'The never-married share … Tokyo 42.1% (highest nationally).' }),
  evidence('e-konin', 'Marriages per 1,000 population',
    'The reported crude marriage rate is 5.9 per 1,000 in Tokyo versus 4.1 nationally, so the annual flow of marriages is not unusually small.',
    { value: 'Tokyo 5.9 > national 4.1 per 1,000', year: 2025, kind: 'official-stat', cited_as: 'Ministry of Health, Labour and Welfare', quote: '単純な人口千人当たり婚姻率は、むしろ東京が5.9で全国4.1より高い', quote_translation: 'The crude marriage rate per 1,000 is actually higher in Tokyo at 5.9 than the national figure of 4.1.' }),
  evidence('e-shokon', 'Mean age at first marriage',
    'The conversation reports Tokyo’s mean age at first marriage as 32.2 for husbands and 30.7 for wives, the highest nationally for both.',
    { value: 'Tokyo: husbands 32.2, wives 30.7 (highest nationally)', year: 2024, kind: 'official-stat', cited_as: 'Ministry of Health, Labour and Welfare', quote: '平均初婚年齢は東京都が男女とも全国最高', quote_translation: 'Tokyo has the highest mean age at first marriage nationally for both men and women.' }),
  evidence('e-sansedai', 'Three-generation household share',
    'The reported three-generation household share is 1.3% in Tokyo (lowest nationally) and 11.5% in Fukui (second highest), an approximately 8.8-fold difference.',
    { value: 'Tokyo 1.3% (lowest) vs Fukui 11.5% (second highest) — about 8.8×', year: 2020, kind: 'official-stat', cited_as: 'Statistics Bureau of Japan', quote: '東京 1.3% ― 全国最低 福井 11.5% ― 全国2位', quote_translation: 'Tokyo 1.3% — lowest nationally; Fukui 11.5% — second highest.' }),
  evidence('e-fukui-doukyo', 'Couple + children + parent among dual-earner families',
    'The reported share of dual-earner families consisting of a couple, children, and a parent is 17.8% in Fukui versus 6.4% nationally.',
    { value: 'Fukui 17.8% vs national 6.4%', year: 'n/a', kind: 'survey', cited_as: 'Fukui Prefecture', quote: '福井では、共働き家庭のうち夫婦＋子＋親世帯が17.8%', quote_translation: 'In Fukui, 17.8% of dual-earner families consist of a couple, children, and a parent.' }),
  evidence('e-doukyo-shugyo', 'Living with parents and wives’ employment',
    'The cited regression is reported as associating co-residence with parents with greater employment among wives.',
    { value: 'Co-residence with parents is associated with greater employment among wives', year: 'n/a', kind: 'regression', cited_as: 'Research Institute of Economy, Trade and Industry (RIETI)', quote: '親との同居は妻の就業を促進する方向に働いています', quote_translation: 'Living with parents works in the direction of promoting wives’ employment.' }),
  evidence('e-tsukin', 'Average daily commuting and school-travel time',
    'Reported daily commuting and school-travel times are 100 minutes in Kanagawa, 95 in Chiba, 95 in Tokyo, 79 nationally, and 62 in Fukui.',
    { value: 'Kanagawa 100 / Chiba 95 / Tokyo 95 / national 79 / Fukui 62 minutes', year: 2021, kind: 'official-stat', cited_as: 'Statistics Bureau of Japan', quote: '神奈川 100分 千葉 95分 東京 95分 全国 79分 福井 62分', quote_translation: 'Kanagawa 100 min; Chiba 95; Tokyo 95; national 79; Fukui 62.' }),
  evidence('e-kaji', 'Husbands’ housework/childcare time and wives’ employment',
    'More time spent by husbands on housework and childcare is reported as associated with greater employment among wives, while higher husband income is associated with less participation at home.',
    { value: 'More husband housework/childcare ↔ greater wife employment; higher husband income ↔ less participation', year: 'n/a', kind: 'regression', cited_as: 'Research Institute of Economy, Trade and Industry (RIETI)', quote: '夫の家事・育児時間が多いほど妻が就業しやすく', quote_translation: 'The more time a husband spends on housework and childcare, the more likely his wife is to work.' }),
  evidence('e-60h', 'Husbands’ work hours and wives’ full-time employment',
    'When husbands work more than 60 hours per week, wives’ full-time employment rate is reported to fall substantially.',
    { value: 'Husband works >60 hours/week → substantially lower wife full-time employment', year: 'n/a', kind: 'survey', cited_as: 'Japan Institute for Labour Policy and Training (JILPT)', quote: '夫の労働時間が週60時間を超えると妻のフルタイム就業率が大きく低下', quote_translation: 'When a husband works more than 60 hours per week, his wife’s full-time employment rate falls substantially.' }),
  evidence('e-zeimu', 'Husband income and wife employment adjustment (tax records)',
    'After matching wives’ pre-birth income, higher husband income is reported as associated with wives becoming dependents or having no income after childbirth.',
    { value: 'After matching pre-birth income, higher husband income → wife more often dependent or without income', year: 'n/a', kind: 'regression', cited_as: 'Research Institute of Economy, Trade and Industry (RIETI)', quote: '夫の収入が高いほど、出産後に妻が扶養内または無収入になる割合が高くなる', quote_translation: 'The higher the husband’s income, the larger the share of wives who become dependents or have no income after childbirth.' }),
  evidence('e-jilpt16', 'Wife non-employment by husband-income quartile',
    'Reported wife non-employment rates across husband-income quartiles are 24.6%, 24.2%, 35.7%, and 31.1%, which is not monotonic.',
    { value: '24.6% / 24.2% / 35.7% / 31.1% — not monotonic', year: 2016, kind: 'survey', cited_as: 'Japan Institute for Labour Policy and Training (JILPT)', quote: '24.6%、24.2%、35.7%、31.1%', quote_translation: '24.6%, 24.2%, 35.7%, 31.1%.' }),
  evidence('e-teishotoku', 'Low husband income and wife employment',
    'The tendency for wives to work more often when husbands have lower incomes is reported as weakening but still present.',
    { value: 'Lower husband income → higher wife employment (weaker but still present)', year: 2025, kind: 'study', cited_as: 'Japan Institute for Labour Policy and Training (JILPT)', quote: '夫が低所得の家庭ほど妻の就業率が高い傾向', quote_translation: 'Wives tend to have higher employment rates in families where husbands have lower incomes.' }),
  evidence('e-kaiki', 'Prefectural regression of married share',
    'A prefectural regression is reported as finding that non-regular employment, education costs, and high rents significantly reduce the married share.',
    { value: 'Non-regular employment, education costs, and rents significantly reduce the married share', year: 'n/a', kind: 'regression', cited_as: 'Cabinet Office, Government of Japan', quote: '非正規雇用率が高い → 有配偶率↓', quote_translation: 'Higher non-regular employment → lower married share.' }),
  evidence('e-mikonritsu', 'Men’s income and never-married share',
    'Among men, higher income is reported as associated with a lower never-married share.',
    { value: 'Higher men’s income → lower never-married share', year: 'n/a', kind: 'regression', cited_as: 'Cabinet Office, Government of Japan', quote: '男性では所得が高くなるほど未婚率が低下する関係', quote_translation: 'Among men, the never-married share decreases as income rises.' }),
  evidence('e-1995', '1995 homemaker share (reported in the conversation)',
    'The conversation reports a 1995 “full-time homemaker share among married women” of 50.4% in Tokyo and 31.1% in Fukui. The indicator definition and primary census table remain unconfirmed.',
    { value: 'Married-women homemaker share: Tokyo 50.4% vs Fukui 31.1% — already a large gap in 1995', year: 1995, kind: 'official-stat', cited_as: '1995 Population Census (Statistics Bureau of Japan), as cited in the conversation', quote: 'なんと1995年国勢調査でも、有配偶女性の専業主婦率は、東京 50.4% 福井 31.1%でした。', quote_translation: 'Remarkably, even in the 1995 Population Census, the full-time homemaker share among married women was 50.4% in Tokyo and 31.1% in Fukui.' }),
  evidence('e-ishiki', 'Traditional gender-role attitudes',
    'For women, Southern Kanto is reported as having the lowest traditional gender-role attitudes nationally on almost every item.',
    { value: 'Women in Southern Kanto rank lowest nationally on almost every item', year: 2025, kind: 'official-stat', cited_as: 'White Paper on Gender Equality (Cabinet Office, Government of Japan)', quote: '南関東＝東京圏がほとんどの項目で全国で最も低い', quote_translation: 'Southern Kanto—the Tokyo region—is the lowest nationally on almost every item.' }),
  evidence('e-ushinai', 'Employment-rate decline from ages 25–29 to 35–39',
    'The reported employment-rate decline from ages 25–29 to 35–39 is 1.7 percentage points in Hokuriku versus 9.8 in Southern Kanto, the largest nationally.',
    { value: 'Hokuriku 1.7 points vs Southern Kanto 9.8 points (largest nationally)', year: 'n/a', kind: 'official-stat', cited_as: 'White Paper on Gender Equality (Cabinet Office, Government of Japan)', quote: '北陸：わずか1.7ポイント 南関東：9.8ポイント', quote_translation: 'Hokuriku: only 1.7 percentage points; Southern Kanto: 9.8 percentage points.' }),
  evidence('e-sangyo', 'Industry composition of women in regular employment',
    'Among women in regular employment, manufacturing accounts for 19.2% in Hokuriku versus 10.3% in Southern Kanto; health and welfare accounts for 23.0% in Southern Kanto versus 30–37% in other regions.',
    { value: 'Manufacturing: Hokuriku 19.2% vs Southern Kanto 10.3% / Health & welfare: 23.0% vs 30–37%', year: 2022, kind: 'official-stat', cited_as: 'Cabinet Office, Government of Japan', quote: '北陸19.2%に対し南関東10.3%', quote_translation: '19.2% in Hokuriku compared with 10.3% in Southern Kanto.' }),
  evidence('e-hoiku', 'Childcare capacity and women’s labor-force participation',
    'Prefectures with more childcare places per woman age 25–49 are reported as tending to have higher women’s labor-force participation.',
    { value: 'More childcare places per woman age 25–49 → higher labor-force participation', year: 'n/a', kind: 'regression', cited_as: 'Cabinet Office, Government of Japan', quote: '保育所定員が多い都道府県ほど女性の労働参加率が高い傾向', quote_translation: 'Prefectures with more childcare places tend to have higher women’s labor-force participation.' }),
  // No verbatim fragment was given for this row in the source conversation (see
  // the file header) — cited_as is the spec's own honest label for it, and the
  // machine-readable missing-quote fields say plainly that no quotable text
  // exists rather than presenting an explanatory note as an original quote.
  evidence('e-kyuyo', 'Monthly pay for male general (non-part-time) workers',
    'The conversation table reports monthly pay of ¥441,000 for male general (non-part-time) workers in Tokyo, the highest nationally.',
    { value: 'Male general workers: Tokyo ¥441,000/month (highest nationally)', year: 2024, kind: 'official-stat', cited_as: 'Comparison table in the source conversation', quote_status: 'not_available', quote_missing_reason: 'The conversation’s comparison table lists only the number and provides no quotable prose.' }),
];

const QUESTIONS = [
  question('q-decompose', 'How much would income adjustment shrink the Tokyo–Fukui gap?',
    'How many percentage points would the reported Tokyo–Fukui wife non-employment gap shrink after adjusting for husbands’ income?',
    'Use Employment Status Survey microdata or detailed cross-tabs to model wife non-employment ~ husband income + wife potential wage + youngest-child age + parent co-residence + commute + region, then estimate the adjusted regional gap.'),
  question('q-causal', 'Is there a causal study of income selection among Tokyo parents?',
    'Has any causal study directly measured the strength of income selection among Tokyo families with children? None was found in the source conversation.'),
  question('q-share', 'Decompose the reported 19.1-point gap by candidate mechanism',
    'How much of the reported 19.1-point Tokyo–Fukui gap is attributable to economic selection, grandparent support, commuting, and industry structure?'),
];

const NODES = [...HYPOTHESES, ...MECHANISMS, ...CLAIMS, ...EVIDENCE, ...QUESTIONS];

// ---------------------------------------------------------------- edges

const EDGES = [
  // hypothesis refines hypothesis
  edge('ed01', 'h-model', 'h-selection', 'refines'),

  // mechanism part-of hypothesis (all four mechanisms belong to h-model)
  edge('ed02', 'm-selection', 'h-model', 'part-of'),
  edge('ed03', 'm-grandparent', 'h-model', 'part-of'),
  edge('ed04', 'm-time', 'h-model', 'part-of'),
  edge('ed05', 'm-oneincome', 'h-model', 'part-of'),

  // evidence -> claim (supports / contradicts)
  edge('ed06', 'e-mukyo', 'c-gap', 'supports',
    'The reported 26.4% and 7.3% values yield the “about 3.6×” comparison.'),
  edge('ed07', 'e-tfr', 'c-marriage', 'supports',
    'Tokyo’s reported nationally lowest total fertility rate supports a premise of the claim.'),
  edge('ed08', 'e-yuhaigu', 'c-marriage', 'supports',
    'The married share itself is reported at the nation’s lowest level in Tokyo.'),
  edge('ed09', 'e-mikon', 'c-marriage', 'supports',
    'A high never-married share is the complement of a low married share.'),
  edge('ed10', 'e-konin', 'c-marriage', 'contradicts',
    'This challenges the naïve claim that Tokyo has the lowest annual marriage rate; it can coexist with the stock-based married-share claim (flow versus stock).'),
  edge('ed11', 'e-shokon', 'c-marriage', 'supports',
    'Later first marriage tends to reduce the married share observed at a point in time.'),
  edge('ed12', 'e-sansedai', 'c-grandparent', 'supports',
    'Regional differences in three-generation households proxy differences in grandparent-care infrastructure.'),
  edge('ed13', 'e-fukui-doukyo', 'c-grandparent', 'supports',
    'Fukui’s above-average parent co-residence among dual-earner families supports the presence of grandparent support.'),
  edge('ed14', 'e-doukyo-shugyo', 'c-grandparent', 'supports',
    'The reported regression association between parent co-residence and wives’ employment supports the grandparent-support mechanism; it does not establish causality here.'),
  edge('ed15', 'e-tsukin', 'c-commute', 'supports',
    'The regional commute-time difference directly describes a difference in time costs.'),
  edge('ed16', 'e-kaji', 'c-commute', 'supports',
    'The association between husbands’ participation at home and wives’ employment reinforces the importance of household time constraints.'),
  edge('ed17', 'e-60h', 'c-commute', 'supports',
    'The reported association between husbands’ long hours and lower full-time employment among wives supports the time-cost mechanism.'),
  edge('ed18', 'e-zeimu', 'c-income', 'supports',
    'The reported tax-record follow-up adjusts for wives’ pre-birth income, providing more direct—but still unverified here—support.'),
  edge('ed19', 'e-jilpt16', 'c-income', 'contradicts',
    'The upper quartiles are higher, but the sequence is not monotonic: a partial challenge.'),
  edge('ed20', 'e-teishotoku', 'c-income', 'supports',
    'The tendency for wives to work more when husbands earn less supports the same association from the opposite direction.'),
  edge('ed21', 'e-kaiki', 'c-marriage', 'supports',
    'The reported regression links urban cost variables—non-regular employment, education costs, and rents—to a lower married share.'),
  // e-mikonritsu and e-kyuyo are seeded above but have no edge here — see the
  // file header (§6 named only an evidence->hypothesis edge for both, which
  // the validity matrix does not allow for any edge type).
  edge('ed22', 'e-1995', 'c-notonly', 'supports',
    'The conversation’s report of a large gap already in 1995 supports the claim that the gap predates recent selection changes; the primary source has not been checked.'),
  edge('ed23', 'e-ishiki', 'c-values', 'supports',
    'Reported lower traditional-role attitudes in the Tokyo region run against a simple urban-homemaker-preference explanation.'),
  edge('ed24', 'e-ushinai', 'c-values', 'supports',
    'The much larger employment-rate decline during marriage and childbearing ages in Southern Kanto points to structure not captured by values alone.'),
  edge('ed25', 'e-sangyo', 'c-industry', 'supports',
    'Regional industry differences among women in regular employment support the industry-structure hypothesis.'),
  edge('ed26', 'e-hoiku', 'c-industry', 'supports',
    'The reported association between childcare capacity and women’s labor-force participation supports an infrastructure channel for continued employment.'),

  // claim -> hypothesis (supports / contradicts)
  edge('ed27', 'c-gap', 'h-selection', 'supports',
    'The large reported regional gap in wife non-employment is the phenomenon the economic-selection hypothesis attempts to explain.'),
  edge('ed28', 'c-marriage', 'h-selection', 'supports',
    'A low married share is consistent with the hypothesis’s pathway from high costs to barriers to marriage and childbearing.'),
  edge('ed29', 'c-income', 'h-selection', 'supports',
    'The reported association between husbands’ income and wives’ non-employment is consistent with selection toward higher-income households.'),
  edge('ed30', 'c-grandparent', 'h-model', 'supports',
    'Limited grandparent support is one of the four model components.'),
  edge('ed31', 'c-commute', 'h-model', 'supports',
    'Commuting and time costs are one of the four model components.'),
  edge('ed32', 'c-values', 'h-model', 'supports',
    'Evidence against the values story supports the four-factor model as an alternative explanation.'),
  edge('ed33', 'c-industry', 'h-model', 'supports',
    'Regional industry structure supplies background support for one component of the model.'),
  edge('ed34', 'c-notonly', 'h-model', 'supports',
    'The claim that selection alone is insufficient motivates a multi-factor model.'),
  // [D4] ed35 (c-notonly → h-selection, contradicts) REMOVED — see the file
  // header: the refuted target was "selection as the SOLE explanation," which
  // no node here asserts, and c-notonly's content already feeds h-model as a
  // supported claim via ed34.

  // question tests claim|hypothesis
  edge('ed36', 'q-decompose', 'h-selection', 'tests'),
  edge('ed37', 'q-causal', 'h-selection', 'tests'),
  edge('ed38', 'q-share', 'h-model', 'tests'),

  // evidence -> hypothesis, directly (v1 matrix ruling, docs/BOARD-SPEC.md §1;
  // four of the five edges §6 named for these evidence nodes, in addition to
  // whatever other edge each already carries above — the fifth, e-1995 →
  // h-selection (contradicts), was ed43; see [D4] below for its removal).
  edge('ed39', 'e-kaiki', 'h-selection', 'supports',
    'The reported regression connects economic cost variables to the married share, directly supporting the economic-selection pathway.'),
  edge('ed40', 'e-mikonritsu', 'h-selection', 'supports',
    'The reported link between higher men’s income and lower never-married share is consistent with selection toward higher-income households.'),
  edge('ed41', 'e-kyuyo', 'h-selection', 'supports',
    'Tokyo’s reported nationally highest pay for male general workers supports a premise that high-income households may be overrepresented.'),
  edge('ed42', 'e-ishiki', 'h-model', 'supports',
    'Reported lower traditional-role attitudes in the Tokyo region weigh against the values story and support seeking structural explanations.'),
  // [D4] ed43 (e-1995 → h-selection, contradicts) REMOVED — same reasoning as
  // ed35 above: h-selection does not assert selection is the SOLE
  // explanation, so a "differences predate selection" finding does not
  // actually contradict it. e-1995 still supports c-notonly via ed22.
];

export const SEED = {
  topic: 'For which years, populations, and indicator definitions is Tokyo’s reported homemaker share higher than other regions? If a difference holds, how much can economic selection, family structure, and time costs explain? (Primary sources not yet checked.)',
  nodes: NODES,
  edges: EDGES,
};

export const SEED_VERIFICATION_LABEL = SEED_VERIFICATION;
