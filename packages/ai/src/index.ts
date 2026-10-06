import { z } from "zod";

export const modelCapabilitySchema = z.enum([
  "text",
  "reasoning",
  "tools",
  "vision",
  "files",
  "computer_use",
]);
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;

export const modelDefinitionSchema = z.object({
  provider: z.enum(["gateway", "openai", "anthropic"]),
  modelId: z.string().min(1),
  release: z.string().min(1),
  contextLimit: z.number().int().positive(),
  outputLimit: z.number().int().positive(),
  capabilities: z.array(modelCapabilitySchema),
  inputPricePerMillionUsd: z.number().nonnegative(),
  outputPricePerMillionUsd: z.number().nonnegative(),
  latencyClass: z.enum(["fast", "balanced", "deliberate"]),
  dataPolicyClass: z.enum(["standard", "no-training", "zero-retention"]),
  supportedTools: z.array(z.string()),
  fallbackModels: z.array(z.string()),
  status: z.enum(["active", "degraded", "disabled"]),
  documentationVerifiedAt: z.string().datetime(),
});
export type ModelDefinition = z.infer<typeof modelDefinitionSchema>;

export class ModelRegistry {
  readonly #models = new Map<string, ModelDefinition>();

  constructor(definitions: readonly ModelDefinition[]) {
    for (const candidate of definitions) {
      const model = modelDefinitionSchema.parse(candidate);
      const key = ModelRegistry.key(model.provider, model.modelId);
      if (this.#models.has(key)) throw new Error(`Duplicate model registration: ${key}`);
      this.#models.set(key, model);
    }
  }

  static key(provider: string, modelId: string): string {
    return `${provider}:${modelId}`;
  }

  list(): readonly ModelDefinition[] {
    return [...this.#models.values()];
  }

  get(provider: string, modelId: string): ModelDefinition | undefined {
    return this.#models.get(ModelRegistry.key(provider, modelId));
  }
}

export const routingRequestSchema = z.object({
  complexity: z.enum(["low", "medium", "high"]),
  requiredCapabilities: z.array(modelCapabilitySchema),
  maxLatencyClass: z.enum(["fast", "balanced", "deliberate"]),
  remainingBudgetUsd: z.number().positive(),
  requiredDataPolicy: z.enum(["standard", "no-training", "zero-retention"]),
  estimatedInputTokens: z.number().int().nonnegative(),
  estimatedOutputTokens: z.number().int().nonnegative(),
});
export type RoutingRequest = z.infer<typeof routingRequestSchema>;

const latencyRank = { fast: 0, balanced: 1, deliberate: 2 } as const;
const dataPolicyRank = { standard: 0, "no-training": 1, "zero-retention": 2 } as const;

export function estimateCost(
  model: ModelDefinition,
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens * model.inputPricePerMillionUsd + outputTokens * model.outputPricePerMillionUsd) /
    1_000_000
  );
}

export function routeModel(registry: ModelRegistry, requestInput: RoutingRequest): ModelDefinition {
  const request = routingRequestSchema.parse(requestInput);
  const eligible = registry
    .list()
    .filter((model) => model.status === "active")
    .filter((model) =>
      request.requiredCapabilities.every((capability) => model.capabilities.includes(capability)),
    )
    .filter((model) => latencyRank[model.latencyClass] <= latencyRank[request.maxLatencyClass])
    .filter(
      (model) =>
        dataPolicyRank[model.dataPolicyClass] >= dataPolicyRank[request.requiredDataPolicy],
    )
    .map((model) => ({
      model,
      cost: estimateCost(model, request.estimatedInputTokens, request.estimatedOutputTokens),
    }))
    .filter(({ cost }) => cost <= request.remainingBudgetUsd)
    .sort((a, b) => {
      if (request.complexity === "high") {
        const reasoning =
          Number(b.model.capabilities.includes("reasoning")) -
          Number(a.model.capabilities.includes("reasoning"));
        if (reasoning !== 0) return reasoning;
      }
      return (
        a.cost - b.cost || latencyRank[a.model.latencyClass] - latencyRank[b.model.latencyClass]
      );
    });

  const selected = eligible[0]?.model;
  if (!selected)
    throw new Error("No model satisfies capability, policy, latency, and budget limits");
  return selected;
}

export interface BudgetUsage {
  dailyUsd: number;
  monthlyUsd: number;
  taskUsd: number;
}

export interface BudgetLimits {
  dailyUsd: number;
  monthlyUsd: number;
  taskUsd: number;
}

export function assertWithinBudget(
  usage: BudgetUsage,
  limits: BudgetLimits,
  nextCostUsd: number,
): void {
  if (usage.dailyUsd + nextCostUsd > limits.dailyUsd) throw new Error("Daily AI budget exceeded");
  if (usage.monthlyUsd + nextCostUsd > limits.monthlyUsd)
    throw new Error("Monthly AI budget exceeded");
  if (usage.taskUsd + nextCostUsd > limits.taskUsd) throw new Error("Task AI budget exceeded");
}
