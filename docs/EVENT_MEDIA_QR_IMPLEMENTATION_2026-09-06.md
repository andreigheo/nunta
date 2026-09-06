# Colectarea momentelor prin QR

## Stare

Implementarea a fost dezvoltată în `codex/event-media-qr-20260906`, bazată pe `abb3aca`.
Dezvoltarea și acceptanța inițială au folosit exclusiv baze izolate; starea fiecărui release live se verifică separat prin commit, migrare, servicii și probe publice.

## Flux implementat

- Organizatorul activează colectarea pentru un eveniment existent din `/moments`.
- Primește QR PNG și link cu token opac, poate opri/reactiva colectarea, schimba expirarea sau roti accesul.
- Participantul deschide `/event-upload#token`, fără cont: cameră/galerie, selecție multiplă, progres individual, anulare, reîncercare, nume și mesaj opționale.
- Tokenul este scos din adresă după deschidere și trimis în antetul Authorization, nu în query string. Stocarea în sesiunea browserului este opțională.
- Uploadurile noi ajung direct în zona privată Bunny Storage `sarbato-event-media`. Workerul verifică hash-ul, formatul real, ClamAV și decodarea, generează previzualizarea în aceeași zonă și pune materialul în moderare.
- Organizatorul primește preview-ul și originalul prin URL-uri Bunny CDN cu token și expirare scurtă; fișierele nu sunt expuse prin URL-uri publice permanente.
- Pull Zone-ul adaugă CORS pentru toate formatele acceptate, inclusiv MOV, iar Content Security Policy permite numai endpointul S3 Frankfurt și hostname-urile Bunny CDN necesare uploadului și redării.
- Obiectele mai vechi rămân citibile din providerul înregistrat în baza de date. Integrarea nu migrează și nu rupe materialele existente din MinIO.
- Copia originalului verificat are altă cheie decât cea de upload. Rescrierea ulterioară a adresei temporare nu schimbă originalul descărcabil.
- Organizatorul vede fotografii/video, autor, mesaj, stare; poate aproba, respinge, ascunde/restaura, descărca și cere ștergerea.
- Desktop: grilă cu panou de detalii; mobil/tabletă: detalii în dialog, filtre pe două rânduri pe mobil. Teme light/dark.

## Acces și limite

- Folosește drepturile existente `guest_moment.read` și `guest_moment.moderate`; activarea și moderarea rămân în Pro conform catalogului existent.
- Colectarea ține cont de planul efectiv și de perioada de grație existentă. Nu modifică prețurile sau abonamentele.
- RLS izolează evenimentul și fiecare upload. Participantul nu primește lista materialelor altora.
- Un eveniment/spațiu șters sau un spațiu inactiv nu mai este accesibil prin QR.
- Limită tehnică per colectare: 5 GiB rezervați / 1.000 fișiere; se respectă suplimentar capacitatea totală de stocare a planului, cu blocarea concurentă folosită de celelalte module.
- Imagini: JPG/PNG/WebP, maximum 20 MiB. Video: MP4/MOV/WebM, maximum 100 MiB. Maximum 20 de fișiere într-o serie în interfață.
- Link inițial: 30 zile. Upload semnat: 15 minute. Descărcare: 60 secunde; redare: 15 minute.
- Configurația Nginx din repository permite 100 MiB pe ruta stocării; API-ul pentru documente rămâne la limita sa separată. Aplicarea live se confirmă la cutover.

## Verificări efectuate

- 10 teste de integrare cu PostgreSQL/RLS și stocare reală: acces organizator/străin, izolare între doi organizatori/workspace-uri/evenimente, token invalid sau combinat între portaluri, consimțământ, formate/dimensiuni, idempotentă, concurență, upload lipsă/expirat, reînnoire, cote, pauză/rotire/expirare, eveniment șters, plan și grație, plus flux Bunny complet până la preview și originalul organizatorului.
- 9 teste OpenAPI existente: trecut; noile operații au scheme de request/response și autentificare bearer documentate.
- 11 teste pentru validarea fișierelor, limite, tokenuri și SHA-256.
- 32 teste worker existente: trecut.
- Test browser real pe servicii locale și Bunny: PNG și MP4, întrerupere de rețea + retry, upload direct cross-origin, scanare/derivare, aprobare, redare video prin CDN, original imun la rescrierea staging-ului, fișier corupt respins.
- Browser: 320/390/768 px participant și 390/768/1440 px organizator, fără overflow orizontal al paginii sau erori JavaScript; verificare vizuală light/dark.
- Typecheck web/API/worker/pachete și build API/worker: trecut.
- Lint complet web/API/worker/pachete: trecut.
- Build web optimizat: trecut, 87 pagini prerandate.
- Smoke HTTP pe build: 73/73 rute trecute. Acesta nu reprezintă testarea funcțională a fiecărui modul al platformei.

## Reproducere locală

Folosește Node Linux 22.22.3 și `corepack pnpm` din acest worktree.

1. `node scripts/prepare-media-qr-test.mjs` pregătește numai baza dedicată `sarbato_media_qr_integration_20260906` de pe PostgreSQL local.
2. Rulează testele API cu `DATABASE_URL`/`DATABASE_OWNER_URL` spre această bază, bucket `sarbato-media-qr-test`, Redis DB 13. Nu rula reset pe baza altui proiect.
3. Pentru fixture de browser, setează `MEDIA_QR_FIXTURE_PATH=/tmp/sarbato-media-qr-fixture-20260906.json` la testul de integrare; fișierul conține numai sesiune/token de test și nu se comite.
4. API: `pnpm --filter @weddingos/database exec tsx ../../scripts/media-qr-preview.mjs api`.
5. Worker: aceeași comandă cu `worker`.
6. Web: `API_INTERNAL_URL=http://127.0.0.1:43242 pnpm exec next dev --hostname 127.0.0.1 --port 43241`.
7. `node scripts/media-qr-browser-test.mjs` verifică fluxul. Capturi: `/tmp/sarbato-media-qr-browser-20260906`.

Preview web: `http://127.0.0.1:43241`; API: `http://127.0.0.1:43242`. Dashboardul necesită sesiunea utilizatorului de test, nu autentificarea din producție.

## Limite și verificări înainte de lansare

- Verificările responsive sunt în Chromium, nu pe dispozitive fizice iOS/Android. Camera nativă și codecurile MOV/HEVC trebuie probate pe dispozitive reale; nu toate codecurile acceptate de container sunt redate de fiecare browser.
- Retry-ul păstrează identitatea fișierului cât timp pagina rămâne deschisă. Nu există upload offline/background sau reluare durabilă după închiderea browserului.
- Cotele sunt rezervări conservative, inclusiv sesiuni abandonate. Nu se eliberează automat printr-un simplu retry sau prin moderare, ca să nu poată fi ocolite.
- Curățarea staging-ului după scanare este best-effort. O politică periodică trebuie să identifice numai obiectele temporare expirate, fără să elimine originale vechi încă referite de baza de date. Nu aplica un lifecycle general pe prefixul vechi `private/guest-moments`.
- Fiecare release în producție trebuie să aplice cele trei migrări noi, să reconstruiască API+worker+web, să aplice configurația proxy și să verifice uploadul prin domeniul public/CDN.
- Credentialele Bunny sunt păstrate în afara repository-ului și trebuie injectate ca secrete în mediul de producție; nu se copiază în fișiere versionate sau imagini Docker.
