import { z } from 'zod'

export const envSchema = z.object({
  NODE_ENV: z.enum(['local', 'test', 'development', 'production']).default('local'),
  HOST: z.string().default('localhost'),
  PORT: z.coerce.number().default(8000),
  BASE_URL: z.url(),
  WHITE_LIST_ORIGINS: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .default([]),
  GOOGLE_GENAI_API_KEY: z.string(),
  GOOGLE_PROJECT_ID: z.string(),
  GOOGLE_LOCATION: z.string().default('us-central1'),
  GOOGLE_AUTH_CLIENT_EMAIL: z.string(),
  GOOGLE_AUTH_PRIVATE_KEY: z.string(),
  GOOGLE_GEMINI_CHAT_MODEL: z.string().default('gemini-3.1-flash-lite'),
  GOOGLE_GEMINI_EXTRACT_MODEL: z.string().default('gemini-2.5-flash-lite'),
  FIREBASE_DATABASE_URL: z.url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  CHAT_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  SEARXNG_BASE_URL: z.string().default('http://localhost:8080'),
})
