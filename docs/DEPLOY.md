# Deploying Living Evidence

The primary deployment uses OpenAI Sites and the project id in
`.openai/hosting.json`. Build and verify the exact source commit before updating
the existing site.

```bash
pnpm test
pnpm e2e
pnpm e2e:workspace
pnpm e2e:atlas
pnpm e2e:board
pnpm build
```

Post-deploy checks:

1. `/` renders 19 effect-size records / 18 experiments and exposes 15 tools.
2. `/workspace.html` exposes 18 tools and imports remain behind human review.
3. `/atlas.html` exposes 10 tools; `/board.html` exposes 11 and labels itself an
   experimental unverified appendix.
4. The benchmark begins with “No runs recorded” and makes no performance claim.
5. `get_data_manifest` reports primary checks 0/19, derivation checks 0/19 and
   structured RoB supplied 0/19.
6. Create a receipt, export a document, and verify the exact HTML plus detached
   receipt with `scripts/verify-receipt.mjs`.

The GitHub Pages mirror remains a useful public fallback. HTTPS is required for
native WebMCP discovery; the manual Tool console is the transparent fallback.
