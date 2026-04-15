export interface DimensionScores {
  specificity: number
  context: number
  output_spec: number
  runnability: number
  evaluation: number
  safety: number
}

export interface PQSScore {
  total: number
  dimensions: DimensionScores
  missing_slots: string[]
  issues: string
  diagnostics: string
}

export interface OptimizationResult {
  optimized_prompt: string
  explanation: string
}

export interface ScoreDelta {
  total_delta: number
  dimension_deltas: Partial<DimensionScores>
}

export interface FullOptimizationResult extends OptimizationResult {
  raw_score: PQSScore
  optimized_score: PQSScore
  score_delta: ScoreDelta
}
