import { envVariables } from '#/factory'

/** Only objects under this prefix may be served through the proxy. */
const IMAGE_PREFIX = 'images/'

/** Encodes a storage object path into a URL-safe key for the image-file route. */
export function encodeImageKey(objectPath: string): string {
  return Buffer.from(objectPath).toString('base64url')
}

/**
 * Decodes a proxy key back to its object path. Returns null for malformed keys or
 * any path outside the `images/` prefix (prevents fetching arbitrary objects).
 */
export function decodeImageKey(key: string): string | null {
  try {
    const objectPath = Buffer.from(key, 'base64url').toString('utf8')
    if (!objectPath.startsWith(IMAGE_PREFIX) || objectPath.includes('..')) return null
    return objectPath
  } catch {
    return null
  }
}

/** Builds the absolute API URL the frontend uses to fetch an uploaded image. */
export function buildImageProxyUrl(objectPath: string): string {
  const baseUrl = envVariables.BASE_URL.replace(/\/$/, '')
  return `${baseUrl}/poc/api/v1/images/file/${encodeImageKey(objectPath)}`
}
