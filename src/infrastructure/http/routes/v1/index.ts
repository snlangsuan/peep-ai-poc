import { Hono } from 'hono'

import { getUtcTime } from '#/common/utils/datetime.util'
import accountGroup from '#/infrastructure/http/routes/v1/account.route'
import chatRoute from '#/infrastructure/http/routes/v1/chat.route'
import expensesGroup from '#/infrastructure/http/routes/v1/expenses.route'
import horoscopesGroup from '#/infrastructure/http/routes/v1/horoscopes.route'
import moodsGroup from '#/infrastructure/http/routes/v1/moods.route'
import parserGroup from '#/infrastructure/http/routes/v1/parser.route'
import schedulesGroup from '#/infrastructure/http/routes/v1/schedules.route'
import summariesGroup from '#/infrastructure/http/routes/v1/summaries.route'
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
v1Route.route('/account', accountGroup)
v1Route.route('/moods', moodsGroup)
v1Route.route('/horoscopes', horoscopesGroup)
v1Route.route('/chats', chatRoute)
v1Route.route('/summaries', summariesGroup)
v1Route.route('/parser', parserGroup)

export default v1Route
