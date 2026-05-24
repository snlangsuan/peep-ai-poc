import type { TChatMessageItem } from '#/core/chat/chat.type'
import type { Part } from '@google/genai'

export type TOpenAIImageContentPart = {
  type: 'image_url'
  image_url: { url: string }
}

export type TOpenAITextContentPart = {
  type: 'text'
  text: string
}

export type TOpenAIContentPart = TOpenAIImageContentPart | TOpenAITextContentPart

export function parseBase64DataUrl(dataUrl: string): { mimeType: string; data: string } {
  if (dataUrl.startsWith('data:')) {
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (matches && matches.length === 3) {
      return {
        mimeType: matches[1] || 'image/jpeg',
        data: matches[2] || '',
      }
    }
  }
  return {
    mimeType: 'image/jpeg',
    data: dataUrl,
  }
}

export function mapInputItemToPart(item: TChatMessageItem): Part {
  switch (item.type) {
    case 'text':
      return { text: item.text }
    case 'image': {
      const { mimeType, data } = parseBase64DataUrl(item.image_url)
      return {
        inlineData: {
          mimeType,
          data,
        },
      }
    }
    case 'file':
      return { text: `[Attached File: ${item.file_name} (${item.file_url})]` }
    case 'link':
      return { text: `[Link Attachment: ${item.title ? `${item.title} - ` : ''}${item.link}]` }
  }
}

export function mapInputItemToText(item: TChatMessageItem): string {
  switch (item.type) {
    case 'text':
      return item.text
    case 'image':
      return '[Attached Image]'
    case 'file':
      return `[Attached File: ${item.file_name}]`
    case 'link':
      return `[Link: ${item.link}]`
  }
}

export function parseQueryInput(input: string | TChatMessageItem[]): { combinedMessage: string; parts: Part[] } {
  if (typeof input === 'string') {
    return {
      combinedMessage: input,
      parts: [{ text: input }],
    }
  }

  const parts = input.map((item) => mapInputItemToPart(item))
  const combinedMessage = input
    .map((item) => mapInputItemToText(item))
    .filter(Boolean)
    .join('\n')

  return { combinedMessage, parts }
}

export function mapInputToOpenAIContent(input: string | TChatMessageItem[]): string | TOpenAIContentPart[] {
  if (typeof input === 'string') {
    return input
  }
  return input.map((item): TOpenAIContentPart => {
    switch (item.type) {
      case 'text':
        return { type: 'text', text: item.text }
      case 'image': {
        let dataUrl = item.image_url
        if (!dataUrl.startsWith('data:')) {
          dataUrl = `data:image/jpeg;base64,${dataUrl}`
        }
        return { type: 'image_url', image_url: { url: dataUrl } }
      }
      case 'file':
        return { type: 'text', text: `[Attached File: ${item.file_name} (${item.file_url})]` }
      case 'link':
        return {
          type: 'text',
          text: `[Link Attachment: ${item.title ? `${item.title} - ` : ''}${item.link}]`,
        }
    }
  })
}

export function mapParametersToOpenAI(
  parameters: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!parameters) return undefined
  const clone = JSON.parse(JSON.stringify(parameters)) as Record<string, unknown>
  const lowercaseType = (obj: unknown) => {
    if (obj && typeof obj === 'object') {
      const typedObj = obj as Record<string, unknown>
      if (typeof typedObj.type === 'string') {
        typedObj.type = typedObj.type.toLowerCase()
      }
      if (typedObj.properties && typeof typedObj.properties === 'object') {
        const props = typedObj.properties as Record<string, unknown>
        for (const key of Object.keys(props)) {
          lowercaseType(props[key])
        }
      }
      if (typedObj.items) {
        lowercaseType(typedObj.items)
      }
    }
  }
  lowercaseType(clone)
  return clone
}
