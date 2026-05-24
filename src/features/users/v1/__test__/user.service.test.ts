import { describe, expect, it, mock } from 'bun:test'

import AuthenticationException from '#/common/exceptions/authentication.exception'
import InvalidParameterException from '#/common/exceptions/invalid.parameter.exception'
import { UserRepository } from '#/features/users/v1/user.repository'
import { UserService } from '#/features/users/v1/user.service'

describe('UserService Unit Tests', () => {
  it('should create a new user when username does not exist', async (): Promise<void> => {
    const mockRepository = {
      findByUsername: mock(async (): Promise<null> => {
        return null
      }),
      findByApiKey: mock(async (): Promise<null> => {
        return null
      }),
      create: mock(async (): Promise<void> => {
        return Promise.resolve()
      }),
    } as unknown as UserRepository

    const service = new UserService(mockRepository)
    const result = await service.create({
      username: 'new_user',
      password: 'secure_password',
      confirm_password: 'secure_password',
    })

    expect(result.username).toBe('new_user')
    expect(result.uuid).toBeDefined()
    expect(result.apiKey).toBeDefined()
    expect(mockRepository.create).toHaveBeenCalled()
  })

  it('should throw InvalidParameterException when username already exists on create', async (): Promise<void> => {
    const mockRepository = {
      findByUsername: mock(async (): Promise<Record<string, string>> => {
        return {
          uuid: 'user-uuid',
          username: 'existing_user',
        }
      }),
      findByApiKey: mock(async (): Promise<null> => {
        return null
      }),
      create: mock(async (): Promise<void> => {
        return Promise.resolve()
      }),
    } as unknown as UserRepository

    const service = new UserService(mockRepository)
    let error: unknown = null
    try {
      await service.create({
        username: 'existing_user',
        password: 'secure_password',
        confirm_password: 'secure_password',
      })
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof InvalidParameterException).toBe(true)
    expect((error as InvalidParameterException).message).toBe('Username already exists.')
  })

  it('should authenticate user and return api key when password is valid on login', async (): Promise<void> => {
    const hashedPassword = await Bun.password.hash('secure_password')
    const mockRepository = {
      findByUsername: mock(async (): Promise<Record<string, string>> => {
        return {
          uuid: 'user-uuid',
          username: 'existing_user',
          password: hashedPassword,
          apiKey: 'user-api-key',
        }
      }),
      findByApiKey: mock(async (): Promise<null> => {
        return null
      }),
      create: mock(async (): Promise<void> => {
        return Promise.resolve()
      }),
    } as unknown as UserRepository

    const service = new UserService(mockRepository)
    const result = await service.login({
      username: 'existing_user',
      password: 'secure_password',
    })

    expect(result.username).toBe('existing_user')
    expect(result.uuid).toBe('user-uuid')
    expect(result.apiKey).toBe('user-api-key')
  })

  it('should throw InvalidParameterException when username is not found on login', async (): Promise<void> => {
    const mockRepository = {
      findByUsername: mock(async (): Promise<null> => {
        return null
      }),
      findByApiKey: mock(async (): Promise<null> => {
        return null
      }),
      create: mock(async (): Promise<void> => {
        return Promise.resolve()
      }),
    } as unknown as UserRepository

    const service = new UserService(mockRepository)
    let error: unknown = null
    try {
      await service.login({
        username: 'non_existent_user',
        password: 'secure_password',
      })
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof InvalidParameterException).toBe(true)
    expect((error as InvalidParameterException).message).toBe('User not found.')
  })

  it('should throw InvalidParameterException when password is invalid on login', async (): Promise<void> => {
    const hashedPassword = await Bun.password.hash('secure_password')
    const mockRepository = {
      findByUsername: mock(async (): Promise<Record<string, string>> => {
        return {
          uuid: 'user-uuid',
          username: 'existing_user',
          password: hashedPassword,
          apiKey: 'user-api-key',
        }
      }),
      findByApiKey: mock(async (): Promise<null> => {
        return null
      }),
      create: mock(async (): Promise<void> => {
        return Promise.resolve()
      }),
    } as unknown as UserRepository

    const service = new UserService(mockRepository)
    let error: unknown = null
    try {
      await service.login({
        username: 'existing_user',
        password: 'wrong_password',
      })
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof InvalidParameterException).toBe(true)
    expect((error as InvalidParameterException).message).toBe('Invalid password.')
  })

  it('should retrieve user info when api key matches', async (): Promise<void> => {
    const mockRepository = {
      findByUsername: mock(async (): Promise<null> => {
        return null
      }),
      findByApiKey: mock(async (): Promise<Record<string, string | number>> => {
        return {
          uuid: 'user-uuid',
          username: 'existing_user',
          credit: 150,
        }
      }),
      create: mock(async (): Promise<void> => {
        return Promise.resolve()
      }),
    } as unknown as UserRepository

    const service = new UserService(mockRepository)
    const result = await service.getUserInfo('user-api-key')

    expect(result.uuid).toBe('user-uuid')
    expect(result.username).toBe('existing_user')
    expect(result.credit).toBe(150)
  })

  it('should default credit to 100 in getUserInfo when credit field is missing', async (): Promise<void> => {
    const mockRepository = {
      findByUsername: mock(async (): Promise<null> => {
        return null
      }),
      findByApiKey: mock(async (): Promise<Record<string, string>> => {
        return {
          uuid: 'user-uuid',
          username: 'existing_user',
        }
      }),
      create: mock(async (): Promise<void> => {
        return Promise.resolve()
      }),
    } as unknown as UserRepository

    const service = new UserService(mockRepository)
    const result = await service.getUserInfo('user-api-key')

    expect(result.credit).toBe(100)
  })

  it('should throw AuthenticationException when api key is not found', async (): Promise<void> => {
    const mockRepository = {
      findByUsername: mock(async (): Promise<null> => {
        return null
      }),
      findByApiKey: mock(async (): Promise<null> => {
        return null
      }),
      create: mock(async (): Promise<void> => {
        return Promise.resolve()
      }),
    } as unknown as UserRepository

    const service = new UserService(mockRepository)
    let error: unknown = null
    try {
      await service.getUserInfo('invalid-api-key')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof AuthenticationException).toBe(true)
  })

  it('should retrieve user info when user ID matches', async (): Promise<void> => {
    const mockRepository = {
      findById: mock(async (): Promise<Record<string, string | number>> => {
        return {
          uuid: 'user-uuid',
          username: 'existing_user',
          credit: 150,
        }
      }),
    } as unknown as UserRepository

    const service = new UserService(mockRepository)
    const result = await service.getUserInfoById('user-uuid')

    expect(result.uuid).toBe('user-uuid')
    expect(result.username).toBe('existing_user')
    expect(result.credit).toBe(150)
  })

  it('should default credit to 100 in getUserInfoById when credit field is missing', async (): Promise<void> => {
    const mockRepository = {
      findById: mock(async (): Promise<Record<string, string>> => {
        return {
          uuid: 'user-uuid',
          username: 'existing_user',
        }
      }),
    } as unknown as UserRepository

    const service = new UserService(mockRepository)
    const result = await service.getUserInfoById('user-uuid')

    expect(result.credit).toBe(100)
  })

  it('should throw AuthenticationException when user ID is not found', async (): Promise<void> => {
    const mockRepository = {
      findById: mock(async (): Promise<null> => {
        return null
      }),
    } as unknown as UserRepository

    const service = new UserService(mockRepository)
    let error: unknown = null
    try {
      await service.getUserInfoById('invalid-user-uuid')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof AuthenticationException).toBe(true)
  })
})
