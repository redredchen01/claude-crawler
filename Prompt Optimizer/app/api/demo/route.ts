import { NextResponse } from 'next/server'
import { PQSScore } from '@/lib/llm/types'

const DEMO_RECORD = {
  id: 'demo-1',
  raw_prompt: 'Write code',
  raw_score: {
    total: 35,
    dimensions: {
      specificity: 5,
      context: 5,
      output_spec: 10,
      runnability: 5,
      evaluation: 5,
      safety: 0,
    },
    missing_slots: ['task', 'language', 'context', 'constraints'],
    issues: 'Extremely vague - no language, context, or requirements specified',
    diagnostics: 'This prompt lacks all essential information for a code writing task.',
  } as PQSScore,
  optimized_prompt:
    'Write Python code that calculates the factorial of a number. The function should: 1) Accept an integer input n, 2) Handle edge cases (n < 0 should return None), 3) Include comprehensive unit tests, 4) Be well-documented. Return the code as a complete, runnable Python script.',
  optimized_score: {
    total: 82,
    dimensions: {
      specificity: 18,
      context: 16,
      output_spec: 19,
      runnability: 14,
      evaluation: 12,
      safety: 3,
    },
    missing_slots: [],
    issues: 'Minor: Could specify Python version and testing framework',
    diagnostics: 'Strong prompt with clear task definition, good output specification, and clear success criteria.',
  } as PQSScore,
  optimization_explanation:
    'Specified the programming language (Python), added concrete task details (factorial calculation), included requirements for edge cases and tests, clarified output format (complete Python script), and provided evaluation criteria.',
  created_at: new Date().toISOString(),
}

export async function GET() {
  return NextResponse.json(DEMO_RECORD)
}
