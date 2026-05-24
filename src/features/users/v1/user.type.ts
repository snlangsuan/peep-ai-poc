import type {
  userResponseSchema,
  userCreatePayloadSchema,
  userLoginResponseSchema,
  userLoginPayloadSchema,
} from '#/features/users/v1/user.schema'
import type { z } from 'zod'

export type TUserLoginPayload = z.infer<typeof userLoginPayloadSchema>
export type TUserLoginResponse = z.infer<typeof userLoginResponseSchema>
export type TUserCreatePayload = z.infer<typeof userCreatePayloadSchema>
export type TUserResponse = z.infer<typeof userResponseSchema>

export interface IUserCreateInput {
  uuid: string
  username: string
  passwordHash: string
  apiKey: string
  credit?: number
}
