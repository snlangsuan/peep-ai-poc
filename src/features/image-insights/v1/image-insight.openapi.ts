import { describeRoute, resolver } from 'hono-openapi'

import { DEFAULT_RESPONSE } from '#/common/constants/openapi.contant'
import { ERouteTag } from '#/common/types/openapi.type'
import {
  IMAGE_INSIGHT_IMAGE_COUNT,
  IMAGE_INSIGHT_TEXT_COUNT,
  imageInsightResponseSchema,
} from '#/features/image-insights/v1/image-insight.schema'

export const serveFileDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.IMAGE_INSIGHT],
  summary: 'Fetch an uploaded image',
  description:
    'Streams an uploaded image by its proxy `key` (returned inside `link` of an insights result). Served through the API to avoid CORS and keep storage objects private. Images expire ~3 hours after upload (404 afterwards).',
  responses: {
    200: { description: 'The image bytes', content: { 'image/*': {} } },
    404: { description: 'Image not found or expired' },
  },
})

export const analyzeDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.IMAGE_INSIGHT],
  summary: 'Analyze a set of images',
  description: `Accepts exactly ${IMAGE_INSIGHT_IMAGE_COUNT} images via multipart/form-data (field \`images\`). Each image is uploaded to storage and analyzed; the result contains ${IMAGE_INSIGHT_IMAGE_COUNT + IMAGE_INSIGHT_TEXT_COUNT} items — ${IMAGE_INSIGHT_IMAGE_COUNT} image items (each with its public \`link\`) and ${IMAGE_INSIGHT_TEXT_COUNT} synthesized text-representation items capturing the overall set. Every item carries \`mood_type\`, \`topic\`, and 3 \`keywords\`.

The response is streamed as **Server-Sent Events** (\`text/event-stream\`) to avoid proxy timeouts during the upload + vision step. Events: \`ping\` (keep-alive, ~every 10s — ignore), \`result\` (final JSON payload, schema below), and \`error\` (\`{ status, message }\` on failure). Input-validation errors (e.g. wrong image count) are returned as a normal JSON 400 before the stream starts.`,
  security: [{ ApiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          required: ['images'],
          properties: {
            images: {
              type: 'array',
              minItems: IMAGE_INSIGHT_IMAGE_COUNT,
              maxItems: IMAGE_INSIGHT_IMAGE_COUNT,
              items: { type: 'string', format: 'binary' },
            },
          },
        },
      },
    },
  },
  responses: {
    200: {
      description:
        'SSE stream. The `result` event\'s `data` is the JSON payload shown below; `ping` events are keep-alives.',
      content: {
        'text/event-stream': {
          schema: resolver(imageInsightResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})
