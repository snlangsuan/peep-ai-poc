import { Hono } from 'hono'

import expenseRoute from '#/infrastructure/http/routes/v1/expense.route'
import healthRoute from '#/infrastructure/http/routes/v1/health.route'
import scheduleRoute from '#/infrastructure/http/routes/v1/schedule.route'
import uidRoute from '#/infrastructure/http/routes/v1/uid.route'
import chatRoute from '#/infrastructure/http/routes/v1/chat.route'
import messageRoute from '#/infrastructure/http/routes/v1/message.route'

const v1Route = new Hono()

v1Route.route('/health', healthRoute)
v1Route.route('/messages', messageRoute)
v1Route.route('/expenses', expenseRoute)
v1Route.route('/schedules', scheduleRoute)
v1Route.route('/uids', uidRoute)
v1Route.route('/chats', chatRoute)

export default v1Route
