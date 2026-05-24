import AuthenticationException from '#/common/exceptions/authentication.exception'
import { UserRepository } from '#/features/users/v1/user.repository'

import type { MiddlewareHandler } from 'hono'

export const authMiddleware = (userRepository: UserRepository = new UserRepository()): MiddlewareHandler => {
  return async (c, next) => {
    const apiKey = c.req.header('x-api-key')

    if (!apiKey) {
      throw new AuthenticationException('Missing x-api-key header.')
    }

    const user = await userRepository.findByApiKey(apiKey)
    if (!user) {
      throw new AuthenticationException('Invalid API key.')
    }

    c.set('user_id', user.uuid)

    await next()
  }
}
