import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { imageAdminAuthMiddleware } from '#/infrastructure/http/middlewares/image-admin-auth.middleware'
import { imageInviteAuthMiddleware } from '#/infrastructure/http/middlewares/image-invite-auth.middleware'
import { zValidator } from '#/infrastructure/http/middlewares/validator.middleware'
import { StorageService } from '#/common/services/storage.service'
import { ImageFileController } from '#/features/image-insights/v1/image-file.controller'
import { ImageInsightController } from '#/features/image-insights/v1/image-insight.controller'
import { analyzeDoc, serveFileDoc } from '#/features/image-insights/v1/image-insight.openapi'
import { ImageInsightService } from '#/features/image-insights/v1/image-insight.service'
import { ImageInviteController } from '#/features/image-invites/v1/image-invite.controller'
import { generateCodeDoc, inviteDoc, listCodesDoc } from '#/features/image-invites/v1/image-invite.openapi'
import { ImageInviteRepository } from '#/features/image-invites/v1/image-invite.repository'
import {
  imageCodeCreatePayloadSchema,
  imageCodeFilterPayloadSchema,
  imageInviteCreatePayloadSchema,
} from '#/features/image-invites/v1/image-invite.schema'
import { ImageInviteService } from '#/features/image-invites/v1/image-invite.service'

import type { Bindings, Variables } from '#/common/types/app.type'

const imagesGroup = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const inviteRepository = new ImageInviteRepository()
const inviteService = new ImageInviteService(inviteRepository)
const inviteController = new ImageInviteController(inviteService)

const storageService = new StorageService()
const insightService = new ImageInsightService(undefined, storageService, inviteRepository)
const insightController = new ImageInsightController(insightService)
const fileController = new ImageFileController(storageService)

// Admin: generate an invite code (requires the admin x-api-key from Firestore).
imagesGroup.post(
  '/codes',
  imageAdminAuthMiddleware(),
  generateCodeDoc,
  zValidator('json', imageCodeCreatePayloadSchema),
  inviteController.generateCode,
)

// Admin: list invite codes.
imagesGroup.get(
  '/codes',
  imageAdminAuthMiddleware(),
  listCodesDoc,
  zValidator('query', imageCodeFilterPayloadSchema),
  inviteController.listCodes,
)

// Public: serve an uploaded image through the API (avoids CORS, keeps objects private).
// Explicitly allow ALL origins on this route so images stay embeddable from anywhere
// even if the global CORS policy is later tightened.
imagesGroup.get('/file/:key', cors({ origin: '*' }), serveFileDoc, fileController.serve)

// Public: exchange a valid code for an access token.
imagesGroup.post('/invites', inviteDoc, zValidator('json', imageInviteCreatePayloadSchema), inviteController.invite)

// Token-gated: authenticated by the invite token (x-api-key), not the regular user auth.
imagesGroup.post('/insights', imageInviteAuthMiddleware(inviteRepository), analyzeDoc, insightController.analyze)

export default imagesGroup
