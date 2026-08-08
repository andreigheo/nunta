# WeddingOS public landing page

Route: `/`  
Design contract: `DESIGN.md`  
Source entry: `src/app/(marketing)/page.tsx`

## Outcome

The public landing page is a Romanian-first, product-led explanation of WeddingOS. It uses the same light palette, Fraunces/Inter typography, controls and operational language as the authenticated dashboard. The visual north star is **Control calm** and the signature interaction is the **live data flow** between Planning, RSVP and logistics, Procurement and budget, and Wedding Day.

There are no fictional couples, budgets, dates, testimonials, customer logos or product screenshots. Product proof is rendered as semantic, read-only React UI. Public percentages appear only when the dedicated aggregate endpoint returns a valid privacy-preserving snapshot.

## Composition

The page contains exactly nine top-level sections:

1. Split hero with account/demo CTAs and one dominant product surface.
2. The ordered WeddingOS data flow.
3. Planning and next action.
4. Guest CRM, RSVP and logistics.
5. Procurement, suppliers and budget.
6. Wedding Day Command Center.
7. Trust, privacy and honest platform boundaries.
8. Five frequently asked questions.
9. Final CTA.

The header and footer sit outside this count. Pricing, generic audience tabs, standalone AI marketing, Concierge and the old static mockups are intentionally absent. AI may be described only inside a real implemented flow and only with the status supplied by the capability manifest.

## Public product proof

The landing never calls an authenticated dashboard endpoint. Its only numeric source is:

```text
GET /api/v1/public/product-proof
```

`PublicProductProofV1` is exported by `@weddingos/contracts`. It contains a 365-day window, privacy policy, capability statuses and percentage metrics for the four operational domains. The web server validates the response strictly, uses a 1.2-second timeout, never forwards browser cookies and revalidates at most every 15 minutes.

Rendering states are explicit:

- `fresh`: validated aggregate percentages and update time;
- `stale`: the last verified snapshot, no older than 24 hours, with a stale label;
- `suppressed`: a stable metric slot labelled `Cohortă insuficientă` and no value;
- `fallback`: the same product geometry without numbers, labelled `Previzualizare produs`.

The API skips invalid or future-dated rows and serves the newest valid snapshot inside the 24-hour window. If no valid row remains, it answers `503` with `Cache-Control: no-store`; the web layer then renders the numberless fallback.

## Consent and aggregation

Workspaces are excluded by default. Only a `couple_owner` with `workspace.manage_public_aggregation` can read or change the workspace decision from `/settings?tab=privacy`:

```text
GET /api/v1/workspaces/:workspaceId/public-aggregate-consent
PUT /api/v1/workspaces/:workspaceId/public-aggregate-consent
If-Match: "<version>"
```

The accepted policy is `public-aggregate-v1`; there is no alternative legal basis in the couple-facing contract. Activation and revocation are audited. A worker recomputes the public snapshot at startup and every 15 minutes. An active-to-revoked transition also writes `public_aggregate.consent_revoked.v1` to the transactional outbox, so the worker requests an immediate refresh; a lock conflict is retried and the periodic refresh remains the 15-minute upper bound.

The same revocation transaction appends a tenant-free invalidation timestamp. Until a newer snapshot exists, the public response is `stale` and `no-store`; at 15 minutes it becomes `503`, even if the worker is unavailable. Cache directives never use `stale-if-error` and cap shared caching below the revocation deadline.

Before publication:

- each metric needs at least 20 distinct opted-in, active workspaces;
- ratios are calculated per workspace before aggregation;
- percentages are rounded to five percentage points;
- cohort sizes are bucketed to tens;
- names, identifiers, contact details, locations, dates, free text, amounts and currency are forbidden;
- the public API can read snapshots but cannot read raw cross-tenant data.

The bounded cross-tenant calculation lives in a `SECURITY DEFINER` function owned by the dedicated `NOLOGIN` role `weddingos_public_aggregator` and callable only by the worker role. The API and worker keep normal RLS restrictions and cannot select the raw aggregation inputs directly; the dedicated role is not granted to either runtime role. Raw tenant inputs are never returned to public clients or the landing.

## Accessibility and responsive behavior

- WCAG 2.2 AA contrast and visible focus are required.
- The skip link targets `main#continut`.
- Interactive flow steps are real buttons in an ordered list and expose their selected state.
- The active description updates only after a manual action.
- All controls have a 44px minimum touch target.
- At mobile widths, product surfaces reflow into semantic lists instead of scaling screenshots.
- Hero motion enhances already-visible content and is removed under `prefers-reduced-motion`.
- The landing remains light-only even when the authenticated app theme is dark.

## Validation gate

Use Linux Node 22 or newer before any Windows npm shim:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
NEXT_DIST_DIR=.next-landing pnpm exec playwright test --config=playwright.landing.config.ts
pnpm exec playwright test --config=playwright.landing.proof.config.ts
SMOKE_BASE_URL=http://127.0.0.1:<port> pnpm smoke
```

The isolated landing suite starts only the prebuilt Next.js surface and therefore proves the API-down fallback. Full-stack tests separately seed a deterministic sanitized snapshot and cover fresh, stale and suppressed states. Browser checks cover 320px, 390px, 768px, 1024px and 1440px, anchor integrity, keyboard behavior, reduced motion, console errors and horizontal overflow.
