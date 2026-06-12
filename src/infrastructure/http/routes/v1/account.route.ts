import { Hono } from 'hono'

import { authMiddleware } from '#/infrastructure/http/middlewares/auth.middleware'
import { zValidator } from '#/infrastructure/http/middlewares/validator.middleware'
import { AccountController } from '#/features/account/v1/account.controller'
import { getBalanceDoc, setBudgetDoc, setOpeningBalanceDoc } from '#/features/account/v1/account.openapi'
import { AccountRepository } from '#/features/account/v1/account.repository'
import {
  balanceQuerySchema,
  setBudgetPayloadSchema,
  setOpeningBalancePayloadSchema,
} from '#/features/account/v1/account.schema'
import { AccountService } from '#/features/account/v1/account.service'
import { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import { UserRepository } from '#/features/users/v1/user.repository'

import type { Bindings, Variables } from '#/common/types/app.type'

const accountGroup = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const userRepository = new UserRepository()
const accountRepository = new AccountRepository()
const expenseRepository = new ExpenseRepository()
const service = new AccountService(accountRepository, expenseRepository)
const controller = new AccountController(service)

accountGroup.use('*', authMiddleware(userRepository))

accountGroup.get('/balance', getBalanceDoc, zValidator('query', balanceQuerySchema), controller.getBalance)

accountGroup.put(
  '/opening-balance',
  setOpeningBalanceDoc,
  zValidator('json', setOpeningBalancePayloadSchema),
  controller.setOpeningBalance,
)

accountGroup.put('/budget', setBudgetDoc, zValidator('json', setBudgetPayloadSchema), controller.setBudget)

export default accountGroup
