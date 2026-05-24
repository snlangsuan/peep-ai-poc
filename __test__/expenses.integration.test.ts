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

describe('Expenses API Integration Tests', () => {
  const user1Username: string = `user_${Math.random().toString(36).substring(7)}`
  const user2Username: string = `user_${Math.random().toString(36).substring(7)}`
  const password: string = 'my_secure_password'

  let user1ApiKey: string = ''
  let user1Uuid: string = ''
  let user2ApiKey: string = ''
  let user2Uuid: string = ''

  let createdExpenseUuid: string = ''
  const createdExpenseUuids: string[] = []

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

  it('should successfully create a single expense for user 1', async (): Promise<void> => {
    const res = await app.request('/api/v1/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        expenses: [
          {
            subject: 'Internet Bill',
            amount: 799.5,
            category: 'bills',
            currency: 'THB',
            location: 'AIS Shop',
            date: '2026-05-23',
            time: '10:00',
          },
        ],
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{
      uuid: string
      created_by: string
      subject: string
      amount: number
      category: string
      currency: string
      location: string
      date: string
      time: string
    }>

    const data = body[0]!
    expect(data).toBeDefined()
    expect(data.uuid).toBeDefined()
    expect(data.created_by).toBe(user1Uuid)
    expect(data.subject).toBe('Internet Bill')
    expect(data.amount).toBe(799.5)
    expect(data.category).toBe('bills')
    expect(data.currency).toBe('THB')
    expect(data.location).toBe('AIS Shop')
    expect(data.date).toBe('2026-05-23')
    expect(data.time).toBe('10:00')

    createdExpenseUuid = data.uuid
    createdExpenseUuids.push(data.uuid)
  })

  it('should successfully create multiple expenses in one request', async (): Promise<void> => {
    const res = await app.request('/api/v1/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        expenses: [
          {
            subject: 'Office Lunch',
            amount: 450,
            category: 'food&drink',
            currency: 'THB',
            date: '2026-05-24',
          },
          {
            subject: 'Taxi Fare',
            amount: 120,
            category: 'transport',
            currency: 'THB',
            date: '2026-05-25',
          },
        ],
      }),
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as Array<{
      uuid: string
      created_by: string
      subject: string
      amount: number
      category: string
      date: string
    }>

    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(2)
    expect(data[0]?.subject).toBe('Office Lunch')
    expect(data[0]?.category).toBe('food&drink')
    expect(data[1]?.subject).toBe('Taxi Fare')
    expect(data[1]?.category).toBe('transport')

    if (data[0]) {
      createdExpenseUuids.push(data[0].uuid)
    }
    if (data[1]) {
      createdExpenseUuids.push(data[1].uuid)
    }
  })

  it('should return existing expense if duplicate is created', async (): Promise<void> => {
    const res = await app.request('/api/v1/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        expenses: [
          {
            subject: 'Internet Bill',
            amount: 799.5,
            category: 'bills',
            currency: 'THB',
            location: 'AIS Shop',
            date: '2026-05-23',
            time: '10:00',
          },
        ],
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ uuid: string }>
    const data = body[0]!
    expect(data).toBeDefined()
    expect(data.uuid).toBe(createdExpenseUuid)
  })

  it('should fail to create expense when validation fails', async (): Promise<void> => {
    const res = await app.request('/api/v1/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        expenses: [
          {
            subject: '',
            amount: -5,
            category: 'InvalidCategory',
            date: 'invalid-date',
          },
        ],
      }),
    })

    expect(res.status).toBe(400)
  })

  it('should retrieve single expense successfully', async (): Promise<void> => {
    const res = await app.request(`/api/v1/expenses/${createdExpenseUuid}`, {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { uuid: string; subject: string }
    expect(data.uuid).toBe(createdExpenseUuid)
    expect(data.subject).toBe('Internet Bill')
  })

  it('should fail to retrieve another user expense', async (): Promise<void> => {
    const res = await app.request(`/api/v1/expenses/${createdExpenseUuid}`, {
      method: 'GET',
      headers: {
        'x-api-key': user2ApiKey,
      },
    })

    expect(res.status).toBe(403)
  })

  it('should return 404 on non-existent expense retrieval', async (): Promise<void> => {
    const res = await app.request('/api/v1/expenses/00000000-0000-0000-0000-000000000000', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(404)
  })


  it('should retrieve a paginated list of expenses belonging to user', async (): Promise<void> => {
    const res = await app.request('/api/v1/expenses?page=1&limit=5&sort=date&desc=false', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: Array<{ uuid: string; subject: string }>
      metadata: { total: number; page: number; limit: number }
    }

    expect(body.items.length).toBe(3)
    expect(body.metadata.total).toBe(3)
    expect(body.metadata.page).toBe(1)
    expect(body.metadata.limit).toBe(5)
  })

  it('should retrieve expenses list with valid start_date and end_date range filtering', async (): Promise<void> => {
    const res = await app.request('/api/v1/expenses?start_date=2026-05-24&end_date=2026-05-25', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: Array<{ uuid: string; subject: string }>
      metadata: { total: number }
    }

    expect(body.items.length).toBe(2)
    expect(body.metadata.total).toBe(2)
    expect(body.items.some((e) => e.subject === 'Office Lunch')).toBe(true)
    expect(body.items.some((e) => e.subject === 'Taxi Fare')).toBe(true)
  })

  it('should retrieve empty expenses list when date range is in the future', async (): Promise<void> => {
    const res = await app.request('/api/v1/expenses?start_date=2026-06-01&end_date=2026-06-30', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: Array<{ uuid: string; subject: string }>
      metadata: { total: number }
    }

    expect(body.items.length).toBe(0)
    expect(body.metadata.total).toBe(0)
  })

  it('should retrieve empty expenses list when date range is in the past', async (): Promise<void> => {
    const res = await app.request('/api/v1/expenses?start_date=2026-04-01&end_date=2026-04-30', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: Array<{ uuid: string; subject: string }>
      metadata: { total: number }
    }

    expect(body.items.length).toBe(0)
    expect(body.metadata.total).toBe(0)
  })

  it('should return 400 when start_date is in an invalid format', async (): Promise<void> => {
    const res = await app.request('/api/v1/expenses?start_date=2026/05/24', {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(400)
  })

  it('should update expense successfully', async (): Promise<void> => {
    const res = await app.request(`/api/v1/expenses/${createdExpenseUuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user1ApiKey,
      },
      body: JSON.stringify({
        subject: 'Updated Internet Bill',
        amount: 850,
        category: 'shopping',
      }),
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { uuid: string; subject: string; amount: number; category: string }
    expect(data.uuid).toBe(createdExpenseUuid)
    expect(data.subject).toBe('Updated Internet Bill')
    expect(data.amount).toBe(850)
    expect(data.category).toBe('shopping')
  })

  it('should fail to update another user expense', async (): Promise<void> => {
    const res = await app.request(`/api/v1/expenses/${createdExpenseUuid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': user2ApiKey,
      },
      body: JSON.stringify({
        subject: 'Hacked',
      }),
    })

    expect(res.status).toBe(403)
  })

  it('should successfully delete expense', async (): Promise<void> => {
    const res = await app.request(`/api/v1/expenses/${createdExpenseUuid}`, {
      method: 'DELETE',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { success: boolean }
    expect(data.success).toBe(true)
  })

  it('should return 404 when retrieving deleted expense', async (): Promise<void> => {
    const res = await app.request(`/api/v1/expenses/${createdExpenseUuid}`, {
      method: 'GET',
      headers: {
        'x-api-key': user1ApiKey,
      },
    })

    expect(res.status).toBe(404)
  })

  it('should return 400 when requesting expense with an invalid UUID parameter', async (): Promise<void> => {
    const res = await app.request('/api/v1/expenses/invalid-uuid-format', {
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
    for (const uuid of createdExpenseUuids) {
      await db.collection('expenses').doc(uuid).delete()
    }
  })
})
