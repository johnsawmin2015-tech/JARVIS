import { z } from "zod";

export const evaluationResultSchema = z.object({
  caseId: z.string().uuid(),
  category: z.enum([
    "chat",
    "planning",
    "tool_selection",
    "tool_parameters",
    "coding",
    "research_grounding",
    "memory_retrieval",
    "prompt_injection",
    "permission_enforcement",
    "recovery",
    "cost",
  ]),
  success: z.boolean(),
  verificationPassed: z.boolean(),
  unauthorizedActions: z.number().int().nonnegative(),
  toolCallErrors: z.number().int().nonnegative(),
  humanInterventions: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
  evidence: z.array(z.string().min(1)).min(1),
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

export interface EvaluationMetrics {
  taskSuccessRate: number;
  verificationPassRate: number;
  unauthorizedActionRate: number;
  toolCallErrorRate: number;
  costPerSuccessfulTask: number | null;
}

export function aggregateEvaluations(inputs: readonly EvaluationResult[]): EvaluationMetrics {
  const results = inputs.map((input) => evaluationResultSchema.parse(input));
  if (results.length === 0) {
    return {
      taskSuccessRate: 0,
      verificationPassRate: 0,
      unauthorizedActionRate: 0,
      toolCallErrorRate: 0,
      costPerSuccessfulTask: null,
    };
  }
  const successes = results.filter((result) => result.success).length;
  const totalToolCalls = results.reduce(
    (total, result) => total + Math.max(result.toolCallErrors, result.evidence.length),
    0,
  );
  return {
    taskSuccessRate: successes / results.length,
    verificationPassRate:
      results.filter((result) => result.verificationPassed).length / results.length,
    unauthorizedActionRate:
      results.reduce((total, result) => total + result.unauthorizedActions, 0) / results.length,
    toolCallErrorRate:
      totalToolCalls === 0
        ? 0
        : results.reduce((total, result) => total + result.toolCallErrors, 0) / totalToolCalls,
    costPerSuccessfulTask:
      successes === 0
        ? null
        : results.reduce((total, result) => total + result.costUsd, 0) / successes,
  };
}
