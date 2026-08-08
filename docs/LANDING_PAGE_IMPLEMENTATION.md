# Sarbato public landing page

Route: `/`  
Design contract: `DESIGN.md`  
Source entry: `src/app/(marketing)/page.tsx`  
Normative copy: `src/content/marketing/sarbato.ts`  
Claims registry: `src/content/marketing/claims-registry.ts`

## Outcome

The public landing page is a Romanian-first, product-led explanation of Sarbato under the public brand **Sarbato** (sarbato.space). It is honest about availability: **currently available for wedding planning**. The marketing layer has its own celebratory palette (deep plum, coral, warm yellow, green) and Afacad Flux display type scoped to `.marketing-light`; the authenticated product keeps its operational tokens.

The page follows one event story — Plan → Invitație → RSVP → Logistică → Furnizori → Buget → Ziua evenimentului — connected by a continuous thread motif. There are no fictional couples, guests, budgets, dates, locations, testimonials, customer logos, vendor names or product screenshots. Product proof is rendered as semantic, read-only React UI, and every showcase surface is labelled `Exemplu de produs — nu reprezintă datele unui client.` Public percentages appear only when the dedicated aggregate endpoint returns a valid privacy-preserving snapshot.

## Composition

1. Header with the Sarbato wordmark, compact navigation (Cum funcționează, Invitații, Organizare, Ziua evenimentului, Abonamente) and account CTAs; it becomes slightly more solid on scroll.
2. Hero with the availability note, the `Creează primul eveniment` and `Vezi cum funcționează` CTAs, and a focused product composition: next action with owner and deadline/state, connected modules, and a mobile invitation preview. A short stage sequence runs once and never loops.
3. Signature interaction (`#flux`): one change, less rework. Selecting a stage (e.g. `RSVP primit`) visibly updates guest status, menu preference, seating, transport and the suggested next action. Works with mouse, touch and keyboard.
4. Planning chapter (`#planificare`): proposal review, list/board/timeline/calendar views, responsibility, deadline, warning and Plan B.
5. Invitations chapter (`#invitatii`): editor with templates, reorderable sections, visibility controls, responsive preview, RSVP section, save and publish; then responses becoming logistics (menus, seating, transport, accommodation).
6. Vendors and budget chapter (`#furnizori`): Cerere → Ofertă → Comparare → Rezervare → Contract → Buget, with the explicit boundary that Sarbato does not collect or transfer payments between organizers and vendors.
7. Event day chapter (`#ziua-evenimentului`): Now/Next, run of show, checklists, check-in, incidents and Plan B in a dark command composition.
8. Trust (`#incredere`): workspace privacy, explicit confirmations, external capabilities identified, no payment intermediation.
9. Subscriptions (`#abonamente`): Gratuit is the only actionable plan; Esențial (7 €/lună) and Pro (17 €/lună) stay `Disponibil în curând` until Paddle products, webhooks, entitlements, cancellation and billing states exist. No fake checkout buttons.
10. Public aggregate metrics, only when the proof endpoint is valid and at least three metrics are publishable.
11. Eight FAQ entries (`#intrebari`), without demo/beta questions.
12. Final CTA: `Începe cu evenimentul tău. Sarbato leagă restul.`

## Public product proof

The landing never calls an authenticated dashboard endpoint. Its only numeric source is:

```text
GET /api/v1/public/product-proof
```

`PublicProductProofV1` is exported by `@weddingos/contracts`. It contains a 365-day window, privacy policy, capability statuses and percentage metrics for the four operational domains. The web server validates the response strictly, uses a 1.2-second timeout, never forwards browser cookies and revalidates at most every 15 minutes.

Rendering states are explicit:

- `fresh`: validated aggregate percentages with `Date agregate · actualizare verificată`;
- `stale`: the last verified snapshot, no older than 24 hours, with `Date agregate · ultimul snapshot valid`;
- `suppressed`: inside a published section, a stable metric slot labelled `Cohortă insuficientă` and no value;
- hidden: when the endpoint is absent, invalid, older than 24 hours, or fewer than three metrics are publishable, the metrics section is not rendered at all — no zero, dashes, placeholders or invented values.

The product showcase is separate from public metrics: it shows qualitative states from the deterministic fixture in `src/content/marketing/sarbato.ts`, never numbers.

The API skips invalid or future-dated rows and serves the newest valid snapshot inside the 24-hour window. If no valid row remains, it answers `503` with `Cache-Control: no-store`; the web layer then hides the metrics section.

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

The isolated landing suite starts only the prebuilt Next.js surface and therefore proves the API-down behavior (metrics hidden, showcase labelled). Full-stack tests separately seed a deterministic sanitized snapshot and cover fresh, stale and suppressed states. Browser checks cover 320px, 390px, 768px, 1024px and 1440px, anchor integrity, keyboard behavior, reduced motion, console errors and horizontal overflow.
