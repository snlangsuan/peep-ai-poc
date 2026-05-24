import { Hono } from 'hono'

import { getUtcTime } from '#/common/utils/datetime.util'
import chatRoute from '#/infrastructure/http/routes/v1/chat.route'
import expensesGroup from '#/infrastructure/http/routes/v1/expenses.route'
import schedulesGroup from '#/infrastructure/http/routes/v1/schedules.route'
import todosGroup from '#/infrastructure/http/routes/v1/todos.route'
import usersGroup from '#/infrastructure/http/routes/v1/users.route'

const v1Route = new Hono()

v1Route.get('/health', (c) =>
  c.json({
    status: 'ok',
    timestamp: getUtcTime().toISOString(),
  }),
)

v1Route.route('/users', usersGroup)
v1Route.route('/schedules', schedulesGroup)
v1Route.route('/todos', todosGroup)
v1Route.route('/expenses', expensesGroup)
v1Route.route('/chats', chatRoute)

export default v1Route
