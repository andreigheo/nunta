# ADR 0034: Rating aggregation and public trust

Status: Accepted for Slice 7  
Date: 2026-07-20

## Context

Historical frontend data contains invented star values and review counts. Marketplace needs a replay-safe public trust model sourced only from eligible published reviews.

## Decision

`VendorRatingAggregate` is a per-vendor read model with scaled integer averages (`4.73 = 473`), verified/public counts, distribution buckets and criterion averages. Projection rebuilds from canonical reviews instead of incrementing untrusted payload totals. Hidden, rejected, withdrawn or verification-revoked reviews are excluded; replies never affect scores.

Public marketplace serializers return `averageScaled: null`, count `0` and the copy `Nicio evaluare încă` when no eligible published review exists. Trust indicators are factual projections: verified-booking reviews, response rate/time, booking completion, contract acknowledgement, cancellation and real profile-verification state. Favorites, clicks, paid plans and AI output never affect rating or rank.

## Consequences

- Replay and edit are safe because projection recomputes under a per-vendor transaction lock.
- Review content and public rating change atomically from the public reader's perspective.
- Legacy mock vendor ratings remain demo-only and are removed from production review surfaces.
