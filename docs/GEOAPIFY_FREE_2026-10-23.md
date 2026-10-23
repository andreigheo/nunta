# Sarbato — Geoapify Free, implementare și verificare live

Acest raport păstrează dovada integrării inițiale. Actualizarea ulterioară pentru duplicate și release-ul activ sunt documentate în [raportul deduplicării](ACCOMMODATION_DEDUP_2026-10-23.md).

Data: 23 octombrie 2026. Stare: publicat pe https://sarbato.space/accommodation și verificat pe desktop și mobil. Proiectul Geoapify „Sarbato” rămâne pe **Free, 0 €/lună**. Nu a fost activat un abonament plătit și nu au fost schimbate abonamentele Sarbato.

## Ce este activ

- Geoapify pentru geocodare și căutarea hotelurilor, pensiunilor, hostelurilor, motelurilor, apartamentelor și cabanelor din jurul evenimentului.
- Cheie privată, configurată exclusiv în mediul API. Nu se află în web/worker, codul sursă, fișierele de build sau variabile publice. Cererile folosesc antetul `x-api-key`, fără cheie în URL, o origine HTTPS fixă, fără redirecturi, validarea DNS existentă, răspuns limitat și timeout de 6 secunde.
- Cheia este restricționată în Geoapify la IPv4/IPv6 ale VPS-ului curent. Accesul de pe server a fost verificat după aplicarea restricției.
- Buget comun în Redis: maximum **2.700 de credite rezervate într-o fereastră mobilă de 24h** și **4 cereri într-o secundă mobilă**. Rezervarea se face atomic înainte de cerere; erorile nu restituie creditele rezervate. Redis indisponibil oprește cererile externe. Consumul manual din afara aplicației nu este inclus în acest contor; dashboardul furnizorului rămâne autoritatea pentru consumul efectiv al contului.
- Maximum 100 de înregistrări apropiate preluate per căutare nouă și maximum 80 afișate. Limitele și înregistrările omise sunt explicate vizibil. Nu se pretinde că rezultatele reprezintă toate unitățile din zonă.
- Adrese normalizate, fără repetarea numelui hotelului, orașului și țării în câmpul străzii. Contactele și facilitățile sunt păstrate numai când există în sursă.
- Proveniență `geoapify`, atribuirea Geoapify/OpenStreetMap în căutare, detaliile recomandărilor și componenta pentru invitați, plus actualizarea informării de confidențialitate.
- Cache separat pe spațiu și furnizor: rezultate 6h, geocodare 30 zile. Copia expirată poate fi afișată explicit ca atare cel mult 7 zile. Sursa indisponibilă nu este prezentată drept absență a cazării.
- Adaptorul OSM anterior poate fi ales explicit prin configurație; nu se schimbă automat proveniența rezultatelor la o eroare Geoapify.

## Publicare

Server confirmat: `51.195.86.175`, hostname `vps-c078631a`.

Release activ: `/opt/sarbato/releases/20261023T111620Z-9062779`.

| Componentă      | Imagine                                 | Revizie                                    |
| --------------- | --------------------------------------- | ------------------------------------------ |
| Web             | `sarbato-web:geoapify-free-20261023-r2` | `90627790004e46ca74efebb07fb165ddacb6e0f3` |
| API             | `sarbato-api:geoapify-free-20261023-r2` | `90627790004e46ca74efebb07fb165ddacb6e0f3` |
| Worker, păstrat | `sarbato-worker:ux-20261023-r1`         | `6e24f6c76bf52558a310cec8f4b9ec7abf39a922` |

Identități verificate după activare:

- Web: `sha256:8e6bedb7ab20bf55e09470cba9958e6673b0bbd4f15b4f51f17e9d3960884e00`.
- API: `sha256:b0b038e211ba4438f94ea9dedd5e0d3028afad8442f6cfe35d17bfde5a37d532`.
- Web BUILD_ID: `iBaAkHch5TT8DWpkrGSiZ`.

Migrarea `20261023140000_geoapify_accommodation_source` adaugă numai valoarea `GEOAPIFY` în enumul de proveniență. Cele 127 de migrări aplicate anterior au fost verificate prin checksum înainte de `prisma migrate deploy`; registrul are acum 128 de migrări. Recomandările OSM existente nu sunt rescrise. Clientul Prisma generat din imaginea API a fost verificat pentru noua valoare înainte de activare. Workerul nu interoghează recomandările sau acest enum și a rămas pe imaginea existentă.

Comparația Compose a confirmat modificarea exclusivă a imaginilor web/API și a celor două variabile Geoapify din API. Infrastructura, montările, rețelele, celelalte variabile și workerul corespund configurației anterioare. Release-ul și imaginile anterioare sunt păstrate pentru revenire.

Backupul local existent și proba de restaurare au trecut înainte de actualizare. Backupul extern a rămas exclus conform cererii utilizatorului. Configurația privată anterioară a serverului este păstrată separat, cu acces restricționat.

Cod: comiturile locale `53ad6f5` și `9062779`, în `codex/live-review-20261023`. Nu s-a făcut push GitHub. Checkoutul original al utilizatorului a fost păstrat.

## Verificări funcționale

### Furnizor real

Probele directe au folosit locuri publice. Numerele sunt înregistrări întoarse de furnizor, nu unități verificate sau un inventar exhaustiv.

| Zonă                           | Rază | Înregistrări | Răspuns direct, de pe calculatorul local |
| ------------------------------ | ---- | ------------ | ---------------------------------------- |
| București, Piața Universității | 2 km | 100          | 1,397 s                                  |
| Brașov, centru                 | 2 km | 92           | 0,997 s                                  |
| Cluj-Napoca, centru            | 2 km | 81           | 0,791 s                                  |
| Bran                           | 5 km | 100          | 0,748 s                                  |

Ulterior, imaginea API candidată a fost rulată pe rețeaua VPS-ului, cu aceeași conexiune TLS la Redis și aceeași cheie restricționată: geocodare reușită, 100 de înregistrări returnate, buget Redis funcțional și noua valoare Prisma prezentă.

### Browser și persistență

- Mediul izolat, cu furnizor Geoapify real și drepturi Pro de test: căutare, date de contact, atribuire, salvarea unei recomandări, reîncărcare și citire ulterioară prin API. Proveniența și atribuirea Geoapify au rămas salvate.
- Desktop 1280 px și mobil 360 px: ambele scenarii au trecut pe buildul de producție; zero erori `pageerror` în probele finale.
- Live, contul de test Free Sarbato: căutare de 2 km în București pe desktop și pe mobil după refresh, **80 de rezultate afișate**, sursă Geoapify/OpenStreetMap și adrese curate. Cache-ul bazei conține 98 de înregistrări valide; două înregistrări din răspunsul de 100 au fost omise. Limita de 100 și cea de afișare de 80 sunt explicate.
- Geometrie live: desktop `innerWidth=1280`, `clientWidth=scrollWidth=1270`; mobil `innerWidth=360`, `clientWidth=scrollWidth=350`. Diferența față de lățimea ferestrei este bara de derulare; nu există overflow orizontal în stările verificate.
- Repetarea căutării live nu a creat cereri noi către furnizor: contorul a rămas la **4 rezervări / 12 credite rezervate** înainte și după repetare.

**Delimitare importantă:** Free Geoapify și Free Sarbato sunt planuri diferite. Contul live de test are Free Sarbato, care permite explorarea; salvarea, editarea și publicarea recomandărilor sunt funcții Plus/Pro existente. Salvarea după refresh a fost verificată complet în baza izolată cu drepturi Pro, nu prin acordarea de drepturi plătite contului de producție. Nu s-au creat rezervări și nu s-au trimis cereri hotelurilor.

### Suite și sănătate

- Web: 165 teste unit trecute.
- API: 322 teste trecute în rularea completă; după corecția finală a mapării, 31 teste focalizate trecute, inclusiv un caz nou pentru limita catalogului. Total 323 de cazuri API distincte acoperite în aceste rulări.
- Worker: 51 teste trecute.
- Lint complet și typecheck pe workspace: trecute; lintul final al modulului API: trecut. Avertismentele de navigare Next preexistente nu au fost transformate în excepții.
- Builduri API, worker și web: trecute; build web public separat în `.next-landing`: trecut. Configurația de rescriere către `http://api:4000/api/v1/:path*` a fost verificată în imaginea web.
- Suita publică desktop/tabletă/mobil: **40 trecute** în rularea completă, cu un test GTM omis inițial deoarece driverul nu avea ID-ul configurat. Acest test a fost reluat separat cu configurația GTM existentă și a trecut. Sunt astfel acoperite toate cele **41 de cazuri distincte**, inclusiv încărcarea după acord și păstrarea refuzului.
- Smoke pe buildul local: **92/92**. Smoke pe domeniul live după publicare: **92/92**.
- Monitor producție: success. Readiness: bază și Redis conectate, worker healthy, outbox dispatching, identitate și date de referință verificate.
- În fereastra verificată de 10 minute sau durata containerului nou: zero erori API/worker și zero HTTP 5xx. Web/API au zero restarturi și zero OOM.

Prima probă de browser pe buildul construit a pornit în paralel cu finalizarea buildului și a primit o pagină fără conținut. După finalizarea buildului și pornirea completă a serverului local, aceleași scenarii au trecut, inclusiv după corecția adreselor. Mesajul de inițializare a routerului observat separat în modul de dezvoltare nu a apărut în probele finale de producție. Au fost corectate și tipurile configurației auxiliare de test; nu s-au slăbit verificările aplicației.

## Versiuni și securitate

Runtime verificat în containerul web activ: Node **22.23.4**, Next **16.4.1**, React **19.2.9**. Nu au fost adăugate dependențe și nu s-au făcut downgrade-uri.

Auditul dependențelor de producție: zero vulnerabilități raportate. Scanările imaginilor finale web/API: zero alerte HIGH/CRITICAL JavaScript și zero HIGH/CRITICAL cu remediere disponibilă. Cele 59 de alerte de sistem fără remediere disponibilă pe fiecare imagine rămân raportate; nu se declară întregul VPS lipsit de vulnerabilități.

## Limite rămase

- Geoapify Free nu include SLA-ul planurilor plătite. La indisponibilitate sau epuizarea bugetului, aplicația folosește copia eligibilă sau explică indisponibilitatea. Nu activează automat un plan plătit.
- Catalogul deschis poate avea înregistrări duplicate, date de contact vechi sau proprietăți lipsă. În proba live au fost observate și variante multiple pentru aceeași denumire/adresă de hostel. Ulterior, deduplicarea prudentă a fost publicată și verificată; vezi raportul dedicat de mai sus. Cazurile ambigue rămân separate.
- Nu există tarife, disponibilitate pe date, confirmări sau rezervări în timp real prin acest adaptor. Organizatorul verifică proprietatea înainte de recomandare sau rezervare.
- Traseul de salvare/publicare printr-un cont Plus/Pro real pe live nu a fost exercitat în această verificare. Integrarea și persistența au trecut în mediul izolat cu drepturile potrivite.

## Dovezi

Locale: `artifacts/geoapify/`, inclusiv capturile `accommodation-live-desktop.png`, `accommodation-live-mobile-360.png`, `geoapify-free-plan-final.png`, probele de cache, migrări, scanări, sănătate și smoke.

Pe server: `/var/backups/sarbato/geoapify-final-20261023`. Prima candidată, neactivată, este documentată separat în `/var/backups/sarbato/geoapify-20261023`. Dovezile nu includ cheia Geoapify.

Decizia tehnică: `docs/adr/0071-geoapify-accommodation-discovery.md`.
