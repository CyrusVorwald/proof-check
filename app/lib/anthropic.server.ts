import { ZodError } from "zod";
import { EXTRACTION_PROMPT } from "./prompt";
import type { ExtractedLabel } from "./types";
import { ExtractedLabelSchema } from "./types";

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

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock?.text) {
    throw new Error("No text response from Claude API");
  }

  // Strip markdown code fences if present
  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return ExtractedLabelSchema.parse(JSON.parse(jsonText));
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid extraction response: ${issues}`);
    }
    throw new Error("Failed to parse extraction response as JSON");
  }
}
