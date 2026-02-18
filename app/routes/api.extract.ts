import { checkGovernmentWarningCompliance } from "~/lib/comparison.server";
import type { ModelChoice } from "~/lib/extraction.server";
import { extractLabelData } from "~/lib/extraction.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import type { ExtractActionResult } from "~/lib/types";
import { arrayBufferToBase64, validateUploadedFile } from "~/lib/utils";
import type { Route } from "./+types/api.extract";

export async function action({ request, context }: Route.ActionArgs) {
  const { allowed, retryAfterMs } = checkRateLimit(request);
  if (!allowed) {
    return Response.json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((retryAfterMs ?? 60_000) / 1000)) },
      },
    );
  }

  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const model = (formData.get("model") as ModelChoice) || "haiku";

    const validationError = validateUploadedFile(file);
    if (validationError || !file) {
      return Response.json(
        { error: validationError ?? "Please upload a label image." },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const imageBase64 = arrayBufferToBase64(arrayBuffer);
    const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp";

    const extractedLabel = await extractLabelData(
      imageBase64,
      mediaType,
      context.cloudflare.env,
      model,
    );
    const processingTimeMs = Date.now() - startTime;

    const governmentWarningCheck = extractedLabel.isAlcoholLabel
      ? checkGovernmentWarningCompliance(extractedLabel)
      : null;

    return Response.json({
      extractedLabel,
      governmentWarningCheck,
      processingTimeMs,
    } satisfies ExtractActionResult);
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "An unexpected error occurred during extraction.",
      },
      { status: 500 },
    );
  }
}
