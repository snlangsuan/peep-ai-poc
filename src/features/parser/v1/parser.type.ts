import type {
  parserPayloadSchema,
  parserResponseSchema,
  parserExtractedSchema,
  parserScheduleExtractSchema,
  parserExpenseExtractSchema,
  parserTodoExtractSchema,
} from '#/features/parser/v1/parser.schema'
import type { z } from 'zod'

export type TParserPayload = z.infer<typeof parserPayloadSchema>
export type TParserResponse = z.infer<typeof parserResponseSchema>
export type TParserExtracted = z.infer<typeof parserExtractedSchema>
export type TParserScheduleExtract = z.infer<typeof parserScheduleExtractSchema>
export type TParserExpenseExtract = z.infer<typeof parserExpenseExtractSchema>
export type TParserTodoExtract = z.infer<typeof parserTodoExtractSchema>

export const PARSER_LABELS = ['meeting', 'reminder', 'expense', 'todo'] as const
export type TParserLabel = (typeof PARSER_LABELS)[number]
