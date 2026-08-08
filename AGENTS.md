# WeddingOS agent guide

## Product scope

WeddingOS is a Romanian-language, interactive Next.js prototype for couples, guests, vendors, and platform operators. It currently uses local typed data and client state; success toasts simulate persistence and integrations. Preserve that prototype boundary unless a task explicitly introduces a backend, authentication provider, or durable storage.

**Product brand: Sarbato.** Marketing, auth, the authenticated shell, portals and onboarding share the Sarbato identity. Internal packages, API contracts, cookies and technical identifiers may keep the WeddingOS codename until a dedicated technical rename migration. The landing is honest about availability: currently available for wedding planning only.

The visual direction is already established. Reuse the design tokens in `src/app/globals.css`, the primitives exported from `src/components/ui/index.ts`, and the existing Romanian copy register. Do not introduce a parallel component system, new palette, or new dependency for a component already available locally.

## Next.js version rule

This project runs Next.js 16.2.10. APIs, conventions, and file structure may differ from prior versions. Before writing framework-specific code, read the relevant local guide in `node_modules/next/dist/docs/` and follow its deprecation notices. Routes use the App Router and route groups.

## Main surfaces

- Public landing (light-only, no auth): `src/app/(marketing)`, `src/components/marketing`, `src/content/marketing`. Route `/` renders this landing page; it no longer redirects. The `.marketing-light` wrapper in `globals.css` force-scopes light tokens without touching the app theme.
- Couple app shell: `src/app/(app)` and `src/components/shell`
- Authentication: `src/app/(auth)`
- Onboarding: `src/app/onboarding`
- Guest companion: `src/app/guest`
- Vendor OS: `src/app/vendor`
- Platform admin: `src/app/admin`
- Shared UI: `src/components/ui`
- Navigation contract: `src/lib/navigation.ts`
- Demo domain data: `src/lib/data`

Every literal route advertised by the sidebar, command palette, notifications, or page actions must resolve to a real page. When adding a route, include it in `scripts/smoke.mjs`.

## Implementation conventions

- Use TypeScript in strict mode and Romanian user-facing copy.
- Use existing semantic color tokens (`brand`, `accent`, `success`, `warning`, `danger`, `info`) and support both themes.
- Keep pages responsive: stacked mobile layouts, overflow-safe tables, and touch-friendly primary actions.
- All icon-only controls need an accessible label. Interactive state must have a visible result, not only a decorative animation.
- Prefer local page state for prototype interactions. Be explicit in copy when an external action is simulated.
- Do not add a backend-shaped abstraction unless real persistence is part of the task.

## Public landing guardrails

- Keep Romanian Sarbato marketing copy in `src/content/marketing/sarbato.ts`; do not scatter competing copy through the section components. Every public claim is registered in `src/content/marketing/claims-registry.ts` with its supporting route and status; keep the registry in sync with any copy change.
- Marketing and product share the Sarbato palette (deep plum, coral, warm yellow, green on clean neutrals). Afacad Flux is reserved for the Sarbato mark and system headings; Inter remains the operational UI font. Fraunces is limited to user-created or deliberately editorial surfaces such as invitation previews. `.marketing-light` keeps the public site light-only, while the authenticated product uses the matching light tokens plus a dedicated Sarbato dark palette.
- The page tells one event story (Plan → Invitație → RSVP → Logistică → Furnizori → Buget → Ziua evenimentului). Product surfaces are semantic, read-only and always labelled `Exemplu de produs — nu reprezintă datele unui client.`
- Marketing claims must remain aligned with the implemented product. Anything partial, in development or planned needs an explicit status; do not turn a preview into an availability claim.
- Numeric proof may come only from the validated `PublicProductProofV1` aggregate endpoint. When the endpoint is absent, invalid, older than 24 hours, or fewer than three metrics are publishable, the metrics section (`PublicProofSection`) is hidden completely — never zero, dashes or placeholders. A suppressed metric inside a published section stays visible as `Cohortă insuficientă`, never as zero.
- Never add fictional couples, guests, budgets, wedding dates, locations, testimonials, customer logos, vendor names or usage counts to the landing or the auth shell.
- Paid plans (Esențial 7 €, Pro 17 €) stay `Disponibil în curând` until Paddle products, webhooks, entitlements, cancellation and billing states exist; only the free plan is actionable. No fake checkout buttons.
- Header/footer hash links must resolve to real section IDs, and account/legal CTAs must resolve to real routes. Add new concrete public routes to `scripts/smoke.mjs`.
- Build the public surface into an isolated dist directory, then validate it with `NEXT_DIST_DIR=.next-landing pnpm exec playwright test --config=playwright.landing.config.ts`; the suite covers the API-down fallback, desktop/tablet/mobile rendering, anchor integrity, keyboard interaction, the ordered data flow, FAQ behavior and screenshots without requiring API/worker services.

## Validation

Use Node.js 22 or newer. In this WSL workspace, ensure the Linux Node runtime appears before any Windows npm shim in `PATH`.

```bash
npm run lint
npm run typecheck
npm run build
```

For the final route smoke test, start the built app in one terminal and run the smoke script in another:

```bash
npm run start
npm run smoke
```

Override the target with `SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke` when the server uses another port.

## Repository note

The parent `.git` directory is currently empty, so there is no usable commit history or rollback point. Preserve unrelated files and inspect the working tree directly; do not claim Git-based provenance until a repository is initialized.
