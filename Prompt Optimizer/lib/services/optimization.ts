import {
  optimizePrompt as llmOptimize,
  scorePrompt as llmScore,
} from "../llm/client";
import { FullOptimizationResult, ScoreDelta } from "../llm/types";
import { scorePromptService } from "./scoring";
import logger from "../logger";

export async function optimizeAndScoreService(
  rawPrompt: string,
  pipelineTimeoutMs: number = 60000,
): Promise<FullOptimizationResult> {
  if (!rawPrompt || rawPrompt.trim().length === 0) {
    throw new Error("Prompt cannot be empty");
  }

  try {
    const pipelineTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Optimization pipeline timeout after ${pipelineTimeoutMs}ms`,
          ),
        );
      }, pipelineTimeoutMs);
    });

    const optimizationPromise = (async () => {
      // Steps 1 & 2: Parallelize raw score and optimize (both independent)
      const [rawScore, { optimized_prompt, explanation }] = await Promise.all([
        scorePromptService(rawPrompt),
        llmOptimize(rawPrompt, 30000),
      ]);

      // Step 3: Score optimized prompt
      const optimizedScore = await llmScore(optimized_prompt, 30000);

      // Step 4: Calculate delta
      const scoreDelta: ScoreDelta = {
        total_delta: optimizedScore.total - rawScore.total,
        dimension_deltas: {
          specificity:
            optimizedScore.dimensions.specificity -
            rawScore.dimensions.specificity,
          context:
            optimizedScore.dimensions.context - rawScore.dimensions.context,
          output_spec:
            optimizedScore.dimensions.output_spec -
            rawScore.dimensions.output_spec,
          runnability:
            optimizedScore.dimensions.runnability -
            rawScore.dimensions.runnability,
          evaluation:
            optimizedScore.dimensions.evaluation -
            rawScore.dimensions.evaluation,
          safety: optimizedScore.dimensions.safety - rawScore.dimensions.safety,
        },
      };

      return {
        optimized_prompt,
        explanation,
        raw_score: rawScore,
        optimized_score: optimizedScore,
        score_delta: scoreDelta,
      };
    })();

    return await Promise.race([optimizationPromise, pipelineTimeout]);
  } catch (error: any) {
    logger.error(
      { error: error.message, stack: error.stack },
      "Optimization service error",
    );
    throw error;
  }
}
