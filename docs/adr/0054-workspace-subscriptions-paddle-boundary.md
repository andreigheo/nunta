# ADR 0054: Abonamente workspace prin Paddle, fără intermedierea plăților furnizorilor

Data: 2026-07-28  
Stare: acceptat

## Decizie

Sarbato oferă trei planuri lunare pentru workspace-ul organizatorului:

- Gratuit — €0;
- Plus — €19/lună;
- Pro — €39/lună.

Abonamentul aparține workspace-ului, nu unui utilizator individual. Accesul
efectiv este intersecția dintre capabilitățile rolului și drepturile planului.
Matricea completă de limite, funcții și roluri este menținută în
`docs/SARBATO_SUBSCRIPTION_PLANS.md`.

În cod și în API-urile providerului, sumele sunt reprezentate în unități minore: `1900` înseamnă €19,00, iar `3900` înseamnă €39,00. Interfața afișează întotdeauna valoarea formatată în EUR.

Paddle este folosit exclusiv ca Merchant of Record pentru abonamentul SaaS Sarbato. Price ID-ul configurat este verificat prin API înainte de checkout: stare activă, EUR, interval lunar și suma exactă a planului.

Sarbato nu acceptă, nu păstrează, nu transferă și nu reconciliază bani între organizator și furnizor. Marketplace-ul poate susține descoperire, cereri, oferte, contracte și evidență operațională, dar orice plată efectivă către furnizor rămâne externă platformei.

## Limita tehnică

Abonamentul cuplului are modele și endpoint-uri separate de tabelele istorice de vendor subscription, payment allocation, settlement și payout. Configurația `WORKSPACE_BILLING_PROVIDER` este independentă de `PAYMENT_PROVIDER`, `SUBSCRIPTION_PROVIDER` și `PAYOUT_PROVIDER`.

Webhook-ul Paddle este verificat pe corpul brut cu HMAC-SHA256, timestamp și comparație constant-time. Workspace-ul este rezolvat din checkout-ul persistent ori din ID-uri provider deja legate; `custom_data.workspace_id` nu este o autoritate de tenant.

Evenimentele sunt idempotente și monotone. Portalul Paddle este creat la cerere și URL-ul temporar nu este stocat. Datele cardului nu intră în Sarbato.

## Viitor

Infrastructura istorică pentru plăți/payout rămâne izolată și neexpusă în produsul live până la o decizie separată juridică, comercială și tehnică. Activarea ei nu este implicită în această integrare Paddle.
