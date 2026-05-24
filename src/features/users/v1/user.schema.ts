import { z } from 'zod'

export const userLoginPayloadSchema = z.object({
  username: z.string().min(4, 'Username must be at least 4 characters'),
  password: z.string().min(7, 'Password must be at least 7 characters'),
})

export const userCreatePayloadSchema = z
  .object({
    username: z.string().min(4, 'Username must be at least 4 characters'),
    password: z.string().min(7, 'Password must be at least 7 characters'),
    confirm_password: z.string().min(7, 'Confirm password must be at least 7 characters'),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

export const userLoginResponseSchema = z.object({
  uuid: z.string(),
  username: z.string(),
  apiKey: z.string(),
})

export const userResponseSchema = z.object({
  uuid: z.string(),
  username: z.string(),
  apiKey: z.string().optional(),
  credit: z.number().optional(),
})
