# living-evidence — session ritual

WebMCP Challenge 2026 entry (deadline **2026-09-03 13:00 PDT** = 9/4 05:00 JST).
"Living Evidence" = documents your AI can cross-examine. Format spec + exemplar
living meta-analysis (Pygmalion effect).

Every session, in order:

1. Read `docs/AGENT_SYNC.md` in full (protocol in its header; update before stopping).
2. Read `docs/SPEC.md` if touching the format; `README.md` if touching positioning.
3. Before delivery/commit: `node verify/stats.test.mjs && node verify/e2e.mjs`
   must be green. E2E uses Playwright from `~/tennis-checker/node_modules/playwright`
   (absolute path, no install) and serves on **port 8501** via
   `python3 -m http.server 8501 --bind 127.0.0.1` (always 127.0.0.1, never localhost).

Rules that bit us elsewhere (from ~/.claude/playbooks/html-game-verification.md):

- Screenshots must be eyeballed after green tests; pixel-presence ≠ readable.
- No `window.__*` probe hooks in shipping files (`window.LivingEvidence` is the
  documented public API, not a probe).
- WebMCP facts of record: entry point `document.modelContext` (W3C draft; no
  navigator variant in spec), `execute` returns a plain object (runtime
  serializes), schemas set `additionalProperties: false`. ChatGPT desktop's
  built-in browser discovers tools automatically ("Site tools" in address bar);
  iframes are not supported — register from the top-level page only.

Statistical goldens come from published metafor output for dat.raudenbush1985 —
do not "fix" tolerances to make a failing engine pass; a golden mismatch means
the engine is wrong.
