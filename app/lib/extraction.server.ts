import { extractLabelData as extractWithClaude } from "./anthropic.server";
import type { ExtractedLabel } from "./types";

export type ModelChoice = "sonnet" | "haiku";

export async function extractLabelData(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  env: Pick<Env, "ANTHROPIC_API_KEY" | "AI_GATEWAY_URL" | "AI_GATEWAY_TOKEN">,
  model: ModelChoice = "haiku",
): Promise<ExtractedLabel> {
  const gatewayUrl = env.AI_GATEWAY_URL;
  const gatewayToken = gatewayUrl ? env.AI_GATEWAY_TOKEN : undefined;

  const anthropicBase = gatewayUrl ? `${gatewayUrl}/anthropic` : undefined;
  const anthropicModel = model === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
  return extractWithClaude(
    imageBase64,
    mediaType,
    env.ANTHROPIC_API_KEY,
    anthropicBase,
    gatewayToken,
    anthropicModel,
  );
}
