// housewife-board-seed.js — seed data for the Evidence Board (board.html + lib/board.js).
//
// Transcribed EXACTLY from docs/BOARD-SPEC.md §6 (frozen 2026-08-31): 40 nodes
// (2 hypotheses, 4 mechanisms, 8 claims, 23 evidence, 3 questions) and, as of
// the Codex-review fix round (D4), 41 edges (incl. FOUR evidence→hypothesis
// edges — e-kaiki, e-mikonritsu and e-kyuyo supporting h-selection, e-ishiki
// supporting h-model — per the v1 matrix ruling in docs/BOARD-SPEC.md §1).
// Every evidence node carries the seed verification label and `cited_as` the
// spec requires — this is agent-extracted material from a ChatGPT research
// conversation, not independently checked, and every surface that shows it
// must say so (see BOARD-SPEC.md §0). `kind` is likewise only ever "source
// kind as reported in the conversation (unverified)" — not an independently
// checked classification.
//
// Seed-data facts the spec's own prose could not honestly resolve,
// documented once here rather than silently patched over:
//
//  - e-kyuyo is the one evidence row §6 never gives a quotable fragment for
//    ("the conversation table lists it without a clear source line"). quote
//    is a required field and the honesty rule forbids inventing one, so its
//    quote states plainly that no verbatim fragment was given, rather than
//    fabricating a citation sentence that was never in the conversation.
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

function evidence(id, label, statement, { value, year, kind, cited_as, quote }) {
  return {
    id, type: 'evidence', label, statement,
    value, year, kind, cited_as, quote,
    verification: SEED_VERIFICATION,
    provenance: seedProvenance({ cited_as, quote, verification: SEED_VERIFICATION }),
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
    '経済的選抜仮説',
    '東京では結婚・出産の経済的ハードルが高く、子どもを持てた世帯が高所得側に選抜され、それが子育て家庭の専業主婦率を押し上げている。',
  ),
  hypothesis(
    'h-model',
    '4要因モデル',
    '東京の専業主婦率の高さは、経済的選抜 × 祖父母支援の欠如 × 通勤・時間コスト × 高所得世帯における片働きの経済合理性の重なりで説明され、「都会は専業主婦志向」という価値観説はデータと整合しない。',
  ),
];

const MECHANISMS = [
  mechanism('m-selection', '高コスト→結婚・出産ハードル→高所得世帯の選抜', '高コスト→結婚・出産ハードル→高所得世帯の選抜'),
  mechanism('m-grandparent', '三世代同居・近居→祖父母の育児支援→共働き成立', '三世代同居・近居→祖父母の育児支援→共働き成立'),
  mechanism('m-time', '長時間通勤＋学童制約→共働きの時間コスト増', '長時間通勤＋学童制約→共働きの時間コスト増'),
  mechanism('m-oneincome', '夫高所得×激務→片働きが世帯として経済合理的になる', '夫高所得×激務→片働きが世帯として経済合理的になる'),
];

const CLAIMS = [
  claim('c-gap', '東京の学齢期児童家庭の妻無業率は福井の約3.6倍である', '東京の学齢期児童家庭の妻無業率は福井の約3.6倍である'),
  claim('c-marriage', '東京の低出生率は主に有配偶率の低さ（結婚まで到達する人の少なさ）による', '東京の低出生率は主に有配偶率の低さ（結婚まで到達する人の少なさ）による'),
  claim('c-income', '夫の所得が高いほど妻が非就業・扶養内になりやすい', '夫の所得が高いほど妻が非就業・扶養内になりやすい'),
  claim('c-grandparent', '祖父母の育児支援インフラの差が地方の共働きを支えている', '祖父母の育児支援インフラの差が地方の共働きを支えている'),
  claim('c-commute', '通勤時間の差が首都圏の共働きコストを押し上げている', '通勤時間の差が首都圏の共働きコストを押し上げている'),
  claim('c-values', '「地方は保守的で東京は平等志向」という価値観説は地域差を説明しない（むしろ逆）', '「地方は保守的で東京は平等志向」という価値観説は地域差を説明しない（むしろ逆）'),
  claim('c-notonly', '地域差は経済的選抜だけでは説明できない（選抜が強まる前から差が存在した）', '地域差は経済的選抜だけでは説明できない（選抜が強まる前から差が存在した）'),
  claim('c-industry', '地方には女性が正社員として継続就業しやすい産業構造がある', '地方には女性が正社員として継続就業しやすい産業構造がある'),
];

const EVIDENCE = [
  evidence('e-mukyo', '末子6〜14歳家庭の妻無業率',
    '末子6〜14歳家庭の妻無業率は東京26.4%・福井7.3%（東京全国最高・福井最低）。',
    { value: '東京26.4% vs 福井7.3%（東京全国最高・福井最低）', year: 2022, kind: 'official-stat', cited_as: '就業構造基本調査(第158表)', quote: '末子6〜14歳家庭の妻無業率 26.4%(東京) 7.3%(福井)' }),
  evidence('e-tfr', '合計特殊出生率',
    '合計特殊出生率は東京0.96（全国最低）・福井1.45（全国3位）。',
    { value: '東京0.96(全国最低) vs 福井1.45(全国3位)', year: 2025, kind: 'official-stat', cited_as: '厚生労働省', quote: '2025年は東京0.96で全国最低、福井1.45で全国3位' }),
  evidence('e-yuhaigu', '有配偶率(2020国勢調査)',
    '有配偶率（2020国勢調査）は男性で東京51.3%（全国最低）・福井61.6%、女性で東京49.4%・福井57.4%。',
    { value: '男性: 東京51.3%(最低) vs 福井61.6% / 女性: 東京49.4% vs 57.4%', year: 2020, kind: 'official-stat', cited_as: '総務省統計局', quote: '男性：東京51.3%（全国最低）' }),
  evidence('e-mikon', '未婚割合',
    '未婚割合は男性東京42.1%・女性33.5%で、いずれも全国最高。',
    { value: '男性 東京42.1%・女性33.5%(いずれも全国最高)', year: 2020, kind: 'official-stat', cited_as: '総務省統計局', quote: '未婚割合は…東京42.1%（全国最高）' }),
  evidence('e-konin', '婚姻率(人口千人当たり)',
    '人口千人当たり婚姻率は東京5.9で全国4.1より高く、婚姻件数自体は少なくない。',
    { value: '東京5.9 > 全国4.1 — 婚姻件数自体は少なくない', year: 2025, kind: 'official-stat', cited_as: '厚生労働省', quote: '単純な人口千人当たり婚姻率は、むしろ東京が5.9で全国4.1より高い' }),
  evidence('e-shokon', '平均初婚年齢',
    '平均初婚年齢は東京都が夫32.2歳・妻30.7歳で男女とも全国最高。',
    { value: '東京 夫32.2歳・妻30.7歳(全国最高)', year: 2024, kind: 'official-stat', cited_as: '厚生労働省', quote: '平均初婚年齢は東京都が男女とも全国最高' }),
  evidence('e-sansedai', '三世代世帯率',
    '三世代世帯率は東京1.3%（全国最低）・福井11.5%（全国2位）で約8.8倍の差。',
    { value: '東京1.3%(全国最低) vs 福井11.5%(全国2位) — 約8.8倍', year: 2020, kind: 'official-stat', cited_as: '総務省統計局', quote: '東京 1.3% ― 全国最低 福井 11.5% ― 全国2位' }),
  evidence('e-fukui-doukyo', '共働き家庭のうち夫婦+子+親世帯',
    '共働き家庭のうち夫婦＋子＋親世帯の割合は福井17.8%・全国6.4%。',
    { value: '福井17.8% vs 全国6.4%', year: 'n/a', kind: 'survey', cited_as: '福井県', quote: '福井では、共働き家庭のうち夫婦＋子＋親世帯が17.8%' }),
  evidence('e-doukyo-shugyo', '親との同居と妻の就業',
    '親との同居は妻の就業を促進する方向に働く。',
    { value: '同居は妻の就業を促進する方向', year: 'n/a', kind: 'regression', cited_as: 'RIETI', quote: '親との同居は妻の就業を促進する方向に働いています' }),
  evidence('e-tsukin', '通勤・通学時間(1日平均)',
    '通勤・通学時間（1日平均）は神奈川100分・千葉95分・東京95分・全国79分・福井62分。',
    { value: '神奈川100/千葉95/東京95/全国79/福井62分', year: 2021, kind: 'official-stat', cited_as: '総務省統計局', quote: '神奈川 100分 千葉 95分 東京 95分 全国 79分 福井 62分' }),
  evidence('e-kaji', '夫の家事育児時間と妻の就業',
    '夫の家事・育児時間が多いほど妻が就業しやすく、夫の高所得は夫の家事参加の減少と関連する。',
    { value: '夫の家事・育児時間が多いほど妻が就業しやすい／夫の高所得は夫の家事参加減と関連', year: 'n/a', kind: 'regression', cited_as: 'RIETI', quote: '夫の家事・育児時間が多いほど妻が就業しやすく' }),
  evidence('e-60h', '夫の労働時間と妻のフルタイム就業',
    '夫が週60時間超労働の場合、妻のフルタイム就業率が大きく低下する。',
    { value: '夫が週60時間超労働で妻フルタイム就業率が大きく低下', year: 'n/a', kind: 'survey', cited_as: 'JILPT', quote: '夫の労働時間が週60時間を超えると妻のフルタイム就業率が大きく低下' }),
  evidence('e-zeimu', '夫所得と妻の就労調整(税務データ追跡)',
    '妻の出産前所得を揃えても、夫所得が高いほど出産後に妻が扶養内・無収入になりやすい（税務データ追跡）。',
    { value: '妻の出産前所得を揃えても、夫所得が高いほど出産後に扶養内・無収入へ', year: 'n/a', kind: 'regression', cited_as: 'RIETI', quote: '夫の収入が高いほど、出産後に妻が扶養内または無収入になる割合が高くなる' }),
  evidence('e-jilpt16', '夫所得四分位別の妻無業率',
    '夫所得四分位別の妻無業率は24.6% / 24.2% / 35.7% / 31.1%で、単調な増加ではない。',
    { value: '24.6% / 24.2% / 35.7% / 31.1% — 単調でない', year: 2016, kind: 'survey', cited_as: 'JILPT', quote: '24.6%、24.2%、35.7%、31.1%' }),
  evidence('e-teishotoku', '夫低所得と妻就業',
    '夫が低所得の家庭ほど妻の就業率が高い傾向が、弱まりつつも残存している。',
    { value: '夫が低所得の家庭ほど妻の就業率が高い(弱まりつつ残存)', year: 2025, kind: 'study', cited_as: 'JILPT', quote: '夫が低所得の家庭ほど妻の就業率が高い傾向' }),
  evidence('e-kaiki', '有配偶率の都道府県回帰',
    '都道府県回帰では非正規雇用率・教育費・家賃の高さが有配偶率を有意に押し下げる。',
    { value: '非正規雇用率・教育費・家賃の高さが有配偶率を有意に押し下げ', year: 'n/a', kind: 'regression', cited_as: '内閣府', quote: '非正規雇用率が高い → 有配偶率↓' }),
  evidence('e-mikonritsu', '男性所得と未婚率',
    '男性では所得が高くなるほど未婚率が低下する関係がある。',
    { value: '所得が高いほど未婚率が低い', year: 'n/a', kind: 'regression', cited_as: '内閣府', quote: '男性では所得が高くなるほど未婚率が低下する関係' }),
  evidence('e-1995', '1995年の専業主婦率（会話記載）',
    '会話は、1995年の「有配偶女性の専業主婦率」を東京50.4%、福井31.1%と記載している。指標定義と国勢調査の一次表は未確認。',
    { value: '有配偶女性の専業主婦率 東京50.4% vs 福井31.1% — 当時から大差', year: 1995, kind: 'official-stat', cited_as: '総務省統計局(国勢調査)', quote: 'なんと1995年国勢調査でも、有配偶女性の専業主婦率は、東京 50.4% 福井 31.1%でした。' }),
  evidence('e-ishiki', '固定的性別役割意識',
    '固定的性別役割意識は、女性については南関東がほとんどの項目で全国最低。',
    { value: '女性は南関東がほとんどの項目で全国最低', year: 2025, kind: 'official-stat', cited_as: '男女共同参画白書', quote: '南関東＝東京圏がほとんどの項目で全国で最も低い' }),
  evidence('e-ushinai', '有業率低下(25-29→35-39歳)',
    '25-29歳から35-39歳にかけての有業率低下は北陸1.7ポイントに対し南関東9.8ポイント（全国最大）。',
    { value: '北陸1.7pt vs 南関東9.8pt(全国最大)', year: 'n/a', kind: 'official-stat', cited_as: '男女共同参画白書', quote: '北陸：わずか1.7ポイント 南関東：9.8ポイント' }),
  evidence('e-sangyo', '女性正規職員の産業構成',
    '女性正規職員の産業構成は製造業で北陸19.2%・南関東10.3%、医療福祉で南関東23.0%・地方30〜37%。',
    { value: '製造業: 北陸19.2% vs 南関東10.3% / 医療福祉: 南関東23.0% vs 地方30〜37%', year: 2022, kind: 'official-stat', cited_as: '内閣府', quote: '北陸19.2%に対し南関東10.3%' }),
  evidence('e-hoiku', '保育所定員と女性労働参加',
    '25〜49歳女性あたり保育所定員が多い都道府県ほど女性の労働参加率が高い傾向がある。',
    { value: '25〜49歳女性あたり保育所定員が多い県ほど労働参加率が高い', year: 'n/a', kind: 'regression', cited_as: '内閣府', quote: '保育所定員が多い都道府県ほど女性の労働参加率が高い傾向' }),
  // No verbatim fragment was given for this row in the source conversation (see
  // the file header) — cited_as is the spec's own honest label for it, and the
  // quote says plainly that no quotable text exists rather than inventing one.
  evidence('e-kyuyo', '男性一般労働者給与',
    '男性一般労働者給与は東京44.1万円/月で全国最高。',
    { value: '東京44.1万円/月(全国最高)', year: 2024, kind: 'official-stat', cited_as: '(会話中の比較表)', quote: '（会話中の比較表に数値のみが記載され、引用可能な地の文は与えられていない）' }),
];

const QUESTIONS = [
  question('q-decompose', '夫所得を揃えたら東京-福井差は何pt縮むか',
    '夫所得を揃えたら、東京・福井間の専業主婦率の差は何ポイント縮むかを問う。',
    '就業構造基本調査の個票/詳細クロスで 妻非就業 ~ 夫所得 + 妻潜在賃金 + 末子年齢 + 親同居 + 通勤 + 地域 を推定し、所得を揃えた地域差を見る'),
  question('q-causal', '東京の子育て世帯の所得選抜度を直接測った因果研究は存在するか',
    '東京の子育て世帯における所得選抜の強さを直接測定した因果研究が存在するかを問う（会話中では未発見）。'),
  question('q-share', '19.1ptの差に対する要因別寄与(選抜/祖父母/通勤/産業)の分解',
    '東京・福井間の19.1ポイント差に対する要因別寄与（経済的選抜／祖父母支援／通勤／産業構造）の分解を問う。'),
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
    '東京26.4%・福井7.3%という数値が「約3.6倍」の根拠になっている。'),
  edge('ed07', 'e-tfr', 'c-marriage', 'supports',
    '東京の合計特殊出生率が全国最低であるという、主張の前提部分を裏付ける。'),
  edge('ed08', 'e-yuhaigu', 'c-marriage', 'supports',
    '有配偶率そのものが東京で全国最低水準であることを示す直接的な裏付け。'),
  edge('ed09', 'e-mikon', 'c-marriage', 'supports',
    '未婚割合の高さは有配偶率の低さと表裏の関係にある。'),
  edge('ed10', 'e-konin', 'c-marriage', 'contradicts',
    '「東京は婚姻率最低」という素朴な形の主張への反証。有配偶率ベースの主張本体とは両立（フロー vs ストック）。'),
  edge('ed11', 'e-shokon', 'c-marriage', 'supports',
    '初婚年齢の高さは、ある時点で見た有配偶率を押し下げる方向に働く。'),
  edge('ed12', 'e-sansedai', 'c-grandparent', 'supports',
    '三世代同居率の地域差が、祖父母による育児支援インフラの差を示す指標になっている。'),
  edge('ed13', 'e-fukui-doukyo', 'c-grandparent', 'supports',
    '福井で共働き世帯の親同居率が全国平均より高いことが、祖父母支援の存在を裏付ける。'),
  edge('ed14', 'e-doukyo-shugyo', 'c-grandparent', 'supports',
    '親との同居が妻の就業を促進するという回帰結果が、祖父母支援仮説の因果的な裏付けになっている。'),
  edge('ed15', 'e-tsukin', 'c-commute', 'supports',
    '通勤時間の地域差そのものが、時間コストの差の直接的な裏付けになっている。'),
  edge('ed16', 'e-kaji', 'c-commute', 'supports',
    '夫の家事・育児参加が妻の就業を左右するという結果が、時間的制約コストの重要性を補強する。'),
  edge('ed17', 'e-60h', 'c-commute', 'supports',
    '夫の長時間労働が妻のフルタイム就業を妨げるという、時間コストの直接的な裏付け。'),
  edge('ed18', 'e-zeimu', 'c-income', 'supports',
    '出産前所得を揃えた上での追跡データという、交絡を排除した形の直接的な裏付け。'),
  edge('ed19', 'e-jilpt16', 'c-income', 'contradicts',
    '上位で高い傾向はあるが単調増加ではない、という部分的反証。'),
  edge('ed20', 'e-teishotoku', 'c-income', 'supports',
    '夫が低所得なほど妻の就業率が高いという傾向は、逆方向から見て同じ関係を裏付ける。'),
  edge('ed21', 'e-kaiki', 'c-marriage', 'supports',
    '非正規雇用率・教育費・家賃という都市部で高い変数が有配偶率を押し下げるという回帰結果の裏付け。'),
  // e-mikonritsu and e-kyuyo are seeded above but have no edge here — see the
  // file header (§6 named only an evidence->hypothesis edge for both, which
  // the validity matrix does not allow for any edge type).
  edge('ed22', 'e-1995', 'c-notonly', 'supports',
    '1995年時点で既に大きな差があったとされる会話の記載が、選抜強化以前からの差という主張の根拠になっている（一次資料未照合）。'),
  edge('ed23', 'e-ishiki', 'c-values', 'supports',
    '性別役割意識が東京圏でむしろ低いというデータが、「都会は平等志向」という単純な価値観説とは逆方向であることを示す。'),
  edge('ed24', 'e-ushinai', 'c-values', 'supports',
    '結婚・出産期の有業率低下幅が首都圏で著しく大きいことが、価値観だけでは説明できない構造の存在を示す。'),
  edge('ed25', 'e-sangyo', 'c-industry', 'supports',
    '女性正規職員の産業構成の地域差が、地方の産業構造仮説を裏付ける。'),
  edge('ed26', 'e-hoiku', 'c-industry', 'supports',
    '保育所定員の多さが女性の労働参加を後押しするという結果が、継続就業を支えるインフラ面を補強する。'),

  // claim -> hypothesis (supports / contradicts)
  edge('ed27', 'c-gap', 'h-selection', 'supports',
    '妻無業率の大きな地域差そのものが、経済的選抜仮説が説明しようとする現象の存在を裏付ける。'),
  edge('ed28', 'c-marriage', 'h-selection', 'supports',
    '有配偶率の低さという経路も、高コストによる結婚・出産ハードルという選抜仮説の機序と整合する。'),
  edge('ed29', 'c-income', 'h-selection', 'supports',
    '夫所得と妻の非就業の関連が、高所得世帯側への選抜という仮説の機序と整合する。'),
  edge('ed30', 'c-grandparent', 'h-model', 'supports',
    '祖父母支援の欠如という要因が、4要因モデルの一角として直接対応する。'),
  edge('ed31', 'c-commute', 'h-model', 'supports',
    '通勤・時間コストという要因が、4要因モデルの一角として直接対応する。'),
  edge('ed32', 'c-values', 'h-model', 'supports',
    '価値観説の反証が、4要因モデルが価値観説に代わる説明を提示するという主張を補強する。'),
  edge('ed33', 'c-industry', 'h-model', 'supports',
    '地方の産業構造という要因が、4要因モデルの背景説明を補強する。'),
  edge('ed34', 'c-notonly', 'h-model', 'supports',
    '選抜単独では説明できないという主張が、複数要因を組み合わせる4要因モデルの必要性を裏付ける。'),
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
    '非正規雇用率・教育費・家賃という経済的コスト変数が有配偶率を左右するという回帰結果が、経済的選抜仮説を直接裏付ける。'),
  edge('ed40', 'e-mikonritsu', 'h-selection', 'supports',
    '男性の所得が高いほど未婚率が下がるという関係が、高所得側への選抜という仮説の機序と整合する。'),
  edge('ed41', 'e-kyuyo', 'h-selection', 'supports',
    '東京の男性給与水準が全国最高であること自体が、高所得世帯が集まりやすいという選抜仮説の前提を補強する。'),
  edge('ed42', 'e-ishiki', 'h-model', 'supports',
    '性別役割意識が東京圏でむしろ低いというデータが、価値観説を退け4要因モデルを支持する材料になる。'),
  // [D4] ed43 (e-1995 → h-selection, contradicts) REMOVED — same reasoning as
  // ed35 above: h-selection does not assert selection is the SOLE
  // explanation, so a "differences predate selection" finding does not
  // actually contradict it. e-1995 still supports c-notonly via ed22.
];

export const SEED = {
  topic: '会話で報告された東京の『専業主婦率』は、どの年・母集団・指標定義で他地域より高いのか。差が確認できる場合、経済的選抜・家族構造・時間コストはどこまで説明しうるか（一次資料未照合）',
  nodes: NODES,
  edges: EDGES,
};

export const SEED_VERIFICATION_LABEL = SEED_VERIFICATION;
