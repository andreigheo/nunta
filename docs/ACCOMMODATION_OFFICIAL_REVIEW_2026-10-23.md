# Cazare: verificare oficială Urban Bliss / Vila Krista

Data verificării: 23 octombrie 2026. Scop: verificarea celor două perechi de listări Geoapify, cu eliminarea numai a duplicatelor suficient confirmate. Nu se schimbă planul Geoapify Free, limitele sau cheia și nu se modifică recomandările/camerele/alocările salvate.

## Vila Krista: pereche confirmată prin coroborare

Surse primare:

- Registrul oficial DGT/SITUR, lista structurilor clasificate, afișată ca actualizată la 23.10.2026: https://se.situr.gov.ro/OpenData/OpenDataList?type=listaCazari . Căutarea `KRISTA` întoarce Casa Krista din Bran, certificat 20618 din 17.10.2019, adresa Strada G-ral Traian Moșoiu 55, operator REIT MARIA, înregistrare F8/56/2018, CUI 38738340. Câmpul web este gol. Datele au fost citite prin interfața publică, inclusiv detaliile extinse ale înregistrării.
- API-ul oficial OpenStreetMap: https://api.openstreetmap.org/api/0.6/node/6054061686.json și https://api.openstreetmap.org/api/0.6/way/273526667.json . Punctul și clădirea au numele `Vila Krista`; clădirea are telefonul public `0751211355`.
- Geometria oficială a clădirii: https://api.openstreetmap.org/api/0.6/way/273526667/full.json . Testul punct-în-poligon confirmă că nodul `6054061686` este în interiorul clădirii `273526667`.

Confirmare a identității operatorului și contactului prin profiluri publice:

- Profilul proprietarului, verificat pe Turistinfo: https://www.turistinfo.ro/bran/cazare-bran/casa_krista-c126540.html . Reit Maria, aceeași adresă 55, descriere și fotografii ale Casei Krista. Este un profil al proprietarului pe o platformă, nu un site independent al hotelului.
- https://travelminit.ro/casa-krista-bran : aceeași adresă, operator REIT MARIA PFA, număr de clasificare 20618 și telefon +40751211355. Folosit ca verificare secundară a contactului, nu ca registru oficial.

**Concluzie:** registrul confirmă unitatea/operatorul/adresa, iar geometria OSM confirmă că punctul omonim este în aceeași clădire. Împreună cu contactul corelat, aceste dovezi justifică tratarea exact a acestei perechi drept aceeași proprietate în lista de descoperire. Registrul nu afirmă el însuși că cele două obiecte OSM sunt duplicate; asocierea este o concluzie de coroborare documentată, nu o declarație a autorității.

## Urban Bliss: insuficient confirmat, păstrat separat

Surse primare pentru înregistrările exacte:

- https://api.openstreetmap.org/api/0.6/node/12989630002.json : tip `apartment`, nume internațional `Urban Bliss`, Mendeleev 30, București, fără telefon sau site.
- https://api.openstreetmap.org/api/0.6/node/12986636984.json : tip `hostel`, nume `Urban Bliss`, fără adresă proprie/telefon/site în etichetele OSM. Geoapify returnează strada în proprietățile normalizate, fără număr; strada lipsește din etichetele OSM brute ale punctului.

Apropierea și aceeași denumire sugerează un posibil duplicat, dar nu stabilesc dacă sunt aceeași unitate sau unități distincte din aceeași clădire. Directoarele care reproduc OSM nu sunt dovezi independente. Verificarea în SITUR după `BLISS` a inclus ambele pagini (38 rezultate); înregistrările Urban Bliss din Cluj și alte unități omonime nu confirmă identitatea punctelor de la Mendeleev 30. Absența unui nume exact dintr-o căutare nu dovedește lipsa autorizării: denumirea legală poate fi diferită.

Proprietatea promovată ca Urban Suites Bliss, https://www.booking.com/hotel/ro/urban-suites-bliss.html , oferă mai multe tipuri de apartamente și nu furnizează o legătură autoritativă între cele două obiecte OSM. Proprietățile Urban Bliss din Voluntari și Portugalia sunt excluse din această asociere. Nu s-a identificat un site propriu sau o identitate oficială care să confirme ambele puncte ca aceeași unitate. Nu se adaugă o regulă de unire pentru Urban Bliss.

## Implementare

Excepție restrânsă la perechea Geoapify cu proveniență `OSM node/6054061686` + `OSM way/273526667`. Se cer numele exact Vila Krista, Bran/România, tipurile cunoscute hostel/guest_house, strada cunoscută cu număr lipsă sau 55, telefonul verificat al clădirii și coordonate la cel mult 25 m de poziția verificată și una de alta. Contacte contradictorii sau numere/apartamente suplimentare păstrează înregistrările separate. Când clădirea nu este în rezultat, punctul rămâne vizibil. Se păstrează o singură înregistrare intactă a clădirii, fără combinarea facilităților/contactelor.

Nu se introduce o regulă generală bazată pe nume, distanță sau apartenența la aceeași clădire. Nu există cereri noi către surse în timpul căutării și nu se adaugă dependențe. Cache Geoapify `identityVersion: 3` împiedică afișarea copiilor dinaintea corecției, inclusiv fallbackul expirat. Mesajul pentru o singură listare omisă are forma singulară corectă.

## Publicare și validare

Publicat pe https://sarbato.space/accommodation , serverul actual `51.195.86.175` / `vps-c078631a`. Release activ: `/opt/sarbato/releases/20261023T130300Z-c56b1a1`.

- Cod: `c56b1a134a9642604d488e3ff8c1f51dc0396af7`, branch local `codex/live-review-20261023`. Fără push GitHub.
- API: `sarbato-api:accommodation-reviewed-20261023-r1`, imagine `sha256:4db1b6229985573dbf1e6e73cb666d11d1f7e9faa6a77a74a9b1aafd4fab32e5`.
- Web și worker păstrate pe imaginile anterioare; comparația Compose confirmă că numai imaginea API diferă. Nu există migrări noi, modificări ale cheii, planului, limitelor, rețelelor sau serviciilor de infrastructură.
- Modulul API din imagine corespunde prin SHA-256 buildului local verificat: `3b1439b214ef4d6971569fae5d552570c8c2f32029f336e10d21e96cd29dbf91`. Node 22.23.4. Next 16.4.1 și React 19.2.9 rămân în imaginea web existentă. Fără dependențe noi.
- Backup local și probă de restaurare: success înainte de activare. Backup extern exclus conform cererii utilizatorului. Release-ul/imaginea anterioară sunt păstrate și activarea a avut rollback automat pregătit.

Verificări încheiate:

- Suita API completă finală: **371 teste trecute / 20 fișiere**, inclusiv punct mai bogat în informații, clădirea canonică stabilă, lipsa unuia dintre membri, alte identificatoare/nume/apartamente/numere/țări/orașe/contacte/poziții/tipuri, Urban Bliss păstrat separat, filtrare și refresh din cache. Corecția Mil Pasos și protecțiile anterioare rămân acoperite.
- Lint complet trecut, cu 9 avertismente Next preexistente și zero erori; lint API final trecut. Typecheck complet trecut. Build complet web/API/worker și recompilare finală API trecute.
- Smoke local pe build complet: **92/92**. Smoke pe domeniul live după publicare: **92/92**.
- Audit dependențe de producție: **0 vulnerabilități raportate**. Scanarea imaginii API: zero HIGH/CRITICAL de pachete JavaScript și zero HIGH/CRITICAL cu remediere disponibilă. Rămân 59 alerte de pachete de sistem fără remediere disponibilă; nu se declară întregul VPS fără vulnerabilități.
- Înainte de activare, imaginea candidată a apelat Geoapify real de pe VPS, folosind aceeași cheie restricționată și Redis TLS: Bran 100 brute / 99 valide / 98 după deduplicare, Krista 2 → 1; Mendeleev București 100 brute / 99 valide / 99 păstrate, Urban Bliss 2 → 2.
- Live în browser, desktop **1280 × 900** și viewport mobil **360 × 900**, inclusiv după reîncărcare: Krista exact o listare cu proveniență `way/273526667`; Urban Bliss exact două listări distincte. Nu este un test pe telefon fizic.
- Fără overflow orizontal: desktop `clientWidth=scrollWidth=1270`; mobil `clientWidth=scrollWidth=350`. Zero erori de consolă capturate în fila verificată.
- Cache live `identityVersion: 3`, Bran 98 înregistrări și o Krista, Mendeleev 99 înregistrări și două Urban Bliss. După repetarea ambelor căutări pe mobil, aceleași `fetched_at` și contor comun neschimbat: **13 cereri rezervate / 45 credite rezervate**. Acesta este contorul de rezervare al aplicației, nu un extras de facturare al furnizorului.
- Monitor producție success. API/web healthy, readiness ready, PostgreSQL/Redis connected, worker healthy, outbox dispatching, identitate și date de referință verificate. Zero restarturi/OOM și zero erori/HTTP 5xx în logurile JSON examinate, pentru maximum ultimele 10 minute sau durata containerului nou.

Geoapify rămâne pe varianta gratuită. Nu s-au activat plăți, abonamente sau drepturi Sarbato suplimentare. Bugetul comun rămâne 2700 credite rezervate / 24h mobil și 4 cereri / secundă mobilă. Nu au fost trimise mesaje sau cereri de rezervare proprietarilor.

Dovezi locale: `artifacts/accommodation-official-review/` (SITUR, JSON și istoricul OSM, fixture public, teste, build, scanări, cache/contor, readiness, capturi desktop/mobil). Dovezi server: `/var/backups/sarbato/accommodation-reviewed-20261023`. Fișierul privat temporar pentru proba furnizorului este șters; cheia nu apare în dovezi sau în sursă.

**Rămas neconfirmat:** relația dintre cele două puncte Urban Bliss. Pentru unirea lor este necesar un identificator de unitate comun ori o confirmare autoritativă a operatorului pentru ambele listări. Repetarea aceleiași informații în directoare bazate pe OSM nu este o confirmare independentă.
