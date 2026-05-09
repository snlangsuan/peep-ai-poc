import z from 'zod'

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  data: z.object({
    uptime: z.number(),
    timestamp: z.string(),
  }),
})
