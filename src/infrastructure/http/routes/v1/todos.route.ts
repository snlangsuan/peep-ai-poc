import { Hono } from 'hono'

import { authMiddleware } from '#/infrastructure/http/middlewares/auth.middleware'
import { zValidator } from '#/infrastructure/http/middlewares/validator.middleware'
import { TodoController } from '#/features/todos/v1/todo.controller'
import { createDoc, deleteDoc, getDoc, listDoc, updateDoc } from '#/features/todos/v1/todo.openapi'
import { TodoRepository } from '#/features/todos/v1/todo.repository'
import {
  todoCreatePayloadSchema,
  todoUpdatePayloadSchema,
  todoFilterPayloadSchema,
  todoParamPayloadSchema,
} from '#/features/todos/v1/todo.schema'
import { TodoService } from '#/features/todos/v1/todo.service'
import { UserRepository } from '#/features/users/v1/user.repository'

import type { Bindings, Variables } from '#/common/types/app.type'

const todosGroup = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const userRepository = new UserRepository()
const repository = new TodoRepository()
const service = new TodoService(repository)
const controller = new TodoController(service)

todosGroup.use('*', authMiddleware(userRepository))

todosGroup.post('/', createDoc, zValidator('json', todoCreatePayloadSchema), controller.create)

todosGroup.get('/:id', getDoc, zValidator('param', todoParamPayloadSchema), controller.get)

todosGroup.get('/', listDoc, zValidator('query', todoFilterPayloadSchema), controller.list)

todosGroup.put('/', updateDoc, zValidator('json', todoUpdatePayloadSchema), controller.update)

todosGroup.delete('/:id', deleteDoc, zValidator('param', todoParamPayloadSchema), controller.delete)

export default todosGroup
