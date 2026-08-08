# WeddingOS — Frontend Audit for Backend Implementation

> Snapshot auditat: 17 iulie 2026  
> Repository: `weddingos`  
> Scop: contract factual al frontendului existent pentru implementarea backendului.  
> Regula de bază: raportul nu autorizează schimbări de design, eliminarea funcțiilor sau înlocuirea datelor mock înainte ca un flux backend echivalent să existe.

## 0. Rezumat executiv

Frontendul este un prototip Next.js 16/App Router complet navigabil, în limba română, cu șase suprafețe: Couple Wedding OS, Authentication, Onboarding, Guest Companion, Vendor Business OS și Admin Backoffice. Nu există rute API, bază de date, middleware de autentificare, autorizare server-side, storage, job queue sau integrări externe reale. Majoritatea mutațiilor sunt `useState`, unele acțiuni produc doar toast, iar sursele sunt date TypeScript locale.

Interfața trebuie tratată ca specificație de produs. Cele trei fluxuri dominante sunt:

```text
Guest/Household → Invitation/Campaign → Delivery → RSVP
→ Menu + Seating + Transport + Accommodation

Marketplace → Favorite/Shortlist → RFQ → Offer/Negotiation
→ Booking → Contract → Payment → Review

Onboarding → Tasks/Timeline/Budget → Risks/Plan B
→ Wedding Day → Post-Wedding → Archive
```

Overview, calendarul, notificările și activitatea sunt proiecții peste aceste domenii, nu surse independente de adevăr.

### 0.1 Numărători verificate

| Metrică                                  | Valoare | Metodă                                                                                                                                      |
| ---------------------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Suprafețe/aplicații                      |       6 | Couple, Auth, Onboarding, Guest, Vendor, Admin                                                                                              |
| Rute / fișiere `page.tsx`                | 50 / 50 | `find src/app -name page.tsx`                                                                                                               |
| Layouturi                                |       3 | root, `(app)`, `(auth)`                                                                                                                     |
| Rute Couple OS                           |      35 | `src/app/(app)`                                                                                                                             |
| Rute Auth                                |      10 | `src/app/(auth)`                                                                                                                            |
| Module funcționale normalizate           |      50 | catalogul §3                                                                                                                                |
| Declarații de controale acționabile      |     585 | `Button`, `button`, `DropdownItem`, `Link` în pagini și componente de produs; include două controale de temă și apariții duplicate/navigare |
| Fluxuri de formular logice               |      54 | inventarul §5; există doar 13 elemente HTML `<form>`                                                                                        |
| Câmpuri `Field`                          |     228 | apariții în pagini și componente de produs                                                                                                  |
| Tabele                                   |      18 | instanțe `<Table>`                                                                                                                          |
| Modale                                   |      34 | instanțe `<Modal>`                                                                                                                          |
| Drawere                                  |       9 | instanțe `<Drawer>`                                                                                                                         |
| Confirmări                               |      14 | instanțe `<ConfirmDialog>`                                                                                                                  |
| Suprafețe dialog totale                  |      57 | modal + drawer + confirm                                                                                                                    |
| Acțiuni AI explicite                     |      24 | intrări UI distincte, §10                                                                                                                   |
| Familii de fișiere                       |      17 | §11                                                                                                                                         |
| Roluri recomandate                       |      11 | §13                                                                                                                                         |
| Entități backend persistente recomandate |     143 | 158 candidați auditați, 15 consolidări; catalog §7 + JSON                                                                                   |
| Operații API recomandate                 |     232 | registru §16 și inventarul JSON                                                                                                             |
| Automatizări cross-module                |      40 | §9                                                                                                                                          |
| Familii de integrări externe             |      21 | §14                                                                                                                                         |

Numărul 585 este o măsurătoare de suprafață UI, nu 585 endpointuri. Același contract de business apare adesea în Overview, command palette, quick-create și pagina de domeniu.

## 1. Arhitectura frontendului existent

### 1.1 Structură

| Strat           | Locație                     | Situație actuală                                                         | Contract backend rezultat                                                   |
| --------------- | --------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Couple OS       | `src/app/(app)`             | 35 pagini client-side sub `AppShell`; layout fără auth guard             | bootstrap de sesiune/workspace și autorizare la fiecare query/comandă       |
| Auth            | `src/app/(auth)`            | validări locale, `setTimeout`, redirecturi determinate de email          | identity, sesiuni, tokenuri one-time, reset/verificare, OAuth ulterior      |
| Onboarding      | `src/app/onboarding`        | wizard cu 8 pași și generare simulată                                    | draft incremental, validare, job idempotent de generare                     |
| Guest Companion | `src/app/guest`             | un invitat hardcodat; RSVP local                                         | token limitat la household/invitation și comandă RSVP versionată            |
| Vendor OS       | `src/app/vendor`            | pipeline, livrabile și încasări locale                                   | tenant vendor separat, RFQ/proposals/bookings/invoices partajate controlat  |
| Admin           | `src/app/admin`             | vendor review și controale locale                                        | control plane cu MFA, step-up, dual approval și audit imuabil               |
| Shell           | `src/components/shell`      | command palette, quick-create, notificări, Copilot în state local        | bootstrap, căutare, comenzi de domeniu, notification store, AI gateway      |
| Date            | `src/lib/data`              | șase fișiere seed + constante locale în pagini                           | înlocuire prin repository/API fără două surse paralele                      |
| Tipuri          | `src/lib/types.ts`          | tipuri demo utile, dar relații prin nume și statusuri simplificate       | IDs relaționale, money minor units, version, timestamps, tenant scope       |
| Servicii        | `src/lib/services/index.ts` | 5 interfețe parțiale și mock cu latență de 120 ms; nefolosite consecvent | clienți HTTP pe domenii, erori standard, paginare, idempotency, concurrency |

### 1.2 Stări frontend

1. **UI prezent** — pagina/controlul există și se poate naviga.
2. **Interacțiune locală** — `useState` schimbă UI până la refresh.
3. **Mock funcțional** — calcule/filtre/export Blob/clipboard funcționează local, dar fără persistență.
4. **Toast-only** — controlul doar declară un rezultat.
5. **Integrare reală** — limitată la browser: `localStorage` pentru temă, `navigator.clipboard`, Blob download, linkuri `tel:`/navigare.
6. **Backend end-to-end** — inexistent în snapshot.

### 1.3 Convenții backend comune

Toate entitățile tenant-scoped au `id: UUID`, `workspace_id` sau `vendor_organization_id`, `created_at`, `updated_at`, `created_by`, `version`. Banii sunt `amount_minor: bigint` + `currency`. Timpul este UTC, cu `wedding_timezone` pentru deadline-uri. Operațiile create/send/pay/import/approve folosesc `Idempotency-Key`; update-urile folosesc `If-Match`/`version`. Ștergerile recuperabile folosesc `deleted_at`; auditul este append-only.

## REPOSITORY RECONCILIATION

### Verdict factual

Auditul extins a pornit din root-ul montat `/mnt/c/home/andrei/test kimi`, nu doar din `src/app`. Singurul proiect prezent este subdirectorul `weddingos`; parentul conține doar directoarele goale/read-only `.git`, `.agents`, `.codex` și acest proiect. Nu există un checkout separat sau ascuns al fundației WeddingOS F0/F1 în workspace-ul pus la dispoziție.

| Întrebare                                         | Verdict verificat          | Dovezi în repository                                                                                  |
| ------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Există două frontenduri?                          | **Nu**                     | un singur `package.json`, un singur `src/app`, un singur `next.config.ts`                             |
| Există două structuri de proiect?                 | **Nu**                     | proiect Next.js single-package; `apps/`, `packages/` și workspaces npm lipsesc                        |
| Există `apps/web`?                                | **Nu**                     | director absent                                                                                       |
| Există `apps/api` sau route handlers Next?        | **Nu**                     | director absent; zero fișiere `route.ts`                                                              |
| Există `apps/worker`/queue?                       | **Nu**                     | director absent; nicio dependență de queue                                                            |
| Există DB/migrații/ORM?                           | **Nu**                     | `prisma/`, `db/`, `database/`, `migrations/` absente; zero dependențe ORM/DB                          |
| Există auth server-side?                          | **Nu**                     | pagini auth client-side, timere și redirecturi locale; fără middleware/session store/provider         |
| Există domain/shared contracts?                   | **Nu**                     | numai tipurile demo din `src/lib/types.ts` și tipuri locale în pagini                                 |
| Există AI/integrations/notifications server-side? | **Nu**                     | numai UI, toasturi și seeduri; fără gateway/provider/webhook/credentials                              |
| Există config/observability operațional?          | **Nu**                     | config Next/TS/ESLint/PostCSS minimal; fără env schema, logging, tracing, metrics sau error reporting |
| Există teste backend/frontend?                    | **Nu ca suită**            | numai `scripts/smoke.mjs`, care verifică răspuns HTML pentru 50 de rute                               |
| Există istoric Git pentru proveniență F0/F1?      | **Nu**                     | parentul `.git` este gol, conform `AGENTS.md` și inspecției directe                                   |
| Există backend F0/F1 reutilizabil?                | **Nu în acest repository** | nicio aplicație API/worker, schemă, migrare, test sau contract implementat                            |

Repository-ul are 94 fișiere TypeScript/TSX sub `src`, dintre care 83 TSX, aproximativ 19.657 de linii în `src` + `scripts`, 50 fișiere `page.tsx`, trei layouturi, cinci interfețe de servicii și cinci implementări mock. Nu există nicio operație HTTP către un backend al produsului; singurul `fetch` este în smoke test.

| Suprafață inspectată              |                                                    Inventar verificat | Observație de reconciliere                                                      |
| --------------------------------- | --------------------------------------------------------------------: | ------------------------------------------------------------------------------- |
| `src/app`                         |                                   56 fișiere / 13.545 linii relevante | 50 pages + 3 layouts + providers/globals/favicon; tot frontend                  |
| `src/components/ui`               |                                              15 fișiere / 1.903 linii | primitives locale; se păstrează, nu se introduce al doilea design system        |
| `src/components/shell`            |                                               9 fișiere / 1.878 linii | shell, context, navigation, search, quick-create, notifications, Copilot        |
| `src/components/plan`             |                                                 3 fișiere / 724 linii | board, task drawer, task modal                                                  |
| `src/components/auth` + `portals` |                                                 2 fișiere / 134 linii | helpers și shell portal, fără auth/data boundary                                |
| `src/lib`                         |                                              11 fișiere / 1.348 linii | 6 seed files, types, services, navigation, theme, utils                         |
| Custom hooks                      |                                                                     3 | `useToast`, `useTheme`, `useShell`; nu există `src/hooks` sau server-data hooks |
| Stare/simulări                    | 263 `useState`, 273 `toast()`, 18 `setTimeout`, 3 `localStorage` refs | majoritatea mutațiilor sunt locale sau declarative                              |
| Type sources                      |         20 interfaces în `src/lib/types.ts`, 24 declarații page-local | nu sunt shared backend contracts; necesită migrare, nu dublare                  |
| Public assets                     |                                      5 SVG-uri default Next + favicon | fără media/storage pipeline                                                     |
| Tests                             |                                        1 smoke script / 0 suite files | verifică numai HTML/status pentru rute; fără unit/integration/e2e security      |

### Proveniență și decizie de integrare

| Categorie                             | Ce există / ce trebuie făcut                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ce provine demonstrabil din F0/F1     | **Nimic verificabil în checkout.** F0/F1 apare numai ca ordine recomandată în documentația de audit, nu ca artefact implementat.                                                                  |
| Ce provine din frontendul nou         | toate cele șase suprafețe, 50 de rute, shell-ul, UI primitives, seedurile, tipurile demo, serviciile mock și smoke scriptul                                                                       |
| Ce trebuie păstrat                    | designul, copy-ul românesc, navigația, cele 50 de rute, stările și controalele vizibile, responsive behavior și contractele de produs extrase                                                     |
| Ce trebuie integrat                   | frontendul cu fundația F0/F1 **numai după furnizarea checkout-ului/commitului/artifactului**; apoi API client, auth guard, bootstrap și shared contracts trebuie conectate la implementarea reală |
| Ce este duplicat în proiectul curent  | două căi demo de acces la date: import direct din `src/lib/data` și interfețe mock din `src/lib/services`; tipuri centrale plus numeroase tipuri page-local                                       |
| Ce este incompatibil                  | relații prin display names, money ca `number`, statusuri derivate persistate, guest/RSVP/menu enumuri contradictorii și lipsa tenant/version fields                                               |
| Ce trebuie migrat                     | tipurile demo către contracte shared generate/validate; seedurile către fixture-uri de test; importurile directe către API/domain clients; state-ul local de business către server state          |
| Ce nu trebuie reconstruit             | dacă F0/F1 extern conține identity, tenancy, audit, outbox, jobs, storage sau error model, acestea se reutilizează; nu se creează o a doua implementare înainte de comparație                     |
| Riscul pornirii unui backend nou acum | dublarea fundației externe, incompatibilitate de IDs/status/error model, migrații paralele, două surse de auth/tenant și cost de replatformare                                                    |

**Blocaj de reconciliere:** afirmația că „fundația WeddingOS F0/F1 a fost creată anterior” nu poate fi verificată în workspace-ul curent. Înainte de implementare trebuie furnizat path-ul real, repository-ul, branch/commitul sau o arhivă a acelei fundații. În absența artefactului, acest document descrie contractul necesar, nu autorizează reconstruirea lui de la zero.

### Clasificarea celor 50 de module față de backendul găsit

Niciun modul nu primește clasificarea `BACKEND EXISTENT ȘI REUTILIZABIL` sau `BACKEND EXISTENT DAR INCOMPLET`, deoarece nu există cod backend în repository. „Conflict de contract” înseamnă că mockurile/tipurile existente nu pot deveni direct schema canonică.

|   # | Modul                          | Clasificare reconciliată | Motiv principal                                               |
| --: | ------------------------------ | ------------------------ | ------------------------------------------------------------- |
|   1 | Authentication                 | DOAR MOCK                | validare, timere și redirect local; fără sesiune/token store  |
|   2 | Onboarding                     | DOAR MOCK                | wizard și progres local; jobul nu există                      |
|   3 | Overview                       | DOAR MOCK                | agregate hardcodate; trebuie read model                       |
|   4 | AI Copilot                     | DOAR MOCK                | răspunsuri/propuneri locale; fără model gateway               |
|   5 | Planning                       | DOAR MOCK                | taskuri seed și state local                                   |
|   6 | Tasks                          | DOAR MOCK                | drawer/modal locale; fără aggregate/version                   |
|   7 | Calendar                       | DOAR MOCK                | evenimente seed și efecte toast/browser                       |
|   8 | Timeline                       | DOAR MOCK                | milestone-uri seed; fără graph/recalc                         |
|   9 | Command/Search/Quick Create    | DOAR FRONTEND            | dispatcher UI; trebuie să reutilizeze comenzile domeniilor    |
|  10 | Notifications                  | TREBUIE CONSTRUIT        | drawer local; fără store/fan-out/preferences server-side      |
|  11 | Activity/Audit                 | CONFLICT DE CONTRACT     | feed demo confundă activity projection cu audit imuabil       |
|  12 | Workspace                      | TREBUIE CONSTRUIT        | selector demo; tenant boundary absent                         |
|  13 | Team                           | DOAR MOCK                | membri seed; roluri fără enforcement                          |
|  14 | Settings/Billing               | CONFLICT DE CONTRACT     | setări locale și billing toast; ownership/plan nedefinit      |
|  15 | Budget                         | CONFLICT DE CONTRACT     | agregate redundante și bani fără minor units                  |
|  16 | Expenses                       | CONFLICT DE CONTRACT     | vendor prin nume și valori/paid redundante                    |
|  17 | Payments                       | CONFLICT DE CONTRACT     | `due-soon/overdue` stocat, nu derivat                         |
|  18 | Guest CRM                      | CONFLICT DE CONTRACT     | 24 rows vs statistici pentru 160; PII fără scope              |
|  19 | Households & Import            | CONFLICT DE CONTRACT     | import simulat; cardinalitate/dedupe neimplementate           |
|  20 | Invitation Site                | DOAR MOCK                | versiuni/publicare/QR simulate                                |
|  21 | Invitation Editor              | DOAR MOCK                | document și undo/redo numai local                             |
|  22 | Communication Campaigns        | CONFLICT DE CONTRACT     | statusurile frontend nu acoperă failure/bounce/webhooks       |
|  23 | RSVP                           | CONFLICT DE CONTRACT     | deadline-uri și person-vs-household nealiniate                |
|  24 | Seating                        | DOAR MOCK                | canvas/assignments fără tranzacții și versionare server       |
|  25 | Menus & Allergies              | CONFLICT DE CONTRACT     | enum `copii` vs `children`; allergy workflow necanonic        |
|  26 | Transport                      | DOAR MOCK                | rute/capacități și notificări simulate                        |
|  27 | Accommodation                  | DOAR MOCK                | proprietăți/rooming list locale                               |
|  28 | Marketplace                    | DOAR MOCK                | catalog seed; sursa/moderarea/ranking nedefinite              |
|  29 | Vendor Profiles                | DOAR MOCK                | profil/package/portfolio fără tenant vendor/storage           |
|  30 | Favorites                      | DOAR MOCK                | colecții și undo locale                                       |
|  31 | Shortlists                     | DOAR MOCK                | voturi/comentarii/decizie locale                              |
|  32 | RFQ                            | DOAR MOCK                | draft/send/recipients fără delivery contract                  |
|  33 | Offers                         | DOAR MOCK                | revizii și decizii fără state machine                         |
|  34 | Offer Comparison & Negotiation | DOAR MOCK                | comparație/mesaje fără revisions canonice                     |
|  35 | Bookings                       | CONFLICT DE CONTRACT     | UI permite tranziții arbitrare ale stage-ului                 |
|  36 | Vendor Business OS             | DOAR MOCK                | portal static/local; tenant vendor absent                     |
|  37 | Contracts                      | CONFLICT DE CONTRACT     | `signed:boolean`, fără versiuni/obligații/signature lifecycle |
|  38 | Documents                      | DOAR MOCK                | foldere/fișiere toast; fără storage/ACL/scan                  |
|  39 | Design Studio                  | DOAR MOCK                | concepte/briefuri și AI simulate                              |
|  40 | Moodboards                     | DOAR MOCK                | items/revisions/assets locale                                 |
|  41 | Risks                          | DOAR MOCK                | register/Plan B local; fără audit/evente                      |
|  42 | Plan B                         | TREBUIE CONSTRUIT        | activarea cross-module/realtime nu există                     |
|  43 | Wedding Day Command Center     | TREBUIE CONSTRUIT        | realtime/offline/jobs/incident sync absente                   |
|  44 | Wedding Moments                | DOAR MOCK                | cues/export/distribution simulate                             |
|  45 | Calculators                    | DOAR FRONTEND            | formule deterministe funcționale; persistența este opțională  |
|  46 | Post-Wedding                   | DOAR MOCK                | closure/thanks/returns numai state local                      |
|  47 | Reviews                        | DOAR MOCK                | draft/publish local; verification/moderation absente          |
|  48 | Archive                        | TREBUIE CONSTRUIT        | snapshot/checksum/export/restore absente                      |
|  49 | Guest Companion                | CONFLICT DE CONTRACT     | invitat hardcodat; fără token/household scope                 |
|  50 | Admin Backoffice               | TREBUIE CONSTRUIT        | controale locale; fără admin plane/MFA/dual approval          |

### Surse canonice de adevăr

| Domeniu                 | Sursa canonică recomandată                                                                 | Proiecții/consumatori; ce nu este sursă                                        |
| ----------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Guests                  | `Household`, `Guest`                                                                       | guest counts/CRM rows sunt query projections; `guestStats` seed nu este adevăr |
| RSVP                    | `RsvpFormDefinition`, `RsvpSubmission`, `RsvpAnswer`                                       | `Guest.rsvp` devine proiecție, nu al doilea câmp mutabil                       |
| Invitations             | `InvitationSite`, `InvitationVersion`; delivery prin `CampaignRecipient`/`DeliveryAttempt` | invitation status per guest este derivat din delivery + grant                  |
| Menus                   | `Menu`, `MenuCourse`, `GuestMenuSelection`                                                 | totalurile per meniu/masă sunt derivate                                        |
| Seating                 | `SeatingPlanVersion`, `SeatTable`, `SeatAssignment`                                        | conflict/occupancy sunt read models                                            |
| Transport               | `TransportRoute`, `PickupStop`, `PassengerAssignment`                                      | capacity/unassigned/manifest sunt proiecții/exporturi                          |
| Accommodation           | `AccommodationProperty`, `RoomBlock`, `Room`, `StayAssignment`                             | capacity/rooming list sunt proiecții                                           |
| Vendors                 | `VendorOrganization`, `VendorProfile`, `VendorAvailability`                                | marketplace index/rating sunt proiecții public-safe                            |
| RFQ                     | `RFQ`, `RFQRecipient`                                                                      | reply counts/delivery badges sunt derivate                                     |
| Offers                  | `Offer`, immutable `OfferRevision`/`OfferLineItem`                                         | comparison matrix este read model                                              |
| Bookings                | `Booking` + transition history/domain events                                               | pipeline cards/calendar sunt proiecții                                         |
| Contracts               | `Contract`, immutable `ContractVersion`, reviewed obligations                              | extracted/risk AI output rămâne proposal până la aprobare                      |
| Payments                | `PaymentSchedule`, immutable `PaymentTransaction`                                          | paid/balance/due-soon/overdue se derivează                                     |
| Tasks                   | `Task` aggregate cu subtasks/dependencies/comments/file links                              | Overview/Calendar/Timeline nu scriu copii de task                              |
| Calendar                | `CalendarEvent` pentru evenimente native; domain resource pentru cele proiectate           | task/payment/contract/RSVP events nu se editează independent                   |
| Timeline                | `TimelinePhase`, `TimelineMilestone`, dependency graph                                     | delayed/critical path/progress sunt calculate                                  |
| Risks                   | `Risk`, `RiskMitigation`, `PlanB`                                                          | matrix score/readiness sunt calculate                                          |
| Wedding Day             | `RunSheet`, `RunSheetItem`, `Incident`                                                     | now/next/health/offline pack sunt proiecții/snapshoturi                        |
| Media                   | `FileAsset`, immutable `FileVersion`, domain file links                                    | preview/transcode/OCR/index sunt rezultate de job                              |
| Reviews                 | `Review`, `ReviewModeration`, completed `Booking` eligibility                              | marketplace rating este proiecție                                              |
| Overview                | niciun aggregate propriu                                                                   | read model peste domeniile canonice                                            |
| Notifications           | `Notification` + shared `DeliveryAttempt`                                                  | unread count este proiecție per user                                           |
| Activity feed           | proiecție redată din `DomainEvent` și `AuditEvent` redacționat                             | nu este tabel canonic editabil                                                 |
| Analytics/Admin metrics | proiecții/materialized views                                                               | nu dublează tranzacțiile de domeniu                                            |

### Registre de implementare rezultate

- `docs/FRONTEND_INVENTORY.json`: toate cele 585 declarații de control, locația, comportamentul actual și mapping către contractul backend comun.
- `docs/API_OPERATION_REGISTRY.json`: 232 operații metodă+ruta explicite; fiecare include request/response, permisiuni, validări, erori, idempotency, concurrency, audit, events, jobs și coverage actual.
- `docs/BACKEND_ENTITY_CATALOG.json`: 158 candidați analizați, 15 consolidări și 143 de modele persistente normalizate.
- `docs/AUTOMATION_REGISTRY.json`: cele 40 automatizări cu producer/consumers, efecte sync/async, retry și failure handling.
- `docs/PERMISSION_MATRIX.csv`: 50 de module, roluri/capabilities și clasificarea reconciliată.

## 2. Inventarul complet al rutelor

### Legendă roluri și status

- `O` Couple Owner; `P` Couple Partner; `WP` Wedding Planner; `F` Family/Collaborator; `V` Viewer.
- `G` Guest; `VO` Vendor Owner; `VT` Vendor Team; `PA` Platform Admin; `SA` Support Agent; `M` Moderator.
- Status actual: `local` = mutație în memorie; `toast` = simulare; `browser` = efect real doar în browser; `static` = doar afișare; nicio rută nu are backend real.

### 2.1 Couple Wedding OS — 35 rute

| Rută / componentă                            | Scop, date și stări                                                                    | Acțiuni și formulare vizibile                                                                                                          | Acces recomandat                        | Backend necesar                                                          | Actual                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| `/overview` `OverviewPage`                   | health summary, next-best-action, tasks, budget, RSVP, vendors, dates, risks, activity | start flow, dismiss, complete/postpone/archive task, quick task/expense/guest/event, reminder, Plan B, module links, AI                | O,P,WP,F,V cu redacții                  | composite dashboard query; recommendation preferences; domain commands   | static + local + toast            |
| `/plan` `PlanPage`                           | task list/board/calendar; priority/status/category/owner/deadline                      | create, import template, export, AI generation, filter/sort/view, status DnD, duplicate, assign, postpone, block, archive, delete      | O,P,WP; F limitat; V read               | Task aggregate, templates, comments/files/dependencies, exports          | local + toast                     |
| `/calendar` `CalendarPage`                   | month/week/agenda; task/payment/vendor/contract/guest events                           | create, filter types, navigate dates, today, sync, iCal, open event                                                                    | O,P,WP,F; V read                        | CalendarEvent + derived event projections + external sync                | local + toast/browser download    |
| `/timeline` `TimelinePage`                   | phases, milestones, progress, critical/delayed flags                                   | complete/reopen, collapse, dependencies, add, recalc, AI review, export                                                                | O,P,WP; F limited; V read               | milestone graph, dependencies, critical path job                         | local + toast                     |
| `/guests` `GuestsPage`                       | household/guest CRM, contact, invitation, RSVP, menu, allergy, logistics, table        | search/filter, select/bulk, import/export, invite/remind/message, CRUD guest, plus-one, table, archive/delete                          | O,P,WP; F configurable; V redacted      | guest/household CRUD, bulk commands, import preview/commit, PII controls | local + toast                     |
| `/invitations` `InvitationsPage`             | invitation site status and communication campaigns                                     | copy link, QR kit, settings, preview/editor, new campaign, report, duplicate, pause, retry, export, guest preview                      | O,P,WP; F comment/read                  | invitation publishing, campaign state/delivery analytics                 | static + toast                    |
| `/invitations/editor` `InvitationEditorPage` | section-based invitation editor, templates, preview devices                            | reorder/show/duplicate/delete section, undo/redo, template, AI copy, save draft, publish                                               | O,P,WP                                  | versioned document, draft/publish, preview, domain/QR                    | local + toast                     |
| `/rsvp` `RsvpPage`                           | RSVP funnel, person table, events counts, response feed                                | form configuration, guest preview, export, deadline, schedule reminder                                                                 | O,P,WP; F read                          | form definition, submissions, deadline policy, reminder job              | static + toast                    |
| `/seating` `SeatingPage`                     | canvas, tables, zones, assignments, conflicts, menu counts                             | assign/unassign, auto-arrange, undo/redo, save/version, PDF, add/edit/lock/duplicate/delete table, AI resolve                          | O,P,WP; F configurable                  | seating plan/version/constraints and transactional assignments           | local + toast                     |
| `/menus` `MenusPage`                         | menu catalog, selections, allergies, table/status                                      | import RSVP, export venue, reminder, create/edit/duplicate menu, per-guest review                                                      | O,P,WP; F limited                       | menus, dietary tags, guest selections, allergy issues                    | static + toast                    |
| `/transport` `TransportPage`                 | routes, vehicles, capacity, passengers, driver/status                                  | assign, optimize, send details, export, CRUD route/vehicle, passengers, confirm                                                        | O,P,WP                                  | route/stops/vehicle/passenger assignment + notifications                 | static + toast                    |
| `/accommodation` `AccommodationPage`         | properties, rooms, blocks, capacity, costs, contacts                                   | assign, import reservations, send details, export rooming list, CRUD property/rooms, call                                              | O,P,WP                                  | property/room/block/stay assignment/import/export                        | static + toast + `tel:`           |
| `/marketplace` `MarketplacePage`             | searchable vendor catalog, list/map, filters, compare/favorite                         | categories/filters, saved/RFQ links, favorite, compare max 3, message, profile, quote request                                          | O,P,WP,F,V read                         | public vendor index, availability, favorites, comparison, RFQ            | local + toast                     |
| `/marketplace/[id]` `VendorDetailPage`       | profile, packages, portfolio, reviews, FAQ, availability/contact                       | choose package, portfolio, favorite, quote, consultation, message, compare, call                                                       | O,P,WP,F,V read                         | vendor detail, packages/media/reviews, availability, consultation/RFQ    | static + toast + `tel:`           |
| `/favorites` `FavoritesPage`                 | saved vendors grouped in collections                                                   | create collection, select/compare, move, RFQ, profile, remove/undo                                                                     | O,P,WP,F                                | collections/favorites with collaborative updates                         | local + toast                     |
| `/shortlists` `ShortlistsPage`               | candidates, rank, votes, comments, comparison matrix                                   | vote, comment, RFQ, remove, clarify, AI compare, select final                                                                          | O,P,WP; F vote/comment; V read          | shortlist/candidate/vote/comment/decision transaction                    | local + toast                     |
| `/requests` `RequestsPage`                   | RFQ drafts/active/closed, recipients, replies/deadline                                 | create, AI brief, preview, save draft, send, view offer, remind, duplicate, close/archive                                              | O,P,WP                                  | RFQ/version/recipient/delivery/reply workflow                            | local + toast                     |
| `/offers` `OffersPage`                       | normalized offers, statuses, details, highlights/concerns                              | filter status, compare, AI analyze, clarify, negotiate, PDF/message, accept/decline                                                    | O,P,WP; F comment/read                  | offers/revisions/line items/clarifications and accept transaction        | local + toast                     |
| `/bookings` `BookingsPage`                   | vendor pipeline/list/calendar and next actions                                         | create, DnD stage, move stage, upload contract, add payment, message                                                                   | O,P,WP                                  | booking aggregate with guarded transitions and domain links              | local + toast                     |
| `/budget` `BudgetPage`                       | summary, categories, expenses, payments, cashflow, scenarios                           | import/export, AI forecast/reduce, add/edit category/expense/payment, mark paid, receipt, reschedule, scenario apply/duplicate/compare | O,P; WP if granted; F/V redacted        | budget allocations, expenses, payment transactions, scenarios            | local + toast                     |
| `/payments` `PaymentsPage`                   | due/overdue/upcoming/paid schedule and totals                                          | filter, export, create/record, mark paid, reference, receipt                                                                           | O,P; WP financial grant                 | payment schedule/transaction/receipt, derived status                     | local + toast                     |
| `/contracts` `ContractsPage`                 | contracts, signature, obligations, next payment, AI risk                               | folder/export, upload/analyze, download/version/share/delete, mark externally signed, create task/payment                              | O,P; WP grant                           | contract versions, extraction, obligations, risks, share links           | local + toast                     |
| `/documents` `DocumentsPage`                 | folders/files/search/metadata                                                          | folder, upload, preview, download, share, move, trash 30d                                                                              | O,P,WP; F ACL; V limited                | private object storage, versions, search, preview, trash                 | local + toast                     |
| `/design-studio` `DesignStudioPage`          | concept, palette, boards, budget impact, vendor briefs                                 | upload inspiration, compare/generate/apply concept, copy color, moodboard, edit/send brief                                             | O,P,WP; F vote/comment                  | design concepts/versions/palettes/briefs and AI jobs                     | static + toast + clipboard        |
| `/moodboards` `MoodboardsPage`               | boards and mixed image/text/color/link/vendor items                                    | open/create board, add/edit/delete item, filter, undo/redo, share, export, AI image                                                    | O,P,WP,F                                | moodboard revision model, assets, share/export/generation                | local + toast                     |
| `/risks` `RisksPage`                         | risk register/matrix, score, mitigation/Plan B                                         | create/edit/assign/mitigate/backup/task/resolve/export, AI assessment                                                                  | O,P,WP; F report/comment                | risk/mitigation/trigger/contingency workflow                             | local + toast                     |
| `/wedding-day` `WeddingDayPage`              | live run sheet, people, payments, incidents, Plan B, offline docs                      | start/finish/delay item, directions/calls, pay, resolve/report incident, activate Plan B, open docs                                    | O,P,WP; F by assignment                 | realtime/offline run sheet, incidents, escalation, snapshot pack         | local + toast + `tel:`            |
| `/moments` `MomentsPage`                     | photo/video/audio cues and readiness                                                   | add/edit, mark ready, filter, distribute/export team sheet                                                                             | O,P,WP; vendor recipients read/ack      | moments/capture requirements/distribution snapshot                       | local + toast                     |
| `/tools` `ToolsPage`                         | drinks calculator, contingency reserve, shortcuts                                      | change inputs, copy estimate, navigate                                                                                                 | all workspace members                   | no persistence required; optional save result/version                    | browser calculation/clipboard     |
| `/post-wedding` `PostWeddingPage`            | closure tasks, returns, refunds, thanks, close workspace                               | toggle tasks, prepare/send thanks, manage returns, close event, prepare capsule                                                        | O; P/WP scoped                          | closure workflow, batches, refunds, archive job                          | local + toast                     |
| `/reviews` `ReviewsPage`                     | pending/draft/published vendor reviews and private note                                | filter, rate, draft, publish                                                                                                           | O,P; WP private operational note only   | verified-booking review, moderation, rating projection                   | local + toast                     |
| `/archive` `ArchivePage`                     | memories/documents/people snapshot                                                     | filter/search, export, download, restore workspace                                                                                     | O; P read/export                        | immutable snapshot, export/restore jobs, retention                       | static + local + toast            |
| `/team` `TeamPage`                           | members, roles, invite status, last activity                                           | invite, role change, resend/revoke, remove with retained history                                                                       | O; P limited; WP no ownership admin     | memberships, capabilities, token invitations, immediate revocation       | local + toast                     |
| `/activity` `ActivityPage`                   | workspace activity grouped by day                                                      | search/filter actor/module, reset, CSV export, deep link                                                                               | O,P,WP,F,V by visibility                | cursor activity feed + export job; distinct audit store                  | static + browser export           |
| `/settings` `SettingsPage`                   | profile/workspace, notifications, billing, appearance, security/privacy                | save profile/preferences, delete workspace, subscription/card/invoices, theme/density, MFA/password/sessions/export/access log         | own profile; O workspace/billing/delete | profile, settings, notification prefs, billing, sessions, GDPR jobs      | local + toast; theme localStorage |

### 2.2 Authentication — 10 rute

| Rută               | Scop și acțiuni                                                                 | Actor                      | Backend necesar                                            | Actual                      |
| ------------------ | ------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------- | --------------------------- |
| `/sign-in`         | email/password, show password, remember, forgot, magic link, Google/Apple, demo | public                     | login, rate limit, session cookie, OAuth state             | local validation + redirect |
| `/create-account`  | first/last/email/password/confirm, terms                                        | public                     | user creation, password hashing, email verification        | local validation + redirect |
| `/forgot-password` | email, request reset, link to code/sign-in                                      | public                     | anti-enumeration reset request and email job               | timeout simulation          |
| `/reset-password`  | new password/confirm                                                            | reset-token holder         | one-time hashed token, password policy, session revocation | timeout simulation          |
| `/verify-email`    | confirm, resend, change email                                                   | pending user               | verify token; resend cooldown                              | local/toast                 |
| `/magic-link`      | informational state, demo, back                                                 | public/token holder        | request/exchange one-time token                            | static                      |
| `/invitation`      | team invite details, accept/decline                                             | invited email              | invitation token state and atomic membership creation      | local redirect              |
| `/expired-link`    | request new link or reset password                                              | public                     | token-type-aware renewal                                   | static navigation           |
| `/session-expired` | reconnect/back                                                                  | expired user               | revocation reason and reauthentication                     | static navigation           |
| `/access-denied`   | explain denied access/change account/back                                       | authenticated/unauthorized | capability error with safe resource metadata               | static navigation           |

### 2.3 Onboarding, portals și root — 5 rute

| Rută          | Suprafață/scop       | Acțiuni/formulare                                                                                               | Acces                 | Backend necesar                                                       | Actual                 |
| ------------- | -------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------- | ---------------------- |
| `/`           | root                 | redirect/entry                                                                                                  | public                | route policy based on session                                         | static routing         |
| `/onboarding` | 8-step wedding setup | save/exit, couple, events, location, guest estimates, budget, style/uploads, progress, AI preferences, generate | new O/P               | draft + validation + idempotent generation job/progress               | local + timers         |
| `/guest`      | Guest Companion      | RSVP attendance/menu/allergies/transport/accommodation, calendar, directions, FAQ                               | G token               | guest bootstrap and versioned household response                      | local + toast          |
| `/vendor`     | Vendor Business OS   | request pipeline/search/views, proposal, deliverables, calendar, invoices/export                                | VO,VT                 | vendor tenant dashboard/RFQ/proposal/booking/deliverable/invoice APIs | static + local + toast |
| `/admin`      | Admin Backoffice     | platform metrics, vendor review, incidents, maintenance, cache/test notifications/global session revoke         | PA,SA,M by capability | separate admin API, MFA/step-up, dual approval, audit                 | local + toast          |

### 2.4 Shared shell action inventory

| Component             | Acțiuni expuse                                                                                                   | Condiții și backend                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Topbar`              | open mobile menu, global search/palette, Copilot, notifications, quick-create, user menu                         | unread count/bootstrap; capabilities hide disallowed quick creates         |
| `AppSidebar`          | switch/create/manage wedding, module navigation, upgrade, help, theme, settings, logout                          | workspace list/current membership/subscription; logout revokes session     |
| `CommandPalette`      | all navigation; task/guest/expense/RFQ/event create; AI; settings; switch wedding; invite; day mode              | `/search` only returns authorized resources; actions call domain endpoints |
| `QuickCreate`         | task, guest, expense, payment, vendor, RFQ, contract, event, risk, campaign                                      | ten separate domain commands; no generic `/quick-create`                   |
| `NotificationsDrawer` | filter, open/deep-link, mark one/all read, delete, settings                                                      | notification store per user, cursor pagination, read/dismiss timestamps    |
| `AICopilot`           | chat, attach, contextual suggestions, proposal approve/edit/reject/details, clear, fullscreen, voice placeholder | tool gateway; approval reauthorizes and checks versions; voice is absent   |
| `TaskDrawer`          | complete/reopen, AI, duplicate/delete, edit/assign/reschedule/dependency, comments, download/upload              | task aggregate + comments/files; delete confirm; concurrency required      |
| `TaskModal`           | create, create-and-add, template, subtasks                                                                       | validated create/template commands, idempotency                            |

### 2.5 Reconcilierea exactă a rutelor

Totalul 50 este: 35 Couple OS + 10 Authentication + `/onboarding` + `/guest` + `/vendor` + `/admin` + root `/`. `/settings` este deja una dintre cele 35 de rute Couple OS. Nu există o rută separată `/profile`; profilul utilizatorului este tab/flow în `/settings`, deci adăugarea unei pagini noi ar schimba frontendul și nu este presupusă de audit. Nu au rămas fișiere `page.tsx` neclasificate, iar `scripts/smoke.mjs` enumeră aceleași 50 de URL-uri concrete, folosind `/marketplace/v-1` pentru ruta dinamică `/marketplace/[id]`.

## 3. Inventarul funcțional — 50 module

În tabelele următoare, „create/edit/delete/archive/publish/send/approve/reject/import/export/filter/sort/bulk/AI” este enumerat explicit; o celulă „—” înseamnă că UI-ul nu oferă acțiunea.

### 3.1 Fundație, shell și planificare

|   # | Modul                       | Vede / filtrează / sortează                                                | Creează / editează / șterge / arhivează                                        | Trimite / publică / aprobă / importă / exportă / bulk / AI        | Relații și automatizări                                                |
| --: | --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
|   1 | Authentication              | login/account/token states                                                 | create account; change/reset password; sessions                                | verify/resend email; magic link; OAuth buttons                    | creates User/Session; security notifications                           |
|   2 | Onboarding                  | 8-step progress and generation progress                                    | create/update draft; add/remove sub-events; choose style/priorities            | save/exit; upload inspiration; generate plan                      | creates Workspace, events, tasks, budget, timeline, recommendations    |
|   3 | Overview                    | aggregated health cards and recent activity                                | complete/postpone/archive task; dismiss recommendation; quick create           | reminder; AI explain/action; module navigation                    | projection over every core domain; never owns domain values            |
|   4 | AI Copilot                  | contextual chat and proposal previews                                      | edit/reject/delete conversation; create proposal                               | approve multi-domain actions; attach; streaming                   | reads authorized context; command gateway emits audit/domain events    |
|   5 | Planning                    | list/board/calendar; filters category/status; sort deadline/priority/title | create/duplicate/update/delete/archive task                                    | template import; CSV export; bulk status via board; AI generation | task deadlines feed calendar/timeline/dashboard/notifications          |
|   6 | Tasks                       | details, owner, status, dependencies, comments/files/activity              | task/subtask/comment/dependency/file; edit/reassign/reschedule; delete/archive | complete/reopen; download/upload; AI task context                 | linked vendor/contract/payment; dependency cycle validation            |
|   7 | Calendar                    | month/week/agenda; type filters                                            | create/update/delete/reschedule own events                                     | iCal export; external sync                                        | source-linked task/payment/contract/RSVP events are projections        |
|   8 | Timeline                    | phases, milestones, critical/delayed flags                                 | add/complete/reopen milestone; edit dependency                                 | recalc; PDF export; AI review                                     | graph changes when wedding date/task/milestone dependencies change     |
|   9 | Command/Search/Quick Create | authorized nav/actions/global results                                      | ten create flows                                                               | AI fallback for unmatched query                                   | routes every mutation to its domain contract                           |
|  10 | Notifications               | module/read filters, unread count                                          | read/unread, dismiss                                                           | mark-all; deep-link; preferences                                  | produced from domain events; delivery dedupe/preferences/quiet hours   |
|  11 | Activity/Audit              | filter/search actor/module/date                                            | no user edit                                                                   | CSV export                                                        | readable ActivityEvent separate from immutable AuditEvent              |
|  12 | Workspace                   | current and alternate weddings                                             | create/edit/archive/restore/delete workspace                                   | switch; export                                                    | tenant boundary for all Couple OS data                                 |
|  13 | Team                        | members, roles, invite/last-active                                         | invite/change role/remove/revoke/resend                                        | accept/decline invite                                             | capability recalculation; immediate session/resource access revocation |
|  14 | Settings/Billing            | general, notifications, subscription/invoices, appearance, security        | profile/workspace/preferences/MFA/session; delete workspace                    | invoice/download; account export                                  | payment provider source of truth; GDPR/delete jobs                     |

### 3.2 Finanțe, invitați și logistică

|   # | Modul                   | Vede / filtrează / sortează                                           | Creează / editează / șterge / arhivează                              | Trimite / publică / aprobă / importă / exportă / bulk / AI   | Relații și automatizări                                                        |
| --: | ----------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
|  15 | Budget                  | totals, allocation, cashflow, scenarios                               | category/scenario/allocation                                         | import/export; compare/apply scenario; AI forecast/reduction | totals derived from expenses/transactions/contracts                            |
|  16 | Expenses                | category/vendor/estimated/contracted/paid/due/status                  | create/edit/archive expense                                          | receipt/link contract                                        | expense updates category and dashboard atomically                              |
|  17 | Payments                | due states, method, amounts, receipts                                 | schedule/reschedule/record payment                                   | mark partial/full paid; export                               | due status derived; updates expense/booking/calendar/notification              |
|  18 | Guest CRM               | search/filter/row selection; contact/invite/RSVP/menu/logistics/table | guest CRUD, plus-one, notes, household move, archive/delete          | invite/remind/message; bulk; CSV/XLSX import/export          | household/RSVP/menu/seating/transport/accommodation projections                |
|  19 | Households & Import     | household membership/language/city; import preview/duplicates         | household and import mappings                                        | template download; preview/commit import                     | normalized contacts, dedupe, row-level errors, idempotent commit               |
|  20 | Invitation Site         | live/draft state, public link/settings/preview                        | edit settings/version                                                | publish/unpublish; QR kit                                    | immutable published version; guest token binds recipient                       |
|  21 | Invitation Editor       | sections/templates/device previews                                    | add/reorder/show/hide/duplicate/delete sections; undo/redo           | save draft; publish; AI copy                                 | versioned structured document and asset references                             |
|  22 | Communication Campaigns | channel, recipients, status, sent date, open rate/report              | create/draft/duplicate/pause/archive                                 | schedule/send/retry failed/export report                     | recipients snapshot; delivery attempts/webhooks update guest invitation status |
|  23 | RSVP                    | funnel, person/event tables, feed                                     | form definition, deadline, admin override                            | reminder/export                                              | submission per person/event; decline invalidates downstream allocations        |
|  24 | Seating                 | unseated/seated/conflicts/canvas/menu counts                          | plans/versions/tables/zones/assignments/notes; delete/lock/duplicate | auto-arrange; PDF; AI resolve                                | confirmed guest only; capacity and one-table constraints                       |
|  25 | Menus & Allergies       | menu catalog, per-guest status/allergy/table                          | menu/course/tag/selection/allergy issue                              | import RSVP; reminders; caterer export                       | only participating guests; unresolved allergy escalation                       |
|  26 | Transport               | routes/vehicles/capacity/passengers/status                            | route/stops/vehicle/operator/assignment                              | optimize; confirm; send details; export manifests            | eligibility from RSVP/need; changed route triggers re-notification             |
|  27 | Accommodation           | property/room/block/capacity/cost/contact                             | property/room/block/stay assignment                                  | reservations import; send details; rooming-list export       | eligibility from RSVP/need; overbooking alert; expense link                    |

### 3.3 Furnizori și procurement

|   # | Modul                          | Vede / filtrează / sortează                                      | Creează / editează / șterge / arhivează             | Trimite / publică / aprobă / importă / exportă / bulk / AI | Relații și automatizări                                                     |
| --: | ------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
|  28 | Marketplace                    | category/location/date/verified/rating/response/budget; list/map | —                                                   | message/consultation/RFQ; compare                          | published verified VendorProfile + availability search                      |
|  29 | Vendor Profiles                | profile/packages/portfolio/reviews/FAQ/contact                   | vendor edits own draft; admin moderation            | submit/publish/suspend                                     | vendor org, verification, availability, media, review aggregate             |
|  30 | Favorites                      | collection/vendor filters                                        | collection CRUD; add/move/remove favorite with undo | bulk compare/RFQ                                           | private collaborative workspace data; invisible to vendor                   |
|  31 | Shortlists                     | candidates/rank/criteria/votes/comments                          | list/candidate/vote/comment/remove                  | clarify/RFQ/select; AI compare                             | final decision accepts chosen offer and closes alternatives transactionally |
|  32 | RFQ                            | draft/active/closed, recipient count, replies/deadline           | draft/version/recipient; duplicate/close/archive    | preview/send/remind; AI brief                              | delivery to vendor portal; responses create Offer                           |
|  33 | Offers                         | status filters and normalized detail                             | vendor revision; couple status/clarifications       | negotiate/accept/decline/download/message; AI analysis     | acceptance creates booking/contract draft/payment task                      |
|  34 | Offer Comparison & Negotiation | line-by-line costs/tax/terms/concerns                            | negotiation rounds/notes                            | clarification/counter-offer/decision; AI recommendation    | immutable offer revisions; expiry and decision audit                        |
|  35 | Bookings                       | pipeline/list/calendar, owner/next action/deadline               | create/update/move guarded stage/cancel             | contract/payment/message                                   | stage auto-advances on contract/deposit, not arbitrary patch                |
|  36 | Vendor Business OS             | vendor dashboard, RFQ pipeline, calendar, deliverables, invoices | proposal/booking/deliverable                        | send proposal; export finance                              | vendor tenant sees only explicitly shared couple data                       |

### 3.4 Documente, creativ, operațiuni și închidere

|   # | Modul                      | Vede / filtrează / sortează                          | Creează / editează / șterge / arhivează               | Trimite / publică / aprobă / importă / exportă / bulk / AI     | Relații și automatizări                                                 |
| --: | -------------------------- | ---------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
|  37 | Contracts                  | signature/obligations/payments/risk/versions         | upload/version/mark external signed/trash             | download/share/export; AI extract/analyze; create task/payment | linked booking/vendor/files/obligations/payments/risks                  |
|  38 | Documents                  | folder/search/file metadata                          | folder/upload/move/version/trash/restore              | preview/download/share                                         | object storage scan/OCR/index; 30-day purge job                         |
|  39 | Design Studio              | concept/palette/boards/briefs/budget impact          | concepts/variants/palette/brief                       | apply/approve/send brief; AI multimodal generation             | linked moodboard/vendor/RFQ/budget                                      |
|  40 | Moodboards                 | boards/items/categories/properties                   | board/item/revision; undo/redo/delete/archive         | share/export; AI image                                         | asset storage, expiring public view, vendor links                       |
|  41 | Risks                      | register/matrix/score/status/owner/plan              | risk/mitigation/backup/trigger; assign/resolve/reopen | export; create task; AI assess                                 | contract/budget/vendor/weather/task signals create/update risks         |
|  42 | Plan B                     | contingency details/readiness                        | create/edit/approve/activate/deactivate               | notify impacted team                                           | linked Risk/RunSheet; activation requires confirmation and audit        |
|  43 | Wedding Day Command Center | now/next/timeline/people/payments/incidents/docs     | run item status, incident/update/payment              | call/directions/escalate/activate Plan B                       | realtime + offline queue; delay propagation and push/SMS                |
|  44 | Wedding Moments            | moment/cues/lead/capture/readiness                   | add/edit/mark ready/complete                          | distribute/export team sheet                                   | links run sheet + vendor acknowledgement/capture requirements           |
|  45 | Calculators                | drinks/reserve values                                | local inputs; optional saved calculation              | copy                                                           | deterministic frontend logic; no mandatory backend                      |
|  46 | Post-Wedding               | closure progress/returns/refunds/thanks              | task/return/refund/thank-you batch                    | send thanks; close workspace                                   | cannot close before mandatory blockers or explicit override             |
|  47 | Reviews                    | pending/draft/published, rating/private note         | draft/edit/publish/report/hide                        | notify vendor/moderate                                         | only completed booking; private note never exposed to vendor            |
|  48 | Archive                    | memories/documents/people snapshot                   | build/restore; no mutation while archived             | export/download                                                | immutable checksummed snapshot and cold-storage restore job             |
|  49 | Guest Companion            | invitation/schedule/locations/FAQ/current response   | update own/household RSVP fields                      | calendar/directions                                            | opaque scoped token; no internal notes/list/financial data              |
|  50 | Admin Backoffice           | metrics, health, vendor queue, incidents, compliance | vendor decision/incident/control request              | maintenance/cache/test notifications/global revoke             | separate capability model; MFA, step-up, dual approval, immutable audit |

## 4. Butoane și acțiuni

### 4.1 Metodologie și clasificare

Cele 585 declarații acționabile sunt inventariate individual în `docs/FRONTEND_INVENTORY.json`. Ele includ 404 `Button`, 93 elemente `button`, 66 `DropdownItem` și 22 `Link` în codul de produs și controalele comune de temă. Duplicatele UI sunt păstrate ca evidență, dar mappingul `backendOperationId` le consolidează pe aceeași comandă de domeniu.

Clasificare actuală:

- `navigation`: schimbă ruta/drawer/tab; nu necesită mutație;
- `browser`: clipboard, Blob download, `tel:`, theme localStorage;
- `local`: schimbă array/state local;
- `toast`: declară succes fără schimbare persistentă;
- `placeholder`: control vizibil fără colectarea datelor necesare;
- `external-required`: email/WhatsApp/SMS/push/maps/calendar/billing/e-sign/OCR/AI;
- `destructive`: delete/remove/archive/revoke/close/global session invalidation;
- `async`: import/export/campaign/file/OCR/AI/archive/sync.

### 4.2 Contract pentru acțiunile importante

| Etichetă/context                    | Condiție / rol                               | Efect frontend actual       | Efect final, date și validări                                                         | Endpoint recomandat                                                                                           | Side effects / notificare / audit                                                           |
| ----------------------------------- | -------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Marchează ca finalizată` task      | task incomplet; assignee sau task.write      | local                       | `transition=complete`, completed_at/by, expected version; dependency policy           | `PLAN.TASK_TRANSITION` — `POST /v1/workspaces/:workspaceId/tasks/:taskId/transitions`                         | activity; notify followers; recalc dashboard/timeline                                       |
| `Amână o săptămână`                 | task activ; task.write                       | toast/local în unele locuri | `transition=postpone`, due_at +7 local calendar days; reason optional; version        | aceeași `PLAN.TASK_TRANSITION`                                                                                | calendar/reminder rewrite; audit                                                            |
| `Șterge sarcina`                    | O/P/WP; confirm                              | local remove                | soft delete unless draft; deny if protected dependency or detach explicitly           | `PLAN.TASK_DELETE` — `DELETE /v1/workspaces/:workspaceId/tasks/:taskId`                                       | undo window; dependent-task warnings                                                        |
| `Trimite invitația` / bulk          | contacts valid; campaign.send                | toast                       | `transition=send`, recipient snapshot, channel/template, consent, dedupe, idempotency | `CAMPAIGN.TRANSITION` — `POST /v1/workspaces/:workspaceId/campaigns/:campaignId/transitions`                  | queue delivery; delivery webhooks; activity                                                 |
| `Publică invitația`                 | site.publish                                 | toast/local dirty reset     | immutable version, slug/domain validation, asset readiness                            | `INVITATION.PUBLISH` — `POST /v1/workspaces/:workspaceId/invitation-site/publish`                             | cache/CDN invalidate; activity; optional guest notification                                 |
| `Confirmă răspunsul` Guest          | valid scoped guest token                     | local                       | per-person/event attendance, menu, needs, notes, version                              | `GUEST.RSVP_UPDATE` — `PUT /v1/guest/rsvp`                                                                    | seating/logistics cleanup; couple notification                                              |
| `Aranjare automată`                 | seating.write                                | local hardcoded grouping    | proposal respecting capacity/household/conflicts; explicit apply                      | `LOGISTICS.SEATING_AUTO_ARRANGE` — `POST /v1/workspaces/:workspaceId/seating-plans/:planId/auto-arrange-jobs` | async job; preview diff; audit on apply                                                     |
| `Salvează planul` seating           | plan dirty; seating.write                    | toast                       | new immutable plan version from assignments/tables/zones                              | `LOGISTICS.SEATING_VERSION_CREATE` — `POST /v1/workspaces/:workspaceId/seating-plans/:planId/versions`        | PDF invalidation; activity                                                                  |
| `Optimizează` transport             | complete routes/vehicles                     | toast                       | route optimization proposal with constraints and changed recipients                   | `LOGISTICS.TRANSPORT_OPTIMIZE` — `POST /v1/workspaces/:workspaceId/transport-optimization-jobs`               | async; preview then apply; re-notify affected guests                                        |
| `Acceptă oferta`                    | offer active/not expired; procurement.decide | local status/toast          | version check; selected revision; commercial confirmation                             | `VENDOR.OFFER_ACCEPT` — `POST /v1/workspaces/:workspaceId/offers/:offerId/accept`                             | atomic booking + draft contract + payment/task; reject alternatives only after confirmation |
| `Negociază`                         | offer negotiable                             | local status/toast          | counter amount/terms/message/expiry                                                   | `VENDOR.OFFER_COUNTER_CREATE` — `POST /v1/workspaces/:workspaceId/offers/:offerId/counter-offers`             | vendor notification; immutable revision/audit                                               |
| `Mută etapa` booking                | transition allowed                           | local any-stage             | guarded state machine and prerequisite validation                                     | `POST /bookings/:id/transitions`                                                                              | activity; task/calendar updates                                                             |
| `Marchează plătită`                 | finance.write; unpaid balance                | local                       | amount/date/method/reference/currency/receipt; idempotent                             | `POST /payments/:id/transactions`                                                                             | expense/category/booking update; receipt; notification                                      |
| `Marchează semnat`                  | contract.write; confirm                      | local boolean               | external signature date/parties/version/evidence                                      | `POST /contracts/:id/mark-signed`                                                                             | obligations/payments/tasks; booking advance; audit                                          |
| `Încarcă contract/document`         | file.write                                   | toast                       | upload intent, MIME/size/hash, multipart complete                                     | `POST /files/uploads`, `POST /files/:id/complete`                                                             | scan → preview/OCR → contract analysis job                                                  |
| `Partajează` file/moodboard         | share capability                             | toast                       | expiry, scope, password/download policy                                               | `POST /files/:id/share-links`                                                                                 | revocable signed access; access audit                                                       |
| `Șterge document`                   | file.delete; confirm                         | local remove                | trash 30 days, no immediate object deletion                                           | `DELETE /files/:id`                                                                                           | purge job; restore; audit                                                                   |
| `Evaluare AI` risk                  | AI entitlement + risk.read                   | inserts hardcoded risks     | structured proposals with evidence/confidence                                         | `POST /ai/runs` purpose `risk_assessment`                                                                     | cost record; human approval before create                                                   |
| `Activează Plan B`                  | O/P/WP; confirm/step-up near event           | checkbox/toast              | plan version, affected run items/people, reason                                       | `POST /plans-b/:id/activate`                                                                                  | realtime push/SMS, run-sheet diff, immutable audit                                          |
| `Raportează incident`               | day.command                                  | local hardcoded             | type/text/severity/assignee/photo/planB, offline client id                            | `POST /wedding-day/incidents`                                                                                 | idempotent offline sync; escalation; notifications                                          |
| `Închide evenimentul`               | O only; confirm                              | local flag                  | mandatory closure blockers or explicit override reason                                | `POST /workspaces/:id/close`                                                                                  | closure job, archive snapshot, billing/permissions transition                               |
| `Publică recenzia`                  | completed owned booking                      | local                       | rating/text/private note separation; content rules                                    | `POST /bookings/:id/review`                                                                                   | moderation, vendor notification, rating recompute                                           |
| `Șterge workspace`                  | O + typed confirm + MFA                      | toast only                  | delayed deletion request, export option, retention/legal holds                        | `POST /workspaces/:id/deletion-requests`                                                                      | revoke access; recovery period; GDPR purge job; audit                                       |
| `Invalidează toate sesiunile` admin | dual approval + step-up                      | toast                       | reason/change ticket/scope; second admin approval                                     | `POST /admin/control-requests` then approve                                                                   | global security event; immutable audit; alerts                                              |
| `Aprobă` AI proposal                | proposal pending; capability for every tool  | local badge/toast           | reauthorize actor, check read versions, execute idempotently                          | `POST /ai/action-proposals/:id/approve`                                                                       | transaction/outbox; full tool/result/cost audit                                             |

Toate acțiunile destructive folosesc confirmare. `Archive` este reversibil; `delete` intră în trash/recovery; `purge` nu este expus utilizatorului obișnuit. AI poate executa numai acțiunile marcate tool-eligible și numai după aprobare; nu poate șterge workspace, modifica billing, acorda roluri sau executa controale admin.

## 5. Formulare și validări

### 5.1 Convenții

- Backendul nu se bazează pe required/enum din browser; revalidează schema și capability.
- Erorile folosesc `fieldErrors` și cod stabil; PII auth folosește mesaje anti-enumerare.
- Formele editabile trimit `version`; conflictele răspund `409 VERSION_CONFLICT` cu snapshot nou.
- Uploadurile folosesc upload intent și finalizează după hash/scan.
- Wizard/importurile salvează draft și pot fi reluate.

Endpointurile scurte din tabelul de formulare descriu familia de domeniu. Metoda, path-ul `/v1`, ID-ul operației și contractul exact sunt canonice numai în `docs/API_OPERATION_REGISTRY.json`; nu se implementează o variantă paralelă pornind din shorthand.

### 5.2 Inventarul celor 54 de fluxuri de formular

|   # | Formular / rută             | Câmpuri, defaults și enumuri                                                                                  | Validări backend și relații                                             | Rezultat / endpoint                                   |
| --: | --------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
|   1 | Sign-in `/sign-in`          | email, password, remember                                                                                     | normalized email; rate limit; generic invalid; account state            | session cookie; `POST /auth/login`                    |
|   2 | Create account              | first, last, email, password, confirm; terms                                                                  | unique normalized identity; password policy; terms version              | User pending verification; `POST /auth/register`      |
|   3 | Forgot password             | email                                                                                                         | anti-enumeration; cooldown                                              | reset email job; `POST /auth/password-reset-requests` |
|   4 | Reset password              | password, confirm                                                                                             | valid one-time token; policy; mismatch                                  | revoke old sessions; `POST /auth/password-resets`     |
|   5 | Onboarding wizard           | 30 Fields + event/style/priorities/progress toggles; defaults RO/RON/moderate/balanced                        | date/event consistency; counts; money; selected location; draft version | save/complete; `/onboarding`, `/onboarding/complete`  |
|   6 | Quick task                  | title, category, priority, deadline, owner                                                                    | member/enum/date                                                        | `POST /tasks`                                         |
|   7 | Quick event                 | title, date, time, location                                                                                   | date/time/timezone                                                      | `POST /calendar-events`                               |
|   8 | Quick guest                 | first,last,household,side,email                                                                               | household valid; contact normalization/dedupe                           | `POST /guests`                                        |
|   9 | Quick expense               | name, amount, category, vendor                                                                                | positive amount/currency/category/vendor                                | `POST /expenses`                                      |
|  10 | Quick payment               | name, amount, category, due date, vendor                                                                      | schedule not transaction; vendor/category                               | `POST /payment-schedules`                             |
|  11 | Quick vendor                | name, category, city, contact                                                                                 | local/private vendor record vs marketplace profile explicit             | `POST /workspace-vendors`                             |
|  12 | Quick RFQ                   | title, category, budget, requested services                                                                   | category/budget/deadline before send                                    | `POST /rfqs` draft                                    |
|  13 | Quick contract              | name, vendor, value, file                                                                                     | upload complete/scan; currency; vendor                                  | file + contract draft                                 |
|  14 | Quick risk                  | title, probability, impact, mitigation                                                                        | matrix enums; owner default actor                                       | `POST /risks`                                         |
|  15 | Quick campaign              | name, channel, recipients segment                                                                             | valid segment/contact/channel/consent                                   | campaign draft                                        |
|  16 | Full task modal             | title,description,category,priority,status,owner,due,start,effort,dependency,vendor,reminder,subtasks,private | dependency acyclic; start≤due; member/vendor IDs                        | create/template; `POST /tasks`/`task-templates`       |
|  17 | Task comment                | text + optional context                                                                                       | nonempty, visibility, task access                                       | `POST /tasks/:id/comments`                            |
|  18 | Calendar event              | 11 fields incl type/date/time/all-day/video/attendees/reminder/recurrence/link/description                    | recurrence schema, attendee access, source links read-only              | `POST /calendar-events`                               |
|  19 | Add expense `/budget`       | 12 fields incl estimated/contracted/VAT/currency/due/contract/attachments                                     | monetary consistency; attachment readiness; contract/category IDs       | `POST /expenses`                                      |
|  20 | Guest profile edit          | menu, allergies, internal notes, invitation/RSVP/logistics/table                                              | allergy privacy; valid menu/table; status transition policy             | `PATCH /guests/:id`                                   |
|  21 | Add guest                   | first,last,household,side,relationship,language,email,phone,allergies                                         | normalized/deduped contacts; household; child/plus-one relationship     | `POST /guests`                                        |
|  22 | Guest import wizard         | file, column map, preview, duplicate decisions, confirmation                                                  | CSV/XLSX≤5MB; row errors; idempotent commit                             | import job endpoints                                  |
|  23 | Invitation AI writer        | tone/context/generated text choice                                                                            | no PII beyond authorized context; output schema                         | AI run then apply to draft version                    |
|  24 | RSVP deadline               | date default workspace deadline                                                                               | before event; policy for already-sent campaigns                         | `PATCH /rsvp-form` + reminder reschedule              |
|  25 | RSVP form editor            | 9 question toggles                                                                                            | participation required; stable question IDs; migration policy           | versioned `PUT /rsvp-form`                            |
|  26 | Seating plan controls       | table name/shape/capacity/position/lock; zone; notes                                                          | capacity≥1; one assignment; confirmed guest; version                    | plan/table/assignment endpoints                       |
|  27 | Add menu                    | name,description,price,age group,vendor,availability/tags                                                     | positive price; vendor; unique active name; dietary tags                | `POST /menus`                                         |
|  28 | Add transport route         | name,departure,depart/arrive,vehicle,driver                                                                   | arrive after depart; capacity; vehicle/operator                         | `POST /transport-routes`                              |
|  29 | Add vehicle                 | name,capacity,operator,cost,contact                                                                           | capacity>0; currency/contact                                            | `POST /vehicles`                                      |
|  30 | Add accommodation property  | name,address,checkin/out,rooms,cost,contact                                                                   | checkout>checkin; rooms/cost nonnegative                                | `POST /accommodation-properties`                      |
|  31 | Add rooms                   | property,type,count,price/night                                                                               | property active; count/capacity/price                                   | `POST /room-blocks`                                   |
|  32 | Marketplace quote           | date,guests,budget,style,message                                                                              | availability date; guest count; package/vendor; contact                 | `POST /vendors/:id/rfqs`                              |
|  33 | Favorite collection         | name                                                                                                          | trimmed unique within workspace                                         | `POST /favorite-collections`                          |
|  34 | RFQ builder                 | 11 fields incl category,date,location,guests,budget,services,deliverables,deadline,questions,attachments      | at least one recipient/service; deadline future; files ready            | `POST /rfqs`; send separate                           |
|  35 | RFQ AI brief                | structured prompt/options then generated brief                                                                | output fields match RFQ schema; user edit before apply                  | `POST /ai/runs` purpose `rfq_draft`                   |
|  36 | Booking create              | vendor,category,stage,value,owner                                                                             | vendor/member; only safe initial stages; currency                       | `POST /bookings`                                      |
|  37 | Record payment              | schedule, reference; full backend also amount/date/method/receipt                                             | amount≤remaining; idempotency; finance capability                       | `POST /payments/:id/transactions`                     |
|  38 | External contract signature | confirmation; backend requires signed_at/parties/evidence                                                     | not already signed; version; explicit external fact                     | `POST /contracts/:id/mark-signed`                     |
|  39 | Vendor brief                | recipient, body                                                                                               | recipient vendor shared; nonempty; version                              | `POST /vendor-briefs/:id/send`                        |
|  40 | Moodboard properties        | category,note,source,budget,vendor                                                                            | item/version; URL/budget/vendor validation                              | `PATCH /moodboard-items/:id`                          |
|  41 | Add risk                    | title,category,owner,probability,impact,plan                                                                  | member/enum; score derived                                              | `POST /risks`                                         |
|  42 | Wedding-day incident        | type,description,severity,assignee,photo,activate Plan B                                                      | offline client id; photo scan; plan permission                          | `POST /wedding-day/incidents`                         |
|  43 | Add moment                  | title,time,type,cue                                                                                           | within event window; lead/capture inferred later                        | `POST /moments`                                       |
|  44 | Review                      | rating, public text, private note                                                                             | completed owned booking; rating 1..5; separate visibility               | `POST /bookings/:id/review`                           |
|  45 | General settings            | first,last,email,workspace,city,date,currency                                                                 | email reverification; date impact preview; owner for workspace          | profile/workspace PATCH                               |
|  46 | Notification settings       | six toggles + quiet hours                                                                                     | user-scoped; timezone; mandatory security alerts exempt                 | `PUT /me/notification-preferences`                    |
|  47 | Appearance settings         | theme,language,density                                                                                        | known enum; local-first, optional server sync                           | `PUT /me/preferences`                                 |
|  48 | Security settings           | MFA, alerts, password, sessions                                                                               | step-up; credential/recovery-code lifecycle                             | auth security endpoints                               |
|  49 | Team invite                 | email,role                                                                                                    | normalized email; not existing member; inviter capability; 7d expiry    | `POST /team-invitations`                              |
|  50 | Add milestone               | title,phase,target month,dependency                                                                           | phase exists; dependency acyclic; month before/after policy             | `POST /milestones`                                    |
|  51 | Drinks calculator           | guest count                                                                                                   | 0..1000; deterministic                                                  | client-only; optional saved calculation               |
|  52 | Reserve calculator          | budget,reserve% default 10                                                                                    | amount≥0; 0..30%                                                        | client-only; optional budget scenario                 |
|  53 | Guest RSVP Companion        | attending,menu,transport,accommodation,allergy/note                                                           | scoped household/person; decline clears dependent fields                | `PUT /guest/rsvp`                                     |
|  54 | Vendor proposal             | package,value,message; validity default 14d                                                                   | addressed RFQ; vendor membership; currency/value                        | `POST /vendor/rfqs/:id/proposals`                     |

Incompatibilități actuale: `MenuChoice` folosește `copii`, dar Guest Companion trimite `children`; deadline-ul RSVP este 15 iunie în `Wedding`, 12 iulie în Guest Companion; `guestStats` descrie 160 invitați, lista seed are 24; owner/vendor/member sunt deseori nume libere, nu ID-uri.

## 6. Tabele, liste, filtre și query contracts

### 6.1 Cele 18 tabele

Coloana Endpoint descrie query-ul necesar în formă compactă. Operația exactă, permissions, erorile și paginația se iau din registrul API canonic.

| Rută / tabel                 | Coloane                                                                                                            | Query/filter/sort/select/bulk                                             | Paginare și index recomandat                                           | Endpoint                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| `/plan` tasks                | select, task, category, owner, priority, deadline, status, activity, actions                                       | category/status/search; sort title/priority/deadline; select; row actions | cursor `(workspace_id, sort_key, id)`; indexes status,due,owner        | `GET /tasks?cursor&q&category&status&owner&sort` |
| `/guests` main               | select, guest, household, side, relation, invitation, RSVP, menu, allergy, logistics, table, last contact, actions | text + 7 filters; multi-select/bulk                                       | cursor; indexes household,rsvp,invitation,menu,side,normalized contact | `GET /guests?...`                                |
| `/guests` import preview     | name,email,household,side                                                                                          | import-step rows/duplicate decisions                                      | job-row cursor for large files; `(import_id,row_no)`                   | `GET /guest-imports/:id/rows`                    |
| `/budget` expenses           | expense,category,vendor,estimated,contracted,paid,due,status                                                       | tab; row open; no UI pagination                                           | cursor; category/vendor/status/due                                     | `GET /expenses`                                  |
| `/payments`                  | payment,vendor,due,method,status,amount,action                                                                     | status segmented filter                                                   | cursor; `(workspace_id,status,due_at,id)`                              | `GET /payment-schedules`                         |
| `/contracts`                 | contract,vendor,type,value,signed,next payment,risk,actions                                                        | folder/detail; no search UI here                                          | cursor; vendor/status/risk/next_due                                    | `GET /contracts`                                 |
| `/documents`                 | document,folder,size,updated,by,actions                                                                            | folder + search                                                           | cursor; folder/updated; full-text filename/metadata                    | `GET /files?folder_id&q&cursor`                  |
| `/invitations` campaigns     | name,channel,recipients,status,sent date,open rate,actions                                                         | open row/report/actions                                                   | cursor; status/channel/scheduled_at                                    | `GET /campaigns`                                 |
| `/menus` guests              | guest,menu,allergies,notes,table,status                                                                            | menu/allergy/incomplete views                                             | cursor; menu/allergy/table/rsvp                                        | `GET /guest-menu-selections`                     |
| `/requests` RFQ              | request,category,vendors,deadline,replies,status,created,actions                                                   | status/detail                                                             | cursor; status/category/deadline                                       | `GET /rfqs`                                      |
| `/bookings` list             | vendor,category,stage,value,owner,next action,deadline                                                             | view mode/stage                                                           | cursor; stage/category/owner/deadline                                  | `GET /bookings`                                  |
| `/risks`                     | risk,category,probability,impact,score,owner,Plan B,status                                                         | matrix/list/status                                                        | cursor; status/score/owner/category                                    | `GET /risks`                                     |
| `/rsvp` persons              | guest,household,RSVP,menu,plus-one,response time                                                                   | status tab/search implicit                                                | cursor; rsvp/household/responded_at                                    | `GET /rsvp-responses`                            |
| `/rsvp` events               | event,confirmed,declined,pending                                                                                   | aggregate only                                                            | no pagination; aggregate index/submission projection                   | `GET /rsvp-summary/by-event`                     |
| `/shortlists` comparison     | criterion + vendor columns                                                                                         | selected vendors, criteria                                                | bounded ≤3; no pagination                                              | `GET /shortlists/:id/comparison`                 |
| `/team`                      | member,role/status,last active,actions                                                                             | status/role implicit                                                      | cursor for future; role/status                                         | `GET /members`                                   |
| `/vendor` RFQ pipeline       | couple,service,event,budget,stage,due,actions                                                                      | search/view pipeline-calendar                                             | cursor; vendor_org/stage/event_date                                    | `GET /vendor/rfqs`                               |
| `/admin` vendor verification | vendor,category,city,submitted,documents,status,actions                                                            | search/status tabs                                                        | cursor; status/submitted/category/city                                 | `GET /admin/vendor-verifications`                |

### 6.2 Liste non-table obligatorii

Kanban booking/task, marketplace cards/map, calendar month/week/agenda, timeline phases, seating canvas, moodboard masonry, notification drawer, activity feed, wedding-day run sheet, post-wedding checklist și archive cards necesită aceleași contracte de paginare/filter, dar unele sunt bounded projections. Pentru liste potențial nelimitate se folosește cursor, nu offset. Loading/error/empty trebuie adăugate fără schimbarea designului; frontendul are empty states în multe module, dar nu are error states pentru API.

## 7. Modelele de date necesare — 158 candidați, 143 persistente după normalizare

### 7.1 Notație și câmpuri comune

`!` = obligatoriu; `?` = opțional. Toate entitățile persistente au `id:uuid!`, `created_at:timestamptz!`, `updated_at:timestamptz!`, `version:int!`; entitățile tenant au `workspace_id:uuid!` sau `vendor_organization_id:uuid!`. Entitățile cu recuperare au `deleted_at?`; evenimentele/auditul nu se șterg. Enumurile sunt validate server-side. PII și documentele sensibile folosesc criptare/ACL și redaction în audit.

### 7.2 Identity, security și billing — 12

| Entitate             | Câmpuri specifice, relații, ownership și reguli                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`               | `email_normalized:string!`, `first_name!`, `last_name!`, `status:pending                                                                      | active                                             | suspended                                                                                                                        | deleted!`, `locale!`, `timezone!`; owns identities/sessions/preferences; soft-delete/GDPR purge |
| `AuthIdentity`       | `user_id!`, `provider:password                                                                                                                | google                                             | apple!`, `provider_subject!`, `password_hash?`, `verified_at?`; unique provider+subject; hard-delete only during identity unlink |
| `Session`            | `user_id!`, `token_hash!`, `expires_at!`, `last_seen_at!`, `ip_hash?`, `user_agent?`, `revoked_at?`, `revoke_reason?`; revocable server-side  |
| `VerificationToken`  | `user_id!`, `purpose:email_verify                                                                                                             | email_change                                       | magic_link!`, `token_hash!`, `expires_at!`, `used_at?`; one-time, hard-purge after retention                                     |
| `PasswordResetToken` | `user_id!`, `token_hash!`, `expires_at!`, `used_at?`; one-time; password reset revokes sessions                                               |
| `MfaCredential`      | `user_id!`, `type:totp                                                                                                                        | webauthn                                           | recovery!`, `secret_encrypted?`, `credential_json?`, `verified_at?`; secrets never returned                                      |
| `LoginEvent`         | `user_id?`, `email_hash?`, `result:success                                                                                                    | failure                                            | locked!`, `reason?`, `ip_hash`, `user_agent`; immutable security audit                                                           |
| `UserPreference`     | `user_id!`, `theme:light                                                                                                                      | dark                                               | system`, `density:comfortable                                                                                                    | compact`, `locale`, `timezone`; upsert, user-owned                                              |
| `BillingCustomer`    | `owner_user_id!`, `provider!`, `provider_customer_id!`; no raw card data                                                                      |
| `Subscription`       | `workspace_id!`, `provider_subscription_id!`, `plan!`, `status:trialing                                                                       | active                                             | past_due                                                                                                                         | cancelled!`, `period_end!`; provider webhook source of truth                                    |
| `BillingInvoice`     | `subscription_id!`, `provider_invoice_id!`, `amount_minor!`, `currency!`, `status!`, `issued_at!`, `download_ref?`; immutable provider mirror |
| `Entitlement`        | `workspace_id!`, `key!`, `limit_value?`, `enabled!`, `source:plan                                                                             | override!`; unique workspace+key; audited override |

### 7.3 Workspace și onboarding — 8

| Entitate                  | Câmpuri și reguli                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WeddingWorkspace`        | `title!`, `partner_one!`, `partner_two!`, `event_date!`, `timezone!`, `city!`, `venue_location_id?`, `estimated_guests!`, `target_budget_minor!`, `currency!`, `rsvp_deadline!`, `style:string[]`, `status:draft | planning  | on_track  | at_risk        | completed                                                                                      | closing                                                                                                                   | archived!`; owner membership required |
| `WorkspaceMembership`     | `workspace_id!`, `user_id!`, `role:owner                                                                                                                                                                         | partner   | planner   | family         | viewer!`, `capability_overrides:jsonb`, `status:active                                         | suspended!`, `last_active_at?`; unique; owner transfer guarded; soft-delete retains attribution                           |
| `TeamInvitation`          | `workspace_id!`, `email_normalized!`, `role!`, `token_hash!`, `expires_at!`, `status:pending                                                                                                                     | accepted  | declined  | revoked        | expired!`, `invited_by!`; one use; email must match                                            |
| `WeddingSubEvent`         | `workspace_id!`, `type:civil                                                                                                                                                                                     | religious | reception | welcome_dinner | brunch                                                                                         | custom!`, `name!`, `starts_at?`, `ends_at?`, `location_id?`, `visibility!`; event owns RSVP inclusion/calendar projection |
| `WeddingLocation`         | `workspace_id!`, `name!`, `address!`, `city!`, `country!`, `lat?`, `lng?`, `type!`; referenced, not cascade-deleted when historical                                                                              |
| `OnboardingDraft`         | `workspace_id!`, `step!`, `answers:jsonb!`, `completed_steps:int[]`, `saved_at!`; one active version; owner/partner                                                                                              |
| `OnboardingGenerationJob` | `workspace_id!`, `input_version!`, `status:queued                                                                                                                                                                | running   | completed | failed         | cancelled!`, `progress!`, `result_refs:jsonb`, `error?`; idempotent by workspace+input version |
| `NotificationPreference`  | `user_id!`, `workspace_id?`, category toggles, channel toggles, `quiet_start?`, `quiet_end?`, `timezone!`; security alerts cannot opt out                                                                        |

### 7.4 Planning — 14

| Entitate                     | Câmpuri și reguli                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Task`                       | `title!`, `description?`, `category!`, `assignee_membership_id?`, `priority:low                                     | medium                                                                                      | high    | urgent!`, `status:not_started | in_progress | waiting | blocked                                                                                                                                                    | completed!`, `start_at?`, `due_at?`, `completed_at?`, `related_vendor_id?`, `related_contract_id?`, `related_payment_id?`, `private!`; soft-delete |
| `Subtask`                    | `task_id!`, `title!`, `position!`, `done!`, `completed_at?`; cascades with task purge only                          |
| `TaskDependency`             | `task_id!`, `depends_on_task_id!`, `type:finish_to_start!`; unique pair; no cycles/self-reference                   |
| `TaskComment`                | `task_id!`, `author_membership_id!`, `body!`, `edited_at?`; soft-delete/redacted, audit retained                    |
| `TaskAttachment`             | `task_id!`, `file_asset_id!`, `attached_by!`; link entity, file lifecycle independent                               |
| `TaskTemplate`               | `workspace_id?`, `scope:system                                                                                      | workspace!`, `name!`, `event_profile?`, `archived_at?`; system templates immutable to users |
| `TaskTemplateItem`           | `template_id!`, `title!`, relative due/start offsets, category/priority/default role, dependency keys; ordered      |
| `TaskReminder`               | `task_id!`, `recipient_membership_id!`, `send_at!`, `channel!`, `status!`; rescheduled on due change                |
| `CalendarEvent`              | `title!`, `type:task                                                                                                | meeting                                                                                     | payment | vendor                        | contract    | guest   | wedding!`, `starts_at!`, `ends_at?`, `all_day!`, `location_id?`, `video_url?`, `recurrence_rule?`, `source_type?`, `source_id?`; derived sources protected |
| `CalendarAttendee`           | `calendar_event_id!`, `membership_id?`, `external_email?`, `response?`; unique attendee                             |
| `ExternalCalendarConnection` | `user_id!`, `provider!`, encrypted tokens, `sync_cursor?`, `status!`, `last_synced_at?`; user-owned/revocable       |
| `TimelinePhase`              | `workspace_id!`, `name!`, `position!`, `starts_on?`, `ends_on?`; cannot delete with milestones without reassignment |
| `TimelineMilestone`          | `phase_id!`, `title!`, `target_month!`, `status:planned                                                             | completed!`, `critical!`, `completed_at?`; delayed derived from time/status                 |
| `MilestoneDependency`        | `milestone_id!`, `depends_on_id!`; acyclic graph; drives critical-path calculation                                  |

### 7.5 Guests, invitations și RSVP — 20

| Entitate             | Câmpuri și reguli                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Household`          | `name!`, `city?`, `language:ro                                                                                                                 | en!`, `primary_guest_id?`; owns guests and one or more invitation recipients; soft-delete only when empty |
| `Guest`              | `household_id!`, `first_name!`, `last_name!`, `side:partner_one                                                                                | partner_two                                                                                               | common!`, `relationship?`, `email_normalized?`, `phone_e164?`, `is_child!`, `is_plus_one!`, `primary_guest_id?`, `notes_private?`, logistics flags, `last_contact_at?`; PII, soft-delete |
| `GuestRelationship`  | `from_guest_id!`, `to_guest_id!`, `type:partner                                                                                                | parent                                                                                                    | child                                                                                                                                                                                    | plus_one              | other!`; no invalid self/cycles for parent-child |
| `GuestTag`           | `workspace_id!`, `name!`, `color?`; many-to-many membership via implicit `guest_tags` join                                                     |
| `GuestContactLog`    | `guest_id!`, `channel!`, `direction!`, `campaign_id?`, `summary!`, `occurred_at!`; immutable communication history                             |
| `GuestImportJob`     | file, mapping/version, counts, `status!`, error report file; idempotent commit                                                                 |
| `GuestImportRow`     | `import_job_id!`, `row_no!`, `normalized_data!`, `errors!`, `duplicate_guest_id?`, `decision?`; purged after retention                         |
| `GuestAccessGrant`   | `household_id!`, `invitation_recipient_id!`, `token_hash!`, `expires_at?`, `revoked_at?`, `last_used_at?`; opaque scope-limited access         |
| `InvitationSite`     | `workspace_id!`, `slug!`, `custom_domain?`, password hash?, indexing policy, RSVP expiry, `published_version_id?`; unique slug/domain          |
| `InvitationVersion`  | `site_id!`, `number!`, `status:draft                                                                                                           | published                                                                                                 | superseded!`, structured content/settings snapshot; published immutable                                                                                                                  |
| `InvitationSection`  | `version_id!`, `type!`, `position!`, `visible!`, `content:jsonb!`; ordered; draft-only mutation                                                |
| `InvitationSettings` | `version_id!`, template/theme/palette/fonts, access/indexing/deadline; snapshot fields                                                         |
| `Campaign`           | `name!`, `channel:email                                                                                                                        | whatsapp                                                                                                  | sms                                                                                                                                                                                      | push!`, `status:draft | scheduled                                        | sending                                       | sent | paused | partial | failed | cancelled!`, template/version, schedule, audience query/snapshot, stats |
| `CampaignRecipient`  | `campaign_id!`, `guest_id!`, `address!`, personalization snapshot, `status:queued                                                              | sent                                                                                                      | delivered                                                                                                                                                                                | opened                | failed                                           | unsubscribed!`; unique campaign+guest+channel |
| `MessageTemplate`    | workspace/system scope, channel, name, subject/body, variables schema, version/status; published version immutable                             |
| `DeliveryAttempt`    | recipient, provider_message_id?, attempt, status, provider response, sent/delivered/opened timestamps, failure code; immutable/deduped webhook |
| `RsvpFormDefinition` | `workspace_id!`, `version!`, deadline, questions JSON with stable IDs, `status:draft                                                           | active                                                                                                    | closed!`; one active                                                                                                                                                                     |
| `RsvpSubmission`     | `form_id!`, `household_id!`, `submitted_by_guest_id?`, `status:draft                                                                           | submitted                                                                                                 | amended!`, `submitted_at!`, source; versioned amendments                                                                                                                                 |
| `RsvpAnswer`         | `submission_id!`, `guest_id!`, `question_id!`, typed value; unique submission+guest+question                                                   |
| `ReminderSchedule`   | source type/id, audience rule, send_at, channel/template, status, last_run; idempotent job key                                                 |

### 7.6 Logistics — 21

| Entitate                | Câmpuri și reguli                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Menu`                  | name, description, price_minor/currency, age_group, vendor_id?, availability/status; soft-delete when referenced |
| `MenuCourse`            | menu_id, name, description, allergens/tags, position; snapshot required for exports                              |
| `DietaryTag`            | workspace/system scope, code/name/severity; reusable                                                             |
| `GuestMenuSelection`    | guest_id, menu_id?, status:none                                                                                  | selected                                              | confirmed, source, selected_at; declined guest cannot remain active |
| `AllergyIssue`          | guest_id, free_text, normalized tags, status:open                                                                | resolved                                              | accepted_risk, resolution, resolved_by; sensitive/audited           |
| `SeatingPlan`           | name, status:draft                                                                                               | published                                             | archived, current_version_id; one active plan policy                |
| `SeatingPlanVersion`    | plan_id, number, layout JSON/snapshot, created_by, published_at?; immutable after publish                        |
| `SeatTable`             | version_id, name, shape:round                                                                                    | rect, capacity, x/y, locked, notes; capacity positive |
| `SeatAssignment`        | version_id, guest_id, table_id, seat_no?; unique guest/version; capacity transaction                             |
| `SeatingArea`           | version_id, label, x/y/w/h, type; layout object                                                                  |
| `SeatingConstraint`     | plan_id, guest/household refs, type:together                                                                     | apart                                                 | near                                                                | child_group                                                                | accessibility, weight, note; AI/auto-arrange input |
| `TransportRoute`        | name, status:draft                                                                                               | confirmed                                             | cancelled                                                           | completed, depart/arrive, vehicle_id?, driver/contact, cost; arrive>depart |
| `PickupStop`            | route_id, location/address/lat/lng, planned_at, position; ordered                                                |
| `Vehicle`               | workspace/vendor scope, name, capacity, operator_id?, cost, contact, status; capacity positive                   |
| `TransportOperator`     | workspace/vendor ref, name, contact, contract/booking refs; soft-delete                                          |
| `PassengerAssignment`   | route_id, guest_id, stop_id?, status:assigned                                                                    | notified                                              | boarded                                                             | cancelled; unique route+guest                                              |
| `AccommodationProperty` | name,address,checkin/out,room_count,capacity,cost,contact,booking/expense refs; checkout>checkin                 |
| `RoomBlock`             | property_id, code?, reserved_from/to, release_date?, status; capacity/cost snapshot                              |
| `RoomType`              | property_id, name, beds/capacity, accessibility, price/night; referenced                                         |
| `Room`                  | property_id, room_type_id, label/number, capacity, status; optional when only blocks are known                   |
| `StayAssignment`        | guest_id, property/room/block, checkin/out, bed/notes, status; no overlapping assignment policy                  |

### 7.7 Vendor și procurement — 24

| Entitate              | Câmpuri și reguli                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `VendorOrganization`  | legal/display name, status, billing/contact data; tenant root                                                                          |
| `VendorMembership`    | vendor_org_id,user_id,role:owner                                                                                                       | member,capabilities,status; unique/revocable            |
| `VendorProfile`       | org_id, category,city,description,verified/published status,rating projection,starting price,response SLA,styles; moderation lifecycle |
| `VendorVerification`  | profile_id,status:pending                                                                                                              | needs_info                                              | approved                  | rejected,submitted_at,reviewer,checklist,decision reason; immutable decisions |
| `VendorAvailability`  | profile_id,date/range,status:free                                                                                                      | held                                                    | booked                    | blocked,source/version; unique overlap policy                                 |
| `VendorPackage`       | profile_id,name,description,price,features,active,position; version/snapshot in offer                                                  |
| `VendorPortfolioItem` | profile_id,file_id,type,caption,position,moderation status; private until approved                                                     |
| `FavoriteCollection`  | workspace_id,name,position; unique name, soft-delete                                                                                   |
| `Favorite`            | workspace_id,vendor_profile_id,collection_id?,created_by; unique vendor/workspace; vendor cannot read                                  |
| `Shortlist`           | workspace_id,category,name,status:active                                                                                               | decided                                                 | archived; decision_id?    |
| `ShortlistCandidate`  | shortlist_id,vendor_id,offer_id?,rank?,status:proposed                                                                                 | selected                                                | removed; unique candidate |
| `ShortlistVote`       | candidate_id,membership_id,value:up                                                                                                    | down                                                    | neutral; one vote/user    |
| `ShortlistComment`    | candidate/shortlist,author,body,edited/deleted; collaboration history                                                                  |
| `SelectionDecision`   | shortlist_id,selected_candidate_id,decided_by,reason?,decided_at; immutable; triggers procurement transaction                          |
| `RFQ`                 | workspace,category,title,brief,requirements,deliverables,budget,date/location,deadline,status:draft                                    | active                                                  | closed                    | expired                                                                       | cancelled                            | archived,version |
| `RFQRecipient`        | rfq_id,vendor_org/profile,status:queued                                                                                                | delivered                                               | viewed                    | responded                                                                     | declined,delivery timestamps; unique |
| `Offer`               | rfq_id,recipient/vendor,workspace,current_revision_id,status:new                                                                       | reviewing                                               | clarification             | negotiating                                                                   | accepted                             | declined         | expired; decision timestamps |
| `OfferRevision`       | offer_id,number,base/total/tax,currency,valid_until,terms,highlights/concerns,file_id,submitted_by; immutable                          |
| `OfferLineItem`       | revision_id,name,description,qty,unit,unit_price,tax,included/optional,position                                                        |
| `OfferClarification`  | offer_id,author side,message,status:open                                                                                               | answered,answer?,timestamps; immutable thread semantics |
| `Booking`             | workspace,vendor,offer,category,stage:contacted                                                                                        | quote_requested                                         | quote_received            | negotiating                                                                   | selected                             | contracted       | deposit_paid                 | completed | cancelled,value,owner,next action/deadline |
| `BookingMilestone`    | booking_id,type,scheduled/completed,status,source ref; tracks contract/deposit/deliverable                                             |
| `Conversation`        | workspace/vendor participants,context_type/id,status; visibility explicit                                                              |
| `Message`             | conversation,sender identity/body/file refs,sent/read/deleted timestamps; immutable delivery record                                    |

### 7.8 Finance, contracts și files — 16

| Entitate                   | Câmpuri și reguli                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `BudgetCategory`           | name,icon,planned_minor,currency,position,active; estimated/contracted/paid derived, not independent truth        |
| `BudgetScenario`           | name,note,status:draft                                                                                            | active    | archived,base_version,total projection; applying creates new budget revision |
| `BudgetScenarioAllocation` | scenario,category,planned/estimated amounts; unique                                                               |
| `Expense`                  | category,vendor?,booking?,contract?,name,estimated/contracted/actual amounts,currency,status:estimate             | quoted    | contracted                                                                   | partially_paid     | paid,due?; paid derived |
| `PaymentSchedule`          | expense/contract/booking,vendor,name,amount,due,status projection,method expectation; due states derived          |
| `PaymentTransaction`       | schedule,amount,currency,paid_at,method,reference,recorded_by,idempotency key; immutable/correct by reversal      |
| `Receipt`                  | transaction,file_id,issuer/number/date/amount metadata; access financial                                          |
| `Contract`                 | workspace,vendor,booking,name,type,current_version,status:draft                                                   | analyzing | review                                                                       | awaiting_signature | signed                  | expired                                   | terminated | archived,value,currency,signed_at? |
| `ContractVersion`          | contract,number,file_id,content_hash,uploaded_by,analysis_status,extracted fields; immutable                      |
| `ContractObligation`       | contract/version,title,party,due,amount?,status,source clause,task/payment refs; version-snapshot                 |
| `ContractRisk`             | contract/version,clause,level,summary,recommendation,status; AI evidence + human state                            |
| `SignatureEnvelope`        | contract/version,provider?,status,parties,external reference,completed_at; external mark allowed without provider |
| `Folder`                   | workspace,parent?,name,position; no cycle; soft-delete                                                            |
| `FileAsset`                | workspace/vendor scope,owner,type,name,mime,size,hash,storage_key,status:uploading                                | scanning  | ready                                                                        | quarantined        | trashed                 | purged,current_version,retention; private |
| `FileVersion`              | asset,number,storage_key,hash,size,mime,uploaded_by,preview/status; immutable                                     |
| `ShareLink`                | resource type/id,token_hash,expires,permissions,password hash?,revoked,created_by; access logged                  |

### 7.9 Creative și operations — 17

| Entitate                   | Câmpuri și reguli                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `DesignConcept`            | name,style/formality/colors/avoid,budget range,status:draft                               | proposed      | approved                               | superseded,source AI/manual,version        |
| `DesignPalette`            | concept,color name/hex/role,position; valid color, snapshot in published invitation/brief |
| `VendorBrief`              | concept/vendor/category,title,body,file refs,status:draft                                 | sent          | viewed                                 | acknowledged,version                       |
| `Moodboard`                | name,description,status:draft                                                             | shared        | approved                               | archived,current_revision,share policy     |
| `MoodboardItem`            | board,kind:image                                                                          | text          | color                                  | link                                       | vendor,label,category,file/url/text,color,note,budget,vendor,position,status |
| `MoodboardRevision`        | board,number,items/layout snapshot,created_by; supports undo/restore/export               |
| `Risk`                     | title,category,probability,impact,score derived,owner,status:active                       | mitigated     | resolved,source/links/version          |
| `RiskMitigation`           | risk,title,description,owner,due,status,task/vendor/contract refs; many per risk          |
| `PlanB`                    | risk,title,steps,trigger,owner,status:draft                                               | ready         | active                                 | closed,version,activated_at/by/reason      |
| `RunSheet`                 | workspace,event/version,status:draft                                                      | published     | live                                   | completed,offline_pack_file?               |
| `RunSheetItem`             | run_sheet,time/end,title,location,owner,vendors,instructions,status:later                 | next          | now                                    | done                                       | delayed                                                                      | skipped,position |
| `Incident`                 | run_sheet,type,description,severity,assignee,status:active                                | acknowledged  | in_progress                            | resolved,photo,offline_client_id,planB ref |
| `IncidentUpdate`           | incident,author,status/message,timestamp; immutable timeline                              |
| `DayPayment`               | run_sheet,payment schedule/payee/what/amount,status,recorded_by; finance-restricted       |
| `EmergencyContact`         | run_sheet,name,role,phone,priority,availability; PII, offline snapshot                    |
| `Moment`                   | run_sheet,time,title,type,location,lead,cue,status:idea                                   | needs_details | ready                                  | distributed                                | completed                                                                    |
| `MomentCaptureRequirement` | moment,medium:photo                                                                       | video         | audio,vendor/assignee,ack status,notes |

### 7.10 Post-event — 8

| Entitate           | Câmpuri și reguli                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `ClosureTask`      | workspace,title,category,owner,due,required,status:open                                     | done,completed_at |
| `ReturnItem`       | vendor/booking,item,due,status:due                                                          | scheduled         | returned                                                          | overdue,proof? |
| `DepositRefund`    | booking/payment,expected amount/due,received transaction,status                             |
| `ThankYouBatch`    | audience/template/channel,status:draft                                                      | queued            | sending                                                           | sent           | partial   | failed,counts |
| `Review`           | booking,workspace,vendor,rating,public_text,private_note,status:pending                     | draft             | submitted                                                         | moderation     | published | rejected      | hidden |
| `ReviewModeration` | review,moderator,decision,reason,signals,timestamp; immutable                               |
| `ArchiveSnapshot`  | workspace,version,status:building                                                           | ready             | failed,manifest/checksums,storage ref,created/verified timestamps |
| `ExportJob`        | owner/scope,format,status,progress,file ref,expires,error; covers CSV/XLSX/PDF/GDPR/archive |

### 7.11 Cross-cutting, AI și admin — 18

| Entitate                | Câmpuri și reguli                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Notification`          | recipient user,workspace,module,title/body/deep link,priority,read/dismissed timestamps,dedupe key; user-owned |
| `NotificationDelivery`  | notification,channel,provider id,status,attempts/timestamps/error; retry/dedupe                                |
| `ActivityEvent`         | workspace,actor display/id,action,resource/deep link,occurred_at,visibility; append-only feed                  |
| `AuditEvent`            | tenant,actor type/id,action,resource,before/after redacted,request id,IP/user agent,time; immutable            |
| `DomainEvent`           | tenant,aggregate/type/id/version,event type,payload,time; append-only internal contract                        |
| `OutboxMessage`         | domain_event,topic,payload,status,attempts,next attempt; transactional outbox                                  |
| `BackgroundJob`         | tenant,type,status,progress,input/result/error,attempts,heartbeat,cancel flag; persistent queue                |
| `IdempotencyKey`        | tenant,actor,key,operation,request hash,response ref,expires; unique scope                                     |
| `IntegrationConnection` | owner/tenant,type,encrypted credentials,status,scopes,cursor,last sync,error                                   |
| `AiConversation`        | workspace,user,title,status,context scope,model policy                                                         |
| `AiMessage`             | conversation,role,content/file refs,token/cost metadata,safety status                                          |
| `AiRun`                 | purpose,input/context refs,model,status,output schema/result,usage/cost,error,started/completed                |
| `AiActionProposal`      | run,title,tool,args,preview,affected refs/read versions,risk,status:pending                                    | edited | approved | rejected | executed | failed |
| `AiUsageRecord`         | workspace/user/feature/model,input/output tokens,cost,latency,time; billing limits                             |
| `PlatformIncident`      | title,severity,status,owner,opened/resolved,service refs,timeline; admin only                                  |
| `AdminControlRequest`   | action,scope,reason,requested_by,approved_by?,status,expires,result; dual approval for high risk               |
| `VendorModerationNote`  | verification/profile,admin author,body,visibility internal,status; retained audit                              |
| `SupportCase`           | requester/tenant,subject,status,priority,assignee,resource refs,PII-safe notes; support capability             |

### 7.12 Normalizarea persistenței — 15 consolidări

Tabelele §7.2–§7.11 reprezintă cei 158 de **candidați** extrași din toate funcțiile UI. Auditul reconciliat nu recomandă 158 de tabele. Catalogul canonic `docs/BACKEND_ENTITY_CATALOG.json` păstrează 143 de modele persistente și documentează fiecare câmp, aggregate, relație, tenant scope, lifecycle, index, clasificare PII și retenție.

| Candidați eliminați ca tabele separate    | Înlocuire canonică                                      | Motiv                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `VerificationToken`, `PasswordResetToken` | `AuthOneTimeToken` cu `purpose`                         | aceeași securitate, expirare și one-time consumption                                                     |
| `LoginEvent`                              | subtype de `AuditEvent`                                 | security event imuabil, fără lifecycle de produs separat                                                 |
| `Entitlement`                             | plan/override în `Subscription` + read model            | UI doar citește capabilități derivate; separarea se face ulterior numai dacă apare lifecycle independent |
| `OnboardingGenerationJob`                 | `BackgroundJob(type=onboarding_generation)`             | progress/retry/cancel sunt infrastructură comună de job                                                  |
| `ExternalCalendarConnection`              | `IntegrationConnection(type=calendar)`                  | credentials/cursor/error lifecycle comun                                                                 |
| `InvitationSettings`                      | value object în snapshotul `InvitationVersion`          | fără identitate, ACL sau lifecycle propriu                                                               |
| `ContractRisk`                            | `Risk` cu `contract_id` și evidence clause              | un singur risk state machine                                                                             |
| `DesignPalette`                           | value object versionat în `DesignConcept`               | culorile nu au lifecycle independent                                                                     |
| `DayPayment`                              | `PaymentSchedule` + `PaymentTransaction`                | Wedding Day este un access path, nu al doilea ledger                                                     |
| `ClosureTask`                             | `Task(category=post_wedding)`                           | reutilizează assignment/deadline/status/audit                                                            |
| `DepositRefund`                           | payment schedule/transaction cu direcție refund         | aceeași contabilizare și idempotency                                                                     |
| `ThankYouBatch`                           | `Campaign(purpose=thank_you)`                           | același audience snapshot/delivery/retry/reporting                                                       |
| `ExportJob`                               | `BackgroundJob` cu rezultat `FileAsset`                 | un singur job contract pentru CSV/XLSX/PDF/GDPR/archive                                                  |
| `NotificationDelivery`                    | `DeliveryAttempt(source_type=notification)`             | provider delivery lifecycle comun cu campaniile                                                          |
| `ActivityEvent`                           | read model din `DomainEvent` + `AuditEvent` redacționat | proiecție, nu a doua sursă de adevăr                                                                     |

Read models precum Overview, guest statistics, RSVP funnel, budget totals, payment due status, critical path, unread count, campaign statistics, seating conflicts și admin metrics nu sunt entități persistente canonice. Ele pot fi query views/materialized projections reconstruibile.

## 8. Relațiile dintre module

| Relație / cardinalitate                              | Ownership și delete                                  | Actualizări derivate, efect UI și automatizare                 |
| ---------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| WeddingWorkspace 1—N Membership                      | workspace; membership soft-delete                    | access revoked immediately; attribution/activity remains       |
| WeddingWorkspace 1—N SubEvent/Location               | workspace; restrict delete if referenced             | calendar, invitation, RSVP form and guest schedule refresh     |
| Household 1—N Guest                                  | workspace/household; household delete only empty     | guest counts and recipient personalization recompute           |
| Guest 1—N RsvpAnswer; Household 1—N Submission       | guest/household; retain historical submission        | summary/menu/logistics/seating projections update              |
| Guest N—1 Menu via Selection                         | workspace; delete menu restricted if selected        | menu counts/allergy checks/table totals refresh                |
| Guest N—1 Table per PlanVersion                      | plan version; assignment deletes with version purge  | occupancy/conflicts/dashboard update                           |
| Guest N—M TransportRoute via PassengerAssignment     | workspace; route delete cancels assignments          | capacity/unassigned counts and guest notification state update |
| Guest N—M Accommodation via StayAssignment           | workspace; property delete restricted                | room capacity/unassigned counts and rooming list update        |
| InvitationSite 1—N Versions 1—N Sections             | workspace; published immutable                       | publish swaps active version and invalidates public cache      |
| Campaign 1—N Recipients 1—N DeliveryAttempts         | workspace; no hard delete after send                 | invitation status sent/delivered/opened and analytics update   |
| VendorOrganization 1—1/N VendorProfile               | vendor tenant; admin can suspend, not delete history | marketplace visibility/search index update                     |
| Vendor N—M Workspace via Favorite                    | workspace-private; favorite hard-delete permitted    | favorite counts are not exposed to vendor                      |
| Shortlist 1—N Candidate N—1 Vendor/Offer             | workspace; archive list preserves decision           | selection creates decision and procurement automation          |
| RFQ 1—N Recipient; Recipient 0—N Offer revision      | workspace/vendor shared boundary                     | vendor portal visibility, response counts, notifications       |
| Offer 1—N Revision/LineItem                          | vendor writes immutable revision; workspace decides  | normalized comparison and expiry/status update                 |
| Accepted Offer 1—1 Booking                           | workspace; cannot delete accepted offer              | atomic booking creation and alternatives decision              |
| Booking 0—N Contract/Payment/Milestone               | workspace; preserve after cancel                     | pipeline stage auto-advances from signed/deposit events        |
| Contract 1—N Version/Obligation/Risk                 | workspace; trash contract but retain audit           | tasks/payments/calendar/risks created or updated               |
| Contract/Expense 1—N PaymentSchedule 1—N Transaction | finance ownership; transactions immutable            | balance/status/category/dashboard/cashflow update atomically   |
| Expense N—1 BudgetCategory                           | workspace; category delete restricted                | category aggregates always derived from expenses/payments      |
| Task N—0/1 Vendor/Contract/Payment                   | workspace; target delete detaches with warning       | task deep links/context and downstream activity                |
| Risk 1—N Mitigation; Risk 0—1/N PlanB                | workspace; retain resolved history                   | readiness and Wedding Day Plan B controls update               |
| RunSheet 1—N Items/Incidents/Moments                 | workspace event; published/live version controlled   | realtime views and offline snapshot update                     |
| FileAsset 1—N FileVersion; N—M domain records        | uploader tenant; trash shared ref with policy        | previews/OCR/analysis and access ACL follow domain links       |
| AI Proposal N—M Domain Resource                      | user/workspace; immutable after decision             | approval executes allowlisted commands with version recheck    |
| Review N—1 completed Booking/Vendor                  | workspace author; private note split                 | marketplace rating after moderation; vendor notification       |
| Workspace 1—N ArchiveSnapshot                        | owner; immutable cold storage                        | archived UI becomes read-only; restore rebuilds active state   |

## 9. Automatizări cross-module — 40

|   # | Eveniment sursă                   | Module/date afectate                                                                | Notificare/job/idempotency/confirmare/audit                                   |
| --: | --------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
|   1 | Workspace creat                   | membership owner, onboarding draft, subscription trial                              | idempotent create; audit                                                      |
|   2 | Onboarding completat              | tasks, phases/milestones, budget categories, recommendations, vendor matches        | generation job; progress; rerun keyed by input version                        |
|   3 | Data nunții modificată            | relative task/milestone dates, vendor availability, RSVP deadline warning, calendar | preview + explicit confirm; reschedule job; audit                             |
|   4 | Locația modificată                | invitation, calendar, guest directions, transport, vendor briefs                    | impact preview; re-notification flag; audit                                   |
|   5 | Membru invitat                    | email token, pending row                                                            | email job/dedupe; audit                                                       |
|   6 | Membru eliminat/rol schimbat      | permissions, sessions/search/notifications                                          | immediate authorization invalidation; security notice/audit                   |
|   7 | Task creat/assigned               | plan, calendar projection, assignee notification, overview                          | outbox; dedupe by task/version                                                |
|   8 | Task due/status modificat         | calendar, timeline health, reminders, dashboard                                     | cancel/reschedule reminder jobs; audit                                        |
|   9 | Task întârziat                    | notifications, overview next action, risks optional                                 | scheduled evaluator; daily dedupe                                             |
|  10 | Milestone/dependency modificat    | critical path/timeline/dashboard                                                    | recalc job; versioned graph                                                   |
|  11 | Guest adăugat                     | household counts, CRM, campaign eligibility                                         | activity/audit                                                                |
|  12 | Guest șters/arhivat               | recipients, RSVP, seating, transport, accommodation, menu counts                    | destructive confirm; cancel unsent delivery; retain sent history              |
|  13 | Număr invitați/estimare modificat | calculators, budget/catering forecast, overview                                     | recommendation invalidation; audit                                            |
|  14 | Import guest committed            | guests/households/stats/duplicates/activity                                         | async job, row idempotency, result notification                               |
|  15 | Campaign programată               | recipient snapshot/deliveries                                                       | queue per recipient, cancellation before send, audit                          |
|  16 | Campaign trimisă                  | guest invitation=`sent`, contact log, campaign stats                                | provider jobs/idempotent key, sender notification                             |
|  17 | Delivery webhook                  | recipient sent/delivered/opened/failed, guest invitation status                     | signed webhook, provider-id dedupe                                            |
|  18 | RSVP confirmat                    | guest response/menu/logistics eligibility, dashboard/events                         | couple notification; idempotent submission version                            |
|  19 | RSVP modificat                    | old allocations validated/removed, summaries                                        | version conflict protection; change activity                                  |
|  20 | RSVP refuzat                      | unassign table/route/stay/menu; capacity released                                   | explicit side-effect preview for admin override; notify planner               |
|  21 | Meniu selectat                    | menu totals, table totals, allergy checks                                           | unresolved allergy alert/dedupe                                               |
|  22 | Alergie introdusă                 | AllergyIssue, caterer export readiness, risk notification                           | high-sensitivity notification; audit redacted                                 |
|  23 | Seating plan publicat             | immutable version, PDF/export snapshot                                              | async PDF; team notification                                                  |
|  24 | Transport route confirmed/changed | passenger notification state, calendar/run sheet                                    | send/resend job; changed-recipient diff                                       |
|  25 | Accommodation changed             | rooming list, guest details, budget expense                                         | re-notify changed guests; overbooking alert                                   |
|  26 | Favorite/shortlist updated        | collaborative UI/activity                                                           | realtime optional; no vendor notification                                     |
|  27 | RFQ trimis                        | recipients/vendor inbox, delivery, deadline reminders                               | fan-out queue; idempotent recipient send                                      |
|  28 | Offer received/revised            | offer status, comparison, booking candidate, couple notification                    | normalize/AI analysis job; immutable revision                                 |
|  29 | Offer accepted                    | booking selected, contract draft, expense/payment/task                              | single transaction + outbox; explicit confirm; audit                          |
|  30 | Vendor booked                     | marketplace availability held/booked, dashboard progress                            | vendor/couple notifications; conflict check                                   |
|  31 | Contract uploaded                 | file scan, contract version, OCR/extraction                                         | async chain; hash dedupe; progress/error                                      |
|  32 | Contract analyzed                 | obligations, risks, suggested tasks/payments                                        | AI output remains proposal until approval; cost audit                         |
|  33 | Contract signed                   | booking contracted, obligations/calendar/payment schedule                           | transaction/outbox; both parties notification                                 |
|  34 | Plată adăugată/înregistrată       | expense/category/cashflow/booking/calendar/dashboard                                | transaction idempotency; financial audit; receipt job                         |
|  35 | Plată due-soon/overdue            | notifications, overview, risk/next action                                           | scheduled evaluator with daily dedupe/quiet-hours policy                      |
|  36 | File/media uploaded               | scan, preview/transcode/OCR/index, linked module                                    | async progress; quarantine on failure                                         |
|  37 | Risc creat/escalated              | dashboard, task/Plan B suggestions, notifications                                   | severity routing/dedupe; audit                                                |
|  38 | Plan B activat                    | run sheet, incidents, team/vendors, guest comms if affected                         | high-risk confirm; realtime + push/SMS; immutable audit                       |
|  39 | AI proposal aprobat               | one or more domain commands                                                         | reauthorize + version check + idempotent transaction/outbox + cost/tool audit |
|  40 | Wedding closed                    | closure validation, archived permissions, archive/export snapshot, review prompts   | owner confirm; async archive; recovery window; notifications                  |

## 10. Cerințe AI — 24 intrări explicite

Regulă globală: modelul nu primește acces direct la DB. Un tool gateway citește numai resurse autorizate, validează output JSON Schema și creează `AiActionProposal`. La aprobare, backendul verifică din nou capability și versiunile citite. `AiRun` păstrează model/prompt policy, context refs, output, usage, cost, latență și safety. Fallback: UI rămâne utilizabil manual, iar un eșec AI nu blochează comanda de domeniu.

|   # | Pagina / scop                 | Input și context accesat                                                  | Output/schema și acțiuni                                                | Risc / aprobare / fallback                                   |
| --: | ----------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
|   1 | Global Copilot planner Q&A    | mesaj, ruta, workspace summary, task/budget/guest/vendor/risk read models | streamed answer + citations to internal resources                       | low read; no write; fallback error + manual nav              |
|   2 | Overview next-best-action     | deadlines, overdue payments/tasks, contract/risk dependencies             | `{title,reason,confidence,resourceRefs,cta}`                            | read/recommend; dismiss/snooze per user                      |
|   3 | Copilot multi-domain proposal | conversation + current resource versions                                  | tool list, args, preview, affected refs, risk                           | high; mandatory explicit approve/edit/reject                 |
|   4 | Task-context assistant        | task, comments, files/extractions, dependencies                           | answer, missing info, optional task edits proposal                      | read unless approved command                                 |
|   5 | Task generation               | wedding profile, date, progress, templates, existing tasks                | array of task drafts/dependencies/relative dates                        | edit + bulk approval; dedupe existing tasks                  |
|   6 | Timeline review               | milestones, dependencies, tasks, wedding date                             | critical path warnings and proposed date changes                        | changes require preview/approval                             |
|   7 | Budget analysis               | categories, expenses, offers/contracts/payments                           | variance/drivers/evidence                                               | financial read permission; no hidden PII                     |
|   8 | Budget forecast/reduction     | current/likely costs, guest count, scenarios/priorities                   | scenario allocations/savings/tradeoffs                                  | scenario draft only; user applies                            |
|   9 | Vendor matching               | date/location/style/budget/category/availability/reviews                  | ranked vendor IDs + reasons/filter evidence                             | disclose ranking factors; no fabricated availability         |
|  10 | RFQ generation                | category, event, style, budget, desired services, moodboard               | structured RFQ draft: requirements/deliverables/questions               | must be edited/approved before recipients/send               |
|  11 | Offer normalization           | offer PDF/text, RFQ schema, tax/currency                                  | line items, totals, exclusions, terms, confidence/source spans          | OCR uncertainty shown; no automatic acceptance               |
|  12 | Offer comparison              | normalized current revisions + shortlist criteria/votes                   | comparison matrix, concerns, recommendation                             | read only; save analysis optional                            |
|  13 | Negotiation assistance        | offer/RFQ, budget ceiling, market context, messages                       | counter-offer draft and questions                                       | never sends without approval                                 |
|  14 | Contract extraction           | scanned/PDF version                                                       | parties,value,currency,dates,obligations,clauses with source spans      | async; human review for low confidence                       |
|  15 | Contract risk analysis        | extracted clauses + booking/RFQ expectations                              | risk level, clause, explanation, recommendation, suggested task/payment | legal disclaimer; each side effect separately approved       |
|  16 | Inspiration analysis          | up to 10 images + style answers                                           | palette, style tags, common elements, confidence                        | multimodal consent/storage; fallback manual palette          |
|  17 | Design concept generation     | palette/style/formality/budget/moodboard/venue                            | concept variant, palette/brief/budget range                             | draft; explicit apply; generated asset attribution           |
|  18 | Invitation copy writer        | couple story, event facts, tone/style, active section                     | section text alternatives                                               | edit before apply; never auto-publish                        |
|  19 | RSVP reminder composition     | segment, deadline, language, channels, invitation link                    | channel-specific subject/body/variables                                 | preview/approve campaign; consent rules                      |
|  20 | Moodboard image generation    | textual prompt + concept/palette                                          | generated image asset + safety/provenance metadata                      | cost/entitlement, moderation, user chooses add               |
|  21 | Seating suggestion            | confirmed guests, households, constraints, tables/capacities              | proposed assignment diff + conflicts/score                              | never overwrites published plan; apply versioned diff        |
|  22 | Risk assessment               | wedding profile, contracts, budget, vendors, logistics, date/location     | risk drafts with probability/impact/evidence/Plan B suggestion          | approve each risk or bulk explicit confirmation              |
|  23 | Transport optimization        | stops, passengers, time windows, vehicles, traffic provider               | route/time proposal, affected passengers, delta                         | preview/apply; then re-notify changed guests                 |
|  24 | Plan B generation/explanation | risk, run sheet, contracts, weather/logistics                             | steps/triggers/owners/affected resources                                | draft/approve; activation remains separate high-risk command |

Frontendul nu prezintă încă intrări explicite pentru **media curation**, **thank-you generation**, **Vendor AI Assistant** sau **Admin AI monitoring**. Acestea sunt `missing/product decision`, nu trebuie declarate implementate. Voice input apare etichetat „în curând”.

## 11. Fișiere și storage — 17 familii

Politică comună: upload direct în storage privat prin URL semnat, MIME sniffing (nu doar extensie), hash, antivirus, tenant-scoped key, preview separat, download URL scurt, audit. Limitele sunt recomandări backend; UI declară explicit 25 MB generic document și 5 MB guest import.

|   # | Tip / module                 | Uploader → viewers                                   | Extensii / limită recomandată            | Procesare, retenție, versiuni/export                                     |
| --: | ---------------------------- | ---------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
|   1 | Contract                     | O/P/WP/vendor shared → permitted finance/legal roles | PDF/JPG/PNG, 25 MB                       | scan, OCR, preview, extraction; versioned; trash 30d; legal retention    |
|   2 | Invoice                      | vendor/O/P → finance roles                           | PDF/XML/JPG/PNG, 15 MB                   | OCR metadata, payment link, immutable version                            |
|   3 | Receipt/payment proof        | O/P/WP grant/vendor → finance roles                  | PDF/JPG/PNG/HEIC, 15 MB                  | image normalize, transaction link; retain with financial record          |
|   4 | Generic document             | workspace member → ACL members                       | PDF/DOCX/TXT/ZIP, 25 MB                  | preview/index where supported; folder/version/share/trash                |
|   5 | Guest import                 | O/P/WP → same                                        | CSV/XLSX, 5 MB UI limit                  | malware scan, parse/column map/row errors; source purged after retention |
|   6 | Exports                      | backend job → requesting authorized actor            | CSV/XLSX/PDF/ZIP                         | generated private object, expires 24–48h, audit download                 |
|   7 | Invitation assets            | O/P/WP → public published site                       | JPG/PNG/WebP/SVG sanitized, 10 MB        | resize/CDN, alt text, version snapshot                                   |
|   8 | QR codes                     | backend → workspace/public print                     | PNG/SVG/PDF                              | deterministic from public URL/token policy; regenerated on slug change   |
|   9 | Profile photo/logo           | user/vendor → permitted/public profile               | JPG/PNG/WebP, 5 MB                       | crop variants, moderation for vendor/public                              |
|  10 | Moodboard image              | workspace member/AI → collaborators/share-link       | JPG/PNG/WebP, 20 MB                      | thumbnail/color extraction/provenance; revision refs                     |
|  11 | Vendor portfolio             | vendor → public after moderation                     | JPG/PNG/WebP, 20 MB each                 | resize/watermark optional/moderation/order                               |
|  12 | Wedding photos/media archive | workspace/vendor upload → workspace/share policy     | JPG/PNG/HEIC, 50 MB                      | EXIF policy, thumbnails, dedupe, long retention                          |
|  13 | Video                        | workspace/vendor → authorized                        | MP4/MOV/WebM, recommended 2 GB multipart | scan/transcode/poster/duration; async progress                           |
|  14 | Audio                        | workspace/vendor → authorized                        | MP3/M4A/WAV, 250 MB                      | metadata/waveform/preview, moment link                                   |
|  15 | Wedding-day incident photo   | day actor → coordinators                             | JPG/PNG/HEIC, 15 MB                      | offline upload/client id, scan/thumbnail, incident retention             |
|  16 | Offline wedding pack         | backend → day actors                                 | encrypted ZIP/PDF/JSON                   | version/checksum/expiry; contains only scoped contacts/docs              |
|  17 | Archive snapshot             | backend → owner/authorized members                   | encrypted archive + manifest             | checksums/cold storage/legal holds/version/restore job                   |

Delete policy: unlinking a domain record does not immediately delete shared `FileAsset`; trash requires zero protected references or explicit detach. Quarantined files are never previewed/downloaded. Public/share access never exposes storage keys.

## 12. Notificări și comunicare

### 12.1 Contract comun

Fiecare notificare are `event`, `recipient`, `channel`, template version, priority, deep link, dedupe key, preference/mandatory flag, status/timestamps. In-app read status este separat de delivery. Email/SMS/WhatsApp/push folosesc retry exponential, dead-letter și webhook dedupe. Marketing permite opt-out; security și consecințele unei comenzi inițiate de utilizator nu sunt marketing. Quiet hours amână non-urgent, nu ascund in-app.

| Eveniment                                        | Destinatar                         | Canal/priority/deep link                  | Template și tracking                                               |
| ------------------------------------------------ | ---------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| task assigned/due/overdue/blocked                | assignee/followers                 | in-app,email,push; normal→urgent; `/plan` | task title/due/actor; daily overdue dedupe                         |
| team invitation/role/remove                      | invited/member/owner               | email + in-app/security                   | token/expiry/role; delivery + use status                           |
| campaign guest invitation/reminder               | guest/household                    | email/WhatsApp/SMS/push per selection     | personalized link/deadline; sent/delivered/opened/failed           |
| RSVP received/amended                            | couple/planner                     | in-app,email digest/push                  | household/person/change summary; `/rsvp`                           |
| menu/allergy incomplete                          | couple/planner/guest reminder      | in-app + chosen guest channel             | missing fields/deadline; sensitive allergy not in lock-screen push |
| transport/accommodation assigned/changed         | affected guests                    | chosen campaign channel                   | route/stay details/version; requires resend on change              |
| RFQ received                                     | selected vendor members            | vendor in-app,email                       | brief/deadline; vendor deep link                                   |
| offer received/revised/expiring                  | couple/planner                     | in-app,email,push                         | vendor/amount/validity; `/offers/:id`                              |
| clarification/counter/message                    | opposite conversation side         | in-app,email/push                         | safe preview; read tracking                                        |
| contract uploaded/analyzed/signature due         | finance/legal roles                | in-app,email                              | analysis status/obligation; `/contracts/:id`                       |
| payment due-soon/overdue/recorded                | finance roles                      | in-app,email,push; urgent if overdue      | amount/payee/due; `/payments/:id`                                  |
| budget threshold exceeded                        | O/P + granted WP                   | in-app,email digest                       | category/variance/evidence; `/budget`                              |
| risk created/escalated                           | owner/assignee/planner             | in-app,email,push                         | probability/impact/Plan B; `/risks/:id`                            |
| wedding-day incident/Plan B                      | coordinators/affected team/vendors | in-app,push,SMS urgent                    | incident/action/contact; day deep link; escalation ack             |
| file scan/analysis/export/import complete/failed | requester                          | in-app,email for long jobs                | job summary/error/download expiry                                  |
| archive/restore/delete job                       | owner/members as appropriate       | email + in-app/security                   | state/recovery deadline/export link                                |
| billing renewal/failure/cancel                   | owner                              | email + in-app/security                   | provider invoice/portal link; never raw card                       |
| security login/MFA/session/global revoke         | user/admin security                | email + in-app mandatory                  | time/device/location approximation/action link                     |
| weekly digest                                    | opted-in workspace member          | email                                     | progress, risks, next priorities; one per workspace/week           |
| product news                                     | opted-in user                      | email low                                 | unsubscribe and suppression required                               |

Mesajele individuale vendor/couple folosesc `Conversation/Message`, nu `Notification`. Campaniile guest folosesc `CampaignRecipient/DeliveryAttempt`; notification drawer nu este un substitut pentru delivery analytics.

## 13. Permisiuni și roluri — 11

Backendul verifică `capability`, nu doar stringul rolului. Capabilități sensibile: `workspace.manage`, `team.manage`, `guest.pii`, `finance.read/write`, `contract.read/write`, `campaign.send`, `site.publish`, `day.command`, `admin.control`.

| Rol                | View/create/edit/delete/send/approve/export                                     | Finanțe / guests / docs                               | Restricții                                                    |
| ------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Couple Owner       | toate domeniile; team/billing/delete/close/restore; publish/send/approve/export | complet                                               | singurul owner obligatoriu; operații sensibile cu MFA/confirm |
| Couple Partner     | planificare completă, publish/send/approve/export                               | finance/guests/docs implicit; fără billing ownership  | nu șterge workspace/transferă ownership fără grant            |
| Collaborator       | taskuri/comentarii/date atribuite; create/edit configurabil                     | fără finance/PII/docs sensibile implicit              | capability overrides explicite                                |
| Family Member      | view, task assigned, comment, vote, guest edits limitate                        | guests subset; finance/docs ascunse implicit          | nu publică/trimite/decide procurement                         |
| Wedding Planner    | CRUD operațional, vendors, campaigns, risks/day                                 | guest PII necesar; finance/contracts numai grant      | nu billing/owner/delete workspace                             |
| Guest              | invitation published + own household response                                   | own allergy/note only; no internal docs/finance/list  | token scope; no cross-household access                        |
| Vendor Owner       | own org/profile/team, addressed RFQ, proposals/bookings/deliverables/invoices   | only shared brief/contracts/payments involving vendor | never full guest list/internal notes                          |
| Vendor Team Member | own assigned org data by capability                                             | same reduced dataset                                  | cannot manage owner/bank/verification unless granted          |
| Platform Admin     | platform metrics/incidents/vendor verification/controls                         | no default access to wedding content                  | MFA/step-up; break-glass audited if support access needed     |
| Support Agent      | support cases/account metadata/session troubleshooting                          | redacted; temporary consented access only             | cannot vendor approve/global control                          |
| Moderator          | public vendor media/profiles/reviews                                            | no finance/guest data                                 | content decisions only, immutable reason                      |

Ambiguități care necesită decizie: limitele `partner`; dacă `family` poate edita guest CRM; grantul implicit al plannerului la finance/contracts; persoană vs household pentru guest token; support break-glass; vendor visibility asupra contactelor și plăților.

## 14. Real-time, async și integrări externe

### 14.1 Transport tehnic

| Funcție                                             | Transport recomandat                    | Motiv                                           |
| --------------------------------------------------- | --------------------------------------- | ----------------------------------------------- |
| AI chat                                             | SSE                                     | streaming unidirecțional, reconectare simplă    |
| job progress (import/export/OCR/generation/archive) | SSE sau polling 2–5s                    | progress/status; polling fallback obligatoriu   |
| notifications unread/feed                           | SSE; polling fallback                   | near-real-time fără complexitate bidirecțională |
| Wedding Day live / incidents / acknowledgements     | WebSocket                               | bidirecțional + prezență + latență redusă       |
| collaborative task/moodboard/seating                | WebSocket ulterior; optimistic HTTP MVP | edit events/conflict visibility                 |
| vendor messages                                     | WebSocket/SSE + durable HTTP send       | delivery/read realtime; history persistent      |
| availability/calendar sync                          | background polling/webhooks             | provider cursors/retry/conflicts                |
| file/media upload                                   | multipart signed upload + polling/SSE   | large transfer independent of app server        |
| campaign delivery                                   | queue + provider webhooks               | fan-out, retry, delivery tracking               |

Job runner obligatoriu înainte de MVP: persistent queue, retry/backoff, dead-letter, heartbeat, cancellation where safe, progress, dedupe și transactional outbox. Jobs: onboarding generation, email tokens/invites, campaigns, reminders, file scan/preview/transcode, guest import, exports, OCR/AI, calendar sync, archive/restore/delete, billing webhook reconciliation.

### 14.2 Cele 21 de familii de integrări

1. transactional email; 2. WhatsApp Business; 3. SMS; 4. Web Push/mobile push; 5. private object storage/CDN; 6. antivirus; 7. OCR/document extraction; 8. LLM/tool calling; 9. multimodal/image generation; 10. Google OAuth; 11. Apple OAuth; 12. Google/external calendar sync; 13. iCal generation; 14. maps/geocoding/directions; 15. traffic/route optimization; 16. weather; 17. video meeting link provider; 18. subscription billing; 19. e-signature (later/MVP external-mark fallback); 20. PDF/CSV/XLSX rendering/parsing; 21. observability/incident monitoring.

## 15. Mock data și surse false

### 15.1 Surse globale

| Fișier                       | Structuri                                                            | Consumatori                                          | Risc / înlocuire                                                                  |
| ---------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/lib/data/wedding.ts`    | wedding, workspaces, teamMembers, upcomingEvents, milestones, phases | shell/overview/calendar/timeline/settings/onboarding | workspace/subevent/location/member/calendar/timeline APIs; names replace IDs      |
| `src/lib/data/tasks.ts`      | 18 tasks, subtasks                                                   | overview/plan/calendar                               | Task API; comments/attachments counts currently detached from demo detail arrays  |
| `src/lib/data/guests.ts`     | 12 households, 24 guests, aggregate guestStats=160                   | guest CRM/RSVP/menu/seating/overview                 | Guest/Household/query projections; aggregate must be computed                     |
| `src/lib/data/budget.ts`     | 10 categories, 15 expenses, 7 payments, 3 scenarios                  | budget/payments/calendar/overview                    | finance APIs; category snapshots can diverge from line items                      |
| `src/lib/data/vendors.ts`    | 12 vendors, 4 offers, 8 bookings, 5 contracts                        | marketplace/procurement/overview                     | vendor/RFQ/offer/booking/contract APIs; string vendor links unsafe                |
| `src/lib/data/operations.ts` | 5 risks, 10 notifications, 8 activity items                          | overview/risks/drawers/activity                      | risk/notification/activity queries; activity is not audit                         |
| `src/lib/services/index.ts`  | Task/Guest/Budget/Vendor/Operations interfaces and 120ms mocks       | intended abstraction, inconsistently consumed        | replace with domain clients; current mutations incomplete/no tenant/errors/paging |

### 15.2 Page-local mock registries

| Module/files                     | Mock-uri locale și logică în componentă             | Endpoint/model înlocuitor                                  |
| -------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| Onboarding                       | steps/styles/priorities/generation timers           | OnboardingDraft/Job and template/ranking services          |
| Guest Companion                  | schedule/FAQ/hardcoded Ioana                        | guest bootstrap/invitation/subevents/locations/FAQ config  |
| Vendor OS                        | RFQ requests/deliverables/stats/events/revenue      | vendor dashboard/RFQ/deliverable/invoice queries           |
| Admin                            | vendors/incidents/health/platform counts            | admin verification/incidents/metrics/control APIs          |
| Wedding Day                      | run sheet/incidents/people/payments/Plan B/docs     | RunSheet/Incident/DayPayment/EmergencyContact/offline pack |
| Transport/Accommodation          | routes/properties and counts                        | transport/accommodation domains                            |
| Moments/Menus/Design             | seed moments, literal menus, palettes/boards/briefs | moment/menu/design APIs                                    |
| Invitations/Editor               | campaigns, sections, templates                      | Campaign and versioned InvitationSite APIs                 |
| Documents/Contracts              | folders/files and extracted clauses/obligations     | File/ContractVersion/OCR models                            |
| Marketplace detail               | reviews/FAQ/packages/portfolio literals             | VendorProfile child resources                              |
| Favorites/Shortlists/RFQ/Reviews | collections/voters/comments/requests/reviews        | collaboration/procurement/review APIs                      |
| Moodboards/Seating               | item/table/area histories in state                  | revisioned aggregate APIs                                  |
| Post-Wedding/Archive             | closure tasks/returns/archive items                 | closure/archive snapshot APIs                              |

Riscul major este o aplicație paralelă: multe pagini importă seedurile direct, ocolind `services`. Migrarea backend trebuie să introducă un singur client per domeniu și feature-flag doar pentru fallback de demo; nu se păstrează simultan două surse mutabile. Testele trebuie să interzică importul `src/lib/data/*` din rutele backend-connected.

## 16. API contract recommendations — 232 operații

### 16.1 Convenții de protocol

Base: `/v1`. Cookie session: `HttpOnly`, `Secure`, `SameSite=Lax`; mutații cookie-auth au CSRF. Tenantul este în path și verificat din membership, niciodată acceptat ca autoritate doar din body.

Succes:

```json
{
  "data": {},
  "meta": { "requestId": "uuid", "nextCursor": null, "version": 4 }
}
```

Eroare:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Resursa a fost modificată între timp.",
    "fieldErrors": { "dueAt": ["Trebuie să fie după startAt."] },
    "requestId": "uuid",
    "currentVersion": 5
  }
}
```

Coduri comune: `UNAUTHENTICATED 401`, `FORBIDDEN 403`, `NOT_FOUND 404` fără tenant leakage, `VALIDATION_FAILED 422`, `VERSION_CONFLICT 409`, `INVALID_TRANSITION 409`, `DUPLICATE 409`, `RATE_LIMITED 429`, `JOB_PENDING 202`, `PROVIDER_FAILURE 502`. Listările folosesc `cursor`, `limit<=100`, filtre explicite și sort allowlist. Create/send/approve/pay/import folosesc `Idempotency-Key`; PATCH/transition folosesc `If-Match` sau `version`.

### 16.2 Registru pe domenii

Counturile sunt perechi **explicite** metodă+path, nu număr de butoane. Registrul machine-readable canonic este `docs/API_OPERATION_REGISTRY.json`; nu conține expresii ambigue precum `GET/POST`, `...` sau endpoint per locație UI.

| Domeniu consolidat                      |       # | Familii acoperite                                                                                | Regula de reutilizare                                                                      |
| --------------------------------------- | ------: | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Auth/session                            |      14 | register, login/logout, magic link, verification, reset, sessions, MFA                           | toate suprafețele auth folosesc aceeași identity/session infrastructură                    |
| Workspace/team/onboarding/billing       |      24 | workspace lifecycle, membership/invites, onboarding, jobs, subscription/invoices                 | un singur tenant/bootstrap contract; owner checks server-side                              |
| Bootstrap/search/notifications/activity |      12 | shell bootstrap, Overview, search, notification store/preferences, activity export               | Overview/activity/unread sunt read models, nu CRUD independent                             |
| Planning/calendar/timeline              |      27 | task aggregate/subresources/templates, native calendar, sync/export, milestone graph             | `PLAN.TASK_TRANSITION` este reutilizat din Overview, Plan, drawer și command palette       |
| Guests/invitations/RSVP                 |      33 | household/guest/import/export, invitation versions/publish/QR, campaigns, RSVP, Guest portal     | un singur guest/RSVP truth; campaign transitions consolidează schedule/send/pause/retry    |
| Logistics                               |      24 | menus, seating versions/assignments, transport, accommodation, exports/optimizers                | assignments sunt aggregate replace/versioned commands, nu endpoint per drag/drop           |
| Vendor/procurement/portal               |      34 | marketplace/favorites/shortlists, RFQ/offers/bookings și Vendor OS                               | couple și vendor folosesc aceleași revisions/bookings prin limite tenant explicite         |
| Finance/contracts/files                 |      25 | budget/scenarios, expenses, payment ledger, contracts/analysis, file upload/access/version/share | Wedding Day payment reutilizează ledgerul; documentele folosesc un singur storage contract |
| Creative/ops/post-event                 |      22 | design/moodboards, risks/Plan B, run sheet/incidents/moments, closure/reviews/archive            | closure tasks/campaigns/payments reutilizează domeniile canonice existente                 |
| AI                                      |       8 | conversations/messages/runs/proposals/approve/reject                                             | fiecare feature folosește același gateway; aprobarea execută operațiile domeniului         |
| Admin                                   |       9 | metrics, vendor verification, incidents, dual-control requests                                   | control plane separat, step-up și audit obligatoriu                                        |
| **Total**                               | **232** | 50 module, exceptând controalele strict UI/browser                                               | —                                                                                          |

Din cele 585 declarații de control, 423 sunt legate în inventar la 103 operații backend unice și 162 sunt navigare/view/filter/browser-only. Restul operațiilor din registru sunt reads, lifecycle, portal, security, jobs sau infrastructure contracts care nu au neapărat un buton direct. Astfel, numărul 232 este justificat după consolidare: nu există câte un endpoint pentru fiecare dintre cele 585 de controale.

Fiecare obiect din registru include `id`, domeniu, metodă, rută, scop, request, response, permissions, validation, errors, idempotency, concurrency, audit, events, jobs, `reusedBy` și `currentBackendCoverage=ABSENT_REPOSITORY`.

### 16.3 Exemple de DTO specifice

`PLAN.TASK_CREATE — POST /v1/workspaces/:workspaceId/tasks`:

```json
{
  "title": "Semnează anexa",
  "category": "contracts",
  "priority": "urgent",
  "assigneeMembershipId": "uuid",
  "dueAt": "2026-07-24T20:59:59Z",
  "dependencyIds": ["uuid"],
  "relatedContractId": "uuid",
  "private": false,
  "subtasks": [{ "title": "Verifică clauza 7.2", "position": 0 }]
}
```

`VENDOR.OFFER_ACCEPT — POST /v1/workspaces/:workspaceId/offers/:offerId/accept`:

```json
{
  "version": 3,
  "acceptedRevisionId": "uuid",
  "createContractDraft": true,
  "createDepositSchedule": true,
  "alternativeOfferPolicy": "ask_before_decline"
}
```

Răspunsul include `offer`, `booking`, `contractDraft`, `paymentSchedule` și event IDs, toate create într-o tranzacție/outbox.

`GUEST.RSVP_UPDATE — PUT /v1/guest/rsvp`:

```json
{
  "version": 2,
  "people": [
    {
      "guestId": "uuid",
      "attendance": "confirmed",
      "eventIds": ["uuid"],
      "menuId": "uuid",
      "transportNeeded": true,
      "accommodationNeeded": false,
      "allergyNote": "nuci"
    }
  ]
}
```

`AI.PROPOSAL_APPROVE — POST /v1/ai/action-proposals/:proposalId/approve`:

```json
{
  "proposalVersion": 2,
  "resourceVersions": { "task:uuid": 4, "paymentSchedule:uuid": 1 },
  "idempotencyKey": "uuid"
}
```

## 17. Gap analysis

Nu există în repository o „specificație canonică WeddingOS” separată. Sursele factuale disponibile sunt frontendul, `AGENTS.md`, tipurile și seedurile. Orice comparație cu servicii promise în afara repository-ului este blocată până când documentul canonic este furnizat. Matricea de mai jos compară UI-ul cu un flux end-to-end implicat de propriul UI.

| Gap                                                                                                     | Clasificare                             | Prioritate | Impact/blocaj                                                                                      |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------: | -------------------------------------------------------------------------------------------------- |
| fundația F0/F1 declarată nu este prezentă în workspace                                                  | artefact extern lipsă / nereconciliabil |         P0 | nu se poate decide ce infrastructură trebuie reutilizată și ce nu trebuie reconstruit              |
| niciun backend/API/DB/auth guard                                                                        | doar UI/mock                            |         P0 | toate mutațiile și permisiunile sunt nereale                                                       |
| servicii mock parțiale, pagini importă seed direct                                                      | inconsistent/duplicat                   |         P0 | risc de două surse de adevăr                                                                       |
| relații prin string (`owner`, `vendor`, `user`)                                                         | trebuie corectat                        |         P0 | imposibilă integritatea/referential access                                                         |
| guestStats 160 vs 24 guest rows                                                                         | inconsistent                            |         P0 | dashboard/logistică/finance divergente                                                             |
| RSVP deadline 15 iunie vs 12 iulie                                                                      | inconsistent                            |         P0 | campanii/form close/reminders eronate                                                              |
| menu enum `copii` vs Guest `children`                                                                   | inconsistent                            |         P0 | răspuns Guest nu poate fi mapat sigur                                                              |
| invitation status nu include failed/bounced                                                             | frontend parțial                        |         P0 | delivery state machine insuficientă                                                                |
| payment status stored instead of derived                                                                | frontend parțial                        |         P0 | overdue/due-soon poate deveni fals                                                                 |
| contract `signed:boolean`                                                                               | trebuie simplificat/modelat             |         P0 | lipsesc analysis/signature/version lifecycle                                                       |
| orice booking se mută în orice etapă                                                                    | local/inconsistent                      |         P0 | pipeline fără invariants                                                                           |
| auth routes simulate via email/timeouts                                                                 | doar mock                               |         P0 | rolurile/portalele nu sunt protejate                                                               |
| guest portal hardcodat, fără token scope                                                                | doar UI                                 |         P0 | risc critic de privacy/cross-household                                                             |
| vendor/admin layouts fără control plane auth                                                            | doar UI                                 |         P0 | cross-tenant/admin security absent                                                                 |
| audit feed confundabil cu activity                                                                      | neclar                                  |         P0 | conformitate și investigație imposibile                                                            |
| fișiere doar toast; fără scan/ACL                                                                       | lipsește                                |         P0 | contracts/receipts/moodboards nu pot lansa sigur                                                   |
| jobs/queue/outbox inexistente                                                                           | lipsește                                |         P0 | campaigns/OCR/import/export/AI nesigure                                                            |
| 3 controale icon-only fără nume accesibil (`seating` print, `wedding-day` phone, TaskModal add subtask) | frontend parțial                        |         P1 | inventarul nu poate deriva o etichetă contractuală; necesită `aria-label` fără schimbare de design |
| drepturi partner/family/planner neclare                                                                 | necesită decizie produs                 |         P0 | schema capabilities și UI hiding blocate                                                           |
| Guest token person vs household                                                                         | necesită decizie produs                 |         P0 | cardinalitate RSVP/acces blocată                                                                   |
| WeddingOS procesează bani sau doar tracking                                                             | necesită decizie produs                 |         P0 | payment provider/compliance scope blocat                                                           |
| plan billing per user sau per wedding                                                                   | necesită decizie produs                 |         P0 | ownership/entitlements schema blocată                                                              |
| public marketplace source/moderation/SLA                                                                | necesită decizie produs                 |         P1 | vendor onboarding/search/ranking                                                                   |
| WhatsApp/SMS/push providers și consent                                                                  | necesită decizie produs                 |         P1 | campaign channel MVP                                                                               |
| Google/Apple buttons fără integrare                                                                     | UI present/missing                      |         P1 | poate fi amânat după email auth                                                                    |
| calendar sync/video/maps/weather                                                                        | toast/external missing                  |         P1 | calendar/logistics/day experience parțială                                                         |
| realtime/offline Wedding Day                                                                            | doar UI                                 |         P1 | command center nu este sigur în ziua evenimentului                                                 |
| e-signature                                                                                             | neclar                                  |         P2 | MVP poate marca semnat extern                                                                      |
| Vendor payouts/escrow/disputes                                                                          | lipsește/neclar                         |         P2 | nu este promis explicit de UI; nu presupune                                                        |
| media curation/thanks/vendor/admin AI                                                                   | lipsește                                |         P2 | cerință atașată, dar nu frontend explicit                                                          |
| loading/error/API retry states                                                                          | frontend parțial                        |         P1 | conectarea la API necesită stări fără redesign                                                     |
| canonical product specification absent                                                                  | blocaj de comparație                    |         P0 | nu se pot valida promisiuni externe UI-ului                                                        |

## 18. Raport final obligatoriu

### A. Rezumat cantitativ

| Element                          |                                   Număr |
| -------------------------------- | --------------------------------------: |
| aplicații/suprafețe              |                                       6 |
| rute                             |                                      50 |
| pagini                           |                                      50 |
| layouturi                        |                                       3 |
| module normalizate               |                                      50 |
| fluxuri de formular              |  54 (13 elemente `<form>`, 228 `Field`) |
| tabele                           |                                      18 |
| modale + drawere                 |                                      43 |
| confirm dialogs                  |                                      14 |
| suprafețe dialog totale          |                                      57 |
| declarații de acțiuni/control    |                                     585 |
| acțiuni AI explicite             |                                      24 |
| familii de fișiere               |                                      17 |
| roluri                           |                                      11 |
| entități persistente recomandate | 143 (din 158 candidați; 15 consolidări) |
| operații API recomandate         |                                     232 |
| automatizări cross-module        |                                      40 |
| familii de integrări externe     |                                      21 |

### B. Cele mai importante 20 de fluxuri end-to-end

|   # | Actor / start                      | Pași și date create                                                                                                  | Module afectate                                                   | Rezultat și backend necesar                                            |
| --: | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
|   1 | New Couple Owner `/create-account` | register → verify email → session → create workspace draft → onboarding save → generation job                        | Auth, Workspace, Onboarding, Tasks, Timeline, Budget, Marketplace | workspace real și dashboard populat; identity/session/queue/outbox     |
|   2 | Owner `/team`                      | invite email+role → token delivery → accept with matching identity → membership → bootstrap capabilities             | Team, Auth, Notifications, Activity                               | colaborator activ; one-time token, immediate access, audit             |
|   3 | Planner `/plan`                    | create task+subtasks/dependency → assign → reminders → work status → complete                                        | Plan, Calendar, Timeline, Overview, Notifications                 | task persistent cu transitions/version; derived calendar and activity  |
|   4 | Partner `/calendar`                | create meeting/all-day/video/attendees/recurrence → external sync/export                                             | Calendar, Team, Integrations                                      | eveniment și sync cursored; source-linked events remain derived        |
|   5 | Planner `/guests`                  | upload CSV/XLSX → map → validate/dedupe → preview → commit → household/guests                                        | Guest CRM, Dashboard, Campaign eligibility                        | import idempotent cu raport erori; file scan + job progress            |
|   6 | Owner `/invitations/editor`        | edit draft sections/assets → preview → publish immutable version → QR/cache                                          | Invitation Site, Documents, Guest Companion                       | site public versionat; storage/CDN, publish permission/audit           |
|   7 | Planner `/invitations`             | create campaign+segment+template → preview → schedule/send → delivery webhooks/retry                                 | Campaigns, Guest CRM, Notifications, Activity                     | delivery analytics și invitation status real; queue/providers/dedupe   |
|   8 | Guest public link                  | exchange opaque token → bootstrap household → submit attendance/menu/needs/allergy → amend with version              | Guest Companion, RSVP, Menu, Seating, Transport, Accommodation    | răspuns limitat la household; PII/security and downstream events       |
|   9 | Planner `/seating`                 | start plan version → add/lock tables/zones → assign confirmed guests → auto-arrange preview → resolve → publish/PDF  | RSVP, Seating, Menus, Documents                                   | invariant capacity/one-table; versioned aggregate + async PDF          |
|  10 | Planner logistics pages            | filter eligible guests → define routes/rooms → assign → capacity check → confirm → send details/export               | RSVP, Transport, Accommodation, Campaigns, Budget                 | manifests/rooming lists și re-notification on changes                  |
|  11 | Couple `/marketplace`              | search date/location/category → profile/package → favorite/collection → shortlist/vote/comment                       | Marketplace, Favorites, Shortlists                                | collaborative selection data separate from vendor visibility           |
|  12 | Planner `/requests`                | RFQ manual/AI draft → attach brief → select vendors → send → vendor view                                             | RFQ, Documents, Vendor OS, Notifications                          | recipient delivery state și deadlines; queue/portal isolation          |
|  13 | Vendor then Couple                 | vendor proposal/revision → normalize/analyze → clarify/counter → compare → accept                                    | Vendor OS, Offers, Shortlists, Bookings                           | accepted immutable revision; transactional booking/outbox              |
|  14 | Couple `/contracts`                | upload → scan → OCR/extract → risk/obligation proposals → human review/apply                                         | Files, Contracts, Risks, Tasks, Payments, AI                      | versioned contract cu evidence spans; async pipeline/cost audit        |
|  15 | Owner finance                      | mark contract externally signed → generate payment schedule → due reminder → record partial/full transaction+receipt | Contracts, Bookings, Payments, Budget, Calendar, Overview         | balances/status/stage atomically consistent; finance audit/idempotency |
|  16 | Planner `/risks`                   | create/AI-propose risk → assign mitigation/task → prepare Plan B → resolve/reopen                                    | Risks, Tasks, Contracts, Overview                                 | scored risk history; no AI write without approval                      |
|  17 | Day coordinator `/wedding-day`     | download offline pack → start/complete/delay run item → report incident/photo → ack/resolve or activate Plan B       | Run Sheet, Incidents, Notifications, Documents, Risks             | realtime command center cu offline idempotent sync/escalation          |
|  18 | Planner `/moments`                 | create cue/capture media/lead → mark ready → distribute sheet → vendor acknowledge → complete                        | Moments, Run Sheet, Vendor Messages, Exports                      | versioned team sheet și capture responsibilities                       |
|  19 | Owner `/post-wedding`              | finish returns/refunds/deliverables → thank-you batch → complete booking → review draft/moderation/publish           | Closure, Campaigns, Finance, Reviews, Marketplace                 | closed obligations și rating verified-booking only                     |
|  20 | Owner closure/archive              | validate blockers → explicit close → archive snapshot/checksum → export/download → optional restore                  | Post-Wedding, Archive, Files, Billing, Permissions                | read-only archived workspace cu async restore/recovery/audit           |

### C. Blocaje înainte de implementarea backendului

1. Furnizarea path-ului/repository-ului/branchului/commitului sau arhivei fundației F0/F1 declarate anterior; dacă nu mai există, confirmarea explicită că proiectul curent devine root canonic și fundația se construiește o singură dată.
2. Decizie: plăți reale în WeddingOS sau doar tracking și dovadă.
3. Decizie: abonament și ownership per workspace/nuntă sau per user/account.
4. Matrice finală de capabilities pentru partner/planner/family/collaborator.
5. Guest access per persoană, household sau hibrid și cine poate răspunde pentru copii/plus-one.
6. Unificarea deadline-ului RSVP și politica de modificare după campanii trimise.
7. Unificarea enumului de meniu `copii`/`children` și a tuturor enumurilor română vs cod intern.
8. Alegerea sursei de adevăr pentru guest count; seedul de 24 nu poate alimenta statisticile de 160.
9. Decizie privind vendor marketplace: public self-service, curated/manual sau mixt; proces de verificare.
10. Providerii MVP pentru email și storage; dacă WhatsApp/SMS/push intră sau nu în primul release.
11. Politica PII/retention/GDPR pentru guest allergies, notes, documents și archive.
12. Politica document legal/e-sign: external mark în MVP versus provider e-sign.
13. Clarificarea dacă vendor invoices/receivables sunt tracking sau procesare/payout.
14. Regula de închidere: blocantă strict sau owner override documentat.
15. Definirea `wedding_timezone` și a semantics pentru date all-day/deadline.
16. Alegerea strategiei de migrare seed → API și interdicția surselor paralele; `src/lib/data` rămâne fixture de test, iar `src/lib/services` nu devine un al doilea contract față de shared contracts.

### D. Ordinea recomandată pentru backend — vertical slices

| Slice    | Vertical slice                                            | Done când                                                                                                                                                                                                                                                                                                                                                               |
| -------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slice 0  | **Repository integration**                                | fundația F0/F1 reală este furnizată și comparată; frontendul intră în structura canonică fără al doilea app; sunt eliminate data paths demo paralele; API client, auth guard, workspace bootstrap, shared contracts și error model folosesc implementarea existentă. Dacă artefactul F0/F1 nu mai există, decizia de a construi fundația o singură dată este explicită. |
| Slice 1  | **Authentication and workspace**                          | account/session/workspace/membership/roles/partner invite funcționează end-to-end; tenant isolation și negative cross-tenant tests trec; audit/outbox/idempotency substrate există.                                                                                                                                                                                     |
| Slice 2  | **Onboarding and wedding configuration**                  | draftul, sub-events, locations, priorities și AI initial-plan job sunt persistente/versionate; rerun nu dublează taskuri sau categorii.                                                                                                                                                                                                                                 |
| Slice 3  | **Planning core**                                         | tasks, assignments, dependencies, comments/files, deadlines și transitions sunt canonice; calendar/Overview/activity sunt proiecții coerente.                                                                                                                                                                                                                           |
| Slice 4  | **Budget core**                                           | categories, expenses, payment schedules/transactions și forecast funcționează cu money minor units; vendor/contract refs folosesc IDs; due/paid totals sunt derivate.                                                                                                                                                                                                   |
| Slice 5  | **Guest-to-RSVP flow**                                    | households/guests, import, invitation publish, email delivery, opaque guest grant, RSVP și menu selection actualizează aceleași surse canonice și guest-count projections. Acest slice precede marketplace-ul complet.                                                                                                                                                  |
| Slice 6  | **Seating and guest logistics**                           | RSVP changes propagate la menu/seating/transport/accommodation; capacity, versioning, exports și re-notification sunt tranzacționale/idempotente.                                                                                                                                                                                                                       |
| Slice 7  | **Marketplace to booking**                                | vendor tenant/profile, favorites/shortlists, RFQ, immutable offers și guarded acceptance produc booking fără cross-tenant leakage.                                                                                                                                                                                                                                      |
| Slice 8  | **Contracts, files and finance completion**               | private upload/scan/OCR, contract versions/obligations, payment ledger și receipts sunt legate de booking/budget.                                                                                                                                                                                                                                                       |
| Slice 9  | **Notifications, activity, search, settings and billing** | shell-ul folosește read models reale; preferences/quiet hours, security sessions, subscription/invoices și observability sunt operaționale.                                                                                                                                                                                                                             |
| Slice 10 | **Creative and risk operations**                          | design/moodboard revisions/assets/briefs și Risk/Plan B workflows sunt persistente; AI produce doar proposals aprobabile.                                                                                                                                                                                                                                               |
| Slice 11 | **Wedding Day and Moments**                               | run sheet/incidents/Plan B/moments au realtime, offline idempotent replay, escalation și pack testat la reconnect.                                                                                                                                                                                                                                                      |
| Slice 12 | **Post-Wedding, Reviews and Archive**                     | closure gates, return/refund tracking, thank-you campaign, review moderation și snapshot/export/restore funcționează.                                                                                                                                                                                                                                                   |
| Slice 13 | **AI expansion and Admin hardening**                      | cele 24 de intrări AI au cost/entitlement/audit/fallback; Admin are MFA, step-up, dual approval și control plane separat.                                                                                                                                                                                                                                               |

Nu se începe cu Overview singur și nici cu marketplace-ul înainte de Guest-to-RSVP. Overview devine real după Slice 3 și se extinde incremental. Nu se începe un al doilea backend până când artefactul F0/F1 declarat nu este furnizat sau declarat definitiv indisponibil.

### E. Backend Coverage Matrix

| Modul                       | Date/API                                          | Jobs                     | Storage               | Notificări          | AI                     | Permisiuni                  | Prio / fază          |
| --------------------------- | ------------------------------------------------- | ------------------------ | --------------------- | ------------------- | ---------------------- | --------------------------- | -------------------- |
| Authentication              | User/Session/Auth endpoints                       | tokens/email             | —                     | security email      | —                      | public/self                 | P0 F0                |
| Onboarding                  | Draft/Workspace/complete                          | generation/progress      | inspiration           | completion/error    | plan generation        | O/P                         | P0 F1                |
| Overview                    | dashboard read model                              | projection refresh       | —                     | deep links          | next action            | all scoped                  | P0 F1+               |
| AI Copilot                  | conversations/runs/proposals                      | streaming/tools          | attachments           | run/proposal result | core                   | entitlement+domain caps     | P1 F10, substrate F0 |
| Planning                    | Task aggregate                                    | reminders/templates      | attachments           | assignment/due      | generation             | task caps                   | P0 F1                |
| Tasks                       | task/subresources                                 | overdue                  | files                 | actor/followers     | task Q&A               | task caps/private           | P0 F1                |
| Calendar                    | Event/source projections                          | sync                     | ICS export            | reminder            | timeline context       | calendar caps               | P0 F1                |
| Timeline                    | Milestone graph                                   | recalc/export            | PDF                   | delays              | review                 | planning caps               | P1 F1                |
| Budget                      | categories/scenarios                              | forecast/export          | XLSX/PDF              | threshold           | forecast               | finance                     | P0 F1/F5             |
| Expenses                    | Expense                                           | aggregates               | attachments           | threshold           | cost analysis          | finance                     | P0 F5                |
| Payments                    | schedules/transactions                            | due evaluator            | receipt               | due/paid            | cashflow advice        | finance                     | P0 F5                |
| Guest CRM                   | Household/Guest                                   | import/export            | CSV/XLSX              | invite/remind       | segment help           | guest.pii                   | P0 F2                |
| Households/import           | import rows/jobs                                  | parse/dedupe             | source/error files    | job result          | mapping optional       | guest.pii                   | P0 F2                |
| Invitation Site             | site/version/sections                             | publish/cache/QR         | assets/PDF/PNG        | publish optional    | copy                   | site.publish                | P0 F2                |
| Invitation Editor           | draft/version                                     | preview/publish          | assets                | —                   | writer                 | site.write                  | P1 F2                |
| Campaigns                   | Campaign/Recipient/Delivery                       | fan-out/retry            | report                | all channels        | copy                   | campaign.send               | P0 F2                |
| RSVP                        | form/submission/answers                           | reminders                | export                | response change     | reminder copy          | guest token/admin           | P0 F2                |
| Seating                     | plan/version/assignment                           | auto/PDF                 | PDF                   | publish             | suggestions            | seating.write               | P1 F3                |
| Menus/allergies             | menus/selections/issues                           | export/check             | export                | incomplete/allergy  | anomaly help           | guest/menu caps             | P1 F3                |
| Transport                   | routes/vehicles/assignments                       | optimize/export          | manifest              | route details       | optimize               | logistics                   | P1 F3                |
| Accommodation               | properties/rooms/stays                            | import/export            | XLSX                  | stay details        | assignment optional    | logistics                   | P1 F3                |
| Marketplace                 | VendorProfile/search                              | index/availability sync  | portfolio             | —                   | matching               | public/workspace            | P1 F4                |
| Vendor profiles             | profile/verification                              | moderation/index         | logo/portfolio/docs   | decision            | profile assist absent  | vendor/admin                | P1 F4                |
| Favorites                   | collections/favorites                             | —                        | —                     | —                   | —                      | workspace members           | P2 F4                |
| Shortlists                  | candidates/votes/comments                         | —                        | notes export optional | collaborator        | compare                | vote/decide split           | P1 F4                |
| RFQ                         | RFQ/recipients                                    | send/remind              | attachments           | vendor delivery     | draft                  | procurement                 | P1 F4                |
| Offers                      | offer/revisions/items                             | normalize/expiry         | offer PDF             | receive/expiry      | normalize/analyze      | vendor submit/couple decide | P1 F4                |
| Comparison/negotiation      | revisions/clarifications                          | —                        | PDF                   | messages            | compare/counter        | procurement                 | P1 F4                |
| Bookings                    | Booking/Milestones                                | deadlines                | linked docs           | stage/action        | —                      | procurement                 | P0 F4                |
| Contracts                   | contract/version/obligation/risk                  | scan/OCR/analyze         | PDF/scans             | due/signature       | extract/risk           | contract/finance            | P0 F5                |
| Documents                   | folders/assets/versions/share                     | scan/preview/purge       | all private           | job/share           | OCR/search later       | ACL                         | P0 F0/F5             |
| Design Studio               | concepts/palettes/briefs                          | generation/export        | inspiration/brief     | vendor brief        | concept                | creative                    | P2 F7                |
| Moodboards                  | board/items/revisions                             | image/export             | images                | share               | image generation       | collaborators               | P2 F7                |
| Risks                       | risk/mitigation                                   | evaluator/export         | attachments           | escalation          | assessment             | risk.write                  | P1 F7                |
| Plan B                      | PlanB/activation                                  | fan-out                  | offline snapshot      | urgent push/SMS     | generation             | day.command                 | P1 F8                |
| Wedding Day                 | run sheet/items/incidents                         | offline pack/replay      | docs/photos           | realtime urgent     | situational support    | day roles                   | P1 F8                |
| Moments                     | moments/capture req                               | distribute/export        | media refs            | vendors             | media curation absent  | creative/day                | P2 F8                |
| Calculators                 | client formulas                                   | —                        | —                     | —                   | —                      | all                         | P2 F1                |
| Post-Wedding                | closure/returns/refunds/batches                   | reminders/send           | proof                 | thanks/returns      | thanks absent          | O/P/WP split                | P2 F9                |
| Reviews                     | Review/Moderation                                 | prompts/recalc           | optional media        | vendor/moderator    | writing assist absent  | completed booking           | P2 F9                |
| Archive                     | snapshot/manifest                                 | build/export/restore     | cold archive          | job states          | —                      | O/P read                    | P1 F9                |
| Team                        | membership/invite                                 | invite/revoke            | —                     | email/security      | —                      | O/team.manage               | P0 F0                |
| Activity/Audit              | event stores                                      | export/retention         | CSV                   | —                   | anomaly admin absent   | visibility/caps             | P0 F0/F6             |
| Settings/Billing            | prefs/subscription/invoices/sessions              | GDPR/delete/webhooks     | invoices/export       | security/billing    | entitlement            | self/O                      | P0 F0/F6             |
| Notifications               | notif/delivery/prefs                              | fan-out/retry            | —                     | core                | template copy optional | recipient                   | P0 F6, substrate F0  |
| Command/Search/Quick Create | bootstrap/search/domain commands                  | index                    | —                     | command effects     | fallback               | capabilities                | P1 F6                |
| Guest Companion             | grant/bootstrap/RSVP                              | token/calendar           | ICS                   | guest comms         | —                      | scoped G                    | P0 F2                |
| Vendor Business OS          | vendor dashboard/RFQ/proposal/deliverable/invoice | deadlines/export         | proposal/files        | couple/vendor       | Vendor AI absent       | VO/VT                       | P1 F4/F5             |
| Admin Backoffice            | metrics/verifications/incidents/controls          | monitoring/dual approval | verification docs     | admin/security      | monitoring absent      | PA/SA/M                     | P1 F10               |

## 19. Reguli de implementare derivate din audit

1. Nu elimina niciun control pentru că backendul nu este gata; marchează-l loading/error/disabled numai pe baza capability sau job state real.
2. Nu conecta Overview la endpointuri separate cu agregate contradictorii; folosește un read model compus din surse canonice.
3. Nu permite PATCH arbitrar de status pentru workflow-uri; folosește comenzi de tranziție validate.
4. Nu trimite email/SMS/WhatsApp în tranzacția HTTP; scrie outbox și procesează jobul.
5. Nu expune IDs secvențiale sau storage keys în linkurile Guest/share.
6. Nu permite AI direct DB; toate tool calls sunt schema-validated, authorized și auditate.
7. Nu considera toastul dovadă de succes; UI trebuie să primească resursa/version/job real.
8. Nu copia seedurile în DB ca model final fără normalizare și rezolvarea conflictelor §17.
9. Păstrează designul, textele și navigația; schimbările necesare sunt data plumbing, loading/error/conflict și capability visibility.
10. Actualizează acest document și inventarul JSON când un control/rută/enum este schimbat înainte de implementarea backendului.
