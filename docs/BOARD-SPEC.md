# Evidence Board — implementation spec (frozen by Fable, 2026-08-31)

The Evidence Board (board.html + lib/board.js) generalizes the Living Evidence
workspace beyond the SMD meta-analysis genre: a **visual board of hypotheses,
claims, evidence, mechanisms and open questions**, extracted from messy
research (here: a real ChatGPT research conversation), managed in one place
under the format's rules — propose→approve, quotes required, visible ledger,
computed (never fabricated) diagnostics. It is DESIGN.md v3 §7's Evidence Map
(Layer 1), first concrete cut.

Honesty rules carried over, non-negotiable:
- The board has NO statistics engine and issues NO verdicts. A claim's
  `tally_status` (supported / contested / unsupported) is **edge bookkeeping
  over approved edges — not truth adjudication** — and every surface that
  shows it says so.
- Seeded evidence is **agent-extracted from a conversation, not independently
  verified**: every seed evidence node carries
  `verification: 'unverified — extracted from a ChatGPT research conversation
  (2026-08); the cited primary sources were not independently checked'` and
  `cited_as` (the source name as cited in the conversation). The UI renders
  this label on every evidence panel.
- Mutations only through propose→approve (human card), quotes required for
  evidence, everything ledgered with the M1 envelope.

Existing suites must stay green; the board is additive (new files + shared
CSS additions in lib/living-evidence.css only).

## 1. Data model (lib/board.js)

Node types and required fields (all nodes: id, type, label ≤80 chars,
statement (full sentence, Japanese OK), provenance {origin:'seed'|'proposal',
source?, quote?, cited_as?, verification?, proposed_at?, approved_at?}):

- `hypothesis` — a causal story under examination.
- `claim` — a specific assertion evidence can support/contradict. Computed
  `tally_status`: 'supported' (≥1 supports, 0 contradicts), 'contested'
  (≥1 of each), 'unsupported' (0 evidence edges). Displayed with the
  bookkeeping disclaimer.
- `evidence` — a datum: `value` (short string, e.g. "東京26.4% vs 福井7.3%"),
  `year`, `kind` ('official-stat'|'survey'|'regression'|'study'), `cited_as`,
  `quote` (verbatim fragment) — quote and cited_as REQUIRED.
- `mechanism` — one causal pathway step inside a hypothesis.
- `question` — an open question / proposed verification; `test_sketch`
  (how it could be answered) optional.

Edges: {id, from, to, type: 'supports'|'contradicts'|'part-of'|'tests'|
'refines', provenance}. Validity matrix (enforced): supports/contradicts:
evidence→claim, claim→hypothesis, **or evidence→hypothesis**; part-of:
mechanism→hypothesis; tests: question→claim|hypothesis; refines:
hypothesis→hypothesis. Anything else → error naming the matrix.
[v2 ruling, Fable 2026-09-01, from the Codex agent-runtime review: (1) the
three-state tally had an unclassifiable case — a claim with only contradicts
edges. Replaced by the four-state `evidence_edge_state`
none|support_only|contradiction_only|mixed, and the diagnostics tool renamed
`get_board_diagnostics` with literal bucket names
(claims_with_mixed_edge_labels etc.) — graph bookkeeping must not wear
verdict vocabulary. (2) Seed edges ed35/ed43 ("contradicts h-selection")
contradicted their own rationales: what e-1995/c-notonly refute is
"selection as the SOLE explanation", which no node asserts; the content
lives honestly in c-notonly (supported, feeding h-model). Both edges
REMOVED — seed total 43→41 — and every remaining supports/contradicts seed
edge must carry a nonempty rationale. (3) Canonical topic and e-1995
quote/statement texts are the ones in the D3 directive of the fix round
(recorded in AGENT_SYNC); the e-1995 quote is the full conversation
sentence, and its statement attributes the figures to the conversation with
primary tables marked unverified.]

[v1 ruling, Fable 2026-08-31: §6 named five evidence→hypothesis edges while
the original matrix omitted that pair — an internal spec contradiction the
build correctly surfaced instead of violating. Resolution (a): the matrix now
includes evidence→hypothesis for supports/contradicts; the five §6 edges
stand (total seed edges: 43). Direct evidence bearing on a hypothesis is
scientifically natural — e-1995 directly contradicting the pure-selection
reading is the board's single most instructive structure. Claim tallies are
unaffected (the new pair touches hypotheses, which carry no tally).]

State: seed + approved + pending (nodes AND edges), audit ledger (M1
envelope, actor attribution, pure reads unledgered), boardVersion (+1 per
approval; drives staleness of the discoveries panel), localStorage
persistence (`le-board-v1`, corrupt-snapshot resilience like the workspace;
seed loads only when storage is empty). Two header buttons: "Reset to seed"
(confirm → restore seed) and the standard status banner.

## 2. Computed discoveries (the 発見を促す machinery — bookkeeping, honest)

`get_discoveries` computes live, and renders a card panel:
- **contested claims** (both edge kinds) — the board's contradiction engine;
- **unsupported claims** (no evidence edges);
- **single-source claims** (all supporting evidence shares one `cited_as`);
- **untested hypotheses** (no `tests` edge reaches them or their claims);
- **open questions** (all question nodes, with their targets);
- **unverified evidence count** (everything still carrying the seed
  verification label).
Each entry names node ids. A `note` states: "computed from the board's
approved nodes and edges under the validity matrix — bookkeeping over what
the board contains, not an assessment of the literature."

## 3. Map rendering (SVG, deterministic, reuse atlas patterns)

viewBox ≈ 1200×760. Type columns, left→right: hypotheses (large rounded
rects, center-left), mechanisms (small, attached near their hypothesis),
claims (middle column, pill style; tally glyph ● supported / ◐ contested /
○ unsupported + the count "3+/1−"), evidence (right column, small rects
colored by `kind` — legend on map), questions (far-right, dashed border like
atlas gaps). Edges: supports thin solid (--le-good), contradicts dashed
(--le-bad), part-of thin (--le-border), tests dotted (--le-warn), refines
thin accent. Vertical ordering: group claims under the hypothesis they
connect to most; evidence sorted to sit near its claims (simple barycenter
pass: order each column by the mean y of already-placed neighbors; two
passes, deterministic). Node interaction identical to atlas: data-node,
tabindex, role=button, live aria-label, click/Enter → detail panel, Escape/
background deselect, dim class, no scroll hijack. Detail panel: statement,
provenance (quote + cited_as + verification label for evidence), edges in/
out with types, and for pending items the approval card.

## 4. Tools (WebMCP + console; M1 registration/status/actor patterns)

12 tools: `board_overview` (orientation: topic, counts by type, tally
disclaimer, suggested_flow, suite_context incl. the three sibling pages),
`list_nodes {type?}`, `get_node {node_id}` (accepts bare or typed prefix ids
like the atlas), `get_edges {node_id?}`, `get_discoveries`,
`propose_node {type, label, statement, ...type fields}` → pending + approval
card, `propose_edge {from, to, type, rationale?}` → pending + card (both
validate matrix + required fields; evidence requires quote+cited_as; dupes
by (type,label) flagged), `focus_node {node_id}`, `set_topic {text}` (1..300),
`export_board {include_json?}` → downloads the board as JSON
(receipt-by-default: {filename, bytes, download_started, content_digest};
include_json:true adds the json), `get_audit_log`, `list_edges_pending`?
— NO: pending items appear in list_nodes/get_edges with status fields
instead. Total 11 tools. Descriptions follow the Codex-round conventions:
side-effects stated, read-only annotated, verdict_scope-style disclaimer on
tally fields, schemas additionalProperties:false with enums/min/max.

## 5. board.html

Visual language of the suite (tokens, serif, wide main like atlas). Header:
"Living Evidence Board", status banner, topic block ("Research topic under
examination" + reset button). Standfirst: what this page is — "a research
conversation, restructured: hypotheses, claims, evidence and open questions
extracted into one auditable board. Extraction is agent work with quotes;
inclusion is human approval; discovery panels are bookkeeping, not truth."
How-to box (human: approve/curate/export + click nodes; agent:
board_overview first → propose_node/propose_edge with quotes → the human
approves → get_discoveries for what to chase next). Map + legend, detail
panel, discoveries panel (rendered card, refreshed on approval),
pending section, ledger, tool console, footer linking the three sibling
pages + repo. English chrome; Japanese node content is expected and fine.

## 6. Seed data (data/housewife-board-seed.js) — transcribe EXACTLY

Topic: 「東京の専業主婦率はなぜ高いのか — 経済的選抜・家族構造・時間コスト」
All seed nodes origin:'seed'; every evidence node carries the verification
label from §0 and `cited_as` exactly as below; quotes are verbatim fragments
from the source conversation (given below, use as-is).

Hypotheses:
- h-selection 「経済的選抜仮説」 statement: 東京では結婚・出産の経済的ハードルが高く、子どもを持てた世帯が高所得側に選抜され、それが子育て家庭の専業主婦率を押し上げている。
- h-model 「4要因モデル」 statement: 東京の専業主婦率の高さは、経済的選抜 × 祖父母支援の欠如 × 通勤・時間コスト × 高所得世帯における片働きの経済合理性の重なりで説明され、「都会は専業主婦志向」という価値観説はデータと整合しない。 (edge: h-model refines h-selection)

Mechanisms (all part-of h-model):
- m-selection 高コスト→結婚・出産ハードル→高所得世帯の選抜
- m-grandparent 三世代同居・近居→祖父母の育児支援→共働き成立
- m-time 長時間通勤＋学童制約→共働きの時間コスト増
- m-oneincome 夫高所得×激務→片働きが世帯として経済合理的になる

Claims:
- c-gap 東京の学齢期児童家庭の妻無業率は福井の約3.6倍である
- c-marriage 東京の低出生率は主に有配偶率の低さ（結婚まで到達する人の少なさ）による
- c-income 夫の所得が高いほど妻が非就業・扶養内になりやすい
- c-grandparent 祖父母の育児支援インフラの差が地方の共働きを支えている
- c-commute 通勤時間の差が首都圏の共働きコストを押し上げている
- c-values 「地方は保守的で東京は平等志向」という価値観説は地域差を説明しない（むしろ逆）
- c-notonly 地域差は経済的選抜だけでは説明できない（選抜が強まる前から差が存在した）
- c-industry 地方には女性が正社員として継続就業しやすい産業構造がある

Evidence (id / label / value / year / kind / cited_as / quote fragment):
- e-mukyo 末子6〜14歳家庭の妻無業率 「東京26.4% vs 福井7.3%（東京全国最高・福井最低）」 2022 official-stat 就業構造基本調査(第158表) quote:「末子6〜14歳家庭の妻無業率 26.4%(東京) 7.3%(福井)」 → supports c-gap
- e-tfr 合計特殊出生率 「東京0.96(全国最低) vs 福井1.45(全国3位)」 2025 official-stat 厚生労働省 quote:「2025年は東京0.96で全国最低、福井1.45で全国3位」 → supports c-marriage
- e-yuhaigu 有配偶率(2020国勢調査) 「男性: 東京51.3%(最低) vs 福井61.6% / 女性: 東京49.4% vs 57.4%」 2020 official-stat 総務省統計局 quote:「男性：東京51.3%（全国最低）」 → supports c-marriage
- e-mikon 未婚割合 「男性 東京42.1%・女性33.5%(いずれも全国最高)」 2020 official-stat 総務省統計局 quote:「未婚割合は…東京42.1%（全国最高）」 → supports c-marriage
- e-konin 婚姻率(人口千人当たり) 「東京5.9 > 全国4.1 — 婚姻件数自体は少なくない」 2025 official-stat 厚生労働省 quote:「単純な人口千人当たり婚姻率は、むしろ東京が5.9で全国4.1より高い」 → contradicts c-marriage ※注: 「東京は婚姻率最低」という素朴な形の主張への反証。有配偶率ベースの主張本体とは両立（フロー vs ストック）。rationale必須欄にこの注を入れる
- e-shokon 平均初婚年齢 「東京 夫32.2歳・妻30.7歳(全国最高)」 2024 official-stat 厚生労働省 quote:「平均初婚年齢は東京都が男女とも全国最高」 → supports c-marriage
- e-sansedai 三世代世帯率 「東京1.3%(全国最低) vs 福井11.5%(全国2位) — 約8.8倍」 2020 official-stat 総務省統計局 quote:「東京 1.3% ― 全国最低 福井 11.5% ― 全国2位」 → supports c-grandparent
- e-fukui-doukyo 共働き家庭のうち夫婦+子+親世帯 「福井17.8% vs 全国6.4%」 n/a survey 福井県 quote:「福井では、共働き家庭のうち夫婦＋子＋親世帯が17.8%」 → supports c-grandparent
- e-doukyo-shugyo 親との同居と妻の就業 「同居は妻の就業を促進する方向」 n/a regression RIETI quote:「親との同居は妻の就業を促進する方向に働いています」 → supports c-grandparent
- e-tsukin 通勤・通学時間(1日平均) 「神奈川100/千葉95/東京95/全国79/福井62分」 2021 official-stat 総務省統計局 quote:「神奈川 100分 千葉 95分 東京 95分 全国 79分 福井 62分」 → supports c-commute
- e-kaji 夫の家事育児時間と妻の就業 「夫の家事・育児時間が多いほど妻が就業しやすい／夫の高所得は夫の家事参加減と関連」 n/a regression RIETI quote:「夫の家事・育児時間が多いほど妻が就業しやすく」 → supports c-commute
- e-60h 夫の労働時間と妻のフルタイム就業 「夫が週60時間超労働で妻フルタイム就業率が大きく低下」 n/a survey JILPT quote:「夫の労働時間が週60時間を超えると妻のフルタイム就業率が大きく低下」 → supports c-commute
- e-zeimu 夫所得と妻の就労調整(税務データ追跡) 「妻の出産前所得を揃えても、夫所得が高いほど出産後に扶養内・無収入へ」 n/a regression RIETI quote:「夫の収入が高いほど、出産後に妻が扶養内または無収入になる割合が高くなる」 → supports c-income
- e-jilpt16 夫所得四分位別の妻無業率 「24.6% / 24.2% / 35.7% / 31.1% — 単調でない」 2016 survey JILPT quote:「24.6%、24.2%、35.7%、31.1%」 → contradicts c-income ※注: 上位で高い傾向はあるが単調増加ではない、という部分的反証。rationaleに記載
- e-teishotoku 夫低所得と妻就業 「夫が低所得の家庭ほど妻の就業率が高い(弱まりつつ残存)」 2025 study JILPT quote:「夫が低所得の家庭ほど妻の就業率が高い傾向」 → supports c-income
- e-kaiki 有配偶率の都道府県回帰 「非正規雇用率・教育費・家賃の高さが有配偶率を有意に押し下げ」 n/a regression 内閣府 quote:「非正規雇用率が高い → 有配偶率↓」 → supports c-marriage (and supports h-selection directly)
- e-mikonritsu 男性所得と未婚率 「所得が高いほど未婚率が低い」 n/a regression 内閣府 quote:「男性では所得が高くなるほど未婚率が低下する関係」 → supports c-income? NO → supports h-selection directly (claim-level fit is selection)
- e-1995 1995年の専業主婦率 「有配偶女性の専業主婦率 東京50.4% vs 福井31.1% — 当時から大差」 1995 official-stat 総務省統計局(国勢調査) quote:「東京 50.4% 福井 31.1%」 → supports c-notonly, and contradicts h-selection (as sole explanation; rationale notes the scope)
- e-ishiki 固定的性別役割意識 「女性は南関東がほとんどの項目で全国最低」 2025 official-stat 男女共同参画白書 quote:「南関東＝東京圏がほとんどの項目で全国で最も低い」 → contradicts c-values? NO — c-values ASSERTS the values explanation fails, so e-ishiki SUPPORTS c-values. Also supports h-model.
- e-ushinai 有業率低下(25-29→35-39歳) 「北陸1.7pt vs 南関東9.8pt(全国最大)」 n/a official-stat 男女共同参画白書 quote:「北陸：わずか1.7ポイント 南関東：9.8ポイント」 → supports c-values (same direction: young Tokyo women work a lot, then exit)
- e-sangyo 女性正規職員の産業構成 「製造業: 北陸19.2% vs 南関東10.3% / 医療福祉: 南関東23.0% vs 地方30〜37%」 2022 official-stat 内閣府 quote:「北陸19.2%に対し南関東10.3%」 → supports c-industry
- e-hoiku 保育所定員と女性労働参加 「25〜49歳女性あたり保育所定員が多い県ほど労働参加率が高い」 n/a regression 内閣府 quote:「保育所定員が多い都道府県ほど女性の労働参加率が高い傾向」 → supports c-industry
- e-kyuyo 男性一般労働者給与 「東京44.1万円/月(全国最高)」 2024 official-stat 厚生労働省? — the conversation table lists it without a clear source line; cited_as 「(会話中の比較表)」 → supports h-selection (directly). CANONICAL quote placeholder (blessed, do not "fix" into a fabricated citation): 「（会話中の比較表に数値のみが記載され、引用可能な地の文は与えられていない）」 — the e2e pins this text verbatim.

Claim→hypothesis edges: c-gap/c-marriage/c-income supports h-selection;
c-grandparent/c-commute/c-values/c-industry/c-notonly supports h-model;
c-notonly contradicts h-selection (as sole explanation — rationale field
carries "単独説明への反証。押し上げ要因としての選抜とは両立").

Questions (tests edges):
- q-decompose 「夫所得を揃えたら東京-福井差は何pt縮むか」 test_sketch: 就業構造基本調査の個票/詳細クロスで 妻非就業 ~ 夫所得 + 妻潜在賃金 + 末子年齢 + 親同居 + 通勤 + 地域 を推定し、所得を揃えた地域差を見る → tests h-selection
- q-causal 「東京の子育て世帯の所得選抜度を直接測った因果研究は存在するか」 (会話中では未発見) → tests h-selection
- q-share 「19.1ptの差に対する要因別寄与(選抜/祖父母/通勤/産業)の分解」 → tests h-model

Counts for tests: 2 hypotheses, 4 mechanisms, 8 claims, 23 evidence,
3 questions = 40 nodes; **43 edges** (incl. the five evidence→hypothesis
edges under the v1 matrix ruling). The e2e asserts the exact number AND a
golden per-claim tally map plus golden values for load-bearing evidence
(e-mukyo, e-jilpt16, e-1995, e-kyuyo incl. its canonical placeholder quote),
each transcribed as literals from THIS section — independent of both the
page and the seed module.

## 7. verify/board.e2e.mjs

Blocks: (1) load clean, 11 tools, 40 nodes rendered, status absent;
(2) seed integrity — every evidence node has quote + cited_as + the
verification label; tally computation spot-checks (c-income contested:
supports≥2 AND contradicts≥1; c-gap supported; a fresh claim would be
unsupported); (3) get_discoveries: contested list contains c-income,
untested/open-question lists match seed, note present, no truth language;
(4) propose_node evidence without quote → error; valid propose_node +
propose_edge → pending cards → approve both → boardVersion bumps, tally
recomputes, discoveries refresh; invalid edge (evidence→evidence) rejected
by matrix; (5) persistence: reload → nodes/edges/ledger/pending restored;
corrupt snapshot → clean seed boot; (6) export receipt default (no json) +
include_json:true; (7) id normalization + focus/Escape/aria + no scroll
hijack (reuse atlas assertions); (8) ledger envelope + actor attribution +
pure reads unledgered; (9) zero page errors; screenshots
verify/_snap_board.png (+dark) eyeballed. Existing five suites re-run green.

## 8. Out of scope (do not build)

Statistics engine on the board; verdict ASTs for board claims; drag-and-drop
layout; cross-page data sharing; conversation-file upload/parsing (ingestion
is the AGENT's reading, done through propose_* — that is the point); backend
anything; changes to the other three pages beyond adding the board link to
their footers (one line each, allowed).
