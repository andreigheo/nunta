# Despre noi: concept implementation QA

Date: 2026-09-05
Route: `/despre-noi`
Scope: restore the selected About concept as a production Next.js page; no deployment.

## Target and evidence

- Selected source: `/mnt/c/Users/Andrei/.codex/visualizations/2026/08/29/01a04d41-77cb-7081-8353-b698b8f56cb1/about-concepts/despre-noi-concept-2.jpg` (862 × 1824).
- Focused source: `/tmp/about-concept-hero-crop.png` (1024 × 780).
- Full paired comparison: `/tmp/sarbato-about-rebuild/comparison-862.png`.
- Hero paired comparison: `/tmp/sarbato-about-rebuild/comparison-hero.png`.
- Rendered desktop/tablet/mobile captures and Axe results: `/tmp/sarbato-about-rebuild/{1440,1101,862,768,390,320}-{full,hero-art}.png` and the corresponding JSON files.
- Comparisons display source and implementation together, not separate views. Full-page source and capture are both displayed at 862 px; Chromium CSS viewport is 862 × 1000 with deviceScaleFactor 1. Hero crops are normalized to 512 × 390 per panel.
- Light theme, Romanian, unauthenticated, cookies rejected, fonts loaded before capture. The source has no mobile state: mobile is an intentional responsive adaptation.

## User-directed exceptions

The user explicitly required hand-built SVG strokes and characters, not raster crops, background removal, or automatic tracing. All illustrations are authored Bézier paths and actual SVG text. This overrides the skill's usual preference for retaining source bitmap assets.

The site's established responsive header/footer are retained. The concept's fictional company links, social accounts, and old copyright date were not reproduced. About is added to real header/footer navigation and the sitemap.

## Iterations and findings

1. Initial rendering: P2 excessive section height, detached common-plan connection, four-line hero heading at the reference width. Corrected grid proportions, heading wrapping, section rhythm, and shared SVG/portrait geometry.
2. Paired comparison: P2 role descriptions too close to the return stroke. Increased bottom clearance, aligned portrait baseline to SVG geometry, and added an automated clearance assertion across eight widths.
3. Paired comparison: P2 the belief illustration was overly abstract and the event list wrapped unnecessarily at the reference width. Reconstructed recognizable people inside the knot, replaced the resolved group with a continuous shoulder/neck path, refined type-list spacing, and added its outer connection strokes.
4. Final recapture and paired comparison completed on the built page at `http://127.0.0.1:43191/despre-noi`. The revised belief scene has recognizable faces inside the knot and a continuous resolved group; the event list stays on one row at 862 px. Role text clears the return stroke. No remaining P0/P1/P2 issue was identified within the approved responsive/vector interpretation. Source-to-render differences in the shared shell, text sizing and hand-drawn contours are explicitly retained as the product constraints described below, not described as pixel-identical.

## Five fidelity surfaces

- **Fonts/typography:** actual Sarbato Afacad Flux headings and Inter body. Real text, no text baked into images. Source hierarchy/copy retained. Tablet header and larger readable body copy intentionally follow the existing product rather than copying undersized image text.
- **Spacing/layout:** same section order, two-column hero, four-role flow, common-plan return, three promises, lavender belief band, event types, framed CTA. Mobile stacks hero and promises and uses a two-column role layout. Header/footer dimensions intentionally differ from the source's fictional shell.
- **Colors/tokens:** brand plum with gold/coral/green paths and restrained lavender background. Darker text variants maintain contrast while decorative lines remain lighter. Flat paper background replaces the bitmap texture.
- **Image quality:** no raster illustration, SVG `<image>`, masking, or auto-traced filled blobs. Four human figures, center calendar, overlapping loops, and connecting paths are editable vector strokes. Hand-authored contours preserve subject, pose, composition and line style; they are not claimed to reproduce every antialiased source pixel.
- **Copy/content:** selected Romanian headings and descriptions retained, with actual account/product links. No invented team identities, usage metrics, history, awards, or testimonials.

## Functional validation

- Final Next production build and TypeScript: passed, with `/despre-noi` prerendered successfully.
- Focused ESLint: passed.
- About tests: 2 passed, including navigation, active state, canonical, native SVG, CTA destinations, mobile menu, no horizontal overflow, and minimum 16 px role-to-plan clearance at 320, 390, 760, 768, 862, 1100, 1101 and 1440 px.
- Axe WCAG A/AA and page errors: zero violations/errors at 320, 390, 768, 862, 1101 and 1440 px.
- Final rerun against the activated local build: all 10 About + landing-corrections tests passed. Final Axe captures again show zero violations/errors and 14 native SVG elements, zero raster elements in main content.
- Route smoke: 72/72 passed on local 43191. Protected routes redirect to authentication as expected; this does not claim authenticated workflow testing.
- Broader browser suite: 35 passed, 1 skipped (GTM unavailable locally), 4 historical landing assertions failed. Two expect old card heights; two expect removed inert controls. Read-only baseline comparison against the previous build on 43191 returned exactly the same values as 43194: planning height 345.5, guest height 326.609375, report-link count 0, see-all count 0. These are not About regressions; no unrelated landing styles or tests were loosened.

## Handoff checklist

- [x] Real server-rendered page and accessible SVG illustration.
- [x] Header/footer links, active desktop navigation and sitemap entry.
- [x] Responsive behavior and accessible actions.
- [x] Source/implementation paired comparisons.
- [x] Final build, final capture and activation on local 43191.
- [x] Post-fix visual review.

Final result: passed for this About-page implementation, with the documented intentional adaptations. Four historical landing assertions remain outside this change and are not represented as passing. No commit, push or production deployment was performed.
