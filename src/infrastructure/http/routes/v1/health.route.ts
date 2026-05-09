import { Hono } from 'hono'

import { HealthService } from '#/features/health/shared/health.service'
import { HealthController } from '#/features/health/v1/health.controller'
import { getHealthCheck } from '#/features/health/v1/health.openapi'

const healthService = new HealthService()
const healthController = new HealthController(healthService)

const healthRoute = new Hono()

healthRoute.get('/', getHealthCheck, healthController.getHealth)

export default healthRoute
