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
- https://api.openstreetmap.org/api/0.6/node/12986636984.json : tip `hostel`, nume `Urban Bliss`, fără adresă proprie/telefon/site în etichetele OSM. Geoapify îi atribuie strada din contextul geografic.

Apropierea și aceeași denumire sugerează un posibil duplicat, dar nu stabilesc dacă sunt aceeași unitate sau unități distincte din aceeași clădire. Directoarele care reproduc OSM nu sunt dovezi independente. Verificarea în SITUR după `BLISS` a inclus ambele pagini (38 rezultate); înregistrările Urban Bliss din Cluj și alte unități omonime nu confirmă identitatea punctelor de la Mendeleev 30. Absența unui nume exact dintr-o căutare nu dovedește lipsa autorizării: denumirea legală poate fi diferită.

Proprietatea promovată ca Urban Suites Bliss, https://www.booking.com/hotel/ro/urban-suites-bliss.html , oferă mai multe tipuri de apartamente și nu furnizează o legătură autoritativă între cele două obiecte OSM. Proprietățile Urban Bliss din Voluntari și Portugalia sunt excluse din această asociere. Nu s-a identificat un site propriu sau o identitate oficială care să confirme ambele puncte ca aceeași unitate. Nu se adaugă o regulă de unire pentru Urban Bliss.

## Implementare

Excepție restrânsă la perechea Geoapify cu proveniență `OSM node/6054061686` + `OSM way/273526667`. Se cer numele exact Vila Krista, Bran/România, tipurile cunoscute hostel/guest_house, strada cunoscută cu număr lipsă sau 55, telefonul verificat al clădirii și coordonate la cel mult 25 m de poziția verificată și una de alta. Contacte contradictorii sau numere/apartamente suplimentare păstrează înregistrările separate. Când clădirea nu este în rezultat, punctul rămâne vizibil. Se păstrează o singură înregistrare intactă a clădirii, fără combinarea facilităților/contactelor.

Nu se introduce o regulă generală bazată pe nume, distanță sau apartenența la aceeași clădire. Nu există cereri noi către surse în timpul căutării și nu se adaugă dependențe. Cache Geoapify `identityVersion: 3` împiedică afișarea copiilor dinaintea corecției, inclusiv fallbackul expirat. Mesajul pentru o singură listare omisă are forma singulară corectă.

Starea de testare, publicare și verificare live se adaugă după încheierea operațiunilor.
