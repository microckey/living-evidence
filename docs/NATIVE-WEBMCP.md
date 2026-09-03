# Native WebMCP verification

There are two deliberately different test paths:

- **Handler regression:** Playwright drives the documented in-page API and the
  human controls. This checks scientific results, approval, persistence and UI.
- **Native integration:** `verify/native-webmcp.mjs` talks to Chrome's DevTools
  Protocol `WebMCP` domain. It discovers the real browser registry and invokes
  tools with `WebMCP.invokeTool`; it never calls the public in-page handler as a
  substitute and installs no polyfill or mock registry.

The native audit on September 4, 2026 used **Google Chrome 152.0.7977.75**. It
discovered 15 exemplar, 18 workspace, 10 Atlas and 11 Board tools, invoked each
overview, and ran the exemplar's headline rule through native WebMCP. The shared
document showed `rule failed` and the ledger attributed the invocation to the
agent/tool client. This demonstrates transport and shared-state integration,
not autonomous reasoning, scientific validity or a performance advantage.
**ChatGPT's in-app agent has not been tested.**

## Reproduce

Use Node 22.13+ and a Chrome version exposing the experimental DevTools WebMCP
domain. No npm packages are needed for this harness:

```bash
node verify/native-webmcp.mjs
node verify/native-webmcp.mjs --url https://living-evidence.doralemon.chatgpt.site/
node verify/native-webmcp.mjs --chrome /path/to/google-chrome --report /tmp/native-report.json
```

`CHROME_PATH` is also supported. With no URL, the test serves the checkout on a
temporary loopback port. With a URL, it tests that deployment without uploading
anything. Each run uses a new temporary Chrome profile and removes only its own
profile after closing Chrome; it never reads the user's normal browser session.

Chrome is launched with:

```text
--enable-experimental-web-platform-features
--enable-features=WebMCPTesting,DevToolsWebMCPSupport
```

The test checks discovery counts and tool metadata; representative overview
invocations; the headline rule's canonical outcome; its actual DOM badge and
agent ledger row; an invalid claim id rejected without ledger mutation; and,
when present, the quick-start panel mirroring that native invocation. Failures
return a nonzero exit code. It fails rather than falling back when Chrome lacks
the native domain. This is a targeted smoke test, not exhaustive native input
coverage for every tool. The separate regression suites cover more handler
branches, imports, signatures and human approvals.

The repeatable test caught a Chrome 152 compatibility issue missed by the first
overview-only audit: an Atlas schema description containing Latin-1 `tau²`
was present in the page registry but omitted from the DevTools discovery event.
An isolated ASCII/Latin-1/Unicode comparison reproduced it. The description now
uses ASCII `tau^2`; the statistical engine and schema constraints are unchanged.
The native test requires every discovered tool to expose its schema, so this
regression cannot silently pass on overview invocation alone.

## Try it by hand

Open the live page in a supported WebMCP browser. In Chrome, enable WebMCP using
`chrome://flags/#enable-webmcp-testing`, then use its WebMCP developer tools or a
compatible client to discover and invoke `get_document_overview` followed by
`evaluate_claim` with `{"claim_id":"c-textbook"}`. The page's **Copy agent
prompt** offers a longer provenance-aware walkthrough. A registered interface
does not mean an agent has connected; the manual button is labeled a human
action, never an AI simulation.

Browser guidance: [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp)
and [challenge resources](https://webmcp.devpost.com/resources).
