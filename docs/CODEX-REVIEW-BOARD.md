# Codex review #2 — board surface + submission docs

> Generated 2026-09-01 via codex exec (read-only; 4-page runtime dump + README + SUBMISSION only).
> Verdict: 'not submission-ready yet'. Adjudication + application recorded in AGENT_SYNC (2026-09-01 entry).

## Verdict

Not submission-ready yet. The Board’s visible counts are internally consistent—40 nodes, 43 edges, and all 23 seed evidence nodes marked unverified—and its caveats are unusually candid. However, several tool names turn graph topology into apparent evidence judgments, an open question is counted as a completed test, the featured quote does not support its evidence statement, and the advertised extension flow fails as written. The judge-facing copy then amplifies those problems by changing the measured population, claiming literature-wide findings from a 19-record corpus, and applying meta-analysis guarantees to the non-statistical Board. The video narration is 357 words (≈2:33 at 140 wpm), but the scheduled 2:59 cut leaves only 26 seconds for every prompt, response, click, render, and transition—no safe margin.

Reviewed only the [runtime packet](/private/tmp/claude-501/-Users-hirokisugimoto-Downloads-money/91993812-87a7-4fdf-bbd6-187abab31a67/scratchpad/review-packet-v2.json), [README.md](/Users/hirokisugimoto/Downloads/money/living-evidence/README.md), and [docs/SUBMISSION.md](/Users/hirokisugimoto/Downloads/money/living-evidence/docs/SUBMISSION.md), without repository exploration or tests.

## Findings

- **[must-fix] Runtime packet → Board `list_nodes`, `get_node`, and `get_discoveries` — diagnostic names imply truth judgments and omit a valid state.** `supported/contested/unsupported` conflicts with the Board’s claim that it issues no verdicts, and with the exemplar/Atlas meaning of “supported.” Moreover, a claim with only `contradicts` edges fits none of the documented states because “unsupported” means no evidence edges. Rename `get_discoveries` to `get_board_diagnostics` and use a literal four-state field such as:

  ```json
  "evidence_edge_state": "none|support_only|contradiction_only|mixed"
  ```

  Rename the result buckets to `claims_with_mixed_edge_labels`, `claims_without_incoming_evidence_edges`, and `claims_with_contradiction_only_edges`. Return verified/unverified edge counts rather than a verdict-like status.

- **[must-fix] Runtime packet → `get_discoveries.single_source_claims` — equality of `cited_as` strings is not source identity or independence.** One agency label may cover multiple tables, while aliases may split one source. Rename this to `single_supporting_citation_label_claims` and define it as: “all supporting nodes share one exact nonempty `cited_as` value; this is not a source-independence assessment.”

- **[must-fix] Runtime packet → `get_discoveries.untested_hypotheses` and `tests` edges — open questions are counted as completed tests.** The result is `[]` because question nodes point at both hypotheses, even though those nodes are returned as open questions. Rename the diagnostic to `hypotheses_without_linked_test_questions` and say “test-plan coverage, not tests performed.” Alternatively, rename the edge `would_test`; reserve tested/untested for an explicit completed-result state.

- **[must-fix] Runtime packet → `board_overview.topic` — the topic presupposes an undefined, verified phenomenon.** It specifies neither year, population, denominator, comparator, nor the source’s exact category. Replace it with:

  > 会話で報告された東京の「専業主婦率」は、どの年・母集団・指標定義で他地域より高いのか。差が確認できる場合、経済的選抜・家族構造・時間コストはどこまで説明しうるか（一次資料未照合）。

- **[must-fix] Runtime packet → `sample_get_node` for `e-1995` — the quote fails the Board’s own admissibility rule.** `東京 50.4% 福井 31.1%` contains no year, denominator, measure, or source, yet the node asserts 1995, married women, a full-time-housewife rate, and Census provenance. Supply the full conversation excerpt containing those elements and a conversation-turn locator. If it does not exist, reclassify the node as an `unverified_lead`, not evidence. Replace its statement with:

  > 会話は、1995年の「有配偶女性の専業主婦率」を東京50.4%、福井31.1%（差19.3ポイント）と記載している。指標定義と国勢調査の一次表は未確認。

  Remove `当時から大差があった`: one datum neither defines “large” nor establishes temporal continuity. Also change `kind:"official-stat"` to `reported_source_kind:"official-stat"` while verification remains absent.

- **[must-fix] Runtime packet → edges `ed35` and `ed43` — the edge labels contradict their own rationales.** Both say `contradicts h-selection`, while their rationale explicitly says selection remains compatible as a contributing factor. Remove those edges unless `h-selection` is explicitly exclusive, or target a narrower claim such as “recent economic selection alone created the entire difference.” Require a nonempty rationale for every `supports` or `contradicts` edge, especially the six displayed direct support edges whose rationale is currently null.

- **[must-fix] Runtime packet → `propose_edge.description` — the advertised validity matrix contradicts the overview and seeded graph.** The description omits `evidence→hypothesis`, although the overview allows it and `ed39`–`ed43` use it. Add that route or remove it everywhere. Rename “validity matrix” to “endpoint/type compatibility matrix”; it checks types, not inferential validity.

- **[must-fix] Runtime packet → `propose_node.inputSchema` — prose-only requirements make schema-valid GPT calls fail.** Only `type`, `label`, and `statement` are schema-required, although evidence also requires `value`, `year`, `kind`, `cited_as`, and `quote`. Use a discriminated `oneOf` keyed by `type`, with all evidence fields required in that branch. Add a required traceable `source`/locator and `quote_origin:"conversation"|"primary_source"`. Human approval must not silently mean source verification.

- **[must-fix] Runtime packet → `unverified_evidence_count` — the name is broader than what is counted.** Its description counts only nodes carrying the exact seed label; newly approved evidence has no verification field and could disappear from the unverified total. Either rename it `unverified_seed_evidence_count`, or track verification on every evidence node and compute the genuine total.

- **[must-fix] Runtime packet → `board_overview.suggested_flow[3]` — the judge demo path is impossible as written.** `propose_edge` does not accept a quote (`additionalProperties:false`), and a pending node cannot be an endpoint. Replace with:

  1. `propose_node` with a context-bearing evidence quote.
  2. Ask the human to approve it.
  3. `propose_edge` from the now-active node, with rationale.
  4. Ask the human to approve the edge.
  5. Call `get_board_diagnostics` again.

  Provide a separate fast read path: `board_overview → get_board_diagnostics → focus_node {"node_id":"c-income"}`.

- **[must-fix] Runtime packet → `board_overview.honesty[2]`, `set_topic`, `get_audit_log`, and tally scope — mutation, approval, and ledger language is false.** `set_topic` mutates immediately without approval; the audit description omits topic changes and human rejections; and every displayed seed edge has `approved_at:null`. Replace the contract with:

  > Nodes and edges enter the active graph through proposal and human approval; preloaded seed content is active but was not approved in this session. `set_topic` changes the heading immediately, `focus_node` changes selection, and `export_board` starts a download. Proposals, approvals/rejections, topic changes, navigation, and exports are ledgered.

  Replace “approved edges” with “active edges—preloaded seed plus human-approved additions.”

- **[must-fix] Runtime packet → all four `suite_context` objects — the new Board is undiscoverable from every agent orientation.** Add this entry to exemplar, workspace, Atlas, and Board:

  > `board.html — a separate Evidence Board built from an unverified ChatGPT conversation about a reported Tokyo 専業主婦 measure; it exposes structural graph diagnostics and human-approved node/edge additions. Its state does not propagate to the Pygmalion pages.`

- **[must-fix] README 72–78; Submission 77–87; video 230–235 — Board copy changes the construct and overstates the diagnostics.** The dump does not establish “Japan’s highest,” “stay-at-home-parent,” or “among school-age families”; the sample denominator is married women. “Nobody answered,” “single source,” “quote-backed,” and “auditable” are also too strong given conversation-only fragments, string-matched source labels, and null source locators.

  Replace the README paragraph with:

  > **Board a research conversation** — [open `board.html`](board.html) and ask *“Call `get_board_diagnostics`, explain only graph structure, then focus the first mixed claim.”* A real ChatGPT thread about a conversation-reported Tokyo `専業主婦` measure is represented as two hypotheses, four mechanisms, eight claims, twenty-three evidence extracts, and three questions left open in that conversation. Each seed extract carries a conversation excerpt and an attributed `cited_as` label; all twenty-three are marked unverified against primary sources. The diagnostics describe active graph edges, not truth. Agents propose nodes and—after node approval—their edges; a human approves each addition.

  Add a direct Devpost link to `⟨deploy URL⟩/board.html`. A safer video replacement is:

  > “This ChatGPT research thread is now a board: hypotheses, claims, twenty-three unverified conversation extracts, and questions left open there. One call reports edge patterns—not truth—and additions require human approval.”

- **[must-fix] README 5–9 and 39–42; Submission 57–60 and 89–92 — suite-wide computation, rendering, and ledger claims contradict the dump.** Pure reads are not ledgered and generally do not change the page; ledgers are session-local; and the Board’s evidence values came from an unverified conversation rather than deterministic page computation. Replace the design rules with:

  > Page code deterministically computes derived statistics or graph diagnostics from current page state; input evidence retains its provenance and verification label. On the Board, only graph bookkeeping is computed—there is no statistics engine or truth verdict. Analysis and view/state-changing actions render into the page and enter a visible, session-local ledger; pure reads remain tool responses and are not ledgered. Humans approve evidence-base changes.

- **[must-fix] README 66–70 and 93; Submission 68–76; video 237–241 — Atlas findings escape their collection frame.** The dump explicitly says `unknown / not-searched`; it proves only that none of these 19 records falls in the 8–16-week band. Remove “no study ever sampled,” “whole literature,” and “experiment surfaced by the evidence itself.” Use:

  > None of these nineteen records has 8–16 weeks of prior contact. The wider collection frame is unknown/not-searched, so this is a coverage lead—not evidence that no such study exists. The brief lists known and unresolved design inputs and computes no sample size.

  Short video version:

  > “Among these nineteen records, weeks eight to sixteen are empty—not proof no study exists. The brief lists missing design inputs and refuses a fake sample size.”

- **[must-fix] Submission 43–47; video 205–209 — “the effect exists only” exceeds the statistical result.** The ≤1-week result is a post-hoc within-subgroup test; the moderator is a study-level association under an authored cap-at-three model, with boundary-clipped R² and no uncertainty interval. Replace with:

  > The capped-weeks moderator rule is supported, but it reports a study-level association under an authored model; it does not establish an exclusive or causal window.

- **[must-fix] Submission 63–64 and video 217–222 — the hash claim and demo prompt do not match the tool.** `record_hash` is a non-cryptographic drift checksum, not tamper evidence, and the video prompt omits required `author`, `vi`, `weeks`, `source`, and `quote`. Remove “approval bound to a record hash,” or describe it only as an accidental-drift checksum. Paste a complete, visibly synthetic prompt:

  > “Propose this synthetic demo record: author ‘Demo et al.’; year 2026; yi 0.10 SMD; vi 0.04; weeks 2; source ‘Hypothetical video-demo data note, not a publication’; quote ‘Synthetic demo: SMD 0.10, sampling variance 0.04, two weeks of prior contact.’”

- **[must-fix] README 78 and 147–149; Submission 86, 124–127, and 171–176 — the cross-page product story contradicts itself.** The Atlas has no mutation gate, while the copy says the Board uses it “everywhere else”; later, the project says both “not just meta-analysis” and “one genre.” Replace with:

  > What ships today is v0.1: a complete living-meta-analysis loop plus an Evidence Board adaptation of the same provenance, diagnostics, ledger, and human-approval principles. The Atlas is read-only. A common cross-genre claim protocol remains v0.2 direction, not shipped software.

- **[must-fix] Submission 185–246 — the 2:59 schedule has no operational safety margin.** Counts exclude the three on-screen `Type:` prompts and the bracketed on-screen label:

  | Beat | Words | 140 wpm | Slot | Slack |
  |---|---:|---:|---:|---:|
  | 0:00–0:20 | 40 | 17.1s | 20s | 2.9s |
  | 0:20–0:45 | 63 | 27.0s | 25s | **−2.0s** |
  | 0:45–1:10 | 49 | 21.0s | 25s | 4.0s |
  | 1:10–1:30 | 33 | 14.1s | 20s | 5.9s |
  | 1:30–1:52 | 34 | 14.6s | 22s | 7.4s |
  | 1:52–2:12 | 36 | 15.4s | 20s | 4.6s |
  | 2:12–2:32 | 43 | 18.4s | 20s | 1.6s |
  | 2:32–2:47 | 35 | 15.0s | 15s | **0.0s** |
  | 2:47–2:59 | 24 | 10.3s | 12s | 1.7s |

  Total: **357 words = 153 seconds (2:33)**, leaving 26 seconds for every prompt paste, model/tool wait, page change, click, render, and visual dwell. Target a final cut of **≤2:50**, pre-stage or jump-cut tool latency, and shorten the 63-word exemplar beat to:

  > “This is a real meta-analysis of the Pygmalion effect: nineteen experiments on whether teacher expectations raise children’s IQ. Every number is computed in-browser from study data embedded in the page. Highlighted sentences are claims with deterministic checks. A WebMCP browser gives the agent twelve typed tools to interrogate them.”

- **[must-fix before upload] Submission 179, 218, and remaining `⟨…⟩` markers — unresolved placeholders remain.** Insert the live URL, repository URL, and complete synthetic demo payload; confirm the final encoded video is below three minutes, not merely the script timeline.

- **[nice-to-have] Runtime packet → `get_board_diagnostics` output — return inspectable objects, not opaque IDs.** For mixed claims return `{id,label,support_count,contradict_count}`; for single-citation-label cases return `{id,label,cited_as,evidence_ids}`. This makes the diagnostic verifiable in one tool call.

- **[nice-to-have] Runtime packet → Board diagnostics — hypothesis-level mixed edges are currently hidden.** `h-selection` visibly receives both support and contradiction labels. Add `hypotheses_with_mixed_incoming_edge_labels`, and disclose when supporting claims are themselves mixed.

- **[nice-to-have] Runtime packet → Board orientation — state lifetime and `board_version` semantics are unspecified.** State whether proposals, topic, selection, and ledger survive reload, and exactly which events increment `board_version`.

- **[nice-to-have] Runtime packet → `propose_node.kind/year` — the evidence model conflates source form and method.** Split `kind` into `source_form` and `analysis_type`; distinguish unknown year from not-applicable. Reject exact duplicate edge triples rather than merely flagging them.

- **[nice-to-have] Submission 96–98 — “12 tools” now sounds suite-wide.** Replace with: “12 exemplar tools, 15 workspace tools, 10 Atlas tools, and 11 Board tools, each with JSON Schema and read-only annotations where appropriate.”

- **[nice-to-have] README 17–21 and 132–136; Submission 19–27; video 190–193 and 243–246 — remove unsupported historical and empirical absolutes.** Replace “fastest-growing readership,” “human readers almost never,” “machine readers rerun constantly,” “there has never been a way,” and “the first page” with narrower claims such as: “Compatible agents can now receive a typed in-page contract instead of relying only on prose or generic UI automation,” and “a prototype toward an executable layer for science.”