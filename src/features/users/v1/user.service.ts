import AuthenticationException from '#/common/exceptions/authentication.exception'
import InvalidParameterException from '#/common/exceptions/invalid.parameter.exception'
import { getUUID } from '#/common/utils/helper.util'

import type { UserRepository } from '#/features/users/v1/user.repository'
import type {
  TUserResponse,
  TUserCreatePayload,
  TUserLoginPayload,
  TUserLoginResponse,
} from '#/features/users/v1/user.type'

export class UserService {
  private repository: UserRepository

  constructor(repository: UserRepository) {
    this.repository = repository
  }

  async create(input: TUserCreatePayload): Promise<TUserResponse> {
    const existing = await this.repository.findByUsername(input.username)
    if (existing) {
      throw new InvalidParameterException('Username already exists.')
    }

    const uuid = getUUID()
    const apiKey = getUUID()
    const passwordHash = await Bun.password.hash(input.password)

    await this.repository.create({
      uuid,
      username: input.username,
      passwordHash,
      apiKey,
    })

    return {
      uuid,
      username: input.username,
      apiKey,
    }
  }

  async login(input: TUserLoginPayload): Promise<TUserLoginResponse> {
    const userDoc = await this.repository.findByUsername(input.username)
    if (!userDoc) {
      throw new InvalidParameterException('User not found.')
    }

    const isPasswordValid = await Bun.password.verify(input.password, userDoc.password as string)
    if (!isPasswordValid) {
      throw new InvalidParameterException('Invalid password.')
    }

    return {
      uuid: userDoc.uuid as string,
      username: userDoc.username as string,
      apiKey: userDoc.apiKey as string,
    }
  }

  async getUserInfo(apiKey: string): Promise<TUserResponse> {
    const userDoc = await this.repository.findByApiKey(apiKey)

    if (!userDoc) {
      throw new AuthenticationException('Invalid API key.')
    }

    return {
      uuid: userDoc.uuid as string,
      username: userDoc.username as string,
      credit: (userDoc.credit ?? 100) as number,
    }
  }

  async getUserInfoById(userId: string): Promise<TUserResponse> {
    const userDoc = await this.repository.findById(userId)

    if (!userDoc) {
      throw new AuthenticationException('Invalid API key.')
    }

    return {
      uuid: userDoc.uuid as string,
      username: userDoc.username as string,
      credit: (userDoc.credit ?? 100) as number,
    }
  }
}
