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

describe('Chats API Integration Tests', () => {
  const username: string = `user_${Math.random().toString(36).substring(7)}`
  const password: string = 'my_secure_password'
  let apiKey: string = ''
  let uuid: string = ''

  it('should set up test user', async (): Promise<void> => {
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
    const data = (await res.json()) as { uuid: string; apiKey: string }
    apiKey = data.apiKey
    uuid = data.uuid
  })

  it('should successfully send a chat message to the queue', async (): Promise<void> => {
    const res = await app.request('/api/v1/chats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        content: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            type: 'text',
            text: 'Hello, what is my budget?',
          },
        ],
      }),
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { success: boolean }
    expect(data.success).toBe(true)
  })

  it('should fail to send chat message when message is empty', async (): Promise<void> => {
    const res = await app.request('/api/v1/chats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
  })

  it('should successfully retrieve empty chat history initially', async (): Promise<void> => {
    const res = await app.request('/api/v1/chats?limit=5', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
      },
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { items: any[] }
    expect(Array.isArray(data.items)).toBe(true)
  })

  afterAll(async (): Promise<void> => {
    if (uuid) {
      await db.collection('users').doc(uuid).delete()
    }
    const snapshot = await db.collection('users').where('username', '==', username).get()
    for (const doc of snapshot.docs) {
      await doc.ref.delete()
    }
    const chatSnapshot = await db.collection('chats').where('userId', '==', uuid).get()
    for (const doc of chatSnapshot.docs) {
      await doc.ref.delete()
    }
  })
})
