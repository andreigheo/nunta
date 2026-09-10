# Sarbato Copilot — plan de extindere

## Obiectiv

Copilotul trebuie să poată citi starea autorizată a evenimentului, să înțeleagă
resursa deschisă de utilizator, să pregătească una sau mai multe modificări
atomice și să le execute prin serviciile canonice Sarbato. Modelul nu primește
acces direct la baza de date, filesystem, plăți sau secrete.

## Garanții obligatorii

- Workspace-ul, rolul și capabilitățile sunt reverificate înainte de execuție.
- Riscul este derivat de server din registrul acțiunilor, nu din payload-ul
  clientului sau al modelului.
- Orice modificare are preview, versiune optimistă, jurnal de tool invocation și
  rezultat recitit din serviciul canonic.
- Acțiunile cu risc ridicat, publicările, trimiterile externe, ștergerile și
  operațiile în masă cer confirmare explicită.
- Plățile, refund-urile, payout-urile, semnăturile, sesiunile, parolele și MFA
  rămân în fluxurile manuale dedicate.
- Documentele pot fi modificate numai prin vault, upload, scanare și versiuni;
  nu există acces arbitrar la filesystem-ul serverului.

## Etapa 1 — fundație și acoperire

- risc server-owned pentru propuneri editate și generate;
- stare terminală `FAILED` pentru joburile Copilot dead-letter;
- anularea sigură a rulărilor queued/running;
- preferința `research` respectată pe fiecare mesaj;
- ultimele 200 de mesaje, în ordinea corectă;
- limite zilnice validate de configurația tipată;
- memorii noi cu expirare implicită;
- selectarea tuturor domeniilor implementate;
- până la 10 acțiuni atomice într-o singură propunere;
- context prioritar pentru resursa deschisă;
- rezolvarea locală a invitaților numiți explicit pentru mutări la mese;
- editarea metadatelor documentelor prin `document.write`.

## Etapa 2 — buclă de instrumente read-only

În locul unui singur snapshot, modelul primește un catalog mic de interogări
read-only și poate efectua maximum 6 pași:

1. caută resurse după nume sau identificator;
2. citește detaliul și versiunea resursei;
3. verifică dependențele și constrângerile;
4. cere o singură clarificare dacă ținta rămâne ambiguă;
5. construiește preview-ul modificărilor;
6. încheie fără mutație sau cu o propunere validată.

Primele domenii: invitați și mese, taskuri, calendar, buget, transport, cazare,
furnizori, invitații și documente.

## Etapa 3 — execuție compusă

- planuri cu dependențe explicite și valori produse de pașii anteriori;
- execuție tranzacțională pentru modificări din același domeniu;
- pauză, retry, anulare și reluare de la ultimul pas sigur;
- rollback compensator pentru operații care nu pot fi într-o singură tranzacție;
- dif vizual înainte de aprobare și raport canonic după execuție.

## Etapa 4 — memorie și sugestii proactive

- căutare hibridă lexicală și semantică;
- retenție, expirare și ștergere verificabilă;
- sugestii bazate pe termene, buget, RSVP, capacitate, transport și riscuri;
- rate limit, snooze, dismiss și explicația semnalului care a produs sugestia;
- sugestiile nu se execută singure.

## Etapa 5 — evaluare și lansare

- set de scenarii în limba română pentru fiecare acțiune;
- teste pentru țintă ambiguă, versiune stale, tenant greșit, permisiuni lipsă,
  prompt injection, date sensibile, provider indisponibil și buget epuizat;
- canary pe workspace-uri interne;
- metrici: țintă corectă, payload valid, aprobare, execuție, fallback, latență,
  cost și zero mutații neautorizate;
- activarea providerului extern numai după decizia de procesare a datelor și
  verificarea setărilor live.
