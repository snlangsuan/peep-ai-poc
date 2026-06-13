import AuthenticationException from '#/common/exceptions/authentication.exception'
import InsufficientPermissionException from '#/common/exceptions/insufficient.permission.exception'
import LimitReachedException from '#/common/exceptions/limit.reached.exception'
import { logger } from '#/common/libs/logger.lib'
import { AIService } from '#/common/services/ai.service'
import { StorageService } from '#/common/services/storage.service'
import { extractGeminiUsage, type ILlmUsage } from '#/common/services/usage-logger.service'
import { getUtcTime } from '#/common/utils/datetime.util'
import { getUUID } from '#/common/utils/helper.util'
import { envVariables } from '#/factory'
import { ImageInviteRepository } from '#/features/image-invites/v1/image-invite.repository'
import { buildImageProxyUrl } from '#/features/image-insights/v1/image-file.helper'
import {
  IMAGE_INSIGHT_IMAGE_COUNT,
  IMAGE_INSIGHT_TEXT_COUNT,
} from '#/features/image-insights/v1/image-insight.schema'

import type { Part } from '@google/genai'
import type {
  IImageAnalysis,
  IImageInput,
  ITextAnalysis,
  TImageInsightItem,
  TImageInsightResponse,
} from '#/features/image-insights/v1/image-insight.type'

const EMPTY_USAGE: ILlmUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

/** Hard cap on the synthesized caption length (characters). */
const MAX_CAPTION_LENGTH = 1000

const SYSTEM_INSTRUCTION = `You are a visual mood & theme analyst. You receive ${IMAGE_INSIGHT_IMAGE_COUNT} images (in order). Return ONLY JSON, no prose, no markdown fences, with this exact shape:
{
  "title": <string>,    // a short catchy headline for the WHOLE set
  "caption": <string>,  // a 1-2 sentence caption summarizing the WHOLE set
  "images": [
    { "mood_type": <string>, "topic": <string>, "keywords": [<string>, <string>, <string>] }
  ],   // EXACTLY ${IMAGE_INSIGHT_IMAGE_COUNT} items, one per input image IN THE SAME ORDER
  "overview": [
    { "text": <string>, "mood_type": <string>, "topic": <string>, "keywords": [<string>, <string>, <string>] }
  ]    // EXACTLY ${IMAGE_INSIGHT_TEXT_COUNT} items synthesizing the WHOLE set
}

RULES:
- Respond in Thai for every string value.
- title: a short, catchy headline (max ~8 words) capturing the overall vibe of all ${IMAGE_INSIGHT_IMAGE_COUNT} images. A fitting emoji is allowed.
- caption: write it like a REAL person posting these photos on Instagram — TONE: playful + minimal (ขี้เล่น + มินิมอล). Keep it SHORT and punchy: ideally ONE short line (max ~12-15 words), witty or cheeky, casual spoken Thai. Think clever one-liner, not a paragraph. NO long descriptions, NO robotic/formal phrasing like "ภาพนี้แสดงถึง...", "ชุดภาพนี้ประกอบด้วย...", "บรรยากาศโดยรวม...". 0-1 emoji only (less is more). End with 2-3 relevant hashtags (e.g. "#ทะเลเรียก #ชิลล์"). Keep the WHOLE caption (text + hashtags) under ${MAX_CAPTION_LENGTH} characters.
- mood_type: a short free-text mood/feeling, 1-2 words, and you MAY include a fitting emoji (e.g. "สงบ 😌", "สดใส ☀️", "เหงา 🥺"). The emoji is optional but encouraged when it fits the mood.
- topic: a short, punchy Thai phrase for the main subject/theme — MAX 3 words, as concise as possible. Do NOT start with the nominalizer "การ" (e.g. use "เก็บเกี่ยวความสุข" NOT "การเก็บเกี่ยวความสุข", "พักผ่อนริมทะเล" NOT "การพักผ่อนริมทะเล").
- keywords: EXACTLY 3 single descriptive words.
- "overview".text: a concise Thai sentence that represents the overall theme/feeling synthesized across ALL ${IMAGE_INSIGHT_IMAGE_COUNT} images (not any single image).
- The 3 overview items must each capture a DIFFERENT angle of the overall set.
- Return only the JSON object.`

export class ImageInsightService {
  private aiService: AIService
  private storageService: StorageService
  private inviteRepository: ImageInviteRepository

  constructor(
    aiService = new AIService(),
    storageService = new StorageService(),
    inviteRepository = new ImageInviteRepository(),
  ) {
    this.aiService = aiService
    this.storageService = storageService
    this.inviteRepository = inviteRepository
  }

  /**
   * `inviteUuid` is the invite id resolved from the token by the auth middleware.
   * Enforces the code's usage limit, counts the call, runs the analysis, and
   * records the request's token usage.
   */
  async analyze(inviteUuid: string, images: IImageInput[]): Promise<TImageInsightResponse> {
    const invite = await this.inviteRepository.findInviteByUuid(inviteUuid)
    if (!invite) {
      throw new AuthenticationException('Invalid invite token.')
    }

    // Atomically check + increment the code's usage count before doing any work.
    const consumed = await this.inviteRepository.consumeCode(invite.code_uuid)
    if (!consumed.ok) {
      if (consumed.reason === 'disabled') {
        throw new InsufficientPermissionException('Invite code is disabled.')
      }
      if (consumed.reason === 'not_found') {
        throw new InsufficientPermissionException('Invalid invite code.')
      }
      throw new LimitReachedException('Invite code usage limit reached.')
    }

    // Upload originals and run vision analysis concurrently — neither depends on the other.
    const [objectPaths, analysis] = await Promise.all([
      this.storageService.uploadImages(images, inviteUuid),
      this.runVision(images),
    ])
    // Serve through our own API (avoids CORS + keeps objects private/revocable).
    const links = objectPaths.map((path) => buildImageProxyUrl(path))

    // Record per-request token usage against the code. Never block the response on it.
    void this.inviteRepository.addUsage({
      uuid: getUUID(),
      code: invite.code,
      code_uuid: invite.code_uuid,
      invite_uuid: invite.uuid,
      model: envVariables.GOOGLE_GEMINI_EXTRACT_MODEL,
      input_tokens: analysis.usage.inputTokens,
      output_tokens: analysis.usage.outputTokens,
      total_tokens: analysis.usage.totalTokens,
      created_at: getUtcTime().toISOString(),
    })

    const imageItems: TImageInsightItem[] = links.map((link, index) => {
      const a = analysis.images[index] ?? this.emptyAnalysis()
      return {
        kind: 'image',
        link,
        text: null,
        mood_type: a.mood_type,
        topic: a.topic,
        keywords: a.keywords,
      }
    })

    const textItems: TImageInsightItem[] = analysis.overview.map((o) => ({
      kind: 'text',
      link: null,
      text: o.text,
      mood_type: o.mood_type,
      topic: o.topic,
      keywords: o.keywords,
    }))

    return {
      code: invite.code,
      title: analysis.title,
      caption: analysis.caption,
      items: [...imageItems, ...textItems],
    }
  }

  private async runVision(
    images: IImageInput[],
  ): Promise<{ title: string; caption: string; images: IImageAnalysis[]; overview: ITextAnalysis[]; usage: ILlmUsage }> {
    const parts: Part[] = [
      { text: `Analyze these ${images.length} images.` },
      ...images.map(
        (img): Part => ({
          inlineData: { mimeType: img.mimeType, data: img.buffer.toString('base64') },
        }),
      ),
    ]

    let parsed: Record<string, unknown> = {}
    let usage: ILlmUsage = EMPTY_USAGE
    try {
      const response = await this.aiService.generate([{ role: 'user', parts }], {
        model: envVariables.GOOGLE_GEMINI_EXTRACT_MODEL,
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        responseMimeType: 'application/json',
        meta: { source: 'image-insight', kind: 'analyze' },
      })
      usage = extractGeminiUsage(response)
      const text = response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || '{}'
      parsed = JSON.parse(text)
    } catch (error) {
      logger.warn({ error }, '[image-insight] vision analysis failed, falling back to empty analysis')
    }

    return {
      title: this.asString(parsed.title),
      caption: this.asString(parsed.caption).slice(0, MAX_CAPTION_LENGTH),
      images: this.normalizeList(parsed.images, IMAGE_INSIGHT_IMAGE_COUNT, false) as IImageAnalysis[],
      overview: this.normalizeList(parsed.overview, IMAGE_INSIGHT_TEXT_COUNT, true) as ITextAnalysis[],
      usage,
    }
  }

  /** Coerces the model output into exactly `size` well-formed items, padding/truncating as needed. */
  private normalizeList(raw: unknown, size: number, withText: boolean): Array<IImageAnalysis | ITextAnalysis> {
    const arr = Array.isArray(raw) ? raw : []
    return Array.from({ length: size }, (_, i) => {
      const item = (arr[i] ?? {}) as Record<string, unknown>
      const base: IImageAnalysis = {
        mood_type: this.asString(item.mood_type),
        topic: this.asString(item.topic),
        keywords: this.normalizeKeywords(item.keywords),
      }
      return withText ? { ...base, text: this.asString(item.text) } : base
    })
  }

  private normalizeKeywords(raw: unknown): string[] {
    let words: string[] = []
    if (Array.isArray(raw)) {
      words = raw.map((w) => this.asString(w)).filter(Boolean)
    } else if (typeof raw === 'string') {
      words = raw.split(/[\s,]+/).filter(Boolean)
    }
    // Always return exactly 3 entries.
    return [words[0] ?? '', words[1] ?? '', words[2] ?? '']
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
  }

  private emptyAnalysis(): IImageAnalysis {
    return { mood_type: '', topic: '', keywords: ['', '', ''] }
  }
}
