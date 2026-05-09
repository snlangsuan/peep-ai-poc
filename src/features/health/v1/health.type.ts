import { z } from 'zod'

import type { healthResponseSchema } from '#/features/health/v1/health.schema'

export type THealthResponse = z.infer<typeof healthResponseSchema>
