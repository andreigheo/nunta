# Sarbato — primul pachet UX, 23 octombrie 2026

## Conținutul pachetului

- Invitații: aceleași reguli de completare în editor și în API. Textele generice nu îndeplinesc verificările; fiecare rând afișat din program și locații trebuie completat. Ciornele incomplete se pot salva; publicarea lor este refuzată. Secțiunile ascunse sunt excluse. Ciornele existente nu sunt rescrise automat.
- Inițializarea invitației nu inventează agenda sau data numărătorii inverse. Numărătoarea demonstrativă veche nu se afișează când data reală lipsește.
- Salvare: „Ciornă nouă”, „Nesalvat”, „Se salvează”, „Salvat pe server” și erorile sunt stări distincte. Publicarea cere și preflight pozitiv.
- Plan: `dueAt: null` rămâne fără termen în toate prezentările planului. Nu este înlocuit cu data creării, nu este restant și este sortat după sarcinile cu termen.
- Acasă: o singură acțiune de pornire, înaintea listei de pași restrânse. Pentru un eveniment la început, modulele operaționale sunt restrânse și pot fi deschise. Evenimentele cu activitate sau probleme operaționale păstrează modulele deschise.

## Baza și ținta

Baza este revizia reală live `0a9583507bedd7e98822d906fb58279dc82c060c`, nu checkoutul local main mai vechi. Ținta revalidată prin SSH este `51.195.86.175`, `vps-c078631a`, proiect Compose `sarbato-production`, domeniu `sarbato.space`. Checkoutul original cu modificări locale rămâne neatins.

Pachetul nu introduce migrații de bază de date. Configurațiile operaționale au fost reconciliate cu fișierele active de pe server: numele containerelor, volumul Silo și scripturile de backup/restaurare/monitorizare. Serviciile de infrastructură își păstrează imaginile și volumele.

## Versiuni și audit de dependențe

- Node 22.23.4 LTS în containere, Dockerfiles, CI și `.nvmrc`; engines permite ramurile LTS 22 de la 22.23.4 și 24 de la 24.22.1.
- Next 16.4.1, React / React DOM 19.2.9, Sharp 0.35.5.
- Actualizări de securitate pentru Nodemailer, Multer, js-yaml, brace-expansion, grpc-js, proxy-addr, source-map-js, follow-redirects și instrumentările OpenTelemetry. Patchurile minimatch existente sunt păstrate.
- Instrumentele de test/build au fost actualizate la Vitest 4.1.12, Vite 7.3.7, shell-quote 1.11.0, fast-uri 3.1.8.
- `pnpm audit --prod --json`: zero alerte la toate severitățile, 611 dependențe raportate. Instalarea izolată pentru imaginile de producție este `--prod --frozen-lockfile --offline --ignore-scripts`, cu clientul Prisma deja generat și verificat.
- Auditul întregului workspace păstrează o alertă HIGH fără versiune remediată: braces 3.0.3 prin eslint-config-next → fast-glob → micromatch (GHSA-vfj7-8cjw-p6xm). Acest arbore de dezvoltare este exclus din pachetul de producție. Nu există excepție ascunsă în CI sau în security gate.
- Trivy 0.76.1 pe imaginile active: zero alerte HIGH/CRITICAL cu patch disponibil. Există alerte fără patch în distribuția Debian și în metadatele modulului MinIO inclus de Silo. Acestea rămân explicit raportate; un audit npm curat nu înseamnă absența oricărei vulnerabilități în întregul sistem.
- Web și API folosesc Node.js, nu JVM; executabilul Java nu este prezent în aceste containere.

Surse oficiale verificate la 23 octombrie 2026:

- https://nextjs.org/blog/nextjs-security-update-october-14-2026
- https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3
- https://nodejs.org/en/blog/release/v22.23.4/
- https://github.com/advisories/GHSA-jqcg-44mw-7w3h
- https://github.com/advisories/GHSA-qqmp-wf37-98f9
- https://github.com/advisories/GHSA-39m8-27wv-hr27

## Verificări înainte de livrare

- Lint: trecut, 9 avertismente Next preexistente în pagini neatinse.
- Typecheck: trecut pentru web și toate pachetele.
- Web: 30 fișiere, 162 teste trecute, repetate cu Node 22.23.4.
- API: 18 fișiere, 306 teste trecute.
- Worker: 6 fișiere, 51 teste trecute.
- Integrare Slice 3: 8/8 trecute cu Node 22.23.4, PostgreSQL izolat `weddingos_integration`, worker și SMTP Mailpit. Include refuz 422 la publicarea datei demonstrative și revenire la fluxul valid. Timeoutul scenariului extins este 30 secunde.
- `npm run build`: trecut; buildul final web este repetat cu Node 22.23.4, API este recompilat cu Node 22.23.4.
- Build ID web final: `G-7m9CbYbC6QNj-kPfxTS`.
- Pachetul cu dependențe numai de producție pornește cu Node 22.23.4. Smoke: 92/92 rute trecute pe `127.0.0.1:3603`.

## Backup și strategie de livrare

Backup predeploy final `20261023T073036Z`; restaurare de probă `20261023T073046Z`, status VERIFIED, obiecte verificate, baza de producție neatinsă. Copia este pe VPS; nu există dovadă de copie off-host.

Imaginile noi se construiesc cu `ops/production/Dockerfile.verified-runtime`, pornind de la ID-ul imuabil al imaginii API active și păstrând Node/OS patchuit. Arborele aplicației și dependențele sunt înlocuite integral cu pachetul verificat de producție; se aplică și actualizările apt disponibile în imagine. Web/API/worker folosesc aceeași bază de aplicație.

Compose aplică, în ordine, `docker-compose.yml`, `docker-compose.security-20261023.yml`, `docker-compose.ux-package-20261023.yml`, explicit cu `-p sarbato-production --env-file /etc/sarbato-production.env`. Se recreează numai api, worker, web, cu `up -d --no-deps`. Nu se rulează `down`, nu se șterg volume și nu se migrează schema.

Rollback: pornește api/worker/web cu primele două configurații din release-ul anterior și revino cu `/opt/sarbato/current` la release-ul anterior. Imaginile vechi și backupul sunt păstrate. În lipsa unei migrații nu este necesară restaurarea bazei pentru revenirea codului.

## Livrare și verificare finală pe live

Activat pe serverul curent: `/opt/sarbato/releases/20261023T072435Z-6e24f6c`, symlink `/opt/sarbato/current`. Cod live: `6e24f6c76bf52558a310cec8f4b9ec7abf39a922`. Build ID verificat în container: `G-7m9CbYbC6QNj-kPfxTS`. Nu s-a făcut push Git.

| Serviciu | Imagine activă | ID SHA256 |
|---|---|---|
| web | `sarbato-web:ux-20261023-r1` | `4eff30fe8eafe22cb0c36d4f40d67ffe552fd8407d1f258a51bdb891dc65e7b3` |
| api | `sarbato-api:ux-20261023-r1` | `88cc0273623483599f4b02a4d485d5b4ba55830563931067a8dfca475c5ba569` |
| worker | `sarbato-worker:ux-20261023-r1` | `305ae84d26c00ddb31e9fccb62cda08bb10227f8b8bf2e6d1fd35df2867682a1` |

Toate cele trei imagini au eticheta OCI cu revizia completă. Nodemailer 10.0.10, proxy-addr 2.0.8, Sharp 0.35.5, Next 16.4.1, React 19.2.9 și Node 22.23.4 au fost verificate în imaginea reală, împreună cu încărcarea clientului Prisma și a contractelor noi. Trivy raportează pentru fiecare imagine 59 alerte HIGH/CRITICAL de sistem, fără patch disponibil; zero alerte de limbaj HIGH/CRITICAL și zero alerte HIGH/CRITICAL cu remediu disponibil. Nu s-au ascuns alerte printr-un fișier ignore.

La activare, Compose 1.29.2 a eșuat cu `KeyError: ContainerConfig`. Containerele vechi au fost repornite și redenumite la numele inițiale, iar `/ready` și statusul public au revenit corect. Pentru această livrare am instalat separat binarul oficial Compose v5.6.1 în `/opt/security-tools/compose-v5.6.1/docker-compose-linux-x86_64`, verificat prin SHA256 `47737f4236e6d3ccea7291995203f8f018058783b4c3a9469119811a0b5db8c0`. Nu s-a schimbat implicit unealta pentru celelalte aplicații de pe VPS.

Un prim control HTTP al webului a pornit prea devreme și a declanșat rollbackul automat. Activarea finală folosește `up -d --wait --wait-timeout 60 --no-deps api worker web`, așteaptă sănătatea tuturor containerelor și reîncearcă verificările HTTP de pornire. Ambele incidente au fost operaționale; nu s-a modificat sau restaurat baza de producție. Comanda pentru livrări/reveniri folosește explicit binarul Compose v5.6.1 de mai sus, cu proiectul, env-file și cele trei configurații descrise.

Verificarea configurației a comparat în memorie toate variabilele de mediu (fără a le afișa), volumele, rețelele, limitele și conținutul fișierelor bind-mount cu configurația/containerele active: singurele schimbări sunt imaginile web/API/worker.

Smoke public după activare: 92/92 rute pe `https://sarbato.space`. Status public `OPERATIONAL`; `/ready`: database/redis connected, worker healthy, outbox dispatching, database identity/reference data verified. Monitorul a trecut. Web/API/worker: running, 0 restarturi, fără OOM. Consola browserului: fără erori/avertismente în verificarea finală.

Backup și restaurare de probă după livrare: evidența `20261023T074529Z`, status VERIFIED. Backupul, restaurarea și monitorul au toate Result=success / ExecMainStatus=0. Imaginile vechi și release-ul anterior sunt păstrate; contextul și arhivele temporare ale acestui build au fost eliminate după verificare.

## Verificări autentificate în browser

Eveniment separat, exclusiv de test: `TEST UX — pachet 1 — 23 octombrie 2026`, workspace `7b20aa7f-a001-4d63-9a9f-7aa605b229a8`, în contul de organizator deja aprobat.

- Dashboard: o singură acțiune de pornire, lista de pași și modulele sunt restrânse. Modulele se deschid și se închid inclusiv cu Enter. Pe mobil 390×844: document 390 px, scrollWidth 390 px; butonul principal se termină la 408 px, vizibil fără derulare. Viewportul a fost resetat după test.
- Invitație nouă: „Ciornă nouă”, numărătoare fără dată demonstrativă. Publicarea a fost blocată la 1/6 verificări, cu butonul final dezactivat. Salvarea ciornei incomplete a trecut prin „Se salvează” și „Salvat pe server”. O modificare ulterioară a afișat „Nesalvat”, apoi autosalvare; după refresh a rămas „Salvat pe server”. Textul `TEST UX — salvare verificată` este prezent în versiunea curentă din PostgreSQL. Site-ul rămâne DRAFT, fără versiune publicată și fără trimiteri către invitați.
- Sarcină activă nouă: `TEST UX — fără termen — verificare refresh`, status NOT_STARTED, creată cu termen și început necompletate. După refresh: „Fără termen” în tabel, 0 depășite. PostgreSQL confirmă `due_at IS NULL` și `start_at IS NULL`.
- Calendarul din plan nu o plasează pe o zi. Calendarul general a fost și el reîncărcat: 0 date și termene, 0 elemente în toate zilele, nicio dată viitoare și titlul sarcinii absent. Sarcina nu a fost ștearsă sau completată pentru a obține rezultatul.

Capturile și dovezile locale sunt în `artifacts/ux-package/`: `task-without-deadline-after-refresh.png`, `task-after-refresh-ax.txt`, `calendar-after-refresh-live.png`, `calendar-after-refresh-ax.txt`, `database-live-test-proof.txt`, capturile de invitație și dashboard. Dovezile de server sunt în `/var/backups/sarbato/ux-package-20261023`.

## Rămase de rezolvat

1. Backup off-host: copia verificată este pe același VPS. E necesară o destinație separată și o restaurare verificată din acea copie.
2. Alertele de sistem fără patch disponibil și metadatele MinIO incluse de Silo necesită reevaluare când apar remedii sau un plan separat de schimbare a bazei. Nu reprezintă un motiv să reintroducem versiuni vechi de Node/Next/React.
3. `braces` 3.0.3 rămâne în instrumentele de dezvoltare, fără patch publicat. Este absent din instalarea de producție; auditul complet și gate-ul CI continuă să îl semnaleze.
4. Două ajustări vizuale minore observate: „Fără termen” apare de două ori în cardul recomandării din plan, iar un titlu foarte lung de eveniment poate depăși lățimea selectorului din sidebar pe desktop. Nu afectează salvarea, starea de restant sau calendarul.
5. Validarea livrării reale a invitațiilor, a plăților și un test cu un eveniment real nu fac parte din acest pachet. Nu au fost trimise invitații și nu s-au făcut tranzacții în această verificare.
