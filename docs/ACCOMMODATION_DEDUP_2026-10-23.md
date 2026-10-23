# Cazare: deduplicare prudentă — 23 octombrie 2026

Raport al primei publicări. Verificarea oficială ulterioară, corecția Vila Krista și release-ul activ sunt documentate în [raportul surselor oficiale](ACCOMMODATION_OFFICIAL_REVIEW_2026-10-23.md).

Cod aplicație: `6285261`; compatibilitate fișiere de test și pin imagine: `d8e92e2`. Branch local `codex/live-review-20261023`, fără push GitHub.

Schimbarea privește rezultatele Geoapify din Descoperă. Nu rescrie recomandări, proprietăți, camere sau alocări existente. Identificatorul cache Geoapify are `identityVersion: 2`; copiile vechi cu duplicate nu pot reveni nici ca fallback expirat. Geocodarea și limitele furnizorului nu sunt schimbate.

Se păstrează o singură listare intactă pentru aceeași identitate Geoapify/OSM. Între identități diferite este necesară coincidența simultană a numelui actual, adresei cu număr și identificatori de unitate, orașului, țării, telefonului complet și poziției în cel mult 25 m între fiecare pereche. Site-uri contradictorii împiedică eliminarea automată. Prefixele telefonice românești 0/+40/0040 sunt echivalate numai când țara indică România. Mențiunea explicită `(formerly …)` poate fi ignorată pentru numele actual; sufixele de apartament/aripă/filială și punctuația numerelor rămân semnificative.

Nu se combină contacte sau facilități. Cazurile neconfirmate rămân separate: în eșantioanele furnizorului, Urban Bliss și Vila Krista au date incomplete, fără suficiente indicii pentru eliminare automată. Aceste cazuri cer confirmare dintr-o sursă publică autoritativă înainte de o regulă suplimentară.

Verificări deja încheiate: 351 teste API în suita completă; 51 teste focalizate după compatibilizarea loaderului fixture; lint complet (9 avertismente Next preexistente, 0 erori), lint API final, build complet web/API/worker și recompilare finală API; audit producție 0 vulnerabilități; smoke local 92/92; backup local și probă de restaurare success. Backup extern exclus conform instrucțiunii utilizatorului. Nu se adaugă dependențe și nu se schimbă Node/Next/React.

Înainte: cache live, spațiul de test, București 2 km: 98 listări valide, dintre care trei variante Mil Pasos Hostel la Strada Preot Vasile Lucaciu 2 și o proprietate Mil Pasos Penthouse la Bulevardul Corneliu Coposu 7. Limita interfeței rămâne 80; catalogul furnizorului este limitat la 100.

Stare finală: publicat și verificat pe live, pe desktop și viewport mobil.

## Publicare și rezultat live

Release activ: `/opt/sarbato/releases/20261023T123355Z-d8e92e2`, server `51.195.86.175` / `vps-c078631a`.

- API: `sarbato-api:accommodation-dedup-20261023-r2`, revizie `d8e92e28ca9ebc9f3cb65b9f9b0ffa0de116ee05`, imagine `sha256:b5b5ddbacbdfe6d33b79b37a751d6b64676d62320e1c5a8a2fd1f3e3c8c94397`.
- Web păstrat: `sarbato-web:geoapify-free-20261023-r2`, revizie `90627790004e46ca74efebb07fb165ddacb6e0f3`, imagine `sha256:8e6bedb7ab20bf55e09470cba9958e6673b0bbd4f15b4f51f17e9d3960884e00`.
- Worker păstrat: `sarbato-worker:ux-20261023-r1`, revizie `6e24f6c76bf52558a310cec8f4b9ec7abf39a922`.

Comparația Compose a confirmat că diferă numai imaginea API; variabilele, cheia Geoapify exclusiv pe server, limitele, celelalte servicii, montările și rețelele corespund configurației anterioare. Nu există migrări noi. Activarea a avut rollback automat pregătit și a trecut verificările readiness/status înainte de schimbarea legăturii `current`. Release-ul și imaginile precedente sunt păstrate.

Proba Geoapify reală a rulat pe imaginea candidată, în rețeaua VPS, înainte de activare: 100 înregistrări brute → 98 valide → 96 după deduplicare. Modulul API din imagine are același SHA-256 ca artefactul local compilat (`375db5420b060a8440b0b584da6783b9db29a48c4cb0d57c9d692cb2af617a5e`).

După activare, browserul live la **1280 × 900** și **360 × 900**, în ambele cazuri după refresh și o nouă căutare București / 2 km, a afișat:

- exact un titlu `Mil Pasos Hostel` și un titlu separat `Mil Pasos Penthouse`;
- mesajul `2 listări duplicate ale acelorași cazări au fost omise.`;
- 80 rezultate afișate, cu limitele sursei și interfeței explicate;
- atribuire Geoapify/OpenStreetMap și contactele documentate;
- fără overflow orizontal: desktop `clientWidth=scrollWidth=1270`, mobil `clientWidth=scrollWidth=350`;
- zero erori de consolă capturate în fila verificată.

Cache-ul live nou confirmă `identityVersion: 2`, 96 listări și cele două proprietăți Mil Pasos la adresele separate. Copia veche de 98 listări rămâne izolată prin cheia veche și nu a fost servită după refresh. Căutarea mobilă a reutilizat aceeași copie, cu același `fetched_at`: contorul comun a rămas la **7 rezervări / 23 credite rezervate** înainte și după proba mobilă. Prima căutare live cu noua versiune de cache a rezervat 5 credite; geocodarea existentă a fost reutilizată.

Typecheck complet final: trecut. Smoke public după publicare: **92/92**. Monitor producție: success. Web/API healthy, readiness ready, zero restarturi și zero OOM pentru web/API/worker; zero erori și zero HTTP 5xx în logurile JSON examinate (maximum ultimele 10 minute, limitate la durata containerului nou pentru API). Proba de mobil este un viewport responsive în browser, nu un test pe un telefon fizic. Testele de deduplicare nu necesită abonament Sarbato Plus/Pro și nu acordă drepturi suplimentare contului Free de producție.

Geoapify rămâne pe varianta gratuită, cu limita aplicației de 2700 credite rezervate / 24h mobil și 4 cereri / secundă mobilă. Nu a fost activat un abonament plătit. Node 22.23.4, Next 16.4.1 și React 19.2.9 sunt păstrate. Scanarea imaginii API finale: zero alerte HIGH/CRITICAL de pachete JavaScript, zero HIGH/CRITICAL cu remediere disponibilă; cele 59 de alerte ale pachetelor de sistem fără remediere disponibilă rămân raportate. Auditul dependențelor de producție este separat și raportează zero vulnerabilități.

## Dovezi și limite

Locale: `artifacts/accommodation-dedup/`: teste, lint/typecheck/build, audit, pregătire/activare, hash modul, snapshot cache înainte/după, contor comun, sănătate și capturi desktop/mobil. Pe VPS: `/var/backups/sarbato/accommodation-dedup-final-20261023`. Prima imagine neactivată `r1` și release-ul `20261023T123218Z-6285261` sunt păstrate separat; versiunea finală `r2` include corecția loaderului de test CommonJS. Fișierul temporar privat pentru proba furnizorului a fost șters.

Cazurile cu nume asemănătoare și indicii insuficiente sunt păstrate separat. Datele de contact și acoperirea rămân dependente de sursă. Prețurile, disponibilitatea și rezervările în timp real nu sunt furnizate de această integrare. Recomandările salvate anterior nu sunt unite sau șterse automat. Nu există blocaj pentru funcționalitatea de deduplicare publicată; confirmarea manuală a cazurilor ambigue rămâne o posibilă etapă distinctă.
