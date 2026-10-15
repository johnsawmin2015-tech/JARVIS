import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { gateway, type LanguageModel } from "ai";
import { z } from "zod";

export const providerPreferenceSchema = z.enum(["automatic", "gateway", "openai", "anthropic"]);
export type ProviderPreference = z.infer<typeof providerPreferenceSchema>;

export interface SelectedModel {
  provider: Exclude<ProviderPreference, "automatic">;
  modelId: string;
  model: LanguageModel;
  inputPricePerMillionUsd: number;
  outputPricePerMillionUsd: number;
}

function configuredProviders(): Array<Exclude<ProviderPreference, "automatic">> {
  const configured: Array<Exclude<ProviderPreference, "automatic">> = [];
  if (process.env.AI_GATEWAY_API_KEY && process.env.GATEWAY_MODEL_ID) configured.push("gateway");
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL_ID) configured.push("openai");
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL_ID) configured.push("anthropic");
  return configured;
}

export function hasConfiguredProvider(): boolean {
  return configuredProviders().length > 0;
}

export function selectModel(
  preferenceInput: ProviderPreference,
  promptLength: number,
): SelectedModel {
  const preference = providerPreferenceSchema.parse(preferenceInput);
  const available = configuredProviders();
  if (available.length === 0) throw new Error("No AI model provider is configured");
  const verifiedAt = process.env.MODEL_DOCS_VERIFIED_AT;
  if (!verifiedAt || Number.isNaN(Date.parse(verifiedAt))) {
    throw new Error("Configured model metadata has not been documentation-verified");
  }

  let provider: Exclude<ProviderPreference, "automatic">;
  if (preference === "automatic") {
    const preferred = process.env.DEFAULT_MODEL_PROVIDER as
      Exclude<ProviderPreference, "automatic"> | undefined;
    const alternate = promptLength > 8_000 ? "anthropic" : preferred;
    provider = alternate && available.includes(alternate) ? alternate : available[0]!;
  } else {
    if (!available.includes(preference))
      throw new Error(`Provider ${preference} is not configured`);
    provider = preference;
  }

  if (provider === "gateway") {
    const modelId = process.env.GATEWAY_MODEL_ID!;
    return { provider, modelId, model: gateway(modelId), ...prices(provider) };
  }
  if (provider === "openai") {
    const modelId = process.env.OPENAI_MODEL_ID!;
    return { provider, modelId, model: openai(modelId), ...prices(provider) };
  }
  const modelId = process.env.ANTHROPIC_MODEL_ID!;
  return { provider, modelId, model: anthropic(modelId), ...prices(provider) };
}

function prices(provider: Exclude<ProviderPreference, "automatic">) {
  const prefix = provider.toUpperCase();
  const inputPricePerMillionUsd = Number(process.env[`${prefix}_INPUT_PRICE_PER_MILLION_USD`]);
  const outputPricePerMillionUsd = Number(process.env[`${prefix}_OUTPUT_PRICE_PER_MILLION_USD`]);
  if (
    !Number.isFinite(inputPricePerMillionUsd) ||
    inputPricePerMillionUsd < 0 ||
    !Number.isFinite(outputPricePerMillionUsd) ||
    outputPricePerMillionUsd < 0
  ) {
    throw new Error(`Pricing is not configured for provider ${provider}`);
  }
  return { inputPricePerMillionUsd, outputPricePerMillionUsd };
}
