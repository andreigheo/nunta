# Sarbato Copilot — plan de control al platformei

## Obiectiv

Copilotul Sarbato trebuie să poată explica starea evenimentului, să găsească informații autorizate, să pregătească modificări verificabile și să execute numai operațiile aprobate pentru rolul și planul utilizatorului. Nu este considerată „conectată” nicio funcție doar pentru că modelul știe să vorbească despre ea.

Harta exhaustivă, generată din cod, este în `docs/COPILOT_PLATFORM_MAP.md`. Comanda `pnpm copilot:map:check` blochează driftul dintre hartă și controllere/pagini.

## Contractul unui instrument complet

O operație devine controlabilă numai după ce are toate elementele următoare:

1. identificator stabil și schemă strictă de intrare/ieșire;
2. verificare de tenant, rol, capabilitate și entitlement în momentul execuției;
3. citire canonică înainte de propunere și diff ușor de verificat;
4. clasificare de risc și confirmare explicită unde este necesar;
5. idempotency și protecție la concurență;
6. jurnal de invocare cu secrete eliminate;
7. recitirea resursei după execuție;
8. teste de succes, permisiuni, conflict, replay și eșec parțial;
9. stări UI clare pentru propus, aprobat, executat, respins și eșuat.

Până atunci operația rămâne `GUIDE_ONLY` sau `INTENTIONALLY_UNSUPPORTED`, iar Copilotul nu poate declara că a executat-o.

## Politica de risc

| Nivel   | Exemple                                                        | Regula                                                        |
| ------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| Citire  | rezumat, căutare, comparație                                   | se execută numai în limita accesului curent                   |
| Scăzut  | creare task, eveniment calendar                                | propunere, preview, aprobare, execuție                        |
| Mediu   | editare, mutare, asignare                                      | diff complet și verificare de versiune                        |
| Ridicat | trimitere, publicare, arhivare, bulk                           | confirmare explicită separată și revalidare imediată          |
| Critic  | plăți, refund, payout, semnătură, parole, MFA, ștergere legală | numai ghidare sau flux manual dedicat; fără execuție autonomă |

## Memorie

- Datele canonice din Sarbato au întotdeauna prioritate față de memorie.
- Memoria semantică folosește PostgreSQL + pgvector și este izolată prin RLS la nivel de workspace și utilizator.
- Se salvează numai preferințe, constrângeri și decizii confirmate sau fapte canonice cu proveniență.
- Parolele, tokenurile, cheile API, datele de card, informațiile medicale și alergiile sunt excluse.
- Memoria poate fi văzută și ștearsă din Copilot; memoria echipei cere dreptul `workspace.update`.
- Dacă embeddings nu sunt configurate, căutarea cade onest pe modul lexical; nu pretinde că a făcut căutare semantică.
- Providerul conversațional selectat este OpenRouter Chat Completions cu `openai/gpt-5.6-luna`; cheia este injectată numai ca secret de runtime. Adapterul cere JSON, îl validează local și nu îi acordă modelului acces direct la mutații.
- Cheia/modelul de chat nu sunt confundate cu embeddings: memoria semantică are configurare și credențiale separate.

## Cercetare pe internet

Cercetarea web este o opțiune explicită per workspace și per mesaj. Folosește instrumentul server-side al providerului, păstrează citări HTTP(S) filtrate și un cache cu termen de prospețime, iar conținutul extern este tratat întotdeauna ca neîncrezător. O rulare de cercetare nu primește instrumente de mutație și nu poate autoriza modificări în platformă.

## Ordinea de implementare

### Acoperire executabilă curentă

- 44 de operații sunt marcate `ACTIVE` în harta generată, fiecare cu schemă strictă și adaptor către serviciul canonic;
- sunt acoperite creare/actualizare pentru taskuri, calendar, riscuri, Plan B, buget, categorii, elemente și cheltuieli;
- sunt acoperite gospodării, invitați, meniuri, planuri de mese, mese și înlocuirea așezărilor;
- sunt acoperite shortlist/favorite furnizori și sincronizarea controlată a datelor invitației;
- sunt acoperite planuri și opriri de transport, proprietăți și sejururi de cazare, RFQ-uri, drafturi de campanie și operațiuni controlate pentru ziua evenimentului;
- registrul read-only acoperă planificare, buget, invitați, meniuri, mese, transport, cazare, invitații, furnizori, contracte, plăți-rezumat, riscuri și ziua evenimentului;
- providerul primește numai contractele acțiunilor relevante pentru mesaj și pagina curentă, nu întregul registru;
- o cerere mai mare poate produce un plan de 2–6 pași; fiecare pas rămâne o propunere atomică, aprobată, executată și auditată separat;
- cardul de aprobare afișează payloadul complet, inclusiv versiuni, sume, date și resurse vizate.

Toate rutele API sunt clasificate exhaustiv. Restul operațiilor rămân explicit numai ghidate sau excluse intenționat; Copilotul nu are voie să pretindă că le controlează.

### Etapa 1 — fundație și transparență

- hartă completă a paginilor și operațiilor API;
- registru de domenii, risc și capabilități;
- propunere -> aprobare -> execuție;
- audit pentru instrumente și redacția secretelor;
- pgvector, RLS și centrul de control al memoriei.

### Etapa 2 — nucleul organizării

- plan, faze, taskuri, milestone-uri și calendar;
- buget, categorii, cheltuieli și scadențe;
- riscuri și planuri de contingență;
- citire contextuală per pagină și sugestii bazate pe starea reală.

### Etapa 3 — invitați și invitații

- gospodării, invitați, taguri, import și validare;
- studio invitații, variante, publicare și distribuție;
- RSVP, meniuri, transport, cazare și așezarea la mese;
- trimiterile, publicările și bulk-urile rămân confirmări explicite.

### Etapa 4 — furnizori și operațiuni

- marketplace, favorite, shortlist, RFQ, oferte și rezervări;
- contracte și documente cu limite de sensibilitate;
- profilul furnizorului, servicii și recenzii;
- ziua evenimentului, incidente, anunțuri, check-in și momente.

### Etapa 5 — cercetare și automatizare

- cercetare web cu surse și prospețime;
- ingestie controlată din documente;
- sugestii proactive explicabile;
- automatizări numai în limitele aceluiași registru de instrumente.

### Etapa 6 — provider, cost și evaluare

- OpenRouter este adaptorul conversațional extern, configurat prin secrete de runtime;
- buget zilnic pe workspace, rezervă conservatoare pentru rulările în curs și cost estimat auditat;
- cache-ul elimină costul repetat al aceleiași cercetări în perioada de prospețime;
- testele contractuale validează JSON-ul providerului, planurile multi-pas, citările și filtrarea URL-urilor private;
- gate-urile native validează tipuri, lint, hartă, Prisma/RLS, teste de domeniu și parcurs browser.

## Criteriul final de acoperire

Release-ul complet cere 100% dintre operațiile din harta generată clasificate explicit drept `ACTIVE`, `READ_ONLY`, `GUIDE_ONLY` sau `INTENTIONALLY_UNSUPPORTED`, fără `UNMAPPED`. Fiecare domeniu trebuie verificat prin teste de API, RLS/permisiuni și un parcurs browser autentic pentru rolurile organizator, colaborator, invitat și furnizor.
