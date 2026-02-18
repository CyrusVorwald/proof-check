import { ZodError } from "zod";
import { EXTRACTION_PROMPT } from "./prompt";
import type { ExtractedLabel } from "./types";
import { ExtractedLabelSchema } from "./types";

const TOOL_NAME = "extract_label_data";

const EXTRACTION_TOOL = {
  name: TOOL_NAME,
  description:
    "Extract structured data from an alcohol beverage label image. Call this tool with the extracted fields.",
  input_schema: {
    type: "object" as const,
    properties: {
      brandName: {
        type: ["string", "null"] as const,
        description: "The brand name as shown on the label, or null if not found",
      },
      classType: {
        type: ["string", "null"] as const,
        description:
          "The class and type designation as stated on the label (e.g., 'Red Wine', 'India Pale Ale', 'Kentucky Straight Bourbon Whiskey'). Extract the full designation exactly as shown. Or null if not found",
      },
      alcoholContent: {
        type: ["string", "null"] as const,
        description:
          "The alcohol content exactly as shown (e.g., '40% ALC./VOL.', '12.5% ABV', '80 Proof'), or null",
      },
      netContents: {
        type: ["string", "null"] as const,
        description:
          "The net contents exactly as shown (e.g., '750 mL', '12 FL OZ', '1.75 L'), or null",
      },
      producerName: {
        type: ["string", "null"] as const,
        description: "The producer/bottler/importer name, or null",
      },
      producerAddress: {
        type: ["string", "null"] as const,
        description: "The producer/bottler/importer address, or null",
      },
      countryOfOrigin: {
        type: ["string", "null"] as const,
        description: "The country of origin (e.g., 'Product of France', 'Made in USA'), or null",
      },
      governmentWarning: {
        type: ["string", "null"] as const,
        description:
          "The full government warning text exactly as printed on the label, or null. Include all prefixes, numbers, and special characters",
      },
      governmentWarningAllCaps: {
        type: ["boolean", "null"] as const,
        description:
          "Whether the 'GOVERNMENT WARNING:' prefix appears in ALL CAPS, or null if no warning found",
      },
      governmentWarningBold: {
        type: ["boolean", "null"] as const,
        description:
          "Whether the 'GOVERNMENT WARNING:' prefix appears in a bolder/heavier typeface than the rest, or null if no warning found or cannot determine",
      },
      beverageType: {
        type: ["string", "null"] as const,
        enum: ["beer", "wine", "distilled_spirits", null],
        description: "The beverage type based on label content, or null if cannot determine",
      },
      isAlcoholLabel: {
        type: "boolean" as const,
        description: "Whether this image is actually an alcohol beverage label",
      },
      imageQuality: {
        type: "string" as const,
        enum: ["good", "fair", "poor"],
        description: "Assessment of image readability",
      },
      confidence: {
        type: "number" as const,
        description: "0.0 to 1.0 overall confidence in the extraction accuracy",
      },
      notes: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Any issues, observations, or uncertainties about the extraction",
      },
    },
    required: [
      "brandName",
      "classType",
      "alcoholContent",
      "netContents",
      "producerName",
      "producerAddress",
      "countryOfOrigin",
      "governmentWarning",
      "governmentWarningAllCaps",
      "governmentWarningBold",
      "beverageType",
      "isAlcoholLabel",
      "imageQuality",
      "confidence",
      "notes",
    ],
  },
};

export async function extractLabelData(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  apiKey: string,
  baseUrl = "https://api.anthropic.com",
  gatewayToken?: string,
  model = "claude-haiku-4-5-20251001",
): Promise<ExtractedLabel> {
  // Use raw fetch for Cloudflare Workers compatibility
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (gatewayToken) {
    headers["cf-aig-authorization"] = `Bearer ${gatewayToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Label extraction timed out. Try again or switch to the faster Haiku model.");
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const data: unknown = await response.json();

  if (
    !data ||
    typeof data !== "object" ||
    !("content" in data) ||
    !Array.isArray((data as { content: unknown }).content)
  ) {
    throw new Error("Unexpected Anthropic API response: missing or invalid 'content' array");
  }

  const { content } = data as { content: unknown[] };
  const toolBlock = content.find(
    (block): block is { type: "tool_use"; input: unknown } =>
      typeof block === "object" &&
      block !== null &&
      "type" in block &&
      (block as { type: string }).type === "tool_use",
  );

  if (!toolBlock || !("input" in toolBlock)) {
    throw new Error("No tool_use response from Claude API");
  }

  try {
    return ExtractedLabelSchema.parse(toolBlock.input);
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid extraction response: ${issues}`);
    }
    throw new Error("Failed to validate extraction response");
  }
}
