import { scorePrompt as llmScore } from '../llm/client'
import { PQSScore } from '../llm/types'

export async function scorePromptService(rawPrompt: string): Promise<PQSScore> {
  if (!rawPrompt || rawPrompt.trim().length === 0) {
    throw new Error('Prompt cannot be empty')
  }

  try {
    const score = await llmScore(rawPrompt)
    return score
  } catch (error: any) {
    console.error('Scoring error:', error.message)
    throw error
  }
}
