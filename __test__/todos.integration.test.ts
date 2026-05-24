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

describe('Todos API Integration Tests', () => {
  const user1Username: string = `user_${Math.random().toString(36).substring(7)}`
  const user2Username: string = `user_${Math.random().toString(36).substring(7)}`
  const password: string = 'my_secure_password'

  let user1ApiKey: string = ''
  let user1Uuid: string = ''
  let user2ApiKey: string = ''
  let user2Uuid: string = ''

  let createdTodoUuid: string = ''
  let createdTodoCreatedAt: string = ''
  const createdTodoUuids: string[] = []

  it('should set up test users', async (): Promise<void> => {
    const res1 = await app.request('/api/v1/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: user1Username,
        password,
        confirm_password: password,
      }),
    })
    expect(res1.status).toBe(200)
    const data1 = (await res1.json()) as { uuid: string; apiKey: string }
    user1ApiKey = data1.apiKey
    user1Uuid = data1.uuid

    const res2 = await app.request('/api/v1/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: user2Username,
        password,
        confirm_password: password,
      }),
    })
    expect(res2.status).toBe(200)
    const data2 = (await res2.json()) as { uuid: string; apiKey: string }
    user2ApiKey = data2.apiKey
    user2Uuid = data2.uuid
  })

  it('should successfully create a new todo for user 1', async (): Promise<void> => {
    const res = await app.request('/api/v1/todos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        title: 'Complete coding challenges',
        description: 'Complete all pending high-priority tasks',
      }),
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      uuid: string
      user_id: string
      title: string
      description: string
      completed: boolean
      created_at: string
    }

    expect(data.uuid).toBeDefined()
    expect(data.user_id).toBe(user1Uuid)
    expect(data.title).toBe('Complete coding challenges')
    expect(data.description).toBe('Complete all pending high-priority tasks')
    expect(data.completed).toBe(false)

    createdTodoUuid = data.uuid
    createdTodoCreatedAt = data.created_at
    createdTodoUuids.push(data.uuid)
  })

  it('should fail to create a todo when title is empty', async (): Promise<void> => {
    const res = await app.request('/api/v1/todos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        title: '',
      }),
    })

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: { message: string; details?: Array<{ property: string; message: string }> } }
    expect(data.error.message).toContain('error(s)')
    expect(data.error.details?.[0]?.message).toBe('Title is required')
  })


  it('should retrieve the single todo with valid API key', async (): Promise<void> => {
    const res = await app.request(`/api/v1/todos/${createdTodoUuid}`, {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      uuid: string
      title: string
      description: string
      completed: boolean
    }
    expect(data.uuid).toBe(createdTodoUuid)
    expect(data.title).toBe('Complete coding challenges')
    expect(data.completed).toBe(false)
  })

  it('should fail to retrieve another user todo (forbidden)', async (): Promise<void> => {
    const res = await app.request(`/api/v1/todos/${createdTodoUuid}`, {
      method: 'GET',
      headers: {
        'x-api-key': user2ApiKey,
      },
    })

    expect(res.status).toBe(403)
    const data = (await res.json()) as { error: { message: string } }
    expect(data.error.message).toBe('You do not have permission to access this todo.')
  })

  it('should return 404 when retrieving a non-existent todo', async (): Promise<void> => {
    const res = await app.request('/api/v1/todos/00000000-0000-0000-0000-000000000000', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(404)
    const data = (await res.json()) as { error: { message: string } }
    expect(data.error.message).toBe('Todo not found.')
  })


  it('should retrieve todos list belonging to user 1', async (): Promise<void> => {
    const res = await app.request('/api/v1/todos', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ uuid: string }>; metadata: { total: number } }
    expect(body.items.length).toBe(1)
    expect(body.items[0]?.uuid).toBe(createdTodoUuid)
    expect(body.metadata.total).toBe(1)
  })

  it('should retrieve empty completed todos list initially', async (): Promise<void> => {
    const res = await app.request('/api/v1/todos?completed=true', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ uuid: string }>; metadata: { total: number } }
    expect(body.items.length).toBe(0)
    expect(body.metadata.total).toBe(0)
  })

  it('should retrieve uncompleted todo when filtered by completed=false', async (): Promise<void> => {
    const res = await app.request('/api/v1/todos?completed=false', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ uuid: string }>; metadata: { total: number } }
    expect(body.items.length).toBe(1)
    expect(body.items[0]?.uuid).toBe(createdTodoUuid)
    expect(body.metadata.total).toBe(1)
  })



  it('should successfully update todo fields', async (): Promise<void> => {
    const res = await app.request(`/api/v1/todos/${createdTodoUuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        title: 'Complete all assignments',
        completed: true,
      }),
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { success: boolean }
    expect(data.success).toBe(true)
  })

  it('should fail to update another user todo (forbidden)', async (): Promise<void> => {
    const res = await app.request(`/api/v1/todos/${createdTodoUuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user2ApiKey,
      },
      body: JSON.stringify({
        title: 'Hacked Todo',
      }),
    })

    expect(res.status).toBe(403)
    const data = (await res.json()) as { error: { message: string } }
    expect(data.error.message).toBe('You do not have permission to access this todo.')
  })

  it('should successfully delete the todo', async (): Promise<void> => {
    const res = await app.request(`/api/v1/todos/${createdTodoUuid}`, {
      method: 'DELETE',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { success: boolean }
    expect(data.success).toBe(true)
  })

  it('should return 404 when trying to retrieve deleted todo', async (): Promise<void> => {
    const res = await app.request(`/api/v1/todos/${createdTodoUuid}`, {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(404)
  })

  it('should return 400 when requesting todo with an invalid UUID parameter', async (): Promise<void> => {
    const res = await app.request('/api/v1/todos/invalid-uuid-format', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: { message: string; details?: Array<{ property: string; message: string }> } }
    expect(data.error.message).toContain('error(s)')
    expect(data.error.details?.[0]?.message).toBe('Invalid UUID format')
  })


  afterAll(async (): Promise<void> => {
    if (user1Uuid) {
      await db.collection('users').doc(user1Uuid).delete()
    }
    if (user2Uuid) {
      await db.collection('users').doc(user2Uuid).delete()
    }
    const snapshot1 = await db.collection('users').where('username', '==', user1Username).get()
    for (const doc of snapshot1.docs) {
      await doc.ref.delete()
    }
    const snapshot2 = await db.collection('users').where('username', '==', user2Username).get()
    for (const doc of snapshot2.docs) {
      await doc.ref.delete()
    }
    for (const uuid of createdTodoUuids) {
      await db.collection('todos').doc(uuid).delete()
    }
  })
})
