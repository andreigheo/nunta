# WeddingOS — launch checklist

Actualizat: 21 iulie 2026

Acest checklist este un gate, nu o listă de intenții. Un element se bifează numai cu dovadă atașată din mediul țintă.

## Gate A — local engineering

- [x] Migrarea goală reconciliată factual.
- [x] Main și E2E au 87 migrații aplicate, 0 eșuate.
- [x] Format, lint și typecheck trec.
- [x] Unit 205/205.
- [x] Integration 38/38.
- [x] E2E 233/233, 0 skipped, 0 retries.
- [x] API, worker și frontend builds trec.
- [x] Runtime local persistent, enabled, `Restart=always`.
- [x] Restart recovery verificat prin API readiness și HTTP 200.
- [x] Admin grant și dashboard real verificate.
- [x] Privacy Center și rutele legale verificate.
- [x] Metrics private verificate.
- [x] Backup DB criptat și restore disposable local verificate.
- [ ] Cauza dispariției seed-urilor Slice 10 după suita completă este identificată și prevenită.

## Gate B — controlled beta

- [ ] MFA real obligatoriu pentru platform roles critice.
- [ ] Step-up pentru acțiuni critice.
- [ ] CSRF token explicit implementat și testat.
- [ ] SSRF guard central implementat și testat.
- [ ] Maintenance mode afectează controlat traficul.
- [ ] Personal data export produce artifact securizat.
- [ ] Deletion workflow tratează corect datele owned/shared.
- [ ] Retention și purge sunt executabile, idempotente și legal-hold aware.
- [ ] Security detection creează events/alerts reale.
- [ ] Alert destination este configurată și testată.
- [ ] Tracing este exportat și redactat.
- [ ] Object storage backup este inclus.
- [ ] Backup off-host și schedule sunt active.
- [ ] Restore staging-like a trecut.
- [ ] Vulnerability scan a trecut.
- [ ] Secret scan a trecut.
- [ ] SBOM a fost generat și arhivat.
- [ ] Review securitate pentru beta este aprobat.

## Gate C — public launch

- [ ] Repo Git și commit/tag de release au provenance verificabilă.
- [ ] Release manifest și approvals sunt complete.
- [ ] Staging deployment a trecut toate gate-urile.
- [ ] Production domain și TLS sunt active.
- [ ] Production database este provisionată, izolată și migrată.
- [ ] Production object storage este privat și configurat.
- [ ] Secrets manager este configurat; niciun default local nu este acceptat.
- [ ] Provider credentials și webhook endpoints sunt configurate/verificate.
- [ ] Observability dashboards, tracing și paging sunt active.
- [ ] Backup off-host include DB și obiecte.
- [ ] Restore production-like și rollback rehearsal au trecut.
- [ ] RPO/RTO au fost măsurate și acceptate.
- [ ] Documentele legale au review și versiune de lansare.
- [ ] Privacy/DPA/subprocessor review este aprobat.
- [ ] Security review/penetration test este aprobat.
- [ ] Incident response on-call și contacte sunt confirmate.
- [ ] Go/no-go este semnat de product, engineering, security și legal.

## Current decision

```text
NOT READY FOR BETA
NOT READY FOR PUBLIC LAUNCH
```

Nu se promovează mediul și nu se începe public launch cât timp există un element nebifat în gate-ul relevant.
