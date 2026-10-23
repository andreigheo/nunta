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

Backup predeploy `20261023T071437Z`; restaurare de probă `20261023T071447Z`, status VERIFIED, obiecte verificate, baza de producție neatinsă. Copia este pe VPS; nu există dovadă de copie off-host.

Imaginile noi se construiesc cu `ops/production/Dockerfile.verified-runtime`, pornind de la ID-ul imuabil al imaginii API active și păstrând Node/OS patchuit. Arborele aplicației și dependențele sunt înlocuite integral cu pachetul verificat de producție; se aplică și actualizările apt disponibile în imagine. Web/API/worker folosesc aceeași bază de aplicație.

Compose aplică, în ordine, `docker-compose.yml`, `docker-compose.security-20261023.yml`, `docker-compose.ux-package-20261023.yml`, explicit cu `-p sarbato-production --env-file /etc/sarbato-production.env`. Se recreează numai api, worker, web, cu `up -d --no-deps`. Nu se rulează `down`, nu se șterg volume și nu se migrează schema.

Rollback: pornește api/worker/web cu primele două configurații din release-ul anterior și revino cu `/opt/sarbato/current` la release-ul anterior. Imaginile vechi și backupul sunt păstrate. În lipsa unei migrații nu este necesară restaurarea bazei pentru revenirea codului.

Starea activării, ID-urile imaginilor și verificarea autenticată pe live se consemnează după livrare în raportul de verificare.
