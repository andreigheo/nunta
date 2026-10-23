# Sarbato — pachetul de corecții și verificarea live, 23 octombrie 2026

**Stare: publicat și verificat pe https://sarbato.space.** Serverul actual este `51.195.86.175` / `vps-c078631a`. Backupul extern și modificările aferente au fost excluse explicit de utilizator. Automatizarea locală existentă a fost păstrată.

## Ce este pe live

| Componentă | Imagine | Revizie |
| --- | --- | --- |
| Web | sarbato-web:ux-20261023-r4 | 842e756dde63449323879e96732a100f2dbed82b |
| API | sarbato-api:ux-20261023-r2 | 1db22173f39f8ba3f974c00e07b79efd55fbcca8 |
| Worker, păstrat | sarbato-worker:ux-20261023-r1 | 6e24f6c76bf52558a310cec8f4b9ec7abf39a922 |

Release activ: `/opt/sarbato/releases/20261023T092756Z-842e756`.

Web BUILD_ID: `_sh3XJS7-e-2lDJM7gsrR`.

Imagini active:

- Web: `sha256:01dd0979cb3421451ccf62cc6d0d46625fc283672b25cb2ff530664feb3ba479`.
- API: `sha256:cb586a6b6632fd8210f8389092e72657010ec8aa32e0a862f137d8701d20d19b`.

Comparația Compose a confirmat păstrarea variabilelor, volumelor, rețelelor, fișierelor montate și serviciilor de infrastructură. Prima actualizare a înlocuit webul și API-ul; ultima corecție a legăturilor publice a înlocuit numai webul. Imaginile și release-urile anterioare sunt păstrate pentru revenire. Checkoutul original al utilizatorului nu a fost modificat de acest pachet. Codul este comis în ramura locală `codex/live-review-20261023`; nu s-a făcut push GitHub.

## Plăți — verificare la procesator înaintea corecției

Au fost interogate direct în Paddle production toate cele nouă checkouturi înregistrate local și cele trei abonamente cu ID de abonament Paddle.

- Cele trei checkouturi finalizate corespund procesatorului și au total zero. Au fost păstrate.
- Cele trei checkouturi locale blocate în CREATED erau draft/ready la Paddle, fără nicio încercare de plată. Corecția le-a anulat la procesator, a verificat răspunsul de confirmare și abia apoi le-a trecut local în EXPIRED.
- Starea finală locală: **3 COMPLETED, 6 EXPIRED, zero CREATED**.
- Checkouturile istorice deja expirate nu au fost incluse în anularea țintită; unul are o încercare action_required, care nu a fost anulată de această intervenție.
- Cele trei abonamente PAST_DUE sunt într-adevăr restante la Paddle. Reînnoirile de EUR 27, EUR 27 și EUR 59 au eroarea `declined_not_retryable`. Titularul trebuie să actualizeze metoda de plată; nu s-a forțat o debitare și nu s-au anulat abonamentele.
- Prețurile configurate sunt active la Paddle și corespund catalogului: Plus EUR 27/lună, Pro EUR 59/lună, 100 credite EUR 12,50, plată unică.

Reconcilierea automată nu mai abandonează definitiv checkouturile după 12 încercări: continuă cu pauză de o oră. Anularea automată este limitată la tranzacții API/web draft/ready fără încercări de plată, fără abonament asociat și cu cel puțin o zi trecută de la expirarea locală. Rezultatele necunoscute, plățile în curs, autorizate sau finalizate sunt păstrate. Crearea unui checkout nu mai expiră local o tranzacție cunoscută sau cu rezultat incert și nu mai reutilizează o sesiune terminală expirată.

Migrarea `20261023110000_checkout_reconciliation_recovery` s-a aplicat prin Prisma oficial, după verificarea identității bazei de producție și a checksumurilor celor 126 de migrări anterioare. Modifică o funcție SQL și granturile ei; nu rescrie rândurile clienților. Checksum: `0e2ec163a796f2602e5ad7de237ed27e6a920d783dd720db6ff9e93dee216173`.

Documentație procesator: https://developer.paddle.com/api-reference/transactions/update-transaction/.

## Cazare

Este activă încercarea limitată prin sursa Overpass configurată și apoi prin Private.coffee. Sunt păstrate verificarea destinațiilor HTTP, atribuirea OpenStreetMap, izolarea cache-ului pe spațiu, limita de vechime a copiei și delimitarea dintre recomandare și rezervare. Nu sunt inventate prețuri, disponibilitate sau rezultate.

Titlul nu mai spune „0 variante” când furnizorul este indisponibil. Copia expirată, când există și este încă în limita permisă, este etichetată explicit. Configurația exemplu și informarea despre operatorul alternativ au fost actualizate.

**Blocaj extern confirmat la retestarea live:** geocodarea Bucureștiului funcționează, dar ambele surse de listări au expirat din nou. Căutarea de 2 km în jurul Pieței Universității a afișat corect „Căutare indisponibilă”, după aproximativ 20 de secunde. Nu poate fi declarată rezolvată disponibilitatea efectivă a căutării. Pentru stabilitate este necesar un endpoint administrat sau contractat; serviciile publice nu oferă o garanție de disponibilitate.

Operator alternativ și condiții: https://overpass.private.coffee/.

## Claritate și experiență

- Documente Free: explicație vizibilă a limitei, legătură spre abonamente și text corect când încărcarea nu este permisă. Restricția de plan este separată de lipsa unei permisiuni de membru. Butonul mobil de folder are nume accesibil.
- Evenimente corporate: etichetele de parte sunt Organizator, Coorganizator și Lista comună, inclusiv în CRM mobil, creare rapidă și segmentarea campaniilor. Valorile tehnice salvate sunt păstrate. Categoria veche „Ziua nunții” este afișată ca „Ziua evenimentului”.
- Formulare RSVP noi: setări inițiale potrivite tipului de eveniment. Pentru corporate, însoțitorul, copiii, meniul, transportul și cazarea sunt opționale și pornesc dezactivate. Formularele deja salvate își păstrează opțiunile.
- Pagina publică: fără identități, furnizori, evaluări, bugete sau cifre de utilizare inventate în suprafețele operaționale. Indicatorii provin din agregatul validat; cei suprimați afișează „Cohortă insuficientă”, iar lipsa datelor afișează o liniuță. Barele nu inventează procente. Legăturile indicatorilor de plan și coordonare duc la secțiunile corespunzătoare.
- Configurația GTM existentă este inclusă în buildul de producție. Testele verifică pornirea doar după acord și păstrarea refuzului. Raportarea administrativă GA4 necesită separat proprietatea și autorizarea server-side.

## Teste și dovezi

- Rulare completă unit: web 164, API 310, worker 51, toate trecute. Rulare API focalizată după ultima protecție de checkout: 59 trecute, inclusiv un caz nou pentru sesiunea expirată.
- Lint și typecheck pe workspace: trecute, cu nouă avertismente Next preexistente despre navigare. Ultimul typecheck API și lintul paginii publice: trecute.
- Build complet de producție și builduri web finale: trecute cu Node 22.23.4. Build public izolat în `.next-landing`.
- Suită publică: 38 trecute inițial, un test GTM omis intenționat fără configurația de test și două reverificări necesare. Ambele reverificări au trecut: geometrie adaptată textelor neutre și temporizarea animației. Cele două teste de consent au trecut și cu configurația GTM de producție. După corecția legăturilor: patru teste relevante, desktop/mobil/indicatori/fallback, trecute.
- Integrare: 22 teste API de bază, 6 comerciale și 8 de invitați/RSVP, trecute. Problemele inițiale locale au provenit din blocarea Express a căii ascunse `.codex` și dintr-un director temporar prea puțin adânc pentru importuri. Testele finale folosesc directoare temporare adecvate; nu s-au slăbit controalele aplicației.
- Migrarea a trecut proba cu rollback pe baza izolată: reluare după limita veche, pauză de o oră și păstrarea checkouturilor finalizate.
- Smoke local: 92/92 rute. Smoke final pe live după ultima publicare: **92/92**.
- Browser live: desktop 1280 px, mobil 360 și 390 px. Documente, CRM corporate, RSVP, plan și calendar fără overflow orizontal în stările verificate. Pagina publică verificată separat pe desktop și mobil.
- Ciornă RSVP corporate salvată din UI, reîncărcată și verificată în PostgreSQL: cele cinci opțiuni rămân false, formularul rămâne DRAFT, fără versiune publicată. Formularul publicat din testul anterior și-a păstrat opțiunile true.
- Sarcina de test fără termen rămâne NOT_STARTED, cu due_at și start_at NULL. După refresh: zero restanțe, o singură etichetă „Fără termen” în recomandare, absentă din calendar.
- Readiness final: bază conectată, Redis conectat, worker healthy, outbox dispatching, identitate și referințe verificate. Monitorul a trecut. În fereastra verificată de 10 minute: zero erori și zero HTTP 5xx în logurile API/worker. Imaginile active nu au restarturi sau OOM.

## Versiuni și securitate

Node 22.23.4, Next 16.4.1, React 19.2.9; dependențele de runtime au rămas pe baza deja remediată. Auditul producției raportează zero vulnerabilități la 611 dependențe.

Scanarea imaginilor web și API: zero alerte HIGH/CRITICAL JavaScript și zero HIGH/CRITICAL cu remediere disponibilă. Cele 59 de alerte de sistem fără fix disponibil pe fiecare imagine rămân raportate, împreună cu alerta braces din instrumentele de dezvoltare, exclusă din producție. Nu se declară întregul VPS lipsit de vulnerabilități.

## Ce mai rămâne

1. Disponibilitatea furnizorului de cazare: blocată extern la verificarea finală. Este necesară o sursă stabilă, administrată sau contractată.
2. Trei abonamente restante: confirmate la Paddle, necesită o metodă de plată validă de la titular.
3. Raportarea GA4: necesită proprietatea și accesul server-side; tagul din browser nu furnizează acces la Data API.
4. Validarea externă cu plată nouă, SMS/WhatsApp și întregul parcurs Pro pe un cont plătit nu este acoperită de această verificare live. Testele comerciale de integrare folosesc furnizori de test în baza izolată.
5. Alertele fără remediere disponibilă necesită urmărire. Nu s-a introdus o excepție de audit.
6. Backup extern: exclus explicit din această intervenție. Dacă este reluat, marcajul prematur din scriptul de upload trebuie corectat înainte de activare. Backupul local existent și restaurarea izolată predeploy au trecut.

Dovezi locale: `artifacts/remaining-package/`. Capturi: `screenshots/documents-desktop-live.png`, `documents-mobile-360-live.png`, `rsvp-desktop-final-live.png`, `rsvp-mobile-390-live.png`, `calendar-mobile-live.png`, `public-desktop-final-live.png`, `public-mobile-final-live.png`.

Dovezi pe server: `/var/backups/sarbato/followup-20261023` și `/var/backups/sarbato/followup-links-20261023`.
