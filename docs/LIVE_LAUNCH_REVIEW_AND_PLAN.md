# Sarbato — review și plan de lansare live

Data review-ului: 2026-07-28  
Sursă verificată: `/home/andrei/weddingos-beta-operations`

## Verdict

**NO-GO pentru publicare imediată. GO pentru programul de trecere pe live descris mai jos.**

Aplicația are o fundație funcțională și o suită locală puternică de teste, dar mediul care rulează acum nu este producție publică. API-ul și worker-ul folosesc configurație de dezvoltare, servicii locale și furnizori falși. Domeniul `sarbato.space` trebuie verificat pe VPS pentru servire HTTP/TLS. Produsul conține încă rute, ramuri și texte pentru demo/beta, iar documentele juridice publice se declară provizorii.

Trecerea pe live nu poate fi făcută corect prin schimbarea domeniului sau a unui flag. Este nevoie de închiderea tuturor blocantelor de mai jos și de o repetiție externă completă înainte de schimbarea DNS-ului.

## Ce este deja solid

- aplicațiile web, API și worker există și rulează împreună;
- backend-ul are persistență reală PostgreSQL, cozi Redis, stocare de obiecte, roluri și separare între workspace-uri;
- raportul curent consemnează 273/273 scenarii E2E, fără eșecuri, skip-uri sau retry-uri;
- security gate-ul local este `PASSED`;
- backup, restore, observability, deploy și rollback au fost demonstrate într-un mediu local de tip staging;
- imaginile Docker pentru web, API și worker sunt deja definite;
- seed-ul standard scrie doar template-urile de rol, nu creează conturi de test.

Aceste rezultate reduc riscul de produs, dar nu demonstrează producția publică. Evidența curentă se declară explicit `SOURCE_SNAPSHOT_ONLY`, `STAGING_LIKE_LOCAL_ENVIRONMENT` și `NOT READY FOR PUBLIC LAUNCH`.

## Review de lansare

| Zonă                         | Stare             | Constatare                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Produs și teste locale       | Verde condiționat | Suita locală este puternică; trebuie rerulată după eliminarea demo/beta și după integrarea furnizorilor reali.                                                                                                                                                                  |
| Domeniu și TLS               | Roșu              | `sarbato.space` trebuie verificat pe VPS pentru DNS, virtual host, SNI și TLS înaintea lansării.                                                                                                                                                                                |
| Runtime public               | Roșu              | Web-ul rulează local în mod production, însă API-ul și worker-ul rulează cu `NODE_ENV=development`, baze și servicii loopback.                                                                                                                                                  |
| Demo                         | Roșu              | Există cookie și transport policy demo, autentificare demo, workspace demo, date statice și ramuri demo în multe pagini.                                                                                                                                                        |
| Beta                         | Roșu              | Există rutele `/beta`, `/beta-invitation`, `/admin/beta`, API-uri beta, capabilități beta și UI „Centrul Beta”.                                                                                                                                                                 |
| Furnizori externi            | Roșu              | Abonamentele workspace au integrare Paddle dedicată, dar lipsesc credentialele și Price ID-urile production; emailul curent merge spre Mailpit local. Semnătura și AI necesită decizie/configurare production. Plățile cuplu–furnizor și payout-urile nu fac parte din lansare. |
| Siguranța configurației      | Roșu              | Schema production impune HTTPS și Redis TLS, dar nu interzice explicit providerii `fake`, emailul `console`, MinIO/local endpoints sau toate secretele implicite.                                                                                                               |
| Proveniență și release       | Roșu              | Checkout-ul nu are `.git`; CI există ca fișier, dar nu poate oferi commit/tag/release imuabil din acest snapshot. Nu există workflow de producție.                                                                                                                              |
| Bază de date live            | Roșu              | Nu există încă instanță production separată, roluri production verificate, migrare semnată sau dovadă de restore extern.                                                                                                                                                        |
| Stocare și fișiere           | Roșu              | Stocarea și ClamAV sunt locale. Nu există bucket production privat, lifecycle, backup separat și test de download/upload public.                                                                                                                                                |
| Observability și on-call     | Galben/roșu       | Prometheus/Grafana/Alertmanager există local; nu există receiver extern verificat, paging real, SLO sau rotație on-call.                                                                                                                                                        |
| Backup și dezastru           | Galben/roșu       | Backup/restore local este verificat; copia nu este off-host și nu dovedește RPO/RTO production.                                                                                                                                                                                 |
| Date de test și artefacte    | Roșu              | Directorul conține sute de exporturi/importuri generate. Acestea nu trebuie să intre în repository-ul sau imaginea de producție.                                                                                                                                                |
| Juridic și confidențialitate | Roșu              | Termenii și confidențialitatea spun „acces timpuriu” și promit documentație finală ulterioară; lipsesc identitatea juridică finală și aprobarea legală.                                                                                                                         |
| Brand și copy                | Galben            | Sarbato este identitatea unică din landing și produs; trebuie eliminată terminologia demo/beta/acces timpuriu din întreaga suprafață publică și autentificată.                                                                                                                  |
| VPS                          | Necunoscut critic | VPS-ul primește DNS-ul domeniului, dar trebuie auditat pentru capacitate, izolare, servicii existente și conflictul dintre CloudPanel/Nginx și Caddy.                                                                                                                           |

## Regula de produs pentru live

În build-ul și runtime-ul de producție:

1. utilizatorul nu vede și nu poate activa demo, beta, sandbox sau date exemplu;
2. orice acțiune afișată este conectată la API și persistă sau raportează clar o eroare reală;
3. un provider extern neconfigurat oprește pornirea serviciului sau ascunde complet funcția înainte de build;
4. Paddle procesează exclusiv abonamentul Sarbato al workspace-ului. Sarbato nu încasează, nu păstrează și nu transferă bani între organizatori și furnizori; procesarea acestor plăți și payout-urile sunt în afara scope-ului de lansare și nu sunt prezentate ca funcționale;
5. datele de test, exporturile locale și conturile `@weddingos.local` nu ajung în production;
6. migrațiile istorice nu se rescriu și nu se șterg. Eliminarea beta se face prin cod nou și migrații forward-only.

## Plan de execuție

### Etapa 0 — contractul de live și înghețarea scope-ului

- declarăm `sarbato.space` drept URL canonic;
- inventariem modulele care trebuie să fie live: conturi, planificare, invitații, RSVP, furnizori, marketplace, oferte, contracte, tracking financiar fără procesare, abonamente Sarbato, documente, semnătură, ziua evenimentului, AI, suport și administrare;
- pentru fiecare modul stabilim testul de acceptanță și dependența externă;
- oprim adăugarea de funcții noi până la lansare;
- transformăm acest document în checklist unic; rapoartele beta vechi rămân doar istoric și nu mai reprezintă starea curentă.

**Gate:** nicio funcție promisă pe landing nu rămâne fără proprietar, API real, persistență și test de acceptanță.

### Etapa 1 — proveniență, curățarea sursei și release imuabil

- inițializăm un repository Git privat din snapshot-ul verificat;
- excludem `ops/artifacts`, `ops/imports`, datele locale, exporturile, secretele și alte fișiere generate;
- păstrăm `pnpm-lock.yaml` ca lockfile canonic și eliminăm lockfile-ul npm după verificare;
- actualizăm documentația tehnică rămasă în urmă față de runtime;
- activăm CI pe branch protejat: format, lint, typecheck, unit, integration, build, E2E, audit, gitleaks, SBOM;
- generăm imagine/tag/checksum din commit, nu din directorul curent;
- adăugăm workflow controlat pentru staging și producție, cu aprobare și rollback.

**Gate:** fiecare artefact deployat poate fi urmărit la un commit și un checksum; repository-ul nu conține date sau secrete locale.

### Etapa 2 — eliminarea completă a demo și beta din produsul live

- eliminăm CTA-urile și textele demo din landing, sign-in, FAQ, privacy/cookies și shell;
- eliminăm cookie-ul `weddingos_demo`, query-ul `?demo=1`, transport policy, bootstrap-ul și workspace-ul demo;
- conectăm paginile care încă folosesc date statice la endpoint-urile reale;
- eliminăm rutele `/beta`, `/beta-invitation` și `/admin/beta`;
- înlocuim „Centrul Beta” cu un centru production de suport/release doar dacă funcționalitatea este utilă;
- eliminăm `BetaStatusPill`, capabilitățile și navigația beta din runtime;
- facem migrații forward-only pentru arhivarea/renumirea datelor beta existente;
- eliminăm `NODE_ENV=beta` și configurația operațională beta din calea production;
- adăugăm un scanner CI pentru termeni și importuri interzise în bundle-ul production.

**Gate:** scanarea bundle-ului și testele de browser nu găsesc nicio intrare demo/beta accesibilă; toate paginile folosesc date reale.

### Etapa 3 — furnizori reali și abonamentele Sarbato

- configurăm Paddle production exclusiv pentru planurile workspace Gratuit, Plus (€19/lună) și Pro (€39/lună);
- configurăm email, object storage, semnătură electronică și AI conform funcțiilor păstrate în scope;
- înlocuim adaptoarele generice cu integrări vendor-specific documentate;
- implementăm credential management, webhook signing, idempotency, retry, reconciliation și audit;
- validăm checkout-ul abonamentului, activarea, schimbarea planului, past-due, anularea la sfârșitul perioadei și portalul de facturi/card;
- verificăm că Price ID-urile Paddle corespund exact sumelor €19 și €39, în EUR, cu recurență lunară;
- dezactivăm și scoatem din navigația live orice comandă de procesare/payout cuplu–furnizor; modelele istorice rămân izolate pentru o decizie viitoare;
- validăm creare, trimitere, semnare, refuz, expirare și evidence package pentru semnătură;
- validăm email delivery, bounce, complaint, unsubscribe și domeniul de expediere;
- validăm upload, antivirus, quarantine, presigned download și ștergere/lifecycle;
- validăm AI fără fallback deterministic tăcut și cu control de cost/rate-limit.

**Gate:** nu există provider `fake`, `console` sau endpoint local în production, iar fiecare flux are dovadă end-to-end în conturile reale ale furnizorilor.

### Etapa 4 — întărirea configurației production

- production refuză la pornire:
  - provider `fake`, email `console`, storage `minio` local;
  - HTTP pentru URL-uri publice/provider/storage;
  - hostname loopback/local;
  - secrete implicite, scurte sau marcate local/test/staging;
  - `DATABASE_PURPOSE` sau `STORAGE_PURPOSE` diferit de `production`;
  - demo mode activ;
- separăm secretul de migrare de rolurile API și worker;
- rotim toate credentialele locale care au apărut în configurații;
- introducem secret store și rotație documentată;
- adăugăm test automat care dovedește că o configurație production nesigură nu pornește.

**Gate:** serviciile pornesc numai cu configurația completă și sigură de producție.

### Etapa 5 — infrastructura VPS și domeniul

- audităm VPS-ul `213.32.67.56`: CPU/RAM/disk, servicii existente, porturi, firewall, utilizatori, patch-uri și backup;
- alegem un singur terminator TLS:
  - CloudPanel/Nginx dacă WeddingOS rămâne pe VPS-ul comun; sau
  - Caddy numai pe un host dedicat fără conflict pe 80/443;
- creăm utilizator și directoare dedicate Sarbato, fără rulare ca root;
- expunem public doar 80/443; web, API, worker, DB, Redis, storage și observability rămân pe rețele private/loopback;
- provisionăm PostgreSQL production, Redis TLS/auth, bucket privat, ClamAV și backup off-host;
- configurăm `sarbato.space`, `www.sarbato.space`, redirect canonic, TLS automat, HSTS, CSP și rate limiting;
- configurăm DNS-ul de email: SPF, DKIM și DMARC;
- adăugăm health/readiness checks și restart controlat.

**Gate:** SSL Labs/certificate chain, HTTP headers, DNS, health checks și izolarea porturilor trec din exterior.

### Etapa 6 — date production, juridic și operațiuni

- creăm o bază production curată și aplicăm toate migrațiile cu job separat;
- rulăm doar seed-ul de reference/role templates;
- verificăm explicit absența conturilor locale, participanților beta și datelor generate;
- finalizăm Termeni, Confidențialitate și Cookies cu operatorul juridic, adresă, contact, temeiuri, retenție, subprocessori și drepturile persoanelor;
- configurăm consent management real și politica analytics;
- publicăm contact de suport, flux de incident, status page și procedură de reclamații;
- definim SLO, alerte, receiver extern și on-call;
- configurăm backup criptat off-host și restaurare automată într-un mediu izolat;
- aprobăm RPO/RTO, runbook-ul de incident și runbook-ul de rollback.

**Gate:** aprobări juridice și operaționale semnate; restore-ul extern și alerta către un om sunt demonstrate.

### Etapa 7 — staging extern identic cu producția

- deployăm același artefact care va merge în production;
- folosim infrastructură și provideri separați, dar aceeași topologie și aceleași reguli production;
- rulăm migrarea, suitele unit/integration/E2E, smoke public anonim și smoke autentificat pe toate rolurile;
- rulăm fluxurile reale de provider cu valori controlate;
- testăm sesiuni vechi, schimbare de cont, permisiuni owner/planner/vendor/admin, CSRF, MFA și step-up;
- testăm backup/restore, incident, alertă, deploy repetat și rollback;
- rulăm scanare de securitate externă și capacity/load test.

**Gate:** zero critical/high, zero skip/retry ascuns, rollback și restore demonstrate pe artefactul candidat.

### Etapa 8 — lansarea `sarbato.space`

- facem backup final și captură de stare;
- reducem TTL-ul DNS înainte de fereastra de lansare;
- aplicăm migrațiile, deployăm artefactul semnat și verificăm readiness;
- activăm virtual host-ul și certificatul pentru `sarbato.space`;
- rulăm smoke anonim, creare cont, verificare email, login, creare workspace, flux owner, vendor și admin;
- verificăm upload, invitație, RSVP, marketplace, contract, tracking financiar, abonamentul Paddle, semnătură și notificări;
- monitorizăm erori, latență, cozi, webhook-uri, emailuri și DB;
- dacă un gate eșuează, executăm rollback-ul documentat, nu patch-uri manuale pe server.

**Gate:** toate testele production sunt verzi și nu există fallback fals sau date exemplu.

### Etapa 9 — primele 72 de ore și operare continuă

- monitorizare întărită și triere rapidă a incidentelor;
- verificare zilnică a backupurilor, cozilor, webhook-urilor și reconcilierii financiare;
- revizuire a alertelor și a erorilor reale;
- patch-uri numai prin Git, CI și release nou;
- raport post-lansare cu incidente, costuri, capacitate și acțiuni.

## Ordinea critică

`Git și curățare sursă` → `eliminare demo/beta` → `furnizori reali` → `production fail-closed` → `VPS și servicii production` → `legal/ops` → `staging extern` → `live`.

DNS-ul nu se schimbă înainte ca etapele 1–7 să fie închise.

## Criterii finale de GO LIVE

- [ ] `sarbato.space` și `www.sarbato.space` au DNS și TLS valide;
- [ ] nu există demo/beta accesibil sau vizibil în build-ul production;
- [ ] nicio pagină nu folosește date statice ca și cum ar fi reale;
- [ ] production nu poate porni cu provider fake/local/console sau secrete implicite;
- [ ] Paddle are cont production aprobat, Price ID-uri exacte, webhook semnat și portal testat exclusiv pentru abonamentele Sarbato;
- [ ] nicio suprafață live nu promite procesare, escrow sau payout între cupluri și furnizori;
- [ ] Git commit, tag, checksum, SBOM și artefactul deployat coincid;
- [ ] baza production este curată, migrată și fără conturi/date de test;
- [ ] backupul este off-host și restore-ul izolat a trecut;
- [ ] alertele ajung la o persoană și runbook-urile sunt testate;
- [ ] documentele juridice finale sunt aprobate și publicate;
- [ ] testele complete, smoke-urile externe, securitatea și load test-ul sunt verzi;
- [ ] deploy-ul și rollback-ul au fost repetate pe staging extern;
- [ ] lansarea are un responsabil tehnic, unul operațional și o decizie GO/NO-GO consemnată.

## Prima tranșă de implementare

Prima tranșă trebuie să închidă etapele 1, 2 și 4: repository/proveniență, eliminarea completă demo/beta și validarea production fail-closed. În paralel se pot deschide conturile furnizorilor și provisiona infrastructura, dar acestea cer credentiale, 2FA, contracte sau decizii care aparțin operatorului.
