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

describe('Schedules API Integration Tests', () => {
  const user1Username: string = `user_${Math.random().toString(36).substring(7)}`
  const user2Username: string = `user_${Math.random().toString(36).substring(7)}`
  const password: string = 'my_secure_password'

  let user1ApiKey: string = ''
  let user1Uuid: string = ''
  let user2ApiKey: string = ''
  let user2Uuid: string = ''

  let createdScheduleUuid: string = ''
  const createdScheduleUuids: string[] = []

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

  it('should successfully create a new schedule for user 1', async (): Promise<void> => {
    const res = await app.request('/api/v1/schedules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        title: 'Development Sync',
        description: 'Sync up on the Hono backend project',
        location: 'Zoom',
        scheduled_at: '2026-06-01T09:00:00.000Z',
      }),
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      uuid: string
      userId: string
      scheduled_at: string
      payload: {
        message: string
        type: string
        title: string
        description: string
        location: string
      }
    }

    expect(data.uuid).toBeDefined()
    expect(data.userId).toBe(user1Uuid)
    expect(data.scheduled_at).toBe('2026-06-01T09:00:00.000Z')
    expect(data.payload.message).toBe('Development Sync')
    expect(data.payload.type).toBe('user_schedule')
    expect(data.payload.title).toBe('Development Sync')
    expect(data.payload.description).toBe('Sync up on the Hono backend project')
    expect(data.payload.location).toBe('Zoom')

    createdScheduleUuid = data.uuid
    createdScheduleUuids.push(data.uuid)
  })

  it('should fail to create a schedule when title is empty', async (): Promise<void> => {
    const res = await app.request('/api/v1/schedules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        title: '',
        scheduled_at: '2026-06-01T09:00:00.000Z',
      }),
    })

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: { message: string; details?: Array<{ property: string; message: string }> } }
    expect(data.error.message).toContain('error(s)')
    expect(data.error.details?.[0]?.message).toBe('Title is required')
  })

  it('should fail to create a schedule when scheduled_at is an invalid ISO datetime', async (): Promise<void> => {
    const res = await app.request('/api/v1/schedules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        title: 'Meeting',
        scheduled_at: '2026-06-01 09:00:00',
      }),
    })

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: { message: string; details?: Array<{ property: string; message: string }> } }
    expect(data.error.message).toContain('error(s)')
    expect(data.error.details?.[0]?.message).toBe('scheduled_at must be a valid ISO datetime string')
  })


  it('should retrieve the single schedule with valid API key', async (): Promise<void> => {
    const res = await app.request(`/api/v1/schedules/${createdScheduleUuid}`, {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      uuid: string
      payload: {
        title: string
      }
    }
    expect(data.uuid).toBe(createdScheduleUuid)
    expect(data.payload.title).toBe('Development Sync')
  })

  it('should fail to retrieve another user schedule (forbidden)', async (): Promise<void> => {
    const res = await app.request(`/api/v1/schedules/${createdScheduleUuid}`, {
      method: 'GET',
      headers: {
        'x-api-key': user2ApiKey,
      },
    })

    expect(res.status).toBe(403)
    const data = (await res.json()) as { error: { message: string } }
    expect(data.error.message).toBe('You do not have permission to access this schedule.')
  })

  it('should return 404 when retrieving a non-existent schedule', async (): Promise<void> => {
    const res = await app.request('/api/v1/schedules/00000000-0000-0000-0000-000000000000', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(404)
    const data = (await res.json()) as { error: { message: string } }
    expect(data.error.message).toBe('Schedule not found.')
  })


  it('should retrieve schedules list belonging to user 1', async (): Promise<void> => {
    const res = await app.request('/api/v1/schedules', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ uuid: string }>; metadata: { total: number } }
    expect(body.items.length).toBe(1)
    expect(body.items[0]?.uuid).toBe(createdScheduleUuid)
    expect(body.metadata.total).toBe(1)
  })

  it('should retrieve schedules list with valid start_date and end_date range filtering', async (): Promise<void> => {
    const res = await app.request('/api/v1/schedules?start_date=2026-06-01%2000:00&end_date=2026-06-01%2023:59', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ uuid: string }>; metadata: { total: number } }
    expect(body.items.length).toBe(1)
    expect(body.items[0]?.uuid).toBe(createdScheduleUuid)
    expect(body.metadata.total).toBe(1)
  })

  it('should retrieve schedules list with valid start_date and end_date range filtering as datetime', async (): Promise<void> => {
    const res = await app.request('/api/v1/schedules?start_date=2026-06-01%2015:00&end_date=2026-06-01%2017:00', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ uuid: string }>; metadata: { total: number } }
    expect(body.items.length).toBe(1)
    expect(body.items[0]?.uuid).toBe(createdScheduleUuid)
    expect(body.metadata.total).toBe(1)
  })

  it('should retrieve empty schedules list when start_date and end_date range as datetime is outside the schedule time', async (): Promise<void> => {
    const res = await app.request('/api/v1/schedules?start_date=2026-06-01%2010:00&end_date=2026-06-01%2012:00', {
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

  it('should retrieve empty schedules list when date range is in the future', async (): Promise<void> => {
    const res = await app.request('/api/v1/schedules?start_date=2026-06-02%2000:00&end_date=2026-06-30%2023:59', {
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

  it('should retrieve empty schedules list when date range is in the past', async (): Promise<void> => {
    const res = await app.request('/api/v1/schedules?start_date=2026-05-01%2000:00&end_date=2026-05-31%2023:59', {
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

  it('should return 400 when start_date is in date-only format (strict YYYY-MM-DD HH:mm required)', async (): Promise<void> => {
    const res = await app.request('/api/v1/schedules?start_date=2026-06-01', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(400)
  })

  it('should successfully update schedule fields', async (): Promise<void> => {
    const res = await app.request(`/api/v1/schedules/${createdScheduleUuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        title: 'Weekly Standup',
        location: 'Slack Huddle',
      }),
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { success: boolean }
    expect(data.success).toBe(true)

    const getRes = await app.request(`/api/v1/schedules/${createdScheduleUuid}`, {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })
    expect(getRes.status).toBe(200)
    const getDoc = (await getRes.json()) as {
      uuid: string
      payload: {
        message: string
        type: string
        title: string
        description: string
        location: string
      }
    }

    expect(getDoc.uuid).toBe(createdScheduleUuid)
    expect(getDoc.payload.message).toBe('Weekly Standup')
    expect(getDoc.payload.title).toBe('Weekly Standup')
    expect(getDoc.payload.description).toBe('Sync up on the Hono backend project')
    expect(getDoc.payload.location).toBe('Slack Huddle')
  })

  it('should reset before_sent_at and sent_at to null when scheduled_at is updated to a future date', async (): Promise<void> => {
    await db.collection('schedules').doc(createdScheduleUuid).update({
      before_sent_at: new Date('2026-05-22T09:00:00Z'),
      sent_at: new Date('2026-05-22T09:30:00Z'),
    })

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const res = await app.request(`/api/v1/schedules/${createdScheduleUuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        scheduled_at: futureDate,
      }),
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { success: boolean }
    expect(data.success).toBe(true)

    const getRes = await app.request(`/api/v1/schedules/${createdScheduleUuid}`, {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })
    expect(getRes.status).toBe(200)
    const getDoc = (await getRes.json()) as {
      uuid: string
      scheduled_at: string
      before_sent_at: string | null
      sent_at: string | null
    }

    expect(getDoc.uuid).toBe(createdScheduleUuid)
    expect(getDoc.scheduled_at).toBe(futureDate)
    expect(getDoc.before_sent_at).toBeNull()
    expect(getDoc.sent_at).toBeNull()
  })

  it('should fail to update another user schedule (forbidden)', async (): Promise<void> => {
    const res = await app.request(`/api/v1/schedules/${createdScheduleUuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user2ApiKey,
      },
      body: JSON.stringify({
        title: 'Hacked Standup',
      }),
    })

    expect(res.status).toBe(403)
    const data = (await res.json()) as { error: { message: string } }
    expect(data.error.message).toBe('You do not have permission to access this schedule.')
  })

  it('should successfully delete the schedule', async (): Promise<void> => {
    const res = await app.request(`/api/v1/schedules/${createdScheduleUuid}`, {
      method: 'DELETE',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { success: boolean }
    expect(data.success).toBe(true)
  })

  it('should return 404 when trying to retrieve deleted schedule', async (): Promise<void> => {
    const res = await app.request(`/api/v1/schedules/${createdScheduleUuid}`, {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(404)
  })

  it('should return 400 when requesting schedule with an invalid UUID parameter', async (): Promise<void> => {
    const res = await app.request('/api/v1/schedules/invalid-uuid-format', {
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
    for (const uuid of createdScheduleUuids) {
      await db.collection('schedules').doc(uuid).delete()
    }
  })
})
