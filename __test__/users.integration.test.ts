import { join } from 'path'

const envPath: string = join(process.cwd(), '.env.local')
const envFile = Bun.file(envPath)
if (await envFile.exists()) {
  const content: string = await envFile.text()
  for (const line of content.split('\n')) {
    const trimmed: string = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const parts: string[] = trimmed.split('=')
      const key: string | undefined = parts[0]
      if (key) {
        let val: string = parts.slice(1).join('=').trim()
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1)
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1)
        }
        process.env[key.trim()] = val
      }
    }
  }
}

const { describe, expect, it, afterAll } = await import('bun:test')
const { default: app } = await import('#/app')
const { db } = await import('#/common/libs/firebase.lib')

describe('Users API Integration Tests', () => {
  const username: string = `user_${Math.random().toString(36).substring(7)}`
  const password: string = 'my_secure_password'
  let apiKey: string = ''
  let uuid: string = ''

  it('should successfully create a new user', async (): Promise<void> => {
    const res = await app.request('/api/v1/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        confirm_password: password,
      }),
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { uuid: string; username: string; apiKey: string }
    expect(data.username).toBe(username)
    expect(data.uuid).toBeDefined()
    expect(data.apiKey).toBeDefined()
    apiKey = data.apiKey
    uuid = data.uuid
  })

  it('should retrieve authenticated user information with valid API key', async (): Promise<void> => {
    const res = await app.request('/api/v1/users/info', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
      },
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { uuid: string; username: string; credit: number }
    expect(data.username).toBe(username)
    expect(data.uuid).toBeDefined()
    expect(data.credit).toBe(100)
  })

  it('should successfully login existing user with valid password', async (): Promise<void> => {
    const res = await app.request('/api/v1/users/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
      }),
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { uuid: string; username: string; apiKey: string }
    expect(data.username).toBe(username)
    expect(data.apiKey).toBe(apiKey)
  })

  it('should return 400 Bad Request when attempting to login with incorrect password', async (): Promise<void> => {
    const res = await app.request('/api/v1/users/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password: 'wrong_password',
      }),
    })

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: { message: string } }
    expect(data.error.message).toBe('Invalid password.')
  })

  it('should return 400 Bad Request when username is 3 characters or less', async (): Promise<void> => {
    const res = await app.request('/api/v1/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'abc',
        password,
        confirm_password: password,
      }),
    })

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: { message: string; details?: Array<{ property: string; message: string }> } }
    expect(data.error.message).toContain('error(s)')
    expect(data.error.details?.[0]?.message).toBe('Username must be at least 4 characters')
  })

  it('should return 400 Bad Request when password is 6 characters or less', async (): Promise<void> => {
    const res = await app.request('/api/v1/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'valid_user',
        password: 'pw1234',
        confirm_password: 'pw1234',
      }),
    })

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: { message: string; details?: Array<{ property: string; message: string }> } }
    expect(data.error.message).toContain('error(s)')
    expect(data.error.details?.[0]?.message).toBe('Password must be at least 7 characters')
  })

  it('should return 400 Bad Request when confirm_password does not match password', async (): Promise<void> => {
    const res = await app.request('/api/v1/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'valid_user',
        password,
        confirm_password: 'different_password',
      }),
    })

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: { message: string; details?: Array<{ property: string; message: string }> } }
    expect(data.error.message).toContain('error(s)')
    expect(data.error.details?.[0]?.message).toBe('Passwords do not match')
  })


  it('should return 401 Unauthorized when attempting to get info with invalid API key', async (): Promise<void> => {
    const res = await app.request('/api/v1/users/info', {
      method: 'GET',
      headers: {
        'x-api-key': 'invalid_api_key',
      },
    })

    expect(res.status).toBe(401)
    const data = (await res.json()) as { error: { message: string } }
    expect(data.error.message).toBe('Invalid API key.')
  })

  it('should return 401 Unauthorized when attempting to get info with missing x-api-key header', async (): Promise<void> => {
    const res = await app.request('/api/v1/users/info', {
      method: 'GET',
    })

    expect(res.status).toBe(401)
    const data = (await res.json()) as { error: { message: string } }
    expect(data.error.message).toBe('Missing x-api-key header.')
  })

  afterAll(async (): Promise<void> => {
    if (uuid) {
      await db.collection('users').doc(uuid).delete()
    }
    const snapshot = await db.collection('users').where('username', '==', username).get()
    for (const doc of snapshot.docs) {
      await doc.ref.delete()
    }
  })
})
