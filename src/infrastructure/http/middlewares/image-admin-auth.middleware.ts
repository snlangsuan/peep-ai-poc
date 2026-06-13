import AuthenticationException from '#/common/exceptions/authentication.exception'
import { db } from '#/common/libs/firebase.lib'

import type { MiddlewareHandler } from 'hono'

/**
 * Collection of admin API keys allowed to generate image invite codes.
 * Add a document with a `key` field holding the secret you want to use as the
 * `x-api-key` header — e.g. `image_admin_keys/{anyId}` = { key: "<your-secret>" }.
 */
export const IMAGE_ADMIN_KEYS_COLLECTION = 'image_admin_keys'

/**
 * Gates `POST /images/codes` behind a fixed admin key checked against Firestore
 * (collection `image_admin_keys`). The matched document id is exposed as
 * `user_id` so generated codes record who created them.
 */
export const imageAdminAuthMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const apiKey = c.req.header('x-api-key')

    if (!apiKey) {
      throw new AuthenticationException('Missing x-api-key header.')
    }

    const snapshot = await db.collection(IMAGE_ADMIN_KEYS_COLLECTION).where('key', '==', apiKey).limit(1).get()
    if (snapshot.empty) {
      throw new AuthenticationException('Invalid admin key.')
    }

    c.set('user_id', snapshot.docs[0]!.id)

    await next()
  }
}
