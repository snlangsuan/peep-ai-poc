import { Hono } from 'hono'

import { authMiddleware } from '#/core/middlewares/auth.middleware'
import { zValidator } from '#/core/middlewares/validator.middleware'
import { ExpenseController } from '#/features/expenses/v1/expense.controller'
import { createDoc, deleteDoc, getDoc, listDoc, updateDoc } from '#/features/expenses/v1/expense.openapi'
import { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import {
  expenseCreatePayloadSchema,
  expenseFilterPayloadSchema,
  expenseParamPayloadSchema,
  expenseUpdatePayloadSchema,
} from '#/features/expenses/v1/expense.schema'
import { ExpenseService } from '#/features/expenses/v1/expense.service'
import { UserRepository } from '#/features/users/v1/user.repository'

import type { Bindings, Variables } from '#/common/types/app.type'

const expensesGroup = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const userRepository = new UserRepository()
const repository = new ExpenseRepository()
const service = new ExpenseService(repository)
const controller = new ExpenseController(service)

expensesGroup.use('*', authMiddleware(userRepository))

expensesGroup.post('/', createDoc, zValidator('json', expenseCreatePayloadSchema), controller.create)

expensesGroup.get('/:id', getDoc, zValidator('param', expenseParamPayloadSchema), controller.get)

expensesGroup.get('/', listDoc, zValidator('query', expenseFilterPayloadSchema), controller.list)

expensesGroup.put(
  '/:id',
  updateDoc,
  zValidator('param', expenseParamPayloadSchema),
  zValidator('json', expenseUpdatePayloadSchema),
  controller.update,
)

expensesGroup.delete('/:id', deleteDoc, zValidator('param', expenseParamPayloadSchema), controller.delete)

export default expensesGroup
