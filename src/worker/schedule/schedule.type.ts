export interface IScheduleModule {
  name: string
  cronPattern: string
  timezone?: string
  execute(): Promise<void>
}
