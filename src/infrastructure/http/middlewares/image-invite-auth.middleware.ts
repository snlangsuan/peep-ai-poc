import AuthenticationException from '#/common/exceptions/authentication.exception'
import { ImageInviteRepository } from '#/features/image-invites/v1/image-invite.repository'

import type { MiddlewareHandler } from 'hono'

/**
 * Authenticates image-insights requests using an invite token (issued by
 * `POST /images/invites`) supplied in the `x-api-key` header — independent of
 * the regular user API-key auth. The invite's id is exposed as `user_id` so
 * downstream code (e.g. storage pathing) keeps working unchanged.
 */
export const imageInviteAuthMiddleware = (
  repository: ImageInviteRepository = new ImageInviteRepository(),
): MiddlewareHandler => {
  return async (c, next) => {
    const token = c.req.header('x-api-key')

    if (!token) {
      throw new AuthenticationException('Missing x-api-key header.')
    }

    const invite = await repository.findByToken(token)
    if (!invite) {
      throw new AuthenticationException('Invalid invite token.')
    }

    c.set('user_id', invite.uuid)

    await next()
  }
}
