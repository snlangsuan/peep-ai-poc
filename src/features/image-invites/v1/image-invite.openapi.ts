import { describeRoute, resolver } from 'hono-openapi'

import { DEFAULT_RESPONSE } from '#/common/constants/openapi.contant'
import { ERouteTag } from '#/common/types/openapi.type'
import {
  imageCodeListResponseSchema,
  imageCodeResponseSchema,
  imageInviteResponseSchema,
} from '#/features/image-invites/v1/image-invite.schema'

export const generateCodeDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.IMAGE_INSIGHT],
  summary: 'Generate an invite code',
  description:
    'Admin action (requires a valid user `x-api-key`). Generates and stores a new invite code that can later be exchanged for an access token at `POST /images/invites`. The optional `limit` caps how many image-insights requests the code allows (-1 = unlimited, the default).',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Code generated',
      content: {
        'application/json': {
          schema: resolver(imageCodeResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const listCodesDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.IMAGE_INSIGHT],
  summary: 'List invite codes',
  description:
    'Admin action (requires the admin `x-api-key`). Returns a paginated list of generated codes with their `limit`, `count`, and `disabled` state.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Codes listed',
      content: {
        'application/json': {
          schema: resolver(imageCodeListResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const inviteDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.IMAGE_INSIGHT],
  summary: 'Exchange a code for an access token',
  description:
    'Accepts a valid invite `code` and returns an opaque `token`. Use the token as the `x-api-key` header when calling `POST /images/insights`. Returns 403 if the code is unknown. No authentication is required to call this endpoint.',
  responses: {
    200: {
      description: 'Token issued',
      content: {
        'application/json': {
          schema: resolver(imageInviteResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})
