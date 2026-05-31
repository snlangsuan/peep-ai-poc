import type { BotTask, BotTool } from '../brain.bot'
import type { TodoService } from '#/features/todos/v1/todo.service'

export const getTodoTasks = (): BotTask[] => [
  {
    id: 'todos',
    name: 'Todos',
    description:
      'Any mention of tasks to do, items to complete, list of things, checklist, or chores. Always identify the title and status.',
    guidelines: [
      'For todos, ensure the title is clear and concise.',
      'For listing todos, format the response to list all items cleanly.',
    ],
  },
]

export const getTodoTools = (todoService: TodoService): BotTool[] => [
  {
    name: 'manage_todo',
    declaration: {
      name: 'manage_todo',
      description:
        'Record, list, update or manage personal to-do tasks, chores, checklist items, or actions to complete.',
      parameters: {
        type: 'OBJECT',
        properties: {
          action: {
            type: 'STRING',
            enum: ['create', 'list', 'update', 'delete'],
            description: 'The action to perform. Default is "create" for new tasks.',
          },
          id: { type: 'STRING', description: 'The ID of the to-do item (required for update/delete).' },
          title: { type: 'STRING', description: 'What needs to be done.' },
          status: {
            type: 'STRING',
            enum: ['pending', 'completed'],
            description: 'The completion status of the task.',
          },
        },
        required: ['action'],
      },
    },
    handler: async (args, userId) => {
      switch (args.action) {
        case 'create':
          return todoService.create(userId, {
            title: args.title || 'New Todo Task',
            status: args.status || 'pending',
          })
        case 'update':
          return todoService.update(userId, args.id, {
            title: args.title,
            status: args.status,
          })
        case 'delete':
          const deleted = await todoService.delete(userId, args.id)
          return { success: deleted }
        default: {
          const result = await todoService.list(userId, {
            status: args.status,
            page: 1,
            limit: 100,
          })

          if (result.items.length === 0) {
            return 'ไม่มีรายการสิ่งที่ต้องทำครับ ✨'
          }

          return result.items
            .map((item) => `${item.status === 'completed' ? '✅' : '⬜'} [${item.id}] ${item.title}`)
            .join('\n')
        }
      }
    },
  },
]
