---
name: accounting-feature-decisions
description: Design decisions and intentionally-deferred work for the income/expense + balance (account) feature
metadata:
  type: project
---

The expense system was extended (2026-06) into a basic accounting system, per the user's request.

**Model chosen:** real-balance primary (เงินต้น/opening + income − expense = closing) with a monthly budget cap as a secondary layer. Carry-over is automatic across months but override-able.

**Key implementation facts:**
- Transactions live in the existing `expenses` collection; direction is the `type: 'income' | 'expense'` field (records without it default to 'expense'). `amount` stays positive.
- Balances are **computed on read** (never stored) by `AccountService.getBalance`, walking forward from the nearest opening-balance override (anchor). Only `account_months` docs store override + budget. This is deliberate so back-dated edits can't leave a stale balance.
- `manage_account` tool + `account_management` skill expose balance / set_balance / set_budget to the chat agent.

**Intentionally deferred (was "Phase 4" in the plan — NOT forgotten):**
- Closing-balance caching with forward-invalidation — skipped because compute-on-read is correct and fast enough at PoC month counts. Add only if month counts grow large.
- Multi-currency: balance math assumes a single THB base; per-record `currency` is kept but not converted. FX is future work.

See [[expense-income-direction]] if that memory exists.
