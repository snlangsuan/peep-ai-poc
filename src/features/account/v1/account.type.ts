import type {
  accountMonthResponseSchema,
  setOpeningBalancePayloadSchema,
  setBudgetPayloadSchema,
  balanceQuerySchema,
} from '#/features/account/v1/account.schema'
import type { z } from 'zod'

export type TAccountMonthResponse = z.infer<typeof accountMonthResponseSchema>
export type TSetOpeningBalancePayload = z.infer<typeof setOpeningBalancePayloadSchema>
export type TSetBudgetPayload = z.infer<typeof setBudgetPayloadSchema>
export type TBalanceQuery = z.infer<typeof balanceQuerySchema>

/**
 * Stored per (user, month) in the `account_months` collection. Holds only the inputs that
 * cannot be derived from transactions: a manual opening-balance override (anchor) and the
 * monthly budget. Balances themselves are computed on read, never stored, so back-dated
 * transaction edits can never leave a stale balance behind.
 */
export interface IAccountMonthEntity {
  user_id: string
  month: string
  // Set only when the user manually fixes the opening balance for this month (an anchor).
  opening_override: number | null
  // Monthly spending cap; null when unset.
  budget: number | null
  updated_at: string
}
