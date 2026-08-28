# Deploying (static folder, no build step)

The whole site is this folder. Any static host works; sponsors give bonus
credits for Cloudflare / Netlify / Vercel / Render.

## Cloudflare Pages (recommended — sponsor + fast)

```bash
npx wrangler pages deploy . --project-name living-evidence
```

(First run: `npx wrangler login`. Or connect the GitHub repo in the Cloudflare
dashboard — every push then deploys.)

## Netlify

```bash
npx netlify deploy --dir . --prod
```

## Checks after deploy

1. `https://…/index.html` renders; dark mode OK.
2. DevTools console: no errors; `window.LivingEvidence.tools.length === 12`.
3. ChatGPT desktop app → built-in browser → open the URL → address bar
   "Site tools" shows the 12 tools → ask the agent to cross-examine.
4. HTTPS is mandatory (`document.modelContext` is SecureContext-only) — all the
   hosts above give it by default.

Nothing to configure: no env vars, no functions, no headers required.
