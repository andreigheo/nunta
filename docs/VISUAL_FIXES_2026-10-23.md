# Corecții vizuale Sarbato — 23 octombrie 2026

## Stare

Activ pe `https://sarbato.space`, serverul confirmat `51.195.86.175` / `vps-c078631a`. Cod web: `40944c8819ed55098d672d7a6c6b97a374b445a5`, imagine `sarbato-web:ux-20261023-r2`, SHA256 `2b95e6d17856737ef60cb4b664f58642bfd2509ad67890fad295f032add25e42`. Release: `/opt/sarbato/releases/20261023T080416Z-40944c8`; build ID `6854Ns-gp1VTLTS_hjRCg`.

S-a recreat numai webul, cu Compose v5.6.1, `up -d --wait --wait-timeout 60 --no-deps web`. API-ul și workerul păstrează imaginile r1, revizia `6e24f6c` și ora anterioară de pornire. Nu există migrații sau schimbări de date. Nu s-a făcut push Git.

## Schimbări

- Cardul „Următorul pas recomandat” adaugă data calendaristică numai dacă sarcina are termen. Pentru o sarcină fără termen apare o singură dată „Fără termen”, fără separator suplimentar.
- Selectorul evenimentului are containerul Dropdown încadrat în lățimea disponibilă a sidebarului. Titlul și rândul datei sunt trunchiate în buton; titlul integral rămâne în atributul title și în numele accesibil.
- În meniul selectorului, titlurile și detaliile se împart pe mai multe rânduri, inclusiv pentru cuvinte foarte lungi. Restul meniurilor folosesc componentele existente fără modificări globale.

## Verificări

- `npm run lint`: trecut, aceleași 9 avertismente Next preexistente, fără erori.
- `npm run typecheck`: trecut pentru web și toate pachetele.
- `npm run build`: trecut cu Node 22.23.4; aplicația construită pornește corect.
- Web: 30 fișiere, 162 teste trecute.
- Smoke: 92/92 rute local și 92/92 pe live.
- Audit npm producție: zero alerte la toate severitățile. Nicio dependență nu a fost schimbată.
- Imaginea reală păstrează Node 22.23.4, Next 16.4.1, React/React DOM 19.2.9 și Sharp 0.35.5; verificarea a inclus încărcarea Prisma și a contractelor. Trivy: zero alerte HIGH/CRITICAL cu patch disponibil și zero alerte HIGH/CRITICAL pentru pachetele JavaScript. Cele 59 alerte de sistem fără patch disponibil rămân documentate din pachetul anterior.
- Comparația configurației înainte de activare: numai imaginea web diferă; variabilele de mediu, volumele, rețelele, celelalte imagini și conținutul fișierelor bind-mount sunt identice.
- Backup predeploy `20261023T075943Z`; restaurare de probă `20261023T075951Z`, status VERIFIED, obiecte verificate, baza de producție neatinsă.
- După activare: web healthy, 0 restarturi, fără OOM; `/ready` ready, database/redis connected, worker healthy, outbox dispatching; status public OPERATIONAL; monitor Result=success / ExecMainStatus=0.

## Verificare vizuală autentificată pe live

S-a folosit evenimentul de test existent, cu titlul `TEST UX — pachet 1 — 23 octombrie 2026`, și sarcina activă fără termen din același workspace. Nu s-au modificat date pentru acest retest.

| Scenariu | Rezultat |
|---|---|
| Desktop 1083 px, după refresh | O singură apariție „Fără termen” în cardul recomandării; 0 sarcini depășite. |
| Selector desktop | Înainte: dreapta 365,86 px, în afara sidebarului de 268 px. După: buton 243 px, de la x=12 la x=255, integral în sidebar. |
| Meniu deschis | Titlurile complete sunt lizibile pe mai multe rânduri. clientWidth=scrollWidth=262 px, fără depășire. Escape închide meniul și redă focusul selectorului. |
| Mobil 360×800, după refresh | O singură apariție în card; clientWidth=scrollWidth=350 px (restul lățimii revine barei verticale de derulare), fără derulare orizontală. |
| Mobil 390×844 | O singură apariție în card; clientWidth=scrollWidth=380 px, fără derulare orizontală. |
| Responsivitate selector | Sidebarul desktop rămâne ascuns sub breakpointul lg, conform designului existent; meniul și navigarea mobilă nu sunt schimbate. |
| Consolă browser | Fără erori sau avertismente în verificarea finală. |

Viewportul a fost resetat la dimensiunea inițială, iar planul a rămas deschis. Capturile și măsurătorile sunt în `artifacts/visual-fixes/`: `desktop-live.png`, `selector-menu-live.png`, `mobile-360-detail-live.png`, `mobile-390-live.png`, `desktop-after.json`, `menu-after.json`, `mobile-360-after.json`, `mobile-390-after.json`. Dovezile de server sunt în `/var/backups/sarbato/visual-fixes-20261023`.

## Revenire

Imaginile și release-ul r1 sunt păstrate. Pentru rollbackul webului se aplică cele trei fișiere Compose din `/opt/sarbato/releases/20261023T072435Z-6e24f6c`, folosind explicit `/opt/security-tools/compose-v5.6.1/docker-compose-linux-x86_64`, proiectul `sarbato-production`, env-file `/etc/sarbato-production.env` și `up -d --wait --no-deps web`, apoi se revine cu symlinkul current la release-ul r1. Nu este necesară restaurarea bazei.
