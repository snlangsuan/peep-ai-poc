import { z } from 'zod'

export const generateUidSchema = z.object({
  prefix: z.string().optional().describe('An optional prefix for the generated unique ID.'),
  display_name: z.string().optional().describe('An optional display name to associate with the generated ID.'),
})

export const uidResponseSchema = z.object({
  id: z.string().describe('The generated unique identifier.'),
  display_name: z.string().optional().describe('The associated display name.'),
  credits: z.number().describe('The remaining usage credits for the user.'),
})
