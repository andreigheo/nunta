# Sarbato agent guide

## Product scope

Sarbato is a Romanian-language, full-stack event organizer for weddings,
baptisms, birthdays, corporate events, conferences, anniversaries, private
parties, festivals, fundraisers and other events. The canonical native WSL
checkout is `/home/andrei/sarbato`; the API, PostgreSQL database, worker and
object-storage flows are real services. Preserve those integrations and never
replace a working backend flow with local demo state. Internal package, cookie,
role and compatibility-storage identifiers may still use `weddingos`,
`wedding_*` or `couple_owner`; do not rename stable technical contracts without
a rehearsed compatibility migration.

The visual direction is established in `DESIGN.md`. Reuse the Sarbato tokens in `src/app/globals.css`, the primitives exported from `src/components/ui/index.ts`, and the existing Romanian copy register. Marketing and product share one identity at different intensities: Afacad Flux for brand/system headings, Inter for operational UI, and Fraunces only inside user-controlled creative invitation content. Do not introduce a parallel component system, palette, or dependency for a component already available locally.

## Next.js version rule

This project runs Next.js 16.2.12. APIs, conventions, and file structure may differ from prior versions. Before writing framework-specific code, read the relevant local guide in `node_modules/next/dist/docs/` and follow its deprecation notices. Routes use the App Router and route groups.

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

- Keep Romanian marketing copy and capability status labels in `src/content/marketing/sarbato.ts`; keep claim evidence in `src/content/marketing/claims-registry.ts`; do not scatter competing copy through the section components.
- Preserve the established light editorial/product direction, existing tokens, semantic read-only product surfaces, varied spacing rhythm and restrained entrance motion. The public site must not inherit the authenticated app's dark theme.
- Marketing claims must remain aligned with the implemented product. Anything partial, in development or planned needs an explicit status; do not turn a preview into an availability claim.
- Numeric proof may come only from the validated `PublicProductProofV1` aggregate endpoint. When the endpoint is absent, invalid or older than 24 hours, keep the product geometry but render no numbers and label it `Previzualizare produs`.
- Never add fictional couples, budgets, wedding dates, testimonials, customer logos or usage counts to the landing. A suppressed metric stays visible as `Cohortă insuficientă`, never as zero.
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

The native WSL checkout is a Git repository. Use a clean task-specific worktree
for backend changes, preserve unrelated changes in `/home/andrei/sarbato`, and
report commit, push and production deployment evidence separately.
