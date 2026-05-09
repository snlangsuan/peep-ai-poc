import type { AIService } from '#/common/services/ai.service'
import type { TExtractMessageItem } from '#/features/messages/v1/message.type'

export class MessageService {
  constructor(private readonly aiService: AIService) {}

  async extractMessage(message: string, referenceDate: string): Promise<TExtractMessageItem[]> {
    const prompt = `
      You are an expert data extractor. Your task is to extract information from a user message and return it in a structured JSON format.
      
      User Message: "${message}"
      Reference Date (Current Time): "${referenceDate}"
      
      Extract all "expenses" and "schedules" mentioned in the message.
      - Expenses: Any mention of spending money, buying things, or costs.
      - Schedules: Any mention of appointments, meetings, events, or plans.
      
      Return a JSON array of objects. Each object should have:
      - "type": either "expense" or "schedule".
      - "subject": what the expense or schedule is about (e.g., "lunch", "meeting with client").
      - "amount": for expenses, the numerical value (if available).
      - "currency": for expenses, the currency code (e.g., "THB", "USD") (if available).
      - "category": for expenses, the broad category (e.g., "Food", "Travel", "Utility", "Shopping").
      - "location": the place mentioned (if available).
      - "date": the date in "YYYY-MM-DD" format. Use the Reference Date to resolve relative dates like "today", "tomorrow", "yesterday", or "next Monday".
      - "time": the time in "HH:mm" format (if available).
      - "confidence": a number between 0 and 1 representing your confidence in this extraction.
      
      If relative time is mentioned without a specific date (e.g., "at 5 PM"), assume it refers to the Reference Date unless the context suggests otherwise.
      
      Example Output:
      [
        {
          "type": "expense",
          "subject": "Lunch at 7-Eleven",
          "amount": 50,
          "currency": "THB",
          "category": "Food",
          "location": "7-Eleven",
          "date": "2024-05-07",
          "time": "12:30",
          "confidence": 0.95
        },
        {
          "type": "schedule",
          "subject": "Team Meeting",
          "location": "Office",
          "date": "2024-05-08",
          "time": "10:00",
          "confidence": 0.9
        }
      ]
    `

    const text = await this.aiService.extract(message, { prompt, json: true })
    if (!text) {
      throw new Error('Failed to extract information from message: No response from AI')
    }

    try {
      return JSON.parse(text) as TExtractMessageItem[]
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${text}`, { cause: error })
    }
  }
}
