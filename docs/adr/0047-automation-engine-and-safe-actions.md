# ADR 0047: Automation engine and safe actions

- Status: accepted for Slice 9
- Date: 2026-07-20

## Context

WeddingOS needs proactive behavior without becoming an arbitrary workflow/code runner or creating recursive event loops.

## Decision

Automation rules use closed trigger and action enums plus a bounded declarative condition DSL (`field`, allowlisted operator, JSON value). JavaScript, SQL, expressions and arbitrary URLs/endpoints are invalid.

The default approval mode is `ALWAYS_REQUIRE_APPROVAL`. A trigger creates a durable execution and dry-run preview. Mutations remain approval-gated unless a persisted policy explicitly permits an allowlisted low-risk action. Actions map to the same canonical command registry used by Copilot proposals.

Executions persist source event, event-chain hash, depth, cooldown window and per-step identity. `(rule, source event)` and step identity are unique. Maximum depth/runs per hour, cooldown and event-chain checks prevent recursion. Retry is bounded per idempotent step; permanent failures are visible, notify the owner and pause/disable a repeatedly failing rule.

Templates are versioned clone sources, not executable rules. Weekly digest is deterministic, timezone/preference aware, deduplicated per workspace/period and may be reformulated without changing canonical metrics.

## Consequences

- Automations cannot invoke arbitrary product or infrastructure operations.
- Every mutation is previewable, reviewable and attributable.
- Recursion, retry and dead-letter behavior are explicit and testable.
- Notifications/activity are projections, not triggers that re-trigger themselves.
