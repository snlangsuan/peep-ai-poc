import app from '#/app'

async function runTest(): Promise<void> {
  const username = `user_${Math.random().toString(36).substring(7)}`
  const password = 'my_secure_password'

  const loginRes = await app.request('/api/v1/users/login-or-create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      password,
    }),
  })

  console.log('Login/Create Response Status:', loginRes.status)
  const loginData = (await loginRes.json()) as { uuid: string; username: string; apiKey: string }
  console.log('Login/Create Response Data:', loginData)

  const infoRes = await app.request('/api/v1/users/info', {
    method: 'GET',
    headers: {
      'x-api-key': loginData.apiKey,
    },
  })

  console.log('Get Info Response Status:', infoRes.status)
  const infoData = (await infoRes.json()) as { uuid: string; username: string }
  console.log('Get Info Response Data:', infoData)

  const reLoginRes = await app.request('/api/v1/users/login-or-create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      password,
    }),
  })

  console.log('Re-login Response Status:', reLoginRes.status)
  const reLoginData = (await reLoginRes.json()) as { uuid: string; username: string; apiKey: string }
  console.log('Re-login Response Data:', reLoginData)

  const wrongLoginRes = await app.request('/api/v1/users/login-or-create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      password: 'wrong_password',
    }),
  })

  console.log('Wrong Password Login Response Status (Expected: 400):', wrongLoginRes.status)
  const wrongLoginData = await wrongLoginRes.json()
  console.log('Wrong Password Login Response Data:', wrongLoginData)

  const badInfoRes = await app.request('/api/v1/users/info', {
    method: 'GET',
    headers: {
      'x-api-key': 'invalid_api_key',
    },
  })

  console.log('Get Info with Bad API Key Response Status (Expected: 401):', badInfoRes.status)
  const badInfoData = await badInfoRes.json()
  console.log('Get Info with Bad API Key Response Data:', badInfoData)

  const noKeyInfoRes = await app.request('/api/v1/users/info', {
    method: 'GET',
  })

  console.log('Get Info with Missing API Key Response Status (Expected: 401):', noKeyInfoRes.status)
  const noKeyInfoData = await noKeyInfoRes.json()
  console.log('Get Info with Missing API Key Response Data:', noKeyInfoData)
}

await runTest()
