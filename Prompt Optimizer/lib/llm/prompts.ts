import { PQSScore, OptimizationResult } from './types'

export function buildScoringPrompt(rawPrompt: string): string {
  return `You are a Prompt Quality Scoring (PQS) expert. Analyze the following prompt and provide a structured JSON response.

Evaluate the prompt on these 6 dimensions (each out of the specified max):
- Specificity (0-20): How specific and concrete is the task?
- Context (0-20): How well is background/context provided?
- Output Spec (0-20): How clearly are desired outputs specified?
- Runnability (0-15): How actionable and executable is the prompt?
- Evaluation (0-15): How clear are success/evaluation criteria?
- Safety & Clarity (0-10): How well-written and safe is the prompt?

Also identify missing slots from this list: task, target_audience, context, goal, constraints, output_format, tone_style, language, length, success_metric, input_material

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "total": <number 0-100>,
  "dimensions": {
    "specificity": <number 0-20>,
    "context": <number 0-20>,
    "output_spec": <number 0-20>,
    "runnability": <number 0-15>,
    "evaluation": <number 0-15>,
    "safety": <number 0-10>
  },
  "missing_slots": [<array of missing slot names>],
  "issues": "<brief summary of key issues>",
  "diagnostics": "<detailed diagnostic message>"
}

Prompt to analyze:
"""
${rawPrompt}
"""
`
}

export function buildOptimizationPrompt(rawPrompt: string): string {
  return `You are a prompt optimization expert. Improve the following prompt to make it clearer, more specific, and more likely to produce excellent results from an AI agent.

Original prompt:
"""
${rawPrompt}
"""

Rewrite this prompt to:
1. Be more specific about the task
2. Add necessary context and constraints
3. Clearly specify the desired output format
4. Define success criteria or evaluation method
5. Include any missing critical information

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "optimized_prompt": "<the improved prompt>",
  "explanation": "<brief explanation of what was improved and why>"
}
`
}

export function extractJsonFromResponse(text: string): any {
  // Try to find JSON in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in response');
  }
  return JSON.parse(jsonMatch[0]);
}
