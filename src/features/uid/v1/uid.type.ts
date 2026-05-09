import { z } from 'zod'

import type { generateUidSchema, uidResponseSchema } from '#/features/uid/v1/uid.schema'

export type TGenerateUid = z.infer<typeof generateUidSchema>
export type TUidResponse = z.infer<typeof uidResponseSchema>
