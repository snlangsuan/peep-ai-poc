import { serve } from '@hono/node-server'

import app from '#/app'
import { logger } from '#/common/libs/logger.lib'
import { NotificationService } from '#/common/services/notification.service'
import { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'
import { ScheduleService } from '#/features/schedules/v1/schedule.service'
import { ChatRepository } from '#/features/chats/v1/chat.repository'

const port = Number(process.env.PORT) || 8000
const host = process.env.HOST || 'localhost'
const isLocal = process.env.NODE_ENV === 'local'

const certFile = Bun.file('./.credentials/localhost.pem')
const keyFile = Bun.file('./.credentials/localhost-key.pem')

const options =
  isLocal && (await certFile.exists()) && (await keyFile.exists())
    ? {
        serverOptions: {
          key: await keyFile.text(),
          cert: await certFile.text(),
        },
      }
    : {}

const server = serve({
  fetch: app.fetch,
  hostname: host,
  port: port,
  ...options,
})

// Initialize Background Notification Service
const notificationService = new NotificationService(new ScheduleService(new ScheduleRepository()), new ChatRepository())
notificationService.start()

const protocol = isLocal && options.serverOptions ? 'https' : 'http'

logger.info(`🚀 Omni Intelligence Backend is running at ${protocol}://${host}:${port}`)
logger.info(`📅 Environment: ${process.env.NODE_ENV || 'local'}`)
logger.info(`🔌 Port: ${port}`)
if (isLocal && !options.serverOptions) {
  logger.warn('⚠️  HTTPS is not active for local environment (certificate files missing)')
  logger.warn('💡 Run "mkcert localhost" to generate certificates')
}

process.on('SIGINT', () => {
  logger.info('Shutting down server...')
  notificationService.stop()
  server.close()
  process.exit(0)
})
