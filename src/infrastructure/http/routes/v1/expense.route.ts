import { Hono } from 'hono'

import { zValidator } from '#/core/middlewares/validator.middleware'
import { ExpenseController } from '#/features/expenses/v1/expense.controller'
import {
  createExpenseDoc,
  deleteExpenseDoc,
  getExpenseDoc,
  listExpenseDoc,
  updateExpenseDoc,
} from '#/features/expenses/v1/expense.openapi'
import { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import {
  createExpenseSchema,
  expenseIdParamSchema,
  expenseListFilterSchema,
  updateExpenseSchema,
} from '#/features/expenses/v1/expense.schema'
import { ExpenseService } from '#/features/expenses/v1/expense.service'
import { authMiddleware } from '#/core/middlewares/auth.middleware'

const expenseRepository = new ExpenseRepository()
const expenseService = new ExpenseService(expenseRepository)
const expenseController = new ExpenseController(expenseService)

const expenseRoute = new Hono()

expenseRoute.use('*', authMiddleware())

expenseRoute.post('/', createExpenseDoc, zValidator('json', createExpenseSchema), expenseController.create)
expenseRoute.get('/', listExpenseDoc, zValidator('query', expenseListFilterSchema), expenseController.list)
expenseRoute.get('/:id', getExpenseDoc, zValidator('param', expenseIdParamSchema), expenseController.get)
expenseRoute.patch(
  '/:id',
  updateExpenseDoc,
  zValidator('param', expenseIdParamSchema),
  zValidator('json', updateExpenseSchema),
  expenseController.update,
)
expenseRoute.delete('/:id', deleteExpenseDoc, zValidator('param', expenseIdParamSchema), expenseController.delete)

export default expenseRoute
