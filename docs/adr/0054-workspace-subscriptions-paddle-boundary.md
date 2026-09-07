# ADR 0054: Abonamente workspace prin Paddle, fără intermedierea plăților furnizorilor

Data: 2026-07-28  
Stare: acceptat

## Decizie

Sarbato oferă trei planuri lunare pentru workspace-ul organizatorului:

- Gratuit — €0;
- Plus — €27/lună, cu 50 de credite de mesagerie;
- Pro — €59/lună, cu 100 de credite de mesagerie.

Planul Gratuit primește 10 credite de test, acordate o singură dată. Un pachet
suplimentar de 100 de credite costă €12,50 și nu expiră la reînnoirea planului.

Abonamentul aparține workspace-ului, nu unui utilizator individual. Accesul
efectiv este intersecția dintre capabilitățile rolului și drepturile planului.
Matricea completă de limite, funcții și roluri este menținută în
`docs/SARBATO_SUBSCRIPTION_PLANS.md`.

În cod și în API-urile providerului, sumele sunt reprezentate în unități minore: `2700` înseamnă €27,00, `5900` înseamnă €59,00, iar `1250` înseamnă €12,50. Interfața afișează întotdeauna valoarea formatată în EUR.

Paddle este folosit exclusiv ca Merchant of Record pentru abonamentul SaaS Sarbato și pachetele de credite. Price ID-ul configurat este verificat prin API înainte de checkout: stare activă, EUR, interval și suma exactă a produsului.

Sarbato nu acceptă, nu păstrează, nu transferă și nu reconciliază bani între organizator și furnizor. Marketplace-ul poate susține descoperire, cereri, oferte, contracte și evidență operațională, dar orice plată efectivă către furnizor rămâne externă platformei.

## Limita tehnică

Abonamentul cuplului are modele și endpoint-uri separate de tabelele istorice de vendor subscription, payment allocation, settlement și payout. Configurația `WORKSPACE_BILLING_PROVIDER` este independentă de `PAYMENT_PROVIDER`, `SUBSCRIPTION_PROVIDER` și `PAYOUT_PROVIDER`.

Webhook-ul Paddle este verificat pe corpul brut cu HMAC-SHA256, timestamp și comparație constant-time. Workspace-ul este rezolvat din checkout-ul persistent ori din ID-uri provider deja legate; `custom_data.workspace_id` nu este o autoritate de tenant.

Evenimentele sunt idempotente și monotone. Portalul Paddle este creat la cerere și URL-ul temporar nu este stocat. Datele cardului nu intră în Sarbato.

## Viitor

Infrastructura istorică pentru plăți/payout rămâne izolată și neexpusă în produsul live până la o decizie separată juridică, comercială și tehnică. Activarea ei nu este implicită în această integrare Paddle.
