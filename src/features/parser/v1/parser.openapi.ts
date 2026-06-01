import { describeRoute, resolver } from 'hono-openapi'

import { DEFAULT_RESPONSE } from '#/common/constants/openapi.contant'
import { ERouteTag } from '#/common/types/openapi.type'
import { parserResponseSchema } from '#/features/parser/v1/parser.schema'

export const classifyDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.PARSER],
  summary: 'Classify message intent and extract structured data',
  description:
    'Classify a user message into 4 intent labels (meeting, reminder, expense, todo) and return a probability distribution (summing to 1). Additionally, if the top-probability label is confident (>= 0.5), extract structured data ready to feed into the matching create endpoint: `schedule` (for meeting/reminder), `expenses` array (for expense), or `todo` (for todo). Ambiguous messages return all three extracted fields as null.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Probability distribution over the 4 intent labels',
      content: {
        'application/json': {
          schema: resolver(parserResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})
