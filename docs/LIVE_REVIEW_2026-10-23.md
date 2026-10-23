# Sarbato — review live, activitate și experiența organizatorului

Verificat la 23 octombrie 2026, aproximativ 09:15–09:45, Europe/Bucharest.

## Verdict

Aplicația este disponibilă, iar parcursul de bază al unui organizator nou funcționează pe live: înregistrare, livrare reală a e-mailului, verificare, autentificare, creare de eveniment, sarcini, invitați, buget și salvarea invitației/formularului RSVP. Sunt probleme confirmate de consistență a interfeței și un serviciu extern indisponibil în test. Nu există bază pentru a declara toate funcțiile și toate rolurile validate integral.

Nu apar înregistrări sau autentificări noi între 7 octombrie și începutul auditului. Testele din această sesiune sunt separate de activitatea anterioară.

Nu s-a făcut deploy de cod, upgrade de abonament, plată sau schimbare DNS. Actualizarea recomandată trebuie pornită din versiunea live, care este mai nouă decât main.

## Mediul real

| Element | Confirmare live |
| --- | --- |
| Domeniu | https://sarbato.space |
| Server actual | 51.195.86.175 / vps-c078631a |
| Release de bază | /opt/sarbato/releases/20260914T064238Z-0a95835 |
| Commit de bază | 0a9583507bedd7e98822d906fb58279dc82c060c |
| Ramură GitHub corespunzătoare | codex/accommodation-expansion-20260910 |
| GitHub main / checkout local inițial | 4025c7385bb123602e352f8964084de9c82ca823 |
| Diferență main → baza live | 323 fișiere; main nu trebuie redeployat peste live |
| Runtime web | Node v22.23.4, Next 16.4.1, verificate în container |
| Imagini active | security-20261023/*, inventar complet în operational-final.json |
| PostgreSQL | 127 migrări, fără migrări incomplete; ultima 20260912150000_accommodation_provider_leads |
| Stare API intern | ready; database/redis connected; worker healthy; outbox dispatching; identitate și referințe verificate |
| Stare publică | OPERATIONAL |
| Containere | 8 running; cele 7 cu healthcheck healthy; worker fără healthcheck Docker |
| Sistem | zero unități systemd failed; circa 4,4 GiB RAM disponibilă |
| Disc | 81% ocupat, circa 14 GiB disponibili |
| TLS public | Let's Encrypt, expiră 5 ianuarie 2027 |

Aliasurile SSH locale sarbato-vps și shared-vps indică adrese vechi. Auditul a folosit accesul existent și host key verificat pentru serverul pe care indică DNS-ul actual.

Versiunile din sursa release-ului și imaginile active diferă: package.json din release declară Next 16.3.4, imaginea activă rulează 16.4.1. Un build ulterior trebuie să păstreze remedierile runtime și configurația de storage/Compose actuală. Acest review nu este un nou scan complet de vulnerabilități.

## Activitate înaintea auditului

Moment de separare: 23 octombrie 2026, 06:15 UTC / 09:15 București.

| Indicator | Valoare înainte de test |
| --- | ---: |
| Conturi | 11 |
| Conturi cu e-mail verificat | 11 |
| Spații de eveniment | 6 |
| Invitați | 3 |
| Momente ale evenimentelor | 9 |
| Organizații furnizori | 2 |
| Site-uri de invitații | 3 |
| Răspunsuri RSVP | 1 |
| Sarcini | 46 |
| Campanii | 4 |
| Ultima înregistrare | 6 octombrie 2026, 17:26 București |
| Ultima autentificare / activitate a sesiunilor | 6 octombrie 2026, 17:26 București |
| Ultima activitate de produs în activity_items | 6 octombrie 2026 |

Acestea sunt conturi în baza live, nu 11 clienți confirmați. Există date de test și evenimente ale proprietarului; clasificarea fiecărui cont ca test/client necesită contextul proprietarului. Un eveniment vechi are titlul `undefined & undefined`; nu l-am redenumit.

Surse: database-baseline.txt și interogări PostgreSQL în tranzacții READ ONLY.

### Trafic

Logurile disponibile în serverul actual acoperă 16–23 octombrie. Înaintea traficului acestui audit există 250 GET-uri pe pagina principală cu răspuns 200 și user-agent asemănător unui browser, 68 pe sign-in și 43 pe create-account. Nu există POST-uri de autentificare în intervalul analizat. Nu există răspunsuri 5xx în aceste loguri păstrate.

Aceste cifre sunt cereri HTTP, nu persoane. Logurile includ probe automate, scanere și verificări anterioare; unele scanere imită browserul. Adminul de trafic declară explicit GA4 Data API NOT_CONNECTED în implementarea curentă. Nu se poate calcula un funnel valid vizitator → cont din aceste date. Tag-ul din browser și accesul la rapoarte GA4 sunt configurații distincte.

### Abonamente și tranzacții

- 3 tranzacții locale `completed`, toate de 0 EUR. Nicio tranzacție cu sumă pozitivă în tabelul verificat; aceasta nu este o reconciliere contabilă independentă în dashboardul Paddle.
- 2 abonamente PLUS și 1 PRO sunt PAST_DUE din 9 octombrie, cu grație încheiată la 12 octombrie. Reconcilierea a rulat și astăzi; nu este doar o proiecție fără actualizare de câteva luni.
- Codul de entitlement revine la FREE după expirarea grației. Un PRO ACTIVE fără provider nu constituie dovadă de plată recurentă.
- 3 checkout-uri rămân CREATED deși expires_at a trecut; toate au atins 12 încercări de reconciliere. Înainte de a le expira administrativ trebuie verificată starea tranzacției la provider. Nu au fost modificate.

## Teste funcționale efectuate acum

Cont: `andrei+sarbato-audit-20261023@futureforgelabs.dev`, nume `Test Sarbato Organizator Audit`, intent EVENT_ORGANIZER, fără marketing. Acceptarea termenilor a fost confirmată explicit de utilizator. Parola generată a fost ținută temporar în memorie, apoi eliminată; nu este în raport sau în fișiere. Sesiunea de test este lăsată deschisă în browser.

Eveniment: `TEST AUDIT LIVE — 23 octombrie 2026`, tip corporate, ID `9a5f8646-4eeb-486e-a1fb-98759bfe0ad1`.

| Flux | Rezultat și limită |
| --- | --- |
| Înregistrare | PASS, cont persistat în baza live |
| E-mail | PASS, mesaj real primit în Inbox-ul conectat; SPF și DKIM pass |
| Verificarea adresei | PASS, link de unică folosință consumat; e-mail confirmat |
| Login | PASS, sesiune autentică și acces la onboarding |
| Creare rapidă eveniment | PASS, eveniment corporate persistat și dashboard disponibil |
| Sarcină | PASS, creare → reload → atribuire → finalizare; progres 100% vizibil și stare COMPLETED în DB |
| CRM | PASS, grup și persoană sintetice persistate; niciun contact real terț folosit |
| Buget | PASS, țintă sintetică 1.000 RON, categorie 250 RON și estimare 100 RON; totalurile se actualizează; nu este plată |
| Invitație | PASS pentru deschidere și salvare explicită a ciornei; invitația rămâne DRAFT, nepublicată |
| RSVP | PASS pentru salvarea și publicarea versiunii formularului în evenimentul de test; nicio invitație distribuită |
| Preflight invitație | Verificarea serverului blochează publicarea până când formularul RSVP este publicat; checklistul de conținut are rezultate fals pozitive, detaliate mai jos |
| Cazare | FAIL la integrarea externă pentru o căutare de 2 km în jurul Pieței Universității, București; UI spune că OpenStreetMap nu răspunde |
| Planuri | Mese și transport: ecran de limită Plus; centrul operațional: ecran Pro. Nu am cumpărat un plan |
| Documente Free | Butoanele Folder nou și Încarcă sunt dezactivate; încărcarea, scanarea și descărcarea nu au fost executate din acest cont |
| Separare admin | PASS: contul organizatorului ajunge la access-denied pentru platform.dashboard.read; API fără sesiune răspunde 401 |
| Storage public anonim | PASS: listarea bucketului privat răspunde 403 |

92/92 rute au trecut scriptul smoke din release-ul live. Scriptul confirmă HTTP/HTML după redirect; nu dovedește funcționalitatea operațiilor din fiecare pagină.

Au fost capturate 31 pagini principale autentificate, plus stări suplimentare de eroare/verificare. Planul, CRM-ul, bugetul, invitațiile și onboardingul au fost și operate interactiv. Pentru celelalte module s-au inspectat paginile și stările disponibile în planul gratuit.

La 390 px dashboardul și studioul nu produc overflow orizontal al documentului. Dashboardul are circa 7.019 px înălțime, astfel că acțiunea de pornire ajunge sub multe carduri pe telefon. Pagina publică la 360 px nu are overflow orizontal; ancorele locale și deschiderea FAQ-ului testat funcționează.

Distincție mobilă: la deschiderea directă a editorului la 390 px se selectează corect previzualizarea mobilă, aproximativ 87%. Starea desktop la 23% apare când un editor deja deschis pe desktop este redimensionat. Nu este un defect general al primei deschideri pe telefon.

## Probleme și îmbunătățiri prioritizate

### P1 — stări de încredere incorecte în invitație

Reproducere: creează rapid un eveniment corporate fără dată sau locație, deschide studioul, apoi Verifică. UI afișează 6/6 și bifează data, locațiile, RSVP și înlocuirea exemplelor. Coperta spune încă `Data evenimentului` și `Locația va fi anunțată`, RSVP are `Termenul de confirmare`, iar countdownul păstrează 12 septembrie 2027 și arată circa 324 zile.

Surse: `src/lib/invitations/editor-model.ts:703`, `:1094`, `:1106`, `:1113`. Validarea numără șiruri și elemente existente; nu distinge suficient valorile de pornire de conținutul real. Preflightul backend este separat și a blocat corect lipsa formularului RSVP; nu trebuie confundată completitudinea 6/6 cu posibilitatea publicării.

Remediere: valori de pornire explicit incomplete; countdown fără dată reală afișat ca neconfigurat; criterii de completitudine comune și explicite; acțiune Rezolvă pentru fiecare lipsă. Criteriu de acceptare: un eveniment fără dată nu poate primi bifa Data evenimentului și nu afișează countdown către data demonstrativă.

### P2 — indicator Salvat înainte de prima salvare

Înainte de apăsarea butonului de salvare, UI declara `Salvat` / `Invitația este salvată`, dar pentru evenimentul test nu exista niciun rând invitation_sites. După salvare explicită, ciorna există în DB. Nu s-a demonstrat pierderea unor editări; problema este starea inițială fals confirmată.

Surse: `src/app/(app)/invitations/editor/page.tsx:1674`, `:1704`. Remediere: separă Ciornă nouă, Modificări locale, Se salvează și Salvat pe server; ultima stare cere o versiune confirmată de server.

### P2 — termen inventat pentru sarcini fără termen

Am lăsat Termen limită gol. DB păstrează due_at NULL, dar UI arată Termen astăzi și data creării, inclusiv după reload. Nu este o valoare introdusă accidental în DB.

Surse: `src/lib/planning-adapter.ts:86` înlocuiește dueAt cu createdAt; `src/app/(app)/plan/page.tsx:385` folosește data curentă. Remediere: termen nullable de la API până în tipul UI, afișare Fără termen, excludere din clasificarea de urgență și calendare până la alegerea unei date.

### P2 — parcurs de pornire prea lung și cu recomandări concurente

Dashboardul recomandă simultan Completează detaliile și Publică invitația digitală. Arată și zeci de valori zero din module premium sau neconfigurate. Pe telefon, cardurile de pornire singure împing acțiunea sub primul ecran.

Remediere: un singur pas principal derivat din starea evenimentului; sumar compact al reperelor și butonul de acțiune imediat vizibil; restul modulelor într-o zonă secundară extinsă la cerere. Păstrează accesul utilizatorilor avansați și datele existente. Indicator de urmărit: timpul de la cont verificat la primul rezultat util și procentul de organizatori care adaugă un invitat și salvează o invitație.

### P2 — stări de eroare și limite de plan mai clare

- Cazare: la provider indisponibil, titlul 0 variante este ambiguu. Afișează Căutare indisponibilă și ultima actualizare/cache, cu reîncercare controlată. Pentru trafic susținut sunt necesare endpointuri contractate sau administrate, conform runbookului; căutarea nu este rezervare.
- Documente: utilizatorul Free este îndemnat să încarce primul document, dar ambele acțiuni sunt dezactivate. Explică înainte de clic că încărcarea cere Plus și oferă o acțiune relevantă.
- SMS/WhatsApp: canalele sunt etichetate în curs de activare. Numărul de mesaje disponibile și creditele comerciale trebuie explicate fără a sugera că trimiterea este deja activă.

### P2/P3 — experiență adaptată tipului de eveniment

Evenimentul test este corporate, dar CRM-ul păstrează Partener 1/Partener 2, iar categoria sarcinii include Ziua nunții. Formularul RSVP pornește cu multe întrebări de logistică și familie active simultan.

Remediere: etichete și preseturi UI pentru corporate/conferință/nuntă etc., păstrând identificatorii tehnici și compatibilitatea. Un formular corporate poate porni cu participare și contact, cu detalii alimentare/logistice activate la nevoie. Nu redenumi contractele interne weddingos sau rolurile stabile.

### P3 — afișare și conținut public

- La lățimea desktop testată, numele lung al evenimentului depășește selectorul din sidebar și se suprapune peste conținut. Folosește min-width:0 și trunchiere/mărime limitată, cu titlul complet disponibil la cerere.
- Pentru redimensionarea unui editor deja deschis, oferă potrivirea rapidă cu ecranul; nu reseta o alegere explicită a utilizatorului.
- Landingul are buget, furnizori și persoane demonstrative; snapshotul inițial al hero-ului include cifre ilustrative sub Indicatori agregați. Endpointul PublicProductProofV1 returnează corect valori suppressed/null pentru cohortă insuficientă. Aliniază prezentarea cu regula AGENTS.md care interzice bugete fictive și cere numeric proof exclusiv din agregatul validat. Nu prezenta cifrele demonstrative drept utilizare reală.

## Continuitate, backup și operațiuni

Backup nou executat la 09:38:24 București: `20261023T063824Z`. DB și obiectele sunt incluse, criptate și verificate. Restaurare izolată finalizată la 09:38:33 în `weddingos_restore_production_drill`; 12 conturi, 7 spații, 381 outbox messages, verificări de identitate/RLS trecute. Baza sursă nu a fost înlocuită. Readiness a rămas ready.

Lipsa backupului off-host rămâne un risc prioritar: offHost=false, zero markere .offhost-verified, destinație neconfigurată. Copiile locale nu acoperă pierderea VPS-ului. Sunt necesare o destinație externă aleasă și acces separat; nu s-au reutilizat arbitrar alte conturi/servere ale proprietarului.

Discul la 81% merită remediat înaintea buildurilor mari. Backupurile Sarbato ocupă numai aproximativ 71 MiB înainte de testul nou, iar release-urile aproximativ 766 MiB; nu rezultă că acestea sunt cauza principală. Nu s-au șters volume sau imagini de rollback și nu s-au schimbat celelalte servicii ale VPS-ului.

## Ordinea recomandată a actualizării pe serverul actual

1. Păstrează baza live 0a95835 și patchurile runtime/Compose/storage active; înregistrează o revizie reproductibilă. Checkoutul separat pentru acest review este pe ramura codex/live-review-20261023. Nu reseta checkoutul utilizatorului și nu redeploya main.
2. Livrează împreună corecturile de integritate UI: completitudinea invitației, data demonstrativă, Salvat și sarcinile fără termen. Teste țintite pe date lipsă, eveniment corporate și reload.
3. Unifică pasul următor și compactează prima experiență pe desktop/telefon. Adaugă explicațiile pentru limitele Free/Plus/Pro.
4. Rezolvă dependența de cazare și backupul off-host; verifică apoi erorile externe și restaurarea.
5. Rulează lint, typecheck, build și testele relevante pe sursa finală. Pentru landing, build izolat și suita landing conform AGENTS.md.
6. Deploy cu backup proaspăt și rollback pregătit; apoi smoke 92 rute și retestare reală cont → eveniment → sarcină → invitat → invitație/RSVP. Validarea abonamentelor plătite se face separat, fără a iniția automat o plată.

## Limite explicite și starea livrării

Nu au fost testate prin operații reale: achiziție/renunțare abonament Paddle, plată către furnizor, semnătură electronică, payout, SMS/WhatsApp automat, întregul flux vendor, funcțiile Pro, încărcare/scanning/download din plan Plus, RSVP extern trimis de un destinatar și întregul set de invitații/permisiuni de colaborare. Unele integrări sunt intenționat disabled în producție; aceasta nu este echivalent cu un flux validat.

Nu s-a rulat o nouă suită completă lint/typecheck/build/unit/integration în acest audit, deoarece nu a fost schimbat codul produsului. Rezultatele istorice nu sunt prezentate ca teste efectuate astăzi.

Livrat: review, inventar, dovezi live, cont și eveniment sintetice, backup nou și restaurare izolată. Cod de produs modificat: nu. Commit nou: nu. Push: nu. Deploy: nu. Mutare de server: nu.

Artefacte locale: operational.json, operational-final.json, database-baseline.txt, test-persistence.txt, route-smoke.txt, authenticated-route-states.json, public-checks.json, fresh-backup-restore.txt și capturi desktop/mobil în directorul artifacts/live-review-2026-10-23 al checkoutului inițial.
